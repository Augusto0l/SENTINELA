-- Reversão compensatória da 0022: as pendências GEO voltam à revisão funcional e o Histórico volta aos totais
-- da 0019. Os pontos publicados pela 0018 não são alterados (reversão própria da 0018, se necessária).
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));

DO $pre$
BEGIN
  IF NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0022')
     OR EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='reverter-0022') THEN
    RAISE EXCEPTION 'A reversao exige a 0022 aplicada e ainda nao revertida.';
  END IF;
END $pre$;

DROP POLICY pendencias_pcdf_geo_publicado_leitura ON sentinela.pendencias_revisao;

GRANT CREATE ON SCHEMA sentinela_pcdf_historico TO sentinela_pcdf_historico_owner;
SET LOCAL ROLE sentinela_pcdf_historico_owner;
CREATE OR REPLACE FUNCTION sentinela_pcdf_historico.situacao_tratamento() RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'month', m->>'month', 'lot', m->>'lot',
    'state', CASE WHEN t.id IS NULL THEN 'aguardando'
      WHEN t.estado = 'processando' AND t.atualizado_em <= clock_timestamp() - interval '10 minutes' THEN 'falha_recuperavel'
      ELSE t.estado END,
    'version', t.versao_regra, 'treated', t.tratadas, 'remaining', t.restantes, 'before', t.pendencias_antes,
    'attempts', t.tentativas, 'updatedAt', t.atualizado_em) ORDER BY m->>'month'), '[]'::jsonb)
  FROM jsonb_array_elements(sentinela_pcdf_historico.status()) m
  LEFT JOIN sentinela_pcdf_historico.tratamentos t
    ON t.lote_id = (m->>'lot')::uuid AND t.versao_regra = 'pcdf-tratamento-v1'
  WHERE m->>'state' = 'done' AND session_user IN ('sentinela_local_admin','sentinela_local_operator','postgres')
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA sentinela_pcdf_historico FROM sentinela_pcdf_historico_owner;

SET LOCAL ROLE sentinela_ocorrencias_reader;
DROP FUNCTION sentinela_ocorrencias_analytics.geo_publicadas_por_lote();
REVOKE USAGE ON SCHEMA sentinela_ocorrencias_analytics FROM sentinela_pcdf_historico_owner;
RESET ROLE;

INSERT INTO sentinela.eventos_auditoria(ator_tipo, servico, acao, depois, justificativa)
VALUES ('servico', 'sentinela-pcdf-geo', 'pcdf.geo_provisorio.revertido',
  jsonb_build_object('regra', 'pcdf-geo-provisorio-v1', 'historicoPreservado', true),
  'Reversão compensatória da retirada funcional das pendências GEO publicadas');
INSERT INTO sentinela.schema_migrations VALUES ('reverter-0022', 'Reversao do uso provisorio GEO PCDF', DEFAULT);
COMMIT;
