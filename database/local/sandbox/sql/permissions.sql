SELECT 1 / (coalesce((inet_server_port()=55432 AND current_database()='sentinela_rls_sandbox' AND current_setting('sentinela.sandbox_uuid',true)=:'sandbox_uuid' AND abs(extract(epoch from pg_postmaster_start_time())::bigint - :'sandbox_start'::bigint)<3),false)::integer);
-- Manual phase 1 only. No fixtures, credentials or stored functions. Always ROLLBACK.
-- Run directly as sentinela_local_reader with psql -X -W, never via SET ROLE.
\set ON_ERROR_STOP on
BEGIN READ WRITE;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='2s';
SET LOCAL search_path=pg_catalog;
DO $$
DECLARE probe text; row record; positives integer=0; denials integer=0;
BEGIN
 IF session_user<>'sentinela_local_reader' OR current_user<>session_user
 OR current_database()<>'sentinela_rls_sandbox'
 OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
 OR inet_server_port() IS DISTINCT FROM 55432 THEN
  RAISE EXCEPTION 'FAIL: authenticated identity or local endpoint mismatch';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND
  (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit OR NOT rolcanlogin OR rolconnlimit<>5))
 OR EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname=current_user) OR member=(SELECT oid FROM pg_roles WHERE rolname=current_user))
 OR EXISTS(SELECT 1 FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) THEN
  RAISE EXCEPTION 'FAIL: unexpected role attributes, membership or ownership';
 END IF;
 IF (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r' AND relrowsecurity AND relforcerowsecurity)<>19
 OR (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='sentinela'::regnamespace)<>6 THEN
  RAISE EXCEPTION 'FAIL: RLS or policy drift';
 END IF;
 FOREACH probe IN ARRAY ARRAY['SELECT id,origem,fonte,ano_registro,unidade_registro,numero_registro,versao_identidade,identidade_status,data_fato,horario_fato,ra_id,local,latitude,longitude,localizacao_status,consolidacao_status,ativo,versao,criado_em,atualizado_em FROM sentinela.ocorrencias LIMIT 0','SELECT id,ocorrencia_id,natureza_id,origem,crime_tentado,classificacao_status,mapeamento_id FROM sentinela.ocorrencia_naturezas LIMIT 0','SELECT id,fonte,descricao_original,categoria_pcdf_original FROM sentinela.naturezas_criminais LIMIT 0','SELECT id,codigo_interno,nome,versao_catalogo,status FROM sentinela.categorias_criminais LIMIT 0','SELECT id,natureza_id,versao,crime_tentado,categoria_id,status FROM sentinela.mapeamentos_natureza LIMIT 0','SELECT id,codigo_interno,codigo_oficial,nome,versao_catalogo,vigencia FROM sentinela.regioes_administrativas LIMIT 0'] LOOP
  EXECUTE probe; positives=positives+1;
 END LOOP;
 FOREACH probe IN ARRAY ARRAY['SELECT evidencia_homologacao FROM sentinela.categorias_criminais LIMIT 0','SELECT evidencia_homologacao FROM sentinela.mapeamentos_natureza LIMIT 0','SELECT linha_origem_id FROM sentinela.ocorrencia_naturezas LIMIT 0','SELECT versao FROM sentinela.ocorrencia_naturezas LIMIT 0','SELECT criado_em FROM sentinela.ocorrencia_naturezas LIMIT 0','SELECT atualizado_em FROM sentinela.ocorrencia_naturezas LIMIT 0','SELECT evidencia_identidade FROM sentinela.ocorrencias LIMIT 0','SELECT flagrante FROM sentinela.ocorrencias LIMIT 0','SELECT unidade_apuracao FROM sentinela.ocorrencias LIMIT 0','SELECT referencia_espacial_confirmada FROM sentinela.ocorrencias LIMIT 0','SELECT regra_transformacao FROM sentinela.ocorrencias LIMIT 0','SELECT geometria FROM sentinela.ocorrencias LIMIT 0','SELECT versao_cartografia FROM sentinela.regioes_administrativas LIMIT 0','SELECT evidencia_referencia_espacial FROM sentinela.regioes_administrativas LIMIT 0','SELECT limite FROM sentinela.regioes_administrativas LIMIT 0','INSERT INTO sentinela.ocorrencias (id) SELECT NULL::uuid WHERE false','UPDATE sentinela.ocorrencias SET id=id WHERE false','DELETE FROM sentinela.ocorrencias WHERE false','INSERT INTO sentinela.ocorrencia_naturezas (id) SELECT NULL::uuid WHERE false','UPDATE sentinela.ocorrencia_naturezas SET id=id WHERE false','DELETE FROM sentinela.ocorrencia_naturezas WHERE false','INSERT INTO sentinela.naturezas_criminais (id) SELECT NULL::uuid WHERE false','UPDATE sentinela.naturezas_criminais SET id=id WHERE false','DELETE FROM sentinela.naturezas_criminais WHERE false','INSERT INTO sentinela.categorias_criminais (id) SELECT NULL::uuid WHERE false','UPDATE sentinela.categorias_criminais SET id=id WHERE false','DELETE FROM sentinela.categorias_criminais WHERE false','INSERT INTO sentinela.mapeamentos_natureza (id) SELECT NULL::uuid WHERE false','UPDATE sentinela.mapeamentos_natureza SET id=id WHERE false','DELETE FROM sentinela.mapeamentos_natureza WHERE false','INSERT INTO sentinela.regioes_administrativas (id) SELECT NULL::uuid WHERE false','UPDATE sentinela.regioes_administrativas SET id=id WHERE false','DELETE FROM sentinela.regioes_administrativas WHERE false'] LOOP
  BEGIN
   EXECUTE probe;
   RAISE EXCEPTION 'FAIL: prohibited statement succeeded';
  EXCEPTION WHEN insufficient_privilege THEN denials=denials+1;
  END;
 END LOOP;
 FOR row IN SELECT relname FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r'
 AND relname NOT IN ('ocorrencias','ocorrencia_naturezas','naturezas_criminais','categorias_criminais','mapeamentos_natureza','regioes_administrativas') LOOP
  BEGIN
   EXECUTE format('SELECT * FROM sentinela.%I LIMIT 0',row.relname);
   RAISE EXCEPTION 'FAIL: internal table readable';
  EXCEPTION WHEN insufficient_privilege THEN denials=denials+1;
  END;
 END LOOP;
 FOREACH probe IN ARRAY ARRAY[
  format('CREATE SCHEMA %I','sentinela_denied_'||pg_backend_pid()),
  format('CREATE TABLE public.%I(id integer)','sentinela_denied_'||pg_backend_pid()),
  format('CREATE TEMP TABLE %I(id integer)','sentinela_denied_'||pg_backend_pid())] LOOP
  BEGIN
   EXECUTE probe;
   RAISE EXCEPTION 'FAIL: DDL unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN denials=denials+1;
  END;
 END LOOP;
 RAISE NOTICE 'PASS phase 1 SQL: % projections, % permission denials. RLS row filtering NOT certified.',positives,denials;
END $$;
ROLLBACK;
