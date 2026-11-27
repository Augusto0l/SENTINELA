-- Incremental Supabase ONLY, after 0008. No remote execution in this delivery.
-- Creates the importer roles (no passwords) and the hosted installation binding that replaces the
-- physical checks of the local cluster (address, port, database name, system identifier, sandbox UUID).
-- Login passwords are set out of band (ALTER ROLE ... PASSWORD) and never stored in the repository.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0008') THEN
    RAISE EXCEPTION 'Aplicar somente depois da 0008.';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_extension WHERE extname='postgis' AND extnamespace='extensions'::regnamespace) THEN
    RAISE EXCEPTION 'PostGIS deve estar instalado no schema extensions.';
  END IF;
  IF to_regnamespace('sentinela_ambiente') IS NOT NULL THEN
    RAISE EXCEPTION 'Ligação de ambiente já existente; não reaplicar.';
  END IF;
END $$;

-- Same roles and attributes as the attested local installation: no inheritance, no elevated attribute.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['sentinela_exclusao_owner','sentinela_general_importer','sentinela_gestao_autoridade',
    'sentinela_gestao_owner','sentinela_manual_reader','sentinela_manual_writer','sentinela_ocorrencias_reader',
    'sentinela_pcdf_historico_owner','sentinela_pcdf_owner','sentinela_pessoas_owner','sentinela_ambiente_owner'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname=r) THEN RAISE EXCEPTION 'Papel já existente: %', r; END IF;
    EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', r);
  END LOOP;
  FOREACH r IN ARRAY ARRAY['sentinela_local_admin','sentinela_local_operator','sentinela_local_analyst'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname=r) THEN RAISE EXCEPTION 'Papel já existente: %', r; END IF;
    EXECUTE format('CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', r);
  END LOOP;
END $$;

-- The migrator must be able to transfer ownership to the owner roles (SET), without inheriting them.
GRANT sentinela_exclusao_owner, sentinela_general_importer, sentinela_gestao_autoridade, sentinela_gestao_owner,
  sentinela_manual_reader, sentinela_manual_writer, sentinela_ocorrencias_reader, sentinela_pcdf_historico_owner,
  sentinela_pcdf_owner, sentinela_pessoas_owner, sentinela_ambiente_owner
  TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;

-- Installation binding. Not a session parameter: a singleton row owned by a dedicated role, readable only
-- through SECURITY DEFINER functions, bound to the OID of the target database at installation time.
-- Objects are created by the migrator, then ownership is transferred and RLS is forced.
CREATE SCHEMA sentinela_ambiente;
REVOKE ALL ON SCHEMA sentinela_ambiente FROM PUBLIC;

