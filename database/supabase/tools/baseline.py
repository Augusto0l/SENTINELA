"""Build/check the Supabase installation artifact; never connects to a database."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "supabase" / "baseline" / "0001_modelo_inicial.sql"
MANIFEST = ROOT / "supabase" / "sources.json"

PREFLIGHT = """-- GENERATED from the frozen local migrations; see ../README.md and ../sources.json.
-- Initial installation ONLY. Never combine with database/migrations/0001-0005.
-- Does not install/move PostGIS, provision Auth, or grant application access.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog;
SELECT pg_catalog.pg_advisory_xact_lock(743204, 21);
DO $preflight$
DECLARE extension_version text;
BEGIN
  IF current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'PostgreSQL >= 15 requerido.';
  END IF;
  IF current_setting('server_encoding') <> 'UTF8' THEN
    RAISE EXCEPTION 'Banco UTF8 requerido.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'sentinela') THEN
    RAISE EXCEPTION 'Schema sentinela existente: nao reaplicar nem combinar baselines.';
  END IF;
  SELECT e.extversion INTO extension_version
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'postgis' AND n.nspname = 'extensions';
  IF extension_version IS NULL THEN
    RAISE EXCEPTION 'PostGIS deve estar previamente instalado em extensions; nenhuma extensao sera alterada.';
  END IF;
  IF (split_part(extension_version, '.', 1)::integer,
      split_part(extension_version, '.', 2)::integer) < (3, 3) THEN
    RAISE EXCEPTION 'PostGIS >= 3.3 requerido.';
  END IF;
  IF NOT has_schema_privilege(current_user, 'extensions', 'USAGE') THEN
    RAISE EXCEPTION 'Instalador precisa de USAGE em extensions.';
  END IF;
END $preflight$;
"""

FINALIZE = """
-- RLS is activated only AFTER all seeds, ledger entries and integrity checks.
-- One transaction: no intermediate state is committed. No temporary policies/bypass.
SET LOCAL search_path = pg_catalog;
DO $finalize$
DECLARE t text; r text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'sentinela' LOOP
    EXECUTE format('ALTER TABLE sentinela.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE sentinela.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
  -- Supabase roles may have direct/default grants independently of PUBLIC.
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA sentinela FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA sentinela FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA sentinela FROM %I', r);
      EXECUTE format('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA sentinela FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA sentinela REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA sentinela REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA sentinela REVOKE EXECUTE ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_class c
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(
      CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) a
    WHERE c.relnamespace='sentinela'::regnamespace AND c.relkind IN ('r','S') AND a.grantee<>c.relowner
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.pronamespace='sentinela'::regnamespace AND a.grantee<>p.proowner
  ) OR EXISTS (
    SELECT 1 FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
    WHERE n.nspname='sentinela' AND a.grantee<>n.nspowner
  ) THEN
    RAISE EXCEPTION 'ACL inesperada para terceiros: revisar defaults/event triggers antes de instalar.';
  END IF;
END $finalize$;
COMMENT ON SCHEMA sentinela IS 'sentinela:supabase-baseline-v1:logical-0001-0005';
COMMIT;
"""


def source_files():
    # Deliberately frozen: future 0006+ must NOT enter this initial baseline.
    return [next((ROOT / "migrations").glob(f"{version:04d}_*.sql")) for version in range(1, 6)]


def checked_replace(sql: str, old: str, new: str, count: int = 1) -> str:
    if sql.count(old) != count:
        raise ValueError(f"Unexpected source drift for {old!r}")
    return sql.replace(old, new)


def adapt(path: Path) -> str:
    sql = path.read_text(encoding="utf-8")
    if path.name.startswith("0001"):
        sql = checked_replace(sql,
            "-- Somente banco LOCAL vazio e descartavel. Aplicar na ordem; nao e um runner.",
            "-- Source model only: installation instructions are superseded by the Supabase preflight above.")
        start = sql.index("CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;")
        end = sql.index("CREATE SCHEMA sentinela;")
        sql = sql[:start] + sql[end:]
    # Qualified spatial references only; no global rewrite of other public objects.
    sql = re.sub(r"\bpublic\.(geometry|ST_[A-Za-z0-9_]+)\b", r"extensions.\1", sql)
    sql = checked_replace(sql, "BEGIN;", "", 1)
    sql = checked_replace(sql, "COMMIT;", "", 1)
    sql = checked_replace(sql, "SET LOCAL lock_timeout = '5s';", "", 1)
    sql = sql.replace("SET LOCAL search_path = sentinela, public, pg_catalog;",
                      "SET LOCAL search_path = pg_catalog, sentinela, extensions;")
    sql = sql.replace("SET LOCAL search_path = pg_catalog, sentinela, public;",
                      "SET LOCAL search_path = pg_catalog, sentinela, extensions;")
    if path.name.startswith("0004"):
        for action in ("ENABLE", "FORCE"):
            sql = checked_replace(sql,
                f"    EXECUTE format('ALTER TABLE sentinela.%I {action} ROW LEVEL SECURITY', t);\n", "")
    return sql.strip() + "\n"


def render() -> str:
    parts = [PREFLIGHT]
    for path in source_files():
        parts.extend([f"\n-- SOURCE-BEGIN {path.name}\n", adapt(path), f"-- SOURCE-END {path.name}\n"])
    parts.append(FINALIZE)
    return "".join(parts)


def digest(data: bytes) -> str:
    # Checksums represent repository text, independent of Windows checkout CRLF.
    return hashlib.sha256(data.replace(b"\r\n", b"\n")).hexdigest()


def manifest() -> dict:
    return {
        "format": 1,
        "baseline": "supabase-baseline-v1",
        "checksum_encoding": "UTF-8, LF (CRLF normalized)",
        "sources": {p.relative_to(ROOT).as_posix(): digest(p.read_bytes()) for p in source_files()},
        "artifact": {TARGET.relative_to(ROOT).as_posix(): digest(render().encode("utf-8"))},
        "logical_versions": ["0001", "0002", "0003", "0004", "0005"],
    }


def check() -> None:
    saved = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if saved != manifest():
        raise ValueError("Source/manifest drift: do not refresh frozen checksums silently")
    if TARGET.read_text(encoding="utf-8") != render():
        raise ValueError("Supabase artifact differs from the allowlisted adaptation")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Initial generation only; refuses existing artifact/manifest")
    options = parser.parse_args()
    if options.write:
        if TARGET.exists() or MANIFEST.exists():
            raise SystemExit("Frozen installation artifact already exists; create a reviewed new version instead")
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        TARGET.write_text(render(), encoding="utf-8", newline="\n")
        MANIFEST.write_text(json.dumps(manifest(), indent=2) + "\n", encoding="utf-8", newline="\n")
    check()
    print("OK frozen sources, manifest and deterministic Supabase artifact (no database access)")


if __name__ == "__main__":
    main()
