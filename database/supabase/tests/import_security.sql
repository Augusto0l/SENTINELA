\set ON_ERROR_STOP 1
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
DO $$
DECLARE
  receipts oid := 'sentinela_exclusao.comprovantes'::regclass;
  owner oid := 'sentinela_exclusao_owner'::regrole;
BEGIN
  IF NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0010') THEN
    RAISE EXCEPTION 'Ledger incompleto';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_class WHERE oid=receipts AND relowner=owner AND relrowsecurity AND relforcerowsecurity)
     OR (SELECT array_agg(a.privilege_type ORDER BY a.privilege_type)
         FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
         WHERE c.oid=receipts AND a.grantee=owner AND a.grantor=owner AND NOT a.is_grantable)
       IS DISTINCT FROM ARRAY['INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER']
     OR has_table_privilege(owner,receipts,'UPDATE,DELETE,TRUNCATE')
     OR has_any_column_privilege(owner,receipts,'UPDATE') THEN
    RAISE EXCEPTION 'ACL efetiva de comprovantes divergente';
  END IF;
  IF EXISTS (
    SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.pronamespace='sentinela_ambiente'::regnamespace
      AND a.grantee IN (0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)
  ) THEN RAISE EXCEPTION 'Acesso público às funções de ambiente'; END IF;
  IF EXISTS (
    SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname LIKE 'sentinela%' AND p.prosecdef
      AND (NOT EXISTS (SELECT FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
        OR EXISTS (SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0))
  ) THEN RAISE EXCEPTION 'SECURITY DEFINER com execução pública ou search_path ausente'; END IF;
  IF has_table_privilege('authenticated','sentinela.usuarios','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
     OR (SELECT array_agg(a.attname::text ORDER BY a.attname)
         FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) g
         WHERE a.attrelid='sentinela.usuarios'::regclass AND g.grantee='authenticated'::regrole
           AND g.privilege_type='SELECT')
       IS DISTINCT FROM ARRAY['ativo','auth_user_id','id','nome_exibicao','perfil'] THEN
    RAISE EXCEPTION 'Leitura institucional de usuários divergente';
  END IF;
  IF EXISTS (
    SELECT FROM pg_roles r
    WHERE rolname ~ '^sentinela_local_(admin|operator|analyst)$'
      AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit
        OR EXISTS (SELECT FROM pg_auth_members m WHERE m.member=r.oid)
        OR EXISTS (SELECT FROM pg_class c WHERE c.relowner=r.oid)
        OR has_table_privilege(r.oid,'sentinela_ambiente.instalacao','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))
  ) THEN RAISE EXCEPTION 'Papel da aplicação com privilégios elevados'; END IF;
END $$;

INSERT INTO auth.users (id,email,raw_app_meta_data)
VALUES ('d0000000-0000-4000-8000-000000000001','admin@example.test','{}'),
       ('d0000000-0000-4000-8000-000000000002','operador@example.test','{}');
INSERT INTO sentinela.usuarios (id,auth_user_id,nome_exibicao,perfil,ativo)
VALUES ('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','Admin Teste','Administrador',true),
       ('d0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000002','Operador Teste','Operador',true);
INSERT INTO auth.sessions (id,user_id) VALUES
 ('d0000000-0000-4000-8000-000000000011','d0000000-0000-4000-8000-000000000001'),
 ('d0000000-0000-4000-8000-000000000012','d0000000-0000-4000-8000-000000000002');

SET SESSION AUTHORIZATION sentinela_local_admin;
SET LOCAL sentinela.sandbox_uuid = '00000000-0000-4000-8000-000000000000';
DO $$
BEGIN
  IF sentinela_ambiente.vinculado() IS DISTINCT FROM true
     OR sentinela_ambiente.instalacao()::text=current_setting('sentinela.sandbox_uuid') THEN
    RAISE EXCEPTION 'Parâmetro de sessão alterou a identidade da instalação';
  END IF;
  IF sentinela_ambiente.ator_importacao() IS NOT NULL THEN RAISE EXCEPTION 'Sessão ausente aceita'; END IF;
  PERFORM set_config('sentinela.import_session','d0000000-0000-4000-8000-000000000012',true);
  IF sentinela_ambiente.ator_importacao() IS NOT NULL THEN RAISE EXCEPTION 'Papel divergente aceito'; END IF;
  PERFORM set_config('sentinela.import_session','d0000000-0000-4000-8000-000000000011',true);
  IF sentinela_ambiente.ator_importacao() IS DISTINCT FROM 'd0000000-0000-4000-8000-000000000001'::uuid
     OR sentinela_pcdf_local.preflight() IS DISTINCT FROM 'Administrador' THEN
    RAISE EXCEPTION 'Sessão válida recusada';
  END IF;
END $$;
RESET SESSION AUTHORIZATION;
DELETE FROM auth.sessions WHERE id='d0000000-0000-4000-8000-000000000011';
SET SESSION AUTHORIZATION sentinela_local_admin;
DO $$
BEGIN
  IF sentinela_ambiente.ator_importacao() IS NOT NULL THEN RAISE EXCEPTION 'Sessão revogada aceita'; END IF;
END $$;
ROLLBACK;
