-- EXPERIMENTAL SANDBOX ONLY. Never an operational migration.
\ir ../sandbox/sql/guard.sql
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $$ BEGIN
  IF current_database()<>'sentinela_rls_sandbox' OR inet_server_port()<>55432
    OR host(inet_server_addr())<>'127.0.0.1' OR current_user<>'postgres'
    OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='sentinela_write_lab')
    OR EXISTS(SELECT 1 FROM sentinela.ocorrencias) THEN
    RAISE EXCEPTION 'Fresh isolated write sandbox required';
  END IF;
END $$;
CREATE ROLE sentinela_sbx_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
CREATE ROLE sentinela_sbx_admin LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT CONNECTION LIMIT 3;
CREATE ROLE sentinela_sbx_operator LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT CONNECTION LIMIT 3;
CREATE ROLE sentinela_sbx_analyst LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT CONNECTION LIMIT 2;
CREATE SCHEMA sentinela_write_lab;
REVOKE ALL ON SCHEMA sentinela_write_lab FROM PUBLIC;
GRANT USAGE ON SCHEMA sentinela_write_lab TO sentinela_sbx_owner,sentinela_sbx_admin,sentinela_sbx_operator,sentinela_sbx_analyst;
GRANT CONNECT ON DATABASE sentinela_rls_sandbox TO sentinela_sbx_admin,sentinela_sbx_operator,sentinela_sbx_analyst;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO sentinela_sbx_owner,sentinela_sbx_admin,sentinela_sbx_operator,sentinela_sbx_analyst;
CREATE TABLE sentinela_write_lab.identity(uuid uuid PRIMARY KEY,system_id text NOT NULL);
INSERT INTO sentinela_write_lab.identity VALUES(current_setting('sentinela.sandbox_uuid')::uuid,(SELECT system_identifier::text FROM pg_control_system()));
ALTER TABLE sentinela_write_lab.identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_write_lab.identity FORCE ROW LEVEL SECURITY;
GRANT SELECT ON sentinela_write_lab.identity TO sentinela_sbx_owner,sentinela_sbx_admin,sentinela_sbx_operator,sentinela_sbx_analyst;
CREATE POLICY identity_read ON sentinela_write_lab.identity FOR SELECT TO sentinela_sbx_owner,sentinela_sbx_admin,sentinela_sbx_operator,sentinela_sbx_analyst USING(true);
CREATE TABLE sentinela_write_lab.commands(actor text NOT NULL,key uuid NOT NULL,digest text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(actor,key));
ALTER TABLE sentinela_write_lab.commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_write_lab.commands FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON sentinela_write_lab.commands TO sentinela_sbx_owner;
CREATE POLICY command_read ON sentinela_write_lab.commands FOR SELECT TO sentinela_sbx_owner USING(actor=session_user::text);
CREATE POLICY command_insert ON sentinela_write_lab.commands FOR INSERT TO sentinela_sbx_owner WITH CHECK(actor=session_user::text);
GRANT USAGE ON SCHEMA sentinela,extensions TO sentinela_sbx_owner;
GRANT USAGE ON TYPE sentinela.texto_obrigatorio TO sentinela_sbx_owner;
GRANT SELECT ON sentinela.regioes_administrativas,sentinela.naturezas_criminais,sentinela.ocorrencias TO sentinela_sbx_owner;
GRANT INSERT(id,origem,fonte,versao_identidade,identidade_status,data_fato,horario_fato,ra_id,local,latitude,longitude,localizacao_status,consolidacao_status)
  ON sentinela.ocorrencias TO sentinela_sbx_owner;
GRANT INSERT(id,ocorrencia_id,natureza_id,origem,crime_tentado,classificacao_status) ON sentinela.ocorrencia_naturezas TO sentinela_sbx_owner;
GRANT INSERT(id,ator_tipo,servico,acao,ocorrencia_id,antes,depois,justificativa,request_id) ON sentinela.eventos_auditoria TO sentinela_sbx_owner;
CREATE POLICY sbx_ra_read ON sentinela.regioes_administrativas FOR SELECT TO sentinela_sbx_owner USING(versao_catalogo='SENTINELA_WRITE_SANDBOX_V1');
CREATE POLICY sbx_nature_read ON sentinela.naturezas_criminais FOR SELECT TO sentinela_sbx_owner USING(fonte='SENTINELA_WRITE_SANDBOX_V1');
CREATE POLICY sbx_occ_read ON sentinela.ocorrencias FOR SELECT TO sentinela_sbx_owner USING(fonte='SENTINELA_WRITE_SANDBOX_V1');
CREATE POLICY sbx_occ_insert ON sentinela.ocorrencias FOR INSERT TO sentinela_sbx_owner WITH CHECK(
  fonte='SENTINELA_WRITE_SANDBOX_V1' AND origem='manual' AND identidade_status='manual'
  AND consolidacao_status='em_revisao' AND localizacao_status='referencia_pendente' AND ativo
  AND session_user IN ('sentinela_sbx_admin','sentinela_sbx_operator'));
