-- Server-derived identity: privileged installer only. Manifest is read by the server itself.
\set ON_ERROR_STOP on
SET search_path=pg_catalog;
SELECT 1 / (coalesce((current_user='postgres' AND current_database()='postgres'
 AND host(inet_server_addr())='127.0.0.1' AND inet_server_port()=55432
 AND current_setting('server_version')='17.11'
 AND current_setting('sentinela.sandbox_uuid',true)=:'sandbox_uuid'
 AND (SELECT system_identifier::text FROM pg_control_system())=:'sandbox_systemid'
 AND replace(current_setting('data_directory'),E'\\','/')=replace(:'sandbox_data',E'\\','/')
 AND (pg_read_file('sentinela-sandbox.json')::jsonb->>'kind')='sentinela-rls-disposable-v1'
 AND (pg_read_file('sentinela-sandbox.json')::jsonb->>'uuid')=:'sandbox_uuid'
 AND (pg_read_file('sentinela-sandbox.json')::jsonb->>'system_id')=:'sandbox_systemid'
 AND (pg_read_file('sentinela-sandbox.json')::jsonb->>'database')='sentinela_rls_sandbox'
 AND (pg_read_file('sentinela-sandbox.json')::jsonb->>'data')=:'sandbox_data'
 AND NOT pg_is_in_recovery()),false)::integer);
