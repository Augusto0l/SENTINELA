"""Render the single-transaction 0012 application (or its 0013 reversal), without connecting to any database."""

import argparse
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "pendentes" / "0012_pcdf_historico_auditoria_arquivada.sql"
REVERSAL = ROOT / "pendentes" / "0013_reverte_0012.sql"


def render(after_version, version, postgis="3.3.7", expected_sha=None, source=SOURCE):
    name = source.stem
    raw = source.read_bytes()
    digest = sha256(raw).hexdigest()
    if expected_sha and digest != expected_sha:
        raise ValueError(f"SHA-256 de {source.name} diverge do revisado")
    if not (re.fullmatch(r"\d{14}", after_version) and re.fullmatch(r"\d{14}", version) and version > after_version):
        raise ValueError("Versões físicas inválidas ou fora de ordem")
    if not re.fullmatch(r"\d+\.\d+\.\d+", postgis):
        raise ValueError("Versão PostGIS inválida")
    text = raw.decode("utf8").replace("\r\n", "\n")
    body, boundaries = re.subn(r"(?m)^(?:BEGIN|COMMIT);$", "", text)
    if boundaries != 2 or "$sentinela_deployment_body$" in body or not text.rstrip().endswith("\nCOMMIT;"):
        raise ValueError(f"Estrutura transacional inesperada em {source.name}")
    guard = f"""DO $target$
BEGIN
  IF current_database() <> 'postgres' OR session_user <> 'postgres'
     OR current_setting('server_version_num') <> '170011' OR pg_is_in_recovery()
     OR extensions.postgis_lib_version() <> '{postgis}'
     OR (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '{after_version}'
     OR EXISTS (SELECT FROM supabase_migrations.schema_migrations WHERE name = '{name}') THEN
    RAISE EXCEPTION 'Banco, versões ou histórico físico divergem do pré-voo de {name}.';
  END IF;
END
$target$;
"""
    return (
        "-- Target ref: hcmqsqfbrynpfjvmuqdb. Executar somente com autorização expressa de escrita.\n"
        f"-- SHA-256 de {source.name}: {digest}\n"
        "\\set ON_ERROR_STOP on\nBEGIN;\nSET LOCAL search_path = pg_catalog, pg_temp;\nSET LOCAL lock_timeout = '5s';\n"
        f"{guard}{body}\n"
        "INSERT INTO supabase_migrations.schema_migrations (version, name, statements)\n"
        f"VALUES ('{version}', '{name}', ARRAY[$sentinela_deployment_body${body}$sentinela_deployment_body$]);\n"
        "COMMIT;\n"
    ), digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--after-version", required=True, help="Última versão física observada (14 dígitos)")
    parser.add_argument("--version", help="Versão física; padrão: agora em UTC")
    parser.add_argument("--postgis", default="3.3.7")
    parser.add_argument("--expected-sha256")
    parser.add_argument("--reversal", action="store_true", help="Renderizar a 0013 compensatória")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        version = args.version or datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        output, digest = render(args.after_version, version, args.postgis, args.expected_sha256,
                                REVERSAL if args.reversal else SOURCE)
        with args.output.open("x", encoding="utf8", newline="\n") as handle:
            handle.write(output)
        print(f"{args.output.name} sha256={digest} versao={version}")
    except (OSError, ValueError) as error:
        parser.exit(2, f"{error}\n")


if __name__ == "__main__":
    main()
