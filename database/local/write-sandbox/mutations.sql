-- Incremental EXPERIMENTAL evolution. Only a freshly attested disposable cluster.
\ir ../sandbox/sql/guard.sql
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $$ BEGIN
 IF current_database()<>'sentinela_rls_sandbox' OR inet_server_port()<>55432
 OR host(inet_server_addr())<>'127.0.0.1' OR current_user<>'postgres'
 OR NOT EXISTS(SELECT FROM sentinela_write_lab.identity WHERE uuid=current_setting('sentinela.sandbox_uuid')::uuid
 AND system_id=(SELECT system_identifier::text FROM pg_control_system()))
 OR EXISTS(SELECT FROM pg_roles WHERE rolname='sentinela_sbx_mutator')
 THEN RAISE EXCEPTION 'Fresh mutation sandbox required'; END IF;
END $$;
CREATE ROLE sentinela_sbx_mutator NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
GRANT USAGE ON SCHEMA sentinela_write_lab,sentinela,extensions TO sentinela_sbx_mutator;
GRANT USAGE ON TYPE sentinela.texto_obrigatorio TO sentinela_sbx_mutator;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO sentinela_sbx_mutator;
GRANT SELECT ON sentinela_write_lab.identity TO sentinela_sbx_mutator;
CREATE POLICY identity_mutator ON sentinela_write_lab.identity FOR SELECT TO sentinela_sbx_mutator USING(true);

-- Transaction capability is writable only by the NOLOGIN function owner.
CREATE TABLE sentinela_write_lab.mutation_context(tx xid8 PRIMARY KEY,occ uuid NOT NULL);
CREATE TABLE sentinela_write_lab.retirements(
 association_id uuid PRIMARY KEY REFERENCES sentinela.ocorrencia_naturezas(id),
 occurrence_id uuid NOT NULL REFERENCES sentinela.ocorrencias(id),
 version bigint NOT NULL CHECK(version>1), actor text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), tx xid8 NOT NULL DEFAULT pg_current_xact_id());
CREATE TABLE sentinela_write_lab.mutation_history(
 id uuid PRIMARY KEY, occurrence_id uuid NOT NULL REFERENCES sentinela.ocorrencias(id),
 operation text NOT NULL CHECK(operation IN ('edit','inactivate')), actor text NOT NULL,
 old_version bigint NOT NULL,new_version bigint NOT NULL CHECK(new_version=old_version+1),
 before_row jsonb NOT NULL,after_row jsonb NOT NULL,before_links jsonb NOT NULL,after_links jsonb NOT NULL,
 changed_fields jsonb NOT NULL CHECK(jsonb_typeof(changed_fields)='array'),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 500),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), tx xid8 NOT NULL DEFAULT pg_current_xact_id(),
 UNIQUE(occurrence_id,new_version));
ALTER TABLE sentinela_write_lab.mutation_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_write_lab.mutation_context FORCE ROW LEVEL SECURITY;
ALTER TABLE sentinela_write_lab.retirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_write_lab.retirements FORCE ROW LEVEL SECURITY;
ALTER TABLE sentinela_write_lab.mutation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_write_lab.mutation_history FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE ON sentinela_write_lab.mutation_context TO sentinela_sbx_mutator;
GRANT SELECT,INSERT ON sentinela_write_lab.retirements,sentinela_write_lab.mutation_history TO sentinela_sbx_mutator;
CREATE POLICY context_only ON sentinela_write_lab.mutation_context TO sentinela_sbx_mutator USING(session_user IN ('sentinela_sbx_admin','sentinela_sbx_operator')) WITH CHECK(session_user IN ('sentinela_sbx_admin','sentinela_sbx_operator') AND tx=pg_current_xact_id());
CREATE POLICY retirement_read ON sentinela_write_lab.retirements FOR SELECT TO sentinela_sbx_mutator USING(session_user IN ('sentinela_sbx_admin','sentinela_sbx_operator'));
CREATE POLICY retirement_insert ON sentinela_write_lab.retirements FOR INSERT TO sentinela_sbx_mutator WITH CHECK(actor=session_user AND EXISTS(SELECT FROM sentinela_write_lab.mutation_context WHERE tx=pg_current_xact_id() AND occ=occurrence_id));
CREATE POLICY history_read ON sentinela_write_lab.mutation_history FOR SELECT TO sentinela_sbx_mutator
 USING(session_user='sentinela_sbx_admin' OR (session_user='sentinela_sbx_operator' AND actor=session_user AND tx=pg_current_xact_id()));
