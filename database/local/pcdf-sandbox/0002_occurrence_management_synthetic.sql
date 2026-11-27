-- Dedicated synthetic qualification only. Install with the attested expected_uuid.
BEGIN;
SET LOCAL search_path=pg_catalog,pg_temp;
SET LOCAL lock_timeout='5s';
SELECT set_config('sentinela.gestao_expected_uuid', :'expected_uuid', true);
DO $$
BEGIN
 IF current_database()<>'sentinela_pcdf_local' OR inet_server_addr() IS DISTINCT FROM inet '127.0.0.1'
 OR inet_server_port() IS DISTINCT FROM 55488 OR nullif(current_setting('sentinela.sandbox_uuid',true),'')
 IS DISTINCT FROM current_setting('sentinela.gestao_expected_uuid')
 OR nullif(current_setting('sentinela.sandbox_uuid',true),'') IS NULL
 OR to_regclass('sentinela_pcdf_local.entregas_pacote') IS NULL
 OR to_regprocedure('sentinela_ocorrencias_local.identidade()') IS NULL
 OR to_regclass('sentinela_ocorrencias_manual.cadastros') IS NULL
 THEN RAISE EXCEPTION 'Destino sintético de gestão atestado obrigatório'; END IF;
END $$;

CREATE ROLE sentinela_gestao_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
CREATE SCHEMA sentinela_gestao AUTHORIZATION sentinela_gestao_owner;
REVOKE ALL ON SCHEMA sentinela_gestao FROM PUBLIC;
GRANT USAGE ON SCHEMA sentinela_gestao TO sentinela_local_admin,sentinela_local_operator,sentinela_ocorrencias_reader;
GRANT USAGE ON SCHEMA sentinela,extensions,sentinela_pcdf_local,sentinela_ocorrencias_manual TO sentinela_gestao_owner;
-- The deferred trigger serializes the geometry in the original session at COMMIT.
GRANT USAGE ON SCHEMA extensions TO sentinela_local_admin,sentinela_local_operator;

GRANT SELECT ON sentinela.lotes_importacao,sentinela.execucoes_importacao,sentinela.extracoes_origem,
 sentinela.linhas_staging,sentinela.linhas_origem,sentinela.pendencias_revisao,sentinela.ocorrencias,
 sentinela.ocorrencia_naturezas,sentinela.regioes_administrativas,sentinela.eventos_auditoria,sentinela.usuarios
 TO sentinela_gestao_owner;
GRANT UPDATE (data_fato,horario_fato,ativo) ON sentinela.ocorrencias TO sentinela_gestao_owner;
GRANT SELECT (ocorrencia_id) ON sentinela_ocorrencias_manual.cadastros TO sentinela_gestao_owner;
GRANT SELECT (digest,nomes,execucao_id) ON sentinela_pcdf_local.entregas_pacote TO sentinela_gestao_owner;
GRANT INSERT (ator_tipo,servico,acao,ocorrencia_id,linha_origem_id,execucao_id,antes,depois,justificativa,request_id)
 ON sentinela.eventos_auditoria TO sentinela_gestao_owner;
GRANT EXECUTE ON FUNCTION sentinela.carimbar_auditoria(),sentinela.validar_vinculos_evento(),
 sentinela.bloquear_autoria_manual_sem_auth() TO sentinela_gestao_owner;
CREATE POLICY gestao_extracao ON sentinela.extracoes_origem FOR SELECT TO sentinela_gestao_owner
 USING (fonte IN ('PCDF','IMPORTACAO-GERAL-LOCAL'));
CREATE POLICY gestao_lote ON sentinela.lotes_importacao FOR SELECT TO sentinela_gestao_owner
 USING (EXISTS(SELECT FROM sentinela.extracoes_origem x WHERE x.id=extracao_id));
CREATE POLICY gestao_execucao ON sentinela.execucoes_importacao FOR SELECT TO sentinela_gestao_owner
 USING (EXISTS(SELECT FROM sentinela.lotes_importacao l WHERE l.id=lote_id));
CREATE POLICY gestao_staging ON sentinela.linhas_staging FOR SELECT TO sentinela_gestao_owner
 USING (EXISTS(SELECT FROM sentinela.lotes_importacao l WHERE l.id=lote_id));
CREATE POLICY gestao_origem ON sentinela.linhas_origem FOR SELECT TO sentinela_gestao_owner
 USING (EXISTS(SELECT FROM sentinela.extracoes_origem x WHERE x.id=extracao_id));
