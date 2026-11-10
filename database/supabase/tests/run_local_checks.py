"""Opt-in local regression. Requires TWO precreated, empty disposable databases.

Reference: no PostGIS installed (0001 installs it in public).
Target: only PostGIS already provisioned in extensions, no application objects.
Never creates/drops databases, changes authentication, or connects remotely.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import uuid

from compare_catalogs import snapshot

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--psql", default="psql")
    parser.add_argument("--reference-db", required=True)
    parser.add_argument("--supabase-db", required=True)
    args = parser.parse_args()
    for database in (args.reference_db, args.supabase_db):
        if not re.fullmatch(r"sentinela_model_test_[a-z0-9]+", database):
            raise SystemExit("Use explicitly named disposable local test databases with suffixes")
    assert args.reference_db != args.supabase_db
    env = dict(os.environ, PGCLIENTENCODING="UTF8")

    def run(database, sql=None, path=None, role=None, expected=0):
        command = [args.psql, "-X", "-w", "-h", "localhost", "-p", "5432", "-U", "postgres",
                   "-d", database, "-v", "ON_ERROR_STOP=1", "-qAt"]
        if role:
            command += ["-c", f"SET ROLE {role}"]
        if path:
            command += ["-f", str(path)]
        else:
            command += ["-c", sql]
        result = subprocess.run(command, capture_output=True, encoding="utf-8", env=env)
        if result.returncode != expected:
            raise RuntimeError(f"Local psql exit {result.returncode}, expected {expected}: {result.stderr}")
        return result

    # Validate both connections BEFORE performing any DDL in either database.
    for database in (args.reference_db, args.supabase_db):
        identity = json.loads(run(database, "SELECT json_build_array(current_database(),host(inet_server_addr()),inet_server_port())").stdout)
        assert identity[0] == database and identity[1] in ("::1", "127.0.0.1") and identity[2] == 5432
        assert run(database, "SELECT count(*) FROM pg_namespace WHERE nspname='sentinela'").stdout.strip() == "0"
        assert run(database, "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
            "WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%' "
            "AND c.relkind IN ('r','p','v','m','S','f') AND NOT EXISTS "
            "(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')").stdout.strip() == "0"
    assert run(args.reference_db, "SELECT count(*) FROM pg_extension WHERE extname='postgis'").stdout.strip() == "0"
    assert run(args.supabase_db, "SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='postgis'").stdout.strip() == "extensions"

    for path in sorted((ROOT / "migrations").glob("000[1-5]_*.sql")):
        run(args.reference_db, path=path)
        print(f"OK reference application: {path.name}")
    run(args.reference_db, path=ROOT / "tests" / "consistencia.sql")

    role = "sentinela_baseline21_" + uuid.uuid4().hex[:12]
    artifact = ROOT / "supabase" / "baseline" / "0001_modelo_inicial.sql"
    run(args.supabase_db, f"CREATE ROLE {role} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT; "
        f"GRANT CREATE ON DATABASE {args.supabase_db} TO {role}; GRANT USAGE ON SCHEMA extensions TO {role};")
    try:
        attributes = run(args.supabase_db, f"SELECT rolsuper OR rolbypassrls OR rolcanlogin FROM pg_roles WHERE rolname='{role}'").stdout.strip()
        assert attributes == "f"
        run(args.supabase_db, path=artifact, role=role)
        print("OK target installation as NOSUPERUSER/NOBYPASSRLS/NOLOGIN owner")
        # Even the owner must see zero seed rows after FORCE RLS.
        assert run(args.supabase_db, "SELECT count(*) FROM sentinela.perfis", role=role).stdout.strip() == "0"
        denied = run(args.supabase_db, "INSERT INTO sentinela.perfis VALUES ('Analista')", role=role, expected=1)
        assert "row-level security" in denied.stderr.lower() or "linha" in denied.stderr.lower()
        duplicate = run(args.supabase_db, path=artifact, role=role, expected=3)
        assert "nao reaplicar" in duplicate.stderr
        crossed = run(args.reference_db, path=artifact, expected=3)
        assert "nao reaplicar" in crossed.stderr
        original_on_target = run(args.supabase_db, path=next((ROOT / "migrations").glob("0001_*.sql")), expected=3)
        assert "requer PostGIS em public" in original_on_target.stderr
        print("OK FORCE RLS owner denial and duplicate installation rejection")
        # Reuse the frozen synthetic regression; translate ONLY spatial qualifications.
        regression = (ROOT / "tests" / "consistencia.sql").read_text(encoding="utf-8")
        regression = re.sub(r"\bpublic\.(geometry|ST_[A-Za-z0-9_]+)\b", r"extensions.\1", regression)
        regression_path = ROOT.parent / "tmp" / "supabase21-consistencia.sql"
        regression_path.parent.mkdir(exist_ok=True)
        regression_path.write_text(regression, encoding="utf-8")
        result = run(args.supabase_db, path=regression_path)
        # -q suppresses command tags; verify the whole catalog and row counts after exit.
        assert result.returncode == 0
        left = snapshot(args.psql, args.reference_db, "public")
        right = snapshot(args.psql, args.supabase_db, "extensions")
        assert left == right, [key for key in left if left[key] != right[key]]
        expected_counts = {"schema_migrations": 5, "perfis": 3, "permissoes": 6, "perfil_permissoes": 12}
        for table, _, _ in right["tables"]:
            assert int(run(args.supabase_db, f'SELECT count(*) FROM sentinela."{table}"').stdout) == expected_counts.get(table, 0), table
        assert run(args.supabase_db, "SELECT count(*) FROM pg_roles WHERE rolname='sentinela_teste_sem_acesso'").stdout.strip() == "0"
        print("OK 43 negative commands, RLS role test, deferred constraints, rollback and zero residual fixtures")
        print("OK complete normalized catalog parity with the local reference")
    finally:
        # Only this newly created, non-login fixture role is cleaned up. No DROP OWNED/CASCADE.
        # On failure, successfully committed application objects remain for diagnosis.
        run(args.supabase_db, f"REASSIGN OWNED BY {role} TO postgres; "
            f"REVOKE CREATE ON DATABASE {args.supabase_db} FROM {role}; "
            f"REVOKE USAGE ON SCHEMA extensions FROM {role}; DROP ROLE {role};")


if __name__ == "__main__":
    main()
