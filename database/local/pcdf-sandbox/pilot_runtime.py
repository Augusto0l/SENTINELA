"""Attested setup, privilege inspection and PostgreSQL access for the local PCDF pilot."""
import argparse
import base64
from contextlib import contextmanager
from hashlib import sha256
import json
from pathlib import Path
import re
import sys

from manifest_receiver import compact_json
import pilot_environment as dedicated
import pilot_recovery as recovery
from qualify import HERE, backup, control

LOGIN = "pcdf_pilot_executor"
FIXTURE = "pcdf_pilot_qualification"
WRITER = "pcdf_pilot_writer"
SERVICE = dedicated.ROLE
SCHEMA = "sentinela_pcdf_pilot"
ACTOR = "71000000-0000-4000-8000-000000000081"
SQL = HERE / "pilot-executor.sql"
CORE = HERE / "receiver-stage.sql"
RECEIPT_PREFIX = "pilot-executor-"
RPC = ("record_attempt", "receive", "reconcile")
COUNTS_SQL = """SELECT jsonb_object_agg(k,n) FROM (VALUES
 ('audit',(SELECT count(*) FROM sentinela.eventos_auditoria)),
 ('extractions',(SELECT count(*) FROM sentinela.extracoes_origem)),
 ('lots',(SELECT count(*) FROM sentinela.lotes_importacao)),
 ('runs',(SELECT count(*) FROM sentinela.execucoes_importacao)),
 ('origins',(SELECT count(*) FROM sentinela.linhas_origem)),
 ('staging',(SELECT count(*) FROM sentinela.linhas_staging)),
 ('issues',(SELECT count(*) FROM sentinela.pendencias_revisao)),
 ('occurrences',(SELECT count(*) FROM sentinela.ocorrencias)),
 ('associations',(SELECT count(*) FROM sentinela.ocorrencia_naturezas)),
 ('corrections',(SELECT count(*) FROM sentinela.historico_correcoes))
) counts(k,n)"""

FORBIDDEN = {
    "ddl_schema": "CREATE SCHEMA pcdf_proibido",
    "ddl_table": "CREATE TABLE public.pcdf_proibido(id integer)",
    "ddl_temp": "CREATE TEMP TABLE pcdf_proibido(id integer)",
    "ddl_rls": "ALTER TABLE sentinela.linhas_staging DISABLE ROW LEVEL SECURITY",
    "admin_role": "CREATE ROLE pcdf_proibido_admin",
    "admin_set_service": f"SET ROLE {SERVICE}",
    "admin_set_writer": f"SET ROLE {WRITER}",
    "admin_set_postgres": "SET ROLE postgres",
    "direct_read": "SELECT * FROM sentinela.usuarios",
    "direct_write": "INSERT INTO sentinela.linhas_staging DEFAULT VALUES",
    "direct_audit": "INSERT INTO sentinela.eventos_auditoria DEFAULT VALUES",
    "direct_delete": "DELETE FROM sentinela.linhas_origem",
    "direct_truncate": "TRUNCATE sentinela.linhas_staging",
    "consolidation_insert": "INSERT INTO sentinela.ocorrencias DEFAULT VALUES",
    "consolidation_update": "UPDATE sentinela.ocorrencia_naturezas SET versao=2",
    "authorization_write": f"INSERT INTO {SCHEMA}.release DEFAULT VALUES",
    "authorization_read": f"SELECT * FROM {SCHEMA}.fixture_release",
    "authorization_internal": f"SELECT {SCHEMA}.authorized_delivery(NULL,NULL)",
    "core_internal": "SELECT sentinela_pcdf_stage.stage(NULL,NULL,NULL,NULL,NULL,NULL)",
    "authorization_attempt": f"SELECT {SCHEMA}.record_attempt('{{}}',gen_random_uuid())",
    "authorization_receive": f"SELECT {SCHEMA}.receive('{{}}',gen_random_uuid())",
    "authorization_reconcile": f"SELECT {SCHEMA}.reconcile('{{}}',gen_random_uuid())",
}


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def document_sql(payload):
    encoded = base64.b64encode(compact_json(payload).encode()).decode("ascii")
    return f"convert_from(decode('{encoded}','base64'),'UTF8')::jsonb"


def reconciliation(rows):
    return {"rows": rows, "distinctIds": rows, "fields": 34, "originals": 18,
            "fieldDifferences": 0, "originalDifferences": 0, "provenanceDifferences": 0,
            "unblocked": 0, "attemptAudited": True, "receiptAudited": True}