CREATE POLICY gestao_pendencia ON sentinela.pendencias_revisao FOR SELECT TO sentinela_gestao_owner
 USING (EXISTS(SELECT FROM sentinela.linhas_origem o WHERE o.id=pendencias_revisao.linha_origem_id));
CREATE POLICY gestao_ocorrencia ON sentinela.ocorrencias FOR SELECT TO sentinela_gestao_owner USING (true);
CREATE POLICY gestao_ocorrencia_update ON sentinela.ocorrencias FOR UPDATE TO sentinela_gestao_owner
 USING (session_user='sentinela_local_admin' OR (session_user='sentinela_local_operator' AND origem='manual' AND fonte='SENTINELA_MANUAL'))
 WITH CHECK (session_user='sentinela_local_admin' OR (session_user='sentinela_local_operator' AND origem='manual' AND fonte='SENTINELA_MANUAL'));
CREATE POLICY gestao_naturezas ON sentinela.ocorrencia_naturezas FOR SELECT TO sentinela_gestao_owner USING (true);
CREATE POLICY gestao_ra ON sentinela.regioes_administrativas FOR SELECT TO sentinela_gestao_owner USING (true);
CREATE POLICY gestao_usuarios ON sentinela.usuarios FOR SELECT TO sentinela_gestao_owner USING (true);
CREATE POLICY gestao_cadastros ON sentinela_ocorrencias_manual.cadastros FOR SELECT TO sentinela_gestao_owner USING (true);
CREATE POLICY gestao_custodia ON sentinela_pcdf_local.entregas_pacote FOR SELECT TO sentinela_gestao_owner USING (true);
CREATE POLICY gestao_audit_read ON sentinela.eventos_auditoria FOR SELECT TO sentinela_gestao_owner
 USING (servico IN ('pcdf-local','importacao-geral-local','ocorrencias-gestao-local'));
CREATE POLICY gestao_audit_write ON sentinela.eventos_auditoria FOR INSERT TO sentinela_gestao_owner
 WITH CHECK (ator_tipo='servico' AND servico='ocorrencias-gestao-local'
 AND depois->>'login'=session_user::text AND depois->>'conta'~'^[a-f0-9]{64}$'
 AND (session_user='sentinela_local_admin' OR (session_user='sentinela_local_operator'
 AND acao IN ('editar_manual','inativar_manual'))));

CREATE TABLE sentinela_gestao.inativacoes (
 lote_id uuid REFERENCES sentinela.lotes_importacao(id),
 staging_id uuid REFERENCES sentinela.linhas_staging(id),
 auditoria_id uuid PRIMARY KEY REFERENCES sentinela.eventos_auditoria(id),
 UNIQUE(lote_id), UNIQUE(staging_id), CHECK (num_nonnulls(lote_id,staging_id)=1)
);
ALTER TABLE sentinela_gestao.inativacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_gestao.inativacoes FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON sentinela_gestao.inativacoes TO sentinela_gestao_owner;
GRANT SELECT ON sentinela_gestao.inativacoes TO sentinela_ocorrencias_reader;
CREATE POLICY gestao_inativacoes_read ON sentinela_gestao.inativacoes FOR SELECT TO sentinela_gestao_owner,sentinela_ocorrencias_reader
 USING (session_user IN ('sentinela_local_admin','sentinela_local_operator'));
CREATE POLICY gestao_inativacoes_write ON sentinela_gestao.inativacoes FOR INSERT TO sentinela_gestao_owner
 WITH CHECK (session_user='sentinela_local_admin');
CREATE INDEX gestao_correcao_staging_idx ON sentinela.eventos_auditoria ((depois->>'stagingId'),registrado_em DESC,id DESC)
 WHERE servico='ocorrencias-gestao-local' AND acao='corrigir_associacao';
GRANT SELECT (id,acao,servico,depois,registrado_em) ON sentinela.eventos_auditoria TO sentinela_ocorrencias_reader;
CREATE POLICY gestao_projecao_staging ON sentinela.eventos_auditoria FOR SELECT TO sentinela_ocorrencias_reader
 USING (session_user IN ('sentinela_local_admin','sentinela_local_operator') AND servico='ocorrencias-gestao-local'
 AND acao='corrigir_associacao');

-- The operational readers retain their original definitions outside this installation.
ALTER POLICY ocorrencias_read_lotes ON sentinela.lotes_importacao
 USING (versao_contrato IN ('1.0','2.0') AND EXISTS(SELECT FROM sentinela.extracoes_origem x WHERE x.id=lotes_importacao.extracao_id));
ALTER POLICY ocorrencias_read_execucoes ON sentinela.execucoes_importacao
 USING (status='concluida' AND versao_importador IN ('pcdf-local-v1','pcdf-local-v2')
 AND EXISTS(SELECT FROM sentinela.lotes_importacao l WHERE l.id=lote_id));
