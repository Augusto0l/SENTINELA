-- Incremental Supabase ONLY, after supabase-baseline-v1. No remote execution in this delivery.
-- Does NOT expose sentinela through the Data API, create Auth accounts or allow signup.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog;
DO $$
BEGIN
  IF obj_description('sentinela'::regnamespace, 'pg_namespace') IS DISTINCT FROM
    'sentinela:supabase-baseline-v1:logical-0001-0005' THEN
    RAISE EXCEPTION 'Baseline Supabase esperada; nao aplicar ao perfil local original.';
  END IF;
  IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'Auth gerenciado requerido; nao criar auth.users/auth.uid falsos na aplicacao.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Migrador precisa de privilegios de manutencao/BYPASSRLS para o ledger fechado; nao remover RLS.';
  END IF;
  IF (SELECT count(*) FROM sentinela.schema_migrations) <> 5 THEN
    RAISE EXCEPTION 'Esperadas exatamente as cinco versoes logicas da baseline.';
  END IF;
END $$;

ALTER TABLE sentinela.usuarios
  ADD CONSTRAINT usuarios_auth_user_fk FOREIGN KEY (auth_user_id)
  REFERENCES auth.users(id) ON DELETE RESTRICT;

-- Only the caller's active identity record. No business-data scope is implied by this policy.
CREATE POLICY usuario_consulta_proprio_vinculo ON sentinela.usuarios
FOR SELECT TO authenticated
USING (auth_user_id = (SELECT auth.uid()) AND ativo);

GRANT USAGE ON SCHEMA sentinela TO authenticated;
GRANT SELECT (id, auth_user_id, nome_exibicao, perfil, ativo) ON sentinela.usuarios TO authenticated;

CREATE SCHEMA sentinela_api;
REVOKE ALL ON SCHEMA sentinela_api FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA sentinela_api TO authenticated;
CREATE FUNCTION sentinela_api.meu_acesso()
RETURNS TABLE (usuario_id uuid, auth_user_id uuid, nome_exibicao text, perfil text, ativo boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT u.id, u.auth_user_id, u.nome_exibicao::text, u.perfil, u.ativo
  FROM sentinela.usuarios u
  WHERE u.auth_user_id = (SELECT auth.uid()) AND u.ativo
$$;
REVOKE ALL ON FUNCTION sentinela_api.meu_acesso() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sentinela_api.meu_acesso() TO authenticated;

-- Offline/maintenance provisioning, not callable by frontend/API roles.
-- No automatic first-user promotion; every role and approval reference must be explicit.
CREATE SCHEMA sentinela_private;
REVOKE ALL ON SCHEMA sentinela_private FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION sentinela_private.provisionar_vinculo(
  p_auth_user_id uuid, p_nome text, p_perfil text, p_ativo boolean, p_aprovacao text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE atual sentinela.usuarios%ROWTYPE; anterior jsonb; resultado uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Provisionamento restrito a manutencao aprovada.' USING ERRCODE='42501';
  END IF;
  IF p_aprovacao IS NULL OR length(btrim(p_aprovacao)) < 5 OR p_perfil IS NULL
    OR p_perfil NOT IN ('Administrador','Operador','Analista') OR p_ativo IS NULL
    OR p_auth_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_auth_user_id) THEN
    RAISE EXCEPTION 'Identidade Auth existente, perfil explicito e evidencia de aprovacao obrigatorios.' USING ERRCODE='23514';
  END IF;
  PERFORM pg_advisory_xact_lock(743204,22);
  SELECT * INTO atual FROM sentinela.usuarios WHERE auth_user_id=p_auth_user_id FOR UPDATE;
  IF FOUND THEN
    anterior := to_jsonb(atual);
    IF atual.ativo AND atual.perfil='Administrador' AND (NOT p_ativo OR p_perfil<>'Administrador')
      AND NOT EXISTS (SELECT 1 FROM sentinela.usuarios WHERE ativo AND perfil='Administrador' AND id<>atual.id) THEN
      RAISE EXCEPTION 'Nao desativar/rebaixar o ultimo Administrador ativo.' USING ERRCODE='23514';
    END IF;
    UPDATE sentinela.usuarios SET nome_exibicao=p_nome,perfil=p_perfil,ativo=p_ativo WHERE id=atual.id RETURNING id INTO resultado;
  ELSE
    INSERT INTO sentinela.usuarios(auth_user_id,nome_exibicao,perfil,ativo)
      VALUES(p_auth_user_id,p_nome,p_perfil,p_ativo) RETURNING id INTO resultado;
  END IF;
  INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,antes,depois,justificativa)
    SELECT 'servico','provisionamento_controlado','provisionar_vinculo',anterior,to_jsonb(u),p_aprovacao
    FROM sentinela.usuarios u WHERE u.id=resultado;
  RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION sentinela_private.provisionar_vinculo(uuid,text,text,boolean,text) FROM PUBLIC, anon, authenticated, service_role;

-- No application CRUD grants, no policies on occurrences/originals/audit, no trigger bypass.
INSERT INTO sentinela.schema_migrations VALUES ('0006','Vinculo Auth restrito, proprio acesso e provisionamento de manutencao',DEFAULT);
COMMIT;
