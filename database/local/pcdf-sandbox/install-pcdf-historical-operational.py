"""Install only the historical queue after a complete, attested clone run."""

import argparse
from datetime import datetime
from importlib import import_module
import json
from pathlib import Path
import subprocess
from time import monotonic, sleep

import operational_clone as c

REPO = Path(__file__).resolve().parents[3]
RELEASE = REPO / "database/release"
INVENTORY = REPO / "docs/desenvolvimento/pcdf-inventario-mensal-2021-2026.csv"
ATTACHMENT = "0bedc808-1137-4245-be25-c6197dae6af0"
REVISION = "1d5bb5cbd0efaca945b89300b86e1f6aa84165a78eefa5cec2ac00734072f139"
LOT = "84908630-bd04-4a03-923d-616649c8de74"
OWNER = "sentinela_pcdf_historico_owner"
ROLE_STATE = "SELECT jsonb_object_agg(rolname,rolcanlogin) FROM pg_roles WHERE rolname IN ('sentinela_local_admin','sentinela_local_operator','sentinela_local_analyst')"
FUNCTIONS = """SELECT jsonb_object_agg(proname,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'))
 FROM pg_proc p WHERE pronamespace='sentinela_pcdf_historico'::regnamespace;"""
POLICIES = """SELECT jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname)
 FROM pg_policies p WHERE schemaname LIKE 'sentinela%' AND schemaname<>'sentinela_pcdf_historico'
 AND NOT starts_with(policyname,'historico_');"""
STATE = f"""SELECT jsonb_build_object('revision',sentinela_gestao.impacto('{LOT}',NULL)->>'revisao',
 'lots',(SELECT count(*) FROM sentinela.lotes_importacao), 'origins',(SELECT count(*) FROM sentinela.linhas_origem),
 'unique',(SELECT count(*) FROM sentinela.ocorrencias), 'links',(SELECT count(*) FROM sentinela.ocorrencia_naturezas),
 'physicalIssues',(SELECT count(*) FROM sentinela.pendencias_revisao),
 'catalog',(SELECT count(*) FROM sentinela.naturezas_criminais WHERE fonte='PCDF' AND categoria_pcdf_original IS NULL),
 'forcedRls',(SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r' AND relforcerowsecurity AND relrowsecurity),
 'badForeignKeys',(SELECT count(*) FROM pg_constraint WHERE connamespace='sentinela'::regnamespace AND contype='f' AND NOT convalidated),
 'geometry',(SELECT count(*) FROM sentinela.ocorrencias WHERE geometria IS NOT NULL OR ra_id IS NOT NULL),
 'historyInstalled',to_regnamespace('sentinela_pcdf_historico') IS NOT NULL);"""


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def put(path, value):
    with path.open("x", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2, ensure_ascii=False)


def log(root, event, **info):
    entry = {"at": datetime.now().astimezone().isoformat(), "event": event, **info}
    with (root / "fila-janela.jsonl").open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(json.dumps(entry), flush=True)


def source():
    c.configure_controller()
    manifest = c.control.load(import_module("serve-import-3000").find_operational_manifest())
    assert manifest["port"] == c.SOURCE
    password = c.secret(Path(manifest["root"]), "admin.dpapi")
    runner = c.backup.bootstrap_runner(c.backup.Commands(), password)
    c.control.attest(manifest, password, run=runner, process_check=c.verify_postgres_process)
    return manifest, password, runner


