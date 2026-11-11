SELECT 1 / (coalesce((inet_server_port()=55432 AND current_database()='sentinela_rls_sandbox' AND current_setting('sentinela.sandbox_uuid',true)=:'sandbox_uuid' AND abs(extract(epoch from pg_postmaster_start_time())::bigint - :'sandbox_start'::bigint)<3),false)::integer);
-- Prepared only. Direct authenticated reader; isolated cluster 55432 ONLY.
-- No fixtures or configuration are installed by this file.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='2s';
SET LOCAL search_path=pg_catalog;
DO $$
DECLARE actual jsonb;
BEGIN
 IF current_user<>'sentinela_local_reader' OR session_user<>current_user
 OR current_database()<>'sentinela_rls_sandbox'
 OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
 OR inet_server_port() IS DISTINCT FROM 55432 THEN
  RAISE EXCEPTION 'FAIL: isolated authenticated endpoint required';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND
  (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit OR NOT rolcanlogin))
 OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user) OR roleid=(SELECT oid FROM pg_roles WHERE rolname=current_user)) THEN
  RAISE EXCEPTION 'FAIL: unsafe reader role';
 END IF;
 IF (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r' AND relrowsecurity AND relforcerowsecurity)<>19
 OR (SELECT count(*) FROM pg_policies WHERE schemaname='sentinela')<>6 THEN
  RAISE EXCEPTION 'FAIL: RLS or policy count drift';
 END IF;
 SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) INTO actual FROM sentinela.regioes_administrativas;
 IF actual<> '["10000000-0000-4000-8000-000000000001"]'::jsonb THEN RAISE EXCEPTION 'FAIL RLS UUID set: regioes_administrativas'; END IF;
 SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) INTO actual FROM sentinela.categorias_criminais;
 IF actual<> '["20000000-0000-4000-8000-000000000001"]'::jsonb THEN RAISE EXCEPTION 'FAIL RLS UUID set: categorias_criminais'; END IF;
 SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) INTO actual FROM sentinela.naturezas_criminais;
 IF actual<> '["30000000-0000-4000-8000-000000000001"]'::jsonb THEN RAISE EXCEPTION 'FAIL RLS UUID set: naturezas_criminais'; END IF;
 SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) INTO actual FROM sentinela.mapeamentos_natureza;
 IF actual<> '["40000000-0000-4000-8000-000000000001"]'::jsonb THEN RAISE EXCEPTION 'FAIL RLS UUID set: mapeamentos_natureza'; END IF;
 SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) INTO actual FROM sentinela.ocorrencias;
 IF actual<> '["50000000-0000-4000-8000-000000000001"]'::jsonb THEN RAISE EXCEPTION 'FAIL RLS UUID set: ocorrencias'; END IF;
 SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) INTO actual FROM sentinela.ocorrencia_naturezas;
 IF actual<> '["60000000-0000-4000-8000-000000000001"]'::jsonb THEN RAISE EXCEPTION 'FAIL RLS UUID set: ocorrencia_naturezas'; END IF;
 SELECT coalesce(jsonb_agg(a.id ORDER BY a.id),'[]'::jsonb) INTO actual
 FROM sentinela.ocorrencia_naturezas a
 JOIN sentinela.ocorrencias o ON o.id=a.ocorrencia_id
 JOIN sentinela.naturezas_criminais n ON n.id=a.natureza_id
 JOIN sentinela.mapeamentos_natureza m ON m.id=a.mapeamento_id
 JOIN sentinela.categorias_criminais c ON c.id=m.categoria_id
 JOIN sentinela.regioes_administrativas r ON r.id=o.ra_id;
 IF actual<> '["60000000-0000-4000-8000-000000000001"]'::jsonb THEN
  RAISE EXCEPTION 'FAIL: visible relationship chain';
 END IF;
 RAISE NOTICE 'PASS: six exact visible UUID sets and relationship chain. Administrative fixture and policy attestation required separately.';
END $$;
ROLLBACK;
