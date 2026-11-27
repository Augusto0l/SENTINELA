"""Render the idempotent catalog SQL from docs/catalogos/sentinela-classificacao-v2.json. No database access.

sql/0001_catalogo_proposta.sql   23 categories and 43 mappings as 'pendente' (proposal; no category on mappings).
sql/0003_homologacao_ensaio.sql  REHEARSAL ONLY: separate catalog version whose evidence states it is not an
                                 institutional homologation; 42 rules 'homologado' and the ambiguous one 'conflitante'.
Both refuse to run outside the disposable clone (127.0.0.1:55487 with a sandbox marker).
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
proposal = json.loads((REPO / "docs/catalogos/sentinela-classificacao-v2.json").read_text(encoding="utf-8"))
CATALOG, MAPPING = "sentinela-categorias-v2", "pcdf-classificacao-v2"
REHEARSAL_CATALOG, REHEARSAL_MAPPING = "sentinela-categorias-v2-ensaio", "pcdf-classificacao-v2-ensaio"
EVIDENCE = ("ENSAIO EM CLONE DESCARTAVEL 55487 - nao constitui homologacao institucional. "
            "Fonte: docs/catalogos/sentinela-classificacao-v2.json")
GUARD = """DO $guard$ BEGIN
  IF inet_server_port() <> 55487 OR inet_server_addr() <> inet '127.0.0.1'
     OR current_setting('sentinela.sandbox_uuid', true) IS NULL OR current_database() <> 'sentinela_pcdf_local' THEN
    RAISE EXCEPTION 'Script restrito ao clone descartavel 127.0.0.1:55487.';
  END IF;
END $guard$;
"""


def lit(text):
    assert "$t$" not in text
    return f"$t${text}$t$"


def nature(text):
    return (f"(SELECT id FROM sentinela.naturezas_criminais WHERE fonte='PCDF' AND descricao_original={lit(text)} "
            "AND categoria_pcdf_original IS NULL)")


rules, categories = proposal["regras"], proposal["categorias"]
assert len(categories) == 23 and len(rules) == 43
lines = ["-- Gerado por render_sql.py. Proposta sentinela-classificacao-v2: nenhuma regra homologada.",
         "\\set ON_ERROR_STOP on", "BEGIN;", GUARD,
         "CREATE TEMP TABLE catalogo_antes ON COMMIT DROP AS SELECT"
         f" (SELECT count(*) FROM sentinela.categorias_criminais WHERE versao_catalogo='{CATALOG}') AS categorias;"]
for item in categories:
    lines.append("INSERT INTO sentinela.categorias_criminais(codigo_interno,nome,versao_catalogo,status) "
                 f"VALUES ({lit(item['codigoInterno'])},{lit(item['nome'])},'{CATALOG}','pendente') ON CONFLICT DO NOTHING;")
for rule in rules:
    lines.append("INSERT INTO sentinela.mapeamentos_natureza(natureza_id,versao,crime_tentado,categoria_id,status) "
                 f"VALUES ({nature(rule['naturezaOriginal'])},'{MAPPING}',{str(rule['crimeTentado']).lower()},NULL,'pendente') "
                 "ON CONFLICT DO NOTHING;")
lines.append(f"""DO $post$ DECLARE antes record; BEGIN
  SELECT * INTO antes FROM catalogo_antes;
  IF (SELECT count(*) FROM sentinela.categorias_criminais WHERE versao_catalogo='{CATALOG}' AND status='pendente') <> 23
     OR (SELECT count(*) FROM sentinela.mapeamentos_natureza WHERE versao='{MAPPING}' AND status='pendente' AND categoria_id IS NULL) <> 43
     OR (SELECT count(DISTINCT natureza_id) FROM sentinela.mapeamentos_natureza WHERE versao='{MAPPING}') <> 41 THEN
    RAISE EXCEPTION 'Catalogo proposto divergente.';
  END IF;
  IF antes.categorias = 0 THEN
    INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,depois,justificativa) VALUES ('servico','sentinela-classificacao',
      'catalogo.classificacao.proposta_registrada', jsonb_build_object('catalogo','{CATALOG}','mapeamento','{MAPPING}',
      'categorias',23,'mapeamentosPendentes',43,'homologadas',0), 'Proposta de classificacao v2 sem homologacao (ensaio em clone).');
  END IF;
