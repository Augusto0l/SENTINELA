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
IDENTITY_SCOPE = "pcdf-2021-01-identidade"
PUBLIC_PEM = re.compile(rb"-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\r?\n?")
VERIFY = """const {createPublicKey, verify}=require('node:crypto');
const [pem, record, sig]=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
const key=createPublicKey(pem);
if(key.asymmetricKeyType!=='ed25519'||!verify(null,Buffer.from(record,'hex'),key,Buffer.from(sig,'hex')))
  process.exitCode=1;"""


def approval(record, signature, key, key_pin, target, scope=SCOPE, now=None):
    """Verify exact signed bytes under a separately pinned public key and bind the scope."""
    if not (0 < len(record) <= 8192 and len(signature) == 64 and len(key) <= 4096
            and PUBLIC_PEM.fullmatch(key)
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



def execution_fields(month):
    return {"banco": "sentinela_pcdf_piloto", "porta": 55481, "login": "pcdf_pilot_executor",
            "competencia": month}


def verify_documents(args, target, pin, month=MONTH):
    decisions = (
        ("manifesto", "Aprovação independente do manifesto", "aprovacao", "assinatura", SCOPE if month == MONTH
         else f"pcdf-{month}-staging"),
        ("identidade", "Autorização nominativa da identidade", "identidade", "assinatura_identidade",
         IDENTITY_SCOPE if month == MONTH else f"pcdf-{month}-identidade"),
        ("carga", "Autorização específica da carga", "autorizacao", "assinatura_autorizacao",
         EXECUTION_SCOPE if month == MONTH else f"pcdf-{month}-execucao-staging"),
    )
    checks, verified = [], {}
    key = read_bounded(args.chave, 4096) if args.chave and pin else None
    if key is not None and sha256(key).hexdigest() != pin:
        raise InvalidFile("chave_diverge_ancora_institucional")
    for name, description, path, signature, scope in decisions:
        record_path = getattr(args, path, None)
        signature_path = getattr(args, signature, None)
        if key is not None and record_path and signature_path:
            try:
                raw = read_bounded(record_path, 8192)
                record = approval(raw, read_bounded(signature_path, 64), key, pin, target, scope)
            except (InvalidFile, OSError) as error:
                checks.append(requirement(name, description, "REPROVADO", None,
                                          str(error) if isinstance(error, InvalidFile) else "documento_inacessivel"))
                continue
            verified[name] = (record, sha256(raw).hexdigest())
            checks.append(requirement(name, description, "APROVADO",
                                      {"referencia": record["referencia"], "aprovador": record["aprovador"],
                                       "vence": record["expira_em"]}))
        else:
            checks.append(requirement(name, description, "PENDENTE", None,
                                      "Aguardando âncora institucional e documento assinado"))
    return checks, verified


def bind_release(verified, pin, month, name, csv_sha):
    (grant, grant_sha), (identity, identity_sha), (release, release_sha) = (
        verified[decision] for decision in ("manifesto", "identidade", "carga"))
    try:
        operator, actor = identity["operador"], identity["ator_id"]
        common = {**execution_fields(month), "manifesto_sha256": grant["manifesto_sha256"],
                  "operador": operator, "ator_id": actor}
        if not (all(record.get(key) == value for record in (identity, release) for key, value in common.items())
                and release["aprovacao_sha256"] == grant_sha
                and release["identidade_sha256"] == identity_sha
                and release["autorizacao_identidade"] == identity["referencia"]
                and release["arquivo"] == name and release["csv_sha256"] == csv_sha
                and release["consolidacao"] is False and isinstance(operator, str)
                and 0 < len(operator.strip()) <= 128
                and operator.strip().casefold() != grant["aprovador"].strip().casefold()
                and operator.strip().casefold() != identity["aprovador"].strip().casefold()
                and actor == str(UUID(actor))):
            raise ValueError
    except (AttributeError, ValueError, KeyError, TypeError):
        raise InvalidFile("autorizacoes_divergentes") from None
    if actor == "71000000-0000-4000-8000-000000000081":
        raise InvalidFile("ator_sintetico")
    records = (grant, identity, release)
    starts = max(datetime.fromisoformat(record["aprovado_em"]) for record in records)
    ends = min(datetime.fromisoformat(record["expira_em"]) for record in records)
    if starts >= ends:
        raise InvalidFile("vigencias_sem_intersecao")
    return {"manifesto": grant["manifesto_sha256"], "csv": csv_sha, "key_pin": pin,
            "approval_record": grant_sha, "release_record": release_sha, "reference": release["referencia"],
            "operator_name": operator, "actor": actor, "starts_at": starts.isoformat(), "expires_at": ends.isoformat()}


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
    consolidated = pilot.query("""BEGIN READ ONLY;
      SELECT EXISTS (SELECT FROM sentinela.ocorrencias) OR EXISTS (SELECT FROM sentinela.ocorrencia_naturezas);
      COMMIT;""")
    control.require(not consolidated, "O destino dedicado contém ocorrências ou associações consolidadas")
    checks.append(requirement("ambiente", "Cluster, schema, RLS, integridade e privilégios atestados", "APROVADO",
                              {"cluster": pilot.cluster["uuid"], "banco": dedicated.DATABASE, "porta": dedicated.PORT,
                               "rls": catalog["rls"], "fks": catalog["fks"], "consolidacao": False}))
    pin = catalog["institutionalKey"]
    secret = os.environ.get("SENTINELA_PCDF_EXECUTOR_PASSWORD")
    if pin and args.chave_sha256 is not None and args.chave_sha256 != pin:
        raise InvalidFile("chave_diverge_ancora_institucional")
    decisions, verified = verify_documents(args, pilot.cluster["uuid"], pin)
    checks.extend(decisions)
    if (not catalog["active"] or not secret) and (not args.registrar or not secret):
        checks.append(requirement("executor", "Autenticação e privilégios da identidade operacional", "PENDENTE",
                                  None, "Aguardando ativação e credencial institucional"))
    if len(verified) != 3 or not args.manifesto:
        checks.append(requirement("entrega", "Manifesto e artefatos da entrega", "PENDENTE", None,
                                  "Aguardando decisões verificadas e manifesto"))
        return report(checks), None

    bound = bind_release(verified, pin, MONTH, NAME, CSV_SHA256)
    effective = pilot.effective(secret) if catalog["active"] and secret else None
    manifest = read_bounded(args.manifesto, MAX_MANIFEST_BYTES)
    evidence = metadata(manifest, bound["manifesto"])
    if not args.csv or not args.xml:
        checks.append(requirement("artefatos", "Bytes, estrutura e proveniência", "PENDENTE", None,
                                  "Aguardando CSV de janeiro e XML correspondente"))
        return report(checks), None

    with args.xml.open("rb") as xml:
        payload = prepare_month(read_bounded(args.csv, MAX_BYTES), MONTH, manifest, bound["manifesto"],
                                iter(lambda: xml.read(1024 * 1024), b""))
    sql = document_sql(payload)
    checksum = pilot.admin_sql(f"""BEGIN READ ONLY;
      SET LOCAL log_min_error_statement = 'panic';
      SET LOCAL log_error_verbosity = 'terse';
      SET LOCAL log_statement = 'none';
      SET LOCAL log_min_duration_statement = -1;
      SELECT encode(sha256(convert_to(({sql})::text,'UTF8')),'hex');
      COMMIT;""")
    bound.update(xml=payload["source"]["sha256"], payload=checksum)
    checks.append(requirement("artefatos", "Bytes, estrutura e proveniência", "APROVADO", evidence))

    if args.registrar and secret:
        control.require(not catalog["active"] and not catalog["release"] and secret,
                        "A fresh institutional credential and an inactive role are required")
        # Only verified records reach the authorization registry. Recheck the trust anchor
        # and actor in the same transaction that enables the login.
        values = ",".join(literal(value) for value in bound.values())
        verifier = recovery.scram(secret)
        pilot.admin_sql(f"""BEGIN;
          SET LOCAL log_min_error_statement = 'panic';
          SET LOCAL log_error_verbosity = 'terse';
          SET LOCAL log_statement = 'none';
          SET LOCAL log_min_duration_statement = -1;
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
                   "autorizacao", "assinatura-autorizacao", "identidade", "assinatura-identidade"):
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