CREATE POLICY history_insert ON sentinela_write_lab.mutation_history FOR INSERT TO sentinela_sbx_mutator WITH CHECK(actor=session_user AND tx=pg_current_xact_id() AND EXISTS(SELECT FROM sentinela_write_lab.mutation_context WHERE tx=pg_current_xact_id() AND occ=occurrence_id));
CREATE FUNCTION sentinela_write_lab.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Immutable synthetic history'; END $$;
REVOKE ALL ON FUNCTION sentinela_write_lab.immutable() FROM PUBLIC;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON sentinela_write_lab.mutation_history FOR EACH STATEMENT EXECUTE FUNCTION sentinela_write_lab.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON sentinela_write_lab.retirements FOR EACH STATEMENT EXECUTE FUNCTION sentinela_write_lab.immutable();

GRANT SELECT ON sentinela.ocorrencias,sentinela.ocorrencia_naturezas,sentinela.regioes_administrativas,sentinela.naturezas_criminais,sentinela.pendencias_revisao TO sentinela_sbx_mutator;
GRANT UPDATE(data_fato,horario_fato,ra_id,local,latitude,longitude,ativo) ON sentinela.ocorrencias TO sentinela_sbx_mutator;
GRANT INSERT(id,ocorrencia_id,natureza_id,origem,crime_tentado,classificacao_status) ON sentinela.ocorrencia_naturezas TO sentinela_sbx_mutator;
CREATE POLICY mutation_occ_read ON sentinela.ocorrencias FOR SELECT TO sentinela_sbx_mutator USING(fonte='SENTINELA_WRITE_SANDBOX_V1');
CREATE POLICY mutation_occ_update ON sentinela.ocorrencias FOR UPDATE TO sentinela_sbx_mutator
 USING(fonte='SENTINELA_WRITE_SANDBOX_V1' AND origem='manual' AND EXISTS(SELECT FROM sentinela_write_lab.mutation_context WHERE tx=pg_current_xact_id() AND occ=id))
 WITH CHECK(fonte='SENTINELA_WRITE_SANDBOX_V1' AND origem='manual' AND identidade_status='manual' AND consolidacao_status='consolidada' AND session_user IN ('sentinela_sbx_admin','sentinela_sbx_operator'));
CREATE POLICY mutation_ra_read ON sentinela.regioes_administrativas FOR SELECT TO sentinela_sbx_mutator USING(versao_catalogo='SENTINELA_WRITE_SANDBOX_V1');
CREATE POLICY mutation_nature_read ON sentinela.naturezas_criminais FOR SELECT TO sentinela_sbx_mutator USING(fonte='SENTINELA_WRITE_SANDBOX_V1');
CREATE POLICY mutation_links_read ON sentinela.ocorrencia_naturezas FOR SELECT TO sentinela_sbx_mutator USING(EXISTS(SELECT FROM sentinela.ocorrencias o WHERE o.id=ocorrencia_id));
CREATE POLICY mutation_links_insert ON sentinela.ocorrencia_naturezas FOR INSERT TO sentinela_sbx_mutator WITH CHECK(origem='manual' AND linha_origem_id IS NULL AND classificacao_status='pendente' AND mapeamento_id IS NULL AND session_user IN ('sentinela_sbx_admin','sentinela_sbx_operator') AND EXISTS(SELECT FROM sentinela_write_lab.mutation_context WHERE tx=pg_current_xact_id() AND occ=ocorrencia_id) AND EXISTS(SELECT FROM sentinela.naturezas_criminais n WHERE n.id=natureza_id));
CREATE POLICY mutation_pending_read ON sentinela.pendencias_revisao FOR SELECT TO sentinela_sbx_mutator USING(EXISTS(SELECT FROM sentinela.ocorrencias o WHERE o.id=ocorrencia_id));
GRANT EXECUTE ON FUNCTION sentinela.atualizar_versao(),sentinela.proteger_identidade_ocorrencia(),sentinela.validar_associacao_mapeada() TO sentinela_sbx_mutator;
GRANT SELECT (id,natureza_id,categoria_id,status,crime_tentado) ON sentinela.mapeamentos_natureza TO sentinela_sbx_mutator;
GRANT SELECT (id,status) ON sentinela.categorias_criminais TO sentinela_sbx_mutator;
-- Match the association trigger's lineage dependencies without a SELECT policy.
GRANT SELECT (id,extracao_id) ON sentinela.linhas_origem TO sentinela_sbx_mutator;
GRANT SELECT (id,fonte) ON sentinela.extracoes_origem TO sentinela_sbx_mutator;

