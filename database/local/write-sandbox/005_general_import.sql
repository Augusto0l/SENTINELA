-- Intake for the private, synthetic write sandbox. The official PCDF receptor is separate.
\ir ../sandbox/sql/guard.sql
BEGIN;
CREATE ROLE sentinela_general_importer NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE SCHEMA sentinela_import_lab;
REVOKE ALL ON SCHEMA sentinela_import_lab FROM PUBLIC;
GRANT USAGE ON SCHEMA sentinela, sentinela_write_lab, sentinela_import_lab TO sentinela_general_importer;
GRANT USAGE ON SCHEMA sentinela_import_lab TO sentinela_sbx_admin, sentinela_sbx_operator, sentinela_sbx_analyst;
GRANT SELECT ON sentinela_write_lab.individuals TO sentinela_general_importer;
CREATE POLICY import_actor_binding ON sentinela_write_lab.individuals FOR SELECT TO sentinela_general_importer
 USING (login=session_user);

INSERT INTO sentinela.usuarios(id,nome_exibicao,perfil,ativo)
VALUES ('71000000-0000-4000-8000-000000000018','Serviço técnico de importação geral','Operador',false);
GRANT SELECT(id,perfil,ativo) ON sentinela.usuarios TO sentinela_general_importer;
GRANT SELECT, INSERT ON sentinela.extracoes_origem,sentinela.lotes_importacao,sentinela.execucoes_importacao,
 sentinela.linhas_origem,sentinela.linhas_staging,sentinela.pendencias_revisao TO sentinela_general_importer;
GRANT INSERT ON sentinela.eventos_auditoria TO sentinela_general_importer;
GRANT EXECUTE ON FUNCTION sentinela.exigir_revisor_administrador(), sentinela.validar_vinculos_evento(),
 sentinela.carimbar_auditoria() TO sentinela_general_importer;

CREATE POLICY import_extraction ON sentinela.extracoes_origem TO sentinela_general_importer
 USING (fonte='IMPORTACAO-GERAL-LOCAL');
CREATE POLICY import_batches ON sentinela.lotes_importacao TO sentinela_general_importer
 USING (EXISTS (SELECT FROM sentinela.extracoes_origem x WHERE x.id=extracao_id))
 WITH CHECK (solicitado_por='71000000-0000-4000-8000-000000000018'
   AND EXISTS (SELECT FROM sentinela.extracoes_origem x WHERE x.id=extracao_id));
CREATE POLICY import_runs ON sentinela.execucoes_importacao TO sentinela_general_importer
 USING (EXISTS (SELECT FROM sentinela.lotes_importacao l WHERE l.id=lote_id))
 WITH CHECK (tentativa=1 AND solicitado_por='71000000-0000-4000-8000-000000000018'
   AND EXISTS (SELECT FROM sentinela.lotes_importacao l WHERE l.id=lote_id));
CREATE POLICY import_origin ON sentinela.linhas_origem TO sentinela_general_importer
 USING (EXISTS (SELECT FROM sentinela.extracoes_origem x WHERE x.id=extracao_id));
CREATE POLICY import_staging ON sentinela.linhas_staging TO sentinela_general_importer
 USING (EXISTS (SELECT FROM sentinela.execucoes_importacao e WHERE e.id=execucao_id))
 WITH CHECK (estado='bloqueada' AND ocorrencia_id IS NULL AND associacao_id IS NULL
   AND EXISTS (SELECT FROM sentinela.execucoes_importacao e WHERE e.id=execucao_id));
CREATE POLICY import_issues ON sentinela.pendencias_revisao TO sentinela_general_importer
 USING (EXISTS (SELECT FROM sentinela.linhas_origem o WHERE o.id=pendencias_revisao.linha_origem_id))
 WITH CHECK (status='aberta' AND responsavel_id IS NULL AND ocorrencia_id IS NULL AND associacao_id IS NULL
   AND EXISTS (SELECT FROM sentinela.linhas_origem o WHERE o.id=pendencias_revisao.linha_origem_id));