def receive_sql(document, request, rows):
    expected = literal(compact_json(reconciliation(rows)))
    return rf"""SELECT {SCHEMA}.receive({document},'{request}') AS receipt \gset
      SELECT {SCHEMA}.reconcile({document},'{request}') AS reconciliation \gset
      SELECT :'reconciliation'::jsonb = {expected}::jsonb AS accepted \gset
      \if :accepted
        SELECT jsonb_build_object('receipt', :'receipt'::jsonb, 'reconciliation', :'reconciliation'::jsonb);
      \else
        DO $$ BEGIN RAISE EXCEPTION 'PCDF reconciliation differs'; END $$;
      \endif
    """


def expect_denial(sql, state="42501"):
    if sql.startswith("SELECT "):
        sql = "PERFORM " + sql.removeprefix("SELECT ")
    return f"""DO $refused$ BEGIN
      {sql};
      RAISE EXCEPTION 'Expected refusal did not occur';
      EXCEPTION WHEN SQLSTATE '{state}' THEN NULL;
    END $refused$;"""


def verify_denials(run):
    run("BEGIN;" + "\n".join(map(expect_denial, FORBIDDEN.values())) + "ROLLBACK;")
    return sorted(FORBIDDEN)


def fixture_role(secret):
    return f"""CREATE ROLE {FIXTURE} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION
      PASSWORD {literal(recovery.scram(secret))} VALID UNTIL {literal(fixture_expiration())};
      GRANT {SERVICE} TO {FIXTURE} WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;"""


