"""Provision or verify the dedicated loopback PCDF staging cluster with the existing controller."""
import argparse
import json
from pathlib import Path
import secrets
import subprocess
import sys

from qualify import HERE, backup, control
from pilot_preflight import report, requirement

PORT = 55481
DATABASE = "sentinela_pcdf_piloto"
ROLE = "pcdf_pilot_service"
BASE = control.REPO / ".cache" / "pcdf-pilot-dedicated"
BASELINE = control.REPO / "database/supabase/baseline/0001_modelo_inicial.sql"
DPAPI = {
    "protect": "ConvertFrom-SecureString (ConvertTo-SecureString $s -AsPlainText -Force)",
    "unprotect": "([System.Net.NetworkCredential]::new('',(ConvertTo-SecureString $s))).Password",
}


def credential(value, action):
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
         "$ErrorActionPreference='Stop';$s=[Console]::In.ReadToEnd();" + DPAPI[action]],
        input=value, capture_output=True, text=True, timeout=15, env=control.environment(),
    )
    control.require(result.returncode == 0 and result.stdout.strip(), "DPAPI operation refused")
    return result.stdout.strip()


def install(cluster, password, runner):
    control.attest(cluster, password, database="postgres", run=runner)
    control.psql(cluster, password, database="postgres",
                 sql=f"CREATE DATABASE {DATABASE} TEMPLATE template0 ENCODING 'UTF8'", run=runner)
    control.attest(cluster, password, run=runner)
    control.psql(cluster, password, sql=(
        f"REVOKE CONNECT,TEMPORARY ON DATABASE {DATABASE} FROM PUBLIC;"
        "REVOKE CREATE ON SCHEMA public FROM PUBLIC;"
        "CREATE SCHEMA extensions;"
        "CREATE EXTENSION postgis WITH SCHEMA extensions VERSION '3.6.2';"
    ), run=runner)
    control.attest(cluster, password, run=runner)
    control.psql(cluster, password, file=BASELINE, run=runner)
    control.psql(cluster, password, sql=(
        f"CREATE ROLE {ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE;"
        f"GRANT CONNECT ON DATABASE {DATABASE} TO {ROLE};"
    ), run=runner)
    cluster["phase"] = "INSTALLED"
    control.save(cluster)