CREATE POLICY import_audit ON sentinela.eventos_auditoria FOR INSERT TO sentinela_general_importer
 WITH CHECK (ator_tipo='servico' AND servico='importacao-geral-local' AND ocorrencia_id IS NULL
   AND linha_origem_id IS NULL AND correcao_id IS NULL
   AND (execucao_id IS NULL OR EXISTS (SELECT FROM sentinela.execucoes_importacao e WHERE e.id=execucao_id))
   AND (pendencia_id IS NULL OR EXISTS (SELECT FROM sentinela.pendencias_revisao p WHERE p.id=pendencia_id)));

CREATE TABLE sentinela_import_lab.requests (
 request uuid PRIMARY KEY,
 subject uuid NOT NULL REFERENCES sentinela_write_lab.individuals(subject),
 actor text NOT NULL CHECK (actor IN ('Administrador','Operador')),
 created timestamptz NOT NULL DEFAULT clock_timestamp(),
 metadata jsonb NOT NULL,
 status text NOT NULL DEFAULT 'recebida' CHECK (status IN ('recebida','concluida','falhou')),
 receipt jsonb,
 CHECK ((status='concluida') = (receipt IS NOT NULL))
);
ALTER TABLE sentinela_import_lab.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_import_lab.requests FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE(status,receipt) ON sentinela_import_lab.requests TO sentinela_general_importer;
CREATE POLICY import_requests ON sentinela_import_lab.requests TO sentinela_general_importer
 USING (session_user IN ('sentinela_sbx_admin','sentinela_sbx_operator'))
 WITH CHECK (EXISTS (SELECT FROM sentinela_write_lab.individuals i WHERE i.subject=requests.subject));

