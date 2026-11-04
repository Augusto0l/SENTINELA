"""Read-only comparison of two LOCAL disposable databases; no environment URLs."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parent


def query(psql, database, sql):
    if not re.fullmatch(r"sentinela_model_test(?:_[a-z0-9]+)?", database):
        raise ValueError("Only explicitly named local disposable databases are allowed")
    result = subprocess.run([psql, "-X", "-w", "-h", "localhost", "-p", "5432", "-U", "postgres",
                             "-d", database, "-v", "ON_ERROR_STOP=1", "-qAt", "-c", sql],
                            check=True, capture_output=True, encoding="utf-8",
                            env=dict(os.environ, PGCLIENTENCODING="UTF8"))
    return result.stdout.strip()


def normalize(value):
    if isinstance(value, str):
        return re.sub(r"\b(?:public|extensions)\.(geometry|st_[a-z0-9_]+)\b", r"postgis.\1", value, flags=re.I)
    if isinstance(value, list):
        return [normalize(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize(item) for key, item in value.items()}
    return value


def normalize_function_definition(definition):
    """Normalize only line terminators; preserve every other character."""
    return definition.replace("\r\n", "\n").replace("\r", "\n")


def normalize_catalog(catalog):
    normalized = normalize(catalog)
    # catalog_snapshot.sql: functions = [name, identity arguments,
    # pg_get_functiondef, security definer, config]. No other field gets EOL normalization.
    for function in normalized["functions"]:
        function[2] = normalize_function_definition(function[2])
    return normalized


def snapshot(psql, database, expected_schema):
    identity = json.loads(query(psql, database, "SELECT json_build_array(current_database(),host(inet_server_addr()),inet_server_port(),"
        "(SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='postgis'))"))
    assert identity == [database, "::1", 5432, expected_schema] or identity == [database, "127.0.0.1", 5432, expected_schema], identity
    return normalize_catalog(json.loads(query(psql, database, (ROOT / "catalog_snapshot.sql").read_text(encoding="utf-8"))))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--psql", default="psql")
    parser.add_argument("--local-db", required=True)
    parser.add_argument("--supabase-db", required=True)
    args = parser.parse_args()
    assert args.local_db != args.supabase_db
    left = snapshot(args.psql, args.local_db, "public")
    right = snapshot(args.psql, args.supabase_db, "extensions")
    differences = [key for key in left if left[key] != right[key]]
    if differences:
        raise SystemExit("Catalog mismatch: " + ", ".join(differences))
    assert len(right["tables"]) == 19 and all(row[1:] == [True, True] for row in right["tables"])
    assert len(right["indexes"]) == 77 and all(row[2:] == [True, True] for row in right["indexes"])
    assert len(right["triggers"]) == 55 and all(row[-1] == "O" for row in right["triggers"])
    assert sum(row[2] == "f" for row in right["constraints"]) == 34
    assert sum(not row[4] for row in right["constraints"]) == 2
    for key in ("policies", "table_external_acl", "function_external_acl", "schema_external_acl"):
        assert right[key] == [], key
    print("OK LOCAL catalog parity: tables, columns/defaults, domains, constraints/FKs, indexes, triggers, functions and ACLs")
    print("OK 19 FORCE RLS tables, 34 FKs, 77 indexes, 55 triggers, 2 intentional NOT VALID checks, zero policies/external grants")
    print("Limit: extension schema and function definition EOLs normalized; owners/OIDs/timestamps excluded; not a Supabase certification")


if __name__ == "__main__":
    main()
