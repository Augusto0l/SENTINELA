-- Read-only analytics of consolidated synthetic PCDF occurrences.
\ir ../sandbox/sql/guard.sql
BEGIN;
SET LOCAL search_path=pg_catalog;
GRANT USAGE ON SCHEMA sentinela TO sentinela_sbx_analyst;
GRANT SELECT(id,ativo,ra_id,data_fato,horario_fato,latitude,longitude,localizacao_status,local,versao)
 ON sentinela.ocorrencias TO sentinela_sbx_analyst;
GRANT SELECT(ocorrencia_id,natureza_id,mapeamento_id,crime_tentado)
 ON sentinela.ocorrencia_naturezas TO sentinela_sbx_analyst;
GRANT SELECT(id,descricao_original) ON sentinela.naturezas_criminais TO sentinela_sbx_analyst;
GRANT SELECT(id,natureza_id,categoria_id) ON sentinela.mapeamentos_natureza TO sentinela_sbx_analyst;
GRANT SELECT(id,nome,status) ON sentinela.categorias_criminais TO sentinela_sbx_analyst;
GRANT SELECT(id,codigo_interno,nome) ON sentinela.regioes_administrativas TO sentinela_sbx_analyst;
CREATE POLICY pcdf_analytics_occurrences ON sentinela.ocorrencias FOR SELECT TO sentinela_sbx_analyst
 USING(fonte='PCDF-SANDBOX' AND consolidacao_status='consolidada' AND ativo);
CREATE POLICY pcdf_analytics_links ON sentinela.ocorrencia_naturezas FOR SELECT TO sentinela_sbx_analyst
 USING(EXISTS(SELECT FROM sentinela.ocorrencias o WHERE o.id=ocorrencia_id));
CREATE POLICY pcdf_analytics_natures ON sentinela.naturezas_criminais FOR SELECT TO sentinela_sbx_analyst
 USING(fonte='PCDF-SANDBOX');
CREATE POLICY pcdf_analytics_mappings ON sentinela.mapeamentos_natureza FOR SELECT TO sentinela_sbx_analyst
 USING(versao='pcdf-sandbox-v1' AND status='homologado'
 AND EXISTS(SELECT FROM sentinela.naturezas_criminais n WHERE n.id=natureza_id));
CREATE POLICY pcdf_analytics_categories ON sentinela.categorias_criminais FOR SELECT TO sentinela_sbx_analyst
 USING(versao_catalogo='pcdf-sandbox-v1' AND status='homologada');
-- No RA has been validated for the PCDF fixture. Grants permit the common query,
-- while default-deny RLS keeps unqualified geography out of its read scope.
COMMIT;
