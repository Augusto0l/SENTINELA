-- Install only in the attested, disposable occurrence-management database.
BEGIN;
SET LOCAL search_path=pg_catalog,pg_temp;
SET LOCAL lock_timeout='5s';
SELECT set_config('sentinela.purge_expected_uuid', :'expected_uuid', true);
DO $$
BEGIN
 IF current_database()<>'sentinela_pcdf_local' OR inet_server_addr() IS DISTINCT FROM inet '127.0.0.1'
 OR inet_server_port() IS DISTINCT FROM 55488 OR nullif(current_setting('sentinela.sandbox_uuid',true),'') IS NULL
 OR current_setting('sentinela.sandbox_uuid',true) IS DISTINCT FROM current_setting('sentinela.purge_expected_uuid')
 THEN RAISE EXCEPTION 'Destino descartável atestado exigido para exclusão'; END IF;
END $$;

CREATE ROLE sentinela_exclusao_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
CREATE SCHEMA sentinela_exclusao AUTHORIZATION sentinela_exclusao_owner;
REVOKE ALL ON SCHEMA sentinela_exclusao FROM PUBLIC;
GRANT USAGE ON SCHEMA sentinela_exclusao TO sentinela_local_admin;
GRANT USAGE ON SCHEMA sentinela,sentinela_gestao,sentinela_pcdf_local,sentinela_import_local TO sentinela_exclusao_owner;

