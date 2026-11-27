SELECT current_database() = 'sentinela_dev_operacional'
 AND host(inet_server_addr()) = '127.0.0.1'
 AND inet_server_port() = 5432
 AND current_user = 'postgres' AND session_user = 'postgres'
 AND (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
 AND (SELECT system_identifier::text FROM pg_control_system()) = $1
 AND current_setting('server_version_num')::int BETWEEN 170011 AND 179999
 AND current_setting('server_encoding') = 'UTF8'
 AND current_setting('session_replication_role') = 'origin'
 AND obj_description(to_regnamespace('sentinela'), 'pg_namespace') =
     'sentinela:supabase-baseline-v1:logical-0001-0005'
 AND NOT EXISTS (SELECT FROM pg_event_trigger)
 AND NOT EXISTS (SELECT FROM pg_namespace WHERE nspname IN ('auth','sentinela_api','sentinela_private'))
 AND EXISTS (
   SELECT FROM pg_extension WHERE extname = 'postgis'
   AND extnamespace = 'extensions'::regnamespace AND extversion = $2
 ) AS ok;
