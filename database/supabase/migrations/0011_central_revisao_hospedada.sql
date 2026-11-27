-- Hosted review, after 0010. Baseline and previously qualified migrations stay intact.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF (SELECT max(versao) FROM sentinela.schema_migrations) IS DISTINCT FROM '0010'
     OR NOT sentinela_ambiente.vinculado() THEN
    RAISE EXCEPTION 'Central exige a migration 0010 na instalação vinculada.';
  END IF;
END $$;

CREATE ROLE sentinela_revisao_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT sentinela_revisao_owner TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
CREATE SCHEMA sentinela_revisao;
REVOKE ALL ON SCHEMA sentinela_revisao FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA sentinela_revisao TO sentinela_local_admin, sentinela_local_operator, sentinela_local_analyst;
GRANT USAGE, CREATE ON SCHEMA sentinela_revisao TO sentinela_revisao_owner;
GRANT USAGE ON SCHEMA sentinela TO sentinela_revisao_owner;

-- Expose only the institutional UUID validated by the live-session verifier in 0009.
CREATE FUNCTION sentinela_revisao.ator(decisao boolean) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT u.id FROM sentinela.usuarios u
  JOIN sentinela.perfil_permissoes p ON p.perfil=u.perfil
  WHERE u.id=sentinela_ambiente.ator_operacional()
    AND p.acao=CASE WHEN decisao THEN 'corrigir_central' ELSE 'consultar_central' END
    AND (NOT decisao OR (session_user='sentinela_local_admin' AND u.perfil='Administrador'))