CREATE TABLE sentinela_import_lab.decisions (
 issue uuid PRIMARY KEY REFERENCES sentinela.pendencias_revisao(id),
 subject uuid NOT NULL REFERENCES sentinela_write_lab.individuals(subject),
 decision text NOT NULL CHECK (decision IN ('resolvida','encerrada_sem_solucao')),
 value text,
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
 created timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE sentinela_import_lab.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_import_lab.decisions FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON sentinela_import_lab.decisions TO sentinela_general_importer;
CREATE POLICY import_decisions_read ON sentinela_import_lab.decisions FOR SELECT TO sentinela_general_importer USING (
 session_user IN ('sentinela_sbx_admin','sentinela_sbx_operator','sentinela_sbx_analyst'));
CREATE POLICY import_decisions_write ON sentinela_import_lab.decisions FOR INSERT TO sentinela_general_importer
 WITH CHECK (session_user='sentinela_sbx_admin'
   AND EXISTS(SELECT FROM sentinela_write_lab.individuals i WHERE i.subject=decisions.subject));

CREATE FUNCTION sentinela_import_lab.check_actor(subject_id uuid, admin_only boolean)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF session_user NOT IN ('sentinela_sbx_admin','sentinela_sbx_operator')
  OR (admin_only AND session_user<>'sentinela_sbx_admin')
  OR NOT EXISTS(SELECT FROM sentinela_write_lab.individuals i WHERE i.subject=subject_id AND i.login=session_user)
 THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION sentinela_import_lab.begin_request(actor_id uuid, request_id uuid, meta jsonb, content bytea, batch jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE fingerprint text := encode(sha256(convert_to(batch::text,'UTF8')),'hex');
BEGIN
 PERFORM sentinela_import_lab.check_actor(actor_id,false);
 IF NOT (meta ?& ARRAY['format','bytes','sha','sheetKey','context','name','headers','sheet'])
  OR meta->>'format' NOT IN ('csv','xlsx') OR (meta->>'bytes')::bigint NOT BETWEEN 1 AND 8388608
  OR meta->>'sha' !~ '^[0-9a-f]{64}$' OR meta->>'sheetKey' !~ '^[0-9a-f]{64}$'
  OR meta->>'context' !~ '^[0-9a-f]{64}$' OR length(meta->>'name') NOT BETWEEN 5 AND 240
  OR jsonb_typeof(meta->'headers') IS DISTINCT FROM 'array'
  OR (meta->>'bytes')::bigint IS DISTINCT FROM octet_length(content)
  OR meta->>'sha' IS DISTINCT FROM encode(sha256(content),'hex') OR fingerprint IS NULL
  OR EXISTS (SELECT FROM jsonb_array_elements_text(meta->'headers') h
    WHERE lower(regexp_replace(h,'[^a-zA-Z0-9]','','g')) IN ('linhaorigemid','linhaxml','abaorigem','versaotratamento'))
  OR meta->>'name' ~* 'pcdf[_ -]*naturezas'
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
 INSERT INTO sentinela_import_lab.requests(request,subject,actor,metadata)
 VALUES(request_id,actor_id,CASE session_user WHEN 'sentinela_sbx_admin' THEN 'Administrador' ELSE 'Operador' END,
   meta || jsonb_build_object('batchHash',fingerprint))
 ON CONFLICT(request) DO NOTHING;
 IF NOT EXISTS (SELECT FROM sentinela_import_lab.requests q WHERE q.request=request_id AND q.subject=actor_id
   AND q.metadata->>'sha'=meta->>'sha' AND q.metadata->>'context'=meta->>'context'
   AND q.metadata->>'batchHash'=fingerprint)
 THEN RAISE EXCEPTION USING ERRCODE='23505'; END IF;
 IF FOUND THEN
  INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,depois,justificativa,request_id)
    VALUES('servico','importacao-geral-local','tentativa_importacao_geral',
      jsonb_build_object('subject',actor_id,'sha',meta->>'sha'),'Recepção de arquivo geral',request_id::text);
 END IF;
END $$;

CREATE FUNCTION sentinela_import_lab.receive(actor_id uuid, request_id uuid, batch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE tech constant uuid := '71000000-0000-4000-8000-000000000018';
 meta jsonb; summary jsonb := batch->'summary'; amount integer := jsonb_array_length(batch->'rows');
 x uuid; l uuid; e uuid; v_receipt jsonb; copied bigint; problems bigint;
BEGIN
 PERFORM sentinela_import_lab.check_actor(actor_id,false);
 SELECT q.metadata,q.receipt INTO meta,v_receipt FROM sentinela_import_lab.requests q
   WHERE q.request=request_id AND q.subject=actor_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
 IF meta->>'batchHash' IS DISTINCT FROM encode(sha256(convert_to(batch::text,'UTF8')),'hex')
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
 IF v_receipt IS NOT NULL THEN RETURN v_receipt || '{"replay":true}'; END IF;
 IF amount IS NULL OR amount NOT BETWEEN 1 AND 10000 OR amount IS DISTINCT FROM (summary->>'total')::int
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('general:' || (meta->>'sheetKey'),0));
 SELECT x0.id,l0.id,e0.id INTO x,l,e
 FROM sentinela.extracoes_origem x0 JOIN sentinela.lotes_importacao l0 ON l0.extracao_id=x0.id
 JOIN sentinela.execucoes_importacao e0 ON e0.lote_id=l0.id
 WHERE x0.fonte='IMPORTACAO-GERAL-LOCAL' AND x0.sha256_xml=meta->>'sheetKey';
 IF FOUND THEN
  SELECT q.receipt INTO STRICT v_receipt FROM sentinela_import_lab.requests q
   WHERE q.receipt->>'run'=e::text AND q.receipt->>'replay'='false';
  IF NOT EXISTS (SELECT FROM sentinela.extracoes_origem o WHERE o.id=x AND o.manifesto->>'context'=meta->>'context')
  THEN RAISE EXCEPTION USING ERRCODE='23505'; END IF;
  v_receipt := v_receipt || '{"replay":true}';
 ELSE
  INSERT INTO sentinela.extracoes_origem(fonte,nome_xml,sha256_xml,tamanho_bytes,referencia_arquivo,manifesto)
   VALUES ('IMPORTACAO-GERAL-LOCAL',meta->>'name',meta->>'sheetKey',(meta->>'bytes')::bigint,
     'sha256:'||(meta->>'sha'),meta) RETURNING id INTO x;
  INSERT INTO sentinela.lotes_importacao(extracao_id,nome_arquivo,sha256_arquivo,tamanho_bytes,referencia_arquivo,
   versao_contrato,versao_tratamento,competencia,linhas_esperadas,solicitado_por)
   VALUES(x,meta->>'name',meta->>'sha',(meta->>'bytes')::bigint,'sha256:'||(meta->>'sha'),
    'geral-v1','geral-v1',date_trunc('month',current_date::timestamp)::date,amount,tech) RETURNING id INTO l;
  INSERT INTO sentinela.execucoes_importacao(lote_id,extracao_id,tentativa,solicitado_por,versao_importador,versao_validacao,
   status,linhas_lidas,linhas_processadas,linhas_bloqueadas,pendencias_detectadas,checkpoint_registro_csv,finalizado_em)
   VALUES(l,x,1,tech,'geral-v1','geral-v1','concluida',amount,amount,amount,(summary->>'issues')::bigint,
    amount,clock_timestamp()) RETURNING id INTO e;

  INSERT INTO sentinela.linhas_origem(extracao_id,linha_origem_id,aba_origem,linha_xml,versao_identificador,estrutura_celulas)
   SELECT x,'geral:'||(meta->>'sheetKey')||':'||r.line,meta->>'sheet',r.line,'geral-v1',
    jsonb_build_object('headers',meta->'headers','cells',r.snapshot->'cells')
   FROM jsonb_to_recordset(batch->'rows') r(line bigint,snapshot jsonb);
  INSERT INTO sentinela.linhas_staging(execucao_id,lote_id,extracao_id,linha_origem_id,registro_csv,
    campos_csv,derivados_efetivos,diagnosticos,estado)
   SELECT e,l,x,o.id,row_number() OVER (ORDER BY r.line),r.snapshot,r.normalized,r.snapshot->'issues','bloqueada'
   FROM jsonb_to_recordset(batch->'rows') r(line bigint,snapshot jsonb, normalized jsonb)
   JOIN sentinela.linhas_origem o ON o.extracao_id=x AND o.linha_xml=r.line;
  GET DIAGNOSTICS copied=ROW_COUNT;
  INSERT INTO sentinela.pendencias_revisao(linha_origem_id,campo,regra,versao_regra,valor_original,motivo,tipo,prioridade,efeito)
   SELECT s.linha_origem_id,d.field,'geral-'||d.ord,'geral-v1',
    CASE WHEN d.col > 0 THEN s.campos_csv->'cells'->(d.col-1)->'value' END,
    d.message,CASE WHEN d.field IN ('data','horario') THEN 'datas_horarios'
      WHEN d.field IN ('latitude','longitude') THEN 'coordenadas'
      WHEN d.field IN ('ra','local') THEN 'endereco_ra'
      WHEN d.field='naturezas' THEN 'classificacao' WHEN d.field='duplicata' THEN 'identificacao' ELSE 'proveniencia' END,
    'media',CASE WHEN d.field='duplicata' THEN 'nao_bloqueante' ELSE 'bloqueia_consolidacao' END
   FROM sentinela.linhas_staging s CROSS JOIN LATERAL (
    SELECT j->>'field' AS field,(j->>'column')::int AS col,j->>'message' AS message,n::text AS ord
    FROM jsonb_array_elements(s.diagnosticos) WITH ORDINALITY a(j,n)
    UNION ALL SELECT 'duplicata',NULL,'Possível duplicata da linha '||(s.campos_csv->>'duplicateOf'),'duplicata'
    WHERE s.campos_csv ? 'duplicateOf'
   ) d WHERE s.execucao_id=e;
  GET DIAGNOSTICS problems=ROW_COUNT;
  IF copied<>amount OR problems IS DISTINCT FROM (summary->>'issues')::bigint OR EXISTS (
   SELECT FROM sentinela.linhas_staging s JOIN sentinela.linhas_origem o ON o.id=s.linha_origem_id
   JOIN jsonb_to_recordset(batch->'rows') r(line bigint,snapshot jsonb,normalized jsonb) ON r.line=o.linha_xml
   WHERE s.execucao_id=e AND (s.campos_csv IS DISTINCT FROM r.snapshot
      OR s.derivados_efetivos IS DISTINCT FROM r.normalized OR o.estrutura_celulas->'cells' IS DISTINCT FROM r.snapshot->'cells')
  ) THEN RAISE EXCEPTION USING ERRCODE='23514'; END IF;
  v_receipt := jsonb_build_object('lot',l,'run',e,'persisted',copied,'summary',summary,'replay',false);
 END IF;
 UPDATE sentinela_import_lab.requests q SET status='concluida',receipt=v_receipt WHERE q.request=request_id;
 INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,execucao_id,depois,justificativa,request_id)
 VALUES('servico','importacao-geral-local',CASE WHEN (v_receipt->>'replay')::boolean THEN 'reenvio_geral' ELSE 'staging_geral' END,
  e,v_receipt||jsonb_build_object('subject',actor_id),'Conferência do staging geral',request_id::text);
 RETURN v_receipt;
