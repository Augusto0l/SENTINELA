import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { persistentDestination, persistentReaders, persistentWriters } from "../../../src/lib/db/config.ts"
import { approvedSource } from "./approved-source.mjs"
export const writers = persistentWriters
const assets = {
  "setup.sql": "5d86701901919baa0b31f679e0280c9c84c3da51461c37f5d3d6a258f94fccca",
  "mutations.sql": "8fbedd219118dced3dfc2951f0fdc5b2f5fbb281ebe546e7db7cfe31476c4f8c",
  "003_individual_address.sql": "0dfaa1cc4fd3b38604825dea507cbcd82e583df3a29001462340fccb77539001",
  "004_workspace_read.sql": "f358edf2b2f0ee56b47c5607a0f7461f6b132f1f129ec65119db2d22035729d4",
}
const schema = "sentinela_homolog_crud"
const owner = "s4_hom_mutator"
const author = "s4_hom_create"
const logins = Object.values(writers).map(x => x.login).join(",")
const reads = Object.values(persistentReaders).join(",")
const quotedReads = Object.values(persistentReaders).map(x => `'${x}'`).join(",")
export const manualSource = "SENTINELA_HOMOLOG_MANUAL_V1"
export const revision = "homolog-persist-0003"
export const previousLedger = ["0001","0002","0003","0004","0005","homolog-persist-0001","homolog-persist-0002"]
const catalogVersion = "SENTINELA_RA_PUBLICO_2026_11_13_V1"

function substitute(sql, before, after) {
  assert(sql.includes(before), "Template SQL incompatível")
  return sql.replaceAll(before, after)
}

async function source(name) {
  const raw = await readFile(new URL("../write-sandbox/" + name, import.meta.url))
  const sql = approvedSource(raw, assets[name])
  assert.equal(sql.match(/^\\ir .*$/gm)?.length, 1)
  // The disposable psql guard is replaced by the full persistent guard below.
  return sql.replace(/^\\ir .*\n/m, "").replace(/^BEGIN;\n|^COMMIT;\n/gm, "")
    .replaceAll("sentinela_write_lab", schema).replaceAll("sentinela_sbx_owner", author)
    .replaceAll("sentinela_sbx_mutator", owner)
    .replaceAll("sentinela_sbx_admin", writers.Administrador.login)
    .replaceAll("sentinela_sbx_operator", writers.Operador.login)
    .replaceAll("SENTINELA_WRITE_SANDBOX_V1", manualSource)
    .replaceAll("SANDBOX-MANUAL-V1", "HOMOLOG-MANUAL-V1")
    .replaceAll("sandbox.cadastro", "homologacao.cadastro")
    .replaceAll("sentinela_rls_sandbox", persistentDestination.database)
    .replaceAll("55432", String(persistentDestination.port))
    .replaceAll("current_user<>'postgres'", "current_user<>'sprint4_migration'")
    .replaceAll("current_setting('sentinela.sandbox_uuid')::uuid", "'80400000-0000-4000-8000-000000000003'::uuid")
    .replaceAll("(SELECT system_identifier::text FROM pg_control_system())", "sentinela_homologacao.system_identifier()")
}