CREATE TABLE sentinela_ambiente.instalacao (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  banco_oid oid NOT NULL,
  instalada_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- The single row is written once, at installation, before ownership-protected reads start.
INSERT INTO sentinela_ambiente.instalacao(banco_oid)
SELECT oid FROM pg_database WHERE datname = current_database();

CREATE FUNCTION sentinela_ambiente.vinculado() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT NOT pg_is_in_recovery() AND EXISTS (
    SELECT FROM sentinela_ambiente.instalacao i
    WHERE i.singleton AND i.banco_oid = (SELECT d.oid FROM pg_database d WHERE d.datname = current_database()))
$$;
CREATE FUNCTION sentinela_ambiente.instalacao() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT i.id FROM sentinela_ambiente.instalacao i WHERE i.singleton AND sentinela_ambiente.vinculado()
$$;
CREATE FUNCTION sentinela_ambiente.sistema() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  -- Keep the numeric encoding used by the existing release constraints.
  SELECT lpad(i.banco_oid::text, 15, '0') FROM sentinela_ambiente.instalacao i
  WHERE i.singleton AND sentinela_ambiente.vinculado()
$$;
GRANT USAGE, CREATE ON SCHEMA sentinela_ambiente TO sentinela_ambiente_owner;
ALTER TABLE sentinela_ambiente.instalacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_ambiente.instalacao FORCE ROW LEVEL SECURITY;
CREATE POLICY instalacao_leitura ON sentinela_ambiente.instalacao FOR SELECT TO sentinela_ambiente_owner USING (true);
REVOKE ALL ON sentinela_ambiente.instalacao FROM PUBLIC;
ALTER TABLE sentinela_ambiente.instalacao OWNER TO sentinela_ambiente_owner;
ALTER FUNCTION sentinela_ambiente.vinculado() OWNER TO sentinela_ambiente_owner;
ALTER FUNCTION sentinela_ambiente.instalacao() OWNER TO sentinela_ambiente_owner;
ALTER FUNCTION sentinela_ambiente.sistema() OWNER TO sentinela_ambiente_owner;
-- Only the new owner can manage these ACLs. Keep the migrator's schema changes outside SET ROLE.
SET LOCAL ROLE sentinela_ambiente_owner;
REVOKE ALL ON FUNCTION sentinela_ambiente.vinculado(), sentinela_ambiente.instalacao(), sentinela_ambiente.sistema()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sentinela_ambiente.vinculado(), sentinela_ambiente.instalacao(), sentinela_ambiente.sistema()
  TO sentinela_exclusao_owner, sentinela_general_importer, sentinela_gestao_autoridade, sentinela_gestao_owner,
  sentinela_manual_reader, sentinela_manual_writer, sentinela_ocorrencias_reader, sentinela_pcdf_historico_owner,
  sentinela_pcdf_owner, sentinela_pessoas_owner, sentinela_local_admin, sentinela_local_operator, sentinela_local_analyst,
  postgres;
RESET ROLE;
GRANT USAGE ON SCHEMA sentinela_ambiente TO sentinela_exclusao_owner, sentinela_general_importer,
  sentinela_gestao_autoridade, sentinela_gestao_owner, sentinela_manual_reader, sentinela_manual_writer,
  sentinela_ocorrencias_reader, sentinela_pcdf_historico_owner, sentinela_pcdf_owner, sentinela_pessoas_owner,
  sentinela_local_admin, sentinela_local_operator, sentinela_local_analyst;
-- The application connects with service credentials scoped to its profile. Tie their
-- requests to the corresponding active Auth session and institutional user.
CREATE FUNCTION sentinela_ambiente.ator_operacional() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT u.id
  FROM auth.sessions s
  JOIN auth.users a ON a.id = s.user_id
  JOIN sentinela.usuarios u ON u.auth_user_id = a.id
  JOIN sentinela.perfil_permissoes pp ON pp.perfil = u.perfil AND pp.acao = 'consultar_analises'
  WHERE s.id = CASE
      WHEN current_setting('sentinela.import_session',true) ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN current_setting('sentinela.import_session',true)::uuid END
    AND (s.not_after IS NULL OR s.not_after > statement_timestamp())
    AND u.ativo AND coalesce(a.raw_app_meta_data->>'sentinela_onboarding','complete') = 'complete'
    AND u.perfil = CASE SESSION_USER WHEN 'sentinela_local_admin' THEN 'Administrador'
                                    WHEN 'sentinela_local_operator' THEN 'Operador'
                                    WHEN 'sentinela_local_analyst' THEN 'Analista' END
    AND sentinela_ambiente.vinculado()
$$;
REVOKE ALL ON FUNCTION sentinela_ambiente.ator_operacional() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sentinela_ambiente.ator_operacional()
 TO sentinela_local_admin, sentinela_local_operator, sentinela_local_analyst,
    sentinela_manual_writer, sentinela_pessoas_owner;
CREATE FUNCTION sentinela_ambiente.ator_importacao() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT u.id FROM sentinela.usuarios u
  JOIN sentinela.perfil_permissoes pp ON pp.perfil = u.perfil AND pp.acao = 'importar'
  WHERE session_user IN ('sentinela_local_admin','sentinela_local_operator')
    AND u.id = sentinela_ambiente.ator_operacional()
$$;
REVOKE ALL ON FUNCTION sentinela_ambiente.ator_importacao() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sentinela_ambiente.ator_importacao()
 TO sentinela_local_admin, sentinela_local_operator, sentinela_pcdf_owner,
    sentinela_general_importer, sentinela_gestao_autoridade;
-- Last: the schema itself passes to its owner role (the migrator keeps only USAGE, granted above).
ALTER SCHEMA sentinela_ambiente OWNER TO sentinela_ambiente_owner;
-- Objects owned by the migrator call the binding at run time: the new owner grants it USAGE explicitly.
SET LOCAL ROLE sentinela_ambiente_owner;
GRANT USAGE ON SCHEMA sentinela_ambiente TO postgres;
RESET ROLE;


DO $$
BEGIN
  IF NOT sentinela_ambiente.vinculado() OR sentinela_ambiente.instalacao() IS NULL THEN
    RAISE EXCEPTION 'Ligação de ambiente não confirmada.';
  END IF;
END $$;

INSERT INTO sentinela.schema_migrations VALUES ('0009','Importador: papéis e ligação de ambiente hospedado',DEFAULT)
ON CONFLICT DO NOTHING;
COMMIT;
