\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL lock_timeout = '5s';
SELECT set_config('sentinela.dashboard_uuid', :'sandbox_uuid', true),
       set_config('sentinela.dashboard_system', :'sandbox_systemid', true) \gset

DO $guard$
BEGIN
  IF current_database() <> 'sentinela_pcdf_local'
    OR inet_server_addr() IS DISTINCT FROM inet '127.0.0.1'
    OR inet_server_port() IS DISTINCT FROM 55484
    OR pg_is_in_recovery()
    OR current_setting('sentinela.sandbox_uuid', true) IS DISTINCT FROM current_setting('sentinela.dashboard_uuid')
    OR (SELECT system_identifier::text FROM pg_control_system()) IS DISTINCT FROM current_setting('sentinela.dashboard_system')
    OR (SELECT count(*) FROM pg_class
        WHERE oid IN ('sentinela.ocorrencias'::regclass, 'sentinela.ocorrencia_naturezas'::regclass)
          AND relrowsecurity AND relforcerowsecurity) <> 2
    OR NOT EXISTS (
        SELECT FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE c.oid = 'sentinela_ocorrencias_analytics.ocorrencia_naturezas'::regclass
          AND c.relowner = 'sentinela_ocorrencias_reader'::regrole
          AND 'security_barrier=true' = ANY(c.reloptions)
          AND a.attname = 'categoria_pcdf_original' AND NOT a.attisdropped)
    OR NOT has_column_privilege('sentinela_ocorrencias_reader', 'sentinela.ocorrencia_naturezas', 'crime_tentado', 'SELECT')
  THEN RAISE EXCEPTION 'Instância operacional ou leitor analítico divergente';
  END IF;
END $guard$;

SET LOCAL ROLE sentinela_ocorrencias_reader;
CREATE OR REPLACE VIEW sentinela_ocorrencias_analytics.ocorrencia_naturezas WITH (security_barrier=true) AS
 SELECT a.ocorrencia_id,a.natureza_id,a.mapeamento_id,
   coalesce(l.natureza_padronizada_pcdf,n.categoria_pcdf_original) AS categoria_pcdf_original,
   a.crime_tentado
 FROM sentinela.ocorrencia_naturezas a
 JOIN sentinela.naturezas_criminais n ON n.id=a.natureza_id
 LEFT JOIN sentinela.linhas_origem l ON l.id=a.linha_origem_id;
RESET ROLE;
COMMIT;
