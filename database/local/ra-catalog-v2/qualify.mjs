import "../../../scripts/contracts-runtime.mjs"
import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
registerHooks({resolve(s,c,next){if(s==="server-only")return {url:"data:text/javascript,export{}",shortCircuit:true};return next(s,c)}})
const { catalogGET }=await import("../../../src/lib/db/catalog-http.ts")
const { catalogSql }=await import("../../../src/lib/db/catalog-query.ts")
const { regionCatalogDataSchema }=await import("../../../src/contracts/persistent-catalogs.ts")
const { raBindingSchema,validateBoundTerritory }=await import("../../../src/data/ra-bindings.ts")
let input="";for await(const chunk of process.stdin)input+=chunk
const {password,rows}=JSON.parse(input);input=""
const pool=new Pool({host:"127.0.0.1",port:55432,database:"sentinela_rls_sandbox",user:"sentinela_local_reader",password,max:1,connectionTimeoutMillis:3000,statement_timeout:10000})
pool.on("error",()=>{})
const checks=[];let server,result,stage="identity"
const mark=name=>checks.push({name,result:"PASS"})
try{
 assert.deepEqual((await pool.query("SELECT current_user AS role,current_database() AS db,host(inet_server_addr()) AS host,inet_server_port() AS port")).rows[0],
  {role:"sentinela_local_reader",db:"sentinela_rls_sandbox",host:"127.0.0.1",port:55432})
 const attrs=(await pool.query("SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication FROM pg_roles WHERE rolname=current_user")).rows[0]
 assert(Object.values(attrs).every(v=>v===false));mark("native_reader_authentication_no_admin")
 const query=async()=>{
  await pool.query("BEGIN READ ONLY")
  try{const data=regionCatalogDataSchema.parse({items:(await pool.query(catalogSql("regioes"))).rows});await pool.query("COMMIT");return data}
  catch(e){await pool.query("ROLLBACK");throw e}
 }
 const data=await query();assert.equal(data.items.length,37)
 assert.deepEqual(data.items.map(r=>r.id).sort(),rows.map(r=>r.id).sort())
 for(const item of data.items){assert.deepEqual(Object.keys(item),["id","nome"]);assert.equal(item.nome,rows.find(r=>r.id===item.id).name)}
 assert.equal((await pool.query("SELECT id FROM sentinela.regioes_administrativas WHERE codigo_interno LIKE 'NEGATIVE%' OR versao_catalogo='NEGATIVE_VERSION'")).rowCount,0)
 mark("37_exact_persistent_UUIDs_three_negative_fixtures_hidden")
 stage="permission_denials"
 for(const sql of ["SELECT referencia_cartografica FROM sentinela.regioes_administrativas","SELECT limite FROM sentinela.regioes_administrativas",
  "SELECT * FROM sentinela.usuarios","SELECT * FROM sentinela.eventos_auditoria","SELECT * FROM sentinela.linhas_staging",
  "INSERT INTO sentinela.regioes_administrativas(id) SELECT gen_random_uuid() WHERE false",
  "UPDATE sentinela.regioes_administrativas SET nome='forbidden' WHERE false","DELETE FROM sentinela.regioes_administrativas WHERE false",
  "UPDATE sentinela.regioes_administrativas SET referencia_cartografica='{}' WHERE false",
  "SELECT sentinela_ra_lab.load_catalog('{}')"])
  await assert.rejects(pool.query(sql),e=>e.code==="42501")
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM information_schema.column_privileges WHERE grantee=current_user AND table_schema='sentinela' AND privilege_type='SELECT'")).rows[0].n,48)
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r' AND relrowsecurity AND relforcerowsecurity")).rows[0].n,19)
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='sentinela'")).rows[0].n,8)
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM pg_proc WHERE pronamespace='sentinela_ra_lab'::regnamespace AND prosecdef")).rows[0].n,0)
 mark("10_native_denials_48_grants_19_forced_RLS_8_policies_no_definer")
 stage="http"
 const tokens=new Map(["Administrador","Operador","Analista"].map(role=>[randomUUID(),role]))
 server=createServer(async(req,res)=>{
  try{
   const request=new Request(process.env.SENTINELA_APP_ORIGIN+req.url,{headers:req.headers})
   const role=tokens.get((req.headers.authorization??"").replace(/^Bearer /,""))
   const response=await catalogGET(request,"regioes",{principal:async()=>role?{source:"local",role,id:"sandbox-only",name:"Synthetic test principal",authUserId:""}:null,query})
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text())
  }catch{res.writeHead(500);res.end()}
 })
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve))
 const origin=`http://127.0.0.1:${server.address().port}`
 Object.assign(process.env,{NODE_ENV:"development",SENTINELA_AUTH_PROVIDER:"local",SENTINELA_LOCAL_BIND:"127.0.0.1",SENTINELA_APP_ORIGIN:origin})
 for(const [token]of tokens){
  const response=await fetch(origin+"/api/v1/catalogos/regioes-administrativas",{headers:{authorization:`Bearer ${token}`}})
  assert.equal(response.status,200);assert.match(response.headers.get("cache-control"),/no-store/)
  assert.deepEqual((await response.json()).data,data)
 }
 for(const headers of [{},{authorization:"Bearer invalid"}])assert.equal((await fetch(origin+"/api/v1/catalogos/regioes-administrativas",{headers})).status,401)
 const token=tokens.keys().next().value
 assert.equal((await fetch(origin+"/api/v1/catalogos/regioes-administrativas?extra=1",{headers:{authorization:`Bearer ${token}`}})).status,400)
 mark("real_loopback_HTTP_shared_GET_handler_real_PostgreSQL_three_fixture_principals_401_400")
 stage="territory"
 const geo=JSON.parse(await readFile("public/data/cartography/ras-ide-2026-11-13.geojson","utf8"))
 const mapping={version:"ra-public-sandbox-2026-11-13-v2",sourceId:rows[0].metadata.sourceId,sourceHash:rows[0].metadata.sourceHash,scope:"sandbox",extractedOn:"2026-11-13",validFrom:null,validTo:null,temporalBasis:"extraction-only",
  entries:rows.map(r=>({raId:r.id,catalogName:r.name,code:r.code,sourceName:r.metadata.sourceName,sourceObjectId:r.metadata.sourceObjectId,status:"approved",evidence:"Pinned v2 metadata and installer-only approval; persistent sandbox UUID"}))}
 assert(raBindingSchema.safeParse(mapping).success)
 const point=rows.find(r=>r.code==="RA-I"),other=rows.find(r=>r.code==="RA-II")
 const validate=(id,map=mapping,lat=point.lat,lon=point.lon)=>validateBoundTerritory(geo,lat,lon,id,map,"sandbox",mapping.version).status
 assert.equal(validate(point.id),"consistent");assert.equal(validate(other.id),"ra_mismatch")
 const pending=structuredClone(mapping);pending.entries.find(r=>r.raId===point.id).status="pending"
 assert.equal(validate(point.id,pending),"reference_pending")
 assert.equal(validate(point.id,mapping,point.boundaryLat,point.boundaryLon),"boundary_ambiguous")
 mark("persistent_GET_UUID_binding_consistent_mismatch_pending_boundary")
 result={result:"PASS",checks,rows:37,items:data.items,mapping,http:"real isolated HTTP; shared handler + explicit native sandbox query adapter; fixture principals only; not Next login E2E"}
}catch(e){result={result:"FAIL",stage,error:e.name,sqlState:e.code,checks}}
finally{if(server)await new Promise(resolve=>server.close(resolve));await pool.end()}
process.stdout.write(JSON.stringify(result));if(result.result!=="PASS")process.exitCode=1
