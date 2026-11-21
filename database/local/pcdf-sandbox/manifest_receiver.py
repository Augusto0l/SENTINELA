"""PCDF v1.0 manifest verification and staging preparation. No filesystem or HTTP access."""
from hashlib import sha256
import json
import re
import unicodedata

from pipeline import HEADERS, MAX_BYTES, InvalidFile, date_value, prepare_csv

MAX_MONTH_ROWS = 10_000
MAX_MANIFEST_BYTES = 1024 * 1024
LINE_VERSION = "pcdf-linha-v1"
ORIGINALS = (
    "ano_registro", "unidade_registro", "numero_registro", "ano_fato",
    "data_inicio_fato_original", "natureza_original", "natureza_padronizada_pcdf",
    "crime_tentado", "cidade_endereco_original", "ra_original", "area_endereco_original",
    "quadra_endereco_original", "latitude_geo_original", "longitude_geo_original",
    "latitude_utm_original", "longitude_utm_original", "flagrante", "unidade_apuracao",
)
TECHNICAL = ("versao_mapeamento", "fonte", "linha_origem_id", "linha_xml",
             "aba_origem", "versao_tratamento")
HASH = re.compile(r"[0-9a-f]{64}")
MONTH_FILE = re.compile(r"tecnico/pcdf_naturezas_([0-9]{4}-[0-9]{2})\.csv")
CIVIL_DATE = re.compile(r"([0-9]{2})/([0-9]{2})/([0-9]{4})(?: [^\r\n]*)?")
UNKNOWN = {"não informado", "não informada", "nao informado", "nao informada",
           "ra 98_não informada"}


def compact_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def line_id(xml_hash, index):
    return sha256(compact_json([LINE_VERSION, xml_hash, "NATUREZAS", index]).encode()).hexdigest()


def require(condition, reason="manifesto_inconsistente"):
    if not condition:
        raise InvalidFile(reason)


def unique_object(pairs):
    result = dict(pairs)
    require(len(pairs) == len(result))
    return result


def count(value, minimum=0):
    require(type(value) is int and minimum <= value <= 2**63 - 1)
    return value


def digest(value):
    require(isinstance(value, str) and HASH.fullmatch(value))
    return value


def read_manifest(content, approved_sha):
    require(0 < len(content) <= MAX_MANIFEST_BYTES)
    require(sha256(content).hexdigest() == digest(approved_sha), "manifesto_nao_aprovado")
    try:
        manifest = json.loads(content.decode("utf-8"), object_pairs_hook=unique_object)
        source = manifest["fonte"]
        layout = manifest["layout"]
        status = manifest["status"]
        require(manifest["versao_layout"] == "1.0" and status in ("reconciliado", "validado"))
        require(layout["colunas"] == list(HEADERS))
        require([layout[key] for key in ("originais", "derivadas", "tecnicas")] == [18, 10, 6])
        identifier = manifest["identificador_linha"]
        require(identifier["versao"] == LINE_VERSION and identifier["hash"] == "SHA-256")
        require(source["aba"] == "NATUREZAS")
        require(isinstance(source["nome"], str) and source["nome"].strip()
                and not any(c in source["nome"] for c in ("/", "\\", "\0", ":"))
                and source["nome"].lower().endswith(".xml"))
        digest(source["sha256"])
        count(source["bytes"], 1)
        treatment = manifest["versao_tratamento"]
        require(isinstance(treatment, str) and re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}", treatment))
        months, hashes, extras = {}, set(), {}
        extra_files = {
            "quarentena/pcdf_naturezas_sem_competencia.csv": "quarentena",
            "estruturais/linhas_estruturais_vazias.csv": "estrutural",
        }
        for path, item in manifest["arquivos_csv"].items():
            size, rows, file_hash = count(item["bytes"], 1), count(item["linhas"]), digest(item["sha256"])
            match = MONTH_FILE.fullmatch(path)
            if match:
                month = match[1]
                require(item["tipo"] == "mensal" and date_value(month + "-01"))
                require(size <= MAX_BYTES and rows <= MAX_MONTH_ROWS, "limite_competencia")
                require(file_hash not in hashes)
                months[month] = item
                hashes.add(file_hash)
            else:
                require(path in extra_files and item["tipo"] == extra_files[path])
                extras[item["tipo"]] = rows

        monthly_rows = {month: item["linhas"] for month, item in months.items()}
        declared = manifest["distribuicao"]["por_mes"]
        require(months and {month: count(rows) for month, rows in declared.items()} == monthly_rows)
        check = manifest["reconciliacao"]
        exported = sum(monthly_rows.values())
        quarantined, structural = extras.get("quarentena", 0), extras.get("estrutural", 0)
        require(count(check["associacoes_exportadas"]) == exported
                and count(check["linhas_quarentena"]) == quarantined
                and count(check["linhas_estruturais_vazias"]) == structural
                and count(check["associacoes_lidas"]) == exported + quarantined
                and count(check["ids_tecnicos_distintos"]) == exported + quarantined
                and count(check["valores_originais_conferidos"]) == (exported + quarantined) * len(ORIGINALS)
                and count(check["erros_transformacao"]) == 0
                and count(check["linhas_fisicas_lidas"]) == exported + quarantined + structural
                    + count(check["cabecalhos_lidos"], 1)
                and check["conferida_integralmente"] is True)
        if status == "validado":
            # The producer marks its final delivery only after comparing it with preflight.
            preflight = manifest["preflight"]
            preflight_source = preflight["fonte"]
            structure = preflight["estrutura_xml"]
            require(preflight["status"] == "aprovado"
                    and manifest["execucao"]["hash_fonte_reconferido"] is True
                    and preflight_source["sha256"] == source["sha256"]
                    and count(preflight_source["bytes"], 1) == source["bytes"]
                    and count(structure["linhas_lidas"]) == exported + quarantined
                    and count(structure["linhas_estruturais_vazias"]) == structural)
    except InvalidFile:
        raise
    except (ValueError, KeyError, TypeError, AttributeError, RecursionError):
        raise InvalidFile("manifesto_inconsistente") from None
    return manifest, months


