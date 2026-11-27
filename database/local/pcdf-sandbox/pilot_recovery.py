"""Back up an attested local cluster and compare it with a new isolated restore."""
import argparse
from base64 import b64encode
from datetime import datetime, timezone
from hashlib import pbkdf2_hmac, sha256
import hmac
import json
from pathlib import Path
import secrets

from qualify import backup, control
import pilot_environment as dedicated

LOGIN = "pcdf_fixture_login"
RESTORE_PORT = 55482


def scram(password):
    # PostgreSQL accepts a SCRAM verifier. No cleartext password is sent as SQL.
    salt = secrets.token_bytes(16)
    salted = pbkdf2_hmac("sha256", password.encode(), salt, 4096)
    client = hmac.digest(salted, b"Client Key", "sha256")
    server = hmac.digest(salted, b"Server Key", "sha256")
    salt64, stored64, server64 = (b64encode(value).decode() for value in (salt, sha256(client).digest(), server))
    return f"SCRAM-SHA-256$4096:{salt64}${stored64}:{server64}"


def role_sql(password=None):
    suffix = f" PASSWORD '{scram(password)}'" if password is not None else ""
    login = "LOGIN" if password is not None else "NOLOGIN"
    return f"CREATE ROLE {LOGIN} {login} NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS{suffix};"


def allow_fixture_login(cluster):
    path = Path(cluster["data"]) / "pg_hba.conf"
    with path.open("r+", encoding="utf8") as stream:
        original = stream.read()
        stream.seek(0)
        stream.write(f"host {cluster['database']} {LOGIN} 127.0.0.1/32 scram-sha-256\n" + original)
    cluster["runtime_files"][path.name] = control.digest(path)
    control.save(cluster)


def endpoint(cluster, role="postgres", database=None):
    return ["-w", "-h", "127.0.0.1", "-p", str(cluster["port"]), "-U", role,
            "-d", database or cluster["database"]]


def login_sql(commands, cluster, password, sql, database=None, role=LOGIN):
    return commands.call("psql", ["-X", "-qAt", *endpoint(cluster, role, database),
                                  "-v", "ON_ERROR_STOP=1", "-f", "-"], password=password, input=sql)


def permissions(commands, cluster, secret):
    actual = json.loads(login_sql(commands, cluster, secret, """
      SELECT jsonb_build_array(session_user,current_user,current_database(),inet_server_port(),
        (SELECT NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit)
           FROM pg_roles WHERE rolname=session_user));"""))
    assert actual == [LOGIN, LOGIN, cluster["database"], cluster["port"], True]
    refused = (
        "CREATE SCHEMA pcdf_proibido", "CREATE TABLE public.pcdf_proibido(id integer)",
        "ALTER TABLE sentinela.linhas_staging DISABLE ROW LEVEL SECURITY",
        "SELECT * FROM sentinela.usuarios",
        "INSERT INTO sentinela.linhas_staging DEFAULT VALUES",
        "UPDATE sentinela.ocorrencias SET ativo=false",
        "DELETE FROM sentinela.linhas_origem",
        "SET ROLE pcdf_receiver_fixture",
        "SELECT sentinela_pcdf_receiver_fixture.stage(NULL,NULL)",
        "SELECT sentinela_pcdf_receiver_fixture.receive_fixture('{}',gen_random_uuid())",
        "SELECT sentinela_pcdf_receiver_fixture.record_attempt('{}',gen_random_uuid())",
    )
    for statement in refused:
        # The inner block rolls back even an unexpected success. Only 42501 qualifies.
        login_sql(commands, cluster, secret, f"""BEGIN;
          DO $test$ BEGIN
            {statement};
            RAISE EXCEPTION 'Prohibited statement succeeded';
          EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END $test$;
          ROLLBACK;""")
    for pwd, db, role in ((secret, "postgres", LOGIN), (secret + "x", None, LOGIN),
                          (secret, None, "sentinela_local_reader"), (secret, None, "pcdf_nao_existe")):
        try:
            login_sql(commands, cluster, pwd, "SELECT 1", db, role)
        except RuntimeError:
            assert commands.events[-1]["exit_code"] == 2
        else:
            raise AssertionError("Unauthorized connection accepted")
    return len(refused) + 4


def ordered_rows(cluster, password, runner, table):
    # The table name comes from the fixed core list or the validated catalog query.
    return control.psql(cluster, password, run=runner, sql=f"""
      SELECT coalesce(jsonb_agg(row ORDER BY row),'[]'::jsonb)
      FROM (SELECT to_jsonb(t) AS row FROM {table} t) q""")


def fingerprint_schema(commands, cluster, password):
    dump = commands.call("pg_dump", [*endpoint(cluster), "--schema-only"], password=password)
    return "\n".join(line for line in dump.splitlines()
                     if not line.startswith(("\\restrict ", "\\unrestrict ")))


