"""Build the SENTINELA classification proposal v2 from the 68-month joint matrix. No database access.

Writes docs/catalogos/sentinela-classificacao-v2.json. Every rule is a PROPOSAL; none is homologated here.
Levels:
  direta       PCDF label equals the requested category label and the nature is that same offence.
  documentada  pair explicitly documented by the PCDF report (05_ESTUPRO split by original nature).
  revisada     legal variant (qualified form, aggravating cause or related offence) technically reviewed.
  complementar the nature is a distinct offence; a complementary category is proposed instead of the PCDF group.
  ambigua      the original text cannot decide the category; the rule is stored as 'conflitante' (no category).
"""
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
CATALOGS = REPO / "docs" / "catalogos"
inventory = json.loads((CATALOGS / "pcdf-inventario-v1.json").read_text(encoding="utf-8"))
correspondences = json.loads((CATALOGS / "pcdf-correspondencias-v1.json").read_text(encoding="utf-8"))
matrix = json.loads((CATALOGS / "pcdf-matriz-conjunta-2021-2026.json").read_text(encoding="utf-8"))
assert matrix["totais"]["paresAmbiguos"] == 0 and matrix["totais"]["associacoes"] == 369660

categories = [{"codigoInterno": f"SEN-CAT-{i:02d}", "nome": item["name"], "rotuloRelatorio": item["reportedLabel"],
               "origem": "contrato-secao-5.2", "status": "pendente"} for i, item in enumerate(inventory["requestedCategories"], 1)]
COMPLEMENTARY = [
    ("SEN-CAT-21", "Associação para o tráfico de drogas", "Lei 11.343/06, art. 35: crime autônomo, distinto do tráfico (art. 33)."),
    ("SEN-CAT-22", "Artefato explosivo ou incendiário", "Lei 10.826/03, art. 16, §1º, III: artefato explosivo não é arma de fogo."),
    ("SEN-CAT-23", "Roubo em propriedade rural", "Chácara, sítio ou fazenda não equivale necessariamente a residência."),
]
categories += [{"codigoInterno": code, "nome": name, "rotuloRelatorio": None, "origem": "complementar-proposta",
                "fundamento": basis, "status": "pendente"} for code, name, basis in COMPLEMENTARY]
by_label = {c["rotuloRelatorio"]: c["codigoInterno"] for c in categories if c["rotuloRelatorio"]}
by_name = {c["nome"]: c["codigoInterno"] for c in categories}
DOCUMENTED = {(e["original"], e["pcdfCategory"]): by_name[e["requested"]] for e in inventory["documentedExamples"]}

# Explicit technical review of every nature that is not the literal offence named by its PCDF group.
REVIEW = {
    "DESCUMPRIR DECISÃO JUDICIAL QUE DEFERE MEDIDAS PROTETIVAS DE URGÊNCIA PREVISTAS NA LEI 11.340/2006":
        ("revisada", by_name["Violência doméstica"], "Lei 11.340/06, art. 24-A: crime da própria Lei Maria da Penha, no contexto de violência doméstica."),
    "ASSOCIACAO PARA O FIM DE TRAFICO DE SUBSTANCIA ENTORPECENTE":
        ("complementar", "SEN-CAT-21", "Crime autônomo (art. 35); não é tráfico em sentido estrito."),
    "POSSUIR, DETIVER, FABRICAR OU EMPREGAR ARTEFATO EXPLOSIVO OU INCENDIÁRIO, SEM AUTORIZAÇÃO OU EM DESACORDO COM DETERMINAÇÃO LEGAL OU REGULAMENTAR":
        ("complementar", "SEN-CAT-22", "Artefato explosivo ou incendiário não é arma de fogo."),
    "ROUBO EM CHÁCARA, SÍTIO OU FAZENDA":
        ("complementar", "SEN-CAT-23", "Imóvel rural; a PCDF agrupa em 20_ROUBO EM RESIDÊNCIA, mas o texto não garante residência."),
    "PORTE DE ARMA":
        ("ambigua", None, "Rótulo genérico: não distingue arma de fogo de arma branca ou outro objeto."),
    "ESTUPRO COLETIVO": ("revisada", by_name["Estupro"], "Código Penal, art. 226, IV, a: causa de aumento do estupro."),
    "ESTUPRO CORRETIVO": ("revisada", by_name["Estupro"], "Código Penal, art. 226, IV, b: causa de aumento do estupro."),
    "ESTUPRO COM RESULTADO MORTE": ("revisada", by_name["Estupro"], "Código Penal, art. 213, §2º: forma qualificada do estupro."),
    "TRÁFICO PRIVILEGIADO": ("revisada", by_name["Tráfico de drogas"], "Lei 11.343/06, art. 33, §4º: forma privilegiada do tráfico."),
    "TRÁFICO INTERNACIONAL DE SUBSTANCIA ENTORPECENTE": ("revisada", by_name["Tráfico de drogas"], "Lei 11.343/06, art. 40, I: causa de aumento do tráfico."),
    "TRÁFICO DE DROGAS PREVALECENDO-SE DE FUNÇÃO PÚBLICA": ("revisada", by_name["Tráfico de drogas"], "Lei 11.343/06, art. 40, II: causa de aumento do tráfico."),
}
ids = {row["natureza"]: row["id"] for row in correspondences["linhas"]}
assert len(ids) == 41 and set(REVIEW) <= set(ids)

rules = []
for t in matrix["triplas"]:
    nature, pcdf = t["natureza_original"], t["categoria_pcdf"]
    if (nature, pcdf) in DOCUMENTED:
        level, target, reason = "documentada", DOCUMENTED[(nature, pcdf)], "Correspondência explícita no relatório PCDF."
    elif nature in REVIEW:
        level, target, reason = REVIEW[nature]
    else:
        level, target, reason = "direta", by_label[pcdf], "A natureza é o próprio crime nomeado pelo rótulo PCDF (seção 5.2)."
    rules.append({"id": ids[nature], "naturezaOriginal": nature, "crimeTentado": t["crime_tentado"], "categoriaPcdf": pcdf,
                  "categoriaProposta": target, "nivel": level, "statusRegra": "conflitante" if level == "ambigua" else "homologavel",
                  "associacoes2021_2026": t["associacoes"], "competencias": t["competencias"], "justificativa": reason})
rules.sort(key=lambda r: (r["id"], r["crimeTentado"]))
assert {r["naturezaOriginal"] for r in rules} == set(ids) and len(rules) == 43
levels = ("direta", "documentada", "revisada", "complementar", "ambigua")
summary = {lv: {"regras": sum(r["nivel"] == lv for r in rules),
                "associacoes": sum(r["associacoes2021_2026"] for r in rules if r["nivel"] == lv)} for lv in levels}
assert sum(v["associacoes"] for v in summary.values()) == 369660
document = {"versao": "sentinela-classificacao-v2", "status": "proposta-sem-homologacao",
            "fontes": {"matriz": matrix["versao"], "sha256Triplas": matrix["sha256Triplas"]},
            "observacoes": ["Em 68 competências, cada par (natureza, tentativa) tem uma única categoria PCDF.",
                            "Somente homicídio e feminicídio têm crime_tentado = SIM; qualquer outro par tentado é desconhecido e fica pendente."],
            "categorias": categories, "resumo": summary, "regras": rules}
(CATALOGS / "sentinela-classificacao-v2.json").write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n",
                                                          encoding="utf-8", newline="\n")
print(json.dumps(summary, ensure_ascii=False))
