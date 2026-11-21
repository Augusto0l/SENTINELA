"""Create, attest and qualify an exclusive synthetic general-import sandbox."""
import argparse
import json
from pathlib import Path
import runpy
import secrets
import subprocess
import sys
from uuid import uuid4

HERE = Path(__file__).resolve().parent
harness = runpy.run_path(str(HERE / "run-mutations.py"))
control, PrivateRun, verifier = (harness[name] for name in ("c", "PrivateRun", "verifier"))
ROLES = ("sentinela_sbx_admin", "sentinela_sbx_operator", "sentinela_sbx_analyst")
SCRIPTS = ("setup.sql", "mutations.sql", "mutation-fixtures.sql", "003_individual_address.sql",
           "004_workspace_read.sql", "005_general_import.sql")
SUMMARY = """
SELECT jsonb_build_object(
 'lots',(SELECT count(*) FROM sentinela.lotes_importacao),
 'runs',(SELECT count(*) FROM sentinela.execucoes_importacao),
 'staging',(SELECT count(*) FROM sentinela.linhas_staging),
 'originals',(SELECT count(*) FROM sentinela.linhas_origem),
 'consistent',(SELECT bool_and(s.campos_csv->'cells'=o.estrutura_celulas->'cells')
   FROM sentinela.linhas_staging s JOIN sentinela.linhas_origem o ON o.id=s.linha_origem_id),
 'audit',(SELECT count(*) FROM sentinela.eventos_auditoria WHERE servico='importacao-geral-local'),
 'promoted',(SELECT count(*) FROM sentinela.linhas_staging WHERE estado<>'bloqueada'
   OR ocorrencia_id IS NOT NULL OR associacao_id IS NOT NULL),
 'review',(SELECT count(*) FROM sentinela_import_lab.decisions),
 'issues',(SELECT count(*) FROM sentinela.pendencias_revisao),
 'failed',(SELECT count(*) FROM sentinela_import_lab.requests WHERE status='falhou'),
 'extra_rls',(SELECT count(*) FROM pg_class WHERE relnamespace='sentinela_import_lab'::regnamespace
   AND relrowsecurity AND relforcerowsecurity));
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--isolated-only", action="store_true", required=True)
    parser.parse_args()
    admin = secrets.token_urlsafe(40)
    runner = PrivateRun(admin)
    cluster = control.prepare("Portuguese_Brazil.1252", run=runner)
    cluster.update(purpose="sentinela-write-sandbox-v1", mutation_revision=2, general_import=True)
    for filename in (*SCRIPTS, "qualify-general-import.mjs"):
        path = HERE / filename
        cluster["artifacts"][path.relative_to(control.REPO).as_posix()] = control.digest(path)
    control.save(cluster)
    output = Path(cluster["root"]) / "evidence" / "general-import-tests.json"
    report = {"result":"FAIL", "cluster":cluster["uuid"], "port":55432}
    try:
        control.create(cluster, run=runner)
        hba = Path(cluster["data"]) / "pg_hba.conf"
        hba.write_bytes(f"host sentinela_rls_sandbox {','.join(ROLES)} 127.0.0.1/32 scram-sha-256\n".encode() + hba.read_bytes())
        cluster["runtime_files"][hba.name] = control.digest(hba)
        control.save(cluster)
        control.start(cluster, admin, run=runner)
        control.install(cluster, admin, run=runner)
        baseline = control.snapshot(cluster, admin, run=runner)
        report["stage"] = "install_fixture_roles_and_general_import"
        for name in SCRIPTS:
            control.psql(cluster, admin, file=HERE / name, run=runner)
        subjects = [str(uuid4()) for _ in ROLES]
        credentials = [secrets.token_urlsafe(40) for _ in ROLES]
        statements = "BEGIN; INSERT INTO sentinela_write_lab.individuals(login,subject) VALUES " + ",".join(
            f"('{role}','{subject}')" for role, subject in zip(ROLES[:2], subjects))
        statements += ";" + "".join(f"ALTER ROLE {role} PASSWORD '{verifier(password)}';"
                                     for role, password in zip(ROLES, credentials)) + "COMMIT;"
        def configure(exe, args, **kwargs):
            proc = subprocess.run([str(control.BIN / (exe + ".exe")), *map(str,args)], input=statements,
                                  env=control.environment(admin), capture_output=True, text=True, encoding="utf8",
                                  timeout=30)
            control.require(proc.returncode == 0, "Synthetic credential setup failed")
            return proc.stdout.strip()
        control.psql(cluster, admin, file="-", run=configure)
        installed = control.snapshot(cluster, admin, run=runner)
        for key in ("tables", "columns", "constraints", "indexes", "triggers", "domains"):
            control.require(installed["catalog"][key] == baseline["catalog"][key], f"Baseline structure drift: {key}")
        count_rls = control.psql(cluster, admin, sql="""SELECT count(*) FROM pg_class
          WHERE relnamespace='sentinela'::regnamespace AND relkind='r' AND relrowsecurity AND relforcerowsecurity""", run=runner)
        control.require(count_rls == "19", "Core forced RLS count differs")
        print("PostgreSQL dedicado atestado, migration instalada, 19 tabelas do núcleo com RLS forçada", flush=True)
        report["stage"] = "browser_http_and_restart"
        config = {"manifest": str(Path(cluster["root"]) / "manifest.json"), "expectedUUID": cluster["uuid"],
                  "credentials": {role: {"user": login,"password": secret} for role, login, secret in
                                  zip(("Administrador","Operador"), ROLES, credentials)}}
        payload = json.dumps({"config": config,"analyst": credentials[2],"subjects": subjects})
        env = {k:v for k,v in control.environment().items()
               if not any(token in k.upper() for token in ("SUPABASE","DATABASE_URL","READER_URL"))}
        result = subprocess.run(["node","--experimental-strip-types",str(HERE / "qualify-general-import.mjs")],
                                input=payload, capture_output=True, text=True, encoding="utf8", env=env, timeout=600)
        report["http"] = json.loads(result.stdout.splitlines()[-1]) if result.stdout.strip() else {"result":"FAIL"}
        print(json.dumps(report["http"],ensure_ascii=True),flush=True)
        control.require(result.returncode==0 and report["http"]["result"]=="PASS","Browser and HTTP qualification failed")
        report["stage"]="database_reconciliation"
        summary = json.loads(control.psql(cluster, admin, sql=SUMMARY, run=runner))
        report["database"]=summary
        control.require(all(summary[k]==v for k,v in dict(lots=4,runs=4,staging=2506,originals=2506,
                         consistent=True,audit=19,promoted=0,review=1,failed=2,extra_rls=2).items()),
                        "General import invariants failed")
        control.require(installed == control.snapshot(cluster,admin,run=runner), "Definitions or privileges changed")
        report["result"]="PASS"
    except Exception as error:
        report["error"]=str(error) if isinstance(error,control.Refused) else type(error).__name__
        if runner.last_failure and report.get("stage") == "install_fixture_roles_and_general_import":
            report["install_failure"]=runner.last_failure
    finally:
        if cluster["phase"] in {"RUNNING","INSTALLED","FAILED"}:
            control.stop(cluster,admin,run=runner)
        report["state"]=cluster["phase"]
        output.write_text(json.dumps(report,indent=2),encoding="utf8")
        print(json.dumps({**report,"evidence":str(output)},ensure_ascii=True),flush=True)
    return 0 if report["result"]=="PASS" and cluster["phase"]=="STOPPED" else 1


if __name__ == "__main__":
    sys.exit(main())
