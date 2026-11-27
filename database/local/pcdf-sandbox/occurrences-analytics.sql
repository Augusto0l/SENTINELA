-- Read-only extension of the attested local occurrence reader.
BEGIN;
SET LOCAL search_path=pg_catalog,pg_temp;
SET LOCAL lock_timeout='5s';
SELECT set_config('sentinela.analytics_expected_uuid', :'expected_uuid', true),
       set_config('sentinela.analytics_expected_system', :'expected_system', true);
DO $$
BEGIN
  IF current_database()<>'sentinela_pcdf_local' OR inet_server_addr() IS DISTINCT FROM inet '127.0.0.1'
    OR NOT coalesce(inet_server_port() IN (55484,55488),false)
    OR nullif(current_setting('sentinela.sandbox_uuid',true),'') IS NULL
    OR current_setting('sentinela.sandbox_uuid',true) IS DISTINCT FROM current_setting('sentinela.analytics_expected_uuid')
    OR (SELECT system_identifier::text FROM pg_control_system()) IS DISTINCT FROM current_setting('sentinela.analytics_expected_system')
    OR current_setting('server_version_num')<>'170011'
    OR NOT EXISTS (SELECT FROM pg_extension WHERE extname='postgis' AND extversion='3.6.2'
      AND extnamespace='extensions'::regnamespace)
    OR to_regprocedure('sentinela_ocorrencias_local.identidade()') IS NULL
    OR (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r'
      AND relrowsecurity AND relforcerowsecurity)<>19
  THEN RAISE EXCEPTION 'Destino atestado e leitor local de ocorrências são obrigatórios'; END IF;
END $$;

CREATE SCHEMA sentinela_ocorrencias_analytics AUTHORIZATION sentinela_ocorrencias_reader;
REVOKE ALL ON SCHEMA sentinela_ocorrencias_analytics FROM PUBLIC;
GRANT SELECT (id,natureza_id,categoria_id,status) ON sentinela.mapeamentos_natureza TO sentinela_ocorrencias_reader;
GRANT SELECT (id,nome,status) ON sentinela.categorias_criminais TO sentinela_ocorrencias_reader;
CREATE POLICY ocorrencias_analytics_mapping ON sentinela.mapeamentos_natureza FOR SELECT TO sentinela_ocorrencias_reader
 USING (status='homologado');
CREATE POLICY ocorrencias_analytics_category ON sentinela.categorias_criminais FOR SELECT TO sentinela_ocorrencias_reader
 USING (status='homologada');

-- View owner is subject to the consolidated-occurrence and association RLS policies.
SET LOCAL ROLE sentinela_ocorrencias_reader;
CREATE VIEW sentinela_ocorrencias_analytics.ocorrencias WITH (security_barrier=true) AS
 SELECT id,ativo,ra_id,data_fato,horario_fato,latitude,longitude,localizacao_status FROM sentinela.ocorrencias
 WHERE ativo AND consolidacao_status='consolidada';
CREATE VIEW sentinela_ocorrencias_analytics.ocorrencia_naturezas WITH (security_barrier=true) AS
 SELECT ocorrencia_id,natureza_id,mapeamento_id FROM sentinela.ocorrencia_naturezas;
CREATE VIEW sentinela_ocorrencias_analytics.naturezas_criminais WITH (security_barrier=true) AS
 SELECT id,descricao_original FROM sentinela.naturezas_criminais n WHERE EXISTS
  (SELECT FROM sentinela_ocorrencias_analytics.ocorrencia_naturezas a WHERE a.natureza_id=n.id);
CREATE VIEW sentinela_ocorrencias_analytics.mapeamentos_natureza WITH (security_barrier=true) AS
 SELECT id,natureza_id,categoria_id FROM sentinela.mapeamentos_natureza m WHERE EXISTS
  (SELECT FROM sentinela_ocorrencias_analytics.ocorrencia_naturezas a WHERE a.mapeamento_id=m.id);
CREATE VIEW sentinela_ocorrencias_analytics.categorias_criminais WITH (security_barrier=true) AS
 SELECT id,nome,status FROM sentinela.categorias_criminais;
CREATE VIEW sentinela_ocorrencias_analytics.regioes_administrativas WITH (security_barrier=true) AS
 SELECT id,codigo_interno,nome FROM sentinela.regioes_administrativas;
RESET ROLE;

GRANT USAGE ON SCHEMA sentinela_ocorrencias_analytics TO sentinela_local_admin,sentinela_local_operator,sentinela_local_analyst;
GRANT SELECT ON ALL TABLES IN SCHEMA sentinela_ocorrencias_analytics
 TO sentinela_local_admin,sentinela_local_operator,sentinela_local_analyst;
COMMIT;