ALTER POLICY ocorrencias_read_pendencias ON sentinela.pendencias_revisao
 USING (versao_regra IN ('pcdf-local-v1','pcdf-local-v2') AND EXISTS(SELECT FROM sentinela.linhas_origem o WHERE o.id=pendencias_revisao.linha_origem_id));
CREATE OR REPLACE VIEW sentinela_ocorrencias_local.importados WITH (security_invoker=true) AS
 SELECT s.id,s.linha_origem_id AS origem_id,
 nullif(concat_ws(' / ',nullif(o.ano_registro,''),nullif(o.unidade_registro,''),nullif(o.numero_registro,'')),'') AS identificacao,
 ((s.derivados_efetivos || coalesce(c.campos,'{}'))->>'data')::date AS data,
 (s.derivados_efetivos || coalesce(c.campos,'{}'))->>'horario' AS hora,
 coalesce(c.campos->>'natureza',nullif(o.natureza_original,'')) AS natureza,
 nullif(o.natureza_padronizada_pcdf,'') AS padronizada, nullif(o.ra_original,'') AS ra,
 (jsonb_build_object('local',coalesce(s.derivados_efetivos->>'local',nullif(s.campos_csv->>'local',''))) || coalesce(c.campos,'{}'))->>'local' AS local,
 s.estado AS situacao,l.id AS lote,l.nome_arquivo AS arquivo,to_char(l.competencia,'YYYY-MM') AS competencia,
 s.execucao_id AS execucao,s.registro_csv AS ordinal
 FROM sentinela.linhas_staging s JOIN sentinela.linhas_origem o ON (o.id,o.extracao_id)=(s.linha_origem_id,s.extracao_id)
 JOIN sentinela.lotes_importacao l ON l.id=s.lote_id
 LEFT JOIN LATERAL (SELECT e.depois->'campos' AS campos FROM sentinela.eventos_auditoria e
 WHERE e.servico='ocorrencias-gestao-local' AND e.acao='corrigir_associacao' AND e.depois->>'stagingId'=s.id::text
 ORDER BY e.registrado_em DESC,e.id DESC LIMIT 1) c ON true
 WHERE NOT EXISTS(SELECT FROM sentinela_gestao.inativacoes i WHERE i.lote_id=s.lote_id OR i.staging_id=s.id);

-- Pending issues are counted by origin once, including shared origins with an active snapshot.
DO $$
DECLARE definition text := pg_get_functiondef('sentinela_ocorrencias_local.resumo()'::regprocedure);
 old_count text := '(SELECT count(*) FROM sentinela.pendencias_revisao)';
BEGIN
 IF strpos(definition,old_count)=0 THEN RAISE EXCEPTION 'Revisão inesperada do resumo'; END IF;
 EXECUTE replace(definition,old_count,'(SELECT count(*) FROM sentinela.pendencias_revisao p
 WHERE EXISTS(SELECT FROM sentinela_ocorrencias_local.importados i WHERE i.origem_id=p.linha_origem_id))');
END $$;

SET LOCAL ROLE sentinela_gestao_owner;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE VIEW sentinela_gestao.lotes AS
 SELECT l.id,l.nome_arquivo AS arquivo,to_char(l.competencia,'YYYY-MM') AS competencia,
 l.versao_contrato AS contrato,CASE WHEN x.fonte='PCDF' THEN 'CSV' ELSE upper(x.manifesto->>'format') END AS formato,
 coalesce(e.finalizado_em,e.criado_em,l.criado_em) AS data,
 CASE WHEN x.fonte='PCDF' THEN u.nome_exibicao ELSE (
  SELECT a.nome_exibicao FROM sentinela.eventos_auditoria h JOIN sentinela.usuarios a ON a.id::text=h.depois->>'subject'
  WHERE h.servico='importacao-geral-local' AND h.acao='staging_geral' AND h.execucao_id=e.id
  ORDER BY h.registrado_em LIMIT 1) END AS responsavel,
 CASE WHEN i.auditoria_id IS NOT NULL THEN 'inativada'
 WHEN e.status='concluida' AND e.pendencias_detectadas>0 THEN 'com_pendencias'
 WHEN e.status IN ('concluida','falhou','cancelada') THEN e.status ELSE 'em_processamento' END AS situacao,
 e.id AS execucao,e.linhas_lidas,e.pendencias_detectadas,l.sha256_arquivo AS sha256,l.tamanho_bytes AS bytes,
 x.fonte,CASE WHEN x.fonte='PCDF' THEN x.sha256_xml END AS sha_xml,l.extracao_id
 FROM sentinela.lotes_importacao l JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id
 LEFT JOIN LATERAL (SELECT r.* FROM sentinela.execucoes_importacao r WHERE r.lote_id=l.id ORDER BY r.tentativa DESC LIMIT 1) e ON true
 LEFT JOIN sentinela.usuarios u ON u.id=coalesce(e.solicitado_por,l.solicitado_por)
 LEFT JOIN sentinela_gestao.inativacoes i ON i.lote_id=l.id;