def inspect(cluster, password, runner):
    control.attest(cluster, password, run=runner)
    evidence = json.loads(control.psql(cluster, password, run=runner, sql=f"""
      BEGIN READ ONLY;
      SELECT jsonb_build_object(
        'postgres', current_setting('server_version'),
        'postgis', (SELECT extversion FROM pg_extension WHERE extname='postgis'),
        'rls', (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace
            AND relkind='r' AND relrowsecurity AND relforcerowsecurity),
        'fks', (SELECT count(*) FROM pg_constraint WHERE connamespace='sentinela'::regnamespace AND contype='f'),
        'staging', (SELECT count(*) FROM sentinela.linhas_staging),
        'origins', (SELECT count(*) FROM sentinela.linhas_origem),
        'occurrences', (SELECT count(*) FROM sentinela.ocorrencias),
        'audit', (SELECT count(*) FROM sentinela.eventos_auditoria),
        'role_restricted', (SELECT NOT (rolcanlogin OR rolsuper OR rolbypassrls OR
            rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication) FROM pg_roles WHERE rolname='{ROLE}'),
        'memberships', (SELECT count(*) FROM pg_auth_members
            WHERE roleid='{ROLE}'::regrole OR member='{ROLE}'::regrole),
        'no_schema_create', NOT has_schema_privilege('{ROLE}','sentinela','CREATE')
            AND NOT has_schema_privilege('{ROLE}','public','CREATE'),
        'no_write', NOT EXISTS (SELECT FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r'
            AND has_table_privilege('{ROLE}',oid,'INSERT,UPDATE,DELETE,TRUNCATE')),
        'public_connect', EXISTS (SELECT FROM pg_database d, LATERAL aclexplode(d.datacl) a
            WHERE d.datname=current_database() AND a.grantee=0 AND a.privilege_type='CONNECT'));
      ROLLBACK;"""))
    expected = {"postgres": "17.11", "postgis": "3.6.2", "rls": 19, "fks": 34,
                "staging": 0, "origins": 0, "occurrences": 0, "audit": 0, "role_restricted": True,
                "memberships": 0, "no_schema_create": True, "no_write": True, "public_connect": False}
    control.require(evidence == expected, "Dedicated catalog or empty staging check failed")
    return evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--provision", action="store_true")
    mode.add_argument("--verify", type=Path, metavar="MANIFEST")
    args = parser.parse_args()
    control.BASE, control.PORT, control.DB = BASE, PORT, DATABASE
    cluster = None
    password = None
    runner = None
    evidence = None
    failure = None
    try:
        if args.provision:
            control.require(not BASE.exists() or not any(BASE.iterdir()), "Dedicated directory already provisioned")
            password = secrets.token_urlsafe(48)
            runner = backup.bootstrap_runner(backup.Commands(), password)
            cluster = control.prepare("Portuguese_Brazil.1252", run=runner)
            root = Path(cluster["root"])
            with (root / "admin.dpapi").open("x", encoding="ascii") as output:
                output.write(credential(password, "protect"))
            cluster["artifacts"][str(Path(__file__).resolve().relative_to(control.REPO))] = control.digest(__file__)
            control.save(cluster)
            control.create(cluster, run=runner)
            # The reused controller writes its default port during initdb. Change only
            # the fresh cluster before starting and update the configuration attestation.
            config = Path(cluster["data"]) / "postgresql.auto.conf"
            raw = config.read_text(encoding="utf8")
            control.require(raw.count("port=55432\n") == 1, "Unexpected initial port configuration")
            config.write_text(raw.replace("port=55432\n", f"port={PORT}\n"), encoding="utf8")
            cluster["runtime_files"][config.name] = control.digest(config)
            control.save(cluster)
        else:
            cluster = control.load(args.verify)
            control.require(cluster["phase"] == "STOPPED", "Expected stopped dedicated cluster")
            key_file = Path(cluster["root"]) / "admin.dpapi"
            control.no_links(key_file)
            password = credential(key_file.read_text(encoding="ascii"), "unprotect")
            runner = backup.bootstrap_runner(backup.Commands(), password)
        control.start(cluster, password, run=runner, report=lambda _: None)
        if args.provision:
            install(cluster, password, runner)
        evidence = inspect(cluster, password, runner)
    except (Exception, KeyboardInterrupt) as error:
        failure = type(error).__name__
    finally:
        if cluster and cluster["phase"] in {"RUNNING", "INSTALLED"}:
            try:
                control.stop(cluster, password, run=runner)
            except (Exception, KeyboardInterrupt):
                failure = "EncerramentoNaoConfirmado"
    checks = [requirement("ambiente", "Identidade, baseline, RLS e conta inativa",
                          "REPROVADO" if failure else "APROVADO", evidence, failure),
              requirement("ativacao", "Autorização do serviço e carga real", "PENDENTE", None,
                          "Conta NOLOGIN e aprovação institucional ausente")]
    result = report(checks)
    if cluster:
        result["destino"] = {"banco": DATABASE, "porta": PORT, "cluster": cluster["uuid"],
                             "estado": cluster["phase"], "manifesto_local": str(Path(cluster["root"]) / "manifest.json")}
        if evidence:
            path = Path(cluster["root"]) / "evidence" / "pilot-environment.json"
            path.write_text(json.dumps(result, indent=2), encoding="utf8")
    print(json.dumps(result, ensure_ascii=True))
    return 1 if failure else 0


if __name__ == "__main__":
    sys.exit(main())
