-- Audited classification backend v2 for the DISPOSABLE CLONE (127.0.0.1:55487) only.
-- Security model (same as the manual-occurrence writer):
--  * caller must be session_user sentinela_local_admin (the app's authenticated Administrador login);
--  * approver = active Administrador bound to Supabase Auth, proven by the server-computed account hash
--    sha256(["sentinela-supabase", supabase_url, auth_user_id]) and an open release tied to this cluster;
--  * the active rule version is explicit in the release; without it nothing is applied;
--  * NOLOGIN owner without RLS bypass, narrow policies, SECURITY DEFINER with pinned search_path;
--  * the existing write blocks get one extra branch, limited to this owner, port 55487 and a marker of the
--    current transaction; deferred integrity triggers are fired inside the function (SET CONSTRAINTS).
-- Only classification fields and 'classificacao' review items change; origin, staging and police text never do.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$ BEGIN
  IF inet_server_port() <> 55487 OR inet_server_addr() <> inet '127.0.0.1'
     OR current_setting('sentinela.sandbox_uuid', true) IS NULL OR current_database() <> 'sentinela_pcdf_local' THEN
    RAISE EXCEPTION 'Script restrito ao clone descartavel 127.0.0.1:55487.';
  END IF;
END $guard$;

DO $role$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sentinela_classificacao_owner') THEN
    CREATE ROLE sentinela_classificacao_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $role$;
CREATE SCHEMA IF NOT EXISTS sentinela_classificacao;
REVOKE ALL ON SCHEMA sentinela_classificacao FROM PUBLIC;
GRANT USAGE ON SCHEMA sentinela_classificacao TO sentinela_classificacao_owner, sentinela_local_admin;
-- Superseded v1 entry point: accepted any active Administrador UUID without proof of identity.
DROP FUNCTION IF EXISTS sentinela_classificacao.reclassificar(uuid, text, uuid, text);

CREATE TABLE IF NOT EXISTS sentinela_classificacao.liberacao (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  porta integer NOT NULL CHECK (porta = 55487),
  cluster_uuid text NOT NULL,
  system_id text NOT NULL,
  supabase_url text NOT NULL CHECK (supabase_url ~ '^https://[a-z0-9]{20}\.supabase\.co$'),
  versao_ativa text CHECK (versao_ativa LIKE 'pcdf-classificacao-%'),
  aberta boolean NOT NULL DEFAULT false
);
ALTER TABLE sentinela_classificacao.liberacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_classificacao.liberacao FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sentinela_classificacao.liberacao FROM PUBLIC;
GRANT SELECT ON sentinela_classificacao.liberacao TO sentinela_classificacao_owner;
DROP POLICY IF EXISTS classificacao_liberacao_read ON sentinela_classificacao.liberacao;
CREATE POLICY classificacao_liberacao_read ON sentinela_classificacao.liberacao FOR SELECT TO sentinela_classificacao_owner USING (true);

GRANT USAGE ON SCHEMA sentinela TO sentinela_classificacao_owner;
GRANT SELECT ON sentinela.ocorrencia_naturezas, sentinela.linhas_origem, sentinela.lotes_importacao, sentinela.extracoes_origem,
  sentinela.mapeamentos_natureza, sentinela.categorias_criminais, sentinela.usuarios, sentinela.ocorrencias,
  sentinela.naturezas_criminais, sentinela.historico_correcoes, sentinela.pendencias_revisao, sentinela.eventos_auditoria
  TO sentinela_classificacao_owner;
GRANT UPDATE (classificacao_status, mapeamento_id) ON sentinela.ocorrencia_naturezas TO sentinela_classificacao_owner;
GRANT UPDATE (status, responsavel_id, justificativa, encerrada_em) ON sentinela.pendencias_revisao TO sentinela_classificacao_owner;
GRANT INSERT ON sentinela.historico_correcoes, sentinela.eventos_auditoria TO sentinela_classificacao_owner;
GRANT EXECUTE ON FUNCTION sentinela.verificar_alvo_pendencia(uuid,uuid,uuid,uuid) TO sentinela_classificacao_owner;
-- exigir_historico_correcao() names a function of this schema in a branch that is false for associations;
-- PostgreSQL checks EXECUTE on every function of the expression at executor start, so the read-only STABLE
-- boolean check verificar_evento (already executable by the admin and operator logins) is granted; nothing else.
GRANT USAGE ON SCHEMA sentinela_ocorrencias_manual TO sentinela_classificacao_owner;
-- validar_vinculos_evento() references these tables in branches that are false for this backend's events.
-- Table privilege is granted for planning only and NO policy is created: with FORCED RLS no row is visible.
GRANT SELECT ON sentinela.execucoes_importacao, sentinela.linhas_staging TO sentinela_classificacao_owner;
GRANT EXECUTE ON FUNCTION sentinela_ocorrencias_manual.verificar_evento(jsonb, jsonb) TO sentinela_classificacao_owner;

-- Narrow RLS policies for the owner (RLS stays ENABLED and FORCED everywhere).
DO $policies$
DECLARE item text[];
BEGIN
  FOREACH item SLICE 1 IN ARRAY ARRAY[
    ['classificacao_assoc_read','ocorrencia_naturezas','SELECT',$$origem = 'importacao'$$,NULL],
    ['classificacao_assoc_update','ocorrencia_naturezas','UPDATE',$$origem = 'importacao'$$,
       $$origem = 'importacao' AND ((classificacao_status = 'mapeada' AND mapeamento_id IS NOT NULL)
         OR (classificacao_status IN ('pendente','conflitante','sem_correspondencia') AND mapeamento_id IS NULL))$$],
    ['classificacao_origem_read','linhas_origem','SELECT','true',NULL],
    ['classificacao_extracao_read','extracoes_origem','SELECT',$$fonte = 'PCDF'$$,NULL],
    ['classificacao_lote_read','lotes_importacao','SELECT','true',NULL],
    ['classificacao_regra_read','mapeamentos_natureza','SELECT','true',NULL],
    ['classificacao_categoria_read','categorias_criminais','SELECT','true',NULL],
    ['classificacao_aprovador_read','usuarios','SELECT',$$ativo AND perfil = 'Administrador'$$,NULL],
    ['classificacao_ocorrencia_read','ocorrencias','SELECT',$$origem = 'importacao' AND fonte = 'PCDF'$$,NULL],
    ['classificacao_natureza_read','naturezas_criminais','SELECT',$$fonte = 'PCDF'$$,NULL],
    ['classificacao_historico_read','historico_correcoes','SELECT',
       $$campo IN ('classificacao_status','mapeamento_id') AND associacao_id IS NOT NULL$$,NULL],
    ['classificacao_pendencia_read','pendencias_revisao','SELECT',$$tipo = 'classificacao'$$,NULL],
    ['classificacao_pendencia_update','pendencias_revisao','UPDATE',$$tipo = 'classificacao'$$,$$tipo = 'classificacao'$$],
    ['classificacao_evento_read','eventos_auditoria','SELECT',$$ator_tipo = 'servico' AND servico = 'sentinela-classificacao'$$,NULL]]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON sentinela.%I', item[1], item[2]);
    EXECUTE format('CREATE POLICY %I ON sentinela.%I FOR %s TO sentinela_classificacao_owner USING (%s)%s',
      item[1], item[2], item[3], item[4], CASE WHEN item[5] IS NULL THEN '' ELSE format(' WITH CHECK (%s)', item[5]) END);
  END LOOP;
END $policies$;
DROP POLICY IF EXISTS classificacao_historico_insert ON sentinela.historico_correcoes;
CREATE POLICY classificacao_historico_insert ON sentinela.historico_correcoes FOR INSERT TO sentinela_classificacao_owner
  WITH CHECK (associacao_id IS NOT NULL AND ocorrencia_id IS NULL AND staging_id IS NULL AND pendencia_id IS NULL
    AND campo IN ('classificacao_status', 'mapeamento_id') AND versao_validacao LIKE 'pcdf-classificacao-%');
DROP POLICY IF EXISTS classificacao_audit_insert ON sentinela.eventos_auditoria;
CREATE POLICY classificacao_audit_insert ON sentinela.eventos_auditoria FOR INSERT TO sentinela_classificacao_owner
  WITH CHECK (ator_tipo = 'servico' AND servico = 'sentinela-classificacao' AND usuario_id IS NULL
    AND acao IN ('catalogo.classificacao.aplicada', 'catalogo.classificacao.revertida',
                 'catalogo.classificacao.pendencia_resolvida', 'catalogo.classificacao.pendencia_reaberta'));

-- Existing branches preserved verbatim; the last branch is new and limited to the clone port.
CREATE OR REPLACE FUNCTION sentinela.bloquear_correcao_sem_backend()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 IF current_user='sentinela_exclusao_owner' AND session_user='sentinela_local_admin'
    AND inet_server_port()=55484 AND inet_server_addr()=inet '127.0.0.1'
    AND TG_TABLE_SCHEMA='sentinela' AND TG_OP='DELETE' AND TG_TABLE_NAME IN ('linhas_staging','pendencias_revisao')
 THEN RETURN NULL; END IF;
 IF current_user='sentinela_manual_writer' AND session_user IN ('sentinela_local_admin','sentinela_local_operator')
    AND inet_server_port() IN (55484,55487) AND inet_server_addr()=inet '127.0.0.1'
    AND TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='ocorrencias' AND TG_OP='UPDATE'
 THEN RETURN NULL; END IF;
 IF current_user='sentinela_classificacao_owner' AND session_user='sentinela_local_admin'
    AND inet_server_port()=55487 AND inet_server_addr()=inet '127.0.0.1'
    AND current_setting('sentinela.classificacao_transacao', true) = pg_current_xact_id()::text
    AND TG_TABLE_SCHEMA='sentinela'
    AND ((TG_TABLE_NAME IN ('ocorrencia_naturezas','pendencias_revisao') AND TG_OP='UPDATE')
      OR (TG_TABLE_NAME='historico_correcoes' AND TG_OP='INSERT'))
 THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'Correcao bloqueada ate Auth e backend transacional auditado serem implementados.'
    USING ERRCODE = '42501';
END $function$;

CREATE OR REPLACE FUNCTION sentinela.bloquear_autoria_manual_sem_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'pendencias_revisao' THEN
    IF current_user='sentinela_classificacao_owner' AND session_user='sentinela_local_admin'
      AND inet_server_port()=55487 AND inet_server_addr()=inet '127.0.0.1'
      AND current_setting('sentinela.classificacao_transacao', true) = pg_current_xact_id()::text
      AND TG_OP='UPDATE' AND NEW.tipo='classificacao'
    THEN
      IF OLD.tipo='classificacao' THEN RETURN NEW; END IF;
    END IF;
    IF NEW.status <> 'aberta' OR NEW.responsavel_id IS NOT NULL THEN
      RAISE EXCEPTION 'Atribuicao/decisao manual depende de Auth real.' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.ator_tipo = 'usuario' THEN
    -- Evaluated first: each branch only resolves the schema its own owner may use.
    IF current_user='sentinela_manual_writer' THEN
      IF TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='eventos_auditoria'
        AND NEW.acao IN ('ocorrencia.manual.criada','ocorrencia.manual.editada','ocorrencia.manual.inativada','ocorrencia.manual.consolidada')
        AND NEW.depois->>'operacao'='cadastro-manual'
        AND sentinela_ocorrencias_manual.autor(NEW.usuario_id,NEW.depois->>'conta') IS NOT NULL
      THEN RETURN NEW; END IF;
    ELSIF current_user='sentinela_gestao_owner' AND TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='eventos_auditoria'
      AND NEW.acao='corrigir_associacao' AND NEW.depois->>'operacao'='gestao-importacao'
      AND sentinela_gestao_autorizacao.capacidade(NEW.usuario_id,NEW.depois->>'conta') IS TRUE
    THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Autoria humana de auditoria depende de Auth real.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;

-- Real identity of the approver (server-computed account hash), open release tied to this cluster.
CREATE OR REPLACE FUNCTION sentinela_classificacao.aprovador(p_usuario uuid, p_conta text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT u.id FROM sentinela.usuarios u CROSS JOIN sentinela_classificacao.liberacao r
  WHERE u.id = p_usuario AND u.ativo AND u.auth_user_id IS NOT NULL AND u.perfil = 'Administrador'
    AND session_user = 'sentinela_local_admin'
    AND r.aberta AND r.versao_ativa IS NOT NULL AND r.porta = inet_server_port() AND inet_server_addr() = inet '127.0.0.1'
    AND current_database() = 'sentinela_pcdf_local' AND NOT pg_is_in_recovery()
    AND r.cluster_uuid = current_setting('sentinela.sandbox_uuid', true)
    AND r.system_id = (SELECT system_identifier::text FROM pg_control_system())
    AND coalesce(p_conta ~ '^[a-f0-9]{64}$', false)
    AND p_conta = encode(sha256(convert_to('["sentinela-supabase",' || to_json(r.supabase_url)::text || ','
      || to_json(u.auth_user_id::text)::text || ']', 'UTF8')), 'hex')
$fn$;

-- Applies the ACTIVE version to one lot. Homologated rule -> 'mapeada' and the classification review items of
-- that association (linked by association or, before consolidation, by its origin line) are resolved; 'conflitante'/'sem_correspondencia' rule -> that status, review item stays open;
-- unknown pair -> stays 'pendente'. Idempotent: only 'pendente' associations are considered.
CREATE OR REPLACE FUNCTION sentinela_classificacao.aplicar_lote(p_lote uuid, p_usuario uuid, p_conta text, p_justificativa text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE v_aprovador uuid; v_versao text; item record; pend record; novo jsonb;
  mapeadas int := 0; conflitantes int := 0; sem_corr int := 0; desconhecidas int := 0; resolvidas int := 0; ids uuid[] := '{}';
BEGIN
  v_aprovador := sentinela_classificacao.aprovador(p_usuario, p_conta);
  IF v_aprovador IS NULL THEN RAISE EXCEPTION 'Aprovador sem identidade institucional verificada.' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(p_justificativa, ''))) < 10 THEN RAISE EXCEPTION 'Justificativa obrigatoria.' USING ERRCODE = '22023'; END IF;
  SELECT r.versao_ativa INTO v_versao FROM sentinela_classificacao.liberacao r;
  IF NOT EXISTS (SELECT FROM sentinela.lotes_importacao WHERE id = p_lote) THEN
    RAISE EXCEPTION 'Lote inexistente.' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (SELECT FROM sentinela.mapeamentos_natureza m0 WHERE m0.versao = v_versao)
     OR EXISTS (SELECT FROM sentinela.mapeamentos_natureza m JOIN sentinela.categorias_criminais c ON c.id = m.categoria_id
                WHERE m.versao = v_versao AND m.status = 'homologado' AND c.status <> 'homologada') THEN
    RAISE EXCEPTION 'Versao ativa sem regras ou com categoria nao homologada.' USING ERRCODE = '23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-classificacao:' || p_lote::text, 0));
  PERFORM set_config('sentinela.classificacao_transacao', pg_current_xact_id()::text, true);
  FOR item IN
    SELECT a.id, a.linha_origem_id, a.versao AS versao_registro, a.classificacao_status, m.id AS regra, m.status AS regra_status, c.status AS categoria_status
    FROM sentinela.ocorrencia_naturezas a
    JOIN sentinela.linhas_origem o ON o.id = a.linha_origem_id
    JOIN sentinela.lotes_importacao l ON l.extracao_id = o.extracao_id AND l.id = p_lote
    LEFT JOIN sentinela.mapeamentos_natureza m ON m.natureza_id = a.natureza_id AND m.versao = v_versao
      AND m.crime_tentado IS NOT DISTINCT FROM a.crime_tentado
    LEFT JOIN sentinela.categorias_criminais c ON c.id = m.categoria_id
    WHERE a.origem = 'importacao' AND a.classificacao_status = 'pendente' AND a.mapeamento_id IS NULL
    ORDER BY a.id FOR UPDATE OF a
  LOOP
    IF item.regra_status = 'homologado' AND item.categoria_status = 'homologada' THEN
      INSERT INTO sentinela.historico_correcoes(associacao_id, campo, valores_anteriores, valores_novos, responsavel_id,
        justificativa, versao_registro_anterior, versao_validacao, resultado_reavaliacao)
      VALUES (item.id, 'classificacao_status', to_jsonb(item.classificacao_status), to_jsonb('mapeada'::text), v_aprovador,
        p_justificativa, item.versao_registro, v_versao, jsonb_build_object('operacao', 'aplicacao', 'regra', item.regra)),
             (item.id, 'mapeamento_id', 'null'::jsonb, to_jsonb(item.regra), v_aprovador,
        p_justificativa, item.versao_registro, v_versao, jsonb_build_object('operacao', 'aplicacao', 'regra', item.regra));
      UPDATE sentinela.ocorrencia_naturezas SET classificacao_status = 'mapeada', mapeamento_id = item.regra
       WHERE id = item.id AND versao = item.versao_registro;
      mapeadas := mapeadas + 1;
      FOR pend IN SELECT p.* FROM sentinela.pendencias_revisao p
                  WHERE p.tipo = 'classificacao' AND p.status IN ('aberta', 'em_analise')
                    AND (p.associacao_id = item.id OR (p.associacao_id IS NULL AND p.linha_origem_id = item.linha_origem_id))
                  ORDER BY p.id FOR UPDATE
      LOOP
        UPDATE sentinela.pendencias_revisao p SET status = 'resolvida', responsavel_id = v_aprovador,
            justificativa = p_justificativa, encerrada_em = clock_timestamp()
         WHERE p.id = pend.id AND p.versao = pend.versao RETURNING to_jsonb(p.*) INTO novo;
        INSERT INTO sentinela.eventos_auditoria(ator_tipo, servico, acao, pendencia_id, antes, depois, justificativa)
        VALUES ('servico', 'sentinela-classificacao', 'catalogo.classificacao.pendencia_resolvida', pend.id, to_jsonb(pend), novo, p_justificativa);
        resolvidas := resolvidas + 1;
      END LOOP;
    ELSIF item.regra_status IN ('conflitante', 'sem_correspondencia') THEN
      INSERT INTO sentinela.historico_correcoes(associacao_id, campo, valores_anteriores, valores_novos, responsavel_id,
        justificativa, versao_registro_anterior, versao_validacao, resultado_reavaliacao)
      VALUES (item.id, 'classificacao_status', to_jsonb(item.classificacao_status), to_jsonb(item.regra_status), v_aprovador,
        p_justificativa, item.versao_registro, v_versao, jsonb_build_object('operacao', 'aplicacao', 'regra', item.regra));
      UPDATE sentinela.ocorrencia_naturezas SET classificacao_status = item.regra_status
       WHERE id = item.id AND versao = item.versao_registro;
      IF item.regra_status = 'conflitante' THEN conflitantes := conflitantes + 1; ELSE sem_corr := sem_corr + 1; END IF;
    ELSE
      desconhecidas := desconhecidas + 1;
      CONTINUE;
    END IF;
    ids := ids || item.id;
  END LOOP;
  SET CONSTRAINTS ALL IMMEDIATE;
  IF cardinality(ids) > 0 THEN
    INSERT INTO sentinela.eventos_auditoria(ator_tipo, servico, acao, depois, justificativa)
    VALUES ('servico', 'sentinela-classificacao', 'catalogo.classificacao.aplicada',
      jsonb_build_object('lote', p_lote, 'versao', v_versao, 'aprovador', v_aprovador, 'mapeadas', mapeadas,
        'conflitantes', conflitantes, 'semCorrespondencia', sem_corr, 'desconhecidas', desconhecidas,
        'pendenciasResolvidas', resolvidas, 'sha256Associacoes', encode(sha256(convert_to(array_to_string(ids, ','), 'UTF8')), 'hex')),
      p_justificativa);
  END IF;
  RETURN jsonb_build_object('versao', v_versao, 'mapeadas', mapeadas, 'conflitantes', conflitantes,
    'semCorrespondencia', sem_corr, 'desconhecidas', desconhecidas, 'pendenciasResolvidas', resolvidas);