CREATE FUNCTION sentinela_gestao.contagens(p_exec uuid,p_fonte text,p_contrato text,p_lidas bigint,p_pendencias bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('recebidos',coalesce(p_lidas,0),'pendencias',coalesce(p_pendencias,0),
 'candidatas',CASE WHEN p_fonte='PCDF' THEN count(DISTINCT nullif(s.campos_csv->>'ocorrencia_chave','')) END,
 'novas',CASE WHEN p_contrato='2.0' THEN count(*) FILTER(WHERE s.derivados_efetivos->>'recepcao' IN ('nova_origem','nova_associacao_candidata_conhecida')) END,
 'reutilizadas',CASE WHEN p_contrato='2.0' THEN count(*) FILTER(WHERE s.derivados_efetivos->>'recepcao'='origem_reutilizada') END)
 FROM sentinela.linhas_staging s WHERE s.execucao_id=p_exec
$$;

CREATE FUNCTION sentinela_gestao.impacto(p_lote uuid,p_staging uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 WITH linhas AS (
  SELECT s.linha_origem_id,s.campos_csv FROM sentinela.linhas_staging s
  WHERE (s.lote_id=p_lote OR s.id=p_staging)
  AND NOT EXISTS(SELECT FROM sentinela_gestao.inativacoes i WHERE i.lote_id=s.lote_id OR i.staging_id=s.id)
 ), afetadas AS (
  SELECT DISTINCT linha_origem_id FROM linhas
 ), compartilhadas AS (
  SELECT DISTINCT s.linha_origem_id,s.lote_id FROM sentinela.linhas_staging s
  JOIN afetadas a USING(linha_origem_id) JOIN sentinela.execucoes_importacao e ON e.id=s.execucao_id
  WHERE s.lote_id IS DISTINCT FROM p_lote AND s.id IS DISTINCT FROM p_staging AND e.status='concluida'
  AND NOT EXISTS(SELECT FROM sentinela_gestao.inativacoes i WHERE i.lote_id=s.lote_id OR i.staging_id=s.id)
 ), consolidadas AS (
  SELECT n.id,a.linha_origem_id FROM afetadas a JOIN sentinela.ocorrencia_naturezas n USING(linha_origem_id)
  JOIN sentinela.ocorrencias o ON o.id=n.ocorrencia_id WHERE o.ativo
 )
 SELECT jsonb_build_object('compartilhadas',(SELECT count(DISTINCT linha_origem_id) FROM compartilhadas),
 'lotesRelacionados',(SELECT count(DISTINCT lote_id) FROM compartilhadas),
 'recebidosAfetados',(SELECT count(*) FROM linhas),
 'candidatasAfetadas',(SELECT count(DISTINCT nullif(campos_csv->>'ocorrencia_chave','')) FROM linhas),
 'pendenciasAfetadas',(SELECT count(*) FROM sentinela.pendencias_revisao p JOIN afetadas a ON a.linha_origem_id=p.linha_origem_id
  WHERE NOT EXISTS(SELECT FROM compartilhadas c WHERE c.linha_origem_id=a.linha_origem_id)),
 'vinculosConsolidados',(SELECT count(*) FROM consolidadas),
 'bloqueiaConsolidacao',EXISTS(SELECT FROM consolidadas a
 WHERE NOT EXISTS(SELECT FROM compartilhadas c WHERE c.linha_origem_id=a.linha_origem_id)),
 'revisao',encode(sha256(convert_to(jsonb_build_array(
  (SELECT coalesce(jsonb_agg(linha_origem_id ORDER BY linha_origem_id),'[]') FROM afetadas),
  (SELECT coalesce(jsonb_agg(jsonb_build_array(linha_origem_id,lote_id) ORDER BY linha_origem_id,lote_id),'[]') FROM compartilhadas),
  (SELECT coalesce(jsonb_agg(jsonb_build_array(n.id,o.ativo) ORDER BY n.id),'[]') FROM afetadas a
   JOIN sentinela.ocorrencia_naturezas n USING(linha_origem_id) JOIN sentinela.ocorrencias o ON o.id=n.ocorrencia_id),
  (SELECT e.id FROM sentinela.eventos_auditoria e WHERE e.servico='ocorrencias-gestao-local'
   AND e.acao='corrigir_associacao' AND e.depois->>'stagingId'=p_staging::text ORDER BY e.registrado_em DESC,e.id DESC LIMIT 1)
 )::text,'UTF8')),'hex'))
$$;

CREATE FUNCTION sentinela_gestao.arquivos(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 WITH filtrados AS MATERIALIZED (
 SELECT l.* FROM sentinela_gestao.lotes l
 WHERE session_user IN ('sentinela_local_admin','sentinela_local_operator')
 AND (p->>'busca' IS NULL OR strpos(lower(l.arquivo||' '||l.id::text),lower(p->>'busca'))>0)
 AND (p->>'competencia' IS NULL OR l.competencia=p->>'competencia')
 AND (p->>'situacao' IS NULL OR l.situacao=p->>'situacao')
 AND (p->>'dataInicial' IS NULL OR (l.data AT TIME ZONE 'America/Sao_Paulo')::date>=(p->>'dataInicial')::date)
 AND (p->>'dataFinal' IS NULL OR (l.data AT TIME ZONE 'America/Sao_Paulo')::date<=(p->>'dataFinal')::date)
 ), pagina AS (
 SELECT * FROM filtrados ORDER BY data DESC,id DESC LIMIT 25 OFFSET (greatest(1,(p->>'pagina')::int)-1)*25
 )
 SELECT jsonb_build_object('pagina',(p->>'pagina')::int,'total',(SELECT count(*) FROM filtrados),'itens',coalesce((
 SELECT jsonb_agg((to_jsonb(l)-ARRAY['linhas_lidas','pendencias_detectadas','sha256','bytes','fonte','sha_xml','extracao_id']) ||
 sentinela_gestao.contagens(execucao,fonte,contrato,linhas_lidas,pendencias_detectadas) ORDER BY data DESC,id DESC) FROM pagina l),'[]'))
$$;

CREATE FUNCTION sentinela_gestao.arquivo(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT (to_jsonb(l)-ARRAY['linhas_lidas','pendencias_detectadas','sha_xml','extracao_id']) ||
 sentinela_gestao.contagens(execucao,fonte,contrato,linhas_lidas,pendencias_detectadas) ||
 sentinela_gestao.impacto(l.id,NULL) || jsonb_build_object('shaXml',l.sha_xml,
 'manifesto',(SELECT e.depois->>'manifestSha' FROM sentinela.eventos_auditoria e
   WHERE e.servico='pcdf-local' AND e.execucao_id=l.execucao AND e.depois->>'manifestSha' IS NOT NULL ORDER BY e.registrado_em LIMIT 1),
 'pacote',(SELECT jsonb_build_object('digest',p.digest,'artefatos',p.nomes)
   FROM sentinela_pcdf_local.entregas_pacote p WHERE p.execucao_id=l.execucao ORDER BY p.digest LIMIT 1),
 'tentativas',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'numero',e.tentativa,'situacao',e.status,'data',e.criado_em)
   ORDER BY e.tentativa) FROM sentinela.execucoes_importacao e WHERE e.lote_id=l.id),'[]'),
 'historico',coalesce((SELECT jsonb_agg(h.item ORDER BY h.registrado_em DESC,h.id DESC) FROM (
   SELECT e.id,e.registrado_em,jsonb_build_object('acao',e.acao,'data',e.registrado_em,'justificativa',e.justificativa,
    'responsavel',coalesce(e.depois->>'login',u.nome_exibicao)) AS item
   FROM sentinela.eventos_auditoria e LEFT JOIN sentinela.usuarios u ON u.id=e.usuario_id
   WHERE (e.execucao_id IN (SELECT r.id FROM sentinela.execucoes_importacao r WHERE r.lote_id=l.id)
     OR e.depois->>'loteId'=l.id::text OR e.depois->>'lot'=l.id::text)
   ORDER BY e.registrado_em DESC,e.id DESC LIMIT 100
 ) h),'[]'))
 FROM sentinela_gestao.lotes l WHERE l.id=p_id AND session_user IN ('sentinela_local_admin','sentinela_local_operator')
