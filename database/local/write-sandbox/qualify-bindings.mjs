import "../../../scripts/contracts-runtime.mjs"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
const { validateBoundTerritory } = await import("../../../src/data/ra-bindings.ts")
const { createSandboxRegistrar } = await import("./service.ts")
let raw="";for await(const c of process.stdin)raw+=c
const {config,cases,mapping:providedMapping}=JSON.parse(raw);raw=""
const mapping=providedMapping??JSON.parse(await readFile("public/data/cartography/ra-bindings-synthetic.json","utf8"))
const geo=JSON.parse(await readFile("public/data/cartography/ras-ide-2026-11-13.geojson","utf8"))
const p=new Pool({host:"127.0.0.1",port:55432,database:"sentinela_rls_sandbox",user:config.credentials.Administrador.user,password:config.credentials.Administrador.password,max:1,connectionTimeoutMillis:3000})
p.on("error",()=>{})
const service=createSandboxRegistrar(config,async()=>({kind:"sandbox-synthetic-only",role:"Administrador"}))
const checks=[];let result,stage="parity"
try{
 for(const c of cases){
  const uuid=mapping.entries.find(e=>e.code===c.code)?.raId??randomUUID()
  const js=validateBoundTerritory(geo,c.lat,c.lon,uuid,mapping,"sandbox")
  const sql=(await p.query("SELECT sentinela_geo_lab.validate_uuid($1,$2,$3,$4) AS result",[c.lat,c.lon,uuid,mapping.version])).rows[0].result
  assert.equal(js.status,sql.status);assert.deepEqual(js.matches,sql.matches)
  checks.push({name:c.name,result:"PASS",status:js.status})
 }
 const c=cases.find(c=>c.name==="interior_RA-I")
 for(const [revision,patch]of [["test-pending",{entries:mapping.entries.map(e=>({...e,status:"pending"}))}],["test-source",{sourceId:"https://invalid.example/"}],["test-update",{sourceHash:"0".repeat(64)}],["missing-version",{}]]){
  const data=revision==="missing-version"?mapping:{...mapping,...patch,version:revision}
  const js=validateBoundTerritory(geo,c.lat,c.lon,c.ra_id,data,"sandbox",revision)
  const sql=(await p.query("SELECT sentinela_geo_lab.validate_uuid($1,$2,$3,$4) AS result",[c.lat,c.lon,c.ra_id,revision])).rows[0].result
  // Missing version cannot be synthesized by a client fixture.
  assert.equal(js.status,sql.status)
  assert.equal(sql.status,"reference_pending");checks.push({name:revision,result:"PASS"})
 }
 stage="runtime_acl"
 await assert.rejects(p.query("SELECT * FROM sentinela_geo_lab.bindings"),e=>e.code==="42501")
 await assert.rejects(p.query("INSERT INTO sentinela_geo_lab.bindings(version,ra_id,code,source_object_id,status,evidence) VALUES('forged',$1,'RA-I','0','approved','forged')",[c.ra_id]),e=>e.code==="42501")
 checks.push({name:"native_runtime_cannot_read_or_forge_bindings",result:"PASS"})
 stage="service"
 const body={data:"2026-11-13",horario:"12:00:00",raId:c.ra_id,local:"SINTETICO UUID-codigo versionado",coordenadas:{latitude:c.lat,longitude:c.lon},naturezas:[{naturezaId:"31000000-0000-4000-8000-000000000001",crimeTentado:null}]}
 const created=await service.register("synthetic",body,randomUUID());assert(created.persisted)
 const edited=await service.edit("synthetic",{id:c.edit_id,payload:{versaoEsperada:"2",justificativa:"Ensaio de binding versionado",alteracoes:{local:"SINTETICO apos binding aprovado"}}});assert.equal(edited.data.versao,"3")
 checks.push({name:"approved_uuid_binding_creation_edit_audit",result:"PASS"})
 result={result:"PASS",scope:"sandbox-only",parityCases:cases.length,checks}
}catch(e){result={result:"FAIL",stage,sqlState:e.sqlState??e.code,status:e.status,checks}}
finally{await service.close();await p.end()}
process.stdout.write(JSON.stringify(result));if(result.result!=="PASS")process.exitCode=1