def fingerprint(port, password):
    return c.query(port, password, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n" + c.FINGERPRINTS + "\nROLLBACK;").splitlines()


def guard(identity):
    assert identity["port"] in (c.SOURCE, c.RECOVERY)
    return f"""DO $target$ BEGIN IF inet_server_port() IS DISTINCT FROM {identity["port"]}
 OR inet_server_addr() IS DISTINCT FROM inet '127.0.0.1' OR current_database()<>'sentinela_pcdf_local'
 OR current_setting('sentinela.sandbox_uuid',true) IS DISTINCT FROM '{identity["uuid"]}'
 OR (SELECT system_identifier::text FROM pg_control_system()) IS DISTINCT FROM '{identity["system"]}'
 OR session_user<>'postgres' OR pg_is_in_recovery()
 THEN RAISE EXCEPTION 'Instância divergente'; END IF; END $target$;"""


def apply(root, identity, password, sql, variables=None):
    options = ["-v", "ON_ERROR_STOP=1"]
    for key, value in (variables or {}).items():
        options.extend(("-v", f"{key}={value}"))
    env = c.backup.clean_env(password)
    env.update(PGAPPNAME="sentinela-instalacao-fila-historica",
               PGOPTIONS="-c default_transaction_read_only=off -c statement_timeout=90000 -c lock_timeout=5000")
    result = subprocess.run([str(c.BIN / "psql.exe"), "-X", "-qAt", *c.address(identity["port"]), *options, "-f", "-"],
                            input=sql.encode("utf-8"), capture_output=True, env=env, timeout=180)
    if result.returncode:
        with (root / "fila-diagnostico.log").open("ab") as handle:
            handle.write(result.stderr)
        raise RuntimeError("A execução SQL falhou. O diagnóstico privado foi preservado.")


def render(root, snapshots):
    deployment = (RELEASE / "pcdf-historical-import.psql").read_text(encoding="utf-8").rstrip()
    functions = (RELEASE / "pcdf-historical-import-functions.sql").read_text(encoding="utf-8")
    marker = "\\ir pcdf-historical-import-functions.sql"
    assert deployment.count(marker) == 1 and deployment.endswith("\nCOMMIT;") and deployment.count("(55484,55487)") == 1
    inventory = (root / "inventario-fila.csv").as_posix()
    assert "'" not in inventory
    deployment = deployment.replace(marker, functions).replace("(55484,55487)", "(55484,55489)").removesuffix("\nCOMMIT;")
    deployment = deployment.replace("'docs/desenvolvimento/pcdf-inventario-mensal-2021-2026.csv'", f"'{inventory}'")
    expected = json.dumps(snapshots, separators=(",", ":"))
    accept = f"""
SELECT pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
DO $precommit$
DECLARE f text; points jsonb; observed text; relation record;
BEGIN
 FOR f IN SELECT jsonb_array_elements_text('{expected}'::jsonb) LOOP
   SELECT n.nspname,c.relname INTO STRICT relation FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname||'.'||c.relname=split_part(f,'|',1);
   EXECUTE format($fmt$SELECT %L||'|'||count(*)||'|'||
      encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex') FROM
     (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') h FROM %I.%I t) s$fmt$,
       split_part(f,'|',1),relation.nspname,relation.relname) INTO observed;
   IF f IS DISTINCT FROM observed THEN RAISE EXCEPTION 'Fingerprint original divergente'; END IF;
 END LOOP;
 SELECT sentinela_pcdf_historico.status() INTO points;
 IF jsonb_array_length(points) IS DISTINCT FROM 68 OR points->0->>'unique' IS DISTINCT FROM '6090'
 OR points->0->>'issues' IS DISTINCT FROM '8091'
 OR (SELECT count(*) FROM jsonb_array_elements(points) i WHERE i->>'state'='missing')<>67
 OR EXISTS(SELECT FROM pg_roles WHERE rolname='{OWNER}' AND (rolcanlogin OR rolsuper OR rolbypassrls))
 OR NOT EXISTS(SELECT FROM pg_class WHERE oid='sentinela_pcdf_historico.arquivos'::regclass AND relrowsecurity AND relforcerowsecurity)
 THEN RAISE EXCEPTION 'Infraestrutura ou histórico divergente'; END IF;
END $precommit$;"""
    return deployment + "\n" + accept


def uninstall(identity):
    return f"""BEGIN; {guard(identity)}
SELECT pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
DO $$BEGIN IF (SELECT count(*) FROM sentinela.lotes_importacao)<>1
 OR EXISTS(SELECT FROM sentinela.eventos_auditoria WHERE acao='pcdf.consolidacao_historica')
 THEN RAISE EXCEPTION 'Fila já utilizada'; END IF; END$$;
SELECT format('DROP POLICY %I ON %I.%I;',policyname,schemaname,tablename)
 FROM pg_policies WHERE schemaname='sentinela' AND starts_with(policyname,'historico_')
\\gexec
DROP OWNED BY {OWNER};
DROP FUNCTION sentinela_pcdf_historico.receive_staging(uuid,uuid,text,jsonb,bytea);
DROP TABLE sentinela_pcdf_historico.arquivos;
DROP SCHEMA sentinela_pcdf_historico;
DROP ROLE {OWNER};
COMMIT;"""


def profiles(identity, password, manifest=None, runner=None):
    for index, role in enumerate(c.ROLES):
        statement = """BEGIN READ ONLY;
        SELECT jsonb_build_object('summary',sentinela_ocorrencias_local.resumo(),
         'inspect',has_function_privilege('sentinela_pcdf_historico.status()','EXECUTE'),
         'approve',has_function_privilege('sentinela_pcdf_historico.receive(uuid,uuid,text,jsonb,bytea)','EXECUTE'),
         'coverage',jsonb_array_length(sentinela_pcdf_historico.coverage()),
         'direct',has_table_privilege('sentinela_pcdf_historico.arquivos','SELECT'));
        ROLLBACK;"""
        if manifest:
            output = c.profile_query(manifest, runner, c.secret(Path(manifest["root"]), role + ".dpapi"), role, statement)
        else:
            output = c.query(identity["port"], password, f"SET SESSION AUTHORIZATION {role};\n{statement}")
        result = json.loads(output)
        assert (result["inspect"], result["approve"], result["coverage"], result["direct"]) == (index != 2, index == 0, 68, False)
        summary = result["summary"]
        assert summary["consolidadas"] == 6090
        assert (summary["recebidas"], summary["pendencias"]) == ((6393, 8091) if index != 2 else (None, None))


def run_window(root, identity, password, registered, policies, expected_schema, manifest, runner, installer, signatures):
    ro = lambda statement: c.query(c.SOURCE, password, statement)
    states = json.loads(ro(ROLE_STATE))
    assert states == dict.fromkeys(c.ROLES, True)
    writers = c.ROLES[:2]
    resume = True
    log(root, "janela_iniciada")
    try:
        apply(root, identity, password, "BEGIN; " + guard(identity) + " ".join(f"ALTER ROLE {role} NOLOGIN;" for role in writers) + " COMMIT;")
        log(root, "escritores_pausados", roles=writers)
        expiry = monotonic() + 60
        while ro("""SELECT (SELECT count(*) FROM pg_prepared_xacts WHERE database=current_database())+
          (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()
            AND backend_type='client backend' AND usename<>'sentinela_local_analyst')""") != "0":
            if monotonic() > expiry:
                raise RuntimeError("A drenagem da janela não terminou.")
            sleep(1)
        assert fingerprint(c.SOURCE, password) == registered and json.loads(ro(POLICIES)) == policies
        try:
            apply(root, identity, password, installer + "\nCOMMIT;", bindings(identity))
            assert json.loads(ro(FUNCTIONS)) == signatures
            assert json.loads(ro(POLICIES)) == policies
            assert [item for item in fingerprint(c.SOURCE, password) if not item.startswith("sentinela_pcdf_historico.arquivos|")] == registered
            profiles(identity, password)
            log(root, "commit_e_aceite_confirmados", baseFingerprints=27, newInventory=68)
        except BaseException:
            resume = False
            if ro("SELECT to_regnamespace('sentinela_pcdf_historico') IS NOT NULL") == "t":
                assert [item for item in fingerprint(c.SOURCE, password) if not item.startswith("sentinela_pcdf_historico.arquivos|")] == registered
                apply(root, identity, password, uninstall(identity))
            assert fingerprint(c.SOURCE, password) == registered
            assert normalize(c.fingerprint_schema(c.SOURCE, password)) == expected_schema
            log(root, "rollback_verificado")
            resume = True
            raise
    finally:
        if resume:
            apply(root, identity, password, "BEGIN; " + guard(identity) + " ".join(f"ALTER ROLE {role} LOGIN;" for role in writers) + " COMMIT;")
            assert json.loads(ro(ROLE_STATE)) == states
            log(root, "escritores_reabilitados")
    profiles(identity, password, manifest, runner)
    log(root, "janela_encerrada", profiles=3)


def bindings(identity):
    return {"cluster_uuid": identity["uuid"], "system_id": identity["system"], "port": identity["port"]}


def normalize(lines):
    return import_module("qualify-original-natures-activation").lot_policy_schema(lines)


def main():
    if not __debug__:
        raise SystemExit("Execute com as verificações Python ativas.")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("qualified_clone")
    args = parser.parse_args()
    clone = c.existing_root(args.qualified_clone)
    proof = read(clone / "pcdf-historical-68.json")
    assert proof["completed"] == 68 and proof["januaryPreserved"] and proof["counts"] == {
        "origins": 369660, "occurrences": 349579, "links": 369656, "geo": 0, "unmapped": 0, "events": 67,
    }
    origin = read(clone / "backup.json")["origin"]
    target = read(clone / "identity-55487.json")
    testing = c.secret(clone, "admin-55487.dpapi")
    c.attest_clone(clone, c.CLONE, testing, target["uuid"], origin)
    signatures = json.loads(c.query(c.CLONE, testing, FUNCTIONS))
    qualification = json.loads(c.query(c.CLONE, testing,
                                       Path(__file__).with_name("pcdf-historical-qualification.sql").read_text(encoding="utf-8")))
    assert all(qualification[key] == value for key, value in {
        "competencias": 68, "associacoes": 369660, "ocorrencias": 349579, "vinculos": 369656, "geoPublicada": 0,
        "auditoria": 67, "auditoriaDivergente": 0, "foreignKeysPendentes": 0, "rlsForcada": 20,
    }.items())
    qualification_path = clone / "fila-qualificacao-integral.json"
    if qualification_path.exists():
        assert read(qualification_path) == qualification
    else:
        put(qualification_path, qualification)
    manifest, password, runner = source()
    state = json.loads(c.query(c.SOURCE, password, STATE))
    assert state == {"revision": REVISION, "lots": 1, "origins": 6393, "unique": 6090, "links": 6392,
                     "physicalIssues": 26714, "catalog": 41, "forcedRls": 19, "badForeignKeys": 0,
                     "geometry": 0, "historyInstalled": False}
    assert c.query(c.SOURCE, password, """SELECT count(*) FROM pg_policies
      WHERE schemaname='sentinela' AND starts_with(policyname,'historico_');""") == "0"
    root = c.private_root()
    print(root.name, flush=True)
    snapshot = c.source_snapshot(root)
    assert snapshot["origin"]["uuid"] == origin["uuid"] and snapshot["origin"]["system"] == origin["system"] and snapshot["tables"] == 27
    registered = read(root / "fingerprints.json")
    assert registered == read(clone / "fingerprints.json")
    (root / "inventario-fila.csv").write_bytes(INVENTORY.read_bytes())
    artifacts = {path.name: c.digest(path) for path in (
        root / "inventario-fila.csv", RELEASE / "pcdf-historical-import.psql", RELEASE / "pcdf-historical-import-functions.sql",
    )}
    assert artifacts["inventario-fila.csv"] == "18c7584ecf3566870d0384afa0b32bdcf7193b6c4007cc5a798a5e7dc0e6ba6a"
    installer = render(root, registered)
    (root / "fila-instalacao-renderizada.psql").write_bytes(installer.encode("utf-8"))
    artifacts["fila-instalacao-renderizada.psql"] = c.digest(root / "fila-instalacao-renderizada.psql")
    put(root / "fila-autorizacao-local.json", {"attachmentId": ATTACHMENT, "scope": "instalar exclusivamente a infraestrutura da fila",
        "registeredAt": datetime.now().astimezone().isoformat(), "backup": snapshot["sha256"], "revision": REVISION,
        "artifacts": artifacts, "target": origin, "version": "pcdf-consolidacao-historica-v1"})
    policies = json.loads(c.query(c.SOURCE, password, POLICIES))
    identity, isolated = c.restore(root, snapshot, c.RECOVERY, normalize_schema=normalize)
    before_schema = normalize(read(root / "schema.json"))
    recovery_policies = json.loads(c.query(c.RECOVERY, isolated, POLICIES))
    try:
        apply(root, identity, isolated, installer + "\nROLLBACK;", bindings(identity))
        assert fingerprint(c.RECOVERY, isolated) == registered
        assert normalize(c.fingerprint_schema(c.RECOVERY, isolated)) == before_schema
        apply(root, identity, isolated, installer + "\nCOMMIT;", bindings(identity))
        assert json.loads(c.query(c.RECOVERY, isolated, FUNCTIONS)) == signatures
        assert json.loads(c.query(c.RECOVERY, isolated, POLICIES)) == recovery_policies
        profiles(identity, isolated)
        apply(root, identity, isolated, uninstall(identity))
        assert fingerprint(c.RECOVERY, isolated) == registered
        assert normalize(c.fingerprint_schema(c.RECOVERY, isolated)) == before_schema
        log(root, "restauracao_e_duplo_rollback_atestados", fingerprints=27, port=c.RECOVERY, backup=snapshot["sha256"], artifacts=artifacts)
    finally:
        c.stop_clone(root, c.RECOVERY, isolated, identity["uuid"], snapshot["origin"])

    assert normalize(c.fingerprint_schema(c.SOURCE, password)) == before_schema
    run_window(root, snapshot["origin"], password, registered, policies, before_schema, manifest, runner, installer, signatures)
    receipt = {"accepted": True, "backup": snapshot["sha256"], "root": root.name, "revision": REVISION,
               "profiles": 3, "fingerprints": 27, "competenciasCatalogadas": 68, "competenciasCarregadas": 1,
               "artifacts": artifacts}
    put(root / "fila-operacional-instalada.json", receipt)
    handoff = clone / "fila-operacional-instalada.tmp"
    put(handoff, receipt)
    handoff.rename(clone / "fila-operacional-instalada.json")


if __name__ == "__main__":
    main()