$$;

CREATE FUNCTION sentinela_gestao.associacao(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('data',s.derivados_efetivos->>'data','horario',s.derivados_efetivos->>'horario',
 'natureza',nullif(o.natureza_original,''),'local',coalesce(s.derivados_efetivos->>'local',nullif(s.campos_csv->>'local',''))) ||
 coalesce((SELECT e.depois->'campos' FROM sentinela.eventos_auditoria e
 WHERE e.servico='ocorrencias-gestao-local' AND e.acao='corrigir_associacao' AND e.depois->>'stagingId'=s.id::text
 ORDER BY e.registrado_em DESC,e.id DESC LIMIT 1),'{}')
 FROM sentinela.linhas_staging s JOIN sentinela.linhas_origem o ON o.id=s.linha_origem_id
 JOIN sentinela.extracoes_origem x ON x.id=s.extracao_id JOIN sentinela.execucoes_importacao r ON r.id=s.execucao_id
 WHERE x.fonte='PCDF' AND s.id=p_id AND r.status='concluida'
 AND NOT EXISTS(SELECT FROM sentinela_gestao.inativacoes i WHERE i.lote_id=s.lote_id OR i.staging_id=s.id)
$$;

CREATE FUNCTION sentinela_gestao.alvo(p_area text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE campos jsonb;
BEGIN
 IF session_user NOT IN ('sentinela_local_admin','sentinela_local_operator')
 OR (p_area<>'manuais' AND session_user<>'sentinela_local_admin') THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
 IF p_area='importados' THEN
  campos:=sentinela_gestao.associacao(p_id);
  IF campos IS NULL THEN RETURN NULL; END IF;
  RETURN (SELECT campos || jsonb_build_object('id',s.id,'identificacao','Associação '||s.registro_csv,
   'vinculos',(SELECT count(*) FROM sentinela.linhas_staging a WHERE a.lote_id=s.lote_id AND a.execucao_id=s.execucao_id
    AND (a.id=s.id OR (nullif(s.campos_csv->>'ocorrencia_chave','') IS NOT NULL
     AND a.campos_csv->>'ocorrencia_chave'=s.campos_csv->>'ocorrencia_chave'))
    AND NOT EXISTS(SELECT FROM sentinela_gestao.inativacoes i WHERE i.staging_id=a.id)),
   'versao',NULL,'editavel',s.estado<>'consolidada' AND NOT EXISTS(SELECT FROM sentinela.ocorrencia_naturezas a WHERE a.linha_origem_id=s.linha_origem_id))
   || sentinela_gestao.impacto(NULL,p_id) FROM sentinela.linhas_staging s WHERE s.id=p_id);
 END IF;
 RETURN (SELECT jsonb_build_object('id',o.id,'identificacao',coalesce(nullif(concat_ws(' / ',o.ano_registro,o.unidade_registro,o.numero_registro),''),o.id::text),
  'data',o.data_fato,'horario',o.horario_fato,'local',o.local,'natureza',NULL,'versao',o.versao::text,
  'revisao',NULL,'editavel',p_area='manuais','compartilhadas',0,'lotesRelacionados',0,'bloqueiaConsolidacao',false,
  'recebidosAfetados',0,'candidatasAfetadas',0,'pendenciasAfetadas',0,
  'vinculos',(SELECT count(*) FROM sentinela.ocorrencia_naturezas a WHERE a.ocorrencia_id=o.id))
 FROM sentinela.ocorrencias o WHERE o.id=p_id AND o.ativo AND (
  (p_area='manuais' AND o.origem='manual' AND o.fonte='SENTINELA_MANUAL' AND o.consolidacao_status='em_revisao'
   AND EXISTS(SELECT FROM sentinela_ocorrencias_manual.cadastros c WHERE c.ocorrencia_id=o.id))
  OR (p_area='consolidadas' AND o.consolidacao_status='consolidada')));
END $$;

CREATE FUNCTION sentinela_gestao.mutar(p jsonb,p_conta text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE operacao text:=p->>'acao'; alvo uuid:=(p->>'id')::uuid; motivo text:=btrim(p->>'justificativa');
 auditoria uuid:=gen_random_uuid(); contexto jsonb; antes jsonb; depois jsonb; alteracoes jsonb;
 staging sentinela.linhas_staging; ocorrencia sentinela.ocorrencias; nova_data date; nova_hora time;
BEGIN
 IF current_database()<>'sentinela_pcdf_local' OR inet_server_addr() IS DISTINCT FROM inet '127.0.0.1'
 OR inet_server_port() IS DISTINCT FROM 55488 OR current_setting('transaction_isolation')<>'read committed'
 OR session_user NOT IN ('sentinela_local_admin','sentinela_local_operator')
 OR (session_user<>'sentinela_local_admin' AND operacao NOT IN ('editar_manual','inativar_manual'))
 THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
 IF alvo IS NULL OR NOT coalesce(length(motivo) BETWEEN 1 AND 500,false)
 OR NOT coalesce(p_conta~'^[a-f0-9]{64}$',false) OR operacao IS NULL OR operacao NOT IN
 ('inativar_lote','inativar_associacao','corrigir_associacao','editar_manual','inativar_manual','inativar_consolidada')
 OR (operacao LIKE 'inativar_%' AND p->>'confirmacao' IS DISTINCT FROM alvo::text)
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;

 -- Serialize with both PCDF versions and with other management changes.
 PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
 IF operacao='inativar_lote' THEN
  contexto:=sentinela_gestao.arquivo(alvo);
  IF contexto IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002'; END IF;
  IF contexto->>'situacao' NOT IN ('concluida','com_pendencias') OR (contexto->>'bloqueiaConsolidacao')::boolean
   OR p->>'revisao' IS DISTINCT FROM contexto->>'revisao'
  THEN RAISE EXCEPTION USING ERRCODE='40001'; END IF;
  antes:=contexto - ARRAY['historico','tentativas','pacote','revisao'];
  depois:=jsonb_build_object('loteId',alvo,'situacao','inativada');
 ELSIF operacao IN ('inativar_associacao','corrigir_associacao') THEN
  contexto:=sentinela_gestao.alvo('importados',alvo);
  IF contexto IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002'; END IF;
  IF p->>'revisao' IS DISTINCT FROM contexto->>'revisao'
   OR (operacao='inativar_associacao' AND (contexto->>'bloqueiaConsolidacao')::boolean)
   OR (operacao='corrigir_associacao' AND NOT (contexto->>'editavel')::boolean)
  THEN RAISE EXCEPTION USING ERRCODE='40001'; END IF;
  SELECT * INTO staging FROM sentinela.linhas_staging WHERE id=alvo;
  IF operacao='corrigir_associacao' AND p?'lote' AND (p->>'lote')::uuid IS DISTINCT FROM staging.lote_id
  THEN RAISE EXCEPTION USING ERRCODE='P0002'; END IF;
  antes:=sentinela_gestao.associacao(alvo);
  depois:=jsonb_build_object('loteId',staging.lote_id,'stagingId',alvo);
  IF operacao='corrigir_associacao' THEN
   alteracoes:=p->'alteracoes';
   IF jsonb_typeof(alteracoes) IS DISTINCT FROM 'object' OR alteracoes='{}' OR
    (alteracoes-ARRAY['data','horario','natureza','local'])<>'{}'
    OR (alteracoes?'data' AND NOT coalesce(alteracoes->>'data'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND isfinite((alteracoes->>'data')::date),false))
    OR (alteracoes?'horario' AND alteracoes->'horario'<>'null' AND NOT coalesce(alteracoes->>'horario'~'^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$',false))
    OR (alteracoes?'natureza' AND NOT coalesce(jsonb_typeof(alteracoes->'natureza')='string' AND length(btrim(alteracoes->>'natureza')) BETWEEN 1 AND 240,false))
    OR (alteracoes?'local' AND alteracoes->'local'<>'null' AND NOT coalesce(jsonb_typeof(alteracoes->'local')='string' AND length(alteracoes->>'local')<=240,false))
   THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
   IF antes=antes||alteracoes THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
   depois:=depois||jsonb_build_object('campos',antes||alteracoes,'alteracoes',alteracoes);
  END IF;
 ELSE
  contexto:=sentinela_gestao.alvo(CASE WHEN operacao='inativar_consolidada' THEN 'consolidadas' ELSE 'manuais' END,alvo);
  IF contexto IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002'; END IF;
  SELECT * INTO ocorrencia FROM sentinela.ocorrencias WHERE id=alvo FOR UPDATE;
  IF NOT ocorrencia.ativo OR p->>'versao' IS DISTINCT FROM ocorrencia.versao::text THEN RAISE EXCEPTION USING ERRCODE='40001'; END IF;
  antes:=to_jsonb(ocorrencia);
  IF operacao='editar_manual' THEN
   IF NOT coalesce(p->>'data'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND p->>'horario'~'^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$',false)
   THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
   nova_data:=(p->>'data')::date; nova_hora:=(p->>'horario')::time;
   IF nova_data+nova_hora > (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')
    OR (nova_data,nova_hora) IS NOT DISTINCT FROM (ocorrencia.data_fato,ocorrencia.horario_fato)
    OR (SELECT count(*) FROM sentinela.regioes_administrativas r WHERE r.vigencia @> nova_data
     AND extensions.ST_Covers(r.limite,ocorrencia.geometria)) <> 1
    OR NOT EXISTS(SELECT FROM sentinela.regioes_administrativas r WHERE r.id=ocorrencia.ra_id AND r.vigencia @> nova_data
      AND extensions.ST_Contains(r.limite,ocorrencia.geometria))
   THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
   UPDATE sentinela.ocorrencias o SET data_fato=nova_data,horario_fato=nova_hora WHERE id=alvo RETURNING to_jsonb(o) INTO depois;
  ELSE
   UPDATE sentinela.ocorrencias o SET ativo=false WHERE id=alvo RETURNING to_jsonb(o) INTO depois;
  END IF;
 END IF;
 INSERT INTO sentinela.eventos_auditoria(id,ator_tipo,servico,acao,ocorrencia_id,linha_origem_id,execucao_id,antes,depois,justificativa,request_id)
 VALUES(auditoria,'servico','ocorrencias-gestao-local',operacao,ocorrencia.id,staging.linha_origem_id,
  coalesce(staging.execucao_id,CASE WHEN operacao='inativar_lote' THEN (contexto->>'execucao')::uuid END),
  antes,depois||jsonb_build_object('login',session_user::text,'conta',p_conta),motivo,auditoria::text);
 IF operacao='inativar_lote' THEN INSERT INTO sentinela_gestao.inativacoes(lote_id,auditoria_id) VALUES(alvo,auditoria);
 ELSIF operacao='inativar_associacao' THEN INSERT INTO sentinela_gestao.inativacoes(staging_id,auditoria_id) VALUES(alvo,auditoria); END IF;
 RETURN jsonb_build_object('id',alvo,'auditoria',auditoria);
END $$;

CREATE FUNCTION sentinela_gestao.verificar_evento(anterior jsonb,novo jsonb) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT inet_server_port()=55488 AND EXISTS(SELECT FROM sentinela.eventos_auditoria e
 WHERE e.ocorrencia_id=(anterior->>'id')::uuid AND e.servico='ocorrencias-gestao-local'
 AND e.acao IN ('editar_manual','inativar_manual','inativar_consolidada') AND e.transacao_id=pg_current_xact_id()
 AND e.depois->>'login'=session_user::text AND e.antes=anterior AND e.depois-ARRAY['login','conta']=novo)
$$;

CREATE FUNCTION sentinela_gestao.marcar_historico(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT coalesce(jsonb_agg(CASE WHEN i.lote_id IS NOT NULL THEN h.item||'{"inativada":true}' ELSE h.item END
  ORDER BY h.ord),'[]')
 FROM jsonb_array_elements(p) WITH ORDINALITY h(item,ord)
 LEFT JOIN sentinela_gestao.inativacoes i ON i.lote_id=coalesce(h.item->>'lot',h.item->'receipt'->>'lot')::uuid
 WHERE session_user IN ('sentinela_local_admin','sentinela_local_operator')
$$;

RESET ROLE;
GRANT EXECUTE ON FUNCTION sentinela_gestao.arquivos(jsonb),sentinela_gestao.arquivo(uuid),
 sentinela_gestao.alvo(text,uuid),sentinela_gestao.mutar(jsonb,text),sentinela_gestao.verificar_evento(jsonb,jsonb),
 sentinela_gestao.marcar_historico(jsonb)
 TO sentinela_local_admin,sentinela_local_operator;
GRANT INSERT (id) ON sentinela.eventos_auditoria TO sentinela_gestao_owner;

-- Retain the original statement guard and deferred history requirement for all other operations.
CREATE OR REPLACE FUNCTION sentinela.bloquear_correcao_sem_backend() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF current_user='sentinela_gestao_owner' AND inet_server_port()=55488
 AND TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='ocorrencias' AND TG_OP='UPDATE'
 THEN RETURN NULL; END IF;
 RAISE EXCEPTION 'Correcao bloqueada ate Auth e backend transacional auditado serem implementados.' USING ERRCODE='42501';
END $$;
DO $$
DECLARE definition text:=pg_get_functiondef('sentinela.exigir_historico_correcao()'::regprocedure);
 marker text:='  FOR item IN SELECT key, value FROM jsonb_each(novo';
BEGIN
 IF strpos(definition,marker)=0 THEN RAISE EXCEPTION 'Revisão inesperada da proteção de correção'; END IF;
 EXECUTE replace(definition,marker,'  IF TG_TABLE_NAME=''ocorrencias'' AND session_user IN (''sentinela_local_admin'',''sentinela_local_operator'')
 AND sentinela_gestao.verificar_evento(anterior,novo) THEN RETURN NULL; END IF;
'||marker);
END $$;
COMMIT;
