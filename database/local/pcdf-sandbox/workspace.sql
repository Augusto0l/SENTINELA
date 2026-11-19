-- Disposable Next.js adapters. The baseline review tables and triggers stay intact.
\ir ../sandbox/sql/guard.sql
BEGIN;
SET LOCAL search_path=pg_catalog;

GRANT USAGE ON SCHEMA sentinela_pcdf_lab TO sentinela_sbx_admin,sentinela_sbx_operator,sentinela_sbx_analyst;
GRANT USAGE ON SCHEMA sentinela_write_lab TO sentinela_pcdf_sbx_importer;
GRANT SELECT ON sentinela_write_lab.individuals TO sentinela_pcdf_sbx_importer;
CREATE POLICY pcdf_individual ON sentinela_write_lab.individuals FOR SELECT TO sentinela_pcdf_sbx_importer
 USING(login=session_user);

CREATE TABLE sentinela_pcdf_lab.uploads (
  lot_id uuid PRIMARY KEY REFERENCES sentinela.lotes_importacao(id),
  subject uuid NOT NULL REFERENCES sentinela_write_lab.individuals(subject),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 16777216)
);
ALTER TABLE sentinela_pcdf_lab.uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_pcdf_lab.uploads FORCE ROW LEVEL SECURITY;
GRANT SELECT(lot_id), INSERT ON sentinela_pcdf_lab.uploads TO sentinela_pcdf_sbx_importer;
CREATE POLICY upload_read ON sentinela_pcdf_lab.uploads FOR SELECT TO sentinela_pcdf_sbx_importer
 USING(EXISTS(SELECT FROM sentinela.lotes_importacao l WHERE l.id=lot_id));
CREATE POLICY upload_insert ON sentinela_pcdf_lab.uploads FOR INSERT TO sentinela_pcdf_sbx_importer
 WITH CHECK(EXISTS(SELECT FROM sentinela.lotes_importacao l WHERE l.id=lot_id)
 AND EXISTS(SELECT FROM sentinela_write_lab.individuals i WHERE i.subject=uploads.subject));

ALTER TABLE sentinela_pcdf_lab.review_decisions
 ADD FOREIGN KEY(subject) REFERENCES sentinela_write_lab.individuals(subject);
GRANT INSERT ON sentinela_pcdf_lab.review_decisions TO sentinela_pcdf_sbx_importer;
CREATE POLICY decision_insert ON sentinela_pcdf_lab.review_decisions FOR INSERT TO sentinela_pcdf_sbx_importer
 WITH CHECK(session_user='sentinela_sbx_admin' AND tx=pg_current_xact_id()
 AND EXISTS(SELECT FROM sentinela.pendencias_revisao p WHERE p.id=issue_id)
 AND EXISTS(SELECT FROM sentinela_write_lab.individuals i WHERE i.subject=review_decisions.subject));

CREATE FUNCTION sentinela_pcdf_lab.check_subject(subject_id uuid, admin_only boolean)
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF session_user NOT IN ('sentinela_sbx_admin','sentinela_sbx_operator')
    OR (admin_only AND session_user<>'sentinela_sbx_admin')
    OR NOT EXISTS(SELECT FROM sentinela_write_lab.individuals i WHERE i.login=session_user AND i.subject=subject_id)
  THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Account binding refused'; END IF;
END $$;
ALTER FUNCTION sentinela_pcdf_lab.check_subject(uuid,boolean) OWNER TO sentinela_pcdf_sbx_importer;
REVOKE ALL ON FUNCTION sentinela_pcdf_lab.check_subject(uuid,boolean) FROM PUBLIC;

