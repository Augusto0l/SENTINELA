\set ON_ERROR_STOP on

-- Run inside the installation transaction or in a read-only verification session.
-- Example at the starting state: psql -X -w --single-transaction -v sentinela_phase=8 -f this-file.sql
SET LOCAL search_path = pg_catalog, pg_temp;
SELECT pg_catalog.set_config('sentinela.installation_check_phase', :'sentinela_phase', true) AS check_phase \gset

DO $check$
DECLARE
  phase integer := current_setting('sentinela.installation_check_phase')::integer;
  receipts oid;
  receipt_owner oid;
  review_queue oid;
  review_decision oid;
BEGIN
  IF phase NOT BETWEEN 8 AND 11 THEN
    RAISE EXCEPTION 'Fase de instalação inválida: %', phase;
  END IF;

  IF (SELECT array_agg(versao::text ORDER BY versao) FROM sentinela.schema_migrations)
       IS DISTINCT FROM ARRAY(SELECT lpad(i::text, 4, '0') FROM generate_series(1, phase) AS versions(i))
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations) <> phase - 6
     OR NOT EXISTS (SELECT FROM supabase_migrations.schema_migrations
                    WHERE version = '20261126163226' AND name = 'exclusao_institucional')
     OR NOT EXISTS (SELECT FROM supabase_migrations.schema_migrations
                    WHERE version = '20261126163836' AND name = 'corrigir_confirmacao_exclusao_institucional') THEN
    RAISE EXCEPTION 'Ledger lógico ou histórico de implantação incompatível com a fase %.', phase;
  END IF;

  IF (SELECT count(*) FROM auth.users) <> 3
     OR (SELECT count(*) FROM auth.identities) <> 3
     OR (SELECT array_agg(u.perfil::text ORDER BY u.perfil::text COLLATE "C")
         FROM sentinela.usuarios u JOIN auth.users a ON a.id = u.auth_user_id WHERE u.ativo)
         IS DISTINCT FROM ARRAY['Administrador', 'Analista', 'Operador']
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass
         AND NOT tgisinternal AND tgenabled <> 'D') <> 2
     OR (SELECT count(*) FROM sentinela.eventos_auditoria) <> 1
     OR EXISTS (SELECT FROM sentinela.ocorrencias)
     OR EXISTS (SELECT FROM sentinela.ocorrencia_naturezas)
     OR EXISTS (SELECT FROM sentinela.lotes_importacao) THEN
    RAISE EXCEPTION 'Inventário institucional diverge do pré-voo da instalação.';
  END IF;

  IF (SELECT count(*) FROM pg_class
      WHERE relnamespace = 'sentinela'::regnamespace AND relkind = 'r' AND relrowsecurity AND relforcerowsecurity) <> 19
     OR EXISTS (SELECT FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname LIKE 'sentinela%' AND NOT i.indisvalid)
     OR EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname LIKE 'sentinela%' AND p.prosecdef
          AND EXISTS (SELECT FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0)) THEN
    RAISE EXCEPTION 'RLS, índices ou funções privilegiadas divergem do pré-voo.';
  END IF;

  IF phase >= 9 THEN
    IF NOT sentinela_ambiente.vinculado() OR sentinela_ambiente.instalacao() IS NULL
       OR NOT EXISTS (SELECT FROM pg_class WHERE oid = 'sentinela_ambiente.instalacao'::regclass
                      AND relowner = 'sentinela_ambiente_owner'::regrole AND relrowsecurity AND relforcerowsecurity)
       OR (SELECT count(*) FROM pg_roles r WHERE rolname IN ('sentinela_local_admin', 'sentinela_local_operator', 'sentinela_local_analyst')
           AND rolcanlogin AND NOT (rolinherit OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)
           AND NOT EXISTS (SELECT FROM pg_auth_members m WHERE m.member = r.oid)) <> 3 THEN
      RAISE EXCEPTION 'Instalação vinculada ou papéis de aplicação divergem.';
    END IF;
  END IF;

  IF phase >= 10 THEN
    SELECT c.oid INTO receipts FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'sentinela_exclusao' AND c.relname = 'comprovantes' AND c.relkind = 'r';
    receipt_owner := 'sentinela_exclusao_owner'::regrole;
    IF NOT EXISTS (SELECT FROM pg_class WHERE oid = receipts AND relowner = receipt_owner AND relrowsecurity AND relforcerowsecurity)
       OR (SELECT array_agg(a.privilege_type ORDER BY a.privilege_type)
           FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
           WHERE c.oid = receipts AND a.grantee = receipt_owner AND a.grantor = receipt_owner AND NOT a.is_grantable)
          IS DISTINCT FROM ARRAY['INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER']
       OR has_table_privilege(receipt_owner, receipts, 'UPDATE,DELETE,TRUNCATE')
       OR has_any_column_privilege(receipt_owner, receipts, 'UPDATE') THEN
      RAISE EXCEPTION 'ACL efetiva de comprovantes divergente.';
    END IF;
  END IF;

  IF phase >= 11 THEN
    SELECT p.oid INTO review_queue FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'sentinela_revisao' AND p.proname = 'fila'
      AND oidvectortypes(p.proargtypes) = 'text, text, text, text, text, text, integer, integer';
    SELECT p.oid INTO review_decision FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'sentinela_revisao' AND p.proname = 'decidir'
      AND oidvectortypes(p.proargtypes) = 'uuid, bigint, text, text, text';
    IF EXISTS (SELECT FROM pg_roles r WHERE r.rolname IN ('sentinela_local_admin', 'sentinela_local_operator', 'sentinela_local_analyst')
        AND (NOT has_function_privilege(r.oid, review_queue, 'EXECUTE')
             OR has_function_privilege(r.oid, review_decision, 'EXECUTE') <> (r.rolname = 'sentinela_local_admin')))
       OR EXISTS (SELECT FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
        AND (has_function_privilege(r.oid, review_queue, 'EXECUTE') OR has_function_privilege(r.oid, review_decision, 'EXECUTE')))
       OR (SELECT count(*) FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
         WHERE p.oid IN (review_queue, review_decision) AND p.prosecdef AND r.rolname = 'sentinela_revisao_owner'
          AND NOT (r.rolcanlogin OR r.rolsuper OR r.rolbypassrls)
          AND EXISTS (SELECT FROM unnest(p.proconfig) s WHERE s LIKE 'search_path=%')) <> 2 THEN
      RAISE EXCEPTION 'Permissões efetivas da Central de Revisão divergentes.';
    END IF;
  END IF;
END
$check$;

SELECT :'sentinela_phase'::integer AS phase_checked;
