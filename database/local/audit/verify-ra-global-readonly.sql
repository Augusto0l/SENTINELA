-- FUTURE ONLY: requires separate explicit authorization for this existing executor.
-- Never grant privileges or change the reader to make this script work.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path=pg_catalog;
SELECT 1 / coalesce((
 current_database()='sentinela_dev_operacional' AND host(inet_server_addr())='127.0.0.1'
 AND inet_server_port()=5432 AND current_setting('transaction_read_only')='on'
 AND (SELECT system_identifier::text FROM pg_control_system())='7702156035351602692'
 AND (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user)
 AND (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='sentinela.regioes_administrativas'::regclass)
 AND NOT row_security_active('sentinela.regioes_administrativas'::regclass)
),false)::integer AS authorized_global_read_guard;
SELECT jsonb_build_object('executor',current_user,'database',current_database(),
 'host',host(inet_server_addr()),'port',inet_server_port(),
 'system_identifier',(SELECT system_identifier::text FROM pg_control_system()),
 'transaction_read_only',current_setting('transaction_read_only'),
 'scope','global-count-not-filtered-by-rls',
 'catalog_total',(SELECT count(*) FROM sentinela.regioes_administrativas),
 'ledger',(SELECT jsonb_agg(versao ORDER BY versao) FROM sentinela.schema_migrations));
COMMIT;