CREATE POLICY sbx_link_insert ON sentinela.ocorrencia_naturezas FOR INSERT TO sentinela_sbx_owner WITH CHECK(
  origem='manual' AND linha_origem_id IS NULL AND classificacao_status='pendente' AND mapeamento_id IS NULL
  AND EXISTS(SELECT 1 FROM sentinela.ocorrencias o WHERE o.id=ocorrencia_id)
  AND EXISTS(SELECT 1 FROM sentinela.naturezas_criminais n WHERE n.id=natureza_id));
CREATE POLICY sbx_audit_insert ON sentinela.eventos_auditoria FOR INSERT TO sentinela_sbx_owner WITH CHECK(
  ator_tipo='servico' AND usuario_id IS NULL AND servico=session_user::text AND acao='sandbox.cadastro'
  AND antes IS NULL AND EXISTS(SELECT 1 FROM sentinela.ocorrencias o WHERE o.id=ocorrencia_id));
-- Native, unchanged baseline triggers run under the restricted function owner.
GRANT EXECUTE ON FUNCTION sentinela.validar_associacao_mapeada(),sentinela.carimbar_auditoria(),sentinela.validar_vinculos_evento(),sentinela.bloquear_autoria_manual_sem_auth() TO sentinela_sbx_owner;
-- PL/pgSQL may plan the mapping lookup even for an unmapped association.
-- Only the NOLOGIN function owner gets the columns used by that lookup.
-- Existing RLS still denies mapping and category rows to this role.
GRANT SELECT (id,natureza_id,categoria_id,status,crime_tentado) ON sentinela.mapeamentos_natureza TO sentinela_sbx_owner;
GRANT SELECT (id,status) ON sentinela.categorias_criminais TO sentinela_sbx_owner;
-- The association trigger can plan the lineage check even for a manual row.
-- RLS remains default-deny for this role on both lineage tables.
GRANT SELECT (id,extracao_id) ON sentinela.linhas_origem TO sentinela_sbx_owner;
GRANT SELECT (id,fonte) ON sentinela.extracoes_origem TO sentinela_sbx_owner;
-- The audit trigger also plans these nullable lineage checks.
GRANT SELECT (ocorrencia_id,linha_origem_id) ON sentinela.ocorrencia_naturezas TO sentinela_sbx_owner;
GRANT SELECT (id,extracao_id) ON sentinela.execucoes_importacao TO sentinela_sbx_owner;