def presence(value):
    if not value:
        return "ausente"
    trimmed = value.strip()
    if not trimmed:
        return "vazio_semantico"
    if unicodedata.normalize("NFC", trimmed).casefold() in UNKNOWN:
        return "desconhecido"
    return "informado"


def issue(field, kind, rule, blocking=False):
    return dict(field=field, kind=kind, rule=rule,
                priority="alta" if blocking else "media",
                effect="bloqueia_consolidacao" if blocking else "bloqueia_dimensao")


def validate_row(row, source_hash, month, treatment):
    raw, derived, diagnostics = row["raw"], row["derived"], row["diagnostics"]
    require(raw["linha_origem_id"] == line_id(source_hash, int(raw["linha_xml"]))
            and raw["versao_tratamento"] == treatment, "proveniencia_linha_invalida")

    identity = [raw[name] for name in ("ano_registro", "unidade_registro", "numero_registro")]
    candidate = derived["candidate"]
    if identity[0] != identity[0].strip() or identity[0] == "0000" or any(
        presence(value) != "informado" for value in identity
    ):
        candidate = None
    expected = compact_json(["PCDF", *candidate]) if candidate else ""
    if raw["ocorrencia_chave"] != expected:
        diagnostics.append(issue("ocorrencia_chave", "identificacao", "chave_candidata_divergente", True))
        candidate = None
    elif not candidate and not any(d["rule"] == "identidade_incompleta" for d in diagnostics):
        diagnostics.append(issue("ocorrencia_chave", "identificacao", "identidade_incompleta", True))
    derived["candidate"] = candidate

    original = CIVIL_DATE.fullmatch(raw["data_inicio_fato_original"])
    original_day = date_value("-".join(reversed(original.groups()))) if original else None
    csv_day = date_value(raw["data"])
    for day in (original_day, csv_day):
        require(day is None or day.isoformat()[:7] == month, "registro_fora_da_competencia")
    if original_day != csv_day or (csv_day and f"{csv_day.year:04d}" != raw["ano_fato"]):
        derived["data"] = None
        derived["horario"] = None
        diagnostics.append(issue("data", "datas_horarios", "data_original_divergente", True))
    if derived["horario"] and (not original_day
            or raw["data_inicio_fato_original"].partition(" ")[2] != raw["horario"]):
        derived["horario"] = None
        diagnostics.append(issue("horario", "datas_horarios", "horario_original_divergente"))

    if raw["classificacao_status"] != "pendente" or raw["natureza_sentinela_codigo"] or raw["versao_mapeamento"]:
        diagnostics.append(issue("classificacao_status", "classificacao", "classificacao_nao_verificada"))
    if raw["ra_codigo"] or presence(raw["ra_original"]) == "desconhecido":
        diagnostics.append(issue("ra_original", "endereco_ra", "ra_nao_verificada"))
    coordinate_status = raw["coordenada_status"]
    if not raw["latitude"] and not raw["longitude"] and coordinate_status in {
        "ausente", "incompleta", "invalida", "referencia_pendente", "divergente",
    }:
        diagnostics[:] = [d for d in diagnostics if d["kind"] != "coordenadas"]
        diagnostics.append(issue("coordenada_status", "coordenadas", "estado_recebido_" + coordinate_status))
    derived["coordenadas_candidatas"] = [None, None]
    derived["estados_originais"] = {name: presence(raw[name]) for name in ORIGINALS}


def prepare_month(content, month, manifest_bytes, approved_sha, xml_chunks):
    """Bind one monthly CSV to an independently pinned manifest and streamed XML bytes."""
    manifest, months = read_manifest(manifest_bytes, approved_sha)
    require(month in months, "competencia_nao_manifestada")
    item, source = months[month], manifest["fonte"]
    require(len(content) == item["bytes"] and sha256(content).hexdigest() == item["sha256"],
            "csv_divergente_manifesto")
    batch = prepare_csv(content, month)
    require(len(batch["rows"]) == item["linhas"], "contagem_csv_divergente")
    for row in batch["rows"]:
        validate_row(row, source["sha256"], month, manifest["versao_tratamento"])

    fingerprint, size = sha256(), 0
    for chunk in xml_chunks:
        size += len(chunk)
        require(size <= source["bytes"], "xml_divergente_manifesto")
        fingerprint.update(chunk)
    require(size == source["bytes"] and fingerprint.hexdigest() == source["sha256"],
            "xml_divergente_manifesto")

    batch["treatment"] = manifest["versao_tratamento"]
    return {"batch": batch, "source": source, "manifest": manifest, "manifestSha": approved_sha}
