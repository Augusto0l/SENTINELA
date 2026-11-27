-- Executar dentro da mesma transação da recepção, somente em clone atestado.
DO $guard$
BEGIN
 IF inet_server_port() IS DISTINCT FROM 55487 OR current_database() <> 'sentinela_pcdf_local'
   OR current_setting('sentinela.sandbox_uuid',true) IS DISTINCT FROM current_setting('sentinela.history_uuid')
   OR (SELECT system_identifier::text FROM pg_control_system()) IS DISTINCT FROM current_setting('sentinela.history_system')
   OR current_setting('sentinela.history_uuid')='c04244a6-bc8d-4491-98bc-9af8a268d30c'
   OR current_setting('sentinela.history_system')='7710764288366362848'
 THEN RAISE EXCEPTION 'A consolidação histórica exige o clone atestado'; END IF;
END $guard$;

SELECT pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
CREATE TEMP TABLE history_input ON COMMIT DROP AS
 SELECT l.id, l.competencia, e.id AS execucao, l.sha256_arquivo AS sha256, l.linhas_esperadas
 FROM sentinela.lotes_importacao l JOIN sentinela.execucoes_importacao e ON (e.lote_id,e.extracao_id)=(l.id,l.extracao_id)
 JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id
 WHERE l.id=current_setting('sentinela.history_lot')::uuid AND e.id=current_setting('sentinela.history_run')::uuid
   AND l.competencia=current_setting('sentinela.history_month')::date AND l.competencia>'2021-01-01'
   AND l.sha256_arquivo=current_setting('sentinela.history_sha') AND l.versao_contrato='2.0'
   AND e.status='concluida' AND e.linhas_processadas=l.linhas_esperadas
   AND x.fonte='PCDF' AND x.metodologia='pcdf-csv-avulso-v2';

DO $input$
BEGIN
 IF (SELECT count(*) FROM history_input)<>1 THEN RAISE EXCEPTION 'Lote e hash não conciliados'; END IF;
 IF (SELECT count(*) FROM sentinela.linhas_staging s JOIN history_input h ON h.execucao=s.execucao_id)
   <> (SELECT linhas_esperadas FROM history_input)
 THEN RAISE EXCEPTION 'Quantidade de origens não conciliada'; END IF;
END $input$;

CREATE TEMP TABLE history_staged ON COMMIT DROP AS
 SELECT s.linha_origem_id,s.campos_csv,o.ano_registro,o.unidade_registro,o.numero_registro,
   o.natureza_original,o.crime_tentado,o.flagrante,o.unidade_apuracao,
   o.latitude_geo_original AS lat,o.longitude_geo_original AS lon,
   sentinela_pcdf_local.efetivos_csv_v1(s.campos_csv,h.competencia) AS efetivos,
   (o.ano_registro,o.unidade_registro,o.numero_registro) IS NOT DISTINCT FROM
     (s.campos_csv->>'ano_registro',s.campos_csv->>'unidade_registro',s.campos_csv->>'numero_registro') AS conciliada
 FROM history_input h JOIN sentinela.linhas_staging s ON (s.lote_id,s.execucao_id)=(h.id,h.execucao)
 JOIN sentinela.linhas_origem o ON (o.id,o.extracao_id)=(s.linha_origem_id,s.extracao_id)
 WHERE s.estado='recebida' AND s.ocorrencia_id IS NULL AND s.associacao_id IS NULL;

