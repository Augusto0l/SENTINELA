"""SQL authorization tests with a SYNTHETIC Auth schema; NOT a GoTrue/Auth integration.

One rollback transaction on the already homologated LOCAL baseline. No real users,
database creation, passwords, remote connections or persistent application migrations.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--psql", default="psql")
    args = parser.parse_args()
    command = [args.psql, "-X", "-w", "-h", "localhost", "-p", "5432", "-U", "postgres",
               "-d", "sentinela_model_test_supabase21", "-v", "ON_ERROR_STOP=1"]
    env = dict(os.environ, PGCLIENTENCODING="UTF8")

    def query(sql):
        return subprocess.run(command + ["-qAt", "-c", sql], check=True, capture_output=True, encoding="utf-8", env=env).stdout.strip()

    before = json.loads(query("SELECT json_build_array(current_database(),host(inet_server_addr()),inet_server_port(),"
        "(SELECT count(*) FROM sentinela.schema_migrations),"
        "(SELECT count(*) FROM pg_namespace WHERE nspname IN ('auth','sentinela_api','sentinela_private')),"
        "(SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')))"))
    assert before[0] == "sentinela_model_test_supabase21" and before[1] in ("::1", "127.0.0.1") and before[2:] == [5432, 5, 0, 0], before
    source = (ROOT / "supabase" / "migrations" / "0006_auth_vinculo_acesso.sql").read_text(encoding="utf-8")
    assert source.count("BEGIN;") == 1 and source.endswith("COMMIT;\n")
    # Test the exact migration statements inside an OUTER rollback instead of committing.
    migration = source.replace("BEGIN;", "", 1).removesuffix("COMMIT;\n")
    fixture = """BEGIN;
CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE service_role NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
"""
    tests = (ROOT / "supabase" / "tests" / "auth_consistencia.sql").read_text(encoding="utf-8")
    directory = ROOT.parent / "tmp"
    directory.mkdir(exist_ok=True)
    path = directory / "auth22-rollback.sql"
    path.write_text(fixture + migration + tests + "\nROLLBACK;\n", encoding="utf-8")
    result = subprocess.run(command + ["-f", str(path)], encoding="utf-8", capture_output=True, env=env)
    print(result.stdout)
    if result.stderr:
        print(result.stderr)
    # Also on failure the closed connection rolls back. Check no fixture objects/roles remain.
    after = json.loads(query("SELECT json_build_array((SELECT count(*) FROM sentinela.schema_migrations),"
        "(SELECT count(*) FROM pg_namespace WHERE nspname IN ('auth','sentinela_api','sentinela_private')),"
        "(SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))," 
        "(SELECT count(*) FROM sentinela.usuarios),(SELECT count(*) FROM sentinela.eventos_auditoria))"))
    assert after == [5, 0, 0, 0, 0], after
    if result.returncode:
        raise SystemExit(result.returncode)
    assert "ROLLBACK" in result.stdout
    print("OK local synthetic Auth SQL tests; rollback verified; no accounts/roles/schema persisted. NOT hosted Auth certification.")


if __name__ == "__main__":
    main()
