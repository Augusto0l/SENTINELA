-- Adds issuer-supplied codes to the existing manual catalog; it loads no catalog rows.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, pg_temp;
SELECT set_config('sentinela.manual_expected_uuid', :'expected_uuid', true);
DO $guard$
BEGIN
  IF current_database() <> 'sentinela_pcdf_local' OR host(inet_server_addr()) <> '127.0.0.1'
    OR inet_server_port() NOT IN (55484,55486)
    OR current_setting('sentinela.sandbox_uuid',true) IS DISTINCT FROM current_setting('sentinela.manual_expected_uuid')
    OR to_regprocedure('sentinela_ocorrencias_manual.catalogo()') IS NULL
    OR NOT EXISTS (SELECT FROM pg_class WHERE oid='sentinela.naturezas_criminais'::regclass AND relrowsecurity AND relforcerowsecurity)
  THEN RAISE EXCEPTION 'Destino local atestado e catálogo manual instalado são obrigatórios'; END IF;
END
$guard$;

ALTER TABLE sentinela.naturezas_criminais ADD COLUMN codigo_manual text
  CHECK (codigo_manual IS NULL OR (fonte='SENTINELA_MANUAL'
    AND codigo_manual=btrim(codigo_manual) AND length(codigo_manual) BETWEEN 1 AND 80));
CREATE UNIQUE INDEX natureza_manual_codigo_unico ON sentinela.naturezas_criminais (lower(codigo_manual))
  WHERE codigo_manual IS NOT NULL;
GRANT SELECT (codigo_manual) ON sentinela.naturezas_criminais TO sentinela_manual_writer;

CREATE OR REPLACE FUNCTION sentinela_ocorrencias_manual.catalogo() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object(
   'regioes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'codigo',codigo_interno,'nome',nome) ORDER BY nome)
     FROM sentinela.regioes_administrativas),'[]'::jsonb),
   'naturezas',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'descricao',descricao_original,'codigo',codigo_manual)
     ORDER BY descricao_original,id) FROM sentinela.naturezas_criminais),'[]'::jsonb))
 WHERE session_user IN ('sentinela_local_admin','sentinela_local_operator');
$$;
INSERT INTO sentinela.schema_migrations(versao,descricao) VALUES ('local-manual-0002','Códigos institucionais do catálogo manual');
COMMIT;