CREATE TEMP TABLE history_groups ON COMMIT DROP AS
 WITH literal AS (
   SELECT ano_registro,unidade_registro,numero_registro,
     array_agg(linha_origem_id ORDER BY linha_origem_id) AS origens,
     bool_and(conciliada AND efetivos->>'chave' IS NOT NULL) AS identidade_valida,
     count(DISTINCT efetivos->>'data') AS datas_distintas,
     bool_or(ano_registro < left(efetivos->>'data',4)) AS ano_incompativel,
     min(efetivos->>'data')::date AS data_fato,
     CASE WHEN count(DISTINCT efetivos->>'horario')=1 THEN min(efetivos->>'horario')::time END AS horario_fato,
     CASE WHEN count(DISTINCT nullif(campos_csv->>'local',''))=1 THEN min(nullif(campos_csv->>'local','')) END AS local,
     CASE WHEN count(DISTINCT flagrante)=1 THEN CASE min(flagrante) WHEN 'SIM' THEN true WHEN 'NÃO' THEN false END END AS flagrante,
     CASE WHEN count(DISTINCT unidade_apuracao) FILTER (WHERE sentinela_pcdf_revisao.informado(unidade_apuracao))=1
       THEN min(unidade_apuracao) FILTER (WHERE sentinela_pcdf_revisao.informado(unidade_apuracao)) END AS unidade_apuracao,
     CASE WHEN count(DISTINCT jsonb_build_array(lat,lon))=1 THEN min(efetivos->>'geo') ELSE 'divergente' END AS geo
   FROM history_staged GROUP BY 1,2,3
 ), scope AS (
   SELECT btrim(s.campos_csv->>'ano_registro') AS ano,btrim(s.campos_csv->>'unidade_registro') AS unidade,
     btrim(s.campos_csv->>'numero_registro') AS numero,
     array_agg(s.linha_origem_id ORDER BY s.linha_origem_id) AS origens,
     bool_and(s.lote_id=h.id) AS mesmo_lote
   FROM sentinela.linhas_staging s CROSS JOIN history_input h
   WHERE s.campos_csv->>'fonte'='PCDF' GROUP BY 1,2,3
 )
 SELECT a.*, CASE
   WHEN NOT a.identidade_valida THEN 'identidade_literal_insuficiente'
   WHEN a.ano_incompativel THEN 'ano_registro_anterior_ao_fato'
   WHEN a.datas_distintas>1 THEN 'datas_de_fato_divergentes'
   WHEN g.mesmo_lote IS DISTINCT FROM true THEN 'identidade_em_outro_lote'
   WHEN g.origens IS DISTINCT FROM a.origens THEN 'identidade_colisao_de_espacos'
   ELSE NULL END AS motivo
 FROM literal a LEFT JOIN scope g
 ON (g.ano,g.unidade,g.numero)=(btrim(a.ano_registro),btrim(a.unidade_registro),btrim(a.numero_registro));

CREATE TEMP TABLE history_candidates ON COMMIT DROP AS
 SELECT gen_random_uuid() AS id,a.* FROM history_groups a WHERE a.motivo IS NULL
 AND NOT EXISTS (SELECT FROM sentinela.ocorrencias o WHERE o.fonte='PCDF'
   AND (btrim(o.ano_registro),btrim(o.unidade_registro),btrim(o.numero_registro))=
       (btrim(a.ano_registro),btrim(a.unidade_registro),btrim(a.numero_registro)));

DO $cohort$
DECLARE previous boolean;
BEGIN
 IF (SELECT count(*) FROM history_staged)<>(SELECT linhas_esperadas FROM history_input)
 THEN RAISE EXCEPTION 'Staging divergente da recepção'; END IF;
 SELECT EXISTS (SELECT FROM sentinela.eventos_auditoria a JOIN history_input h ON a.execucao_id=h.execucao
   WHERE a.acao='pcdf.consolidacao_historica' AND a.depois->>'csvSha256'=h.sha256) INTO previous;
 IF (previous AND EXISTS (SELECT FROM history_candidates))
 OR (NOT previous AND (SELECT count(*) FROM history_candidates)<>(SELECT count(*) FROM history_groups WHERE motivo IS NULL))
 THEN RAISE EXCEPTION 'Coorte parcialmente consolidada ou identidade já existente sem vínculo neste lote'; END IF;
 IF previous AND EXISTS (
   SELECT FROM history_groups g CROSS JOIN LATERAL unnest(g.origens) source(id)
   LEFT JOIN sentinela.ocorrencia_naturezas a ON a.linha_origem_id=source.id
   LEFT JOIN sentinela.ocorrencias o ON o.id=a.ocorrencia_id
   WHERE (g.motivo IS NULL AND (o.id IS NULL OR (o.ano_registro,o.unidade_registro,o.numero_registro)
     IS DISTINCT FROM (g.ano_registro,g.unidade_registro,g.numero_registro)))
      OR (g.motivo IS NOT NULL AND a.id IS NOT NULL))
 THEN RAISE EXCEPTION 'Reexecução com vínculos divergentes'; END IF;
END $cohort$;