$$;
REVOKE ALL ON FUNCTION sentinela_revisao.ator(boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sentinela_revisao.ator(boolean) TO sentinela_revisao_owner;

GRANT SELECT ON sentinela.pendencias_revisao, sentinela.linhas_staging TO sentinela_revisao_owner;
GRANT SELECT (id,origem) ON sentinela.ocorrencias TO sentinela_revisao_owner;
GRANT SELECT (id,extracao_id) ON sentinela.linhas_origem, sentinela.execucoes_importacao TO sentinela_revisao_owner;
GRANT SELECT (id,fonte) ON sentinela.extracoes_origem TO sentinela_revisao_owner;
GRANT SELECT (id,ocorrencia_id,linha_origem_id) ON sentinela.ocorrencia_naturezas TO sentinela_revisao_owner;
GRANT SELECT (id,ativo,perfil) ON sentinela.usuarios TO sentinela_revisao_owner;
GRANT SELECT ON sentinela.historico_correcoes, sentinela.eventos_auditoria TO sentinela_revisao_owner;
GRANT UPDATE (status,responsavel_id,justificativa,encerrada_em) ON sentinela.pendencias_revisao TO sentinela_revisao_owner;
GRANT UPDATE (derivados_efetivos) ON sentinela.linhas_staging TO sentinela_revisao_owner;
GRANT INSERT (id,staging_id,pendencia_id,campo,valores_anteriores,valores_novos,
  responsavel_id,justificativa,versao_registro_anterior,versao_validacao,resultado_reavaliacao)
  ON sentinela.historico_correcoes TO sentinela_revisao_owner;
GRANT INSERT (ator_tipo,usuario_id,acao,pendencia_id,linha_origem_id,execucao_id,correcao_id,antes,depois,justificativa)
  ON sentinela.eventos_auditoria TO sentinela_revisao_owner;
GRANT EXECUTE ON FUNCTION sentinela.verificar_alvo_pendencia(uuid,uuid,uuid,uuid),
  sentinela.exigir_evento_pendencia(), sentinela.exigir_historico_correcao(),
  sentinela.exigir_revisor_administrador(), sentinela.carimbar_auditoria(),
  sentinela.validar_destino_correcao(), sentinela.validar_vinculos_evento(),
  sentinela.bloquear_autoria_manual_sem_auth(), sentinela.bloquear_correcao_sem_backend()
  TO sentinela_revisao_owner;

DO $$
DECLARE tabela text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['pendencias_revisao','linhas_staging','linhas_origem','execucoes_importacao',
    'extracoes_origem','ocorrencias','ocorrencia_naturezas'] LOOP
    EXECUTE format('CREATE POLICY central_leitura ON sentinela.%I FOR SELECT TO sentinela_revisao_owner
      USING ((SELECT sentinela_revisao.ator(false)) IS NOT NULL)', tabela);
  END LOOP;
END $$;
CREATE POLICY central_autor ON sentinela.usuarios FOR SELECT TO sentinela_revisao_owner
  USING (id=(SELECT sentinela_revisao.ator(true)));
CREATE POLICY central_historico ON sentinela.historico_correcoes FOR SELECT TO sentinela_revisao_owner
  USING (versao_validacao='central-v1' AND (SELECT sentinela_revisao.ator(false)) IS NOT NULL);
CREATE POLICY central_auditoria ON sentinela.eventos_auditoria FOR SELECT TO sentinela_revisao_owner
  USING (acao IN ('pendencia.revisada','corrigir_associacao') AND ator_tipo='usuario'
    AND (SELECT sentinela_revisao.ator(false)) IS NOT NULL);
CREATE POLICY central_pendencia ON sentinela.pendencias_revisao FOR UPDATE TO sentinela_revisao_owner
  USING (status IN ('aberta','em_analise') AND (SELECT sentinela_revisao.ator(true)) IS NOT NULL)
  WITH CHECK (status IN ('resolvida','encerrada_sem_solucao') AND responsavel_id=(SELECT sentinela_revisao.ator(true)));
CREATE POLICY central_staging ON sentinela.linhas_staging FOR UPDATE TO sentinela_revisao_owner
  USING (ocorrencia_id IS NULL AND associacao_id IS NULL AND estado<>'consolidada'
    AND (SELECT sentinela_revisao.ator(true)) IS NOT NULL)
  WITH CHECK (ocorrencia_id IS NULL AND associacao_id IS NULL AND estado<>'consolidada'
    AND (SELECT sentinela_revisao.ator(true)) IS NOT NULL);
CREATE POLICY central_correcao ON sentinela.historico_correcoes FOR INSERT TO sentinela_revisao_owner
  WITH CHECK (versao_validacao='central-v1' AND pendencia_id IS NOT NULL AND staging_id IS NOT NULL
    AND campo='derivados_efetivos' AND responsavel_id=(SELECT sentinela_revisao.ator(true)));
CREATE POLICY central_evento ON sentinela.eventos_auditoria FOR INSERT TO sentinela_revisao_owner
  WITH CHECK (acao='pendencia.revisada' AND pendencia_id IS NOT NULL AND ator_tipo='usuario'
    AND usuario_id=(SELECT sentinela_revisao.ator(true)));

CREATE VIEW sentinela_revisao.origens WITH (security_invoker=true) AS
 SELECT p.*, CASE x.fonte WHEN 'PCDF' THEN 'pcdf' WHEN 'IMPORTACAO-GERAL-LOCAL' THEN 'geral'
   ELSE CASE WHEN o.origem='manual' THEN 'manual' ELSE 'outra' END END AS origem
 FROM sentinela.pendencias_revisao p
 LEFT JOIN sentinela.linhas_origem l ON l.id=p.linha_origem_id
 LEFT JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id
 LEFT JOIN sentinela.ocorrencias o ON o.id=p.ocorrencia_id;
GRANT SELECT ON sentinela_revisao.origens TO sentinela_revisao_owner;

CREATE FUNCTION sentinela_revisao.item(alvo uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('id',p.id,'type',p.tipo,'priority',p.prioridade,'field',p.campo,
    'reason',p.motivo,'status',p.status,'version',p.versao::text,'original',p.valor_original #>> '{}',
    'normalized',s.derivados_efetivos->>p.campo,'origin',p.origem,
    'occurrenceId',coalesce(p.ocorrencia_id,a.ocorrencia_id),
    'canResolve',coalesce(p.status IN ('aberta','em_analise') AND p.ocorrencia_id IS NULL
      AND s.copias=1 AND s.estado<>'consolidada' AND s.ocorrencia_id IS NULL AND s.associacao_id IS NULL
      AND a.ocorrencia_id IS NULL AND NOT EXISTS (SELECT FROM sentinela.eventos_auditoria g
        WHERE g.acao='corrigir_associacao' AND g.depois->>'stagingId'=s.id::text)
      AND NOT EXISTS (SELECT FROM sentinela.pendencias_revisao outra
        WHERE outra.linha_origem_id=p.linha_origem_id AND outra.campo=p.campo AND outra.status='resolvida')
      AND (p.origem='geral' AND p.versao_regra='geral-v1' AND p.campo IN ('local','horario')
        OR p.origem='pcdf' AND p.versao_regra IN ('pcdf-local-v1','pcdf-csv-avulso-v2') AND
          (p.campo='horario' AND p.regra IN ('horario_ausente_ou_invalido','horario_pendente','horario_invalido')
           OR p.campo='local' AND p.regra='endereco_ausente'
           OR p.campo='flagrante' AND p.regra IN ('valor_policial_desconhecido','informacao_policial_pendente'))),false),
    'history',CASE WHEN e.id IS NOT NULL THEN jsonb_build_object('author',e.usuario_id,'reason',e.justificativa,
      'at',e.registrado_em,'before',h.valores_anteriores->>p.campo,'after',h.valores_novos->>p.campo) END)
    || jsonb_strip_nulls(jsonb_build_object('lotId',s.lote_id,'ordinal',s.registro_csv))
  FROM sentinela_revisao.origens p
  LEFT JOIN LATERAL (
    SELECT s.*,count(*) OVER () AS copias FROM sentinela.linhas_staging s
    WHERE s.linha_origem_id=p.linha_origem_id ORDER BY s.criado_em,s.id LIMIT 1
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT a.ocorrencia_id FROM sentinela.ocorrencia_naturezas a
    WHERE a.linha_origem_id=p.linha_origem_id ORDER BY a.id LIMIT 1
  ) a ON true
  LEFT JOIN LATERAL (
    SELECT e.id,e.usuario_id,e.justificativa,e.registrado_em,e.correcao_id FROM sentinela.eventos_auditoria e
    WHERE e.pendencia_id=p.id AND e.acao='pendencia.revisada' ORDER BY e.registrado_em DESC,e.id DESC LIMIT 1
  ) e ON true
  LEFT JOIN sentinela.historico_correcoes h ON h.id=e.correcao_id
  WHERE p.id=alvo
$$;

CREATE FUNCTION sentinela_revisao.fila(p_tipo text,p_prioridade text,p_status text,p_origem text,
  busca text,ordem text,pagina integer,limite integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE dados jsonb;
BEGIN
  IF sentinela_revisao.ator(false) IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
  IF NOT coalesce(pagina BETWEEN 1 AND 10000 AND limite BETWEEN 1 AND 50
      AND ordem IN ('prioridade','antigas','recentes') AND coalesce(length(busca),0)<=120,false)
  THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
  WITH filtrados AS (
    SELECT id,status,prioridade,detectada_em FROM sentinela_revisao.origens p
    WHERE (p_tipo IS NULL OR p.tipo=p_tipo) AND (p_prioridade IS NULL OR p.prioridade=p_prioridade)
      AND (p_origem IS NULL OR p.origem=p_origem)
      AND (busca IS NULL OR strpos(lower(p.campo||' '||p.motivo),lower(busca))>0)
  ), pagina_dados AS (
    SELECT id,
      CASE WHEN ordem='prioridade' THEN CASE prioridade WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END END AS rank,
      CASE WHEN ordem='recentes' THEN detectada_em END AS recente,detectada_em
    FROM filtrados WHERE p_status IS NULL OR status=p_status
    ORDER BY rank,recente DESC,detectada_em,id OFFSET ((pagina-1)*limite) LIMIT (limite+1)
  ), itens AS (
    SELECT id,rank,recente,detectada_em FROM pagina_dados ORDER BY rank,recente DESC,detectada_em,id LIMIT limite
  )
  SELECT jsonb_build_object('page',pagina,'pageSize',limite,
    'hasMore',pagina<10000 AND (SELECT count(*) FROM pagina_dados)>limite,
    'items',coalesce((SELECT jsonb_agg(sentinela_revisao.item(id) ORDER BY rank,recente DESC,detectada_em,id) FROM itens),'[]'::jsonb),
    'counts',(SELECT jsonb_build_object('active',count(*) FILTER(WHERE status IN ('aberta','em_analise')),
      'resolved',count(*) FILTER(WHERE status='resolvida'),'closed',count(*) FILTER(WHERE status='encerrada_sem_solucao'))
      FROM filtrados)) INTO dados;
  RETURN dados;
END $$;

CREATE FUNCTION sentinela_revisao.decidir(alvo uuid,versao_esperada bigint,decisao text,valor text,p_motivo text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE autor uuid := sentinela_revisao.ator(true);
  antes sentinela.pendencias_revisao; depois sentinela.pendencias_revisao;
  s sentinela.linhas_staging; atual jsonb; novo jsonb; correcao uuid;
BEGIN
  IF autor IS NULL OR current_setting('transaction_isolation')<>'read committed'
  THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
  p_motivo:=btrim(p_motivo);
  valor:=nullif(btrim(valor),'');
  IF NOT coalesce(decisao IN ('resolvida','encerrada_sem_solucao') AND length(p_motivo) BETWEEN 1 AND 500
    AND (decisao='resolvida' OR valor IS NULL),false) THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
  -- Same order as the existing transactional lot management and consolidation.
  PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
  SET CONSTRAINTS sentinela.correcao_exige_historico,sentinela.pendencia_exige_evento DEFERRED;
  SELECT * INTO antes FROM sentinela.pendencias_revisao WHERE id=alvo;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002'; END IF;
  IF antes.status NOT IN ('aberta','em_analise') OR antes.versao IS DISTINCT FROM versao_esperada
  THEN RAISE EXCEPTION USING ERRCODE='40001'; END IF;
  IF decisao='resolvida' THEN
    atual:=sentinela_revisao.item(alvo);
    IF NOT coalesce((atual->>'canResolve')::boolean AND CASE antes.campo
        WHEN 'horario' THEN valor ~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'
        WHEN 'local' THEN length(valor) BETWEEN (CASE atual->>'origin' WHEN 'geral' THEN 5 ELSE 1 END) AND 240
        WHEN 'flagrante' THEN valor IN ('true','false')
        ELSE false END,false) THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
    SELECT * INTO STRICT s FROM sentinela.linhas_staging WHERE linha_origem_id=antes.linha_origem_id FOR UPDATE;
    novo:=jsonb_set(s.derivados_efetivos,ARRAY[antes.campo::text],
      CASE WHEN antes.campo='flagrante' THEN to_jsonb(valor::boolean) ELSE to_jsonb(valor) END);
    correcao:=gen_random_uuid();
    INSERT INTO sentinela.historico_correcoes(id,staging_id,pendencia_id,campo,valores_anteriores,valores_novos,
      responsavel_id,justificativa,versao_registro_anterior,versao_validacao,resultado_reavaliacao)
    VALUES (correcao,s.id,alvo,'derivados_efetivos',s.derivados_efetivos,novo,autor,p_motivo,
      s.versao,'central-v1',jsonb_build_object('campo',antes.campo,'resultado','resolvida'));
    UPDATE sentinela.linhas_staging SET derivados_efetivos=novo WHERE id=s.id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001'; END IF;
  END IF;
  UPDATE sentinela.pendencias_revisao SET status=decisao,responsavel_id=autor,justificativa=p_motivo,encerrada_em=clock_timestamp()
  WHERE id=alvo AND versao=versao_esperada RETURNING * INTO depois;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001'; END IF;
  INSERT INTO sentinela.eventos_auditoria(ator_tipo,usuario_id,acao,pendencia_id,linha_origem_id,execucao_id,
    correcao_id,antes,depois,justificativa)
  VALUES ('usuario',autor,'pendencia.revisada',alvo,s.linha_origem_id,s.execucao_id,correcao,to_jsonb(antes),to_jsonb(depois),p_motivo);
  -- Validate both existing deferred audit invariants inside the least-privilege definer.
  SET CONSTRAINTS sentinela.correcao_exige_historico,sentinela.pendencia_exige_evento IMMEDIATE;
  SET CONSTRAINTS sentinela.correcao_exige_historico,sentinela.pendencia_exige_evento DEFERRED;
  RETURN sentinela_revisao.item(alvo);
END $$;

REVOKE ALL ON FUNCTION sentinela_revisao.item(uuid),
  sentinela_revisao.fila(text,text,text,text,text,text,integer,integer),
  sentinela_revisao.decidir(uuid,bigint,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sentinela_revisao.fila(text,text,text,text,text,text,integer,integer)
  TO sentinela_local_admin,sentinela_local_operator,sentinela_local_analyst;
GRANT EXECUTE ON FUNCTION sentinela_revisao.decidir(uuid,bigint,text,text,text) TO sentinela_local_admin;
ALTER FUNCTION sentinela_revisao.item(uuid) OWNER TO sentinela_revisao_owner;
ALTER FUNCTION sentinela_revisao.fila(text,text,text,text,text,text,integer,integer) OWNER TO sentinela_revisao_owner;
ALTER FUNCTION sentinela_revisao.decidir(uuid,bigint,text,text,text) OWNER TO sentinela_revisao_owner;
REVOKE CREATE ON SCHEMA sentinela_revisao FROM sentinela_revisao_owner;

CREATE OR REPLACE FUNCTION sentinela.bloquear_correcao_sem_backend() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF current_user='sentinela_revisao_owner' THEN
    IF TG_TABLE_SCHEMA='sentinela' AND sentinela_revisao.ator(true) IS NOT NULL
      AND (TG_OP='UPDATE' AND TG_TABLE_NAME IN ('pendencias_revisao','linhas_staging')
        OR TG_OP='INSERT' AND TG_TABLE_NAME='historico_correcoes') THEN RETURN NULL; END IF;
  END IF;
  IF current_user='sentinela_exclusao_owner' AND session_user='sentinela_local_admin'
    AND sentinela_ambiente.vinculado() AND sentinela_ambiente.vinculado()
    AND TG_TABLE_SCHEMA='sentinela' AND TG_OP='DELETE' AND TG_TABLE_NAME IN ('linhas_staging','pendencias_revisao')
  THEN RETURN NULL; END IF;
  IF current_user='sentinela_manual_writer' AND session_user IN ('sentinela_local_admin','sentinela_local_operator')
    AND sentinela_ambiente.vinculado() AND sentinela_ambiente.vinculado()
    AND TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='ocorrencias' AND TG_OP='UPDATE'
  THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'Correcao bloqueada ate Auth e backend transacional auditado serem implementados.' USING ERRCODE='42501';
END $$;

CREATE OR REPLACE FUNCTION sentinela.bloquear_autoria_manual_sem_auth() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_TABLE_NAME='pendencias_revisao' THEN
    IF NEW.status<>'aberta' OR NEW.responsavel_id IS NOT NULL THEN
      RAISE EXCEPTION 'Atribuicao/decisao manual depende de Auth real.' USING ERRCODE='42501';
    END IF;
  ELSIF NEW.ator_tipo='usuario' THEN
    IF current_user='sentinela_revisao_owner' THEN
      IF TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='eventos_auditoria'
        AND NEW.acao='pendencia.revisada' AND NEW.usuario_id=sentinela_revisao.ator(true)
      THEN RETURN NEW; END IF;
    ELSIF current_user='sentinela_manual_writer' THEN
      IF TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='eventos_auditoria'
        AND NEW.acao IN ('ocorrencia.manual.criada','ocorrencia.manual.editada','ocorrencia.manual.inativada','ocorrencia.manual.consolidada')
        AND NEW.depois->>'operacao'='cadastro-manual'
        AND sentinela_ocorrencias_manual.autor(NEW.usuario_id,NEW.depois->>'conta') IS NOT NULL
      THEN RETURN NEW; END IF;
    ELSIF current_user='sentinela_gestao_owner' AND TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='eventos_auditoria'
      AND NEW.acao='corrigir_associacao' AND NEW.depois->>'operacao'='gestao-importacao'
      AND sentinela_gestao_autorizacao.capacidade(NEW.usuario_id,NEW.depois->>'conta') IS TRUE
    THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Autoria humana de auditoria depende de Auth real.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

INSERT INTO sentinela.schema_migrations VALUES ('0011','Central de Revisao hospedada',DEFAULT);
COMMIT;
