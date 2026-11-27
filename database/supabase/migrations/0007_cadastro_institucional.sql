BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF obj_description('sentinela'::regnamespace, 'pg_namespace') IS DISTINCT FROM
       'sentinela:supabase-baseline-v1:logical-0001-0005'
    OR to_regprocedure('sentinela_api.meu_acesso()') IS NULL
    OR NOT EXISTS (SELECT 1 FROM sentinela.schema_migrations WHERE versao='0006')
    OR NOT EXISTS (SELECT FROM pg_class WHERE oid='sentinela.usuarios'::regclass AND relrowsecurity AND relforcerowsecurity)
  THEN RAISE EXCEPTION 'Baseline institucional divergente'; END IF;
END $$;

CREATE OR REPLACE FUNCTION sentinela_private.cadastro_admin(ator uuid, identidade uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
 SELECT EXISTS (SELECT FROM sentinela.usuarios u JOIN auth.users a ON a.id=u.auth_user_id
  WHERE u.id=ator AND a.id=identidade AND u.ativo AND u.perfil='Administrador'
    AND coalesce(a.raw_app_meta_data->>'sentinela_onboarding','complete')='complete');
$$;
REVOKE ALL ON FUNCTION sentinela_private.cadastro_admin(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Only Auth Admin can set app metadata. A pending Auth identity and its inactive
-- institutional link are created in the same transaction.
CREATE OR REPLACE FUNCTION sentinela_private.vincular_cadastro_auth() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE cadastro jsonb; fase text; anterior text;
BEGIN
 IF TG_OP='DELETE' THEN
   IF OLD.raw_app_meta_data->>'sentinela_onboarding'='provisioning'
      AND OLD.raw_app_meta_data ? 'sentinela_cadastro_institucional' THEN
     DELETE FROM sentinela.usuarios WHERE id=OLD.id AND auth_user_id=OLD.id AND NOT ativo;
   END IF;
   RETURN OLD;
 END IF;
 cadastro := NEW.raw_app_meta_data->'sentinela_cadastro_institucional';
 fase := NEW.raw_app_meta_data->>'sentinela_onboarding';
 IF TG_OP='INSERT' OR NOT coalesce(OLD.raw_app_meta_data ? 'sentinela_cadastro_institucional',false) THEN
   IF cadastro IS NULL THEN RETURN NEW; END IF;
   IF fase IS DISTINCT FROM 'provisioning' OR NOT sentinela_private.cadastro_admin(
        (cadastro->>'actor')::uuid,(cadastro->>'identity')::uuid)
     OR NOT coalesce(cadastro->>'perfil' IN ('Administrador','Operador','Analista'),false)
     OR NOT coalesce(length(btrim(cadastro->>'name')) BETWEEN 1 AND 160,false)
     OR NOT coalesce(NEW.email ~ '^[^[:space:]@]+@gmail\.com$',false)
   THEN RAISE EXCEPTION 'Cadastro institucional inválido' USING ERRCODE='42501'; END IF;
   INSERT INTO sentinela.usuarios(id,auth_user_id,nome_exibicao,perfil,ativo)
     VALUES (NEW.id,NEW.id,cadastro->>'name',cadastro->>'perfil',false);
   RETURN NEW;
 END IF;
 anterior := OLD.raw_app_meta_data->>'sentinela_onboarding';
 IF cadastro IS DISTINCT FROM OLD.raw_app_meta_data->'sentinela_cadastro_institucional' THEN
   RAISE EXCEPTION 'Identidade de provisionamento imutável' USING ERRCODE='42501'; END IF;
 IF fase IS NOT DISTINCT FROM anterior THEN RETURN NEW; END IF;
 IF anterior='provisioning' AND fase='password' THEN
   IF NOT sentinela_private.cadastro_admin((cadastro->>'actor')::uuid,(cadastro->>'identity')::uuid) THEN
     RAISE EXCEPTION 'Administrador institucional necessário' USING ERRCODE='42501'; END IF;
   INSERT INTO sentinela.usuarios(id,auth_user_id,nome_exibicao,perfil,ativo)
     VALUES(NEW.id,NEW.id,cadastro->>'name',cadastro->>'perfil',true)
     ON CONFLICT(id) DO UPDATE SET ativo=true
     WHERE usuarios.auth_user_id=EXCLUDED.auth_user_id AND usuarios.nome_exibicao=EXCLUDED.nome_exibicao
       AND usuarios.perfil=EXCLUDED.perfil AND NOT usuarios.ativo;
   IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo institucional ausente' USING ERRCODE='42501'; END IF;
 ELSIF anterior IS DISTINCT FROM 'password' OR fase IS DISTINCT FROM 'complete' THEN
   RAISE EXCEPTION 'Transição de primeiro acesso inválida' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sentinela_private.vincular_cadastro_auth() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE TRIGGER sentinela_cadastro_auth
 AFTER INSERT OR UPDATE OF raw_app_meta_data ON auth.users
 FOR EACH ROW EXECUTE FUNCTION sentinela_private.vincular_cadastro_auth();
CREATE OR REPLACE TRIGGER sentinela_cancelar_cadastro_auth BEFORE DELETE ON auth.users
 FOR EACH ROW EXECUTE FUNCTION sentinela_private.vincular_cadastro_auth();

CREATE OR REPLACE FUNCTION sentinela_api.consultar_cadastro(email text, cadastro jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
 IF NOT sentinela_private.cadastro_admin((cadastro->>'actor')::uuid,(cadastro->>'identity')::uuid)
 THEN RAISE EXCEPTION 'Administrador institucional necessário' USING ERRCODE='42501'; END IF;
 RETURN coalesce((
  SELECT CASE WHEN a.raw_app_meta_data->>'sentinela_onboarding'='provisioning'
    AND a.raw_app_meta_data->'sentinela_cadastro_institucional'=cadastro
    THEN jsonb_build_object('exists',true,'pending',a.id)
    ELSE '{"exists":true}'::jsonb END
  FROM auth.users a WHERE lower(a.email)=lower(consultar_cadastro.email) LIMIT 1
 ),'{"exists":false}'::jsonb);
END $$;
GRANT USAGE ON SCHEMA sentinela_api TO service_role;
REVOKE ALL ON FUNCTION sentinela_api.consultar_cadastro(text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sentinela_api.consultar_cadastro(text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION sentinela_api.meu_acesso()
RETURNS TABLE (usuario_id uuid, auth_user_id uuid, nome_exibicao text, perfil text, ativo boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
 SELECT u.id,u.auth_user_id,u.nome_exibicao::text,u.perfil,u.ativo
 FROM sentinela.usuarios u WHERE u.auth_user_id=(SELECT auth.uid()) AND u.ativo
   AND coalesce((SELECT auth.jwt())->'app_metadata'->>'sentinela_onboarding','complete')='complete'
$$;

INSERT INTO sentinela.schema_migrations VALUES ('0007','Cadastro institucional e primeiro acesso',DEFAULT) ON CONFLICT DO NOTHING;
COMMIT;