END $$;

CREATE FUNCTION sentinela_import_lab.fail(actor_id uuid, request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM sentinela_import_lab.check_actor(actor_id,false);
 UPDATE sentinela_import_lab.requests SET status='falhou'
 WHERE request=request_id AND subject=actor_id AND status='recebida';
 IF FOUND THEN
  INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,depois,justificativa,request_id)
   VALUES('servico','importacao-geral-local','falha_importacao_geral',jsonb_build_object('subject',actor_id),
    'Gravação em staging não concluída',request_id::text);
 END IF;
END $$;

CREATE FUNCTION sentinela_import_lab.history()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('request',request,'name',metadata->>'name','format',metadata->>'format',
 'sheet',metadata->>'sheet','actor',actor,'created',created,'status',status,'receipt',receipt) ORDER BY created DESC,request),'[]')
 FROM (SELECT * FROM sentinela_import_lab.requests ORDER BY created DESC,request LIMIT 100) q;
$$;

CREATE FUNCTION sentinela_import_lab.detail(run_id uuid, first_row integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('total',e.linhas_lidas,'headers',x.manifesto->'headers','rows',coalesce((
  SELECT jsonb_agg(page.campos_csv ORDER BY page.registro_csv)
  FROM (SELECT s.campos_csv,s.registro_csv FROM sentinela.linhas_staging s WHERE s.execucao_id=e.id
   ORDER BY s.registro_csv LIMIT 25 OFFSET first_row) page),'[]'::jsonb))
 FROM sentinela.execucoes_importacao e JOIN sentinela.extracoes_origem x ON x.id=e.extracao_id
 WHERE e.id=run_id AND session_user IN ('sentinela_sbx_admin','sentinela_sbx_operator');
$$;

CREATE FUNCTION sentinela_import_lab.review(p_type text,p_priority text,p_status text,p_query text,p_order text,p_id uuid,p_offset int,p_limit int)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('id',p.id,'lotId',s.lote_id,'type',p.tipo,'priority',p.prioridade,'field',p.campo,
  'reason',p.motivo,'status',coalesce(d.decision,p.status),'version',CASE WHEN d.issue IS NULL THEN '1' ELSE '2' END,
  'original',p.valor_original #>> '{}','normalized',coalesce(d.value,s.derivados_efetivos->>p.campo),
  'occurrenceId',NULL,'canResolve',d.issue IS NULL AND p.campo IN ('local','horario'),
  'history',CASE WHEN d.issue IS NOT NULL THEN jsonb_build_object('author',d.subject,'reason',d.reason,'at',d.created,
  'before',s.derivados_efetivos->>p.campo,'after',d.value) END)
 FROM sentinela.pendencias_revisao p JOIN sentinela.linhas_staging s ON s.linha_origem_id=p.linha_origem_id
 LEFT JOIN sentinela_import_lab.decisions d ON d.issue=p.id
 WHERE session_user IN ('sentinela_sbx_admin','sentinela_sbx_operator','sentinela_sbx_analyst')
 AND (p_id IS NULL OR p.id=p_id) AND (p_type IS NULL OR p.tipo=p_type) AND (p_priority IS NULL OR p.prioridade=p_priority)
 AND (p_status IS NULL OR coalesce(d.decision,p.status)=p_status)
 AND (p_query IS NULL OR strpos(lower(p.motivo||' '||p.campo),lower(p_query))>0)
 ORDER BY CASE WHEN p_order='prioridade' THEN CASE p.prioridade WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END END,
  CASE WHEN p_order='recentes' THEN p.detectada_em END DESC,p.detectada_em,p.id
 LIMIT least(greatest(p_limit,1),51) OFFSET greatest(p_offset,0);
$$;

CREATE FUNCTION sentinela_import_lab.decide(actor_id uuid, issue_id uuid, version bigint, choice text, correction text, reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE field text;
BEGIN
 PERFORM sentinela_import_lab.check_actor(actor_id,true);
 SELECT p.campo INTO field FROM sentinela.pendencias_revisao p WHERE p.id=issue_id;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002'; END IF;
 IF version IS DISTINCT FROM 1 THEN RAISE EXCEPTION USING ERRCODE='40001'; END IF;
 IF choice='resolvida' AND NOT coalesce(CASE field
  WHEN 'local' THEN length(btrim(correction)) BETWEEN 5 AND 240
  WHEN 'horario' THEN correction ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:00)?$'
  ELSE false END,false)
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
 IF choice='encerrada_sem_solucao' AND correction IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
 INSERT INTO sentinela_import_lab.decisions VALUES(issue_id,actor_id,choice,correction,btrim(reason),clock_timestamp());
 INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,pendencia_id,depois,justificativa)
 VALUES('servico','importacao-geral-local','decisao_importacao_geral',issue_id,
  jsonb_build_object('subject',actor_id,'decisao',choice,'valor',correction),btrim(reason));
 RETURN (SELECT r FROM sentinela_import_lab.review(NULL,NULL,NULL,NULL,NULL,issue_id,0,1) r);