def fixture_expiration():
    from datetime import datetime, timedelta, timezone

    return (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()


def rules(cluster):
    return "".join(f"host {cluster['database']} {role} 127.0.0.1/32 scram-sha-256\n"
                   for role in (LOGIN, FIXTURE))


def setup_hba(cluster):
    control.require(cluster["phase"] in {"CREATED", "STOPPED"}, "HBA changes require a stopped instance")
    path = Path(cluster["data"]) / "pg_hba.conf"
    control.require(control.digest(path) == cluster["runtime_files"][path.name], "Unexpected HBA change")
    original = path.read_bytes()
    block = rules(cluster).encode("ascii")
    if original.startswith(block):
        return
    temp = path.with_suffix(".new")
    with temp.open("xb") as stream:
        stream.write(block + original)
    temp.replace(path)
    cluster["runtime_files"][path.name] = control.digest(path)
    control.save(cluster)


class Pilot:
    def __init__(self, manifest):
        control.BASE, control.PORT, control.DB = dedicated.BASE, dedicated.PORT, dedicated.DATABASE
        self.cluster = control.load(manifest)
        self.commands = backup.Commands()
        control.require(self.cluster["phase"] == "STOPPED", "Only the stopped dedicated cluster may be opened")
        key = Path(self.cluster["root"]) / "admin.dpapi"
        control.no_links(key)
        self.admin = dedicated.credential(key.read_text(encoding="ascii"), "unprotect")
        self.runner = backup.bootstrap_runner(self.commands, self.admin)

    @contextmanager
    def running(self):
        control.start(self.cluster, self.admin, run=self.runner, report=lambda _: None)
        try:
            control.attest(self.cluster, self.admin, run=self.runner)
            yield self
        finally:
            control.stop(self.cluster, self.admin, run=self.runner)

    def admin_sql(self, statement, *, database=None):
        def stdin(exe, args, password=None):
            return self.commands.call(exe, args, password=password, input=statement)

        return control.psql(self.cluster, self.admin, database=database, file="-", run=stdin)

    def query(self, statement):
        output = self.admin_sql(statement)
        if output in {"t", "f"}:
            return output == "t"
        return json.loads(output)

    def restricted(self, secret, statement, *, role=LOGIN, database=None, commands=None):
        return recovery.login_sql(commands or self.commands, self.cluster, secret, statement, database, role)

    def counts(self):
        return self.query(COUNTS_SQL)

    def inspect(self, *, fixture=False):
        control.require(bool(self.cluster.get("pilot_executor_schema_sha256")), "Executor has not been provisioned")
        evidence = catalog(self, fixture=fixture)
        actual = schema_hash(self.commands, self.cluster, self.admin)
        control.require(evidence["structure"] and evidence["roles"] and evidence["hba"]
                        and evidence["schemaBound"] and actual == self.cluster["pilot_executor_schema_sha256"]
                        and (evidence["active"] == bool(evidence["release"])) and evidence["releaseBound"],
                        "Dedicated executor catalog or authorization inconsistency")
        if fixture:
            control.require(not evidence["active"] and not evidence["institutionalKey"], "Institutional target already enrolled")
        return evidence

    def effective(self, secret, *, role=LOGIN):
        result = json.loads(self.restricted(secret, effective_sql(role), role=role))
        expected = [role, role, dedicated.DATABASE, "127.0.0.1", self.cluster["port"],
                    self.cluster["uuid"], True, True, True]
        control.require(result == expected, "Effective PostgreSQL executor privileges differ")
        return {"login": role, "banco": result[2], "porta": result[4], "cluster": result[5],
                "heranca": True, "funcoes": list(RPC)}

    def provision(self):
        if self.cluster.get("pilot_executor_schema_sha256"):
            setup_hba(self.cluster)
            with self.running():
                return self.inspect()
        with self.running():
            dedicated.inspect(self.cluster, self.admin, self.runner)
            control.require(not any(self.counts().values()), "Dedicated receiving tables are not empty")
            control.psql(self.cluster, self.admin, file=SQL, run=self.runner)
            for file in (SQL, CORE):
                self.cluster["artifacts"][file.relative_to(control.REPO).as_posix()] = control.digest(file)
            self.cluster["pilot_executor_schema_sha256"] = schema_hash(self.commands, self.cluster, self.admin)
            control.save(self.cluster)
        setup_hba(self.cluster)
        with self.running():
            return self.inspect()


def schema_hash(commands, cluster, admin):
    return sha256(recovery.fingerprint_schema(commands, cluster, admin).encode()).hexdigest()


def effective_sql(role):
    calls = ",".join(literal(f"{SCHEMA}.{name}(jsonb,uuid)") + "::regprocedure" for name in RPC)
    return f"""SELECT jsonb_build_array(session_user,current_user,current_database(),host(inet_server_addr()),
       inet_server_port(),current_setting('sentinela.sandbox_uuid'),
       pg_has_role(session_user,'{SERVICE}','USAGE') AND NOT pg_has_role(session_user,'{SERVICE}','SET'),
       (SELECT bool_and(has_function_privilege(session_user,oid,'EXECUTE')) FROM unnest(ARRAY[{calls}]) oid),
       NOT pg_has_role(session_user,'{WRITER}','MEMBER') AND NOT pg_has_role(session_user,'pg_read_all_data','MEMBER')
       AND NOT pg_has_role(session_user,'pg_write_all_data','MEMBER')
       AND NOT has_database_privilege(current_database(),'CREATE,TEMPORARY')
       AND NOT EXISTS (SELECT FROM pg_namespace WHERE has_schema_privilege(oid,'CREATE'))
       AND NOT has_schema_privilege('sentinela','USAGE') AND NOT has_schema_privilege('sentinela_pcdf_stage','USAGE')
       AND (SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
            FROM pg_roles WHERE rolname={literal(role)}));"""


def catalog(pilot, *, fixture):
    fixture_count = 1 if fixture else 0
    return pilot.query(f"""
      SELECT jsonb_build_object(
        'postgres',current_setting('server_version'),
        'postgis',(SELECT extversion FROM pg_extension WHERE extname='postgis'),
        'rls',(SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace
                  AND relkind='r' AND relrowsecurity AND relforcerowsecurity),
        'fks',(SELECT count(*) FROM pg_constraint WHERE connamespace='sentinela'::regnamespace AND contype='f'),
        'structure', current_setting('server_version')='17.11'
          AND (SELECT extversion='3.6.2' FROM pg_extension WHERE extname='postgis')
          AND (SELECT count(*)=19 AND bool_and(relrowsecurity AND relforcerowsecurity)
               FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r')
          AND (SELECT count(*)=34 AND bool_and(convalidated)
               FROM pg_constraint WHERE connamespace='sentinela'::regnamespace AND contype='f')
          AND NOT EXISTS (SELECT FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r'
              AND (has_table_privilege('{LOGIN}',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
                OR has_any_column_privilege('{LOGIN}',oid,'SELECT,INSERT,UPDATE,REFERENCES')))
          AND NOT EXISTS (SELECT FROM pg_proc WHERE pronamespace='sentinela'::regnamespace
              AND has_function_privilege('{LOGIN}',oid,'EXECUTE')),
        'schemaBound', (SELECT cluster::text=current_setting('sentinela.sandbox_uuid') FROM {SCHEMA}.target),
        'active', (SELECT rolcanlogin FROM pg_roles WHERE rolname='{LOGIN}'),
        'institutionalKey', (SELECT institutional_key FROM {SCHEMA}.target),
        'release', (SELECT to_jsonb(r) FROM {SCHEMA}.release r),
        'releaseBound', (SELECT CASE WHEN rolcanlogin THEN
            rolpassword LIKE 'SCRAM-SHA-256$%' AND EXISTS (SELECT FROM {SCHEMA}.release r
              JOIN sentinela.usuarios u ON u.id=r.actor AND u.ativo AND u.perfil='Operador'
              JOIN {SCHEMA}.target t ON t.institutional_key=r.key_pin WHERE r.expires_at=rolvaliduntil)
          ELSE rolpassword IS NULL END FROM pg_authid WHERE rolname='{LOGIN}'),
        'hba', (SELECT count(*)=2 AND bool_and(type='host' AND database=ARRAY[current_database()::text]
                AND auth_method='scram-sha-256' AND address='127.0.0.1' AND netmask='255.255.255.255')
                FROM pg_hba_file_rules WHERE user_name && ARRAY['{LOGIN}','{FIXTURE}'])
          AND NOT EXISTS (SELECT FROM pg_hba_file_rules WHERE auth_method IN ('trust','password','md5')),
        'roles',
          (SELECT count(*)=3 AND bool_and(NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole
              OR rolreplication OR (rolname<>'{LOGIN}' AND rolcanlogin)) AND rolinherit=(rolname='{LOGIN}'))
              FROM pg_roles WHERE rolname IN ('{LOGIN}','{SERVICE}','{WRITER}'))
          AND NOT has_database_privilege('{LOGIN}',current_database(),'CREATE,TEMPORARY')
          AND has_database_privilege('{LOGIN}',current_database(),'CONNECT')
          AND NOT EXISTS (SELECT FROM pg_namespace WHERE has_schema_privilege('{LOGIN}',oid,'CREATE'))
          AND NOT EXISTS (SELECT FROM pg_database WHERE datname<>current_database()
                          AND has_database_privilege('{LOGIN}',oid,'CONNECT'))
          AND NOT has_schema_privilege('{LOGIN}','sentinela','USAGE')
          AND NOT has_schema_privilege('{LOGIN}','sentinela_pcdf_stage','USAGE')
          AND (SELECT count(*)={fixture_count} FROM pg_roles WHERE rolname='{FIXTURE}')
          AND (SELECT count(*)={1 + fixture_count} AND bool_and(roleid='{SERVICE}'::regrole
                AND pg_get_userbyid(member) IN ('{LOGIN}','{FIXTURE}')
                AND inherit_option AND NOT set_option AND NOT admin_option AND grantor='postgres'::regrole)
              FROM pg_auth_members m
              WHERE EXISTS (SELECT FROM pg_roles r WHERE r.oid IN (m.roleid,m.member)
                 AND rolname IN ('{LOGIN}','{SERVICE}','{WRITER}','{FIXTURE}')))
          AND (SELECT count(*)=3 AND bool_and(prosecdef AND proowner='{WRITER}'::regrole
              AND proconfig=ARRAY['search_path=pg_catalog, pg_temp']
              AND has_function_privilege('{LOGIN}',oid,'EXECUTE') AND NOT EXISTS (
                SELECT FROM aclexplode(proacl) WHERE grantee NOT IN (proowner,'{SERVICE}'::regrole)))
            FROM pg_proc WHERE pronamespace='{SCHEMA}'::regnamespace
            AND proname IN ({",".join(map(literal, RPC))}))
          AND NOT has_function_privilege('{LOGIN}','{SCHEMA}.authorized_delivery(jsonb,uuid)','EXECUTE')
          AND NOT has_function_privilege('{LOGIN}',
            'sentinela_pcdf_stage.stage(jsonb,uuid,uuid,text,text,text)','EXECUTE'));""")


def main():
    parser = argparse.ArgumentParser(description="Consult the preserved historical PCDF pilot catalog")
    parser.add_argument("--cluster", required=True, type=Path)
    args = parser.parse_args()
    pilot = Pilot(args.cluster)
    with pilot.running():
        result = pilot.inspect()
    print(json.dumps({"cluster": pilot.cluster["uuid"], "state": pilot.cluster["phase"], "catalog": result}))


if __name__ == "__main__":
    sys.exit(main())
