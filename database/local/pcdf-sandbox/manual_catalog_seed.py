"""Render a guarded PostgreSQL seed. This command never connects to a database."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import sys
import unicodedata
from uuid import NAMESPACE_URL, UUID, uuid5

ROOT = Path(__file__).resolve().parents[3]
GEO_HASH = "fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553"
RA_VERSION = "SENTINELA_RA_PUBLICO_2026_11_13_V1"
RA_GEOMETRY = "IDE-DF-2026-11-13"
RA_EVIDENCE = "ra-review-2026-11-13-v1; extraction-only; legal validity unknown"
SYNTHETIC_NATURE_SOURCE = "SENTINELA-NATUREZAS-SINTETICAS"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def checked_json(path, digest):
    raw = path.read_bytes()
    require(sha256(raw).hexdigest() == digest, f"SHA-256 divergente em {path.name}")
    return json.loads(raw, object_pairs_hook=unique_json_object)


def unique_json_object(pairs):
    result = dict(pairs)
    require(len(result) == len(pairs), "Chave JSON repetida no catálogo")
    return result


def normalized(value):
    return "".join(char for char in unicodedata.normalize("NFD", value.strip().lower())
                   if not "\u0300" <= char <= "\u036f")


def unique(entries, field):
    require(len({entry[field] for entry in entries}) == len(entries), f"Duplicidade em {field}")


def synthetic_nature_catalog(rows):
    return any(normalized(row["referencia"]["fonte"]) == normalized(SYNTHETIC_NATURE_SOURCE) for row in rows)


def territory_rows():
    base = ROOT / "public/data/cartography"
    provenance = json.loads((base / "provenance.json").read_bytes())
    features = checked_json(base / "ras-ide-2026-11-13.geojson", GEO_HASH)["features"]
    bindings = checked_json(base / "ra-bindings.json",
                            "fe843533cb7d77acc7d1ddfc6812cb31560e032cf43bd26ce40baf49a674dbbf")
    reviewed = checked_json(ROOT / "database/local/ra-catalog-v2/payload.json",
                            "8179f313a17c1ce15913f6ab4b8bc19270ca05c88d2825e9e8c10d99c641a4c9")
    by_code = {row["code"]: row for row in bindings["entries"]}
    geometry = {row["properties"]["ra_codigo"]: row for row in features}
    entries = reviewed["entries"]
    unique(entries, "code")
    require(len(features) == len(geometry) == len(bindings["entries"]) == len(by_code)
            == len(entries) == provenance["featureCount"] and set(geometry) == set(by_code)
            == {row["code"] for row in entries}, "Cobertura ou códigos da IDE/DF divergentes")
    require(bindings["scope"] == "operational" and bindings["temporalBasis"] == "extraction-only"
            and reviewed["catalogVersion"] == RA_VERSION
            and provenance["sha256"] == bindings["sourceHash"] == reviewed["sourceHash"] == GEO_HASH,
            "Versão ou procedência territorial divergente")
    rows = []
    for row in entries:
        code, name, metadata = row["code"], row["name"], row["metadata"]
        binding, feature = by_code[code], geometry[code]
        properties = feature["properties"]
        require(name == binding["catalogName"] and metadata["ideCode"] == code
                and binding["status"] == metadata["approvalStatus"] == "approved"
                and str(properties["objectid"]) == binding["sourceObjectId"] == metadata["sourceObjectId"]
                and properties["ra_nome"] == binding["sourceName"] == metadata["sourceName"]
                and metadata["sourceId"] == provenance["institutionalService"]
                and metadata["sourceHash"] == GEO_HASH and metadata["legalValidityStatus"] == "unknown",
                f"Vínculo institucional divergente para {code}")
        rows.append(dict(id=str(UUID(binding["raId"])), codigo=code, nome=name,
                         referencia=metadata, geometria=feature["geometry"]))
    unique(rows, "id")
    unique([dict(nome=normalized(row["nome"])) for row in rows], "nome")
    require({row["referencia"]["administrativeNumber"] for row in rows} == set(range(1, len(rows) + 1)),
            "Numeração administrativa incompleta ou duplicada")
    return rows


def nature_rows(path, digest):
    release = checked_json(path, digest)
    require(isinstance(release, dict) and set(release) == {"versao", "fonte", "evidencia", "registros"},
            "Manifesto institucional inválido")
    metadata = {key: release[key] for key in ("versao", "fonte", "evidencia")}
    require(all(isinstance(value, str) and 0 < len(value) <= 2000 and value == value.strip()
                for value in metadata.values()), "Versão, fonte e ato de homologação são obrigatórios")
    records = release["registros"]
    require(isinstance(records, list) and records, "O manifesto não contém naturezas homologadas")
    rows = []
    for record in records:
        require(isinstance(record, dict) and set(record) == {"codigo", "descricao", "situacao", "usoManual"}
                and record["situacao"] == "homologada" and record["usoManual"] is True,
                "O manifesto contém item sem homologação para uso manual")
        code, description = record["codigo"], record["descricao"]
        require(all(isinstance(value, str) and value == value.strip() and 0 < len(value) <= limit
                    and normalized(value) and all(char.isprintable() for char in value)
                    for value, limit in ((code, 80), (description, 600))), "Código ou descrição inválidos")
        rows.append(dict(id=str(uuid5(NAMESPACE_URL, json.dumps([metadata["fonte"], normalized(code)]))),
                         codigo=code, descricao=description,
                         referencia={**metadata, "situacao": "homologada", "sha256": digest}))
    keys = [{key: normalized(row[key]) for key in ("codigo", "descricao")} for row in rows]
    unique(keys, "codigo")
    unique(keys, "descricao")
    return rows


def seed_sql(rows, kind, *, synthetic_only=False):
    payload = json.dumps(rows, ensure_ascii=True, separators=(",", ":"))
    require("$dados$" not in payload, "Marcador SQL reservado no catálogo")
    data = f"jsonb_to_recordset($dados${payload}$dados$::jsonb)"
    ports = "55486" if synthetic_only or (kind == "natureza" and synthetic_nature_catalog(rows)) else "55484,55486"
    if kind == "ra":
        table = "regioes_administrativas"
        columns = ("id,codigo_interno,codigo_oficial,nome,versao_catalogo,vigencia,limite,"
                   "versao_cartografia,evidencia_referencia_espacial,referencia_cartografica")
        select = f"""SELECT id,codigo AS codigo_interno,NULL::text AS codigo_oficial,nome,
          '{RA_VERSION}' AS versao_catalogo,daterange(NULL,NULL) AS vigencia,
          extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(geometria),4326)) AS limite,
          '{RA_GEOMETRY}' AS versao_cartografia,'{RA_EVIDENCE}' AS evidencia_referencia_espacial,
          referencia AS referencia_cartografica FROM {data} AS j(id uuid,codigo text,nome text,referencia jsonb,geometria jsonb)"""
        extra = f"""OR EXISTS (SELECT FROM sentinela.{table} t WHERE t.versao_catalogo='{RA_VERSION}'
          AND NOT EXISTS (SELECT FROM carga_catalogo i WHERE i.id=t.id))"""
    else:
        require(kind == "natureza", "Tipo de catálogo inválido")
        table = "naturezas_criminais"
        columns = "id,fonte,descricao_original,categoria_pcdf_original,codigo_manual,referencia_catalogo_manual"
        select = f"""SELECT id,'SENTINELA_MANUAL' AS fonte,descricao AS descricao_original,
          NULL::text AS categoria_pcdf_original,codigo AS codigo_manual,referencia AS referencia_catalogo_manual
          FROM {data} AS j(id uuid,codigo text,descricao text,referencia jsonb)"""
        extra = ""
    incoming = ",".join("i." + column for column in columns.split(","))
    existing = ",".join("t." + column for column in columns.split(","))
    # Compare exact geometry bytes, independent of the PostGIS equality operator.
    incoming = incoming.replace("i.limite", "extensions.ST_AsEWKB(i.limite)")
    existing = existing.replace("t.limite", "extensions.ST_AsEWKB(t.limite)")
    return f"""BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, pg_temp;