DO $$
DECLARE tabela regclass;
BEGIN
 FOREACH tabela IN ARRAY ARRAY[
   'sentinela.extracoes_origem','sentinela.lotes_importacao','sentinela.execucoes_importacao',
   'sentinela.linhas_origem','sentinela.linhas_staging','sentinela.pendencias_revisao',
   'sentinela.historico_correcoes','sentinela.eventos_auditoria','sentinela_gestao.inativacoes',
   'sentinela_import_local.requests','sentinela_pcdf_local.aprovacoes_pacote','sentinela_pcdf_local.entregas_pacote'
 ]::regclass[] LOOP
   EXECUTE format('GRANT SELECT,DELETE ON %s TO sentinela_exclusao_owner',tabela);
   EXECUTE format('CREATE POLICY exclusao_leitura ON %s FOR SELECT TO sentinela_exclusao_owner
     USING (session_user=''sentinela_local_admin'' AND inet_server_port()=55488)',tabela);
   EXECUTE format('CREATE POLICY exclusao_remocao ON %s FOR DELETE TO sentinela_exclusao_owner
     USING (session_user=''sentinela_local_admin'' AND inet_server_port()=55488)',tabela);
 END LOOP;
END $$;
GRANT SELECT (id,ocorrencia_id,linha_origem_id) ON sentinela.ocorrencia_naturezas TO sentinela_exclusao_owner;
GRANT SELECT (auditoria_id) ON sentinela_gestao.naturezas_inativadas TO sentinela_exclusao_owner;
CREATE POLICY exclusao_vinculos ON sentinela.ocorrencia_naturezas FOR SELECT TO sentinela_exclusao_owner
 USING (session_user='sentinela_local_admin' AND inet_server_port()=55488);
CREATE POLICY exclusao_naturezas_inativas ON sentinela_gestao.naturezas_inativadas FOR SELECT TO sentinela_exclusao_owner
 USING (session_user='sentinela_local_admin' AND inet_server_port()=55488);

-- Keep UPDATE, TRUNCATE and other roles covered by the original guards.
CREATE OR REPLACE FUNCTION sentinela.impedir_mutacao() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF current_user='sentinela_exclusao_owner' AND session_user='sentinela_local_admin'
 AND inet_server_port()=55488 AND TG_OP='DELETE' AND TG_TABLE_SCHEMA='sentinela'
 AND TG_TABLE_NAME IN ('extracoes_origem','lotes_importacao','linhas_origem','historico_correcoes','eventos_auditoria')
 THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Objeto % e imutavel: preservar origem/historico e criar nova versao.', TG_TABLE_NAME
 USING ERRCODE='55000';
END $$;

CREATE OR REPLACE FUNCTION sentinela.bloquear_correcao_sem_backend() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF inet_server_port()=55488 AND TG_TABLE_SCHEMA='sentinela' AND (
  (current_user='sentinela_gestao_owner' AND TG_TABLE_NAME='ocorrencias' AND TG_OP='UPDATE')
  OR (current_user='sentinela_exclusao_owner' AND session_user='sentinela_local_admin' AND TG_OP='DELETE'
      AND TG_TABLE_NAME IN ('linhas_staging','pendencias_revisao'))
 ) THEN RETURN NULL; END IF;
 RAISE EXCEPTION 'Correcao bloqueada ate Auth e backend transacional auditado serem implementados.' USING ERRCODE='42501';
END $$;

SET ROLE sentinela_exclusao_owner;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE sentinela_exclusao.comprovantes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lote uuid NOT NULL UNIQUE,
 responsavel text NOT NULL CHECK (responsavel~'^[a-f0-9]{64}$'),
 justificativa text NOT NULL CHECK (length(btrim(justificativa)) BETWEEN 1 AND 500),
 momento timestamptz NOT NULL DEFAULT clock_timestamp(),
 quantidades jsonb NOT NULL CHECK (jsonb_typeof(quantidades)='object')
);
ALTER TABLE sentinela_exclusao.comprovantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_exclusao.comprovantes FORCE ROW LEVEL SECURITY;
CREATE POLICY comprovantes_leitura ON sentinela_exclusao.comprovantes FOR SELECT
 USING (session_user='sentinela_local_admin' AND inet_server_port()=55488);
CREATE POLICY comprovantes_insercao ON sentinela_exclusao.comprovantes FOR INSERT
 WITH CHECK (session_user='sentinela_local_admin' AND inet_server_port()=55488);
REVOKE UPDATE,DELETE,TRUNCATE ON sentinela_exclusao.comprovantes FROM sentinela_exclusao_owner;

CREATE FUNCTION sentinela_exclusao.exigir_ambiente() RETURNS void
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF current_database()<>'sentinela_pcdf_local' OR inet_server_addr() IS DISTINCT FROM inet '127.0.0.1'
 OR inet_server_port() IS DISTINCT FROM 55488 OR session_user<>'sentinela_local_admin'
 OR nullif(current_setting('sentinela.sandbox_uuid',true),'') IS NULL
 OR EXISTS (SELECT FROM unnest(ARRAY[
   'sentinela.extracoes_origem','sentinela.lotes_importacao','sentinela.execucoes_importacao',
   'sentinela.linhas_origem','sentinela.linhas_staging','sentinela.pendencias_revisao',
   'sentinela.historico_correcoes','sentinela.eventos_auditoria','sentinela.ocorrencia_naturezas',
   'sentinela_gestao.inativacoes','sentinela_gestao.naturezas_inativadas','sentinela_import_local.requests',
   'sentinela_pcdf_local.aprovacoes_pacote','sentinela_pcdf_local.entregas_pacote','sentinela_exclusao.comprovantes'
 ]::regclass[]) t WHERE NOT row_security_active(t))
 THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION sentinela_exclusao.plano(alvo uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
WITH lote AS MATERIALIZED (
 SELECT l.id,l.nome_arquivo,l.competencia,l.versao_contrato,l.extracao_id
 FROM sentinela.lotes_importacao l WHERE l.id=alvo
), execucoes AS MATERIALIZED (
 SELECT e.id,e.status FROM sentinela.execucoes_importacao e WHERE e.lote_id=alvo
), staging AS MATERIALIZED (
 SELECT s.id,s.linha_origem_id,s.ocorrencia_id,nullif(s.campos_csv->>'ocorrencia_chave','') AS candidata
 FROM sentinela.linhas_staging s WHERE s.lote_id=alvo
), origens AS MATERIALIZED (
 SELECT DISTINCT linha_origem_id AS id FROM staging
), compartilhadas AS MATERIALIZED (
 SELECT DISTINCT o.id FROM origens o JOIN sentinela.linhas_staging s ON s.linha_origem_id=o.id WHERE s.lote_id<>alvo
), apoio_ativo AS MATERIALIZED (
 SELECT DISTINCT outro.linha_origem_id AS id
 FROM compartilhadas c JOIN sentinela.linhas_staging outro ON outro.linha_origem_id=c.id
 JOIN sentinela.execucoes_importacao e ON e.id=outro.execucao_id
 WHERE outro.lote_id<>alvo AND e.status='concluida'
 AND NOT EXISTS (SELECT FROM sentinela_gestao.inativacoes i WHERE i.lote_id=outro.lote_id OR i.staging_id=outro.id)
), exclusivas AS MATERIALIZED (
 SELECT id FROM origens EXCEPT SELECT id FROM compartilhadas
), extracoes AS MATERIALIZED (
 SELECT l.extracao_id AS id FROM lote l WHERE NOT EXISTS (
   SELECT FROM sentinela.lotes_importacao outro WHERE outro.extracao_id=l.extracao_id AND outro.id<>alvo)
), pendencias AS MATERIALIZED (
 SELECT p.id,p.ocorrencia_id FROM sentinela.pendencias_revisao p WHERE p.linha_origem_id IN (SELECT id FROM exclusivas)
), correcoes AS MATERIALIZED (
 SELECT h.id,h.staging_id FROM sentinela.historico_correcoes h
 WHERE h.staging_id IN (SELECT id FROM staging) OR h.pendencia_id IN (SELECT id FROM pendencias)
), inativacoes AS MATERIALIZED (
 SELECT i.auditoria_id AS id FROM sentinela_gestao.inativacoes i WHERE i.lote_id=alvo OR i.staging_id IN (SELECT id FROM staging)
), recibos AS MATERIALIZED (
 SELECT r.request AS id FROM sentinela_import_local.requests r
 WHERE r.receipt->>'lot'=alvo::text OR r.receipt->>'run' IN (SELECT id::text FROM execucoes)
), entregas AS MATERIALIZED (
 SELECT p.digest AS id,cardinality(p.nomes) AS partes FROM sentinela_pcdf_local.entregas_pacote p
 WHERE p.execucao_id IN (SELECT id FROM execucoes)
), eventos_diretos AS MATERIALIZED (
 SELECT a.id,a.ocorrencia_id,a.request_id,a.servico FROM sentinela.eventos_auditoria a
 WHERE a.execucao_id IN (SELECT id FROM execucoes) OR a.linha_origem_id IN (SELECT id FROM exclusivas)
   OR a.pendencia_id IN (SELECT id FROM pendencias) OR a.correcao_id IN (SELECT id FROM correcoes)
   OR a.id IN (SELECT id FROM inativacoes)
   OR a.depois->>'loteId'=alvo::text OR a.depois->>'lot'=alvo::text
   OR a.depois->>'run' IN (SELECT id::text FROM execucoes) OR a.depois->>'stagingId' IN (SELECT id::text FROM staging)
), eventos AS MATERIALIZED (
 SELECT id,ocorrencia_id FROM eventos_diretos
 UNION
 SELECT a.id,a.ocorrencia_id FROM sentinela.eventos_auditoria a
 WHERE (a.servico='pcdf-local' AND a.acao='tentativa_pcdf' AND a.request_id IN (
     SELECT e.request_id FROM eventos_diretos e WHERE e.servico='pcdf-local'))
   OR (a.servico='importacao-geral-local' AND a.request_id IN (SELECT id::text FROM recibos))
), consolidacao AS MATERIALIZED (
 SELECT n.ocorrencia_id AS id FROM sentinela.ocorrencia_naturezas n
 WHERE n.linha_origem_id IN (SELECT id FROM exclusivas)
 OR (n.linha_origem_id IN (SELECT id FROM compartilhadas) AND n.linha_origem_id NOT IN (SELECT id FROM apoio_ativo))
 UNION
 SELECT s.ocorrencia_id FROM staging s WHERE s.ocorrencia_id IS NOT NULL AND NOT EXISTS (
  SELECT FROM sentinela.ocorrencia_naturezas n WHERE n.ocorrencia_id=s.ocorrencia_id AND n.linha_origem_id=s.linha_origem_id
    AND n.linha_origem_id IN (SELECT id FROM apoio_ativo))
 UNION
 SELECT ocorrencia_id FROM pendencias WHERE ocorrencia_id IS NOT NULL
 UNION
 SELECT ocorrencia_id FROM eventos WHERE ocorrencia_id IS NOT NULL
), dependencias AS (
 SELECT 'consolidacao' AS tipo,id::text FROM consolidacao
 UNION ALL SELECT 'execucao_ativa',id::text FROM execucoes WHERE status NOT IN ('concluida','falhou','cancelada')
 UNION ALL SELECT 'origem_sem_lote',o.id::text FROM sentinela.linhas_origem o
   WHERE o.extracao_id IN (SELECT id FROM extracoes) AND o.id NOT IN (SELECT id FROM exclusivas)
 UNION ALL SELECT 'historico_compartilhado',id::text FROM correcoes
   WHERE staging_id IS NULL OR staging_id NOT IN (SELECT id FROM staging)
 UNION ALL SELECT 'historico_compartilhado',n.auditoria_id::text FROM sentinela_gestao.naturezas_inativadas n
   JOIN eventos e ON e.id=n.auditoria_id
 UNION ALL SELECT 'dependencia_desconhecida',c.conrelid::regclass::text || '.' || c.conname FROM pg_constraint c
   WHERE c.contype='f' AND c.confrelid IN (
     'sentinela.extracoes_origem'::regclass,'sentinela.lotes_importacao'::regclass,'sentinela.execucoes_importacao'::regclass,
     'sentinela.linhas_origem'::regclass,'sentinela.linhas_staging'::regclass,'sentinela.pendencias_revisao'::regclass,
     'sentinela.historico_correcoes'::regclass,'sentinela.eventos_auditoria'::regclass,'sentinela_gestao.inativacoes'::regclass,
     'sentinela_import_local.requests'::regclass,'sentinela_pcdf_local.entregas_pacote'::regclass,'sentinela_pcdf_local.aprovacoes_pacote'::regclass)
   AND (c.confdeltype NOT IN ('a','r') OR c.conrelid NOT IN (
     'sentinela.lotes_importacao'::regclass,'sentinela.execucoes_importacao'::regclass,'sentinela.linhas_origem'::regclass,
     'sentinela.linhas_staging'::regclass,'sentinela.ocorrencia_naturezas'::regclass,'sentinela.pendencias_revisao'::regclass,
     'sentinela.historico_correcoes'::regclass,'sentinela.eventos_auditoria'::regclass,'sentinela_gestao.naturezas_inativadas'::regclass,
     'sentinela_gestao.inativacoes'::regclass,'sentinela_pcdf_local.entregas_pacote'::regclass))
), escopo AS (
 SELECT 'lotes' AS grupo,id::text FROM lote
 UNION ALL SELECT 'execucoes',id::text FROM execucoes
 UNION ALL SELECT 'staging',id::text FROM staging
 UNION ALL SELECT 'origens',id::text FROM exclusivas
 UNION ALL SELECT 'extracoes',id::text FROM extracoes
 UNION ALL SELECT 'pendencias',id::text FROM pendencias
 UNION ALL SELECT 'correcoes',id::text FROM correcoes
 UNION ALL SELECT 'inativacoes',id::text FROM inativacoes
 UNION ALL SELECT 'recibos',id::text FROM recibos
 UNION ALL SELECT 'entregas',id::text FROM entregas
 UNION ALL SELECT 'aprovacoes',id::text FROM entregas
 UNION ALL SELECT 'auditorias',id::text FROM eventos
), grupos AS (
 SELECT nome,coalesce(jsonb_agg(e.id ORDER BY e.id) FILTER (WHERE e.id IS NOT NULL),'[]') AS ids
 FROM unnest(ARRAY['lotes','execucoes','staging','origens','extracoes','pendencias','correcoes','inativacoes',
   'recibos','entregas','aprovacoes','auditorias']) nome LEFT JOIN escopo e ON e.grupo=nome GROUP BY nome
)
SELECT jsonb_build_object('id',l.id,'arquivo',l.nome_arquivo,'competencia',to_char(l.competencia,'YYYY-MM'),
 'contrato',l.versao_contrato,'candidatas',(SELECT count(DISTINCT candidata) FROM staging),
 'compartilhadas',(SELECT count(*) FROM compartilhadas),
 'artefatos',(SELECT coalesce(sum(partes),0) FROM entregas),
 'escopo',(SELECT jsonb_object_agg(nome,ids) FROM grupos),
 'apoio',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM compartilhadas),
 'bloqueios',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.tipo,d.id),'[]') FROM dependencias d))
