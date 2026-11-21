"""Read-only pilot preflight. The institutional key and execution release are external."""
import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from uuid import UUID

from manifest_receiver import MAX_MANIFEST_BYTES, prepare_month, read_manifest, unique_object
from pipeline import InvalidFile, MAX_BYTES

MONTH = "2021-01"
NAME = "pcdf_naturezas_2021-01.csv"
ROWS = 6393
SIZE = 2948416
CSV_SHA256 = "e202df3622fbd5f0b4ae53e7a8f435bce9ad58ff30a43a3c248ce2d369fd3770"
SCOPE = "pcdf-2021-01-staging"
EXECUTION_SCOPE = "pcdf-2021-01-execucao-staging"
VERIFY = """const {createPublicKey, verify}=require('node:crypto');
const [pem, record, sig]=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
const key=createPublicKey(pem);
if(key.asymmetricKeyType!=='ed25519'||!verify(null,Buffer.from(record,'hex'),key,Buffer.from(sig,'hex')))
  process.exitCode=1;"""


def approval(record, signature, key, key_pin, target, scope=SCOPE, now=None):
    """Verify exact signed bytes under a separately pinned public key and bind the scope."""
    if not (0 < len(record) <= 8192 and len(signature) == 64 and len(key) <= 4096
            and sha256(key).hexdigest() == key_pin):
        raise InvalidFile("aprovacao_chave_ou_formato")
    try:
        verified = subprocess.run(["node", "-e", VERIFY], text=True, timeout=8,
                                  input=json.dumps([key.decode("ascii"), record.hex(), signature.hex()]),
                                  capture_output=True)
        if verified.returncode:
            raise InvalidFile("aprovacao_assinatura_invalida")
        data = json.loads(record, object_pairs_hook=unique_object)
        start = datetime.fromisoformat(data["aprovado_em"])
        end = datetime.fromisoformat(data["expira_em"])
        instant = now if now is not None else datetime.now(timezone.utc)
        if not (data["escopo"] == scope and data["destino"] == target
                and start.tzinfo and end.tzinfo and start <= instant < end
                and isinstance(data["referencia"], str) and re.fullmatch(r"[A-Za-z0-9._/-]{1,128}", data["referencia"])
                and isinstance(data["aprovador"], str) and 0 < len(data["aprovador"].strip()) <= 128
                and isinstance(data["manifesto_sha256"], str) and re.fullmatch(r"[a-f0-9]{64}", data["manifesto_sha256"])
                and data["versao_layout"] == "1.0"):
            raise InvalidFile("aprovacao_fora_de_escopo")
    except InvalidFile:
        raise
    except (OSError, ValueError, KeyError, TypeError, RecursionError, subprocess.TimeoutExpired):
        raise InvalidFile("aprovacao_invalida") from None
    return data


def requirement(identifier, description, status, evidence, blocking=None):
    return {"id": identifier, "descricao": description, "resultado": status,
            "evidencia": evidence, "bloqueio": blocking}


def report(checks):
    states = {check.get("resultado") for check in checks}
    if not states or states - {"APROVADO", "PENDENTE"}:
        status = "REPROVADO"
    else:
        status = "PENDENTE" if "PENDENTE" in states else "APROVADO"
    return {"resultado": status, "requisitos": checks}


def metadata(content, approved_sha):
    manifest, months = read_manifest(content, approved_sha)
    january = months.get(MONTH)
    if not january or (january["linhas"], january["bytes"], january["sha256"]) != (ROWS, SIZE, CSV_SHA256):
        raise InvalidFile("competencia_ou_metadados_divergentes")
    return {"arquivo": NAME, "linhas": ROWS, "bytes": SIZE, "campos": len(manifest["layout"]["colunas"])}


def read_bounded(path, limit):
    with path.open("rb") as stream:
        return stream.read(limit + 1)



