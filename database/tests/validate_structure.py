"""Analise estatica por AST PostgreSQL; nao substitui execucao PostgreSQL/PostGIS.

Requer pglast externo ao app. Exemplo:
python database/tests/validate_structure.py --parser-path tmp/sql-validation
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys

arguments = argparse.ArgumentParser(description=__doc__)
arguments.add_argument("--parser-path", type=Path)
options = arguments.parse_args()
if options.parser_path:
    sys.path.insert(0, str(options.parser_path.resolve()))
try:
    from pglast import ast, parse_sql, parse_plpgsql, parser
    from pglast.stream import RawStream
except ImportError as exc:
    raise SystemExit("Instale pglast em ambiente de ferramentas separado; ver database/README.md") from exc

ROOT = Path(__file__).resolve().parents[1]
tables: dict[str, dict] = {}
foreign_keys: list[tuple[str, tuple[str, ...], dict]] = []
indexes = 0
procedures = 0
functions = set()
triggers = {}


def names(values):
    return tuple(item["String"]["sval"] for item in values)


def constraint(table, data, column=None):
    kind = data["contype"]
    if kind in ("CONSTR_PRIMARY", "CONSTR_UNIQUE"):
        keys = (column,) if column else names(data["keys"])
        tables[table]["unique"].add(keys)
    elif kind == "CONSTR_FOREIGN":
        columns = (column,) if column else names(data["fk_attrs"])
        foreign_keys.append((table, columns, data))


def column(table, data):
    name = data["colname"]
    assert name not in tables[table]["columns"], (table, "coluna repetida", name)
    tables[table]["columns"][name] = names(data["typeName"]["names"])
    for item in data.get("constraints", []):
        constraint(table, item["Constraint"], name)


for path in sorted((ROOT / "migrations").glob("*.sql")):
    sql = path.read_text(encoding="utf-8")
    parsed = parse_sql(sql)
    assert isinstance(parsed[0].stmt, ast.TransactionStmt)
    assert parsed[0].stmt.kind.name == "TRANS_STMT_BEGIN"
    assert parsed[-1].stmt.kind.name == "TRANS_STMT_COMMIT"
    for raw in parsed:
        node = raw.stmt
        if isinstance(node, ast.CreateFunctionStmt):
            functions.add(tuple(item.sval for item in node.funcname))
            assert not any(o.defname == "security" and o.arg.boolval for o in node.options), "SECURITY DEFINER nao autorizado nesta etapa"
            language = next((o.arg.sval for o in node.options if o.defname == "language"), "")
            if language == "plpgsql":
                parse_plpgsql(RawStream()(node))
                procedures += 1
        elif isinstance(node, ast.DoStmt):
            parse_plpgsql(RawStream()(node))
            procedures += 1
        elif isinstance(node, ast.CreateTrigStmt):
            function = tuple(item.sval for item in node.funcname)
            assert function in functions, ("Funcao de trigger ainda nao declarada", function)
            triggers[(node.relation.relname, node.trigname)] = node
        elif isinstance(node, ast.CreatePolicyStmt):
            raise AssertionError("Baseline deve conservar RLS fechado, sem policies")
        elif isinstance(node, ast.GrantStmt):
            assert not node.is_grant, "Baseline nao deve liberar privilegios de aplicacao"
    document = json.loads(parser.parse_sql_json(sql))
    for raw in document["stmts"]:
        node = raw["stmt"]
        if "CreateStmt" in node:
            data = node["CreateStmt"]
            assert data["relation"]["schemaname"] == "sentinela"
            table = data["relation"]["relname"]
            assert table not in tables, ("tabela repetida", table)
            tables[table] = {"columns": {}, "unique": set()}
            for item in data["tableElts"]:
                if "ColumnDef" in item:
                    column(table, item["ColumnDef"])
                elif "Constraint" in item:
                    constraint(table, item["Constraint"])
        elif "AlterTableStmt" in node:
            data = node["AlterTableStmt"]
            table = data["relation"]["relname"]
            assert table in tables, ("ALTER de tabela inexistente", table)
            for item in data["cmds"]:
                command = item["AlterTableCmd"]
                if command["subtype"] == "AT_AddColumn":
                    column(table, command["def"]["ColumnDef"])
                elif command["subtype"] == "AT_AddConstraint":
                    constraint(table, command["def"]["Constraint"])
        elif "IndexStmt" in node:
            data = node["IndexStmt"]
            table = data["relation"]["relname"]
            assert table in tables, ("indice de tabela inexistente", table)
            for key in data["indexParams"]:
                name = key["IndexElem"].get("name")
                assert name is None or name in tables[table]["columns"], (table, name)
            indexes += 1
    print(f"OK sintaxe SQL/PLpgSQL: {path.name} ({len(parsed)} instrucoes)")

for table, columns, data in foreign_keys:
    target = data["pktable"]["relname"]
    assert data["pktable"]["schemaname"] == "sentinela"
    assert target in tables, ("FK destino inexistente", table, target)
    target_columns = names(data["pk_attrs"])
    assert target_columns in tables[target]["unique"], ("FK sem chave unica", table, target, target_columns)
    assert len(columns) == len(target_columns)
    for source_column, target_column in zip(columns, target_columns):
        assert tables[table]["columns"][source_column] == tables[target]["columns"][target_column], (
            "Tipos FK incompativeis", table, source_column, target, target_column)
    assert data.get("fk_del_action", "a") not in ("c", "n", "d"), ("FK destrutiva", table, target)

for (table, name), trigger in triggers.items():
    assert table in tables, ("Tabela de trigger inexistente", table, name)
for table in ("ocorrencias", "ocorrencia_naturezas", "linhas_staging"):
    trigger = triggers[(table, "correcao_exige_historico")]
    assert trigger.isconstraint and trigger.deferrable and trigger.initdeferred
for table in ("ocorrencias", "ocorrencia_naturezas", "linhas_staging", "pendencias_revisao", "historico_correcoes"):
    assert not triggers[(table, "escrita_correcao_bloqueada")].row, "Trava deve bloquear inclusive statements sem linhas"
assert triggers[("pendencias_revisao", "pendencia_exige_evento")].deferrable
assert tables["historico_correcoes"]["columns"]["transacao_id"] == ("xid8",)
assert tables["eventos_auditoria"]["columns"]["transacao_id"] == ("xid8",)
print("OK protecoes declaradas: triggers/ordem, auditoria diferida, trava por statement, sem grants/policies/SECURITY DEFINER.")

for path in sorted((ROOT / "tests").glob("*.sql")):
    sql = path.read_text(encoding="utf-8")
    statements = parse_sql(sql)
    for raw in statements:
        if isinstance(raw.stmt, (ast.CreateFunctionStmt, ast.DoStmt)):
            parse_plpgsql(RawStream()(raw.stmt))
    assert statements[-1].stmt.kind.name == "TRANS_STMT_ROLLBACK"
    print(f"OK sintaxe da regressao (nao executada): {path.name}")
    # EXECUTE/format do helper nao e analisado pelo parser do corpo PL/pgSQL.
    # Conferir tambem o SQL dinamico com substitutos lexicais, sem executar valores.
    templates = re.findall(r"PERFORM pg_temp\.esperar_erro\(format\(\s*'((?:''|[^'])*)'", sql)
    commands = re.findall(r"PERFORM pg_temp\.esperar_erro\(\s*'((?:''|[^'])*)'", sql)
    for template in templates:
        command = template.replace("''", "'")
        command = command.replace("%L", "'00000000-0000-0000-0000-000000000001'").replace("%s", "1")
        parse_sql(command)
    for command in commands:
        parse_sql(command.replace("''", "'"))
    print(f"OK sintaxe de {len(templates) + len(commands)} comandos negativos dinamicos (sem execucao).")

print(f"OK estrutura: {len(tables)} tabelas, {len(foreign_keys)} FKs, {indexes} indices, {procedures} corpos procedurais.")
print("Limite: sem resolucao de funcoes PostGIS, execucao de triggers, planos ou prova runtime de RLS.")
