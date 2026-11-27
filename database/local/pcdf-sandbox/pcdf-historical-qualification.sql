BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH by_identity AS MATERIALIZED (
 SELECT ocorrencia_id,count(*) AS links,count(DISTINCT natureza_id) AS distinct_natures
 FROM sentinela.ocorrencia_naturezas GROUP BY 1
), audits AS MATERIALIZED (
 SELECT a.execucao_id,a.transacao_id,l.competencia,l.sha256_arquivo,x.manifesto,
   a.depois->>'csvSha256' AS stamped_hash,a.depois->>'xmlSha256' AS xml_hash
 FROM sentinela.eventos_auditoria a
 JOIN sentinela.execucoes_importacao e ON e.id=a.execucao_id
 JOIN sentinela.lotes_importacao l ON l.id=e.lote_id
 JOIN sentinela.extracoes_origem x ON x.id=e.extracao_id
 WHERE a.acao='pcdf.consolidacao_historica'
)
SELECT jsonb_build_object(
 'competencias',(SELECT count(DISTINCT competencia) FROM sentinela.lotes_importacao),
 'associacoes',(SELECT count(*) FROM sentinela.linhas_origem),
 'ocorrencias',(SELECT count(*) FROM sentinela.ocorrencias WHERE consolidacao_status='consolidada'),
 'vinculos',(SELECT count(*) FROM sentinela.ocorrencia_naturezas),
 'multiplasNaturezas',(SELECT count(*) FROM by_identity WHERE distinct_natures>1),
 'chavesComMultiplosVinculos',(SELECT count(*) FROM by_identity WHERE links>1),
 'horariosNulos',(SELECT count(*) FROM sentinela.ocorrencias WHERE horario_fato IS NULL),
 'datasNulas',(SELECT count(*) FROM sentinela.ocorrencias WHERE data_fato IS NULL),
 'semGeo',(SELECT count(*) FROM sentinela.ocorrencias WHERE localizacao_status='ausente'),
 'geoPublicada',(SELECT count(*) FROM sentinela.ocorrencias WHERE geometria IS NOT NULL OR latitude IS NOT NULL
    OR longitude IS NOT NULL OR ra_id IS NOT NULL),
 'pendenciasHistoricas',(SELECT count(*) FROM sentinela.pendencias_revisao),
 'pendenciasPorTipo',(SELECT jsonb_object_agg(tipo,total) FROM (
    SELECT tipo,count(*) AS total FROM sentinela.pendencias_revisao GROUP BY 1) p),
 'auditoria',(SELECT count(*) FROM audits),
 'auditoriaDivergente',(SELECT count(*) FROM audits a
   WHERE a.stamped_hash IS DISTINCT FROM a.sha256_arquivo
   OR a.xml_hash IS DISTINCT FROM 'faf82ae0620fa3ecc53bc002d9c2e49b24b6ec0126a44449510d12948dc0a022'
   OR NOT EXISTS(SELECT FROM sentinela.eventos_auditoria s WHERE s.execucao_id=a.execucao_id
          AND s.acao IN ('staging_pcdf','reenvio_pcdf') AND s.transacao_id=a.transacao_id)),
 'foreignKeysPendentes',(SELECT count(*) FROM pg_constraint
   WHERE connamespace='sentinela'::regnamespace AND contype='f' AND NOT convalidated),
 'rlsForcada',(SELECT count(*) FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace
   WHERE n.nspname IN ('sentinela','sentinela_pcdf_historico') AND relkind='r' AND relrowsecurity AND relforcerowsecurity));
ROLLBACK;