END $post$;""")
lines.append("COMMIT;")
(HERE / "sql").mkdir(exist_ok=True)
(HERE / "sql/0001_catalogo_proposta.sql").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")

active = [r for r in rules if r["statusRegra"] == "homologavel"]
ambiguous = [r for r in rules if r["statusRegra"] == "conflitante"]
used = sorted({r["categoriaProposta"] for r in active})
by_code = {item["codigoInterno"]: item for item in categories}
lines = ["-- Gerado por render_sql.py. ENSAIO: nao constitui homologacao institucional.", "\\set ON_ERROR_STOP on", "BEGIN;", GUARD]
for code in used:
    lines.append("INSERT INTO sentinela.categorias_criminais(codigo_interno,nome,versao_catalogo,status,evidencia_homologacao) "
                 f"VALUES ({lit(code)},{lit(by_code[code]['nome'])},'{REHEARSAL_CATALOG}','homologada',{lit(EVIDENCE)}) ON CONFLICT DO NOTHING;")
for rule in active:
    category = (f"(SELECT id FROM sentinela.categorias_criminais WHERE versao_catalogo='{REHEARSAL_CATALOG}' "
                f"AND codigo_interno={lit(rule['categoriaProposta'])})")
    lines.append("INSERT INTO sentinela.mapeamentos_natureza(natureza_id,versao,crime_tentado,categoria_id,status,evidencia_homologacao) "
                 f"VALUES ({nature(rule['naturezaOriginal'])},'{REHEARSAL_MAPPING}',{str(rule['crimeTentado']).lower()},{category},"
                 f"'homologado',{lit(EVIDENCE + ' Regra ' + rule['id'] + ' nivel ' + rule['nivel'] + '.')}) ON CONFLICT DO NOTHING;")
for rule in ambiguous:
    lines.append("INSERT INTO sentinela.mapeamentos_natureza(natureza_id,versao,crime_tentado,categoria_id,status) "
                 f"VALUES ({nature(rule['naturezaOriginal'])},'{REHEARSAL_MAPPING}',{str(rule['crimeTentado']).lower()},NULL,'conflitante') "
                 "ON CONFLICT DO NOTHING;")
lines.append(f"""DO $post$ BEGIN
  IF (SELECT count(*) FROM sentinela.categorias_criminais WHERE versao_catalogo='{REHEARSAL_CATALOG}') <> {len(used)}
     OR (SELECT count(*) FROM sentinela.mapeamentos_natureza WHERE versao='{REHEARSAL_MAPPING}' AND status='homologado') <> {len(active)}
     OR (SELECT count(*) FROM sentinela.mapeamentos_natureza WHERE versao='{REHEARSAL_MAPPING}' AND status='conflitante') <> {len(ambiguous)}
     OR EXISTS (SELECT FROM sentinela.mapeamentos_natureza m JOIN sentinela.categorias_criminais c ON c.id=m.categoria_id
                WHERE m.versao='{REHEARSAL_MAPPING}' AND c.versao_catalogo <> '{REHEARSAL_CATALOG}') THEN
    RAISE EXCEPTION 'Homologacao de ensaio divergente.';
  END IF;
END $post$;""")
lines.append("COMMIT;")
(HERE / "sql/0003_homologacao_ensaio.sql").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
print(json.dumps({"categorias": 23, "mapeamentosPropostos": 43, "categoriasEnsaio": len(used), "regrasHomologadas": len(active),
                  "regrasConflitantes": len(ambiguous)}))
