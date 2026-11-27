"""Offline PCDF file checks and read-only verification of historical pilot evidence."""
import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess
from uuid import UUID

from manifest_receiver import MAX_MANIFEST_BYTES, read_manifest, unique_object
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


def main():
    from direct_input import prepare_direct, preview

    parser = argparse.ArgumentParser(description="Validate a monthly PCDF CSV and optional technical manifest")
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument("--manifesto", type=Path)
    args = parser.parse_args()
    try:
        data = preview(prepare_direct(args.csv.name, read_bounded(args.csv, MAX_BYTES),
                       read_bounded(args.manifesto, MAX_MANIFEST_BYTES) if args.manifesto else None))
        result = {key: data[key] for key in ("name", "month", "sha256", "bytes", "manifestSha")}
        result.update(resultado="APROVADO", campos=len(data["headers"]), linhas=len(data["records"]))
    except (OSError, InvalidFile) as error:
        print(json.dumps({"resultado":"REPROVADO", "erro": str(error) if isinstance(error, InvalidFile) else type(error).__name__}))
        return 1
    print(json.dumps(result, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
