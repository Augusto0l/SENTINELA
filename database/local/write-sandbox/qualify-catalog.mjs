import "../../../scripts/contracts-runtime.mjs"
import assert from "node:assert/strict"
import { Pool } from "pg"
import { readFile } from "node:fs/promises"
import { verifyCatalogSource } from "./catalog-source.mjs"
const { catalogSql } = await import("../../../src/lib/db/catalog-query.ts")
const { regionCatalogDataSchema } = await import("../../../src/contracts/persistent-catalogs.ts")
const { raBindingSchema } = await import("../../../src/data/ra-bindings.ts")
let raw="";for await(const chunk of process.stdin)raw+=chunk
const {password,mapping}=JSON.parse(raw);raw=""
const pool=new Pool({host:"127.0.0.1",port:55432,database:"sentinela_rls_sandbox",user:"sentinela_local_reader",password,max:1,connectionTimeoutMillis:3000})
pool.on("error",()=>{})
const checks=[]; let result
const sourceRows=verifyCatalogSource(await readFile("public/data/cartography/ras-ide-2026-11-13.geojson"))
try{
 const identity=(await pool.query("SELECT current_user AS role,current_database() AS db,host(inet_server_addr()) AS host,inet_server_port() AS port")).rows[0]
 assert.deepEqual(identity,{role:"sentinela_local_reader",db:"sentinela_rls_sandbox",host:"127.0.0.1",port:55432})
 checks.push({name:"native_reader_authentication",result:"PASS"})
 const items=(await pool.query(catalogSql("regioes"))).rows
 assert.equal(sourceRows.length,37)
 assert(regionCatalogDataSchema.safeParse({items}).success);assert.equal(items.length,37)
 assert.deepEqual(items.map(r=>r.id).sort(),mapping.entries.map(r=>r.raId).sort());assert(raBindingSchema.safeParse(mapping).success)
 for(const r of items)assert.equal(r.nome,mapping.entries.find(e=>e.raId===r.id).catalogName)
 checks.push({name:"unchanged_get_sql_and_zod_contract_persistent_uuid_and_name",result:"PASS"})
 await assert.rejects(pool.query("SELECT limite FROM sentinela.regioes_administrativas"),e=>e.code==="42501")
 await assert.rejects(pool.query("SELECT * FROM sentinela_geo_lab.bindings"),e=>e.code==="42501")
 await assert.rejects(pool.query("SELECT * FROM sentinela.usuarios"),e=>e.code==="42501")
 for(const sql of ["INSERT INTO sentinela.regioes_administrativas(id) SELECT gen_random_uuid() WHERE false","UPDATE sentinela.regioes_administrativas SET nome='forbidden' WHERE false","DELETE FROM sentinela.regioes_administrativas WHERE false","SELECT sentinela_geo_lab.load_catalog('{}')"])
  await assert.rejects(pool.query(sql),e=>e.code==="42501")
 checks.push({name:"native_denial_restricted_columns_internal_data_writes_and_installer",result:"PASS"})
 const metadataResults=await pool.query(await readFile("database/local/write-sandbox/preoperational-snapshot.sql","utf8"))
 const snapshot=metadataResults.find(r=>r.rows?.[0]?.jsonb_build_object)?.rows[0].jsonb_build_object
 assert.equal(snapshot.identity.executor,"sentinela_local_reader");assert.equal(snapshot.identity.readonly,"on")
 checks.push({name:"same_readonly_metadata_audit_query_native_reader",result:"PASS"})
 const grants=(await pool.query("SELECT count(*)::int AS n FROM information_schema.column_privileges WHERE grantee=current_user AND table_schema='sentinela' AND privilege_type='SELECT'")).rows[0].n
 assert.equal(grants,48)
 const attrs=(await pool.query("SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication FROM pg_roles WHERE rolname=current_user")).rows[0]
 assert(Object.values(attrs).every(v=>v===false))
 const rls=(await pool.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='sentinela.regioes_administrativas'::regclass")).rows[0]
 assert(rls.relrowsecurity&&rls.relforcerowsecurity)
 checks.push({name:"forced_rls_hides_unapproved_synthetic_row_no_admin_attributes",result:"PASS"})
 result={result:"PASS",catalog_items:items,checks,rows:items.length,scope:"sandbox-only",transport:"same GET SQL and response schema; no hosted endpoint"}
}catch(e){result={result:"FAIL",sqlState:e.code,checks}}
finally{await pool.end()}
process.stdout.write(JSON.stringify(result));if(result.result!=="PASS")process.exitCode=1