FROM lote l
$$;

CREATE FUNCTION sentinela_exclusao.quantidades(plano jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_object_agg(grupo,jsonb_array_length(ids)) || jsonb_build_object('artefatos',plano->'artefatos')
 FROM jsonb_each(plano->'escopo') e(grupo,ids)
$$;

CREATE FUNCTION sentinela_exclusao.revisao(plano jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT encode(sha256(convert_to(plano::text,'UTF8')),'hex')
$$;

CREATE FUNCTION sentinela_exclusao.previa(alvo uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE plano jsonb;
BEGIN
 PERFORM sentinela_exclusao.exigir_ambiente();
 plano:=sentinela_exclusao.plano(alvo);
 RETURN plano - ARRAY['escopo','apoio','artefatos'] || jsonb_build_object(
   'revisao',sentinela_exclusao.revisao(plano),'quantidades',sentinela_exclusao.quantidades(plano),
   'bloqueios',(SELECT coalesce(jsonb_agg(b ORDER BY b.tipo),'[]') FROM (
     SELECT tipo,count(*) AS quantidade,(array_agg(id ORDER BY id))[1:10] AS ids
     FROM jsonb_to_recordset(plano->'bloqueios') AS d(tipo text,id text) GROUP BY tipo
   ) b));
END $$;

CREATE FUNCTION sentinela_exclusao.excluir(p jsonb,conta text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE alvo uuid:=(p->>'id')::uuid; chave_geral text;
 espacos constant text:=U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
 motivo text:=btrim(p->>'justificativa',espacos);
 plano jsonb; item record; ids text[]; removidos bigint; comprovante uuid;
BEGIN
 PERFORM sentinela_exclusao.exigir_ambiente();
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
 IF alvo IS NULL OR p->>'confirmacao' IS DISTINCT FROM alvo::text OR p->'definitiva' IS DISTINCT FROM 'true'::jsonb
 OR jsonb_typeof(p->'justificativa') IS DISTINCT FROM 'string'
 OR NOT coalesce(length(motivo) BETWEEN 1 AND 500,false) OR NOT coalesce(conta~'^[a-f0-9]{64}$',false)
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
 SELECT x.sha256_xml INTO chave_geral FROM sentinela.lotes_importacao l
 JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id WHERE l.id=alvo AND x.fonte='IMPORTACAO-GERAL-LOCAL';
 IF chave_geral IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('general:'||chave_geral,0)); END IF;
 -- Freeze the FK topology from the plan through commit. Existing writers share the intake locks above.
 LOCK TABLE sentinela.extracoes_origem,sentinela.lotes_importacao,sentinela.execucoes_importacao,sentinela.linhas_origem,
   sentinela.linhas_staging,sentinela.pendencias_revisao,sentinela.historico_correcoes,sentinela.eventos_auditoria,
   sentinela_gestao.inativacoes,sentinela_import_local.requests,sentinela_pcdf_local.entregas_pacote,
   sentinela_pcdf_local.aprovacoes_pacote IN ROW EXCLUSIVE MODE;
 plano:=sentinela_exclusao.plano(alvo);
 IF plano IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002'; END IF;
 IF p->>'revisao' IS DISTINCT FROM sentinela_exclusao.revisao(plano) OR plano->'bloqueios'<>'[]'::jsonb
 THEN RAISE EXCEPTION USING ERRCODE='40001'; END IF;

 FOR item IN SELECT * FROM (VALUES
   ('inativacoes','sentinela_gestao.inativacoes','auditoria_id','uuid'),
   ('auditorias','sentinela.eventos_auditoria','id','uuid'),
   ('correcoes','sentinela.historico_correcoes','id','uuid'),
   ('recibos','sentinela_import_local.requests','request','uuid'),
   ('entregas','sentinela_pcdf_local.entregas_pacote','digest','sentinela.sha256'),
   ('aprovacoes','sentinela_pcdf_local.aprovacoes_pacote','digest','sentinela.sha256'),
   ('pendencias','sentinela.pendencias_revisao','id','uuid'),
   ('staging','sentinela.linhas_staging','id','uuid'),
   ('origens','sentinela.linhas_origem','id','uuid'),
   ('execucoes','sentinela.execucoes_importacao','id','uuid'),
   ('lotes','sentinela.lotes_importacao','id','uuid'),
   ('extracoes','sentinela.extracoes_origem','id','uuid')
 ) AS d(grupo,tabela,chave,tipo)
 LOOP
   ids:=ARRAY(SELECT jsonb_array_elements_text(plano->'escopo'->item.grupo));
   IF cardinality(ids)=0 THEN CONTINUE; END IF;
   EXECUTE format('DELETE FROM %s WHERE %I=ANY($1::%s[])',item.tabela,item.chave,item.tipo) USING ids;
   GET DIAGNOSTICS removidos=ROW_COUNT;
   IF removidos<>cardinality(ids) THEN RAISE EXCEPTION USING ERRCODE='40001'; END IF;
 END LOOP;

 INSERT INTO sentinela_exclusao.comprovantes(lote,responsavel,justificativa,quantidades)
 VALUES(alvo,conta,motivo,sentinela_exclusao.quantidades(plano)) RETURNING id INTO comprovante;
 RETURN jsonb_build_object('id',alvo,'auditoria',comprovante);
END $$;

CREATE FUNCTION sentinela_exclusao.historico(pagina integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM sentinela_exclusao.exigir_ambiente();
 IF pagina IS NULL OR pagina NOT BETWEEN 1 AND 1000000 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
 RETURN (SELECT jsonb_build_object('pagina',pagina,'total',(SELECT count(*) FROM sentinela_exclusao.comprovantes),
   'itens',coalesce(jsonb_agg(to_jsonb(c) ORDER BY momento DESC,id DESC),'[]')) FROM (
   SELECT * FROM sentinela_exclusao.comprovantes ORDER BY momento DESC,id DESC LIMIT 25 OFFSET (pagina-1)*25
 ) c);
END $$;

RESET ROLE;
GRANT EXECUTE ON FUNCTION sentinela_exclusao.previa(uuid),sentinela_exclusao.excluir(jsonb,text),
 sentinela_exclusao.historico(integer) TO sentinela_local_admin;
COMMIT;
