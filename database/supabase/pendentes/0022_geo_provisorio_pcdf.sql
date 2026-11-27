-- 0022 - Uso provisório das coordenadas GEO PCDF e separação da pendência documental do CRS.
-- Regra homologada: decisão do responsável de 25/11/2026 (local-pcdf-pontos-0001, 0018): Latitude/Longitude GEO
-- como graus decimais em EPSG:4326, sem comprovação formal do CRS de origem. O CRS passa a ser uma pendência
-- documental GLOBAL da fonte (registrada em auditoria), e não uma pendência individual por associação.
-- Sai da revisão funcional somente a pendência `geo_referencia_pendente`/`referencia_pendente` da associação cuja
-- ocorrência tem ponto publicado (par GEO único e válido, exatamente uma RA oficial cobre o ponto, ocorrência ativa
-- e consolidada). Ausentes, incompletas, inválidas, fora do DF ou em RA ambígua permanecem pendentes. A projeção é
-- dinâmica: novas importações publicadas pela 0018 seguem a regra sem deployment; ponto retirado reabre a pendência.
-- Nada é apagado; originais, status, staging e os tratamentos da 0019 são preservados.
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));

DO $pre$
BEGIN
  IF NOT sentinela_ambiente.vinculado()
     OR NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0018')
     OR NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0019')
     OR EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0022') THEN
    RAISE EXCEPTION 'A 0022 exige a publicacao automatica 0018 e o tratamento 0019.';
  END IF;
END $pre$;

-- Contagem por lote para o Histórico: diagnósticos GEO cuja ocorrência tem ponto publicado (dono do analítico).
SET LOCAL ROLE sentinela_ocorrencias_reader;
CREATE FUNCTION sentinela_ocorrencias_analytics.geo_publicadas_por_lote() RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_object_agg(lote_id, n), '{}'::jsonb) FROM (
    SELECT s.lote_id, count(*) n FROM sentinela.linhas_staging s
    JOIN sentinela.ocorrencia_naturezas a ON a.linha_origem_id = s.linha_origem_id
    JOIN sentinela_ocorrencias_analytics.pontos_pcdf_publicados p ON p.id = a.ocorrencia_id
    WHERE EXISTS (SELECT FROM jsonb_to_recordset(s.diagnosticos) d(field text, rule text)
      WHERE d.field = 'coordenada_status' AND d.rule IN ('geo_referencia_pendente','referencia_pendente'))
    GROUP BY s.lote_id) q
$$;
REVOKE ALL ON FUNCTION sentinela_ocorrencias_analytics.geo_publicadas_por_lote() FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA sentinela_ocorrencias_analytics TO sentinela_pcdf_historico_owner;
GRANT EXECUTE ON FUNCTION sentinela_ocorrencias_analytics.geo_publicadas_por_lote() TO sentinela_pcdf_historico_owner;
RESET ROLE;

CREATE POLICY pendencias_pcdf_geo_publicado_leitura ON sentinela.pendencias_revisao AS RESTRICTIVE
  FOR SELECT TO sentinela_ocorrencias_reader USING (NOT (
    tipo = 'coordenadas' AND versao_regra = 'pcdf-csv-avulso-v2' AND status = 'aberta'
    AND ocorrencia_id IS NULL AND associacao_id IS NULL
    AND campo = 'coordenada_status' AND regra IN ('geo_referencia_pendente','referencia_pendente')
    AND EXISTS (SELECT FROM sentinela.ocorrencia_naturezas a
      JOIN sentinela_ocorrencias_analytics.pontos_pcdf_publicados p ON p.id = a.ocorrencia_id
      WHERE a.linha_origem_id = pendencias_revisao.linha_origem_id)
  ));

