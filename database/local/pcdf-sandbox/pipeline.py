"""Preparação estrita do CSV candidato PCDF, sem acesso a dados externos."""
import csv
from datetime import date
from decimal import Decimal
from hashlib import sha256
import io
import json
from pathlib import Path
import re

HEADERS = (
    "ano_registro", "unidade_registro", "numero_registro", "ocorrencia_chave",
    "ano_fato", "data_inicio_fato_original", "data", "horario", "natureza_original",
    "natureza_padronizada_pcdf", "crime_tentado", "natureza_sentinela_codigo", "classificacao_status",
    "versao_mapeamento", "cidade_endereco_original", "ra_original", "area_endereco_original",
    "quadra_endereco_original", "ra_codigo", "local", "latitude_geo_original",
    "longitude_geo_original", "latitude_utm_original", "longitude_utm_original",
    "latitude", "longitude", "coordenada_status", "flagrante", "unidade_apuracao",
    "fonte", "linha_origem_id", "linha_xml", "aba_origem", "versao_tratamento",
)
MAX_BYTES = 16 * 1024 * 1024
MAX_ROWS = 25_000
MAX_CELL = 16_384
DECIMAL = re.compile(r"[+-]?\d{1,3}(?:\.\d{1,24})?", re.ASCII)
XML_FIXTURE = b"<Workbook><!-- synthetic provenance fixture --></Workbook>"
XML_SHA = sha256(XML_FIXTURE).hexdigest()
PCDF_NATURES = frozenset(json.loads(
    (Path(__file__).resolve().parents[3] / "docs/catalogos/pcdf-naturezas-xml-v1.json").read_text(encoding="utf-8")
)["naturezas"])


class InvalidFile(ValueError):
    pass


def date_value(value):
    if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def inspect_row(raw, month):
    issues = []

    def issue(field, kind, rule, priority="media", effect="bloqueia_dimensao"):
        issues.append(dict(field=field, kind=kind, rule=rule, priority=priority, effect=effect))

    identity = tuple(raw[key] for key in ("ano_registro", "unidade_registro", "numero_registro"))
    valid_identity = bool(re.fullmatch(r"[0-9]{4}", identity[0].strip())) and all(part.strip() for part in identity[1:])
    if not valid_identity:
        issue("ocorrencia_chave", "identificacao", "identidade_incompleta", "alta", "bloqueia_consolidacao")
    day = date_value(raw["data"])
    if not day or not raw["data_inicio_fato_original"].strip() or raw["data"][:7] != month or str(day.year) != raw["ano_fato"].strip():
        issue("data", "datas_horarios", "data_ano_ou_competencia_inconsistente", "alta", "bloqueia_consolidacao")
        day = None
    time = raw["horario"]
    if not re.fullmatch(r"(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]", time):
        issue("horario", "datas_horarios", "horario_ausente_ou_invalido")
        time = None
    nature = raw["natureza_original"]
    if not nature.strip():
        issue("natureza_original", "classificacao", "natureza_ausente", "alta", "bloqueia_consolidacao")
    elif nature not in PCDF_NATURES:
        issue("natureza_original", "classificacao", "natureza_fora_do_catalogo", "alta", "bloqueia_consolidacao")
    issue("ra_codigo", "endereco_ra", "ra_a_homologar" if raw["ra_original"].strip() else "ra_ausente")
    if not raw["local"].strip():
        issue("local", "endereco_ra", "endereco_ausente")
    pair = (raw["latitude"], raw["longitude"])
    if not all(DECIMAL.fullmatch(value) and abs(Decimal(value)) <= limit for value, limit in zip(pair, (90, 180))):
        issue("coordenada_status", "coordenadas", "par_ausente_incompleto_ou_invalido")
        pair = (None, None)
    else:
        issue("coordenada_status", "coordenadas", "referencia_espacial_pendente")
    flags = {}
    for key in ("flagrante", "crime_tentado"):
        flags[key] = {"SIM": True, "NÃO": False}.get(raw[key])
        if raw[key] and flags[key] is None:
            issue(key, "informacoes_policiais", "valor_policial_desconhecido", "baixa", "nao_bloqueante")
    return {
        "candidate": list(identity) if valid_identity else None,
        "data": day.isoformat() if day else None, "horario": time,
        "coordenadas_candidatas": list(pair), "classificacao_status": raw["classificacao_status"], **flags,
    }, issues


def prepare_csv(content, month):
    if not date_value(month + "-01"):
        raise InvalidFile("competencia_invalida")
    if not 0 < len(content) <= MAX_BYTES:
        raise InvalidFile("tamanho_csv_invalido")
    try:
        text = content.decode("utf-8-sig", errors="strict")
        if "\0" in text:
            raise InvalidFile("byte_nulo")
        reader = csv.reader(io.StringIO(text, newline=""), delimiter=";", strict=True)
        if tuple(next(reader, [])) != HEADERS:
            raise InvalidFile("cabecalho_invalido")
        rows, keys, positions = [], set(), set()
        treatment = None
        for ordinal, values in enumerate(reader, 1):
            if ordinal > MAX_ROWS or len(values) != len(HEADERS) or any(len(value) > MAX_CELL for value in values):
                raise InvalidFile("largura_ou_limite_csv")
            raw = dict(zip(HEADERS, values))
            locus = raw["linha_xml"]
            if (not re.fullmatch(r"[1-9][0-9]{0,17}", locus) or raw["fonte"] != "PCDF" or raw["aba_origem"] != "NATUREZAS"
                or not raw["linha_origem_id"].strip() or not raw["versao_tratamento"].strip()):
                raise InvalidFile("proveniencia_invalida")
            if raw["linha_origem_id"] in keys or locus in positions:
                raise InvalidFile("linha_de_origem_duplicada")
            keys.add(raw["linha_origem_id"])
            positions.add(locus)
            treatment = treatment or raw["versao_tratamento"]
            if treatment != raw["versao_tratamento"]:
                raise InvalidFile("versao_de_tratamento_mista")
            derived, diagnostics = inspect_row(raw, month)
            rows.append({"ordinal": ordinal, "raw": raw, "derived": derived, "diagnostics": diagnostics})
    except (UnicodeError, csv.Error) as error:
        raise InvalidFile("csv_malformado") from error
    return {"sha256": sha256(content).hexdigest(), "size": len(content), "month": month,
            "treatment": treatment, "rows": rows}
