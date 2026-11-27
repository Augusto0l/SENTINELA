"""Rehearse incremental migration and logical recovery in two disposable clusters."""

import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import socket
import subprocess
from tempfile import mkdtemp
from time import sleep

from run_import_local import AUTH_FIXTURE, ROOT

FIXTURE = """
INSERT INTO auth.users(id,email,raw_app_meta_data)
SELECT ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid, 'fixture-'||i||'@example.test', '{}'
FROM generate_series(1,3) i;
INSERT INTO sentinela.usuarios(id,auth_user_id,nome_exibicao,perfil,ativo)
SELECT ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid, a.id, 'Ensaio '||p.perfil,p.perfil,true
FROM unnest(ARRAY['Administrador','Operador','Analista']) WITH ORDINALITY p(perfil,i)
JOIN auth.users a ON a.email='fixture-'||i||'@example.test';
INSERT INTO auth.sessions(id,user_id)
SELECT ('30000000-0000-4000-8000-'||right(id::text,12))::uuid,id FROM auth.users;
INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,justificativa)
VALUES ('servico','fixture-anterior','fixture.anterior','Synthetic event before installation');
INSERT INTO sentinela.regioes_administrativas(codigo_interno,nome,versao_catalogo,vigencia,
  limite,versao_cartografia,evidencia_referencia_espacial)
VALUES ('RA-TESTE','Synthetic territory','fixture',daterange(NULL,NULL),
  extensions.ST_Multi(extensions.ST_MakeEnvelope(-48,-16,-47,-15,4326)),'fixture','fixture');
"""

DATA = """
SELECT jsonb_build_object(
 'auth',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM auth.users u),
 'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM auth.sessions s),
 'links',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM sentinela.usuarios u),
 'matrix',(SELECT jsonb_agg(to_jsonb(p) ORDER BY perfil,acao) FROM sentinela.perfil_permissoes p),
 'audit',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM sentinela.eventos_auditoria e),
 'geography',(SELECT jsonb_agg(jsonb_build_array(id,codigo_interno,
   encode(extensions.ST_AsEWKB(limite),'hex')) ORDER BY id) FROM sentinela.regioes_administrativas));
"""