INSERT INTO sentinela.ocorrencias(id,origem,fonte,ano_registro,unidade_registro,numero_registro,versao_identidade,
 identidade_status,evidencia_identidade,data_fato,horario_fato,local,flagrante,unidade_apuracao,localizacao_status,
 consolidacao_status)
SELECT c.id,'importacao','PCDF',c.ano_registro,c.unidade_registro,c.numero_registro,'pcdf-tupla-conferida-v1',
 'homologada','Tupla literal conciliada com a origem e o CSV '||h.sha256,
 c.data_fato,c.horario_fato,c.local,c.flagrante,c.unidade_apuracao,
 CASE WHEN c.geo='incompleta' THEN 'referencia_pendente' ELSE c.geo END,'consolidada'
FROM history_candidates c CROSS JOIN history_input h;

INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,linha_origem_id,crime_tentado,classificacao_status)
SELECT c.id,n.id,'importacao',o.linha_origem_id,CASE o.crime_tentado WHEN 'SIM' THEN true WHEN 'NÃO' THEN false END,
 CASE WHEN n.id IS NULL THEN 'sem_correspondencia' ELSE 'pendente' END
FROM history_candidates c CROSS JOIN LATERAL unnest(c.origens) source(id)
JOIN history_staged o ON o.linha_origem_id=source.id
LEFT JOIN sentinela.naturezas_criminais n ON n.fonte='PCDF' AND n.categoria_pcdf_original IS NULL
 AND n.descricao_original COLLATE "C"=o.natureza_original COLLATE "C";

INSERT INTO sentinela.pendencias_revisao(linha_origem_id,campo,regra,versao_regra,valor_original,motivo,tipo,prioridade,efeito)
SELECT s.linha_origem_id,'ocorrencia_chave',g.motivo,'pcdf-consolidacao-historica-v1',s.campos_csv->'ocorrencia_chave',
 CASE g.motivo
   WHEN 'ano_registro_anterior_ao_fato' THEN 'O ano do registro policial antecede o ano do fato.'
   WHEN 'datas_de_fato_divergentes' THEN 'A mesma tupla policial possui datas de fato diferentes neste lote.'
   WHEN 'identidade_em_outro_lote' THEN 'A tupla policial ocorre em outro lote e exige conciliação.'
   WHEN 'identidade_colisao_de_espacos' THEN 'Há tuplas policiais que coincidem após remover espaços externos.'
   ELSE 'A tupla policial declarada é insuficiente ou diverge da origem.' END,
 'identificacao','alta','bloqueia_consolidacao'
FROM history_groups g CROSS JOIN LATERAL unnest(g.origens) source(id)
JOIN history_staged s ON s.linha_origem_id=source.id
WHERE g.motivo IS NOT NULL
ON CONFLICT (ocorrencia_id,linha_origem_id,campo,regra,versao_regra) DO NOTHING;

INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,execucao_id,depois,justificativa)
SELECT 'servico','sentinela-pcdf','pcdf.consolidacao_historica',h.execucao,
 jsonb_build_object('competencia',h.competencia,'lote',h.id,'csvSha256',h.sha256,
   'versao','pcdf-consolidacao-historica-v1','recebidas',h.linhas_esperadas,
   'consolidadas',(SELECT count(*) FROM history_candidates),
   'vinculos',(SELECT count(*) FROM history_candidates c CROSS JOIN LATERAL unnest(c.origens)),
   'gruposEmRevisao',(SELECT count(*) FROM history_groups WHERE motivo IS NOT NULL),
   'origensEmRevisao',(SELECT coalesce(sum(cardinality(origens)),0) FROM history_groups WHERE motivo IS NOT NULL),
   'sha256OrigensConsolidadas',(SELECT encode(sha256(convert_to(coalesce(string_agg(source.id::text,',' ORDER BY source.id),''),'UTF8')),'hex')
     FROM history_candidates c CROSS JOIN LATERAL unnest(c.origens) source(id)),
   'pontosValidados',0),
 'Conciliação histórica no clone com tuplas literais e proveniência por associação.'
FROM history_input h WHERE NOT EXISTS (
 SELECT FROM sentinela.eventos_auditoria a WHERE a.execucao_id=h.execucao AND a.acao='pcdf.consolidacao_historica');
-- As tabelas temporárias usam ON COMMIT DROP; execute uma única vez por transação.
