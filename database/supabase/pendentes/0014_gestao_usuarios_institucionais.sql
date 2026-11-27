BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT sentinela_ambiente.vinculado()
     OR NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0011')
     OR NOT EXISTS (SELECT FROM pg_class WHERE oid='sentinela.usuarios'::regclass AND relrowsecurity AND relforcerowsecurity)
     OR EXISTS (SELECT FROM sentinela_pessoas.exclusoes WHERE concluida_em IS NULL)
     OR EXISTS (SELECT FROM auth.users WHERE raw_app_meta_data->>'sentinela_onboarding'='provisioning') THEN
    RAISE EXCEPTION 'Instalação institucional incompatível ou com operações anteriores pendentes.';
  END IF;
END $$;

ALTER TABLE sentinela.usuarios ADD COLUMN arquivado_em timestamptz,
  ADD COLUMN revisao_gestao bigint NOT NULL DEFAULT 0,
  ADD CONSTRAINT usuario_arquivado_inativo CHECK (arquivado_em IS NULL OR NOT ativo);
GRANT SELECT (arquivado_em,revisao_gestao), UPDATE (perfil,arquivado_em,revisao_gestao)
  ON sentinela.usuarios TO sentinela_pessoas_owner;

CREATE TABLE sentinela_pessoas.solicitacoes (
  id uuid PRIMARY KEY,
  ator uuid NOT NULL REFERENCES sentinela.usuarios(id),
  sessao uuid,
  dados jsonb,
  impressao bytea NOT NULL,
  expira_em timestamptz NOT NULL,
  usuario uuid UNIQUE REFERENCES sentinela.usuarios(id),
  CHECK ((usuario IS NULL AND dados IS NOT NULL AND sessao IS NOT NULL)
    OR (usuario IS NOT NULL AND dados IS NULL AND sessao IS NULL))
);
ALTER TABLE sentinela_pessoas.solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_pessoas.solicitacoes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sentinela_pessoas.solicitacoes FROM PUBLIC, anon, authenticated, service_role, sentinela_local_admin;

