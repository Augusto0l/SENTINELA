-- Run inside the transaction opened by install.mjs.
DO $guard$
BEGIN
  IF current_database() <> 'sentinela_sprint4_homologacao'
     OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1' OR inet_server_port() IS DISTINCT FROM 55473
     OR session_user <> 'sprint4_migration' OR current_user <> session_user
     OR current_setting('cluster_name') <> 'sentinela-sprint4-homologacao'
     OR current_setting('listen_addresses') <> '127.0.0.1'
     OR current_setting('server_version_num') <> '170011'
     OR (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) <> '7709847064550752852'
     OR (SELECT array_agg(versao ORDER BY versao) FROM sentinela.schema_migrations)
       IS DISTINCT FROM ARRAY['0001','0002','0003','0004','0005','homolog-persist-0001'] THEN
    RAISE EXCEPTION 'Destino ou ledger de homologacao recusado';
  END IF;
END;
$guard$;
SELECT pg_advisory_xact_lock(743204, 41);

GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO
  sprint4_homolog_admin_read,sprint4_homolog_operator_read,sprint4_homolog_analyst_read;
CREATE OR REPLACE FUNCTION sentinela_homologacao.system_identifier() RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $identity$
  SELECT system_identifier::text FROM pg_catalog.pg_control_system()
$identity$;
REVOKE ALL ON FUNCTION sentinela_homologacao.system_identifier() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_homologacao.system_identifier() TO
  sprint4_homolog_admin_read,sprint4_homolog_operator_read,sprint4_homolog_analyst_read;

INSERT INTO sentinela.schema_migrations (versao,descricao)
VALUES ('homolog-persist-0002','Atestacao de identidade sob o login de leitura, sem elevacao');
