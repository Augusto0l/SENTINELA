"""Reconcile the monthly deliveries with the archived SENTINELA-DADOS manifests."""

import argparse
from collections import Counter, defaultdict
import csv
from datetime import date, time
from hashlib import file_digest, sha256
import io
import json
from pathlib import Path
import sys


MONTHS = [f"{year}-{month:02}" for year in range(2021, 2027)
          for month in range(1, 13) if (year, month) <= (2026, 8)]


def require(condition, month, detail):
    if not condition:
        raise ValueError(f"{month}: {detail}")


def audit(root):
    sys.path.insert(0, str(root / "scripts"))
    from dados.pcdf_layout import identificar_linha, identificar_ocorrencia
    from dados.pcdf_layout_v2 import HEADERS, _avaliar_pares

    restricted = root / "dados_restritos"
    csv_folder = restricted / "pcdf-v2-csvs-2021-2026"
    archive = restricted / "pcdf-v2-integral-2021-2026"
    names = {f"pcdf_naturezas_{month}.csv" for month in MONTHS}
    require({file.name for file in csv_folder.glob("*.csv")} == names, "inventário", "arquivos/competências divergentes")
    key_months = defaultdict(set)
    source_month = {}
    source_repeats = Counter()
    nature_pairs = defaultdict(set)
    nature_catalog = set()
    matrix = []
    xml_hashes = set()

    for month in MONTHS:
        name = f"pcdf_naturezas_{month}.csv"
        manifest = json.loads((archive / month / "manifesto.json").read_text(encoding="utf-8"))
        data = (csv_folder / name).read_bytes()
        digest = sha256(data).hexdigest()
        with (archive / month / name).open("rb") as archived:
            archived_digest = file_digest(archived, "sha256").hexdigest()
        require(manifest["arquivos"][name] == {"bytes": len(data), "sha256": digest}
                and digest == archived_digest, month, "hash ou tamanho divergente")
        layout = manifest["layout"]
        require(manifest["competencia"] == month and tuple(layout["colunas"]) == HEADERS
                and layout["versao"] == "2.0" and layout["codificacao"] == "UTF-8"
                and layout["bom"] is False and layout["delimitador"] == ";" and layout["terminador"] == "CRLF",
                month, "manifesto incompatível")
        source = manifest["fonte"]
        xml_hashes.add(source["sha256"])
        reader = csv.reader(io.StringIO(data.decode("utf-8"), newline=""), delimiter=";", strict=True)
        require(tuple(next(reader)) == HEADERS and len(HEADERS) == 26, month, "cabeçalho divergente")
        counts = Counter()
        natures = Counter()
        fact_dates = set()
        dates = defaultdict(set)
        local_keys = Counter()
        local_origins = set()
        geo = Counter()
        utm = Counter()
        combined = Counter()

        for fields in reader:
            require(len(fields) == 26, month, f"registro CSV {reader.line_num} fora do layout")
            row = dict(zip(HEADERS, fields, strict=True))
            counts["associacoes"] += 1
            origin = row["linha_origem_id"]
            require(row["fonte"] == "PCDF"
                    and origin == identificar_linha(source["sha256"], source["aba"], int(row["linha_xml"])),
                    month, f"proveniência divergente no registro {reader.line_num}")
            if origin in local_origins:
                counts["origens_repetidas_no_mes"] += 1
            local_origins.add(origin)
            if source_month.setdefault(origin, month) != month:
                source_repeats[month] += 1
                source_repeats[source_month[origin]] += 1
            key = identificar_ocorrencia(row["ano_registro"], row["unidade_registro"], row["numero_registro"])
            require(key == row["ocorrencia_chave"], month, f"chave declarada divergente no registro {reader.line_num}")
            fact = date.fromisoformat(row["data"])
            require(row["data"] == fact.isoformat() and fact.isoformat()[:7] == month
                    and row["ano_fato"] == str(fact.year), month, f"competência divergente no registro {reader.line_num}")
            fact_dates.add(fact)
            if row["horario"]:
                require(time.fromisoformat(row["horario"]).isoformat() == row["horario"],
                        month, f"hora inválida no registro {reader.line_num}")
            else:
                counts["horarios_nulos"] += 1
            if key:
                key_months[key].add(month)
                local_keys[key] += 1
                dates[key].add(fact)
                nature_pairs[key, row["natureza_original"]].add(month)
                if row["ano_registro"] < row["ano_fato"]:
                    counts["associacoes_ano_registro_anterior_ao_fato"] += 1
            else:
                counts["associacoes_sem_chave"] += 1
            natures[row["natureza_original"]] += 1
            pairs, state = _avaliar_pares(row)
            require(state == row["coordenada_status"], month, f"estado GEO/UTM divergente no registro {reader.line_num}")
            combined[state] += 1
            geo[pairs["GEO"]["estado"]] += 1
            utm[pairs["UTM"]["estado"]] += 1

        rec = manifest["reconciliacao"]
        require(counts["associacoes"] == rec["associacoes_csv_v2"] == rec["associacoes_xml"]
                and counts["associacoes_sem_chave"] == rec["associacoes_sem_chave"]
                and len(local_origins) == rec["ids_distintos"]
                and len(local_keys) == rec["chaves_candidatas_distintas"]
                and natures == rec["naturezas_originais"] and combined == rec["coordenada_status"],
                month, "reconciliação do conteúdo divergente")
        nature_catalog.update(natures)
        matrix.append({
            "competencia": month, "arquivo": name, "sha256": digest, "bytes": len(data), "colunas": len(HEADERS),
            "linhas_origem_distintas": len(local_origins), "chaves_candidatas": len(local_keys),
            "chaves_com_multiplas_associacoes": sum(count > 1 for count in local_keys.values()),
            "chaves_com_datas_distintas_no_mes": sum(len(values) > 1 for values in dates.values()),
            **{name: counts[name] for name in ("associacoes", "associacoes_sem_chave", "origens_repetidas_no_mes",
               "associacoes_ano_registro_anterior_ao_fato", "horarios_nulos")},
            "naturezas_originais_distintas": len(natures), "crs_origem": manifest["crs_origem"] or "",
            "primeira_data_do_fato": min(fact_dates).isoformat(), "ultima_data_do_fato": max(fact_dates).isoformat(),
            "dias_com_associacoes": len(fact_dates),
            **{f"geo_{state}": geo[state] for state in ("referencia_pendente", "ausente", "incompleta", "invalida")},
            **{f"utm_{state}": utm[state] for state in ("referencia_pendente", "ausente", "incompleta", "invalida")},
            "naturezas_originais_json": json.dumps(natures, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
        })

    repeated_keys = {key: months for key, months in key_months.items() if len(months) > 1}
    repeated_natures = {pair: months for pair, months in nature_pairs.items() if len(months) > 1}
    per_month_keys = Counter(month for months in repeated_keys.values() for month in months)
    per_month_natures = Counter(month for months in repeated_natures.values() for month in months)
    jan_feb = sum({"2021-01", "2021-02"} <= months for months in repeated_keys.values())
    for row in matrix:
        month = row["competencia"]
        row["origens_repetidas_entre_meses"] = source_repeats[month]
        row["chaves_presentes_em_outros_meses"] = per_month_keys[month]
        row["chaves_e_naturezas_presentes_em_outros_meses"] = per_month_natures[month]

    require(len({row["sha256"] for row in matrix}) == len(MONTHS), "inventário", "hash de arquivo repetido")
    return matrix, {"associacoes": sum(row["associacoes"] for row in matrix), "chaves_distintas": len(key_months),
                    "origens_distintas": len(source_month), "chaves_em_varios_meses": len(repeated_keys),
                    "chaves_e_naturezas_em_varios_meses": len(repeated_natures), "chaves_janeiro_fevereiro": jan_feb,
                    "naturezas_distintas": len(nature_catalog), "xml_sha256": sorted(xml_hashes)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path, help="diretório SENTINELA-DADOS")
    parser.add_argument("matrix", type=Path, help="destino da matriz CSV agregada")
    args = parser.parse_args()
    rows, result = audit(args.project)
    with args.matrix.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=rows[0], delimiter=";")
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
