-- LOCAL CLUSTER operation; separate explicit authorization required. No password here.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog;
SELECT pg_advisory_xact_lock(743204,23);
\ir ../sql/preflight.sql
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sentinela_local_reader') THEN
    RAISE EXCEPTION 'Role already exists; never alter or reuse it automatically.';
  END IF;
END $$;
CREATE ROLE sentinela_local_reader NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB
  NOCREATEROLE NOREPLICATION NOINHERIT CONNECTION LIMIT 5 PASSWORD NULL;
-- No memberships, ownership or application grants. LOGIN/password are separate operations.
COMMIT;
