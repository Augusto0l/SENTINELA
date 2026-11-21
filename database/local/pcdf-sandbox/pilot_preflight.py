"""Read-only pilot preflight. The institutional key and execution release are external."""
import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess
import sys

from manifest_receiver import MAX_MANIFEST_BYTES, prepare_month, read_manifest, unique_object
from pipeline import InvalidFile, MAX_BYTES

MONTH = "2021-01"
NAME = "pcdf_naturezas_2021-01.csv"
ROWS = 6393
SIZE = 2948416
CSV_SHA256 = "e202df3622fbd5f0b4ae53e7a8f435bce9ad58ff30a43a3c248ce2d369fd3770"
SCOPE = "pcdf-2021-01-staging"
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
    states = {check["resultado"] for check in checks}
    status = "REPROVADO" if "REPROVADO" in states else "PENDENTE" if "PENDENTE" in states else "APROVADO"
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("manifesto", "aprovacao", "assinatura", "chave", "csv", "xml", "cluster"):
        parser.add_argument("--" + option, type=Path)
    parser.add_argument("--chave-sha256")
    args = parser.parse_args()
    checks = [
        requirement("ativacao", "Operação real e conta de serviço habilitadas", "PENDENTE",
                    "Modo de preparação, sem operação de gravação real",
                    "Exige liberação formal do destino e da identidade de serviço"),
    ]
    target = None
    if args.cluster is None:
        checks.append(requirement("ambiente", "Atestação PostgreSQL, RLS e privilégios", "PENDENTE",
                                  None, "Informe o manifesto local do cluster dedicado"))
    else:
        try:
            run = subprocess.run([sys.executable, "-B", str(Path(__file__).with_name("pilot_environment.py")),
                                  "--verify", str(args.cluster)], capture_output=True, text=True, check=True)
            verified = json.loads(run.stdout)
            target = verified["destino"]["cluster"]
            checks.append(verified["requisitos"][0])
        except (OSError, subprocess.CalledProcessError, ValueError, KeyError, IndexError):
            checks.append(requirement("ambiente", "Atestação PostgreSQL, RLS e privilégios", "REPROVADO",
                                      None, "Cluster dedicado não atestado"))
    inputs = (args.manifesto, args.aprovacao, args.assinatura, args.chave, args.chave_sha256, target)
    files_status, files_block = "PENDENTE", "Aguardando aprovação, CSV e XML da entrega autorizada"
    if not all(inputs):
        checks.append(requirement("manifesto", "Aprovação independente e manifesto", "PENDENTE",
                                  "Chave, aprovação assinada, destino e manifesto são entradas separadas",
                                  "APROVAÇÃO INDEPENDENTE DO MANIFESTO PENDENTE"))
    else:
        try:
            grant = approval(read_bounded(args.aprovacao, 8192), read_bounded(args.assinatura, 64),
                             read_bounded(args.chave, 4096), args.chave_sha256, target)
            manifest = read_bounded(args.manifesto, MAX_MANIFEST_BYTES)
            evidence = metadata(manifest, grant["manifesto_sha256"])
            checks.append(requirement("manifesto", "Aprovação independente e manifesto", "APROVADO", evidence))
        except (OSError, InvalidFile) as error:
            checks.append(requirement("manifesto", "Aprovação independente e manifesto", "REPROVADO",
                                      None, str(error) if isinstance(error, InvalidFile) else "entrada_inacessivel"))
        else:
            if args.csv and args.xml:
                try:
                    with args.xml.open("rb") as xml:
                        prepare_month(read_bounded(args.csv, MAX_BYTES), MONTH, manifest,
                                      grant["manifesto_sha256"], iter(lambda: xml.read(1024 * 1024), b""))
                    files_status, files_block = "APROVADO", None
                except (OSError, InvalidFile) as error:
                    files_status = "REPROVADO"
                    files_block = str(error) if isinstance(error, InvalidFile) else "entrada_inacessivel"
    checks.append(requirement("artefatos", "Bytes do XML e CSV, estrutura e proveniência",
                              files_status, None, files_block))
    outcome = report(checks)
    print(json.dumps(outcome, ensure_ascii=True))
    return {"APROVADO": 0, "PENDENTE": 2, "REPROVADO": 1}[outcome["resultado"]]


if __name__ == "__main__":
    raise SystemExit(main())
