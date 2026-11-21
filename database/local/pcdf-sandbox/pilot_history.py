"""Read-only chronological controller for PCDF staging deliveries and signed acceptance."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import sys

from manifest_receiver import MAX_MANIFEST_BYTES, prepare_month, read_manifest
from pilot_preflight import (CSV_SHA256, MONTH, ROWS, SIZE, approval, bind_release, read_bounded,
                             verify_documents)
from pilot_runtime import Pilot, control, reconciliation
from pipeline import InvalidFile, MAX_BYTES

ACCEPT_SCOPE = "pcdf-historico-aceite-staging"
PERIOD = tuple(f"{year:04}-{month:02}" for year in range(2021, 2027)
               for month in range(1, (8 if year == 2026 else 12) + 1))
INVENTORY_SQL = """
  BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
  SELECT jsonb_build_object('runs', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'competencia',to_char(l.competencia,'YYYY-MM'),'arquivo',l.nome_arquivo,'csv',l.sha256_arquivo,
      'xml',x.sha256_xml,'manifesto',x.manifesto->>'sha256','bytes',l.tamanho_bytes,
      'lote',l.id,'execucao',e.id,'contrato',l.versao_contrato,'tratamento',l.versao_tratamento,
      'esperadas',l.linhas_esperadas,'status',e.status,'lidas',e.linhas_lidas,
      'processadas',e.linhas_processadas,'ocorrencias',e.ocorrencias_criadas,
      'associacoes',e.associacoes_criadas,'snapshots',s.rows,'origens',s.origins,'foraStaging',s.outside,
      'recibos',coalesce(a.receipts,'[]'::jsonb)) ORDER BY l.competencia,l.id,e.id)
    FROM sentinela.lotes_importacao l JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id
    LEFT JOIN sentinela.execucoes_importacao e ON e.lote_id=l.id
    CROSS JOIN LATERAL (
      SELECT count(*) AS rows,count(DISTINCT linha_origem_id) AS origins,
        count(*) FILTER (WHERE ocorrencia_id IS NOT NULL OR associacao_id IS NOT NULL OR estado<>'bloqueada') AS outside
      FROM sentinela.linhas_staging WHERE execucao_id=e.id
    ) s
    CROSS JOIN LATERAL (
      SELECT jsonb_agg(event.request_id ORDER BY event.id) AS receipts
      FROM sentinela.eventos_auditoria event
      WHERE event.execucao_id=e.id AND event.servico='pcdf-piloto'
        AND event.acao IN ('staging_pcdf','reenvio_pcdf')
        AND EXISTS (SELECT FROM sentinela.eventos_auditoria a
          WHERE a.servico=event.servico AND a.acao='tentativa_iniciada' AND a.request_id=event.request_id
            AND a.depois->>'manifesto_sha256'=x.manifesto->>'sha256'
            AND a.depois->>'sha256'=l.sha256_arquivo AND a.depois->>'xml_sha256'=x.sha256_xml)
    ) a WHERE x.fonte='PCDF'
  ),'[]'::jsonb), 'attempts', coalesce((
    SELECT jsonb_agg(jsonb_build_object('requisicao',request_id,'csv',depois->>'sha256',
      'manifesto',depois->>'manifesto_sha256','autorizacao',depois->>'autorizacao_sha256') ORDER BY registrado_em,id)
    FROM sentinela.eventos_auditoria WHERE servico='pcdf-piloto' AND acao='tentativa_iniciada'
  ),'[]'::jsonb), 'consolidacoes', (SELECT count(*) FROM sentinela.ocorrencias)
    + (SELECT count(*) FROM sentinela.ocorrencia_naturezas));
  COMMIT;
