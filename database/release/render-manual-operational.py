"""Render local-manual-0004 for the operational PostgreSQL. This command never connects to a database."""

from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path
import re

RELEASE = Path(__file__).resolve().parent
REPO = RELEASE.parents[1]
TEMPLATE = RELEASE / "manual-occurrences-operational.psql.in"
INVENTORY = REPO / "docs/catalogos/naturezas-manuais-candidatas-v1.json"
CATALOG = REPO / "docs/catalogos/pcdf-naturezas-xml-v1.json"
INVENTORY_SHA256 = "ef6ea604d4e1ad85ccaa0016ab383b4d853e5a537a8171b8be94fe0f45e28fa8"
CATALOG_SHA256 = "df4e3a2be54102ec87c93b84723e1e0c3902808c397de5402dcc966ff6de2567"
XML_SHA256 = "faf82ae0620fa3ecc53bc002d9c2e49b24b6ec0126a44449510d12948dc0a022"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def checked(path, digest):
    raw = path.read_bytes()
    require(sha256(raw).hexdigest() == digest, f"SHA-256 divergente em {path.name}")
    return json.loads(raw)


def natures():
    inventory = checked(INVENTORY, INVENTORY_SHA256)
    catalog = checked(CATALOG, CATALOG_SHA256)
    require(catalog["fonte"]["sha256"] == XML_SHA256, "Procedência do XML PCDF divergente")
    records = inventory["registros"]
    require(len(records) == 41 and [r["descricaoOriginal"] for r in records] == catalog["naturezas"],
            "Inventário e catálogo PCDF divergem")
    rows = []
    for index, record in enumerate(records, 1):
        # The inventory declares no issuer code and no institutional approval; keep both facts.
        require(record["idInterno"] == f"PCDF-N-{index:02d}" and record["codigoOriginal"] is None
                and record["usoManual"] is False and record["situacao"] == "pendente",
                f"Registro inesperado no inventário: {record['idInterno']}")
        rows.append({"codigo": record["idInterno"], "descricao": record["descricaoOriginal"]})
    return rows


def render():
    template = TEMPLATE.read_text(encoding="utf-8")
    payload = json.dumps(natures(), ensure_ascii=False, separators=(",", ":"))
    require("$dados$" not in payload, "Marcador SQL reservado no catálogo")
    replacements = {"__NATURES_JSON__": payload, "__CATALOG_SHA256__": CATALOG_SHA256,
                    "__INVENTORY_SHA256__": INVENTORY_SHA256, "__XML_SHA256__": XML_SHA256}
    for marker, value in replacements.items():
        require(template.count(marker) == 1, f"Marcador ausente ou repetido: {marker}")
        template = template.replace(marker, value)
    require(not re.search(r"__[A-Z_]+__", template), "Marcador não substituído")
    return template


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--saida", required=True, type=Path, help="arquivo novo em UTF-8")
    args = parser.parse_args()
    try:
        sql = render().encode("utf-8")
        with args.saida.open("xb") as output:
            output.write(sql)
        print(sha256(sql).hexdigest())
    except (ValueError, OSError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