def signed_inputs(args, target, pin):
    key = read_bounded(args.chave, 4096)
    manifest_record = read_bounded(args.aprovacao, 8192)
    load_record = read_bounded(args.autorizacao, 8192)
    grant = approval(manifest_record, read_bounded(args.assinatura, 64), key, pin, target)
    release = approval(load_record, read_bounded(args.assinatura_autorizacao, 64), key, pin, target, EXECUTION_SCOPE)
    try:
        operator = release["operador"]
        actor = release["ator_id"]
        if not (release["manifesto_sha256"] == grant["manifesto_sha256"]
                and release["aprovacao_sha256"] == sha256(manifest_record).hexdigest()
                and release["banco"] == "sentinela_pcdf_piloto" and release["porta"] == 55481
                and release["login"] == "pcdf_pilot_executor" and release["competencia"] == MONTH
                and release["arquivo"] == NAME and release["csv_sha256"] == CSV_SHA256
                and release["consolidacao"] is False and isinstance(operator, str)
                and 0 < len(operator.strip()) <= 128 and operator.strip().casefold() != grant["aprovador"].strip().casefold()
                and actor == str(UUID(actor)) and isinstance(release["autorizacao_identidade"], str)
                and re.fullmatch(r"[A-Za-z0-9._/-]{1,128}", release["autorizacao_identidade"])):
            raise ValueError
    except (AttributeError, ValueError, KeyError, TypeError):
        raise InvalidFile("autorizacao_execucao_fora_de_escopo") from None
    if actor == "71000000-0000-4000-8000-000000000081":
        raise InvalidFile("ator_sintetico")
    starts = max(datetime.fromisoformat(record["aprovado_em"]) for record in (grant, release))
    ends = min(datetime.fromisoformat(record["expira_em"]) for record in (grant, release))
    bound = {"manifesto": grant["manifesto_sha256"], "csv": CSV_SHA256, "key_pin": pin,
             "approval_record": sha256(manifest_record).hexdigest(), "release_record": sha256(load_record).hexdigest(),
             "reference": release["referencia"], "operator_name": operator, "actor": actor,
             "starts_at": starts.isoformat(), "expires_at": ends.isoformat()}
    return bound


def release_matches(catalog, bound):
    if not catalog:
        return False
    return all((datetime.fromisoformat(catalog[key]) == datetime.fromisoformat(value)
                if key in ("starts_at", "expires_at") else catalog.get(key) == value)
               for key, value in bound.items())


