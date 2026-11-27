"""Compare a full logical restore of the integrated disposable cluster."""

import json
import os
import re
import socket
import subprocess
import uuid
from difflib import unified_diff
from hashlib import file_digest
from time import perf_counter


RESTORE_PORT = 55489
POLICY_ROLES = re.compile(r"^(CREATE POLICY .+ FOR \w+ TO )([a-z0-9_]+(?:, [a-z0-9_]+)+)(?= USING| WITH CHECK|;)")


def qualify_restore(pg, root, database, source_port, source_system, secret):
    if source_port != 55488 or not root.name.startswith("sentinela-occurrence-management-"):
        raise ValueError("O ensaio exige a origem sintética de gestão")
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        probe.bind(("127.0.0.1", RESTORE_PORT))

    def address(port):
        return ("-w", "-h", "127.0.0.1", "-p", port, "-U", "postgres")

    def query(port, db, *args, **kwargs):
        return pg("psql", "-X", "-qAt", *address(port), "-d", db, "-v", "ON_ERROR_STOP=1", *args, **kwargs)

    def output(command, *args, **kwargs):
        return command(*args, stdout=subprocess.PIPE, **kwargs).stdout.decode("utf-8")

    def attest(port, db, directory, marker):
        sql = """SELECT jsonb_build_object('folder',current_setting('data_directory'),'database',current_database(),
          'system',system_identifier::text,'marker',current_setting('sentinela.sandbox_uuid',true),
          'version',current_setting('server_version_num'),'port',inet_server_port(),'host',host(inet_server_addr()))
          FROM pg_control_system()"""
        identity = json.loads(output(query, port, db, "-c", sql))
        assert directory.as_posix().lower() == identity["folder"].replace("\\", "/").lower()
        assert (identity["database"], identity["version"], identity["port"], identity["host"]) == (db, "170011", port, "127.0.0.1")
        assert identity["marker"] == marker
        return identity["system"]

    def schema(port):
        sql = output(pg, "pg_dump", *address(port), "-d", database, "--schema-only")
        # PostgreSQL 17 creates a fresh psql restriction key for each plain dump.
        # Policy membership is a set. pg_dump can order those names by role OID.
        return [POLICY_ROLES.sub(lambda m: m[1] + ", ".join(sorted(m[2].split(", "))), line)
                for line in sql.splitlines() if not line.startswith(("\\restrict ", "\\unrestrict "))]

    def digest(path):
        with path.open("rb") as content:
            return file_digest(content, "sha256").hexdigest()

    def fingerprints(port):
        sql = r"""SELECT format($fmt$
          SELECT %L, count(*), encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex')
          FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS h FROM %I.%I t) x
          $fmt$, n.nspname||'.'||c.relname,n.nspname,c.relname)
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE c.relkind IN ('r','p') AND (n.nspname IN ('sentinela','extensions') OR n.nspname LIKE 'sentinela\_%')
          ORDER BY n.nspname,c.relname
          \gexec
        """
        return output(query, port, database, "-f", "-", input=sql.encode()).strip().splitlines()

    def system_grants(port):
        return output(query, port, database, "-c", """
          SELECT format('GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO %I;', r.rolname)
          FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a JOIN pg_roles r ON r.oid=a.grantee
          WHERE p.oid='pg_catalog.pg_control_system()'::regprocedure
          AND r.rolname IN ('sentinela_local_admin','sentinela_local_operator','sentinela_ocorrencias_reader')
          AND a.privilege_type='EXECUTE' AND NOT a.is_grantable ORDER BY r.rolname
        """)

    marker = output(query, source_port, database, "-c", "SHOW sentinela.sandbox_uuid").strip()
    assert str(uuid.UUID(marker)) == marker
    assert attest(source_port, database, root / "data", marker) == source_system
    original_schema = schema(source_port)
    original_data = fingerprints(source_port)
    grants = system_grants(source_port)
    assert len(grants.splitlines()) == 3
    assert len(original_data) >= 23 and any(row.startswith("sentinela_ocorrencias_manual.cadastros|") for row in original_data)
    assert any(row.startswith("sentinela_pcdf_local.entregas_pacote|") for row in original_data)

    archive = root / "integrated.dump"
    pg("pg_dump", *address(source_port), "-d", database, "--format=custom", "--file", archive)
    checksum = digest(archive)
    toc = output(pg, "pg_restore", "--list", archive)
    assert "TABLE DATA" in toc and "entregas_pacote" in toc and "cadastros" in toc
    pg("pg_restore", "--file", os.devnull, archive)
    role_dump = output(pg, "pg_dumpall", *address(source_port), "--roles-only", "--no-role-passwords")
    assert role_dump.splitlines().count("CREATE ROLE postgres;") == 1
    roles = "\n".join(line for line in role_dump.splitlines() if line != "CREATE ROLE postgres;")
    roles_file = root / "roles-without-passwords.sql"
    roles_file.write_bytes((roles + "\n").encode("utf-8"))
    grants_file = root / "system-grants.sql"
    grants_file.write_bytes(grants.encode("utf-8"))
    sidecars = {path.name: digest(path) for path in (roles_file, grants_file)}

    clone = root / "restored"
    clone_marker = str(uuid.uuid4())
    pg("initdb", "-D", clone, "-U", "postgres", "--encoding=UTF8", "--locale=C", "--auth=scram-sha-256",
       "--pwfile=" + str(secret), stdout=subprocess.DEVNULL)
    with (clone / "postgresql.auto.conf").open("a", encoding="ascii") as conf:
        conf.write(f"listen_addresses='127.0.0.1'\nport={RESTORE_PORT}\nsentinela.sandbox_uuid='{clone_marker}'\n")
    pg("pg_ctl", "-D", clone, "-l", root / "restored.log", "-w", "start")
    try:
        assert attest(RESTORE_PORT, "postgres", clone, clone_marker) != source_system
        query(RESTORE_PORT, "postgres", "-f", roles_file)
        query(RESTORE_PORT, "postgres", "-c", f"CREATE DATABASE {database} TEMPLATE template0 ENCODING 'UTF8'")
        args = (*address(RESTORE_PORT), "-d", database, "--exit-on-error", "--single-transaction", archive)
        started = perf_counter()
        pg("pg_restore", *args)
        elapsed = round(perf_counter() - started, 3)
        query(RESTORE_PORT, database, "-f", grants_file)
        restored_schema = schema(RESTORE_PORT)
        if restored_schema != original_schema:
            (root / "schema-restore.diff").write_text("\n".join(unified_diff(original_schema, restored_schema)), encoding="utf-8")
            raise RuntimeError(f"O schema restaurado diverge do original: {root / 'schema-restore.diff'}")
        assert fingerprints(RESTORE_PORT) == original_data, "O conteúdo restaurado diverge do original"

        try:
            pg("pg_restore", *args, capture_output=True)
        except subprocess.CalledProcessError as error:
            assert error.returncode > 0 and error.stderr
        else:
            raise RuntimeError("A restauração aceitou um destino que já possui o schema")
        assert system_grants(RESTORE_PORT) == grants
        assert schema(RESTORE_PORT) == original_schema and fingerprints(RESTORE_PORT) == original_data
        assert digest(archive) == checksum
        assert sidecars == {path.name: digest(path) for path in (roles_file, grants_file)}

        permissions = output(query, RESTORE_PORT, database, "-c", """
          SELECT extversion='3.6.2' AND NOT has_table_privilege('sentinela_local_analyst',
            'sentinela_ocorrencias_manual.cadastros','SELECT')
          AND NOT has_table_privilege('sentinela_local_operator','sentinela_pcdf_local.entregas_pacote','SELECT')
          AND has_table_privilege('sentinela_local_analyst','sentinela_ocorrencias_analytics.ocorrencias','SELECT')
          AND NOT has_table_privilege('sentinela_local_analyst','sentinela_ocorrencias_analytics.ocorrencias','UPDATE')
          FROM pg_extension WHERE extname='postgis'""").strip()
        assert permissions == "t"
        for login in ("sentinela_local_admin", "sentinela_local_operator", "sentinela_local_analyst"):
            restored = output(query, RESTORE_PORT, database, "-c", f"""
              SET SESSION AUTHORIZATION {login};
              BEGIN READ ONLY;
              SELECT sentinela_ocorrencias_local.identidade()->>'login' = session_user::text
                AND (SELECT count(*) FROM sentinela_ocorrencias_analytics.regioes_administrativas)=37
                AND (sentinela_ocorrencias_manual.lista('{{}}',1,'data','desc')->>'total')::int > 0;
              ROLLBACK;
            """).strip()
            assert restored == "t", f"Leitura restaurada indisponível para {login}"
    finally:
        pg("pg_ctl", "-D", clone, "-m", "fast", "-w", "stop")
    result = {"result": "PASS", "postgresql": "17.11", "postgis": "3.6.2", "sourcePort": source_port,
              "restorePort": RESTORE_PORT, "sha256": checksum, "sidecars": sidecars, "tables": len(original_data),
              "restoreSeconds": elapsed, "schemaMatches": True, "dataMatches": True, "rollbackVerified": True,
              "restoredProfiles": 3}
    (root / "integrated-restore.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result), flush=True)