ROLE_EVIDENCE_SQL = """SELECT jsonb_agg(jsonb_build_array(rolname,rolcanlogin,rolsuper,rolbypassrls,
  rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolconnlimit,rolconfig,
  has_database_privilege(oid,current_database(),'CONNECT'),
  has_database_privilege(oid,current_database(),'TEMPORARY'),
  (SELECT count(*) FROM pg_auth_members WHERE roleid=r.oid OR member=r.oid))
  ORDER BY rolname)
  FROM pg_roles r WHERE rolname IN ('sentinela_local_reader','pcdf_receiver_fixture',
                                   'pcdf_fixture_login','pcdf_pilot_service',
                                   'pcdf_pilot_executor','pcdf_pilot_writer')"""

PILOT_MEMBERSHIP_SQL = """SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(roleid),pg_get_userbyid(member),
  pg_get_userbyid(grantor),inherit_option,set_option,admin_option) ORDER BY roleid,member)
  FROM pg_auth_members WHERE roleid='pcdf_pilot_service'::regrole"""

PILOT_ROLE_SQL = """CREATE ROLE pcdf_pilot_executor NOLOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  CREATE ROLE pcdf_pilot_writer NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  GRANT pcdf_pilot_service TO pcdf_pilot_executor WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
  REVOKE CONNECT ON DATABASE postgres, template0, template1 FROM PUBLIC;
  ALTER ROLE pcdf_pilot_executor SET log_min_error_statement = 'panic';
  ALTER ROLE pcdf_pilot_executor SET log_error_verbosity = 'terse';
  ALTER ROLE pcdf_pilot_executor SET log_statement = 'none';
  ALTER ROLE pcdf_pilot_executor SET log_min_duration_statement = -1;"""