-- Histórico: restantes descontam as pendências GEO retiradas pela publicação provisória (cálculo dinâmico).
GRANT CREATE ON SCHEMA sentinela_pcdf_historico TO sentinela_pcdf_historico_owner;
SET LOCAL ROLE sentinela_pcdf_historico_owner;
CREATE OR REPLACE FUNCTION sentinela_pcdf_historico.situacao_tratamento() RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  WITH geo AS (SELECT sentinela_ocorrencias_analytics.geo_publicadas_por_lote() AS n)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'month', m->>'month', 'lot', m->>'lot',
    'state', CASE WHEN t.id IS NULL THEN 'aguardando'
      WHEN t.estado = 'processando' AND t.atualizado_em <= clock_timestamp() - interval '10 minutes' THEN 'falha_recuperavel'
      WHEN t.estado = 'concluido_com_pendencias'
        AND t.restantes - coalesce((geo.n->>(m->>'lot'))::int, 0) <= 0 THEN 'concluido'
      ELSE t.estado END,
    'version', t.versao_regra,
    'treated', t.tratadas + coalesce((geo.n->>(m->>'lot'))::int, 0),
    'remaining', greatest(t.restantes - coalesce((geo.n->>(m->>'lot'))::int, 0), 0),
    'before', t.pendencias_antes,
    'attempts', t.tentativas, 'updatedAt', t.atualizado_em) ORDER BY m->>'month'), '[]'::jsonb)
  FROM jsonb_array_elements(sentinela_pcdf_historico.status()) m
  CROSS JOIN geo
  LEFT JOIN sentinela_pcdf_historico.tratamentos t
    ON t.lote_id = (m->>'lot')::uuid AND t.versao_regra = 'pcdf-tratamento-v1'
  WHERE m->>'state' = 'done' AND session_user IN ('sentinela_local_admin','sentinela_local_operator','postgres')
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA sentinela_pcdf_historico FROM sentinela_pcdf_historico_owner;

-- Auditoria: decisão aplicada, CRS como pendência documental global e coorte por competência neste instante.
DO $audit$
DECLARE v_por_competencia jsonb; v_total integer; v_sha text;
BEGIN
  WITH alvo AS (
    SELECT p.id, to_char(l.competencia, 'YYYY-MM') comp FROM sentinela.pendencias_revisao p
    JOIN sentinela.linhas_staging s USING (linha_origem_id) JOIN sentinela.lotes_importacao l ON l.id = s.lote_id
    WHERE p.tipo = 'coordenadas' AND p.versao_regra = 'pcdf-csv-avulso-v2' AND p.status = 'aberta'
      AND p.ocorrencia_id IS NULL AND p.associacao_id IS NULL AND p.campo = 'coordenada_status'
      AND p.regra IN ('geo_referencia_pendente','referencia_pendente')
      AND EXISTS (SELECT FROM sentinela.ocorrencia_naturezas a
        JOIN sentinela_ocorrencias_analytics.pcdf_pontos pp ON pp.ocorrencia_id = a.ocorrencia_id
        JOIN sentinela.ocorrencias o ON o.id = pp.ocorrencia_id AND o.versao = pp.versao_ocorrencia
          AND o.ativo AND o.consolidacao_status = 'consolidada'
        WHERE a.linha_origem_id = p.linha_origem_id))
  SELECT (SELECT jsonb_object_agg(comp, n) FROM (SELECT comp, count(*) n FROM alvo GROUP BY comp) q),
    count(*), encode(sha256(convert_to(coalesce(string_agg(id::text, ',' ORDER BY id), ''), 'UTF8')), 'hex')
  INTO v_por_competencia, v_total, v_sha FROM alvo;
  IF v_total = 0 OR (SELECT count(*) FROM sentinela.pendencias_revisao) <> 168575
     OR EXISTS (SELECT FROM sentinela.pendencias_revisao WHERE status <> 'aberta') THEN
    RAISE EXCEPTION 'Coorte GEO ou historico de pendencias fora do escopo da 0022.';
  END IF;
  INSERT INTO sentinela.eventos_auditoria(ator_tipo, servico, acao, antes, depois, justificativa)
  VALUES ('servico', 'sentinela-pcdf-geo', 'pcdf.geo_provisorio.ativado', NULL,
    jsonb_build_object('regra', 'pcdf-geo-provisorio-v1', 'decisao', 'local-pcdf-pontos-0001 (25/11/2026)',
      'crsOrigem', 'nao confirmado: pendencia documental global da fonte PCDF',
      'crsUtilizado', 'EPSG:4326 provisorio', 'pendenciasRetiradas', v_total, 'porCompetencia', v_por_competencia,
      'sha256Pendencias', v_sha, 'dinamica', true, 'historicoPreservado', true, 'statusAlterado', false),
    'Coordenadas GEO publicadas pela regra provisoria homologada; CRS da fonte segue pendente como questao documental global');
END $audit$;

INSERT INTO sentinela.schema_migrations VALUES
  ('0022', 'Uso provisorio GEO PCDF e CRS como pendencia documental global', DEFAULT);
COMMIT;
