BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
 IF NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0007')
   OR NOT EXISTS (SELECT FROM pg_class WHERE oid='sentinela.usuarios'::regclass AND relrowsecurity AND relforcerowsecurity)
 THEN RAISE EXCEPTION 'Baseline institucional divergente'; END IF;
END $$;

-- Reject even an unexpired access token after its Supabase session is gone.
CREATE OR REPLACE FUNCTION sentinela_private.sessao_ativa() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS (SELECT FROM auth.sessions s WHERE s.user_id=(SELECT auth.uid())
   AND s.id=(SELECT (auth.jwt()->>'session_id')::uuid)
   AND (s.not_after IS NULL OR s.not_after>now()));
$$;
REVOKE ALL ON FUNCTION sentinela_private.sessao_ativa() FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA sentinela_private TO authenticated;
GRANT EXECUTE ON FUNCTION sentinela_private.sessao_ativa() TO authenticated;

CREATE OR REPLACE FUNCTION sentinela_api.meu_acesso()
RETURNS TABLE (usuario_id uuid, auth_user_id uuid, nome_exibicao text, perfil text, ativo boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
 SELECT u.id,u.auth_user_id,u.nome_exibicao::text,u.perfil,u.ativo
 FROM sentinela.usuarios u WHERE u.auth_user_id=(SELECT auth.uid()) AND u.ativo
   AND coalesce((SELECT auth.jwt())->'app_metadata'->>'sentinela_onboarding','complete')='complete'
   AND (SELECT sentinela_private.sessao_ativa())
$$;

CREATE OR REPLACE FUNCTION sentinela_api.bloquear_exclusao_usuario(ator uuid, identidade uuid, alvo uuid, vinculo uuid, email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE usuario sentinela.usuarios%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(743204,22);
 IF NOT sentinela_private.cadastro_admin(ator,identidade) THEN
   RAISE EXCEPTION 'Administrador institucional necessário' USING ERRCODE='42501'; END IF;
 IF alvo=ator OR vinculo=identidade THEN
   RAISE EXCEPTION 'Autoexclusão proibida' USING ERRCODE='42501'; END IF;
 SELECT * INTO usuario FROM sentinela.usuarios WHERE id=alvo FOR UPDATE;
 IF NOT FOUND OR (usuario.auth_user_id IS DISTINCT FROM vinculo AND (usuario.auth_user_id IS NOT NULL OR usuario.ativo))
   OR EXISTS (SELECT FROM auth.users a WHERE a.id=vinculo AND lower(a.email) IS DISTINCT FROM bloquear_exclusao_usuario.email)
   OR EXISTS (SELECT FROM sentinela.usuarios u WHERE u.auth_user_id=vinculo AND u.id<>alvo)
 THEN RAISE EXCEPTION 'Vínculo institucional divergente' USING ERRCODE='P0002'; END IF;
 IF usuario.ativo AND usuario.perfil='Administrador' AND NOT EXISTS (
   SELECT FROM sentinela.usuarios u JOIN auth.users a ON a.id=u.auth_user_id
   WHERE u.id<>alvo AND u.ativo AND u.perfil='Administrador'
   AND coalesce(a.raw_app_meta_data->>'sentinela_onboarding','complete')='complete'
 ) THEN RAISE EXCEPTION 'Último Administrador ativo' USING ERRCODE='23514'; END IF;
 -- The FK from the institutional user to Auth is RESTRICT. Detach the UUID
 -- while keeping every historical FK to the institutional primary key.
 UPDATE sentinela.usuarios SET auth_user_id=NULL,ativo=false
 WHERE id=alvo AND auth_user_id=vinculo;
END $$;
REVOKE ALL ON FUNCTION sentinela_api.bloquear_exclusao_usuario(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION sentinela_api.bloquear_exclusao_usuario(uuid,uuid,uuid,uuid,text) TO service_role;

INSERT INTO sentinela.schema_migrations VALUES ('0008','Exclusão institucional preservando vínculos históricos e sessão real',DEFAULT)
ON CONFLICT DO NOTHING;
COMMIT;