CREATE FUNCTION sentinela_private.dados_auth_gestao(identidade uuid)
RETURNS TABLE (email text, primeiro_acesso boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT lower(a.email), coalesce(a.raw_app_meta_data->>'sentinela_onboarding','complete')<>'complete'
  FROM auth.users a WHERE a.id=identidade
$$;
REVOKE ALL ON FUNCTION sentinela_private.dados_auth_gestao(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA sentinela_private TO sentinela_pessoas_owner;
GRANT EXECUTE ON FUNCTION sentinela_private.dados_auth_gestao(uuid) TO sentinela_pessoas_owner;

ALTER POLICY pessoas_auditoria_escrita ON sentinela.eventos_auditoria WITH CHECK (
  session_user='sentinela_local_admin' AND ator_tipo='servico' AND servico='sentinela-usuarios'
  AND acao IN ('usuarios.editar_institucional','usuarios.alterar_perfil','usuarios.alterar_status','usuarios.arquivar'));
ALTER POLICY pessoas_auditoria_leitura ON sentinela.eventos_auditoria USING (
  session_user='sentinela_local_admin' AND acao IN ('usuarios.editar_institucional',
    'usuarios.criar_institucional','usuarios.alterar_perfil','usuarios.alterar_status','usuarios.arquivar'));

CREATE OR REPLACE FUNCTION sentinela_pessoas.registros(alvo uuid) RETURNS SETOF jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('id',u.id,'name',u.nome_exibicao,'email',c.email,'orgao',c.orgao,
    'loginEmail',a.email,'firstAccessPending',coalesce(a.primeiro_acesso,false),
    'perfil',u.perfil,'ativo',u.ativo,'cadastro',u.criado_em,
    'version',encode(sha256(convert_to(jsonb_build_array(u.revisao_gestao,u.nome_exibicao,c.email,c.orgao,
      u.perfil,u.ativo,a.email)::text,'UTF8')),'hex'),
    'activity',coalesce((SELECT jsonb_agg(h.registrado_em ORDER BY h.registrado_em DESC) FROM (
      SELECT registrado_em FROM sentinela.eventos_auditoria
      WHERE acao IN ('usuarios.criar_institucional','usuarios.editar_institucional','usuarios.alterar_perfil','usuarios.alterar_status','usuarios.arquivar')
        AND depois->>'alvo'=u.id::text ORDER BY registrado_em DESC LIMIT 5
    ) h),'[]'::jsonb))
  FROM sentinela.usuarios u
  LEFT JOIN sentinela_pessoas.contatos c ON c.usuario=u.id
  LEFT JOIN LATERAL sentinela_private.dados_auth_gestao(u.auth_user_id) a ON true
  WHERE u.arquivado_em IS NULL AND (alvo IS NULL OR u.id=alvo) ORDER BY u.nome_exibicao,u.id
$$;

CREATE FUNCTION sentinela_private.proteger_ultimo_administrador() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.ativo AND OLD.perfil='Administrador' AND OLD.auth_user_id IS NOT NULL
     AND (TG_OP='DELETE' OR NOT NEW.ativo OR NEW.perfil<>'Administrador'
       OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id) THEN
    PERFORM pg_advisory_xact_lock(743204,22);
    IF EXISTS (SELECT FROM auth.users a WHERE a.id=OLD.auth_user_id
                AND coalesce(a.raw_app_meta_data->>'sentinela_onboarding','complete')='complete')
       AND NOT EXISTS (
        SELECT FROM sentinela.usuarios u JOIN auth.users a ON a.id=u.auth_user_id
        JOIN sentinela.perfil_permissoes p ON p.perfil=u.perfil AND p.acao='administrar'
        WHERE u.id<>OLD.id AND u.ativo AND u.perfil='Administrador' AND u.arquivado_em IS NULL
          AND (a.banned_until IS NULL OR a.banned_until<=now())
          AND coalesce(a.raw_app_meta_data->>'sentinela_onboarding','complete')='complete'
       ) THEN
      RAISE EXCEPTION 'Último Administrador ativo' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sentinela_private.proteger_ultimo_administrador() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER usuarios_proteger_administrador
  BEFORE UPDATE OF perfil,ativo,auth_user_id OR DELETE ON sentinela.usuarios
  FOR EACH ROW EXECUTE FUNCTION sentinela_private.proteger_ultimo_administrador();

-- Retain the verified session server-side. Auth metadata only carries an opaque request UUID.
CREATE FUNCTION sentinela_pessoas.preparar_cadastro(ator uuid, identidade uuid, solicitacao uuid, dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pedido sentinela_pessoas.solicitacoes%ROWTYPE; impressao_dados bytea := sha256(convert_to(dados::text,'UTF8'));
BEGIN
  PERFORM pg_advisory_xact_lock(743204,22);
  PERFORM sentinela_pessoas.autorizar(ator,identidade);
  IF solicitacao IS NULL OR NOT coalesce(
    jsonb_typeof(dados)='object' AND length(btrim(dados->>'name')) BETWEEN 1 AND 160
    AND length(dados->>'email')<=254 AND dados->>'email'=lower(dados->>'email')
    AND dados->>'email' ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    AND dados->>'perfil' IN ('Administrador','Operador','Analista')
    AND length(dados->>'orgao')<=160 AND jsonb_typeof(dados->'ativo')='boolean',false) THEN
    RAISE EXCEPTION 'Cadastro inválido' USING ERRCODE='22023';
  END IF;
  DELETE FROM sentinela_pessoas.solicitacoes WHERE expira_em<=now() AND usuario IS NULL;
  SELECT * INTO pedido FROM sentinela_pessoas.solicitacoes WHERE id=solicitacao;
  IF FOUND THEN
    IF pedido.ator<>ator OR pedido.impressao<>impressao_dados THEN
      RAISE EXCEPTION 'Solicitação de cadastro divergente' USING ERRCODE='40001';
    END IF;
    IF pedido.usuario IS NOT NULL THEN
      RETURN jsonb_build_object('record',(SELECT r FROM sentinela_pessoas.registros(pedido.usuario) r));
    END IF;
  END IF;
  IF EXISTS (SELECT FROM auth.users a WHERE lower(a.email)=dados->>'email')
     OR EXISTS (SELECT FROM sentinela_pessoas.contatos c WHERE lower(c.email)=dados->>'email') THEN
    RAISE EXCEPTION 'E-mail já cadastrado' USING ERRCODE='23505';
  END IF;
  INSERT INTO sentinela_pessoas.solicitacoes (id,ator,sessao,dados,impressao,expira_em)
  VALUES (solicitacao,ator,current_setting('sentinela.import_session')::uuid,dados,impressao_dados,now()+interval '5 minutes')
  ON CONFLICT (id) DO UPDATE SET sessao=excluded.sessao,expira_em=excluded.expira_em;
  RETURN '{}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION sentinela_pessoas.preparar_cadastro(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sentinela_pessoas.preparar_cadastro(uuid,uuid,uuid,jsonb) TO sentinela_local_admin;

CREATE FUNCTION sentinela_private.concluir_cadastro_gestao() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pedido sentinela_pessoas.solicitacoes%ROWTYPE; email_login text := lower(NEW.email);
BEGIN
  IF NOT (coalesce(NEW.raw_app_meta_data,'{}'::jsonb) ? 'sentinela_cadastro_solicitacao') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.raw_app_meta_data ? 'sentinela_cadastro_solicitacao' THEN
    IF NEW.raw_app_meta_data->>'sentinela_cadastro_solicitacao' IS DISTINCT FROM
       OLD.raw_app_meta_data->>'sentinela_cadastro_solicitacao' THEN
      RAISE EXCEPTION 'Solicitação de cadastro imutável' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(743204,22);
  SELECT * INTO pedido FROM sentinela_pessoas.solicitacoes
    WHERE id=(NEW.raw_app_meta_data->>'sentinela_cadastro_solicitacao')::uuid AND usuario IS NULL AND expira_em>now();
  IF NOT FOUND OR email_login IS DISTINCT FROM pedido.dados->>'email'
     OR NEW.raw_app_meta_data->>'sentinela_onboarding' IS DISTINCT FROM 'password'
     OR NEW.raw_app_meta_data ? 'sentinela_cadastro_institucional'
     OR NOT EXISTS (
       SELECT FROM auth.sessions s JOIN sentinela.usuarios u ON u.auth_user_id=s.user_id
       JOIN sentinela.perfil_permissoes p ON p.perfil=u.perfil AND p.acao='administrar'
       WHERE s.id=pedido.sessao AND u.id=pedido.ator AND (s.not_after IS NULL OR s.not_after>now())
          AND sentinela_private.cadastro_admin(u.id,s.user_id)
     ) THEN RAISE EXCEPTION 'Solicitação de cadastro inválida ou expirada' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT FROM auth.users a WHERE a.id<>NEW.id AND lower(a.email)=email_login)
      OR EXISTS (SELECT FROM sentinela_pessoas.contatos c WHERE lower(c.email)=email_login) THEN
    RAISE EXCEPTION 'E-mail já cadastrado' USING ERRCODE='23505';
  END IF;
  INSERT INTO sentinela.usuarios(id,auth_user_id,nome_exibicao,perfil,ativo)
    VALUES (NEW.id,NEW.id,pedido.dados->>'name',pedido.dados->>'perfil',(pedido.dados->>'ativo')::boolean);
  INSERT INTO sentinela_pessoas.contatos(usuario,email,orgao)
    VALUES (NEW.id,email_login,nullif(pedido.dados->>'orgao',''));
  INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,depois,justificativa)
  VALUES ('servico','sentinela-usuarios','usuarios.criar_institucional',
    jsonb_build_object('actor',pedido.ator,'alvo',NEW.id,'perfil',pedido.dados->>'perfil','ativo',pedido.dados->'ativo'),
    'Cadastro pela administração institucional');
  UPDATE sentinela_pessoas.solicitacoes SET usuario=NEW.id,sessao=NULL,dados=NULL WHERE id=pedido.id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sentinela_private.concluir_cadastro_gestao() FROM PUBLIC, anon, authenticated, service_role;
-- Supabase Auth may set app_metadata in an UPDATE within the creation transaction.
CREATE TRIGGER sentinela_concluir_cadastro AFTER INSERT OR UPDATE OF raw_app_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sentinela_private.concluir_cadastro_gestao();

CREATE FUNCTION sentinela_pessoas.alterar_gestao(ator uuid, identidade uuid, alvo uuid, versao text, dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE anterior jsonb; posterior jsonb; evento text; perfil_novo text; ativo_novo boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(743204,22);
  PERFORM sentinela_pessoas.autorizar(ator,identidade);
  PERFORM FROM sentinela.usuarios WHERE id=alvo AND auth_user_id IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado' USING ERRCODE='P0002'; END IF;
  IF dados ? 'confirmacao' AND EXISTS (
    SELECT FROM sentinela.usuarios u JOIN LATERAL sentinela_private.dados_auth_gestao(u.auth_user_id) a ON true
    WHERE u.id=alvo AND u.arquivado_em IS NOT NULL AND a.email=dados->>'confirmacao'
  ) THEN RETURN NULL; END IF;
  SELECT r INTO anterior FROM sentinela_pessoas.registros(alvo) r;
  IF anterior IS NULL THEN RAISE EXCEPTION 'Usuário não encontrado' USING ERRCODE='P0002'; END IF;
  IF anterior->>'version' IS DISTINCT FROM versao THEN
    RAISE EXCEPTION 'Cadastro alterado' USING ERRCODE='40001'; END IF;
  IF dados ? 'confirmacao' THEN
    IF alvo=ator THEN RAISE EXCEPTION 'Autoexclusão proibida' USING ERRCODE='42501'; END IF;
    IF anterior->>'loginEmail' IS NULL OR anterior->>'loginEmail' IS DISTINCT FROM dados->>'confirmacao' THEN
      RAISE EXCEPTION 'Confirmação inválida' USING ERRCODE='22023'; END IF;
    UPDATE sentinela.usuarios SET ativo=false,arquivado_em=clock_timestamp(),revisao_gestao=revisao_gestao+1 WHERE id=alvo;
    evento := 'usuarios.arquivar';
    posterior := jsonb_build_object('ativo',false,'arquivado',true,'perfil',anterior->>'perfil');
  ELSIF dados ? 'perfil' THEN
    perfil_novo := dados->>'perfil';
    IF perfil_novo IS NULL OR perfil_novo NOT IN ('Administrador','Operador','Analista') THEN
      RAISE EXCEPTION 'Perfil inválido' USING ERRCODE='22023'; END IF;
    IF perfil_novo=anterior->>'perfil' THEN RETURN anterior; END IF;
    UPDATE sentinela.usuarios SET perfil=perfil_novo,revisao_gestao=revisao_gestao+1 WHERE id=alvo;
    evento := 'usuarios.alterar_perfil';
  ELSIF dados ? 'ativo' THEN
    IF jsonb_typeof(dados->'ativo') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Status inválido' USING ERRCODE='22023'; END IF;
    ativo_novo := (dados->>'ativo')::boolean;
    IF ativo_novo=(anterior->>'ativo')::boolean THEN RETURN anterior; END IF;
    UPDATE sentinela.usuarios SET ativo=ativo_novo,revisao_gestao=revisao_gestao+1 WHERE id=alvo;
    evento := 'usuarios.alterar_status';
  ELSE
    RETURN sentinela_pessoas.editar(ator,identidade,alvo,versao,dados->>'name',nullif(dados->>'email',''),nullif(dados->>'orgao',''));
  END IF;
  IF posterior IS NULL THEN SELECT r INTO posterior FROM sentinela_pessoas.registros(alvo) r; END IF;
  INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,antes,depois,justificativa)
  VALUES ('servico','sentinela-usuarios',evento,
    jsonb_build_object('ativo',anterior->'ativo','perfil',anterior->'perfil'),
    jsonb_build_object('actor',ator,'alvo',alvo,'ativo',posterior->'ativo',
      'perfil',posterior->'perfil','arquivado',evento='usuarios.arquivar'),'Gestão pela administração institucional');
  IF evento='usuarios.arquivar' THEN RETURN NULL; END IF;
  RETURN (SELECT r FROM sentinela_pessoas.registros(alvo) r);
END $$;
REVOKE ALL ON FUNCTION sentinela_pessoas.alterar_gestao(uuid,uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sentinela_pessoas.alterar_gestao(uuid,uuid,uuid,text,jsonb) TO sentinela_local_admin;
GRANT CREATE ON SCHEMA sentinela_pessoas TO sentinela_pessoas_owner;
ALTER FUNCTION sentinela_pessoas.alterar_gestao(uuid,uuid,uuid,text,jsonb) OWNER TO sentinela_pessoas_owner;
REVOKE CREATE ON SCHEMA sentinela_pessoas FROM sentinela_pessoas_owner;

-- Retire the hosted legacy write entry points. Keep their definitions and history for review.
SET LOCAL ROLE sentinela_pessoas_owner;
REVOKE EXECUTE ON FUNCTION sentinela_pessoas.criar(uuid,uuid,uuid,text,text,text,text),
  sentinela_pessoas.editar(uuid,uuid,uuid,text,text,text,text),
  sentinela_pessoas.excluir(uuid,uuid,uuid,text,text) FROM sentinela_local_admin;
RESET ROLE;
REVOKE EXECUTE ON FUNCTION sentinela_api.consultar_cadastro(text,jsonb),
  sentinela_api.bloquear_exclusao_usuario(uuid,uuid,uuid,uuid,text) FROM service_role;

INSERT INTO sentinela.schema_migrations VALUES ('0014','Gestão auditada de usuários institucionais',DEFAULT);
COMMIT;