CATALOG = """
SELECT jsonb_build_object(
 'ledger',(SELECT array_agg(versao ORDER BY versao) FROM sentinela.schema_migrations),
 'schemas',(SELECT jsonb_agg(jsonb_build_array(nspname,pg_get_userbyid(nspowner),
   ARRAY(SELECT a::text FROM unnest(coalesce(nspacl,acldefault('n',nspowner))) a ORDER BY a::text)) ORDER BY nspname)
   FROM pg_namespace WHERE nspname LIKE 'sentinela%' OR nspname='auth'),
 'rls',(SELECT jsonb_agg(jsonb_build_array(nspname,relname,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner),
   ARRAY(SELECT a::text FROM unnest(coalesce(relacl,acldefault('r',relowner))) a ORDER BY a::text)) ORDER BY nspname,relname)
   FROM pg_class JOIN pg_namespace ON relnamespace=pg_namespace.oid
   WHERE nspname LIKE 'sentinela%' AND relkind IN ('r','v')),
 'column_acl',(SELECT jsonb_agg(jsonb_build_array(nspname,relname,attname,
   ARRAY(SELECT g::text FROM unnest(attacl) g ORDER BY g::text)) ORDER BY nspname,relname,attname)
   FROM pg_attribute a JOIN pg_class ON a.attrelid=pg_class.oid JOIN pg_namespace ON relnamespace=pg_namespace.oid
   WHERE nspname LIKE 'sentinela%' AND attacl IS NOT NULL),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(nspname,relname,tgname,pg_get_triggerdef(t.oid),tgenabled)
   ORDER BY nspname,relname,tgname)
   FROM pg_trigger t JOIN pg_class ON tgrelid=pg_class.oid JOIN pg_namespace ON relnamespace=pg_namespace.oid
   WHERE NOT tgisinternal AND (nspname LIKE 'sentinela%' OR nspname='auth')),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(nspname,relname,conname,pg_get_constraintdef(c.oid),convalidated)
   ORDER BY nspname,relname,conname)
   FROM pg_constraint c JOIN pg_class ON conrelid=pg_class.oid JOIN pg_namespace ON relnamespace=pg_namespace.oid
   WHERE nspname LIKE 'sentinela%' OR nspname='auth'),
 'spatial_indexes',(SELECT jsonb_agg(jsonb_build_array(nspname,relname,pg_get_indexdef(i.indexrelid),i.indisvalid)
   ORDER BY nspname,relname)
   FROM pg_index i JOIN pg_class ON indexrelid=pg_class.oid JOIN pg_namespace ON relnamespace=pg_namespace.oid
   JOIN pg_am ON relam=pg_am.oid WHERE nspname LIKE 'sentinela%' AND amname='gist'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname)
   FROM pg_policies p WHERE schemaname LIKE 'sentinela%'),
 'functions',(SELECT jsonb_agg(jsonb_build_array(nspname,proname,pg_get_functiondef(p.oid),pg_get_userbyid(proowner),
   ARRAY(SELECT a::text FROM unnest(coalesce(proacl,acldefault('f',proowner))) a ORDER BY a::text))
   ORDER BY nspname,proname,pg_get_function_identity_arguments(p.oid))
   FROM pg_proc p JOIN pg_namespace ON pronamespace=pg_namespace.oid
   WHERE (nspname LIKE 'sentinela%' OR nspname='auth') AND p.prokind='f'),
 'roles',(SELECT jsonb_agg(jsonb_build_array(rolname,rolcanlogin,rolbypassrls,rolcreaterole,rolsuper,rolinherit)
     ORDER BY rolname) FROM pg_roles WHERE rolname LIKE 'sentinela%' OR rolname IN ('postgres','anon','authenticated','service_role')),
 'membership',(SELECT jsonb_agg(jsonb_build_array(role.rolname,member.rolname,grantor.rolname,admin_option,inherit_option,set_option)
   ORDER BY role.rolname,member.rolname,grantor.rolname) FROM pg_auth_members
   JOIN pg_roles role ON role.oid=roleid JOIN pg_roles member ON member.oid=pg_auth_members.member
   JOIN pg_roles grantor ON grantor.oid=pg_auth_members.grantor
   WHERE role.rolname LIKE 'sentinela%' OR member.rolname LIKE 'sentinela%'));
"""


