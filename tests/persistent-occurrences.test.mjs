import "../scripts/contracts-runtime.mjs"
import { registerHooks } from "node:module"
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomBytes, scryptSync, createHash } from "node:crypto"
registerHooks({ resolve(s,c,next) {
  if(s === "server-only")return { url:"data:text/javascript,export{}",shortCircuit:true }
  return next(s === "next/server" ? "next/server.js" : s,c)
} })
const { operationalConfig, DatabaseUnavailable } = await import("../src/lib/db/config.ts")
const { occurrenceSql } = await import("../src/lib/db/occurrence-query.ts")
const { queryOccurrences } = await import("../src/lib/db/occurrences.ts")
const { persistentQuerySchema, parsePersistentQuery, persistentListResponseSchema } = await import("../src/contracts/persistent-occurrences.ts")
const { occurrenceGET, isLocalReadEndpoint } = await import("../src/lib/db/http.ts")
const local = await import("../src/lib/auth/local-provider.ts")
const env = { NODE_ENV:"development", SENTINELA_AUTH_PROVIDER:"local", SENTINELA_LOCAL_BIND:"127.0.0.1", SENTINELA_APP_ORIGIN:"http://localhost:3000",
  SENTINELA_LOCAL_READER_URL:"postgresql://sentinela_local_reader:synthetic%40test@127.0.0.1:5432/sentinela_dev_operacional" }