-- Same active statement trigger; no disable/drop and DELETE still always denied.
CREATE OR REPLACE FUNCTION sentinela.bloquear_correcao_sem_backend()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF current_user='sentinela_sbx_mutator' AND session_user IN ('sentinela_sbx_admin','sentinela_sbx_operator')
 AND TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='ocorrencias' AND TG_OP='UPDATE'
 AND current_database()='sentinela_rls_sandbox' AND inet_server_port()=55432 AND host(inet_server_addr())='127.0.0.1' THEN
   IF EXISTS(SELECT FROM sentinela_write_lab.mutation_context WHERE tx=pg_current_xact_id()) THEN RETURN NULL; END IF;
 END IF;
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Controlled mutation required';
END $$;
GRANT EXECUTE ON FUNCTION sentinela.bloquear_correcao_sem_backend() TO sentinela_sbx_mutator;

-- Deferred constraint runs at COMMIT, outside the SECURITY DEFINER command.
-- A separate guarded definer can READ history, never fabricate or insert it.
CREATE FUNCTION sentinela_write_lab.verify_technical_history(old_row jsonb,new_row jsonb) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT session_user IN ('sentinela_sbx_admin','sentinela_sbx_operator') AND current_database()='sentinela_rls_sandbox'
 AND inet_server_port()=55432 AND host(inet_server_addr())='127.0.0.1'
 AND EXISTS(SELECT FROM sentinela_write_lab.mutation_history h WHERE h.tx=pg_current_xact_id()
 AND h.actor=session_user AND h.occurrence_id=(old_row->>'id')::uuid
 AND h.old_version=(old_row->>'versao')::bigint AND h.new_version=(new_row->>'versao')::bigint
 AND h.before_row=old_row AND h.after_row=new_row);
$$;
ALTER FUNCTION sentinela_write_lab.verify_technical_history(jsonb,jsonb) OWNER TO sentinela_sbx_mutator;
REVOKE ALL ON FUNCTION sentinela_write_lab.verify_technical_history(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_write_lab.verify_technical_history(jsonb,jsonb) TO sentinela_sbx_admin,sentinela_sbx_operator,sentinela_sbx_mutator;
CREATE OR REPLACE FUNCTION sentinela.exigir_historico_correcao()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE item record; anterior jsonb:=to_jsonb(OLD); novo jsonb:=to_jsonb(NEW);
BEGIN
 IF session_user IN ('sentinela_sbx_admin','sentinela_sbx_operator') AND TG_TABLE_NAME='ocorrencias'
 AND anterior->>'fonte'='SENTINELA_WRITE_SANDBOX_V1' THEN
   IF sentinela_write_lab.verify_technical_history(anterior,novo) THEN RETURN NULL; END IF;
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Exact technical history required';
 END IF;
 -- Original human-history path remains unchanged outside the experimental scope.
 FOR item IN SELECT key,value FROM jsonb_each(novo - ARRAY['versao','atualizado_em']) LOOP
 IF item.value IS DISTINCT FROM anterior->item.key AND NOT EXISTS(
 SELECT FROM sentinela.historico_correcoes h WHERE h.transacao_id=pg_current_xact_id()
 AND h.versao_registro_anterior=OLD.versao AND h.campo=item.key
 AND h.valores_anteriores=anterior->item.key AND h.valores_novos=item.value
 AND ((TG_TABLE_NAME='ocorrencias' AND h.ocorrencia_id=OLD.id)
 OR (TG_TABLE_NAME='ocorrencia_naturezas' AND h.associacao_id=OLD.id)
 OR (TG_TABLE_NAME='linhas_staging' AND h.staging_id=OLD.id))) THEN
 RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Matching correction history required'; END IF;
 END LOOP; RETURN NULL;
END $$;

CREATE FUNCTION sentinela_write_lab.inspect(p_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('row',to_jsonb(o),'links',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)
 FROM sentinela.ocorrencia_naturezas a WHERE a.ocorrencia_id=o.id AND NOT EXISTS(
 SELECT FROM sentinela_write_lab.retirements r WHERE r.association_id=a.id)),'[]'::jsonb),
 'allLinks',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM sentinela.ocorrencia_naturezas a WHERE a.ocorrencia_id=o.id),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.new_version) FROM sentinela_write_lab.mutation_history h WHERE h.occurrence_id=o.id),'[]'::jsonb))
 FROM sentinela.ocorrencias o WHERE o.id=p_id AND (
   session_user='sentinela_sbx_admin' OR (session_user='sentinela_sbx_operator' AND EXISTS(
     SELECT FROM sentinela_write_lab.mutation_context WHERE tx=pg_current_xact_id() AND occ=p_id)));