CREATE FUNCTION sentinela_write_lab.cadastrar(p_body jsonb,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_id uuid:=gen_random_uuid();v_event uuid:=gen_random_uuid();v_hash text;prior record;item jsonb;ra record;result jsonb;
BEGIN
  IF current_database()<>'sentinela_rls_sandbox' OR inet_server_port()<>55432
    OR host(inet_server_addr())<>'127.0.0.1' OR session_user NOT IN ('sentinela_sbx_admin','sentinela_sbx_operator')
    OR NOT EXISTS(SELECT 1 FROM sentinela_write_lab.identity i WHERE i.uuid=current_setting('sentinela.sandbox_uuid')::uuid
      AND i.system_id=(SELECT system_identifier::text FROM pg_control_system())) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Sandbox identity required';
  END IF;
  IF p_key IS NULL OR jsonb_typeof(p_body)<>'object' OR p_body IS NULL
    OR (p_body - ARRAY['data','horario','raId','local','coordenadas','naturezas'])<>'{}'::jsonb
    OR NOT(p_body ?& ARRAY['data','horario','raId','local','coordenadas','naturezas'])
    OR jsonb_typeof(p_body->'data')<>'string' OR jsonb_typeof(p_body->'horario')<>'string'
    OR jsonb_typeof(p_body->'raId')<>'string' OR jsonb_typeof(p_body->'local')<>'string'
    OR jsonb_typeof(p_body->'coordenadas')<>'object' OR jsonb_typeof(p_body->'naturezas')<>'array'
    OR length(btrim(p_body->>'local')) NOT BETWEEN 5 AND 240
    OR jsonb_array_length(p_body->'naturezas') NOT BETWEEN 1 AND 100
    OR (p_body->>'horario')!~'^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'
    OR (p_body->>'data')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR NOT isfinite((p_body->>'data')::date) OR extract(year FROM (p_body->>'data')::date) NOT BETWEEN 1900 AND 9999
    OR ((p_body->'coordenadas') - ARRAY['latitude','longitude'])<>'{}'::jsonb
    OR NOT(p_body->'coordenadas' ?& ARRAY['latitude','longitude'])
    OR jsonb_typeof(p_body->'coordenadas'->'latitude')<>'number' OR jsonb_typeof(p_body->'coordenadas'->'longitude')<>'number'
    OR NOT((p_body->'coordenadas'->>'latitude')::float8 BETWEEN -90 AND 90)
    OR NOT((p_body->'coordenadas'->>'longitude')::float8 BETWEEN -180 AND 180) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid sandbox payload';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_body->'naturezas') x
    WHERE jsonb_typeof(x)<>'object' OR (x - ARRAY['naturezaId','crimeTentado'])<>'{}'::jsonb
      OR NOT(x ?& ARRAY['naturezaId','crimeTentado']) OR jsonb_typeof(x->'naturezaId')<>'string'
      OR jsonb_typeof(x->'crimeTentado') NOT IN ('boolean','null'))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_body->'naturezas') x GROUP BY (x->>'naturezaId')::uuid,x->'crimeTentado' HAVING count(*)>1) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid nature links';
  END IF;
  v_hash:=encode(sha256(convert_to(p_body::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(session_user::text||p_key::text,0));
  SELECT * INTO prior FROM sentinela_write_lab.commands WHERE actor=session_user::text AND key=p_key;
  IF FOUND THEN
    IF prior.digest<>v_hash THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='Idempotency conflict'; END IF;
    RETURN prior.result;
  END IF;
  SELECT * INTO ra FROM sentinela.regioes_administrativas WHERE id=(p_body->>'raId')::uuid AND (p_body->>'data')::date <@ vigencia;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23503',MESSAGE='Region unavailable'; END IF;
  -- This is a marked synthetic test boundary, never official DF cartography.
  IF ra.limite IS NULL OR NOT extensions.ST_Covers(ra.limite,extensions.ST_SetSRID(extensions.ST_MakePoint(
    (p_body->'coordenadas'->>'longitude')::float8,(p_body->'coordenadas'->>'latitude')::float8),4326)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Outside synthetic test boundary';
  END IF;
  INSERT INTO sentinela.ocorrencias(id,origem,fonte,versao_identidade,identidade_status,data_fato,horario_fato,ra_id,local,latitude,longitude,localizacao_status,consolidacao_status)
  VALUES(v_id,'manual','SENTINELA_WRITE_SANDBOX_V1','SANDBOX-MANUAL-V1','manual',(p_body->>'data')::date,(p_body->>'horario')::time,
    (p_body->>'raId')::uuid,p_body->>'local',(p_body->'coordenadas'->>'latitude')::float8,(p_body->'coordenadas'->>'longitude')::float8,'referencia_pendente','em_revisao');
  FOR item IN SELECT value FROM jsonb_array_elements(p_body->'naturezas') LOOP
    -- Missing nature raises after parent INSERT: the transaction must roll it back.
    IF NOT EXISTS(SELECT 1 FROM sentinela.naturezas_criminais WHERE id=(item->>'naturezaId')::uuid) THEN
      RAISE EXCEPTION USING ERRCODE='23503',MESSAGE='Nature unavailable';
    END IF;
    INSERT INTO sentinela.ocorrencia_naturezas(id,ocorrencia_id,natureza_id,origem,crime_tentado,classificacao_status)
      VALUES(gen_random_uuid(),v_id,(item->>'naturezaId')::uuid,'manual',(item->>'crimeTentado')::boolean,'pendente');
  END LOOP;
  result:=jsonb_build_object('id',v_id,'versao','1','auditId',v_event,'atorSintetico',session_user::text,
    'localizacaoStatus','referencia_pendente','consolidacaoStatus','em_revisao','naturezas',p_body->'naturezas');
  INSERT INTO sentinela.eventos_auditoria(id,ator_tipo,servico,acao,ocorrencia_id,antes,depois,justificativa,request_id)
    VALUES(v_event,'servico',session_user::text,'sandbox.cadastro',v_id,NULL,
      jsonb_build_object('ocorrencia',result,'entradaSintetica',p_body),'Ensaio sintetico isolado; nao representa autoria humana',p_key::text);
  INSERT INTO sentinela_write_lab.commands VALUES(session_user::text,p_key,v_hash,result);
  RETURN result;
END $$;
ALTER FUNCTION sentinela_write_lab.cadastrar(jsonb,uuid) OWNER TO sentinela_sbx_owner;
REVOKE ALL ON FUNCTION sentinela_write_lab.cadastrar(jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_write_lab.cadastrar(jsonb,uuid) TO sentinela_sbx_admin,sentinela_sbx_operator;
-- Fixture catalogs, not official RA/crime catalogs. No existing data is reused.
INSERT INTO sentinela.regioes_administrativas(id,codigo_interno,nome,versao_catalogo,vigencia,limite,versao_cartografia,evidencia_referencia_espacial)
VALUES('11000000-0000-4000-8000-000000000001','SBX-ONLY','Regiao SINTETICA de ensaio','SENTINELA_WRITE_SANDBOX_V1',daterange('2020-01-01','2030-01-01','[)'),
  extensions.ST_Multi(extensions.ST_GeomFromText('POLYGON((-48.3 -16.2,-47.3 -16.2,-47.3 -15.4,-48.3 -15.4,-48.3 -16.2))',4326)),
  'SYNTHETIC-NOT-OFFICIAL','Retangulo sintetico: nao comprova pertencimento oficial ao DF');
INSERT INTO sentinela.naturezas_criminais(id,fonte,descricao_original) VALUES
 ('31000000-0000-4000-8000-000000000001','SENTINELA_WRITE_SANDBOX_V1','Natureza SINTETICA A'),
 ('31000000-0000-4000-8000-000000000002','SENTINELA_WRITE_SANDBOX_V1','Natureza SINTETICA B');
COMMIT;
