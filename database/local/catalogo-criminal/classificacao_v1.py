"""Build the SENTINELA classification proposal v1 from the January/2021 joint matrix. No database access.

Writes docs/catalogos/sentinela-classificacao-v1.json. Nothing here is a homologation: every rule is a proposal.
Levels:
  direta         PCDF category label equals the label of the requested SENTINELA category (report section 5.2).
  documentada    pair explicitly documented by the PCDF report (05_ESTUPRO split by original nature).
  semantica      PCDF groups the nature under a category whose name does not describe it; needs a decision.
  nao_observada  nature without January/2021 rows; the joint matrix gives no evidence.
Only 'direta' and 'documentada' rules may be activated in the disposable-clone rehearsal.
"""
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
CATALOGS = REPO / "docs" / "catalogos"
inventory = json.loads((CATALOGS / "pcdf-inventario-v1.json").read_text(encoding="utf-8"))
correspondences = json.loads((CATALOGS / "pcdf-correspondencias-v1.json").read_text(encoding="utf-8"))
matrix = json.loads((CATALOGS / "pcdf-matriz-conjunta-2021-01.json").read_text(encoding="utf-8"))

categories = [{"codigoInterno": f"SEN-CAT-{index:02d}", "nome": item["name"], "rotuloRelatorio": item["reportedLabel"],
               "status": "pendente"} for index, item in enumerate(inventory["requestedCategories"], 1)]
by_label = {item["rotuloRelatorio"]: item for item in categories}
by_name = {item["nome"]: item for item in categories}
DOCUMENTED = {(example["original"], example["pcdfCategory"]): by_name[example["requested"]]
              for example in inventory["documentedExamples"]}
SEMANTIC = {
    "DESCUMPRIR DECISÃO JUDICIAL": "Crime autônomo (art. 24-A da Lei 11.340/06) agrupado pela PCDF em 112. "
                                   "Confirmar se integra 'Violência doméstica' ou exige categoria própria.",
    "ASSOCIACAO PARA O FIM DE TRAFICO": "Crime autônomo (art. 35 da Lei 11.343/06) agrupado em 89. "
                                        "Confirmar se integra 'Tráfico de drogas'.",
    "POSSUIR, DETIVER, FABRICAR OU EMPREGAR ARTEFATO EXPLOSIVO": "Artefato explosivo não é arma de fogo. "
                                        "Decidir entre categoria própria ou sem correspondência.",
    "PORTE DE ARMA": "Rótulo genérico: não distingue arma de fogo de outras armas, mas a categoria é 'arma de fogo'.",
    "ROUBO EM CHÁCARA, SÍTIO OU FAZENDA": "Imóvel rural agrupado em 20. Confirmar o enquadramento em 'Roubo em residência'.",
}
ids = {row["natureza"]: row["id"] for row in correspondences["linhas"]}
assert len(ids) == 41


def semantic_reason(nature):
    return next((reason for prefix, reason in SEMANTIC.items() if nature == prefix or nature.startswith(prefix)), None)


rules = []
for triple in matrix["triplas"]:
    nature, pcdf, attempt = triple["natureza_original"], triple["categoria_pcdf"], triple["crime_tentado"]
    target, level, reason = by_label.get(pcdf), "direta", "Rótulo PCDF idêntico ao da categoria prevista (seção 5.2)."
    if (nature, pcdf) in DOCUMENTED:
        target, level, reason = DOCUMENTED[(nature, pcdf)], "documentada", "Correspondência explícita no relatório PCDF."
    elif semantic_reason(nature):
        level, reason = "semantica", semantic_reason(nature)
    assert target is not None, f"categoria PCDF sem categoria prevista: {pcdf}"
    rules.append({"id": ids[nature], "naturezaOriginal": nature, "crimeTentado": attempt, "categoriaPcdf": pcdf,
                  "categoriaProposta": target["codigoInterno"], "nivel": level,
                  "ativavelNoEnsaio": level in ("direta", "documentada"),
                  "associacoes2021_01": triple["associacoes"], "justificativa": reason})
observed = {rule["naturezaOriginal"] for rule in rules}
for nature, identifier in sorted(ids.items(), key=lambda item: item[1]):
    if nature not in observed:
        rules.append({"id": identifier, "naturezaOriginal": nature, "crimeTentado": None, "categoriaPcdf": None,
                      "categoriaProposta": None, "nivel": "nao_observada", "ativavelNoEnsaio": False,
                      "associacoes2021_01": 0, "justificativa": "Sem linhas em 2021-01; a matriz conjunta não traz evidência."})
rules.sort(key=lambda rule: (rule["id"], str(rule["crimeTentado"])))
summary = {level: {"regras": sum(r["nivel"] == level for r in rules),
                   "associacoes": sum(r["associacoes2021_01"] for r in rules if r["nivel"] == level)}
           for level in ("direta", "documentada", "semantica", "nao_observada")}
gaps = [
    "Somente homicídio e feminicídio têm categoria de tentativa. Tentativas de outros crimes não ocorreram em 2021-01 "
    "e não têm regra: decidir se usam a mesma categoria do crime consumado.",
    "'Violência doméstica' recebe o rótulo 112 (Lei Maria da Penha), que cobre violência contra a mulher; "
    "confirmar se o nome da categoria deve refletir esse recorte.",
    "05_ESTUPRO tem outras modalidades além das duas documentadas; o relatório exige validação para elas.",
    "As sete naturezas não observadas em 2021-01 dependem da matriz de outras competências.",
]
document = {"versao": "sentinela-classificacao-v1", "status": "proposta-sem-homologacao",
            "fontes": {"matriz": matrix["versao"], "sha256Triplas": matrix["sha256Triplas"], "inventario": inventory["version"],
                       "correspondencias": correspondences["versao"]},
            "categorias": categories, "resumo": summary, "lacunas": gaps, "regras": rules}
assert sum(item["associacoes"] for item in summary.values()) == matrix["totais"]["associacoesImportadas"]
(CATALOGS / "sentinela-classificacao-v1.json").write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n",
                                                          encoding="utf-8", newline="\n")
print(json.dumps(summary, ensure_ascii=False))
