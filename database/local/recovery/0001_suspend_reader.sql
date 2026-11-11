-- Future incident containment, NOT destructive rollback or automatic restoration.
-- Requires specific authorization for the global ALTER ROLE. Stop/close the app pool first.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF current_database()<>'sentinela_dev_operacional'
    OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
    OR inet_server_port() IS DISTINCT FROM 5432 OR current_user<>'postgres'
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sentinela_local_reader')
    OR NOT EXISTS(SELECT 1 FROM sentinela.schema_migrations WHERE versao='local-read-0001') THEN
    RAISE EXCEPTION 'Unexpected local recovery target or installation state.';
  END IF;
END $$;
ALTER ROLE sentinela_local_reader NOLOGIN;
REVOKE CONNECT ON DATABASE sentinela_dev_operacional FROM sentinela_local_reader;
REVOKE USAGE ON SCHEMA sentinela FROM sentinela_local_reader;
-- Policies and ledger remain as evidence; no DROP, CASCADE or historic ledger deletion.
-- No other database, HBA, password, data or baseline object is changed.
-- NOLOGIN does not terminate existing sessions; revocation does not undo running transactions.
COMMIT;