END $fn$;

-- Compensating reclassification: every association classified by p_versao in the lot returns to 'pendente'
-- and the classification review items resolved by this backend are reopened. History is appended, never erased.
CREATE OR REPLACE FUNCTION sentinela_classificacao.reverter_lote(p_lote uuid, p_versao text, p_usuario uuid, p_conta text, p_justificativa text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE v_aprovador uuid; item record; pend record; novo jsonb; revertidas int := 0; reabertas int := 0; ids uuid[] := '{}';
BEGIN
  v_aprovador := sentinela_classificacao.aprovador(p_usuario, p_conta);
  IF v_aprovador IS NULL THEN RAISE EXCEPTION 'Aprovador sem identidade institucional verificada.' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(p_justificativa, ''))) < 10 OR p_versao NOT LIKE 'pcdf-classificacao-%' THEN
    RAISE EXCEPTION 'Versao ou justificativa invalida.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-classificacao:' || p_lote::text, 0));
  PERFORM set_config('sentinela.classificacao_transacao', pg_current_xact_id()::text, true);
  FOR item IN
    SELECT a.id, a.linha_origem_id, a.versao AS versao_registro, a.classificacao_status, a.mapeamento_id
    FROM sentinela.ocorrencia_naturezas a
    JOIN sentinela.linhas_origem o ON o.id = a.linha_origem_id
    JOIN sentinela.lotes_importacao l ON l.extracao_id = o.extracao_id AND l.id = p_lote
    WHERE a.origem = 'importacao' AND a.classificacao_status IN ('mapeada', 'conflitante', 'sem_correspondencia')
      AND (SELECT h.versao_validacao FROM sentinela.historico_correcoes h
           WHERE h.associacao_id = a.id AND h.campo = 'classificacao_status'
           ORDER BY h.corrigido_em DESC, h.id DESC LIMIT 1) = p_versao
    ORDER BY a.id FOR UPDATE OF a
  LOOP
    INSERT INTO sentinela.historico_correcoes(associacao_id, campo, valores_anteriores, valores_novos, responsavel_id,
      justificativa, versao_registro_anterior, versao_validacao, resultado_reavaliacao)
    VALUES (item.id, 'classificacao_status', to_jsonb(item.classificacao_status), to_jsonb('pendente'::text), v_aprovador,
      p_justificativa, item.versao_registro, p_versao, jsonb_build_object('operacao', 'reversao'));
    IF item.mapeamento_id IS NOT NULL THEN
      INSERT INTO sentinela.historico_correcoes(associacao_id, campo, valores_anteriores, valores_novos, responsavel_id,
        justificativa, versao_registro_anterior, versao_validacao, resultado_reavaliacao)
      VALUES (item.id, 'mapeamento_id', to_jsonb(item.mapeamento_id), 'null'::jsonb, v_aprovador,
        p_justificativa, item.versao_registro, p_versao, jsonb_build_object('operacao', 'reversao'));
    END IF;
    UPDATE sentinela.ocorrencia_naturezas SET classificacao_status = 'pendente', mapeamento_id = NULL
     WHERE id = item.id AND versao = item.versao_registro;
    FOR pend IN SELECT p.* FROM sentinela.pendencias_revisao p
                WHERE p.tipo = 'classificacao' AND p.status = 'resolvida'
                  AND (p.associacao_id = item.id OR (p.associacao_id IS NULL AND p.linha_origem_id = item.linha_origem_id))
                  AND EXISTS (SELECT FROM sentinela.eventos_auditoria e WHERE e.pendencia_id = p.id
                              AND e.acao = 'catalogo.classificacao.pendencia_resolvida')
                ORDER BY p.id FOR UPDATE
    LOOP
      UPDATE sentinela.pendencias_revisao p SET status = 'aberta', responsavel_id = NULL, justificativa = NULL, encerrada_em = NULL
       WHERE p.id = pend.id AND p.versao = pend.versao RETURNING to_jsonb(p.*) INTO novo;
      INSERT INTO sentinela.eventos_auditoria(ator_tipo, servico, acao, pendencia_id, antes, depois, justificativa)
      VALUES ('servico', 'sentinela-classificacao', 'catalogo.classificacao.pendencia_reaberta', pend.id, to_jsonb(pend), novo, p_justificativa);
      reabertas := reabertas + 1;
    END LOOP;
    revertidas := revertidas + 1;
    ids := ids || item.id;
  END LOOP;
  SET CONSTRAINTS ALL IMMEDIATE;
  IF revertidas > 0 THEN
    INSERT INTO sentinela.eventos_auditoria(ator_tipo, servico, acao, depois, justificativa)
    VALUES ('servico', 'sentinela-classificacao', 'catalogo.classificacao.revertida',
      jsonb_build_object('lote', p_lote, 'versao', p_versao, 'aprovador', v_aprovador, 'revertidas', revertidas,
        'pendenciasReabertas', reabertas, 'sha256Associacoes', encode(sha256(convert_to(array_to_string(ids, ','), 'UTF8')), 'hex')),
      p_justificativa);
  END IF;
  RETURN jsonb_build_object('versao', p_versao, 'revertidas', revertidas, 'pendenciasReabertas', reabertas);
END $fn$;

ALTER FUNCTION sentinela_classificacao.aprovador(uuid, text) OWNER TO sentinela_classificacao_owner;
ALTER FUNCTION sentinela_classificacao.aplicar_lote(uuid, uuid, text, text) OWNER TO sentinela_classificacao_owner;
ALTER FUNCTION sentinela_classificacao.reverter_lote(uuid, text, uuid, text, text) OWNER TO sentinela_classificacao_owner;
REVOKE ALL ON FUNCTION sentinela_classificacao.aprovador(uuid, text),
  sentinela_classificacao.aplicar_lote(uuid, uuid, text, text),
  sentinela_classificacao.reverter_lote(uuid, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_classificacao.aprovador(uuid, text) TO sentinela_classificacao_owner;
GRANT EXECUTE ON FUNCTION sentinela_classificacao.aplicar_lote(uuid, uuid, text, text),
  sentinela_classificacao.reverter_lote(uuid, text, uuid, text, text) TO sentinela_local_admin;
COMMIT;