SELECT set_config('sentinela.manual_expected_uuid', :'expected_uuid', true);
DO $guard$
BEGIN
  IF current_database() <> 'sentinela_pcdf_local' OR inet_server_addr() IS DISTINCT FROM inet '127.0.0.1'
    OR inet_server_port() NOT IN ({ports})
    OR inet_server_port() IS NULL OR nullif(current_setting('sentinela.sandbox_uuid',true),'') IS NULL
    OR current_setting('sentinela.sandbox_uuid',true) IS DISTINCT FROM current_setting('sentinela.manual_expected_uuid')
    OR NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='local-manual-0003')
  THEN RAISE EXCEPTION 'Destino local atestado e local-manual-0003 são obrigatórios'; END IF;
END
$guard$;
LOCK TABLE sentinela.{table} IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE carga_catalogo ON COMMIT DROP AS {select};
DO $guard$
BEGIN
  IF EXISTS (SELECT FROM carga_catalogo i JOIN sentinela.{table} t USING(id)
    WHERE ROW({incoming}) IS DISTINCT FROM ROW({existing})) {extra}
  THEN RAISE EXCEPTION 'O conteúdo persistido diverge do pacote institucional'; END IF;
END
$guard$;
INSERT INTO sentinela.{table} ({columns})
SELECT {columns} FROM carga_catalogo i WHERE NOT EXISTS (SELECT FROM sentinela.{table} t WHERE t.id=i.id);
COMMIT;
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_subparsers(dest="mode", required=True)
    territory = modes.add_parser("ra")
    nature = modes.add_parser("natureza")
    for mode in (territory, nature):
        mode.add_argument("--saida", type=Path, help="Arquivo SQL novo, em UTF-8; padrão: stdout")
    nature.add_argument("manifesto", type=Path)
    nature.add_argument("--sha256", required=True, help="Hash informado no ato de aprovação do manifesto")
    args = parser.parse_args()
    try:
        rows = territory_rows() if args.mode == "ra" else nature_rows(args.manifesto, args.sha256)
        sql = seed_sql(rows, args.mode).encode("utf-8")
        if args.saida:
            with args.saida.open("xb") as output:
                output.write(sql)
        else:
            sys.stdout.buffer.write(sql)
    except (ValueError, OSError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
