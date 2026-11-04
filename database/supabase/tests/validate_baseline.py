"""Static SQL/PLpgSQL and AST equivalence checks. No database connection."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--parser-path", type=Path)
options = parser.parse_args()
if options.parser_path:
    sys.path.insert(0, str(options.parser_path.resolve()))
try:
    from pglast import ast, parse_sql, parse_plpgsql
    from pglast import parser as pgparser
    from pglast.stream import RawStream
except ImportError as exc:
    raise SystemExit("Use the separate pglast tooling environment; see database/README.md") from exc
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import baseline


def normalize(value):
    if isinstance(value, dict):
        return {k: normalize(v) for k, v in value.items()
                if not k.endswith("location") and k not in ("stmt_len", "rexpr_list_start", "rexpr_list_end")}
    if isinstance(value, list):
        if (len(value) >= 2 and value[0] == {"String": {"sval": "public"}}
                and isinstance(value[1], dict) and "String" in value[1]
                and re.fullmatch(r"geometry|st_[a-z0-9_]+", value[1]["String"]["sval"], re.I)):
            value = [{"String": {"sval": "extensions"}}, *value[1:]]
        return [normalize(v) for v in value]
    if isinstance(value, str):
        value = re.sub(r"\bpublic\.(geometry|ST_[A-Za-z0-9_]+)\b", r"extensions.\1", value)
        for action in ("ENABLE", "FORCE"):
            value = value.replace(f"    EXECUTE format('ALTER TABLE sentinela.%I {action} ROW LEVEL SECURITY', t);\n", "")
        return value
    return value


def model_ast(sql):
    result = []
    for raw in json.loads(pgparser.parse_sql_json(sql))["stmts"]:
        statement = raw["stmt"]
        if any(key in statement for key in ("TransactionStmt", "VariableSetStmt", "CreateExtensionStmt")):
            continue
        if "DoStmt" in statement and "Esta baseline requer PostGIS em public" in json.dumps(statement):
            continue
        result.append(normalize(statement))
    return result


def main():
    baseline.check()
    sql = baseline.TARGET.read_text(encoding="utf-8")
    nodes = parse_sql(sql)
    assert nodes[0].stmt.kind.name == "TRANS_STMT_BEGIN"
    assert nodes[-1].stmt.kind.name == "TRANS_STMT_COMMIT"
    assert sum(isinstance(n.stmt, ast.TransactionStmt) for n in nodes) == 2
    assert not re.search(r"\bpublic\.(?:geometry|ST_)", sql, re.I)
    assert not re.search(r"\b(?:CREATE|ALTER|DROP)\s+EXTENSION\b", sql, re.I)
    procedures = 0
    for raw in nodes:
        node = raw.stmt
        assert not isinstance(node, ast.CreatePolicyStmt), "Policies must stay closed"
        if isinstance(node, ast.GrantStmt):
            assert not node.is_grant, "Application grants are forbidden"
        if isinstance(node, ast.CreateFunctionStmt):
            assert not any(o.defname == "security" and o.arg.boolval for o in node.options)
            language = next((o.arg.sval for o in node.options if o.defname == "language"), "")
            if language == "plpgsql":
                parse_plpgsql(RawStream()(node))
                procedures += 1
        elif isinstance(node, ast.DoStmt):
            parse_plpgsql(RawStream()(node))
            procedures += 1
    for path in baseline.source_files():
        start = f"-- SOURCE-BEGIN {path.name}\n"
        end = f"-- SOURCE-END {path.name}\n"
        section = sql.split(start)[1].split(end)[0]
        assert model_ast(path.read_text(encoding="utf-8")) == model_ast(section), path.name
        print(f"OK independent AST equivalence: {path.name} (allowlisted spatial/installation differences)")
    statements = [raw.stmt for raw in nodes]
    assert sum(isinstance(n, ast.CreateStmt) for n in statements) == 19
    assert sum(isinstance(n, ast.IndexStmt) for n in statements) == 38
    assert sql.count("NOT VALID;") == 2
    assert sql.index("INSERT INTO sentinela.schema_migrations VALUES ('0005'") < sql.index("DO $finalize$")
    assert "ENABLE ROW LEVEL SECURITY" in baseline.FINALIZE
    assert "FORCE ROW LEVEL SECURITY" in baseline.FINALIZE
    print(f"OK single transaction, 19 tables, 38 explicit indexes, 2 NOT VALID checks, {procedures} procedural bodies")
    print("OK unchanged sources/checksums; no extension DDL, policies, grants or SECURITY DEFINER")
    print("Limit: static checks do not certify Supabase operation, privileges or PostGIS 3.3.7")


if __name__ == "__main__":
    main()
