-- Deriva a recepção histórica da versão instalada, com os mesmos controles e RLS.
-- Os UUIDs retornados pela inserção eliminam a busca no histórico durante staging e diagnósticos.
DO $staging$
DECLARE
 body text := pg_get_functiondef('sentinela_pcdf_local.receive_csv(uuid,uuid,text,jsonb,bytea)'::regprocedure);
 base_name text := 'FUNCTION sentinela_pcdf_local.receive_csv(';
 origin_insert text := 'INSERT INTO sentinela.linhas_origem(';
 origin_end text := $sql$CROSS JOIN LATERAL jsonb_populate_record(NULL::sentinela.linhas_origem,r.raw) o;
   GET DIAGNOSTICS inserted=ROW_COUNT;$sql$;
 stage_join text := $sql$JOIN sentinela.linhas_origem o ON o.extracao_id=extraction AND o.linha_origem_id=r.raw->>'linha_origem_id'$sql$;
 issue_source text := $sql$SELECT s.linha_origem_id,d.field,d.rule,version,s.campos_csv->d.field,d.rule,d.kind,d.priority,
     d.effect,CASE WHEN d.effect='bloqueia_dimensao' THEN d.kind END
   FROM sentinela.linhas_staging s
   CROSS JOIN LATERAL jsonb_to_recordset(s.diagnosticos) d(field text,rule text,kind text,priority text,effect text)
   WHERE s.execucao_id=run;$sql$;
 lookup text := $sql$(origin_ids->>(r.raw->>'linha_origem_id'))::uuid$sql$;
BEGIN
 IF (SELECT bool_or(cardinality(string_to_array(body,fragment))<>2) FROM unnest(
   ARRAY[base_name,origin_insert,origin_end,stage_join,issue_source,' inserted bigint;',
         'SELECT run,lot,extraction,o.id,r.ordinal,r.raw,']) fragment)
 OR strpos(body,'sentinela_pcdf_local.efetivos_csv_v1(r.raw,month_start)')=0
 OR strpos(body,'sentinela_gestao_autorizacao.exigir')=0
 THEN RAISE EXCEPTION 'A versão do receptor PCDF instalado diverge do histórico'; END IF;
 body := replace(body,base_name,'FUNCTION sentinela_pcdf_historico.receive_staging(');
 body := replace(body,' inserted bigint;',' inserted bigint; origin_ids jsonb;');
 body := replace(body,origin_insert,'WITH imported_origins AS ('||origin_insert);
 body := replace(body,origin_end,$sql$CROSS JOIN LATERAL jsonb_populate_record(NULL::sentinela.linhas_origem,r.raw) o
   RETURNING id,linha_origem_id)
   SELECT jsonb_object_agg(linha_origem_id,id),count(*) INTO origin_ids,inserted FROM imported_origins;$sql$);
 body := replace(body,'SELECT run,lot,extraction,o.id,r.ordinal,r.raw,',
   'SELECT run,lot,extraction,'||lookup||',r.ordinal,r.raw,');
 body := replace(body,stage_join,'');
 body := replace(body,issue_source,'SELECT '||lookup||$sql$,d.field,d.rule,version,r.raw->d.field,d.rule,d.kind,d.priority,
     d.effect,CASE WHEN d.effect='bloqueia_dimensao' THEN d.kind END
   FROM jsonb_to_recordset(p_batch->'rows') r(raw jsonb,diagnostics jsonb)
   CROSS JOIN LATERAL jsonb_to_recordset(r.diagnostics) d(field text,rule text,kind text,priority text,effect text);$sql$);
 EXECUTE body;
