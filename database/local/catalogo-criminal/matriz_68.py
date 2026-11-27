"""Aggregate the joint matrix (original nature x PCDF category x attempt) over the 68 monthly PCDF v2 CSVs.

Read-only. Every file must match the SHA-256, byte count and row count of the audited monthly inventory.
Writes docs/catalogos/pcdf-matriz-conjunta-2021-2026.json with aggregate counts only (no row values).
Usage: python -B matriz_68.py <directory with the 68 pcdf_naturezas_AAAA-MM.csv files>
"""
import csv
import json
import sys
from collections import Counter, defaultdict
from hashlib import sha256
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
INVENTORY = REPO / "docs/desenvolvimento/pcdf-inventario-mensal-2021-2026.csv"
if len(sys.argv) != 2:
    raise SystemExit(__doc__)
folder = Path(sys.argv[1])
inventory = list(csv.DictReader(INVENTORY.open(encoding="utf-8-sig", newline=""), delimiter=";"))
assert len(inventory) == 68

triples, months, natures_by_month = Counter(), defaultdict(set), defaultdict(Counter)
total = 0
for row in inventory:
    path = folder / row["arquivo"]
    raw = path.read_bytes()
    if sha256(raw).hexdigest() != row["sha256"] or len(raw) != int(row["bytes"]):
        raise SystemExit(f"Arquivo divergente da matriz auditada: {row['arquivo']}")
    reader = csv.DictReader(raw.decode("utf-8-sig").splitlines(), delimiter=";")
    count = 0
    for line in reader:
        key = (line["natureza_original"], line["natureza_padronizada_pcdf"], line["crime_tentado"])
        triples[key] += 1
        months[key].add(row["competencia"])
        natures_by_month[row["competencia"]][line["natureza_original"]] += 1
        count += 1
    if count != int(row["associacoes"]):
        raise SystemExit(f"Contagem divergente em {row['arquivo']}: {count} != {row['associacoes']}")
    declared = json.loads(row["naturezas_originais_json"])
    if dict(natures_by_month[row["competencia"]]) != declared:
        raise SystemExit(f"Naturezas divergentes em {row['arquivo']}")
    total += count

rows = [{"natureza_original": n, "categoria_pcdf": c, "crime_tentado_origem": t, "crime_tentado": t == "SIM",
         "associacoes": k, "competencias": len(months[(n, c, t)]), "primeira": min(months[(n, c, t)]),
         "ultima": max(months[(n, c, t)])} for (n, c, t), k in sorted(triples.items())]
pairs = defaultdict(set)
for row in rows:
    pairs[(row["natureza_original"], row["crime_tentado"])].add(row["categoria_pcdf"])
ambiguous = [{"natureza_original": n, "crime_tentado": t, "categorias_pcdf": sorted(c)} for (n, t), c in sorted(pairs.items()) if len(c) > 1]
document = {
    "versao": "pcdf-matriz-conjunta-2021-2026",
    "fonte": {"inventario": INVENTORY.name, "arquivos": 68, "verificacao": "SHA-256, bytes, linhas e naturezas por arquivo"},
    "totais": {"associacoes": total, "triplas": len(rows), "naturezas": len({r["natureza_original"] for r in rows}),
               "categoriasPcdf": len({r["categoria_pcdf"] for r in rows}),
               "valoresTentativa": sorted({r["crime_tentado_origem"] for r in rows}), "paresAmbiguos": len(ambiguous)},
    "paresAmbiguos": ambiguous,
    "triplas": rows,
}
document["sha256Triplas"] = sha256(json.dumps(rows, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
out = REPO / "docs/catalogos/pcdf-matriz-conjunta-2021-2026.json"
out.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
print(json.dumps(document["totais"], ensure_ascii=False))