CREATE FUNCTION sentinela_pcdf_lab.upload(p_subject uuid,batch jsonb,content bytea,xml_sha text,xml_size bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE receipt jsonb;
BEGIN
  PERFORM sentinela_pcdf_lab.check_subject(p_subject,false);
  IF batch->>'sha256' IS DISTINCT FROM encode(sha256(content),'hex')
    OR (batch->>'size')::integer IS DISTINCT FROM octet_length(content)
  THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='CSV receipt mismatch'; END IF;
  receipt := sentinela_pcdf_lab.stage(batch,xml_sha,xml_size);
  INSERT INTO sentinela_pcdf_lab.uploads(lot_id,subject,content)
    VALUES((receipt->>'lot')::uuid,p_subject,content) ON CONFLICT(lot_id) DO NOTHING;
  RETURN receipt;
END $$;

CREATE FUNCTION sentinela_pcdf_lab.workspace_lots()
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('lot',l.id,'run',e.id,'month',to_char(l.competencia,'YYYY-MM'),
    'rows',e.linhas_lidas,'issues',e.pendencias_detectadas,'consolidated',
    (SELECT count(*) FROM sentinela.linhas_staging s JOIN sentinela.ocorrencia_naturezas a
      ON a.linha_origem_id=s.linha_origem_id WHERE s.execucao_id=e.id))
  FROM sentinela.lotes_importacao l JOIN sentinela.execucoes_importacao e ON e.lote_id=l.id
  WHERE session_user IN ('sentinela_sbx_admin','sentinela_sbx_operator')
  ORDER BY l.criado_em DESC,l.id LIMIT 100;
$$;

CREATE FUNCTION sentinela_pcdf_lab.workspace_review(p_type text,p_priority text,p_status text,p_id uuid)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('id',p.id,'type',p.tipo,'priority',p.prioridade,'field',p.campo,
    'reason',p.motivo,'status',coalesce(d.decision,p.status),'version',coalesce(d.revision,p.versao)::text,
    'original',p.valor_original,'normalized',coalesce(d.normalized_value,s.derivados_efetivos->>p.campo),
    'occurrenceId',link.ocorrencia_id,
    'canResolve',link.id IS NULL AND d.revision IS NULL AND (p.regra IN ('horario_ausente_ou_invalido','endereco_ausente')
      OR (p.regra='valor_policial_desconhecido' AND p.campo='flagrante')),
    'history',CASE WHEN d.revision IS NOT NULL THEN
      jsonb_build_object('author',d.subject,'reason',d.reason,'at',d.created_at,
        'before',d.previous_value,'after',d.normalized_value) END)
  FROM sentinela.pendencias_revisao p
  JOIN sentinela.linhas_staging s ON s.linha_origem_id=p.linha_origem_id
  LEFT JOIN sentinela.ocorrencia_naturezas link ON link.linha_origem_id=s.linha_origem_id
  LEFT JOIN LATERAL (SELECT * FROM sentinela_pcdf_lab.review_decisions v WHERE v.issue_id=p.id
    ORDER BY v.revision DESC LIMIT 1) d ON true
  WHERE session_user IN ('sentinela_sbx_admin','sentinela_sbx_operator','sentinela_sbx_analyst')
    AND (p_type IS NULL OR p.tipo=p_type) AND (p_priority IS NULL OR p.prioridade=p_priority)
    AND (p_status IS NULL OR coalesce(d.decision,p.status)=p_status) AND (p_id IS NULL OR p.id=p_id)
  ORDER BY CASE p.prioridade WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,p.detectada_em,p.id
  LIMIT 100;
$$;

CREATE FUNCTION sentinela_pcdf_lab.decide(p_subject uuid,p_id uuid,p_version bigint,p_decision text,p_value text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE issue record; value text := nullif(btrim(p_value),'');
BEGIN
  PERFORM sentinela_pcdf_lab.check_subject(p_subject,true);
  PERFORM pg_advisory_xact_lock(hashtextextended('pcdf-sandbox:promotion',0));
  SELECT p.versao,p.campo,p.regra,p.linha_origem_id,p.status,s.derivados_efetivos INTO issue
    FROM sentinela.pendencias_revisao p JOIN sentinela.linhas_staging s ON s.linha_origem_id=p.linha_origem_id
    WHERE p.id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Review issue unavailable'; END IF;
  IF p_version IS DISTINCT FROM issue.versao OR issue.status<>'aberta'
    OR EXISTS(SELECT FROM sentinela_pcdf_lab.review_decisions d WHERE d.issue_id=p_id)
  THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Stale review version'; END IF;
  IF p_decision='resolvida' THEN
    IF EXISTS(SELECT FROM sentinela.ocorrencia_naturezas a WHERE a.linha_origem_id=issue.linha_origem_id)
      OR NOT coalesce(CASE issue.regra
        WHEN 'horario_ausente_ou_invalido' THEN value ~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'
        WHEN 'endereco_ausente' THEN length(value) BETWEEN 1 AND 240
        WHEN 'valor_policial_desconhecido' THEN issue.campo='flagrante' AND value IN ('true','false')
        ELSE false END,false)
    THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unsupported correction'; END IF;
  ELSIF p_decision IS DISTINCT FROM 'encerrada_sem_solucao' OR p_value IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid review decision';
  END IF;
  INSERT INTO sentinela_pcdf_lab.review_decisions(issue_id,revision,subject,decision,previous_value,normalized_value,reason)
  VALUES(p_id,p_version+1,p_subject,p_decision,issue.derivados_efetivos->>issue.campo,value,btrim(p_reason));
  RETURN (SELECT x FROM sentinela_pcdf_lab.workspace_review(NULL,NULL,NULL,p_id) AS x);
END $$;

CREATE FUNCTION sentinela_pcdf_lab.workspace_promote(p_subject uuid,p_run uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM sentinela_pcdf_lab.check_subject(p_subject,false);
  RETURN sentinela_pcdf_lab.promote(p_run,p_subject);
END $$;

ALTER FUNCTION sentinela_pcdf_lab.upload(uuid,jsonb,bytea,text,bigint) OWNER TO sentinela_pcdf_sbx_importer;
ALTER FUNCTION sentinela_pcdf_lab.workspace_lots() OWNER TO sentinela_pcdf_sbx_importer;
ALTER FUNCTION sentinela_pcdf_lab.workspace_review(text,text,text,uuid) OWNER TO sentinela_pcdf_sbx_importer;
ALTER FUNCTION sentinela_pcdf_lab.decide(uuid,uuid,bigint,text,text,text) OWNER TO sentinela_pcdf_sbx_importer;
ALTER FUNCTION sentinela_pcdf_lab.workspace_promote(uuid,uuid) OWNER TO sentinela_pcdf_sbx_importer;
REVOKE ALL ON FUNCTION sentinela_pcdf_lab.upload(uuid,jsonb,bytea,text,bigint),
  sentinela_pcdf_lab.workspace_lots(),sentinela_pcdf_lab.workspace_review(text,text,text,uuid),
  sentinela_pcdf_lab.decide(uuid,uuid,bigint,text,text,text),sentinela_pcdf_lab.workspace_promote(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_lab.upload(uuid,jsonb,bytea,text,bigint),
  sentinela_pcdf_lab.workspace_lots(),sentinela_pcdf_lab.workspace_promote(uuid,uuid) TO sentinela_sbx_admin,sentinela_sbx_operator;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_lab.workspace_review(text,text,text,uuid)
 TO sentinela_sbx_admin,sentinela_sbx_operator,sentinela_sbx_analyst;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_lab.decide(uuid,uuid,bigint,text,text,text) TO sentinela_sbx_admin;
COMMIT;