test("reader config: exact loopback, own role, decoding once, no administrative fallback", () => {
  assert.equal(operationalConfig(env).password,"synthetic@test")
  for (const url of [undefined, env.SENTINELA_LOCAL_READER_URL.replace("127.0.0.1","localhost"), env.SENTINELA_LOCAL_READER_URL.replace("127.0.0.1","example.test"), env.SENTINELA_LOCAL_READER_URL.replace("5432","55432"), env.SENTINELA_LOCAL_READER_URL.replace("sentinela_local_reader","postgres"), env.SENTINELA_LOCAL_READER_URL+"?host=evil.test", env.SENTINELA_LOCAL_READER_URL.replace("sentinela_dev_operacional","postgres")]) {
    assert.throws(()=>operationalConfig({...env,SENTINELA_LOCAL_READER_URL:url,SENTINELA_DATABASE_URL:env.SENTINELA_LOCAL_READER_URL}),DatabaseUnavailable)
  }
  assert.throws(()=>operationalConfig({...env,NODE_ENV:"production"}),DatabaseUnavailable)
  assert.throws(()=>operationalConfig({...env,SENTINELA_AUTH_PROVIDER:"supabase"}),DatabaseUnavailable)
  for(const alias of ["127.1","2130706433","0x7f000001","%31%32%37.0.0.1"])
    assert.throws(()=>operationalConfig({...env,SENTINELA_LOCAL_READER_URL:env.SENTINELA_LOCAL_READER_URL.replace("127.0.0.1",alias)}),DatabaseUnavailable)
})
test("persistent filters reject unknown/duplicate keys, invalid IDs, dates, page sizes and sorting injection", () => {
  for (const s of ["page=0","pageSize=101","page=1&page=2","raId=x","naturezaId=%23demo","startDate=2026-02-30","startDate=2026-12-01&endDate=2026-01-01","sortBy=id;DROP TABLE x","host=evil.test","includeInactive=true"])
    assert.throws(()=>parsePersistentQuery(new URLSearchParams(s)),s)
})
test("occurrence repository denies non-local and unknown principals before opening a pool", () => {
  const query=persistentQuerySchema.parse({})
  const principal={id:"test",authUserId:"",name:"Synthetic",role:"Analista",source:"local"}
  assert.throws(()=>queryOccurrences({...principal,source:"supabase"},query),DatabaseUnavailable)
  assert.throws(()=>queryOccurrences({...principal,role:"Unknown"},query),DatabaseUnavailable)
})
test("SQL binds combined filters/injection literally; stable pagination, scalar count and many-nature aggregation", () => {
  const attack="%' OR true; DROP TABLE sentinela.ocorrencias; --"
  const query=persistentQuerySchema.parse({raId:"10000000-0000-4000-8000-000000000001",naturezaId:"30000000-0000-4000-8000-000000000001",startDate:"2026-01-01",endDate:"2026-12-31",identificacao:attack,local:attack,page:3,pageSize:10,sortBy:"ra",direction:"asc"})
  const sql=occurrenceSql(query)
  assert(!sql.text.includes(attack));assert(sql.values.includes(attack));assert.deepEqual(sql.values.slice(-2),[10,20])
  assert.match(sql.text,/EXISTS \(SELECT/);assert.match(sql.text,/count\(\*\)::text FROM filtered/)
  assert.match(sql.text,/ra_nome ASC NULLS LAST, id ASC/);assert.match(sql.text,/jsonb_agg/)
  assert(!sql.text.includes("SELECT o.*"));assert(!sql.text.includes("eventos_auditoria"));assert(!sql.text.includes("geometria"))
  const detail=occurrenceSql(persistentQuerySchema.parse({}),"50000000-0000-4000-8000-000000000001")
  assert.match(detail.text,/o.id=\$1::uuid/);assert.deepEqual(detail.values.slice(-2),[1,0])
})
test("occurrence GET patterns remain allowed; other occurrence methods and unrelated APIs remain closed", () => {
  assert(isLocalReadEndpoint("/api/v1/ocorrencias","GET"));assert(isLocalReadEndpoint("/api/v1/ocorrencias/invalid-id","GET"))
  for(const method of ["POST","PATCH","DELETE","HEAD"]) assert(!isLocalReadEndpoint("/api/v1/ocorrencias",method))
  for(const path of ["/api/v1/ocorrencias/x/inativacao","/api/usuarios","/api/ocorrencias/geocode"]) assert(!isLocalReadEndpoint(path,"GET"))
})
test("handlers authenticate before query; local three roles, empty pages, details, errors and no mock fallback", async t => {
  const before={...process.env};Object.assign(process.env,env);t.after(()=>{for(const k of Object.keys(env)) { if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k] }})
  const request=(search="")=>new Request("http://localhost:3000/api/v1/ocorrencias"+search,{headers:{host:"localhost:3000"}})
  let calls=0;const query=async()=>{calls++;return {items:[],pagination:{page:1,pageSize:25,total:0,totalPages:0}}}
  const principal=role=>({source:"local",id:"synthetic",authUserId:"",name:"Synthetic",role})
  assert.equal((await occurrenceGET(request(),undefined,{principal:async()=>null,query})).status,401);assert.equal(calls,0)
  for(const role of ["Administrador","Operador","Analista"]) {
    const response=await occurrenceGET(request(),undefined,{principal:async()=>principal(role),query})
    assert.equal(response.status,200);persistentListResponseSchema.parse(await response.json());assert.match(response.headers.get("cache-control"),/no-store/)
  }
  const run=(id,q=query,p=principal("Analista"),req=request())=>occurrenceGET(req,id,{principal:async()=>p,query:q})
  assert.equal((await run(undefined,query,principal("invalid"))).status,403)
  assert.equal((await run(undefined,query,{...principal("Administrador"),source:"supabase"})).status,403)
  assert.equal((await run("not-a-uuid")).status,400)
  assert.equal((await run("50000000-0000-4000-8000-000000000001")).status,404)
  assert.equal((await run(undefined,query,principal("Analista"),request("?host=remote"))).status,400)
  const failed=await run(undefined,async()=>{throw new DatabaseUnavailable()});assert.equal(failed.status,503);assert.equal((await failed.json()).success,false)
  const internal=await run(undefined,async()=>{throw Error("private SQL password sentinel")});assert.equal(internal.status,500);assert(!(await internal.text()).includes("sentinel"))
  assert.equal(await local.localSession("bad-token","localhost:3000",env),null)
  assert.equal(await local.localSession("a".repeat(64),"localhost:3000",env,Number.MAX_SAFE_INTEGER),null)
})
test("real synthetic local sessions: three roles, proxy GET exception, forged/expired sessions and logout deny before querying",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"sentinela-api-auth-"));const before={...process.env}
  const password=randomBytes(20).toString("hex")
  const roles=["Administrador","Operador","Analista"]
  const accounts=roles.map((role,i)=>{const salt=randomBytes(16).toString("hex");return {role,email:`synthetic-${i}@example.test`,salt,hash:scryptSync(password,Buffer.from(salt,"hex"),64).toString("hex")}})
  const file=join(dir,"accounts.json");await writeFile(file,JSON.stringify({accounts}))
  Object.assign(process.env,env,{SENTINELA_LOCAL_ACCOUNTS_FILE:file})
  try{
    const { proxy }=await import("../src/proxy.ts");const { NextRequest }=await import("next/server.js")
    let calls=0
    const execute=token=>occurrenceGET(new Request("http://localhost:3000/api/v1/ocorrencias",{headers:{host:"localhost:3000"}}),undefined,{
      principal:()=>local.localSession(token,"localhost:3000"),query:async()=>{calls++;return {items:[],pagination:{page:1,pageSize:25,total:0,totalPages:0}}},
    })
    for(const account of accounts){
      const token=await local.localLogin(account.email,password,"localhost:3000")
      assert(token);assert.equal((await execute(token)).status,200)
      const request=method=>new NextRequest("http://localhost:3000/api/v1/ocorrencias",{method,headers:{host:"localhost:3000",cookie:`${local.LOCAL_COOKIE}=${token}`}})
      assert.equal((await proxy(request("GET"))).headers.get("x-middleware-next"),"1")
      assert.equal((await proxy(request("POST"))).status,403)
      const path=join(dir,"sentinela-sessions",createHash("sha256").update(token).digest("hex")+".json")
      const saved=JSON.parse(await readFile(path,"utf8"));await writeFile(path,JSON.stringify({...saved,expires:0}))
      const count=calls;assert.equal((await execute(token)).status,401);assert.equal(calls,count)
      assert.equal((await proxy(request("GET"))).status,401)
      await local.localLogout(token)
      assert.equal((await execute(token)).status,401)
    }
    const count=calls;assert.equal((await execute("f".repeat(64))).status,401);assert.equal(calls,count)
  }finally{
    for(const key of [...Object.keys(env),"SENTINELA_LOCAL_ACCOUNTS_FILE"]){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key]}
    await rm(dir,{recursive:true,force:true})
  }
})
test("persistent detail preserves multiple associations and null related records without demo mapping",async t=>{
  const before={...process.env};Object.assign(process.env,env);t.after(()=>{for(const key of Object.keys(env)){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key]}})
  const { contractModels }=await import("../src/contracts/examples.ts")
  const { persistentDetailResponseSchema }=await import("../src/contracts/persistent-occurrences.ts")
  const item=structuredClone(contractModels.PersistentDetail.example.data)
  item.naturezas=[1,2].map(i=>({id:`60000000-0000-4000-8000-00000000000${i}`,crimeTentado:false,classificacaoStatus:"homologada",natureza:null,categoria:null}))
  const response=await occurrenceGET(new Request("http://localhost:3000/api/v1/ocorrencias/"+item.id,{headers:{host:"localhost:3000"}}),item.id,{
    principal:async()=>({source:"local",role:"Operador",id:"synthetic",authUserId:"",name:"Synthetic"}),query:async()=>({items:[item],pagination:{page:1,pageSize:25,total:1,totalPages:1}}),
  })
  assert.equal(response.status,200);const payload=persistentDetailResponseSchema.parse(await response.json());assert.equal(payload.data.naturezas.length,2)
})