END $$;

ALTER FUNCTION sentinela_import_lab.check_actor(uuid,boolean) OWNER TO sentinela_general_importer;
ALTER FUNCTION sentinela_import_lab.begin_request(uuid,uuid,jsonb,bytea,jsonb) OWNER TO sentinela_general_importer;
ALTER FUNCTION sentinela_import_lab.receive(uuid,uuid,jsonb) OWNER TO sentinela_general_importer;
ALTER FUNCTION sentinela_import_lab.fail(uuid,uuid) OWNER TO sentinela_general_importer;
ALTER FUNCTION sentinela_import_lab.history() OWNER TO sentinela_general_importer;
ALTER FUNCTION sentinela_import_lab.detail(uuid,integer) OWNER TO sentinela_general_importer;
ALTER FUNCTION sentinela_import_lab.review(text,text,text,text,text,uuid,integer,integer) OWNER TO sentinela_general_importer;
ALTER FUNCTION sentinela_import_lab.decide(uuid,uuid,bigint,text,text,text) OWNER TO sentinela_general_importer;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sentinela_import_lab FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_import_lab.begin_request(uuid,uuid,jsonb,bytea,jsonb),sentinela_import_lab.receive(uuid,uuid,jsonb),
 sentinela_import_lab.fail(uuid,uuid),sentinela_import_lab.history(),sentinela_import_lab.detail(uuid,integer)
 TO sentinela_sbx_admin,sentinela_sbx_operator;
GRANT EXECUTE ON FUNCTION sentinela_import_lab.review(text,text,text,text,text,uuid,integer,integer)
 TO sentinela_sbx_admin,sentinela_sbx_operator,sentinela_sbx_analyst;
GRANT EXECUTE ON FUNCTION sentinela_import_lab.decide(uuid,uuid,bigint,text,text,text) TO sentinela_sbx_admin;
COMMIT;
