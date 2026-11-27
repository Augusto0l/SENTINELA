// Real SQL qualification; secrets arrive via stdin only. No .env, no admin pool.
import "../../../scripts/contracts-runtime.mjs"
import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { writeFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { Pool } from "pg"
const {createSandboxRegistrar,SandboxError,attestManifest}=await import("./service.ts")
let raw="";for await(const chunk of process.stdin)raw+=chunk
const {config,analyst}=JSON.parse(raw);raw=""
const sessions=new Map()
for(const role of ["Administrador","Operador","Analista"])sessions.set(randomBytes(32).toString("hex"),{kind:"sandbox-synthetic-only",role})
const token=role=>[...sessions].find(([,s])=>s.role===role)[0]
const service=createSandboxRegistrar(config,async t=>sessions.get(t)??null)
const checks=[],ids=new Set(),pools=[]
let links=0
const body=()=>({data:"2026-11-11",horario:"12:34:56",raId:"11000000-0000-4000-8000-000000000001",local:"Endereco exclusivamente SINTETICO",
  coordenadas:{latitude:-15.79,longitude:-47.88},naturezas:[1,2].map(n=>({naturezaId:`31000000-0000-4000-8000-00000000000${n}`,crimeTentado:null}))})
function pass(name){checks.push({name,result:"PASS"})}
async function reject(name,fn,status){await assert.rejects(fn,e=>e instanceof SandboxError&&e.status===status);pass(name)}
async function create(role,input=body(),key=randomUUID()){
  const result=await service.register(token(role),input,key)
  assert.equal(result.scope,"sandbox-synthetic-only");assert.equal(result.persisted,true)
  assert.equal(result.data.atorSintetico,role==="Administrador"?"sentinela_sbx_admin":"sentinela_sbx_operator")
  if(!ids.has(result.data.id)){ids.add(result.data.id);links+=input.naturezas.length}
  return result
}
function pool(user,password){const p=new Pool({host:"127.0.0.1",port:55432,database:"sentinela_rls_sandbox",user,password,ssl:false,max:2,connectionTimeoutMillis:2000,statement_timeout:4000});p.on("error",()=>{});pools.push(p);return p}
let stage="initial",result
try{
  await attestManifest(config);pass("manifest_files_and_cluster_guard")
  stage="authorization"
  await reject("missing_session",()=>service.register(undefined,body(),randomUUID()),401)
  await reject("tampered_session",()=>service.register("forged",body(),randomUUID()),401)
  await reject("analyst_denied_before_sql",()=>service.register(token("Analista"),body(),randomUUID()),403)
  const admin=await create("Administrador");pass("administrator_real_insert")
  await create("Operador");pass("operator_real_insert")
  stage="validation"
  for(const field of ["data","horario","raId","local","coordenadas","naturezas"]){const p=body();delete p[field];await reject("required_"+field,()=>create("Administrador",p),422)}
  for(const [name,patch] of Object.entries({null_coordinates:{coordenadas:null},invalid_date:{data:"2026-02-30"},invalid_time:{horario:"24:00:00"},invalid_uuid:{raId:"RA-I"},invalid_coordinates:{coordenadas:{latitude:91,longitude:0}},empty_natures:{naturezas:[]},immutable_id:{id:randomUUID()},forged_actor:{usuarioId:randomUUID()},forged_profile:{perfil:"Administrador"},invalid_state:{ativo:false},malformed:{unexpected:true}}))
    await reject(name,()=>create("Administrador",{...body(),...patch}),422)
  const duplicate=body();duplicate.naturezas.push({...duplicate.naturezas[0]})
  await reject("duplicate_nature_links",()=>create("Administrador",duplicate),422)
  await reject("malformed_payload",()=>create("Administrador","not-json"),422)
  await reject("region_not_found",()=>create("Administrador",{...body(),raId:randomUUID()}),422)
  await reject("outside_synthetic_boundary",()=>create("Administrador",{...body(),coordenadas:{latitude:-20,longitude:-50}}),422)
  const partial=body();partial.naturezas[1].naturezaId=randomUUID()
  await reject("rollback_parent_and_first_link_after_missing_second_nature",()=>create("Administrador",partial),422)
  stage="idempotency"
  const key=randomUUID(),input=body()
  const first=await create("Administrador",input,key),second=await create("Administrador",input,key)
  assert.deepEqual(first,second);pass("idempotent_identity_no_duplicate")
  await reject("same_key_different_command_conflict",()=>create("Administrador",{...input,local:"Outro endereco SINTETICO"},key),409)
  const concurrentKey=randomUUID()
  const concurrent=await Promise.all(Array.from({length:5},()=>create("Operador",body(),concurrentKey)))
  assert.equal(new Set(concurrent.map(r=>r.data.id)).size,1);pass("five_concurrent_same_key_one_record")
  // No approved business deduplication for manual data: different commands never merge silently.
  const separate=await Promise.all([create("Operador"),create("Operador")]);assert.notEqual(separate[0].data.id,separate[1].data.id);pass("different_manual_commands_not_merged")
  const injection=body();injection.local="'; DROP TABLE sentinela.ocorrencias; --"
  await create("Administrador",injection);pass("parameterized_sql_injection_literal")
  await service.close();pass("runtime_pools_closed_before_direct_privilege_probes")
  stage="native_sql_security"
  const operator=pool(config.credentials.Operador.user,config.credentials.Operador.password)
  const observer=pool("sentinela_sbx_analyst",analyst)
  for(const p of [operator,observer]){
    stage="native_attributes_"+p.options.user
    const {rows:[r]}=await p.query(`SELECT current_user AS actor,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,rolinherit,
      EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) AS member,
      EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid) AS owner FROM pg_roles r WHERE rolname=current_user`)
    for(const [k,v]of Object.entries(r))if(k!=="actor")assert.equal(v,false)
  }
  pass("direct_scram_logins_without_admin_membership_or_ownership")
  stage="analyst_execute_denial"
  await assert.rejects(observer.query("SELECT sentinela_write_lab.cadastrar($1::jsonb,$2::uuid)",[JSON.stringify(body()),randomUUID()]),e=>e.code==="42501");pass("analyst_sql_execute_denied")
  for(const sql of ["SELECT * FROM sentinela.usuarios","SELECT * FROM sentinela.eventos_auditoria","SELECT * FROM sentinela_write_lab.commands",
    "INSERT INTO sentinela.ocorrencias(id) SELECT gen_random_uuid() WHERE false","UPDATE sentinela.ocorrencias SET ativo=false WHERE false","DELETE FROM sentinela.ocorrencias WHERE false",
    "CREATE TABLE sentinela.invalid_sandbox_probe(id int)","CREATE TEMP TABLE invalid_sandbox_probe(id int)"]){
    stage="denied_statement_"+sql.split(" ").slice(0,2).join("_")
    const client=await operator.connect();try{await client.query("BEGIN");await assert.rejects(client.query(sql),e=>e.code==="42501")}finally{await client.query("ROLLBACK");client.release()}
  }
  pass("direct_dml_ddl_temp_users_audit_and_ledger_denied")
  await assert.rejects(operator.query("SELECT sentinela_write_lab.cadastrar($1::jsonb,$2::uuid)",[JSON.stringify({...body(),usuarioId:randomUUID()}),randomUUID()]),e=>e.code==="22023");pass("direct_sql_forged_actor_rejected")
  const client=await operator.connect()
  try{
    await client.query("BEGIN");await client.query("SET LOCAL app.perfil='Administrador'")
    const {rows:[r]}=await client.query("SELECT sentinela_write_lab.cadastrar($1::jsonb,$2::uuid) AS result",[JSON.stringify(body()),randomUUID()])
    assert.equal(r.result.atorSintetico,"sentinela_sbx_operator")
    await client.query("ROLLBACK")
  }finally{client.release()}
  pass("forged_guc_cannot_change_native_synthetic_actor_and_full_rollback")
  // RLS check cannot be bypassed by these LOGIN roles or by setting row_security off.
  const off=await operator.connect();try{await off.query("BEGIN");await off.query("SET LOCAL row_security=off");await assert.rejects(off.query("SELECT sentinela_write_lab.cadastrar($1::jsonb,$2::uuid)",[JSON.stringify(body()),randomUUID()]),e=>e.code==="42501")}finally{await off.query("ROLLBACK");off.release()}
  pass("force_rls_not_bypassed_by_session_setting")
  stage="configuration_denials"
  const actualEnv=process.env.NODE_ENV;process.env.NODE_ENV="production"
  await reject("production_guard",()=>service.register(token("Administrador"),body(),randomUUID()),403);process.env.NODE_ENV=actualEnv
  const wrong=createSandboxRegistrar({...config,expectedUUID:randomUUID()},async()=>({kind:"sandbox-synthetic-only",role:"Administrador"}))
  await reject("wrong_cluster_uuid",()=>wrong.register("test",body(),randomUUID()),403);await wrong.close()
  const wrongRole=createSandboxRegistrar({...config,credentials:{...config.credentials,Administrador:{user:"postgres",password:"unused"}}},async()=>({kind:"sandbox-synthetic-only",role:"Administrador"}))
  await reject("administrative_runtime_credential_rejected",()=>wrongRole.register("test",body(),randomUUID()),403);await wrongRole.close()
  const revoked=token("Administrador");sessions.delete(revoked)
  await reject("revoked_session",()=>service.register(revoked,body(),randomUUID()),401)
  pass("no_operational_pool_no_http_endpoint")
  assert(admin.data.id)
  result={result:"PASS",checks,records:ids.size,links,sqlReal:true,actorKind:"synthetic-service-not-human"}
}catch(error){result={result:"FAIL",stage,status:error instanceof SandboxError?error.status:null,
  sqlState:error instanceof SandboxError?error.sqlState:/^[0-9A-Z]{5}$/.test(error.code??"")?error.code:undefined,
  assertionValue:typeof error.actual==="boolean"?error.actual:undefined,checks,records:ids.size,links,sqlReal:true}}
finally{await service.close();await Promise.all(pools.map(p=>p.end()))}
await writeFile(join(dirname(config.manifest),"evidence","write-child-result.json"),JSON.stringify(result,null,2),{flag:"wx"})
process.stdout.write(JSON.stringify(result));if(result.result!=="PASS")process.exitCode=1
