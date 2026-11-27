import "./contracts-runtime.mjs"
import { createRequire } from "node:module"
import { readFile,writeFile,mkdir } from "node:fs/promises"
import { randomUUID,createHash } from "node:crypto"
import { Pool } from "pg"
import { readCheckStatus } from "./ra-audit-policy.mjs"
const { operationalConfig }=await import("../src/lib/db/config.ts")
const req=createRequire(import.meta.url)
createRequire(req.resolve("next/package.json"))("@next/env").loadEnvConfig(process.cwd(),true,{info(){},error(){}})
const directory=`tmp/ra-preoperational-${randomUUID()}`
const report={format:1,createdAt:new Date().toISOString(),checks:[],directory}
let pool,client,stage="configuration"
try{
 const config=operationalConfig({...process.env,NODE_ENV:"development"})
 stage="connection"
 for(const key of Object.keys(process.env))if(key.startsWith("PG"))delete process.env[key]
 pool=new Pool({...config,max:1,connectionTimeoutMillis:5000,options:"-c default_transaction_read_only=on -c statement_timeout=15000 -c search_path=pg_catalog",application_name:"sentinela-readonly-audit"})
 pool.on("error",()=>{})
 client=await pool.connect()
 stage="metadata"
 const snapshotSql=await readFile("database/local/write-sandbox/preoperational-snapshot.sql","utf8")
 const results=await client.query(snapshotSql)
 report.snapshot=results.find(r=>r.rows?.[0]?.jsonb_build_object)?.rows[0].jsonb_build_object
 if(!report.snapshot||report.snapshot.identity.executor!=="sentinela_local_reader"||report.snapshot.identity.host!=="127.0.0.1"||report.snapshot.identity.port!==5432||report.snapshot.identity.database!=="sentinela_dev_operacional"||report.snapshot.identity.readonly!=="on")throw Error("identity")
 await client.query("BEGIN READ ONLY")
 const checks=[
  ["visible_catalog", "SELECT count(*)::int AS visible_count FROM sentinela.regioes_administrativas"],
  ["ledger","SELECT versao FROM sentinela.schema_migrations ORDER BY versao"],
  ["system_identifier","SELECT system_identifier::text FROM pg_control_system()"],
  ["get_projection","SELECT id,nome FROM sentinela.regioes_administrativas ORDER BY lower(nome) COLLATE \"C\",nome COLLATE \"C\",id"],
  ["internal_users_denied","SELECT id FROM sentinela.usuarios LIMIT 0"],
  ["write_privileges","SELECT relname,has_table_privilege(current_user,oid,'INSERT') OR has_any_column_privilege(current_user,oid,'INSERT') AS insert,has_table_privilege(current_user,oid,'UPDATE') OR has_any_column_privilege(current_user,oid,'UPDATE') AS update,has_table_privilege(current_user,oid,'DELETE') AS delete FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r' ORDER BY relname"],
 ]
 for(const [name,sql]of checks){
  await client.query("SAVEPOINT audit_check")
  try{const r=await client.query(sql);report.checks.push({name,status:readCheckStatus(name,r.rows),rows:r.rows})}
  catch(e){await client.query("ROLLBACK TO SAVEPOINT audit_check");report.checks.push({name,status:name==="internal_users_denied"&&e.code==="42501"?"PASS":"NOT VERIFIED",sqlState:e.code})}
  await client.query("RELEASE SAVEPOINT audit_check")
 }
 await client.query("ROLLBACK")
 report.catalogTotal={status:"NOT VERIFIED",reason:"Reader is subject to RLS; visible count is not global count"}
 report.result=report.checks.some(c=>c.status==="FAIL")?"FAIL":"PASS"
 if(report.result==="FAIL")process.exitCode=1
}catch(e){report.result="FAIL";report.stage=stage;report.sqlState=/^[0-9A-Z]{5}$/.test(e.code??"")?e.code:undefined;report.reason="Sanitized audit failure; no credential fallback";process.exitCode=1}
finally{client?.release();if(pool)await pool.end()}
await mkdir(directory,{recursive:true})
const bytes=JSON.stringify(report,null,2)
await writeFile(`${directory}/audit.json`,bytes)
await writeFile(`${directory}/sha256.txt`,createHash("sha256").update(bytes).digest("hex"))
console.log(JSON.stringify({result:report.result,directory,executor:report.snapshot?.identity.executor,checks:report.checks.map(({name,status,sqlState})=>({name,status,sqlState}))}))
