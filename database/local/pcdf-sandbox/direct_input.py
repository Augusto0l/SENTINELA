"""Read a monthly PCDF v1.0 CSV and optional producer manifest from a bounded stream."""
import json
import re
import sys
from hashlib import sha256

from manifest_receiver import HASH, MAX_MANIFEST_BYTES, MAX_MONTH_ROWS, parse_manifest, require, validate_row
from pipeline import HEADERS, MAX_BYTES, InvalidFile, prepare_csv

NAME = re.compile(r"pcdf_naturezas_([0-9]{4}-[0-9]{2})\.csv")


def prepare_direct(name, content, manifest_bytes=None):
    match = NAME.fullmatch(name)
    require(match, "nome_competencia_invalido")
    month = match[1]
    manifest = source = manifest_sha = treatment = None
    if manifest_bytes is not None:
        manifest_sha = sha256(manifest_bytes).hexdigest()
        manifest, months = parse_manifest(manifest_bytes)
        require(month in months, "competencia_nao_manifestada")
        item, source = months[month], manifest["fonte"]
        require(len(content) == item["bytes"] and sha256(content).hexdigest() == item["sha256"],
                "csv_divergente_manifesto")
        treatment = manifest["versao_tratamento"]

    batch = prepare_csv(content, month)
    rows = batch["rows"]
    require(0 < len(rows) <= MAX_MONTH_ROWS, "contagem_csv_invalida")
    if manifest:
        require(len(rows) == item["linhas"], "contagem_csv_divergente")
    for row in rows:
        raw = row["raw"]
        require(HASH.fullmatch(raw["linha_origem_id"])
                and re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}", raw["versao_tratamento"]),
                "proveniencia_linha_invalida")
        validate_row(row, source["sha256"] if source else None, month, treatment or batch["treatment"])

    batch["name"] = name
    return {"batch": batch, "source": source, "manifest": manifest, "manifestSha": manifest_sha}


def preview(delivery):
    batch = delivery["batch"]
    fields = {key: {"empty": 0, "issues": 0} for key in HEADERS}
    records = []
    for row in batch["rows"]:
        for key, value in row["raw"].items():
            fields[key]["empty"] += not value.strip()
        for problem in row["diagnostics"]:
            fields[problem["field"]]["issues"] += 1
        records.append({
            "cells": [row["raw"][key] for key in HEADERS],
            "issues": [[problem["field"], problem["rule"]] for problem in row["diagnostics"]],
        })
    return {"name": batch["name"], "month": batch["month"], "sha256": batch["sha256"],
            "bytes": batch["size"], "treatment": batch["treatment"], "manifestSha": delivery["manifestSha"],
            "headers": HEADERS, "fields": fields, "records": records}


def main():
    stream = sys.stdin.buffer
    try:
        name, size, manifest_size = json.loads(stream.readline(256))
        require(type(size) is int and 0 < size <= MAX_BYTES
                and type(manifest_size) is int and -1 <= manifest_size <= MAX_MANIFEST_BYTES,
                "tamanho_csv_invalido")
        content = stream.read(size)
        manifest = stream.read(manifest_size) if manifest_size >= 0 else None
        require(len(content) == size and (manifest is None or len(manifest) == manifest_size)
                and not stream.read(1), "tamanho_csv_invalido")
        delivery = prepare_direct(name, content, manifest)
        result = preview(delivery) if sys.argv[1:] == ["preview"] else delivery
        sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
        return 0
    except (ValueError, TypeError) as error:
        diagnostic = str(error) if isinstance(error, InvalidFile) else "csv_malformado"
        print(json.dumps({"error": diagnostic}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
