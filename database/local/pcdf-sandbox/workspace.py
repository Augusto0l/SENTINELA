"""Read one synthetic CSV from stdin and emit the staging payload."""
import json
import sys

from pipeline import InvalidFile, MAX_BYTES, XML_FIXTURE, XML_SHA, prepare_csv


def prepare_synthetic(content, month):
    batch = prepare_csv(content, month)
    for row in batch["rows"]:
        raw = row["raw"]
        if (raw["versao_tratamento"] != "sandbox-fixture-v1"
            or raw["linha_origem_id"] != f"{XML_SHA}:NATUREZAS:{raw['linha_xml']}"):
            raise InvalidFile("proveniencia_sintetica_invalida")
    return {"batch": batch, "xmlSha": XML_SHA, "xmlSize": len(XML_FIXTURE)}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(2)
    try:
        document = prepare_synthetic(sys.stdin.buffer.read(MAX_BYTES + 1), sys.argv[1])
    except InvalidFile:
        sys.exit(2)
    sys.stdout.buffer.write(json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
