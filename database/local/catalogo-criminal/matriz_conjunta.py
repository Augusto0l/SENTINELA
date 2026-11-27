"""Extract the January/2021 joint matrix (original nature x PCDF category x attempt) from the disposable clone.

Read-only. Writes docs/catalogos/pcdf-matriz-conjunta-2021-01.json with aggregate counts only.
"""
import json
from hashlib import sha256
from pathlib import Path

from clone_db import query

REPO = Path(__file__).resolve().parents[3]
LOT = "84908630-bd04-4a03-923d-616649c8de74"

raw = query(f"""BEGIN READ ONLY;
SELECT jsonb_build_object(
 'lote', l.id, 'competencia', to_char(l.competencia,'YYYY-MM'), 'sha256Arquivo', l.sha256_arquivo,
 'associacoesImportadas', (SELECT count(*) FROM sentinela.ocorrencia_naturezas a JOIN sentinela.linhas_origem o ON o.id=a.linha_origem_id
                           WHERE o.extracao_id=l.extracao_id),
 'associacoesManuais', (SELECT count(*) FROM sentinela.ocorrencia_naturezas WHERE origem='manual'),
 'triplas', (SELECT jsonb_agg(row_to_json(m) ORDER BY m.natureza_original, m.categoria_pcdf, m.crime_tentado) FROM (
    SELECT o.natureza_original, o.natureza_padronizada_pcdf AS categoria_pcdf, o.crime_tentado AS crime_tentado_origem,
           bool_and(a.crime_tentado) AS crime_tentado, count(*) AS associacoes, count(DISTINCT a.ocorrencia_id) AS ocorrencias
    FROM sentinela.ocorrencia_naturezas a JOIN sentinela.linhas_origem o ON o.id=a.linha_origem_id
    WHERE o.extracao_id=l.extracao_id GROUP BY 1,2,3) m))
FROM sentinela.lotes_importacao l WHERE l.id='{LOT}';
ROLLBACK;""")
data = json.loads(raw.splitlines()[-1])
triples = data["triplas"]
assert sum(t["associacoes"] for t in triples) == data["associacoesImportadas"]
assert all(t["crime_tentado"] == (t["crime_tentado_origem"] == "SIM") for t in triples), "tentativa divergente entre origem e associação"
pairs = {(t["natureza_original"], t["crime_tentado"]) for t in triples}
assert len(pairs) == len(triples), "um par (natureza, tentativa) com mais de uma categoria PCDF"
document = {
    "versao": "pcdf-matriz-conjunta-2021-01",
    "fonte": {"lote": data["lote"], "competencia": data["competencia"], "sha256Arquivo": data["sha256Arquivo"],
              "ambiente": "clone descartável do PostgreSQL operacional local (leitura)"},
    "totais": {"associacoesImportadas": data["associacoesImportadas"], "associacoesManuais": data["associacoesManuais"],
               "triplas": len(triples), "naturezasObservadas": len({t["natureza_original"] for t in triples}),
               "categoriasPcdfObservadas": len({t["categoria_pcdf"] for t in triples})},
    "conclusao": "Cada par (natureza original, crime_tentado) corresponde a uma única categoria PCDF em 2021-01.",
    "triplas": triples,
}
document["sha256Triplas"] = sha256(json.dumps(triples, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
out = REPO / "docs" / "catalogos" / "pcdf-matriz-conjunta-2021-01.json"
out.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
print(json.dumps(document["totais"], ensure_ascii=False))
