import "../scripts/contracts-runtime.mjs"
import { registerHooks } from "node:module"
import test from "node:test"
import assert from "node:assert/strict"
registerHooks({ resolve(s,c,next) {
  if(s === "server-only") return {url:"data:text/javascript,export{}",shortCircuit:true}
  if(s === "pg") return {url:new URL("./fixtures/catalog-pool.mjs",import.meta.url).href,shortCircuit:true}
  return next(s,c)
} })
const { CATALOG_PATHS, catalogDataSchemas, catalogResponseSchemas } = await import("../src/contracts/persistent-catalogs.ts")
const { catalogSql } = await import("../src/lib/db/catalog-query.ts")
const { catalogGET } = await import("../src/lib/db/catalog-http.ts")
const { queryCatalog } = await import("../src/lib/db/catalogs.ts")
const { DatabaseUnavailable } = await import("../src/lib/db/config.ts")
const { isLocalReadEndpoint } = await import("../src/lib/db/http.ts")
const { readCatalog, queryFromFilters, emptyFilters } = await import("../src/features/occurrences/client.ts")
const { contractModels } = await import("../src/contracts/examples.ts")
const { state } = await import("./fixtures/catalog-pool.mjs")
const principal = role => ({source:"local",role,id:"synthetic",name:"Synthetic",authUserId:""})
const examples = {regioes:contractModels.RegionCatalog.example,naturezas:contractModels.NatureCatalog.example}
function configure(t) {
  const env={NODE_ENV:"development",SENTINELA_AUTH_PROVIDER:"local",SENTINELA_LOCAL_BIND:"127.0.0.1",SENTINELA_APP_ORIGIN:"http://localhost:3000",
    SENTINELA_LOCAL_READER_URL:"postgresql://sentinela_local_reader:synthetic@127.0.0.1:5432/sentinela_dev_operacional"}
  const before={...process.env};Object.assign(process.env,env)
  t.after(()=>{for(const k of Object.keys(env))if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k]})
}
test("catalog contracts accept persisted UUID/text and empty sets, reject null, duplicates and restricted columns",()=>{
  for(const kind of Object.keys(CATALOG_PATHS)) {
    const sample=examples[kind];catalogResponseSchemas[kind].parse(sample)
    catalogDataSchemas[kind].parse({items:[]})
    const row=sample.data.items[0],field=kind==="regioes"?"nome":"descricao"
    for(const invalid of [{...row,id:"#demo"},{...row,[field]:null},{...row,[field]:""},{...row,limite:"private geometry"}])
      assert(!catalogDataSchemas[kind].safeParse({items:[invalid]}).success)
    assert(!catalogDataSchemas[kind].safeParse({items:[row,row]}).success)
  }
})
test("catalog SQL selects only approved fields and has a stable C/text/UUID ordering without client identifiers",()=>{
  assert.deepEqual(catalogSql("regioes"),{text:'SELECT id, nome FROM sentinela.regioes_administrativas ORDER BY lower(nome) COLLATE "C", nome COLLATE "C", id ASC',values:[]})
  const sql=catalogSql("naturezas");assert.match(sql.text,/descricao_original AS descricao/)
  assert.match(sql.text,/ORDER BY lower\(descricao_original\) COLLATE "C", descricao_original COLLATE "C", id ASC/)
  for(const kind of ["usuarios","regioes; DROP","__proto__"])assert.throws(()=>catalogSql(kind))
  for(const kind of Object.keys(CATALOG_PATHS))assert(!/\*|LIMIT|categoria|limite|SECURITY|SET ROLE|row_security/i.test(catalogSql(kind).text))
})
test("nature parameters are literal, bounded and checked before the repository is reached",async t=>{
  configure(t)
  const request = suffix => new Request("http://localhost:3000"+CATALOG_PATHS.naturezas+suffix,{headers:{host:"localhost:3000"}})
  const calls=[]
  const run = (suffix,p=principal("Analista")) => catalogGET(request(suffix),"naturezas",{
    principal:async()=>p,query:async(...args)=>{calls.push(args);return {items:[]}},
  })
  assert.equal((await run("?q=%20%25_%20&direction=desc")).status,200)
  const query=calls[0][2]
  assert.deepEqual(query,{q:"%_",direction:"desc"})
  const sql=catalogSql("naturezas",query)
  assert.deepEqual(sql.values,["%_"])
  assert.match(sql.text,/strpos\(lower\(descricao_original\), lower\(\$1::text\)\)/)
  assert.match(sql.text,/COLLATE "C" DESC, descricao_original COLLATE "C" DESC, id ASC/)
  assert(!sql.text.includes("%_"))
  for(const invalid of ["?q=", "?q=%20", "?q=%00", "?q="+ "a".repeat(121), "?q=a&q=b", "?direction=asc&direction=desc", "?direction=DOWN"]) {
    assert.equal((await run(invalid)).status,400)
  }
  assert.equal((await run("?q=",null)).status,401)
  assert.equal(calls.length,1)
})
test("catalog repository uses attested read-only transactions, preserves RLS projection, validates rows and never falls back",async t=>{
  configure(t)
  for(const kind of Object.keys(CATALOG_PATHS)) {
    state.queries=[];state.rows=examples[kind].data.items
    assert.deepEqual(await queryCatalog(principal("Analista"),kind),examples[kind].data)
    assert.match(state.queries[0],/REPEATABLE READ READ ONLY/)
    assert(state.queries.some(q=>q.includes("relforcerowsecurity")))
    assert(state.queries.includes(catalogSql(kind).text));assert.equal(state.queries.at(-1),"COMMIT")
    state.rows=[];assert.deepEqual(await queryCatalog(principal("Operador"),kind),{items:[]})
  }
  state.rows=[{id:"invalid",nome:"not a persisted UUID"}]
  await assert.rejects(queryCatalog(principal("Administrador"),"regioes"),DatabaseUnavailable)
  assert.equal(state.queries.at(-1),"ROLLBACK")
  state.fail=true;await assert.rejects(queryCatalog(principal("Analista"),"regioes"),DatabaseUnavailable);state.fail=false
  state.identity.rls=18;await assert.rejects(queryCatalog(principal("Analista"),"regioes"),DatabaseUnavailable);state.identity.rls=19
  assert.throws(()=>queryCatalog({...principal("Administrador"),source:"supabase"},"regioes"),DatabaseUnavailable)
})
test("catalog handlers authenticate all three profiles and reject absent/expired sessions, foreign identities, parameters and unsafe environments",async t=>{
  configure(t);let calls=0
  for(const kind of Object.keys(CATALOG_PATHS)) {
    const req=(suffix="",host="localhost:3000")=>new Request("http://localhost:3000"+CATALOG_PATHS[kind]+suffix,{headers:{host}})
    const run=(p,request=req())=>catalogGET(request,kind,{principal:async()=>p,query:async()=>{calls++;return examples[kind].data}})
    const before=calls;assert.equal((await run(null)).status,401);assert.equal(calls,before)
    for(const role of ["Administrador","Operador","Analista"]) {
      const r=await run(principal(role));assert.equal(r.status,200);catalogResponseSchemas[kind].parse(await r.json())
      assert.match(r.headers.get("cache-control"),/private, no-store/);assert.match(r.headers.get("vary"),/Cookie, Host/)
    }
    assert.equal((await run(principal("Unknown"))).status,403)
    assert.equal((await run({...principal("Administrador"),source:"supabase"})).status,403)
    for(const s of ["?host=evil.test","?page=1","?role=postgres","?x=1&x=2"])assert.equal((await run(principal("Analista"),req(s))).status,400)
    assert.equal((await run(principal("Analista"),req("","evil.test"))).status,403)
    process.env.NODE_ENV="production";assert.equal((await run(principal("Administrador"))).status,403);process.env.NODE_ENV="development"
  }
})
test("catalog error envelopes sanitize SQL/connection failures and distinguish unavailable from empty",async t=>{
  configure(t)
  for(const error of [new DatabaseUnavailable(),Error("SELECT password private-host postgresql://secret")]) {
    const r=await catalogGET(new Request("http://localhost:3000"+CATALOG_PATHS.regioes,{headers:{host:"localhost:3000"}}),"regioes",{principal:async()=>principal("Analista"),query:async()=>{throw error}})
    assert.equal(r.status,error instanceof DatabaseUnavailable?503:500)
    const text=await r.text();assert(!/SELECT|password|private-host|postgresql:/.test(text));assert.equal(JSON.parse(text).success,false)
  }
})
test("proxy allowlist admits only exact catalog GET routes and no arbitrary or write endpoints",()=>{
  for(const path of Object.values(CATALOG_PATHS)) {
    assert(isLocalReadEndpoint(path,"GET"))
    for(const method of ["POST","PATCH","DELETE","HEAD"])assert(!isLocalReadEndpoint(path,method))
    for(const suffix of ["/private","/","/id"])assert(!isLocalReadEndpoint(path+suffix,"GET"))
  }
  assert(!isLocalReadEndpoint("/api/v1/catalogos/usuarios","GET"))
})
test("catalog client uses same-origin GET/no-store, validates payloads, keeps UUIDs for combined filters and supports empty sets",async()=>{
  for(const kind of Object.keys(CATALOG_PATHS)) {
    const fetcher=async(url,options)=>{assert.equal(url,CATALOG_PATHS[kind]);assert.equal(options.method,"GET");assert.equal(options.credentials,"same-origin");assert.equal(options.cache,"no-store");return Response.json(examples[kind])}
    assert.deepEqual(await readCatalog(kind,new AbortController().signal,fetcher),examples[kind].data)
    assert.deepEqual(await readCatalog(kind,new AbortController().signal,async()=>Response.json({...examples[kind],data:{items:[]}})),{items:[]})
  }
  const q=queryFromFilters({...emptyFilters(),raId:examples.regioes.data.items[0].id,naturezaId:examples.naturezas.data.items[0].id,local:"synthetic"})
  assert.equal(q.page,1);assert.equal(q.raId,examples.regioes.data.items[0].id);assert.equal(q.naturezaId,examples.naturezas.data.items[0].id)
})
test("catalog client rejects HTTP/network/malformed contracts without demo fallback or server messages",async()=>{
  for(const status of [401,403,500,503])await assert.rejects(readCatalog("regioes",new AbortController().signal,async()=>Response.json({private:"secret"},{status})),e=>e.status===status&&!e.message.includes("secret"))
  for(const payload of [{unexpected:true},{...examples.regioes,data:{items:[{id:"bad",nome:"invalid"}]}}])
    await assert.rejects(readCatalog("regioes",new AbortController().signal,async()=>Response.json(payload)),/Resposta inesperada/)
  await assert.rejects(readCatalog("regioes",new AbortController().signal,async()=>{throw Error("private network detail")}),e=>!e.message.includes("private"))
})
test("obsolete catalog responses are rejected even if the fetch transport ignores cancellation",async()=>{
  const controller=new AbortController()
  await assert.rejects(readCatalog("regioes",controller.signal,async()=>{controller.abort();return Response.json(examples.regioes)}),{name:"AbortError"})
})