def restore_and_compare(source, admin, runner, commands, fixture_secret=None):
    qualified_pilot = bool(source.get("pilot_executor_schema_sha256"))
    if qualified_pilot:
        import pilot_runtime as runtime

    control.attest(source, admin, run=runner)
    directory = Path(source["root"]) / "evidence"
    archive = directory / ("pcdf-" + secrets.token_hex(8) + ".dump")
    commands.call("pg_dump", [*endpoint(source), "-Fc", "-f", archive], password=admin)
    archive_hash = backup.digest(archive)
    catalog = fingerprint_schema(commands, source, admin)
    role_evidence = control.psql(source, admin, run=runner, sql=ROLE_EVIDENCE_SQL)
    membership = control.psql(source, admin, run=runner, sql=PILOT_MEMBERSHIP_SQL) if qualified_pilot else None
    tables = json.loads(control.psql(source, admin, run=runner, sql="""
      SELECT jsonb_agg(format('%I.%I', schemaname, tablename) ORDER BY schemaname, tablename)
      FROM pg_tables WHERE schemaname IN ('sentinela','sentinela_pcdf_receiver_fixture','sentinela_pcdf_pilot')"""))
    control.require(len(tables) == 19 + bool(fixture_secret) + 3 * qualified_pilot, "Unexpected backup inventory")

    restore = None
    restore_admin = secrets.token_urlsafe(40)
    restored_service_secret = secrets.token_urlsafe(40) if fixture_secret else None
    restore_runner = backup.bootstrap_runner(commands, restore_admin)
    original_port = control.PORT
    restore_port = RESTORE_PORT if fixture_secret else 55483
    control.PORT = restore_port
    receipt = {"result": "FAIL", "file": str(archive), "sha256": archive_hash, "bytes": archive.stat().st_size,
               "utc": datetime.now(timezone.utc).isoformat(), "tools": "PostgreSQL 17.11",
               "source": source["uuid"], "sourcePort": source["port"], "restorePort": restore_port}
    try:
        restore = control.prepare("Portuguese_Brazil.1252", run=restore_runner)
        control.create(restore, run=restore_runner)
        config = Path(restore["data"]) / "postgresql.auto.conf"
        raw = config.read_text(encoding="utf8")
        control.require(raw.count("port=55432\n") == 1, "Unexpected restore configuration")
        config.write_text(raw.replace("port=55432\n", f"port={restore_port}\n"), encoding="utf8")
        restore["runtime_files"][config.name] = control.digest(config)
        if fixture_secret:
            allow_fixture_login(restore)
        if qualified_pilot:
            runtime.setup_hba(restore)
        control.save(restore)
        control.start(restore, restore_admin, run=restore_runner)
        control.attest(restore, restore_admin, database="postgres", run=restore_runner)
        roles = (
            "CREATE ROLE sentinela_local_reader NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT CONNECTION LIMIT 5;"
            "CREATE ROLE pcdf_receiver_fixture NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;" + role_sql(restored_service_secret)
            if fixture_secret else
            "CREATE ROLE pcdf_pilot_service NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE;"
        )
        if qualified_pilot:
            roles += PILOT_ROLE_SQL
        control.psql(restore, restore_admin, database="postgres", sql=roles, run=restore_runner)
        control.psql(restore, restore_admin, database="postgres",
                     sql=f"CREATE DATABASE {control.DB} TEMPLATE template0 ENCODING 'UTF8'", run=restore_runner)
        control.attest(restore, restore_admin, run=restore_runner)
        control.require(backup.digest(archive) == archive_hash, "Archive changed before restore")
        commands.call("pg_restore", [*endpoint(restore), "--exit-on-error", "--single-transaction", archive],
                      password=restore_admin)
        role = LOGIN if fixture_secret else "pcdf_pilot_service"
        control.psql(restore, restore_admin, run=restore_runner, sql=(
            f"REVOKE CONNECT,TEMPORARY ON DATABASE {control.DB} FROM PUBLIC;"
            f"GRANT CONNECT ON DATABASE {control.DB} TO {role};"
            + (f"GRANT CONNECT ON DATABASE {control.DB} TO sentinela_local_reader;" if fixture_secret else "")
        ))
        control.require(fingerprint_schema(commands, restore, restore_admin) == catalog, "Schema differs after restore")
        control.require(control.psql(restore, restore_admin, run=restore_runner, sql=ROLE_EVIDENCE_SQL)
                        == role_evidence, "Role attributes or database grants differ after restore")
        if qualified_pilot:
            control.require(control.psql(restore, restore_admin, run=restore_runner, sql=PILOT_MEMBERSHIP_SQL)
                            == membership, "Restored inheritance differs")
        for table in tables:
            control.PORT = original_port
            left = ordered_rows(source, admin, runner, table)
            control.PORT = restore_port
            control.require(ordered_rows(restore, restore_admin, restore_runner, table) == left, f"Restored rows differ: {table}")
        if fixture_secret:
            # The replay port has identical ACLs and authenticates the login.
            # Its stage guard deliberately rejects writes outside the original fixture port.
            control.require(permissions(commands, restore, restored_service_secret) == 15, "Restored permissions differ")
        elif qualified_pilot:
            test_secret = secrets.token_urlsafe(40)

            def role_stdin(exe, args, password=None):
                return commands.call(exe, args, password=password, input=runtime.fixture_role(test_secret))

            control.psql(restore, restore_admin, file="-", run=role_stdin)
            try:
                def test(statement):
                    return login_sql(commands, restore, test_secret, statement, role=runtime.FIXTURE)

                control.require(json.loads(test(runtime.effective_sql(runtime.FIXTURE))) == [
                    runtime.FIXTURE, runtime.FIXTURE, source['database'], '127.0.0.1', restore_port,
                    restore['uuid'], True, True, True], "Restored effective permissions differ")
                receipt["restoredDenials"] = runtime.verify_denials(test)
                for other in ("postgres", "template0", "template1"):
                    try:
                        login_sql(commands, restore, test_secret, "SELECT 1", database=other, role=runtime.FIXTURE)
                    except RuntimeError:
                        control.require(commands.events[-1]["exit_code"] == 2, "Expected connection refusal")
                    else:
                        raise AssertionError("Restored other-database login accepted")
                receipt["restoredOtherDatabaseDenials"] = 3
            finally:
                control.psql(restore, restore_admin, sql=f"DROP ROLE {runtime.FIXTURE}", run=restore_runner)
        else:
            dedicated.inspect(restore, restore_admin, restore_runner)
        receipt.update(result="PASS", tables=len(tables), restore=restore["uuid"],
                       schemaEqual=True, dataEqual=True, roleGrantsEqual=True)
    finally:
        control.PORT = restore_port
        try:
            if restore and restore["phase"] in {"RUNNING", "INSTALLED"}:
                control.stop(restore, restore_admin, run=restore_runner)
        except BaseException:
            receipt["result"] = "FAIL"
            raise
        finally:
            if restore:
                receipt["restoreState"] = restore["phase"]
            (archive.with_suffix(".json")).write_text(json.dumps(receipt, indent=2), encoding="utf8")
            control.PORT = original_port
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dedicated-backup", type=Path, required=True)
    args = parser.parse_args()
    control.BASE, control.PORT, control.DB = dedicated.BASE, dedicated.PORT, dedicated.DATABASE
    cluster = control.load(args.dedicated_backup)
    if cluster.get("pilot_executor_schema_sha256"):
        from pilot_runtime import Pilot

        pilot = Pilot(args.dedicated_backup)
        with pilot.running():
            state = pilot.inspect()
            control.require(not state['active'], "Deactivate the executor before recovery qualification")
            result = restore_and_compare(pilot.cluster, pilot.admin, pilot.runner, pilot.commands)
        print(json.dumps(result))
        return
    control.require(cluster["phase"] == "STOPPED", "Dedicated cluster must be stopped")
    key = Path(cluster["root"]) / "admin.dpapi"
    control.no_links(key)
    secret = dedicated.credential(key.read_text(encoding="ascii"), "unprotect")
    commands = backup.Commands()
    runner = backup.bootstrap_runner(commands, secret)
    control.start(cluster, secret, run=runner)
    try:
        dedicated.inspect(cluster, secret, runner)
        print(json.dumps(restore_and_compare(cluster, secret, runner, commands)))
    finally:
        control.stop(cluster, secret, run=runner)


if __name__ == "__main__":
    main()
