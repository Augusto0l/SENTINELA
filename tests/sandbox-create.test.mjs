import "../scripts/contracts-runtime.mjs"
import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp,writeFile,rm,readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join,resolve,dirname } from "node:path"
const {sandboxCreateSchema,createSandboxRegistrar,attestManifest,SandboxError}=await import("../database/local/write-sandbox/service.ts")
const {plannedOccurrenceCreateSchema}=await import("../src/contracts/planned-occurrence-writes.ts")
const valid=()=>({data:"2026-11-11",horario:"12:34:56",raId:randomUUID(),local:"Endereco SINTETICO de teste",coordenadas:{latitude:-15.79,longitude:-47.88},naturezas:[{naturezaId:randomUUID(),crimeTentado:null}]})
const config={manifest:"not-an-approved-manifest.json",expectedUUID:randomUUID(),credentials:{Administrador:{user:"postgres",password:"not-used"},Operador:{user:"postgres",password:"not-used"}}}
test("sandbox create strengthens planned contract with mandatory coordinates without changing the proposal",()=>{
  sandboxCreateSchema.parse(valid())
  for(const p of [{...valid(),coordenadas:null},{...valid(),coordenadas:undefined},{...valid(),coordenadas:{latitude:NaN,longitude:0}},{...valid(),naturezas:[]},{...valid(),usuarioId:randomUUID()},{...valid(),perfil:"Administrador"},{...valid(),id:randomUUID()},{...valid(),origem:"importacao"}])assert(!sandboxCreateSchema.safeParse(p).success)
  assert(plannedOccurrenceCreateSchema.safeParse({...valid(),coordenadas:null}).success)
  const p=valid();p.naturezas.push({...p.naturezas[0],naturezaId:p.naturezas[0].naturezaId.toUpperCase()})
  assert(!sandboxCreateSchema.safeParse(p).success)
})
test("sandbox sessions fail closed before reading any manifest or opening SQL connections",async()=>{
  for(const [session,status]of [[null,401],[{kind:"sandbox-synthetic-only",role:"Analista"},403],[{kind:"local",role:"Administrador"},403],[{kind:"sandbox-synthetic-only",role:"forged"},403]]){
    const service=createSandboxRegistrar(config,async()=>session)
    await assert.rejects(service.register("forged-token",valid(),randomUUID()),e=>e instanceof SandboxError&&e.status===status)
    await service.close()
  }
})
test("production and absent sandbox switch deny access without reading credentials or opening a pool",async t=>{
  const before={NODE_ENV:process.env.NODE_ENV,SENTINELA_SANDBOX_WRITE:process.env.SENTINELA_SANDBOX_WRITE}
  t.after(()=>{for(const [k,v]of Object.entries(before))if(v===undefined)delete process.env[k];else process.env[k]=v})
  for(const env of [{NODE_ENV:"production",SENTINELA_SANDBOX_WRITE:"1"},{NODE_ENV:"development",SENTINELA_SANDBOX_WRITE:""}]){
    Object.assign(process.env,env);await assert.rejects(attestManifest(config),e=>e.status===403)
  }
})
test("manifest refuses operational port/database, remote host, missing purpose and mismatched UUID",async t=>{
  const before={NODE_ENV:process.env.NODE_ENV,SENTINELA_SANDBOX_WRITE:process.env.SENTINELA_SANDBOX_WRITE}
  Object.assign(process.env,{NODE_ENV:"development",SENTINELA_SANDBOX_WRITE:"1"})
  const root=await mkdtemp(join(tmpdir(),"sentinela-write-unit-")),file=join(root,"manifest.json"),id=randomUUID()
  t.after(async()=>{for(const[k,v]of Object.entries(before))if(v===undefined)delete process.env[k];else process.env[k]=v
    assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert(root.includes("sentinela-write-unit-"));await rm(root,{recursive:true,force:true})})
  const m={uuid:id,purpose:"sentinela-write-sandbox-v1",phase:"INSTALLED",host:"127.0.0.1",port:55432,database:"sentinela_rls_sandbox",system_id:"123",pid:123,start_epoch:123}
  for(const patch of [{port:5432},{database:"sentinela_dev_operacional"},{host:"example.test"},{purpose:"reader"},{uuid:randomUUID()},{system_id:""},{phase:"RUNNING"}]){
    await writeFile(file,JSON.stringify({...m,...patch}));await assert.rejects(attestManifest({...config,manifest:file,expectedUUID:id}),e=>e.status===403)
  }
  await assert.rejects(attestManifest({...config,manifest:file+"-missing"}),e=>e.status===403&&!e.message.includes(root))
})
test("SQL artifacts preserve baseline protections and derive a synthetic service actor from native session_user",async()=>{
  const sql=await readFile(new URL("../database/local/write-sandbox/setup.sql",import.meta.url),"utf8")
  assert(!/DISABLE\s+(?:TRIGGER|ROW LEVEL SECURITY)|DROP\s+(?:TRIGGER|POLICY)|NO\s+FORCE\s+ROW\s+LEVEL/i.test(sql))
  assert.match(sql,/SECURITY DEFINER SET search_path=pg_catalog/)
  assert.match(sql,/ator_tipo='servico' AND usuario_id IS NULL AND servico=session_user::text/)
  assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/PRIMARY KEY\(actor,key\)/)
  assert.match(sql,/\(\(p_body->'coordenadas'\) - ARRAY/)
  assert(!/GRANT\s+(?:ALL|INSERT|UPDATE|DELETE).*TO sentinela_sbx_(?:admin|operator|analyst)/i.test(sql))
  const service=await readFile(new URL("../database/local/write-sandbox/service.ts",import.meta.url),"utf8")
  assert.match(service,/port: 55432/);assert(!service.includes("SENTINELA_LOCAL_READER_URL"));assert(!service.includes("SENTINELA_DATABASE_URL"))
})