"""


def inventory(content, expected_hash=None):
    observed = sha256(content).hexdigest()
    manifest, months = read_manifest(content, expected_hash if expected_hash is not None else observed)
    jan = months.get(MONTH, {})
    if (tuple(sorted(months)) != PERIOD or sum(info["linhas"] for info in months.values()) != 369660
            or not all(info["linhas"] > 0 for info in months.values())
            or (jan.get("linhas"), jan.get("bytes"), jan.get("sha256")) != (ROWS, SIZE, CSV_SHA256)):
        raise InvalidFile("inventario_historico_divergente")
    return manifest, months, observed


def file_name(month):
    return f"pcdf_naturezas_{month}.csv"


def verify_acceptance(record, saved, expected_rows):
    expected = {"competencia": saved["competencia"], "manifesto_sha256": saved["manifesto"],
                "csv_sha256": saved["csv"], "lote": saved["lote"], "execucao": saved["execucao"],
                "publicacao": False, "consolidacao": False}
    if (any(record.get(key) != value for key, value in expected.items())
            or record.get("requisicao") not in saved["recibos"]
            or type(record.get("publicacao")) is not bool or type(record.get("consolidacao")) is not bool
            or json.dumps(record.get("reconciliacao"), sort_keys=True) !=
            json.dumps(reconciliation(expected_rows), sort_keys=True)):
        raise InvalidFile("aceite_diverge_execucao_ou_reconciliacao")


def read_acceptance(folder, key, pin, cluster, month):
    record, signature = folder / f"{month}.json", folder / f"{month}.sig"
    if not record.exists() and not signature.exists():
        return None
    if key is None or pin is None or not record.is_file() or not signature.is_file():
        raise InvalidFile("aceite_sem_ancora_ou_assinatura")
    return approval(read_bounded(record, 8192), read_bounded(signature, 64), key, pin, cluster, ACCEPT_SCOPE)


def sequence(manifest, months, manifest_sha, observed, accepted):
    if observed["consolidacoes"]:
        raise InvalidFile("consolidacao_no_destino_de_staging")
    runs, attempts = {}, {}
    by_sha = {info["sha256"]: month for month, info in months.items()}
    for attempt in observed["attempts"]:
        month = by_sha.get(attempt["csv"])
        if not month or attempt["manifesto"] != manifest_sha:
            raise InvalidFile("tentativa_fora_do_manifesto")
        attempts.setdefault(month, []).append(attempt)
    for saved in observed["runs"]:
        month = saved["competencia"]
        info = months.get(month)
        if info is None or month in runs:
            raise InvalidFile("execucao_duplicada_ou_fora_da_sequencia")
        expected = {"arquivo": file_name(month), "csv": info["sha256"], "xml": manifest["fonte"]["sha256"],
                    "manifesto": manifest_sha, "bytes": info["bytes"], "contrato": "1.0",
                    "tratamento": manifest["versao_tratamento"], "status": "concluida",
                    **dict.fromkeys(("esperadas", "lidas", "processadas", "snapshots", "origens"), info["linhas"]),
                    "ocorrencias": 0, "associacoes": 0, "foraStaging": 0}
        if any(saved.get(key) != value for key, value in expected.items()) or not saved["recibos"]:
            raise InvalidFile("execucao_ou_auditoria_divergente")
        runs[month] = saved

    items, current = [], None
    for month, info in sorted(months.items()):
        saved, signoff, attempts_month = runs.get(month), accepted(month), attempts.get(month, [])
        if current and (saved or signoff or attempts_month):
            raise InvalidFile("competencia_adiantada_sem_aceite_da_anterior")
        if signoff:
            if not saved:
                raise InvalidFile("aceite_sem_execucao_duravel")
            verify_acceptance(signoff, saved, info["linhas"])
        item = {"competencia": month, "arquivo": file_name(month), "linhas": info["linhas"],
                "bytes": info["bytes"], "sha256": info["sha256"], "tentativas": len(attempts_month)}
        if saved:
            item.update(lote=saved["lote"], execucao=saved["execucao"])
        if signoff:
            item.update(estado="ACEITA", referencia=signoff["referencia"])
        elif current:
            item["estado"] = "BLOQUEADA_ANTERIOR"
        else:
            item["estado"] = "AGUARDANDO_ACEITE" if saved else "AGUARDANDO_AUTORIZACOES"
            if attempts_month:
                item["ultima_tentativa"] = attempts_month[-1]
            current = item
        items.append(item)
    return {"manifesto_sha256": manifest_sha, "campos": 34, "competencias": items, "proxima": current,
            "total_competencias": len(items), "total_associacoes": sum(info["linhas"] for info in months.values())}


def inspect(args):
    content = read_bounded(args.manifesto, MAX_MANIFEST_BYTES)
    manifest, months, digest = inventory(content, args.manifesto_sha256)
    if args.inventario:
        return {"modo": "inventario_documental", "manifesto_sha256": digest, "campos": 34,
                "total_competencias": len(months), "total_associacoes": sum(m["linhas"] for m in months.values()),
                "competencias": [{"competencia": month, "arquivo": file_name(month), **months[month]}
                                 for month in sorted(months)]}
    pilot = Pilot(args.cluster)
    with pilot.running():
        catalog = pilot.inspect()
        pin, cluster = catalog["institutionalKey"], pilot.cluster["uuid"]
        key = read_bounded(args.chave, 4096) if args.chave and pin else None
        if key is not None and sha256(key).hexdigest() != pin:
            raise InvalidFile("chave_diverge_ancora_institucional")
        observed = pilot.query(INVENTORY_SQL)

        def accepted(month):
            return read_acceptance(args.aceites, key, pin, cluster, month) if args.aceites else None

        result = sequence(manifest, months, digest, observed, accepted)
        result.update(modo="sequencia_atestada", cluster=cluster, destino=pilot.cluster["database"])
        if args.verificar_entrega:
            candidate = result["proxima"]
            if not candidate or candidate["estado"] != "AGUARDANDO_AUTORIZACOES":
                raise InvalidFile("nao_houve_competencia_liberada_para_conferencia")
            month = candidate["competencia"]
            checks, verified = verify_documents(args, cluster, pin, month)
            result["autorizacoes"] = checks
            result["verificacao_entrega"] = "PENDENTE"
            if any(check["resultado"] == "REPROVADO" for check in checks):
                result["verificacao_entrega"] = "REPROVADO"
            elif len(verified) == 3 and args.csv and args.xml:
                bound = bind_release(verified, pin, month, candidate["arquivo"], candidate["sha256"])
                if bound["manifesto"] != digest:
                    raise InvalidFile("manifesto_diverge_aprovacao_independente")
                with args.xml.open("rb") as stream:
                    prepare_month(read_bounded(args.csv, MAX_BYTES), month, content, bound["manifesto"],
                                  iter(lambda: stream.read(1024 * 1024), b""))
                result["verificacao_entrega"] = "APROVADA_PARA_CONFERENCIA"
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifesto", type=Path, required=True)
    parser.add_argument("--manifesto-sha256", help="Referencia independente, quando fornecida")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--inventario", action="store_true")
    mode.add_argument("--cluster", type=Path)
    parser.add_argument("--verificar-entrega", action="store_true")
    for name in ("aceites", "chave", "aprovacao", "assinatura", "identidade", "assinatura-identidade",
                 "autorizacao", "assinatura-autorizacao", "csv", "xml"):
        parser.add_argument("--" + name, type=Path)
    args = parser.parse_args()
    if args.verificar_entrega and not args.cluster:
        parser.error("--verificar-entrega exige --cluster")
    try:
        result = inspect(args)
    except (InvalidFile, control.Refused, OSError, RuntimeError, ValueError) as error:
        print(json.dumps({"resultado": "REPROVADO", "motivo": str(error) if isinstance(error, InvalidFile)
                         else type(error).__name__}))
        return 1
    print(json.dumps(result, ensure_ascii=True))
    return {"PENDENTE": 2, "REPROVADO": 1}.get(result.get("verificacao_entrega"), 0)


if __name__ == "__main__":
    sys.exit(main())
