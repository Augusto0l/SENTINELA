import "../scripts/contracts-runtime.mjs"
import { registerHooks } from "node:module"
import test from "node:test"
import assert from "node:assert/strict"
registerHooks({ resolve(s,c,next) {
  if(s==="server-only")return {url:"data:text/javascript,export{}",shortCircuit:true}
  if(s==="pg")return next(new URL("./fixtures/reader-pool.mjs",import.meta.url).href,c)
  return next(s,c)
} })
const { state } = await import("./fixtures/reader-pool.mjs")
const { readOperational } = await import("../src/lib/db/pool.ts")
const { DatabaseUnavailable } = await import("../src/lib/db/config.ts")
test("pool: three connections, read-only transaction, identity checked before data, rollback/discard, no remote",async t=>{
  const env={NODE_ENV:"development",SENTINELA_AUTH_PROVIDER:"local",SENTINELA_LOCAL_BIND:"127.0.0.1",SENTINELA_LOCAL_READER_URL:"postgresql://sentinela_local_reader:synthetic@127.0.0.1:5432/sentinela_dev_operacional"}
  const before={...process.env};Object.assign(process.env,env);t.after(()=>{for(const key of Object.keys(env)){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key]}})
  const principal={source:"local",role:"Analista",id:"synthetic",name:"Synthetic",authUserId:""}
  const identity={db:"sentinela_dev_operacional",login:"sentinela_local_reader",role:"sentinela_local_reader",host:"127.0.0.1",port:5432,version:"170011",elevated:false,member:false,owner:false,rls:19}
  state.identity=identity
  assert.equal(await readOperational(principal,async()=>"ok"),"ok")
  assert.equal(state.options.max,3);assert.equal(state.options.host,"127.0.0.1");assert.match(state.options.options,/read_only=on/)
  assert.equal(state.queries[0],"BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");assert.equal(state.queries.at(-1),"COMMIT");assert.equal(state.released,false)
  for(const [key,value] of [["host","remote"],["role","postgres"],["login","postgres"],["elevated",true],["member",true],["owner",true],["rls",18],["port",55432]]) {
    state.identity={...identity,[key]:value};let called=false
    await assert.rejects(()=>readOperational(principal,async()=>{called=true}),DatabaseUnavailable)
    assert.equal(called,false);assert.equal(state.queries.at(-1),"ROLLBACK");assert.equal(state.released,true)
  }
  await assert.rejects(()=>readOperational({...principal,source:"supabase"},async()=>{}),DatabaseUnavailable)
  state.fail=true;await assert.rejects(()=>readOperational(principal,async()=>{}),DatabaseUnavailable)
})