$$;
ALTER FUNCTION sentinela_write_lab.inspect(uuid) OWNER TO sentinela_sbx_mutator;
REVOKE ALL ON FUNCTION sentinela_write_lab.inspect(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_write_lab.inspect(uuid) TO sentinela_sbx_admin,sentinela_sbx_mutator;

CREATE FUNCTION sentinela_write_lab.mutate(p_id uuid,p_body jsonb,p_operation text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old_row sentinela.ocorrencias%ROWTYPE; new_row sentinela.ocorrencias%ROWTYPE;
 changes jsonb; target jsonb; before_links jsonb; after_links jsonb; item jsonb; existing_link record;
 region record; audit uuid:=gen_random_uuid(); reason text; fields jsonb; address_changed boolean:=false;
BEGIN
 IF current_database()<>'sentinela_rls_sandbox' OR inet_server_port()<>55432 OR host(inet_server_addr())<>'127.0.0.1'
 OR session_user NOT IN ('sentinela_sbx_admin','sentinela_sbx_operator') OR NOT EXISTS(SELECT FROM sentinela_write_lab.identity i
 WHERE i.uuid=current_setting('sentinela.sandbox_uuid')::uuid AND i.system_id=(SELECT system_identifier::text FROM pg_control_system()))
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authenticated mutation sandbox required'; END IF;
 IF p_id IS NULL OR p_body IS NULL OR jsonb_typeof(p_body)<>'object' OR p_operation IS NULL OR p_operation NOT IN ('edit','inactivate')
 OR jsonb_typeof(p_body->'versaoEsperada') IS DISTINCT FROM 'string'
 OR (p_body->>'versaoEsperada')!~'^[1-9][0-9]{0,18}$' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid mutation command'; END IF;
 IF p_operation='edit' THEN
 IF (p_body-ARRAY['versaoEsperada','justificativa','alteracoes'])<>'{}' OR jsonb_typeof(p_body->'justificativa') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_body->'alteracoes') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid edit'; END IF;
 changes:=p_body->'alteracoes';reason:=btrim(p_body->>'justificativa');
 IF changes='{}' OR (changes-ARRAY['data','horario','raId','local','coordenadas','naturezas','endereco','bairroOuSetor'])<>'{}' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Immutable field'; END IF;
 IF changes ?| ARRAY['endereco','bairroOuSetor'] THEN
   IF jsonb_typeof(changes->'endereco') IS DISTINCT FROM 'string'
      OR jsonb_typeof(changes->'bairroOuSetor') IS DISTINCT FROM 'string'
      OR length(btrim(changes->>'endereco')) NOT BETWEEN 1 AND 240
      OR length(btrim(changes->>'bairroOuSetor')) NOT BETWEEN 1 AND 100 THEN
     RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid structured address';
   END IF;
   address_changed:=NOT EXISTS(SELECT FROM sentinela_write_lab.occurrence_versions v
     WHERE v.occurrence_id=p_id AND v.version=(p_body->>'versaoEsperada')::bigint
       AND v.address=changes->>'endereco' AND v.district=changes->>'bairroOuSetor');
 END IF;
 ELSE
 IF (p_body-ARRAY['versaoEsperada','motivo'])<>'{}' OR jsonb_typeof(p_body->'motivo') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid inactivation'; END IF;
 changes:='{}';reason:=btrim(p_body->>'motivo');
 END IF;
 IF reason IS NULL OR length(reason) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Reason required'; END IF;
 -- Context exists before FOR UPDATE because PostgreSQL also applies UPDATE RLS.
 INSERT INTO sentinela_write_lab.mutation_context VALUES(pg_current_xact_id(),p_id);
 SELECT * INTO old_row FROM sentinela.ocorrencias WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Occurrence unavailable'; END IF;
 IF old_row.versao<>(p_body->>'versaoEsperada')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Version conflict'; END IF;
 IF NOT old_row.ativo OR old_row.consolidacao_status<>'consolidada' OR old_row.origem<>'manual' OR old_row.identidade_status<>'manual'
 OR old_row.localizacao_status<>'referencia_pendente' OR EXISTS(SELECT FROM sentinela.pendencias_revisao WHERE ocorrencia_id=p_id AND status NOT IN ('resolvida','encerrada_sem_solucao'))
 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Ineligible regular synthetic occurrence'; END IF;
 before_links:=(sentinela_write_lab.inspect(p_id))->'links';
 target:=jsonb_build_object('data',old_row.data_fato,'horario',old_row.horario_fato,'raId',old_row.ra_id,'local',old_row.local,
 'coordenadas',jsonb_build_object('latitude',old_row.latitude,'longitude',old_row.longitude),
 'naturezas',(SELECT jsonb_agg(jsonb_build_object('naturezaId',x->'natureza_id','crimeTentado',x->'crime_tentado')) FROM jsonb_array_elements(before_links) x)) || changes;
 IF p_operation='edit' THEN
 IF jsonb_typeof(target->'data') IS DISTINCT FROM 'string' OR jsonb_typeof(target->'horario') IS DISTINCT FROM 'string'
 OR jsonb_typeof(target->'raId') IS DISTINCT FROM 'string' OR jsonb_typeof(target->'local') IS DISTINCT FROM 'string'
 OR (target->>'data')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR NOT isfinite((target->>'data')::date)
 OR extract(year FROM (target->>'data')::date) NOT BETWEEN 1900 AND 9999
 OR (target->>'horario')!~'^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'
 OR length(btrim(target->>'local')) NOT BETWEEN 5 AND 240
 OR jsonb_typeof(target->'coordenadas') IS DISTINCT FROM 'object'
 OR ((target->'coordenadas')-ARRAY['latitude','longitude'])<>'{}'
 OR jsonb_typeof(target->'coordenadas'->'latitude') IS DISTINCT FROM 'number'
 OR jsonb_typeof(target->'coordenadas'->'longitude') IS DISTINCT FROM 'number'
 OR NOT((target->'coordenadas'->>'latitude')::float8 BETWEEN -90 AND 90)
 OR NOT((target->'coordenadas'->>'longitude')::float8 BETWEEN -180 AND 180)
 OR jsonb_typeof(target->'naturezas') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid merged record'; END IF;
 IF jsonb_array_length(target->'naturezas') NOT BETWEEN 1 AND 100 OR EXISTS(SELECT FROM jsonb_array_elements(target->'naturezas') x
 WHERE jsonb_typeof(x)<>'object' OR (x-ARRAY['naturezaId','crimeTentado'])<>'{}' OR jsonb_typeof(x->'naturezaId') IS DISTINCT FROM 'string'
 OR NOT(x?'crimeTentado') OR jsonb_typeof(x->'crimeTentado') NOT IN ('boolean','null'))
 OR EXISTS(SELECT FROM jsonb_array_elements(target->'naturezas') x GROUP BY (x->>'naturezaId')::uuid,x->'crimeTentado' HAVING count(*)>1)
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid nature links'; END IF;
 SELECT * INTO region FROM sentinela.regioes_administrativas WHERE id=(target->>'raId')::uuid AND (target->>'data')::date <@ vigencia;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23503',MESSAGE='Region unavailable'; END IF;
 IF region.limite IS NULL OR NOT extensions.ST_Covers(region.limite,extensions.ST_SetSRID(extensions.ST_MakePoint((target->'coordenadas'->>'longitude')::float8,(target->'coordenadas'->>'latitude')::float8),4326))
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Outside synthetic boundary'; END IF;
 UPDATE sentinela.ocorrencias SET data_fato=(target->>'data')::date,horario_fato=(target->>'horario')::time,
 ra_id=(target->>'raId')::uuid,local=target->>'local',latitude=(target->'coordenadas'->>'latitude')::float8,
 longitude=(target->'coordenadas'->>'longitude')::float8 WHERE id=p_id RETURNING * INTO new_row;
 -- No association is physically deleted or overwritten. Retired rows remain FK targets.
 FOR existing_link IN SELECT * FROM sentinela.ocorrencia_naturezas l WHERE l.ocorrencia_id=p_id AND NOT EXISTS(SELECT FROM sentinela_write_lab.retirements r WHERE r.association_id=l.id) LOOP
 IF NOT EXISTS(SELECT FROM jsonb_array_elements(target->'naturezas') x WHERE (x->>'naturezaId')::uuid=existing_link.natureza_id AND (x->>'crimeTentado')::boolean IS NOT DISTINCT FROM existing_link.crime_tentado) THEN
 INSERT INTO sentinela_write_lab.retirements(association_id,occurrence_id,version,actor) VALUES(existing_link.id,p_id,new_row.versao,session_user);
 END IF; END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(target->'naturezas') LOOP
 IF NOT EXISTS(SELECT FROM sentinela.naturezas_criminais WHERE id=(item->>'naturezaId')::uuid) THEN RAISE EXCEPTION USING ERRCODE='23503',MESSAGE='Nature unavailable'; END IF;
 IF NOT EXISTS(SELECT FROM sentinela.ocorrencia_naturezas a WHERE a.ocorrencia_id=p_id AND a.natureza_id=(item->>'naturezaId')::uuid AND a.crime_tentado IS NOT DISTINCT FROM (item->>'crimeTentado')::boolean AND NOT EXISTS(SELECT FROM sentinela_write_lab.retirements r WHERE r.association_id=a.id)) THEN
 INSERT INTO sentinela.ocorrencia_naturezas(id,ocorrencia_id,natureza_id,origem,crime_tentado,classificacao_status)
 VALUES(gen_random_uuid(),p_id,(item->>'naturezaId')::uuid,'manual',(item->>'crimeTentado')::boolean,'pendente');
 END IF; END LOOP;
 ELSE UPDATE sentinela.ocorrencias SET ativo=false WHERE id=p_id RETURNING * INTO new_row;
 END IF;
 after_links:=(sentinela_write_lab.inspect(p_id))->'links';
 SELECT coalesce(jsonb_agg(key ORDER BY key),'[]') INTO fields FROM jsonb_each(to_jsonb(new_row)) WHERE value IS DISTINCT FROM to_jsonb(old_row)->key AND key NOT IN ('versao','atualizado_em');
 IF to_jsonb(new_row)-ARRAY['versao','atualizado_em']=to_jsonb(old_row)-ARRAY['versao','atualizado_em'] AND before_links=after_links AND NOT address_changed THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='No effective change'; END IF;
 IF before_links<>after_links THEN fields:=fields||'"naturezas"'::jsonb; END IF;
 IF address_changed THEN fields:=fields||'"endereco"'::jsonb; END IF;
 INSERT INTO sentinela_write_lab.mutation_history(id,occurrence_id,operation,actor,old_version,new_version,before_row,after_row,before_links,after_links,changed_fields,reason)
 VALUES(audit,p_id,p_operation,session_user,old_row.versao,new_row.versao,to_jsonb(old_row),to_jsonb(new_row),before_links,after_links,fields,reason);
 DELETE FROM sentinela_write_lab.mutation_context WHERE tx=pg_current_xact_id();
 RETURN jsonb_build_object('id',p_id,'versao',new_row.versao::text,'auditId',audit,'atorSintetico',session_user::text,'operacao',p_operation,'ativo',new_row.ativo);
END $$;
ALTER FUNCTION sentinela_write_lab.mutate(uuid,jsonb,text) OWNER TO sentinela_sbx_mutator;
REVOKE ALL ON FUNCTION sentinela_write_lab.mutate(uuid,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_write_lab.mutate(uuid,jsonb,text) TO sentinela_sbx_admin,sentinela_sbx_operator;
COMMIT;