END $staging$;
ALTER FUNCTION sentinela_pcdf_historico.receive_staging(uuid,uuid,text,jsonb,bytea) OWNER TO sentinela_pcdf_owner;
REVOKE ALL ON FUNCTION sentinela_pcdf_historico.receive_staging(uuid,uuid,text,jsonb,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_historico.receive_staging(uuid,uuid,text,jsonb,bytea) TO sentinela_pcdf_historico_owner;

CREATE FUNCTION sentinela_pcdf_historico.status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $sql$
 SELECT jsonb_agg(jsonb_build_object(
   'month',to_char(a.competencia,'YYYY-MM'),'sha256',a.sha256,'bytes',a.bytes,'records',a.linhas,
   'candidates',a.candidatas,'through',a.cobertura_ate,'complete',a.completa,
   'state',CASE WHEN l.id IS NULL THEN 'missing' WHEN l.sha256_arquivo<>a.sha256 THEN 'conflict'
     WHEN a.competencia='2021-01-01' AND (l.id<>'84908630-bd04-4a03-923d-616649c8de74' OR e.depois IS NULL)
       THEN 'conflict'
     WHEN e.depois IS NULL THEN 'staged' ELSE 'done' END,
   'lot',l.id,'unique',e.depois->'consolidadas','links',e.depois->'vinculos',
   'review',coalesce(e.depois->'origensEmRevisao',e.depois->'identidadeEmRevisao'),
   'issues',CASE WHEN a.competencia='2021-01-01' AND e.depois IS NOT NULL THEN to_jsonb(8091)
     ELSE e.depois->'pendencias' END) ORDER BY a.competencia)
 FROM sentinela_pcdf_historico.arquivos a
 LEFT JOIN LATERAL (
   SELECT l.id,l.sha256_arquivo FROM sentinela.lotes_importacao l JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id
   WHERE l.competencia=a.competencia AND x.fonte='PCDF'
   ORDER BY (l.sha256_arquivo<>a.sha256) DESC,l.id LIMIT 1
 ) l ON true
 LEFT JOIN LATERAL (
   SELECT e.depois FROM sentinela.eventos_auditoria e
   WHERE e.acao=CASE WHEN a.competencia='2021-01-01' THEN 'pcdf.revisao_independente' ELSE 'pcdf.consolidacao_historica' END
     AND e.depois->>'lote'=l.id::text AND e.depois->>'csvSha256'=a.sha256
   LIMIT 1
 ) e ON true;
$sql$;
ALTER FUNCTION sentinela_pcdf_historico.status() OWNER TO sentinela_pcdf_historico_owner;
REVOKE ALL ON FUNCTION sentinela_pcdf_historico.status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_historico.status() TO sentinela_local_admin,sentinela_local_operator;

CREATE FUNCTION sentinela_pcdf_historico.coverage() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $sql$
 SELECT jsonb_agg(jsonb_build_object('key',m->>'month','status',CASE
   WHEN m->>'state'<>'done' THEN 'not_imported' WHEN (m->>'complete')::boolean THEN 'complete' ELSE 'partial' END,
   'through',m->>'through') ORDER BY m->>'month')
 FROM jsonb_array_elements(sentinela_pcdf_historico.status()) m;
$sql$;
ALTER FUNCTION sentinela_pcdf_historico.coverage() OWNER TO sentinela_pcdf_historico_owner;
REVOKE ALL ON FUNCTION sentinela_pcdf_historico.coverage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_historico.coverage() TO sentinela_local_admin,sentinela_local_operator,sentinela_local_analyst;

CREATE FUNCTION sentinela_pcdf_historico.receive(p_request uuid,p_usuario uuid,p_conta text,p_batch jsonb,p_csv bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $sql$
DECLARE
 input sentinela_pcdf_historico.arquivos%rowtype;
 xml_sha constant text := 'faf82ae0620fa3ecc53bc002d9c2e49b24b6ec0126a44449510d12948dc0a022';
 existing jsonb;
 receipt jsonb;
 result jsonb;
 cohort jsonb;
 lot uuid;
 run uuid;
 extraction uuid;
 previous_extraction uuid;
 total integer;
 links integer;
 review_count integer;
BEGIN
 PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,p_conta);
 PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
 SELECT * INTO input FROM sentinela_pcdf_historico.arquivos WHERE to_char(competencia,'YYYY-MM')=p_batch->>'month';
 IF NOT FOUND OR p_request IS NULL OR input.sha256 IS DISTINCT FROM encode(sha256(p_csv),'hex')
 OR input.sha256 IS DISTINCT FROM p_batch->>'sha256' OR input.bytes IS DISTINCT FROM octet_length(p_csv)
 OR p_batch->>'name' IS DISTINCT FROM 'pcdf_naturezas_'||to_char(input.competencia,'YYYY-MM')||'.csv'
 OR to_jsonb(input.linhas) IS DISTINCT FROM p_batch->'records' OR to_jsonb(input.candidatas) IS DISTINCT FROM p_batch->'candidates'
 OR input.linhas IS DISTINCT FROM jsonb_array_length(p_batch->'rows')
 THEN RAISE EXCEPTION 'Hash, arquivo ou competência fora do inventário histórico' USING ERRCODE='22023'; END IF;
 SELECT m INTO existing FROM jsonb_array_elements(sentinela_pcdf_historico.status()) m WHERE m->>'month'=p_batch->>'month';
 SELECT l.extracao_id INTO previous_extraction FROM sentinela.lotes_importacao l WHERE l.id=(existing->>'lot')::uuid;
 IF existing->>'state'='conflict'
 THEN RETURN jsonb_build_object('conflict','competencia'); END IF;

 IF EXISTS (
   SELECT FROM jsonb_to_recordset(p_batch->'rows') r(raw jsonb)
   WHERE r.raw->>'linha_xml' IS NULL OR r.raw->>'linha_xml' !~ '^[1-9][0-9]*$'
      OR r.raw->>'linha_origem_id' IS DISTINCT FROM encode(sha256(convert_to(
        '["pcdf-linha-v1","'||xml_sha||'","NATUREZAS",'||(r.raw->>'linha_xml')||']','UTF8')),'hex')
 ) THEN RAISE EXCEPTION 'Proveniência XML divergente' USING ERRCODE='22023'; END IF;
 IF existing->>'state'='done' THEN
   IF (SELECT count(*) FROM (
       SELECT r.raw->>'linha_origem_id' FROM jsonb_to_recordset(p_batch->'rows') r(raw jsonb)
       INTERSECT
       SELECT linha_origem_id::text FROM sentinela.linhas_origem WHERE extracao_id=previous_extraction
     ) matches)<>input.linhas
   THEN RETURN jsonb_build_object('conflict','proveniencia'); END IF;
   RETURN existing||jsonb_build_object('replay',true);
 END IF;
 IF input.competencia='2021-01-01' THEN RETURN jsonb_build_object('conflict','competencia'); END IF;
 IF EXISTS (
   SELECT r.raw->>'linha_origem_id' FROM jsonb_to_recordset(p_batch->'rows') r(raw jsonb)
   INTERSECT
   SELECT linha_origem_id::text FROM sentinela.linhas_origem WHERE extracao_id IS DISTINCT FROM previous_extraction
 ) THEN RETURN jsonb_build_object('conflict','proveniencia'); END IF;

 receipt := sentinela_pcdf_historico.receive_staging(p_request,p_usuario,p_conta,p_batch,p_csv);
 IF receipt ? 'conflict' THEN RETURN receipt; END IF;
 lot := (receipt->>'lot')::uuid;
 run := (receipt->>'run')::uuid;
 SELECT l.extracao_id INTO STRICT extraction FROM sentinela.lotes_importacao l WHERE l.id=lot;

 WITH staged AS MATERIALIZED (
   SELECT s.linha_origem_id,s.campos_csv,s.derivados_efetivos AS efetivos,
     o.ano_registro,o.unidade_registro,o.numero_registro,
     o.flagrante,o.unidade_apuracao,o.latitude_geo_original AS lat,o.longitude_geo_original AS lon
   FROM sentinela.linhas_staging s JOIN sentinela.linhas_origem o ON (o.id,o.extracao_id)=(s.linha_origem_id,s.extracao_id)
   WHERE s.lote_id=lot AND s.execucao_id=run AND s.estado='recebida' AND s.ocorrencia_id IS NULL AND s.associacao_id IS NULL
 ), groups AS MATERIALIZED (
   SELECT ano_registro,unidade_registro,numero_registro,array_agg(linha_origem_id ORDER BY linha_origem_id) AS origens,
     bool_and(efetivos->>'chave' IS NOT NULL AND (ano_registro,unidade_registro,numero_registro) IS NOT DISTINCT FROM
       (campos_csv->>'ano_registro',campos_csv->>'unidade_registro',campos_csv->>'numero_registro')) AS identidade,
     bool_or(ano_registro<left(efetivos->>'data',4)) AS ano_incompativel,count(DISTINCT efetivos->>'data') AS datas,
     min(efetivos->>'data')::date AS data_fato,
     CASE WHEN count(DISTINCT efetivos->>'horario')=1 THEN min(efetivos->>'horario')::time END AS horario_fato,
     CASE WHEN count(DISTINCT nullif(campos_csv->>'local',''))=1 THEN min(nullif(campos_csv->>'local','')) END AS local,
     CASE WHEN count(DISTINCT flagrante)=1 THEN CASE min(flagrante) WHEN 'SIM' THEN true WHEN 'NÃO' THEN false END END AS flagrante,
     CASE WHEN count(DISTINCT unidade_apuracao) FILTER (WHERE sentinela_pcdf_revisao.informado(unidade_apuracao))=1
       THEN min(unidade_apuracao) FILTER (WHERE sentinela_pcdf_revisao.informado(unidade_apuracao)) END AS unidade_apuracao,
     CASE WHEN count(DISTINCT jsonb_build_array(lat,lon))=1 THEN min(efetivos->>'geo') ELSE 'divergente' END AS geo
   FROM staged GROUP BY 1,2,3
 ), outside_keys AS MATERIALIZED (
   SELECT btrim(o.ano_registro) COLLATE "C" AS year,btrim(o.unidade_registro) COLLATE "C" AS unit,
       btrim(o.numero_registro) COLLATE "C" AS number
   FROM sentinela.linhas_origem o WHERE o.extracao_id<>extraction
   UNION ALL
   SELECT btrim(o.ano_registro) COLLATE "C",btrim(o.unidade_registro) COLLATE "C",btrim(o.numero_registro) COLLATE "C"
   FROM sentinela.ocorrencias o WHERE o.fonte='PCDF'
 ), collisions AS (
   SELECT DISTINCT o.year,o.unit,o.number FROM outside_keys o JOIN groups g
     ON (o.year,o.unit,o.number)=(btrim(g.ano_registro),btrim(g.unidade_registro),btrim(g.numero_registro))
   UNION
   SELECT btrim(ano_registro) COLLATE "C",btrim(unidade_registro) COLLATE "C",btrim(numero_registro) COLLATE "C"
   FROM groups GROUP BY 1,2,3 HAVING count(*)>1
 )
 SELECT jsonb_agg(to_jsonb(g)||jsonb_build_object('id',gen_random_uuid(),'motivo',CASE
   WHEN NOT g.identidade THEN 'identidade_literal_insuficiente'
   WHEN g.ano_incompativel THEN 'ano_registro_anterior_ao_fato'
   WHEN g.datas>1 THEN 'datas_de_fato_divergentes'
   WHEN k.year IS NOT NULL THEN 'identidade_em_conflito'
   ELSE NULL END)) INTO cohort FROM groups g LEFT JOIN collisions k
     ON (k.year,k.unit,k.number)=(btrim(g.ano_registro),btrim(g.unidade_registro),btrim(g.numero_registro));
 IF cohort IS NULL OR (SELECT sum(jsonb_array_length(g->'origens')) FROM jsonb_array_elements(cohort) g)<>input.linhas
 OR EXISTS (SELECT FROM sentinela.linhas_staging s JOIN sentinela.ocorrencia_naturezas a ON a.linha_origem_id=s.linha_origem_id
   WHERE s.execucao_id=run)
 THEN RAISE EXCEPTION 'Coorte inconsistente ou parcialmente vinculada' USING ERRCODE='23514'; END IF;

 INSERT INTO sentinela.ocorrencias(id,origem,fonte,ano_registro,unidade_registro,numero_registro,versao_identidade,
  identidade_status,evidencia_identidade,data_fato,horario_fato,local,flagrante,unidade_apuracao,localizacao_status,consolidacao_status)
 SELECT c.id,'importacao','PCDF',c.ano_registro,c.unidade_registro,c.numero_registro,'pcdf-tupla-conferida-v1',
  'homologada','Tupla literal conciliada com a origem e o CSV '||input.sha256,c.data_fato,c.horario_fato,c.local,
  c.flagrante,c.unidade_apuracao,CASE WHEN c.geo='incompleta' THEN 'referencia_pendente' ELSE c.geo END,'consolidada'
 FROM jsonb_to_recordset(cohort) c(id uuid,ano_registro text,unidade_registro text,numero_registro text,data_fato date,
  horario_fato time,local text,flagrante boolean,unidade_apuracao text,geo text,motivo text) WHERE c.motivo IS NULL;
 GET DIAGNOSTICS total=ROW_COUNT;

 INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,linha_origem_id,crime_tentado,classificacao_status)
 SELECT c.id,n.id,'importacao',o.id,CASE o.crime_tentado WHEN 'SIM' THEN true WHEN 'NÃO' THEN false END,
  CASE WHEN n.id IS NULL THEN 'sem_correspondencia' ELSE 'pendente' END
 FROM jsonb_to_recordset(cohort) c(id uuid,origens uuid[],motivo text) CROSS JOIN LATERAL unnest(c.origens) r(id)
 JOIN sentinela.linhas_origem o ON o.id=r.id
 LEFT JOIN sentinela.naturezas_criminais n ON n.fonte='PCDF' AND n.categoria_pcdf_original IS NULL
   AND n.descricao_original COLLATE "C"=o.natureza_original COLLATE "C"
 WHERE c.motivo IS NULL;
 GET DIAGNOSTICS links=ROW_COUNT;

 INSERT INTO sentinela.pendencias_revisao(linha_origem_id,campo,regra,versao_regra,valor_original,motivo,tipo,prioridade,efeito)
 SELECT s.linha_origem_id,'ocorrencia_chave',c.motivo,'pcdf-consolidacao-historica-v1',s.campos_csv->'ocorrencia_chave',
  CASE c.motivo WHEN 'ano_registro_anterior_ao_fato' THEN 'Ano de registro anterior ao ano do fato.'
   WHEN 'datas_de_fato_divergentes' THEN 'Datas de fato divergentes para a mesma tupla policial.'
   WHEN 'identidade_em_conflito' THEN 'Tupla policial em conflito com outra origem, lote ou ocorrência.'
   ELSE 'Identidade declarada insuficiente ou divergente da origem.' END,'identificacao','alta','bloqueia_consolidacao'
 FROM jsonb_to_recordset(cohort) c(origens uuid[],motivo text) CROSS JOIN LATERAL unnest(c.origens) r(id)
 JOIN sentinela.linhas_staging s ON s.execucao_id=run AND s.linha_origem_id=r.id WHERE c.motivo IS NOT NULL;
 GET DIAGNOSTICS review_count=ROW_COUNT;
 IF links+review_count<>input.linhas THEN RAISE EXCEPTION 'Vínculos e revisão fora do escopo' USING ERRCODE='23514'; END IF;

 INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,execucao_id,depois,justificativa,request_id)
 VALUES ('servico','sentinela-pcdf','pcdf.consolidacao_historica',run,jsonb_build_object(
   'actor',p_usuario,'lote',lot,'competencia',input.competencia,'csvSha256',input.sha256,'xmlSha256',xml_sha,
   'consolidadas',total,'vinculos',links,'origensEmRevisao',review_count,
   'pendencias',(receipt->>'issues')::integer+review_count,'pontosValidados',0,'versao','pcdf-consolidacao-historica-v1'),
   'Recepção e consolidação do CSV mensal PCDF aprovado pela interface.',p_request::text);
 SELECT m INTO result FROM jsonb_array_elements(sentinela_pcdf_historico.status()) m WHERE m->>'month'=p_batch->>'month';
 IF result->>'state' IS DISTINCT FROM 'done' THEN RAISE EXCEPTION 'Recibo não reconciliado' USING ERRCODE='23514'; END IF;
 RETURN result||jsonb_build_object('replay',false);
END
$sql$;
ALTER FUNCTION sentinela_pcdf_historico.receive(uuid,uuid,text,jsonb,bytea) OWNER TO sentinela_pcdf_historico_owner;
REVOKE ALL ON FUNCTION sentinela_pcdf_historico.receive(uuid,uuid,text,jsonb,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_historico.receive(uuid,uuid,text,jsonb,bytea) TO sentinela_local_admin;
