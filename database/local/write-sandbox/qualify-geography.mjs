import "../../../scripts/contracts-runtime.mjs"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { Pool } from "pg"
import { randomUUID } from "node:crypto"
const { validateTerritory } = await import("../../../src/data/territorial-validation.ts")
const { createSandboxRegistrar, SandboxError } = await import("./service.ts")
let raw="";for await(const chunk of process.stdin)raw+=chunk
const {config,cases}=JSON.parse(raw);raw=""
const geo=JSON.parse(await readFile("public/data/cartography/ras-ide-2026-11-13.geojson","utf8"))
const p=new Pool({host:"127.0.0.1",port:55432,database:"sentinela_rls_sandbox",user:config.credentials.Administrador.user,password:config.credentials.Administrador.password,max:1,connectionTimeoutMillis:3000})
p.on("error",()=>{})
const service=createSandboxRegistrar(config,async()=>({kind:"sandbox-synthetic-only",role:"Administrador"}))
const checks=[];let stage="parity",result
try{
 for(const c of cases){
  const js=validateTerritory(geo,c.lat,c.lon,c.code)
  const sql=(await p.query("SELECT sentinela_geo_lab.validate($1::float8,$2::float8,$3::text) AS result",[c.lat,c.lon,c.code])).rows[0].result
  assert.equal(js.status,sql.status);assert.deepEqual(js.matches,sql.matches)
  if(c.expected)assert.equal(js.status,c.expected)
  checks.push({name:c.name,status:js.status,result:"PASS"})
 }
 stage="create"
 const c=cases.find(c=>c.name.startsWith("interior_")&&c.expected==="consistent")
 const body={data:"2026-11-13",horario:"12:00:00",raId:c.ra_id,local:"SINTETICO: ponto derivado de ST_PointOnSurface",coordenadas:{latitude:c.lat,longitude:c.lon},naturezas:[{naturezaId:"31000000-0000-4000-8000-000000000001",crimeTentado:null}]}
 const created=await service.register("synthetic-token",body,randomUUID());assert(created.persisted)
 checks.push({name:"official_geometry_creation_native_service_audit",result:"PASS"})
 const boundary=cases.find(x=>x.name==="boundary_"+c.code)
 await assert.rejects(service.register("synthetic-token",{...body,coordenadas:{latitude:boundary.lat,longitude:boundary.lon}},randomUUID()),e=>e instanceof SandboxError&&e.sqlState==="23514")
 checks.push({name:"native_geographic_trigger_rejects_boundary_after_covers",result:"PASS"})
 await assert.rejects(service.register("synthetic-token",{...body,raId:"11000000-0000-4000-8000-000000000001"},randomUUID()),e=>e instanceof SandboxError&&e.sqlState==="23514")
 checks.push({name:"native_geographic_trigger_rejects_unbound_synthetic_rectangle",result:"PASS"})
 for(const value of [NaN,Infinity]){
  const typed=(await p.query("SELECT sentinela_geo_lab.validate($1::float8,1,NULL) AS result",[value])).rows[0].result
  assert.equal(typed.status,validateTerritory(geo,value,1).status)
 }
 checks.push({name:"native_nonfinite_coordinates_rejected_with_javascript_parity",result:"PASS"})
 // The fixture uses an independently inserted, consolidated manual row with this RA.
 stage="edit"
 const edit={id:c.edit_id,payload:{versaoEsperada:"1",justificativa:"Ensaio territorial: nao representa autoria humana",alteracoes:{local:"Edicao SINTETICA geograficamente consistente",coordenadas:body.coordenadas}}}
 const edited=await service.edit("synthetic-token",edit);assert.equal(edited.data.versao,"2")
 checks.push({name:"consistent_edit_exact_technical_history",result:"PASS"})
 stage="rollback"
 await assert.rejects(service.edit("synthetic-token",{...edit,payload:{...edit.payload,versaoEsperada:"2",alteracoes:{local:"Should roll back",raId:cases.find(x=>x.ra_id!==c.ra_id&&x.ra_id).ra_id}}}),e=>e instanceof SandboxError&&e.status===422)
 checks.push({name:"mismatched_ra_edit_rollback",result:"PASS"})
 await assert.rejects(service.register("synthetic-token",{...body,coordenadas:{latitude:0,longitude:0}},randomUUID()),e=>e instanceof SandboxError&&e.status===422)
 checks.push({name:"outside_territory_creation_rejected",result:"PASS"})
 await assert.rejects(p.query("SELECT * FROM sentinela_geo_lab.regions"),e=>e.code==="42501")
 checks.push({name:"rls_geometries_not_directly_readable_by_runtime",result:"PASS"})
 result={result:"PASS",checks,parityCases:cases.length,sqlReal:true}
}catch(e){result={result:"FAIL",stage,sqlState:e.sqlState??e.code,status:e.status,checks}}
finally{await service.close();await p.end()}
process.stdout.write(JSON.stringify(result));if(result.result!=="PASS")process.exitCode=1
