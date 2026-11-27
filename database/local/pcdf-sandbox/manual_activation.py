"""Render the reviewed activation transaction without connecting to PostgreSQL."""

import argparse
from hashlib import sha256
from pathlib import Path

from manual_catalog_seed import nature_rows, require, seed_sql, synthetic_nature_catalog, territory_rows

HERE = Path(__file__).resolve().parent
MIGRATIONS = {
    "manual-occurrences.sql": "baa6f5f782c3c3949fa1b0e0d1260807c32bbdacf99c9b042503e074eebec972",
    "manual-catalog-codes.sql": "47fbe06a78bbeb0ab1bbeb87c0500c5280cf52aff4232d5a5ddbbcb02a5b2529",
    "manual-catalog-release.sql": "ea34257bcd2971a43ebdb9adc6a9c2210577a1ff84a80df9c49e8d05deb2bc02",
}


def transaction_body(sql):
    lines = sql.strip().splitlines()
    start = lines.index("BEGIN;")
    require(all(line.startswith("--") for line in lines[:start]) and lines[-1] == "COMMIT;",
            "Migration deve conter uma única transação externa")
    return "\n".join(lines[start + 1:-1])


def activation_sql(manifest, digest, *, synthetic=False, territorial_only=False):
    require(not territorial_only or (manifest is None and digest is None and not synthetic),
            "A preparação territorial usa somente a fonte IDE/DF revisada")
    require(territorial_only or (manifest is not None and digest is not None),
            "Informe o manifesto de naturezas e o SHA-256 de seu ato de aprovação")
    natures = [] if territorial_only else nature_rows(manifest, digest)
    territories = territory_rows()
    port = 55486 if synthetic else 55484
    require(synthetic or not synthetic_nature_catalog(natures),
            "O manifesto de ensaio é exclusivo da porta sintética")
    bodies = []
    for name, checksum in MIGRATIONS.items():
        data = (HERE / name).read_bytes()
        require(sha256(data).hexdigest() == checksum, f"SHA-256 divergente em {name}")
        bodies.append(transaction_body(data.decode("utf8")))
    bodies.append(transaction_body(seed_sql(territories, "ra")))
    if territorial_only:
        bodies.append("""REVOKE EXECUTE ON FUNCTION sentinela_ocorrencias_manual.cadastrar(jsonb,uuid,text)
 FROM sentinela_local_admin,sentinela_local_operator;""")
    else:
        bodies.extend(("ALTER TABLE pg_temp.carga_catalogo RENAME TO carga_catalogo_ra;",
                       transaction_body(seed_sql(natures, "natureza", synthetic_only=synthetic))))
    preflight = f"""\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, pg_temp;
SELECT set_config('sentinela.manual_expected_uuid', :'expected_uuid', true),
  set_config('sentinela.manual_expected_system', :'expected_system', true);
SELECT pg_advisory_xact_lock(hashtext('sentinela-ativacao-manual'));
DO $guard$
BEGIN
  IF current_database() <> 'sentinela_pcdf_local' OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
    OR inet_server_port() IS DISTINCT FROM {port}
    OR current_setting('sentinela.sandbox_uuid',true) IS DISTINCT FROM current_setting('sentinela.manual_expected_uuid')
    OR (SELECT system_identifier::text FROM pg_control_system()) <> current_setting('sentinela.manual_expected_system')
    OR to_regprocedure('sentinela_ocorrencias_local.identidade()') IS NULL
    OR to_regnamespace('sentinela_ocorrencias_manual') IS NOT NULL
    OR EXISTS (SELECT FROM pg_roles WHERE rolname IN ('sentinela_manual_writer','sentinela_manual_reader'))
    OR EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao LIKE 'local-manual-%')
    OR EXISTS (SELECT FROM sentinela.regioes_administrativas)
    OR EXISTS (SELECT FROM sentinela.naturezas_criminais WHERE fonte='SENTINELA_MANUAL')
  THEN RAISE EXCEPTION 'Destino, estado inicial ou versões divergentes do pacote de ativação'; END IF;
END
$guard$;
"""
    can_create = "false" if territorial_only else "true"
    postflight = f"""
DO $guard$
BEGIN
  IF (SELECT count(*) FROM sentinela.regioes_administrativas) <> {len(territories)}
    OR (SELECT count(*) FROM sentinela.naturezas_criminais WHERE fonte='SENTINELA_MANUAL') <> {len(natures)}
    OR (SELECT count(*) FROM sentinela.schema_migrations WHERE versao IN
      ('local-manual-0001','local-manual-0002','local-manual-0003')) <> 3
    OR NOT EXISTS (SELECT FROM pg_class WHERE oid='sentinela_ocorrencias_manual.cadastros'::regclass
       AND relrowsecurity AND relforcerowsecurity)
    OR to_regprocedure('sentinela_ocorrencias_manual.catalogo(text)') IS NULL
    OR has_function_privilege('sentinela_local_analyst','sentinela_ocorrencias_manual.cadastrar(jsonb,uuid,text)','EXECUTE')
    OR has_function_privilege('sentinela_local_admin','sentinela_ocorrencias_manual.cadastrar(jsonb,uuid,text)','EXECUTE') IS DISTINCT FROM {can_create}
    OR has_function_privilege('sentinela_local_operator','sentinela_ocorrencias_manual.cadastrar(jsonb,uuid,text)','EXECUTE') IS DISTINCT FROM {can_create}
  THEN RAISE EXCEPTION 'Verificação transacional da ativação falhou'; END IF;
END
$guard$;
COMMIT;
"""
    return preflight + "\n".join(bodies) + postflight


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifesto", type=Path, nargs="?")
    parser.add_argument("--sha256")
    parser.add_argument("--somente-catalogo-territorial", action="store_true")
    parser.add_argument("--saida", required=True, type=Path)
    args = parser.parse_args()
    try:
        sql = activation_sql(args.manifesto, args.sha256, territorial_only=args.somente_catalogo_territorial).encode("utf8")
        with args.saida.open("xb") as output:
            output.write(sql)
    except (ValueError, OSError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
