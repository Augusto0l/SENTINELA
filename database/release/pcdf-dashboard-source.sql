BEGIN;
SET LOCAL lock_timeout='5s';
SELECT set_config('sentinela.dashboard_uuid',:'cluster_uuid',true),
       set_config('sentinela.dashboard_system',:'system_id',true) \gset
DO $guard$
BEGIN
 IF current_database()<>'sentinela_pcdf_local' OR inet_server_addr() IS DISTINCT FROM inet '127.0.0.1'
 OR inet_server_port() IS DISTINCT FROM 55484 OR pg_is_in_recovery()
 OR current_setting('sentinela.sandbox_uuid',true) IS DISTINCT FROM current_setting('sentinela.dashboard_uuid')
 OR (SELECT system_identifier::text FROM pg_control_system()) IS DISTINCT FROM current_setting('sentinela.dashboard_system')
 OR NOT EXISTS (SELECT FROM pg_class WHERE oid='sentinela.ocorrencias'::regclass AND relrowsecurity AND relforcerowsecurity)
 OR NOT EXISTS (SELECT FROM pg_class WHERE oid='sentinela_ocorrencias_analytics.ocorrencias'::regclass
    AND relowner='sentinela_ocorrencias_reader'::regrole AND 'security_barrier=true'=ANY(reloptions))
 THEN RAISE EXCEPTION 'Instância ou leitor analítico divergente'; END IF;
END $guard$;
SET LOCAL ROLE sentinela_ocorrencias_reader;
CREATE OR REPLACE VIEW sentinela_ocorrencias_analytics.ocorrencias WITH (security_barrier=true) AS
 SELECT id,ativo,ra_id,data_fato,horario_fato,latitude,longitude,localizacao_status,fonte,origem
 FROM sentinela.ocorrencias WHERE ativo AND consolidacao_status='consolidada';
RESET ROLE;
COMMIT;
