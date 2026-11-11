\ir guard.sql
-- psql encrypts the password client-side and reads it without echo. No secret SQL on disk.
SELECT 1/(coalesce((SELECT NOT rolcanlogin AND rolpassword IS NULL FROM pg_authid WHERE rolname='sentinela_local_reader'),false)::integer);
\password sentinela_local_reader
SELECT 1/(coalesce((SELECT rolpassword LIKE 'SCRAM-SHA-256$%' FROM pg_authid WHERE rolname='sentinela_local_reader'),false)::integer);
ALTER ROLE sentinela_local_reader LOGIN;