def fingerprint(value):
    return sha256(json.dumps(value, sort_keys=True, ensure_ascii=True).encode()).hexdigest()


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def check_catalog(expected, observed, phase):
    differences = [key for key in expected if expected[key] != observed[key]]
    check(not differences, f"{phase} catalog differs after restore: {', '.join(differences)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--postgis", required=True, choices=["3.3.7", "3.6.2"])
    args = parser.parse_args()
    args.output_root.mkdir(parents=True, exist_ok=True)
    output = Path(mkdtemp(prefix="sentinela-predeploy-", dir=args.output_root.resolve()))
    env = {key: value for key, value in os.environ.items() if not key.upper().startswith("PG")}
    env["PGCLIENTENCODING"] = "UTF8"

    def binary(tool):
        return str(args.pg_bin.resolve() / (tool + (".exe" if os.name == "nt" else "")))

    def run(tool, *parameters):
        return subprocess.run([binary(tool), *map(str, parameters)], check=True,
                              capture_output=True, encoding="utf8", timeout=120, env=env).stdout.strip()

    def connection(port, user):
        return ["-h", "127.0.0.1", "-p", str(port), "-U", user]

    def psql(port, user, arg, value, database="postgres"):
        return run("psql", "-XwqAt", *connection(port, user), "-d", database, "-v", "ON_ERROR_STOP=1", arg, value)

    def data_at(port, role, database, statement):
        return json.loads(psql(port, role, "-c", statement, database))

    def versions(port, role, database="postgres"):
        return data_at(port, role, database, """SELECT jsonb_build_array(current_setting('server_version'),
          extensions.postgis_lib_version(),(SELECT extversion FROM pg_extension WHERE extname='postgis'))""")

    def archive(port, role, label):
        dump, roles = (output / f"{label}.{suffix}" for suffix in ("dump", "roles.sql"))
        run("pg_dump", "-w", *connection(port, role), "-d", "postgres", "-Fc", "--no-tablespaces", "-f", dump)
        run("pg_dumpall", "-w", *connection(port, role), "--roles-only", "--no-role-passwords", "-f", roles)
        return dump, roles

    def restore(port, role, database, dump):
        psql(port, role, "-c", f"CREATE DATABASE {database} OWNER postgres TEMPLATE template0")
        run("pg_restore", "-w", *connection(port, role), "-d", database,
            "--exit-on-error", "--single-transaction", dump)
        check(versions(port, role, database) == ["17.11", args.postgis, args.postgis], "Restored versions differ")

    source, target = 55524, 55525
    started = []
    try:
        # Both clusters give the built-in superuser the same name so the role
        # archive can reproduce GRANTED BY without changing the grantor.
        role = "bootstrap"
        for port, label in ((source, "source"), (target, "target")):
            with socket.socket() as probe:
                probe.bind(("127.0.0.1", port))
            data_dir = output / label
            run("initdb", "-D", data_dir, "--username=" + role, "--auth=trust", "--encoding=UTF8", "--locale=C")
            with (output / f"{label}.log").open("wb") as log:
                process = subprocess.Popen([binary("postgres"), "-D", str(data_dir), "-h", "127.0.0.1",
                                            "-p", str(port)], env=env, stdin=subprocess.DEVNULL,
                                           stdout=log, stderr=subprocess.STDOUT)
            started.append((data_dir, process))
            for attempt in range(60):
                result = subprocess.run([binary("pg_isready"), "-q", *connection(port, role), "-d", "postgres"],
                                        check=False, timeout=3, env=env)
                if result.returncode == 0:
                    break
                check(process.poll() is None and attempt < 59, f"Disposable cluster not ready: {data_dir}")
                sleep(0.3)
            identity = data_at(port, role, "postgres", """SELECT jsonb_build_array(
              current_user,inet_server_addr()::text,inet_server_port(),current_setting('data_directory'),
              current_setting('server_version_num'),pg_is_in_recovery())""")
            check(identity[:3] == [role, "127.0.0.1/32", port] or identity[:3] == [role, "127.0.0.1", port],
                  "Unexpected local PostgreSQL listener")
            check(Path(identity[3]).resolve() == data_dir.resolve() and identity[4:] == ["170011", False],
                  "Unexpected PostgreSQL data directory or version")

        psql(source, "bootstrap", "-c", AUTH_FIXTURE.replace("WITH SCHEMA extensions;",
            f"WITH SCHEMA extensions VERSION '{args.postgis}';", 1))
        observed_versions = versions(source, "bootstrap")
        check(observed_versions == ["17.11", args.postgis, args.postgis], "PostGIS extension or library version mismatch")
        prior = [ROOT / "baseline" / "0001_modelo_inicial.sql", *sorted((ROOT / "migrations").glob("000[6-8]_*.sql"))]
        updates = sorted((ROOT / "migrations").glob("0009_*.sql")) + sorted((ROOT / "migrations").glob("001[01]_*.sql"))
        check([path.name[:4] for path in updates] == ["0009", "0010", "0011"], "Unexpected migration files")
        for path in prior:
            psql(source, "postgres", "-f", path)
        psql(source, "bootstrap", "-c", FIXTURE)
        before = data_at(source, "bootstrap", "postgres", DATA)
        before_catalog = data_at(source, "bootstrap", "postgres", CATALOG)
        dump_before, roles_before = archive(source, "bootstrap", "0008")
        for path in updates:
            psql(source, "postgres", "-f", path)
        check(before == data_at(source, "bootstrap", "postgres", DATA), "Incremental migration modified fixture data")
        psql(source, "bootstrap", "-f", ROOT / "tests" / "import_security.sql")
        after_catalog = data_at(source, "bootstrap", "postgres", CATALOG)
        check(after_catalog["ledger"] == [f"{i:04d}" for i in range(1, 12)], "Incomplete migration ledger")
        dump_after, roles_after = archive(source, "bootstrap", "0011")

        # A separate cluster proves role recovery. The before-image is restored first.
        baseline_roles = output / "0008.roles-restore.sql"
        baseline_roles.write_text("\n".join(line for line in roles_before.read_text(encoding="utf8").splitlines()
                                            if line != "CREATE ROLE bootstrap;") + "\n", encoding="utf8")
        psql(target, "bootstrap", "-f", baseline_roles)
        restore(target, "bootstrap", "restored_0008", dump_before)
        check_catalog(before_catalog, data_at(target, "bootstrap", "restored_0008", CATALOG), "0008")
        check(before == data_at(target, "bootstrap", "restored_0008", DATA), "0008 data differs after restore")
        # Install only the delta roles from the later role backup, with their original attributes and membership.
        roles_delta = output / "0011.roles-delta.sql"
        prefix = ("CREATE ROLE sentinela_", "ALTER ROLE sentinela_", "GRANT sentinela_")
        roles_delta.write_text("\n".join(line for line in roles_after.read_text(encoding="utf8").splitlines()
                                         if line.startswith(prefix)) + "\n", encoding="utf8")
        psql(target, "bootstrap", "-f", roles_delta)
        restored = "restored_0011"
        restore(target, "bootstrap", restored, dump_after)
        restored_catalog = data_at(target, "bootstrap", restored, CATALOG)
        check_catalog(after_catalog, restored_catalog, "0011")
        check(before == data_at(target, "bootstrap", restored, DATA), "0011 data differs after restore")
        indexes = restored_catalog["spatial_indexes"]
        check(indexes and all(index[-1] for index in indexes), "Missing or invalid restored GiST indexes")
        decision_acl = data_at(target, "bootstrap", restored, """SELECT jsonb_object_agg(rolename,
          has_function_privilege(rolename, 'sentinela_revisao.decidir(uuid,bigint,text,text,text)', 'EXECUTE'))
          FROM unnest(ARRAY['sentinela_local_admin', 'sentinela_local_operator', 'sentinela_local_analyst',
            'authenticated', 'anon', 'service_role']) AS roles(rolename)""")
        check(decision_acl == {"sentinela_local_admin": True, "sentinela_local_operator": False,
                               "sentinela_local_analyst": False, "authenticated": False, "anon": False,
                               "service_role": False}, "Restored review decision ACL differs from the institutional rule")
        bound = data_at(target, "bootstrap", restored, """SELECT to_jsonb(
          sentinela_ambiente.vinculado() OR sentinela_ambiente.instalacao() IS NOT NULL)""")
        check(bound is False, "Restored installation accepted an unapproved database OID")
        spatial = data_at(target, "bootstrap", restored, """SELECT to_jsonb(
          extensions.ST_Contains(limite,extensions.ST_SetSRID(extensions.ST_MakePoint(-47.5,-15.5),4326)))
          FROM sentinela.regioes_administrativas WHERE codigo_interno='RA-TESTE'""")
        check(spatial is True, "Restored geometry does not match its approved test point")

        files = [dump_before, roles_before, dump_after, roles_after]
        evidence = {
            "versions": observed_versions, "synthetic": True, "ledgers": [before_catalog["ledger"], after_catalog["ledger"]],
            "migration_sha256": {path.name: sha256(path.read_bytes()).hexdigest() for path in updates},
            "preserved_data_sha256": fingerprint(before),
            "restored_catalog_sha256": {"0008": fingerprint(before_catalog), "0011": fingerprint(restored_catalog)},
            "auth_accounts": len(before["auth"]), "institutional_links": len(before["links"]),
            "audit_events": len(before["audit"]), "restored_geometry_matches": spatial, "new_database_oid_refused": not bound,
            "restored_valid_gist_indexes": len(indexes), "restored_review_decision_acl": decision_acl,
            "archives": {file.name: {"bytes": file.stat().st_size, "sha256": sha256(file.read_bytes()).hexdigest()} for file in files},
        }
        (output / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf8")
        print(f"Backup and restore verified: {output / 'evidence.json'}", flush=True)
    finally:
        for data_dir, process in reversed(started):
            if process.poll() is None:
                run("pg_ctl", "-D", data_dir, "-m", "fast", "-w", "stop")
                process.wait(timeout=20)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.stderr) from error