def check(pilot, args):
    from pilot_runtime import SCHEMA, control, dedicated, document_sql, literal, recovery

    checks = []
    if not pilot.cluster.get("pilot_executor_schema_sha256"):
        dedicated.inspect(pilot.cluster, pilot.admin, pilot.runner)
        checks.append(requirement("executor", "Executor do piloto", "PENDENTE", None, "Provisão pendente"))
        return report(checks), None

    catalog = pilot.inspect()
    checks.append(requirement("ambiente", "Cluster, schema, RLS, integridade e privilégios atestados", "APROVADO",
                              {"cluster": pilot.cluster["uuid"], "banco": dedicated.DATABASE, "porta": dedicated.PORT,
                               "rls": catalog["rls"], "fks": catalog["fks"], "consolidacao": False}))
    pin = catalog["institutionalKey"]
    paths = (args.manifesto, args.aprovacao, args.assinatura, args.chave, args.autorizacao, args.assinatura_autorizacao)
    secret = os.environ.get("SENTINELA_PCDF_EXECUTOR_PASSWORD")
    effective = pilot.effective(secret) if catalog["active"] and secret else None
    if not pin or not all(paths):
        checks.append(requirement("autorizacao", "Aprovação independente, identidade e autorização da carga",
                                  "PENDENTE", None, "Aguardando âncora institucional e assinaturas"))
    if not effective and not args.registrar:
        checks.append(requirement("executor", "Autenticação e privilégios da identidade operacional", "PENDENTE",
                                  None, "Aguardando ativação e credencial institucional"))
    if not pin or not all(paths):
        return report(checks), None

    if args.chave_sha256 is not None and args.chave_sha256 != pin:
        raise InvalidFile("chave_diverge_ancora_institucional")
    bound = signed_inputs(args, pilot.cluster["uuid"], pin)
    manifest = read_bounded(args.manifesto, MAX_MANIFEST_BYTES)
    evidence = metadata(manifest, bound["manifesto"])
    checks.append(requirement("autorizacao", "Aprovação independente e autorização específica assinadas", "APROVADO",
                              {"referencia": bound["reference"], "responsavel": bound["operator_name"], **evidence}))
    if not args.csv or not args.xml:
        checks.append(requirement("artefatos", "Bytes, estrutura e proveniência", "PENDENTE", None,
                                  "Aguardando CSV de janeiro e XML correspondente"))
        return report(checks), None

    with args.xml.open("rb") as xml:
        payload = prepare_month(read_bounded(args.csv, MAX_BYTES), MONTH, manifest, bound["manifesto"],
                                iter(lambda: xml.read(1024 * 1024), b""))
    sql = document_sql(payload)
    checksum = pilot.admin_sql(f"SELECT encode(sha256(convert_to(({sql})::text,'UTF8')),'hex');")
    bound.update(xml=payload["source"]["sha256"], payload=checksum)
    checks.append(requirement("artefatos", "Bytes, estrutura e proveniência", "APROVADO", evidence))

    if args.registrar:
        control.require(not catalog["active"] and not catalog["release"] and secret,
                        "A fresh institutional credential and an inactive role are required")
        # Only verified records reach the authorization registry. Recheck the trust anchor
        # and actor in the same transaction that enables the login.
        values = ",".join(literal(value) for value in bound.values())
        verifier = recovery.scram(secret)
        pilot.admin_sql(f"""BEGIN;
          LOCK TABLE {SCHEMA}.target, {SCHEMA}.release IN EXCLUSIVE MODE;
          DO $check$ BEGIN
            IF NOT EXISTS (SELECT FROM {SCHEMA}.target WHERE institutional_key={literal(pin)})
               OR NOT EXISTS (SELECT FROM sentinela.usuarios WHERE id={literal(bound["actor"])}
                              AND ativo AND perfil='Operador')
               OR clock_timestamp() >= {literal(bound["expires_at"])}::timestamptz THEN
              RAISE EXCEPTION 'Authorization, actor or anchor refused';
            END IF;
          END $check$;
          INSERT INTO {SCHEMA}.release ({",".join(bound)}) VALUES ({values});
          ALTER ROLE pcdf_pilot_executor LOGIN PASSWORD {literal(verifier)}
            VALID UNTIL {literal(bound["expires_at"])};
          COMMIT;""")
        try:
            catalog = pilot.inspect()
            effective = pilot.effective(secret)
        except BaseException:
            pilot.admin_sql(f"""BEGIN;
              ALTER ROLE pcdf_pilot_executor NOLOGIN PASSWORD NULL VALID UNTIL 'infinity';
              DELETE FROM {SCHEMA}.release WHERE release_record={literal(bound["release_record"])};
              COMMIT;""")
            raise

    if catalog["release"] and not release_matches(catalog["release"], bound):
        raise InvalidFile("autorizacao_diverge_registro_do_destino")
    checks.append(requirement("liberacao", "Autorização vinculada aos bytes e ao executor",
                              "APROVADO" if catalog["release"] else "PENDENTE", None,
                              None if catalog["release"] else "Aguardando registro da autorização no destino"))
    if effective:
        checks.append(requirement("executor", "Autenticação e privilégios da identidade operacional", "APROVADO", effective))
    return report(checks), sql


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("manifesto", "aprovacao", "assinatura", "chave", "csv", "xml", "cluster",
                   "autorizacao", "assinatura-autorizacao"):
        parser.add_argument("--" + option, type=Path)
    parser.add_argument("--chave-sha256")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--registrar", action="store_true")
    mode.add_argument("--executar", action="store_true")
    parser.add_argument("--requisicao", type=UUID, help="UUID de correlação reutilizável para retentativa")
    args = parser.parse_args()
    if args.executar and not args.requisicao:
        parser.error("--executar exige --requisicao")
    from pilot_runtime import Pilot, SCHEMA, control, receive_sql
    if not args.cluster:
        outcome = report([requirement("ambiente", "Atestação do destino", "PENDENTE", None,
                                      "Informe o manifesto local do cluster dedicado")])
    else:
        try:
            pilot = Pilot(args.cluster)
            with pilot.running():
                outcome, payload = check(pilot, args)
                if args.executar and outcome["resultado"] == "APROVADO":
                    secret = os.environ["SENTINELA_PCDF_EXECUTOR_PASSWORD"]
                    request = args.requisicao
                    pilot.restricted(secret, f"SELECT {SCHEMA}.record_attempt({payload},'{request}');")
                    result = pilot.restricted(secret, "BEGIN;\n" + receive_sql(payload, request, ROWS) + "COMMIT;")
                    outcome["recepcao"] = json.loads(result)
        except (InvalidFile, control.Refused, OSError, RuntimeError, ValueError) as error:
            outcome = report([requirement("preflight", "Destino, credenciais, assinatura e entrega",
                                          "REPROVADO", None,
                                          str(error) if isinstance(error, (InvalidFile, control.Refused))
                                          else type(error).__name__)])
    print(json.dumps(outcome, ensure_ascii=True))
    return {"APROVADO": 0, "PENDENTE": 2, "REPROVADO": 1}[outcome["resultado"]]


if __name__ == "__main__":
    raise SystemExit(main())
