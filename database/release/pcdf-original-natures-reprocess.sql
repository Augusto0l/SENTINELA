-- Include inside the attested catalog migration, before its final COMMIT.
-- Reprocess the functional projection and record the exact cohort in append-only audit.
SELECT set_config('sentinela.catalogo_lote', :'lote', true),
       set_config('sentinela.catalogo_aprovacao', :'aprovacao', true),
       set_config('sentinela.catalogo_responsavel', :'responsavel', true),
       set_config('sentinela.catalogo_pendencias_sha', :'pendencias_sha', true);

DO $reprocess$
DECLARE
  lote uuid := current_setting('sentinela.catalogo_lote')::uuid;
  responsavel uuid := current_setting('sentinela.catalogo_responsavel')::uuid;
  aprovacao text := current_setting('sentinela.catalogo_aprovacao');
  escopo jsonb;
  assinatura text;
BEGIN
  IF NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='local-pcdf-naturezas-0001')
    OR current_setting('sentinela.sandbox_uuid',true) IS DISTINCT FROM current_setting('sentinela.catalogo_expected_uuid')
    OR (SELECT system_identifier::text FROM pg_control_system()) IS DISTINCT FROM current_setting('sentinela.catalogo_expected_system')
    OR length(btrim(aprovacao)) NOT BETWEEN 1 AND 240
    OR NOT EXISTS (SELECT FROM sentinela.usuarios u WHERE u.id=responsavel AND u.ativo AND u.perfil='Administrador')
  THEN RAISE EXCEPTION 'Migração atestada, aprovação e administrador ativo são obrigatórios'; END IF;

  IF EXISTS (SELECT FROM sentinela.eventos_auditoria e WHERE e.acao='catalogo.pcdf.pendencias_reavaliadas'
      AND e.depois->>'lote'=lote::text)
  THEN RAISE EXCEPTION 'O lote já tem registro de reprocessamento do catálogo'; END IF;

  IF NOT EXISTS (SELECT FROM sentinela.lotes_importacao l JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id
      WHERE l.id=lote AND l.competencia='2021-01-01' AND l.versao_contrato='2.0' AND x.fonte='PCDF')
    OR (SELECT count(*) FROM sentinela.linhas_staging s WHERE s.lote_id=lote)<>6393
    OR EXISTS (
      SELECT FROM sentinela.linhas_staging s JOIN sentinela.linhas_origem o ON o.id=s.linha_origem_id
      WHERE s.lote_id=lote AND (s.ocorrencia_id IS NOT NULL OR s.associacao_id IS NOT NULL
        OR sentinela.descricao_pcdf(o.natureza_original) IS DISTINCT FROM true
        OR o.natureza_original COLLATE "C" IS DISTINCT FROM (s.campos_csv->>'natureza_original') COLLATE "C"
        OR EXISTS (SELECT FROM sentinela.linhas_staging outra
          WHERE outra.linha_origem_id=s.linha_origem_id AND outra.lote_id<>lote)))
  THEN RAISE EXCEPTION 'Lote, descrições originais ou vínculos divergentes do escopo aprovado'; END IF;

  SELECT jsonb_agg(p.id ORDER BY p.id),
     encode(sha256(convert_to(string_agg(p.id::text,',' ORDER BY p.id),'UTF8')),'hex')
    INTO escopo,assinatura
  FROM sentinela.pendencias_revisao p
  WHERE p.tipo='classificacao' AND p.campo='classificacao_status' AND p.regra='classificacao_pendente'
    AND p.status='aberta' AND p.efeito='bloqueia_consolidacao'
    AND EXISTS(SELECT FROM sentinela.linhas_staging s WHERE s.lote_id=lote AND s.linha_origem_id=p.linha_origem_id);
  IF jsonb_array_length(escopo) IS DISTINCT FROM 6393
    OR assinatura IS DISTINCT FROM current_setting('sentinela.catalogo_pendencias_sha')
    OR (SELECT count(*) FROM sentinela.pendencias_revisao p WHERE
      (p.campo='classificacao_status' AND p.regra IN ('classificacao_pendente','classificacao_nao_verificada'))
      OR (p.campo='natureza_sentinela_codigo' AND p.regra IN ('mapeamento_a_homologar','classificacao_pendente'))
      OR (p.campo='natureza_padronizada_pcdf' AND p.regra IN ('rotulo_criminal_pendente','categoria_fora_do_catalogo'))) <> 6393
  THEN RAISE EXCEPTION 'Conjunto exato de pendências diverge da prévia aprovada'; END IF;

  INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,antes,depois,justificativa)
  VALUES('servico','sentinela-catalogo-pcdf','catalogo.pcdf.pendencias_reavaliadas',
    jsonb_build_object('pendenciasAbertasAfetadas',6393,'efeitoAnterior','bloqueia_consolidacao'),
    jsonb_build_object('lote',lote,'pendencias',escopo,'sha256Pendencias',assinatura,
      'projecao','obsoleta_por_catalogo_original','registroHistoricoPreservado',true,
      'responsavelAprovacao',responsavel,'referenciaAprovacao',aprovacao),
    'Reavaliação em lote da exigência legada de classificação após conferência literal do XML PCDF');
END
$reprocess$;