export async function crudSql() {
  let create = await source("setup.sql")
  const fixtureStart = create.indexOf("-- Fixture catalogs,")
  assert(fixtureStart > 0, "Bloco de fixtures descartáveis ausente")
  create = create.slice(0, fixtureStart)
  let edit = await source("mutations.sql")
  const analyst = "sentinela_sbx_analyst"
  create = substitute(create, `CREATE ROLE ${analyst} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT CONNECTION LIMIT 2;\n`, "")
  create = substitute(create, "," + analyst, "")
  const pointFunction = `CREATE FUNCTION ${schema}.point_in_region(region uuid, longitude float8, latitude float8)
  RETURNS extensions.geometry LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $point$
  DECLARE point extensions.geometry := extensions.ST_SetSRID(extensions.ST_MakePoint(longitude,latitude),4326);
  BEGIN
    IF NOT EXISTS (SELECT FROM sentinela.regioes_administrativas r WHERE r.id=region AND extensions.ST_Covers(r.limite,point))
      OR (SELECT count(*) FROM sentinela.regioes_administrativas r WHERE extensions.ST_Covers(r.limite,point))<>1 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Coordenada fora da RA ou territorialmente ambigua';
    END IF;
    RETURN point;
  END $point$;
  REVOKE ALL ON FUNCTION ${schema}.point_in_region(uuid,float8,float8) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION ${schema}.point_in_region(uuid,float8,float8) TO ${author};`
  create = substitute(create, `CREATE FUNCTION ${schema}.cadastrar`, pointFunction + `\nCREATE FUNCTION ${schema}.cadastrar`)
  create = substitute(create, `CREATE SCHEMA ${schema};`, `CREATE SCHEMA ${schema};
    GRANT USAGE ON SCHEMA sentinela_homologacao TO ${author},${logins};
    GRANT EXECUTE ON FUNCTION sentinela_homologacao.system_identifier() TO ${author},${logins};`)
  create = substitute(create, `versao_catalogo='${manualSource}'`, `versao_catalogo='${catalogVersion}'`)
  create = substitute(create, " AND (p_body->>'data')::date <@ vigencia", "")
  create = substitute(create, "'em_revisao'", "'consolidada'")
  create = substitute(create, "'referencia_pendente'", "'validada'")
  create = substitute(create, "localizacao_status,consolidacao_status)", "localizacao_status,consolidacao_status,geometria,referencia_espacial_confirmada,regra_transformacao)")
  create = substitute(create, "'validada','consolidada');", `'validada','consolidada',
    ${schema}.point_in_region((p_body->>'raId')::uuid,(p_body->'coordenadas'->>'longitude')::float8,
      (p_body->'coordenadas'->>'latitude')::float8),'WGS84 declarado no formulario sintetico','longitude/latitude sem transformacao');`)
  edit = substitute(edit, `versao_catalogo='${manualSource}'`, `versao_catalogo='${catalogVersion}'`)
  edit = substitute(edit, " AND (target->>'data')::date <@ vigencia", "")
  edit = substitute(edit, "old_row.localizacao_status<>'referencia_pendente'", "old_row.localizacao_status<>'validada'")
  edit = substitute(edit, "latitude,longitude,ativo)", "latitude,longitude,geometria,ativo)")
  edit = substitute(edit, "longitude=(target->'coordenadas'->>'longitude')::float8 WHERE", `longitude=(target->'coordenadas'->>'longitude')::float8,
    geometria=${schema}.point_in_region((target->>'raId')::uuid,(target->'coordenadas'->>'longitude')::float8,
      (target->'coordenadas'->>'latitude')::float8) WHERE`)
  const versions = await source("003_individual_address.sql")
  let listing = await source("004_workspace_read.sql")
  listing = substitute(listing, `session_user='${analyst}'`, `session_user IN (${quotedReads})`)
  listing = substitute(listing, `TO ${analyst};`, `TO ${reads};`)
  listing = substitute(listing, "'referencia_pendente'", "'validada'")

  return `DO $guard$
  BEGIN
    IF current_database()<>'${persistentDestination.database}' OR session_user<>'sprint4_migration'
      OR current_user<>session_user OR inet_server_port() IS DISTINCT FROM ${persistentDestination.port}
      OR host(inet_server_addr()) IS DISTINCT FROM '${persistentDestination.host}'
      OR current_setting('listen_addresses')<>'${persistentDestination.host}'
      OR current_setting('cluster_name')<>'${persistentDestination.cluster}'
      OR current_setting('server_version_num')<>'${persistentDestination.version}'
      OR sentinela_homologacao.system_identifier()<>'${persistentDestination.system}'
      OR (SELECT array_agg(versao ORDER BY versao) FROM sentinela.schema_migrations)
        IS DISTINCT FROM ARRAY[${previousLedger.map(x => `'${x}'`).join(",")}]
      OR (SELECT count(*) FROM sentinela.regioes_administrativas WHERE versao_catalogo='${catalogVersion}')<>37
      OR EXISTS (SELECT FROM sentinela.ocorrencias)
    THEN RAISE EXCEPTION 'Destino CRUD de homologacao recusado'; END IF;
  END $guard$;
${create}
${edit}
${versions}
GRANT USAGE ON SCHEMA sentinela_homologacao TO ${owner};
GRANT EXECUTE ON FUNCTION sentinela_homologacao.system_identifier() TO ${owner};
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ${owner},${author},${logins};
GRANT EXECUTE ON FUNCTION ${schema}.point_in_region(uuid,float8,float8),${schema}.cadastrar(jsonb,uuid) TO ${owner};
GRANT USAGE ON SCHEMA ${schema} TO ${reads};
${listing}
INSERT INTO ${schema}.individuals VALUES ${Object.values(writers).map(w => `('${w.login}','${w.subject}')`).join(",")};
INSERT INTO sentinela.naturezas_criminais(id,fonte,descricao_original) VALUES
 ('31000000-0000-4000-8000-000000000001','${manualSource}','Natureza sintética A'),
 ('31000000-0000-4000-8000-000000000002','${manualSource}','Natureza sintética B');
CREATE POLICY homolog_manual_occ ON sentinela.ocorrencias FOR SELECT TO ${reads}
  USING (fonte='${manualSource}' AND ativo);
CREATE POLICY homolog_manual_nature ON sentinela.naturezas_criminais FOR SELECT TO ${reads}
  USING (fonte='${manualSource}');
GRANT SELECT(association_id) ON ${schema}.retirements TO ${reads};
CREATE POLICY homolog_retirement_read ON ${schema}.retirements FOR SELECT TO ${reads} USING (true);
CREATE POLICY homolog_manual_links ON sentinela.ocorrencia_naturezas FOR SELECT TO ${reads}
  USING (EXISTS(SELECT FROM sentinela.ocorrencias o WHERE o.id=ocorrencia_id)
    AND NOT EXISTS(SELECT FROM ${schema}.retirements r WHERE r.association_id=id));

CREATE TABLE ${schema}.api_commands(
  actor name NOT NULL,key uuid NOT NULL,digest text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(actor,key));
ALTER TABLE ${schema}.api_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${schema}.api_commands FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON ${schema}.api_commands TO ${owner};
CREATE POLICY homolog_command ON ${schema}.api_commands TO ${owner}
  USING(actor=session_user) WITH CHECK(actor=session_user);
CREATE FUNCTION ${schema}.command(p_subject uuid,p_key uuid,p_mode text,p_id uuid,p_body jsonb,p_address text,p_district text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $command$
 DECLARE previous record; digest_now text; answer jsonb;
 BEGIN
   IF current_database()<>'${persistentDestination.database}' OR inet_server_port() IS DISTINCT FROM ${persistentDestination.port}
     OR host(inet_server_addr()) IS DISTINCT FROM '${persistentDestination.host}'
     OR sentinela_homologacao.system_identifier()<>'${persistentDestination.system}'
     OR NOT EXISTS (SELECT FROM ${schema}.individuals WHERE subject=p_subject AND login=session_user)
     THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Ator de homologacao recusado'; END IF;
   IF p_key IS NULL OR p_mode IS NULL OR p_mode NOT IN ('create','edit','inactivate')
     OR (p_mode='create') IS DISTINCT FROM (p_id IS NULL)
     OR (p_mode<>'inactivate' AND (p_address IS NULL OR length(btrim(p_address)) NOT BETWEEN 1 AND 240
       OR p_district IS NULL OR length(btrim(p_district)) NOT BETWEEN 1 AND 100))
     THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Comando ou endereco invalido'; END IF;
   IF p_mode='edit' AND (p_body->'alteracoes'->>'endereco' IS DISTINCT FROM p_address
       OR p_body->'alteracoes'->>'bairroOuSetor' IS DISTINCT FROM p_district)
     THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Endereco da versao divergente'; END IF;
   digest_now:=encode(sha256(convert_to(jsonb_build_array(p_subject,p_mode,p_id,p_body,p_address,p_district)::text,'UTF8')),'hex');
   PERFORM pg_advisory_xact_lock(hashtextextended(session_user::text||p_key::text,418));
   SELECT digest,result INTO previous FROM ${schema}.api_commands WHERE actor=session_user AND key=p_key;
   IF FOUND THEN
     IF previous.digest<>digest_now THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='Conflito de idempotencia'; END IF;
     RETURN previous.result;
   END IF;
   IF p_mode='create' THEN
     answer:=${schema}.cadastrar(p_body,p_key);
   ELSE
     answer:=${schema}.mutate(p_id,p_body,p_mode);
   END IF;
   PERFORM ${schema}.record_version(p_subject,(answer->>'id')::uuid,(answer->>'versao')::bigint,
     (answer->>'auditId')::uuid,p_mode,p_address,p_district);
   INSERT INTO ${schema}.api_commands VALUES(session_user,p_key,digest_now,answer);
   RETURN answer;
 END $command$;
ALTER FUNCTION ${schema}.command(uuid,uuid,text,uuid,jsonb,text,text) OWNER TO ${owner};
REVOKE ALL ON FUNCTION ${schema}.command(uuid,uuid,text,uuid,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ${schema}.command(uuid,uuid,text,uuid,jsonb,text,text) TO ${logins};
REVOKE EXECUTE ON FUNCTION ${schema}.cadastrar(jsonb,uuid),${schema}.mutate(uuid,jsonb,text),
 ${schema}.record_version(uuid,uuid,bigint,uuid,text,text,text),${schema}.inspect(uuid) FROM ${logins};
INSERT INTO sentinela.schema_migrations(versao,descricao) VALUES ('${revision}','CRUD sintetico, versoes e autoria segregada');
`
}
