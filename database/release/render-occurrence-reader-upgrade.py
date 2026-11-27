"""Render the existing UUID-scoped reader as a guarded operational upgrade."""

from argparse import ArgumentParser
from pathlib import Path


SOURCE = Path(__file__).resolve().parents[1] / "local/pcdf-sandbox/occurrences-read.sql"
FUNCTION = "CREATE FUNCTION sentinela_ocorrencias_local.lista("
NEXT_FUNCTION = "CREATE FUNCTION sentinela_ocorrencias_local.detalhe("
GUARD = """
\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
SELECT set_config('sentinela.reader_expected_uuid', :'cluster_uuid', true) AS reader_uuid,
       set_config('sentinela.reader_expected_system', :'system_id', true) AS reader_system,
       set_config('sentinela.reader_expected_definition', :'reader_md5', true) AS reader_definition
\\gset
DO $guard$
DECLARE reader regprocedure := to_regprocedure('sentinela_ocorrencias_local.lista(text,jsonb,integer,text,text)');
BEGIN
  IF current_database() <> 'sentinela_pcdf_local' OR inet_server_port() IS DISTINCT FROM 55484
    OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
    OR current_setting('sentinela.reader_expected_uuid') = ''
    OR current_setting('sentinela.sandbox_uuid', true) IS DISTINCT FROM current_setting('sentinela.reader_expected_uuid')
    OR (SELECT system_identifier::text FROM pg_control_system()) IS DISTINCT FROM current_setting('sentinela.reader_expected_system')
    OR current_setting('server_version_num') <> '170011'
    OR NOT EXISTS (SELECT FROM pg_extension WHERE extname='postgis' AND extversion='3.6.2')
    OR reader IS NULL
    OR md5(pg_get_functiondef(reader)) IS DISTINCT FROM current_setting('sentinela.reader_expected_definition')
    OR NOT EXISTS (
      SELECT FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
      WHERE p.oid = reader AND p.prosecdef AND r.rolname = 'sentinela_ocorrencias_reader'
        AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcanlogin)
    )
    OR (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace
      AND relkind='r' AND relrowsecurity AND relforcerowsecurity) <> 19
  THEN
    RAISE EXCEPTION 'Destino, função de leitura ou RLS divergente';
  END IF;
END
$guard$;
"""


def render():
    source = SOURCE.read_text(encoding="utf-8")
    if source.count(FUNCTION) != 1 or source.count(NEXT_FUNCTION) != 1:
        raise ValueError("Interface de leitura mudou. Revise o delta.")
    _, _, tail = source.partition(FUNCTION)
    body, _, _ = tail.partition(NEXT_FUNCTION)
    if not body.strip().endswith("$$;") or "p.lote=($1->>'lote')::uuid" not in body:
        raise ValueError("Definição do leitor sem filtro por UUID. Revise o delta.")
    return GUARD.lstrip() + FUNCTION.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION") + body + "COMMIT;\n"


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Arquivo SQL novo, gravado em UTF-8")
    output = parser.parse_args().output
    sql = render()
    if output:
        with output.open("x", encoding="utf-8", newline="\n") as target:
            target.write(sql)
    else:
        print(sql, end="")
