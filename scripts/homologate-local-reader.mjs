// Real HTTP qualification. --security-only never supplies a database credential.
import "./contracts-runtime.mjs"
import assert from "node:assert/strict"
import { randomUUID, randomBytes, scryptSync, createHash } from "node:crypto"
import { mkdir, writeFile, readFile, unlink, realpath } from "node:fs/promises"
import { join, resolve, relative, isAbsolute } from "node:path"
import { fileURLToPath } from "node:url"
import { createServer } from "node:net"
import { spawn, spawnSync } from "node:child_process"
const { persistentListResponseSchema } = await import("../src/contracts/persistent-occurrences.ts")
const { errorSchema } = await import("../src/contracts/common.ts")

const root=fileURLToPath(new URL("../",import.meta.url)), port=3317, origin=`http://127.0.0.1:${port}`
const missing="ffffffff-ffff-4fff-8fff-ffffffffffff"
export const validQueries=["", "?page=2", "?page=1000000", "?pageSize=100", "?identificacao=%27%20OR%20true%20--", "?local=%25%27%20OR%20true%20--",
  "?raId=10000000-0000-4000-8000-000000000001&naturezaId=30000000-0000-4000-8000-000000000001&startDate=2026-01-01&endDate=2026-12-31&local=teste&identificacao=teste",
  ...["data","horario","identificacao","local","ra"].flatMap(sort=>["asc","desc"].map(direction=>`?sortBy=${sort}&direction=${direction}`))]
export const invalidQueries=["?page=0","?page=1000001","?pageSize=101","?page=1&page=2","?raId=invalid","?naturezaId=invalid","?startDate=2026-02-30",
  "?startDate=2026-12-01&endDate=2026-01-01","?sortBy=pg_sleep(5)","?direction=DROP","?host=remote","?port=5432","?user=postgres","?database=postgres"]
const osEnv=()=>Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith("PG")&&!/SUPABASE|DATABASE|READER_URL/.test(key)))
function powershell(script,env=osEnv()) {
  const p=spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],{env,encoding:"utf8",timeout:15000,windowsHide:true})
  assert.equal(p.status,0,"Native verification unavailable")
  return p.stdout.trim()
}
async function privateRoot(path) {
  await mkdir(path,{recursive:false})
  powershell(`$ErrorActionPreference='Stop';$p=$env:SENTINELA_PRIVATE_TEST_ROOT;$a=New-Object Security.AccessControl.DirectorySecurity;$a.SetAccessRuleProtection($true,$false);foreach($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544')){$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))};[IO.Directory]::SetAccessControl($p,$a)`,{...osEnv(),SENTINELA_PRIVATE_TEST_ROOT:path})
}
async function freePort() {
  await new Promise((ok,bad)=>{const server=createServer();server.once("error",bad);server.listen({host:"127.0.0.1",port,exclusive:true},()=>server.close(ok))})
}
function processProof(pid) {
  return JSON.parse(powershell(`$ErrorActionPreference='Stop';$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}';if(!$p){throw 'Missing'};@{pid=$p.ProcessId;path=$p.ExecutablePath;start=([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds()}|ConvertTo-Json -Compress`))
}
function listenerProof(rootPid) {
  const result=JSON.parse(powershell(`$ErrorActionPreference='Stop';$l=@(Get-NetTCPConnection -State Listen|Where-Object LocalPort -eq ${port});$ps=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'"|Select-Object ProcessId,ParentProcessId);@{listeners=@($l|Select-Object LocalAddress,OwningProcess);processes=$ps}|ConvertTo-Json -Depth 5 -Compress`))
  assert.equal(result.listeners.length,1);assert.equal(result.listeners[0].LocalAddress,"127.0.0.1")
  let pid=result.listeners[0].OwningProcess;const seen=new Set()
  while(pid!==rootPid){assert(!seen.has(pid));seen.add(pid);const row=result.processes.find(p=>p.ProcessId===pid);assert(row,"Unidentified listener process");pid=row.ParentProcessId}
  return processProof(result.listeners[0].OwningProcess)
}
export function safeError(body) {
  errorSchema.parse(body)
  assert(!/SELECT |FROM sentinela|password|postgresql:\/\/|ECONN|syntax error/i.test(JSON.stringify(body)))
}
export async function main(securityOnly=false) {
  assert.equal(process.platform,"win32","Windows qualification only")
  if(!securityOnly)assert(process.env.SENTINELA_LOCAL_READER_URL,"Use the interactive PowerShell entry point")
  await freePort()
  const id=randomUUID(), base=join(process.env.USERPROFILE,".sentinela-local","http-qualification")
  await mkdir(base,{recursive:true});const privateDir=join(base,id);await privateRoot(privateDir)
  assert.equal(await realpath(privateDir),resolve(privateDir))
  const outside=relative(root,privateDir);assert(outside.startsWith("..")||isAbsolute(outside),"Private test files must stay outside repository")
  const reports=[], reportPath=join(privateDir,"report.json"), generated=[], previousTypes=await readFile(join(root,"next-env.d.ts")).catch(()=>null)
  const record=async(name,result,extra={})=>{reports.push({name,result,...extra});await writeFile(reportPath,JSON.stringify({id,mode:securityOnly?"HTTP_SECURITY_ONLY_NO_DATABASE":"HTTP_AND_REAL_POSTGRESQL",databaseTested:reports.some(t=>t.name==="postgresql_real_identity_and_repository"&&t.result==="PASS"),tests:reports},null,2))}
  const password=randomBytes(32).toString("hex")
  const accounts=["Administrador","Operador","Analista"].map((role,i)=>{const salt=randomBytes(16).toString("hex");return {email:`synthetic-${i}@example.test`,role,salt,hash:scryptSync(password,Buffer.from(salt,"hex"),64).toString("hex")}})
  const accountsFile=join(privateDir,"accounts.json");await writeFile(accountsFile,JSON.stringify({accounts}),{flag:"wx"});generated.push(accountsFile)
  const env={...process.env,NODE_ENV:"development",SENTINELA_AUTH_PROVIDER:"local",SENTINELA_APP_ORIGIN:origin,SENTINELA_LOCAL_ACCOUNTS_FILE:accountsFile,
    SENTINELA_LOCAL_READER_URL:securityOnly?"":process.env.SENTINELA_LOCAL_READER_URL,SENTINELA_HTTP_VALIDATION_ID:id,SENTINELA_VALIDATE_BUILD:"",
    SENTINELA_DATABASE_URL:"",SENTINELA_DATABASE_SSLROOTCERT:"",NEXT_PUBLIC_SUPABASE_URL:"",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"",NEXT_PUBLIC_SUPABASE_ANON_KEY:"",SUPABASE_SERVICE_ROLE_KEY:""}
  let child, childIdentity, serverIdentity
  try {
    if(!securityOnly) {
      Object.assign(process.env,{NODE_ENV:"development",SENTINELA_AUTH_PROVIDER:"local",SENTINELA_LOCAL_BIND:"127.0.0.1"})
      const {readOperational}=await import("../src/lib/db/pool.ts")
      const {queryOccurrences}=await import("../src/lib/db/occurrences.ts")
      const {persistentQuerySchema}=await import("../src/contracts/persistent-occurrences.ts")
      const principal={source:"local",role:"Analista",name:"Qualification",id:"qualification",authUserId:""}
      const identity=await readOperational(principal,async client=>{
        const {rows}=await client.query("SELECT current_database() AS database,current_user AS role,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('server_version') AS version,(SELECT extversion FROM pg_extension WHERE extname='postgis') AS postgis,(SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='postgis') AS postgis_schema")
        return rows[0]
      })
      assert.deepEqual(identity,{database:"sentinela_dev_operacional",role:"sentinela_local_reader",host:"127.0.0.1",port:5432,version:"17.11",postgis:"3.6.2",postgis_schema:"extensions"})
      const result=await queryOccurrences(principal,persistentQuerySchema.parse({}));assert.equal(result.pagination.total,0,"Visible data changed; do not assume empty database")
      await record("postgresql_real_identity_and_repository","PASS",{identity})
    }
    await mkdir(join(root,"tmp"),{recursive:true})
    await writeFile(join(root,`tmp/tsconfig-http-${id}.json`),JSON.stringify({extends:"../tsconfig.json",compilerOptions:{incremental:false},include:["../src/**/*.ts","../src/**/*.tsx",`../.next-http-validation-${id}/dev/types/**/*.ts`]},null,2))
    child=spawn(process.execPath,["scripts/next-cli.mjs","dev","--port",String(port)],{cwd:root,env,stdio:["ignore","pipe","pipe"],windowsHide:true})
    // Drain pipes continuously, but never persist raw server output or credentials.
    child.stdout.on("data",()=>{});child.stderr.on("data",()=>{})
    let spawnError=false;child.on("error",()=>{spawnError=true})
    childIdentity=processProof(child.pid)
    assert.equal(resolve(childIdentity.path).toLowerCase(),resolve(process.execPath).toLowerCase())
    const deadline=Date.now()+180000
    let ready=false
    while(Date.now()<deadline&&!ready){
      assert(!spawnError&&child.exitCode===null,"Test server exited")
      try{const response=await fetch(origin+"/login",{signal:AbortSignal.timeout(5000),redirect:"manual"});ready=response.status===200}catch{}
      if(!ready)await new Promise(r=>setTimeout(r,500))
    }
    assert(ready,"Test server readiness timeout");serverIdentity=listenerProof(child.pid)
    await record("isolated_next_loopback_identity","PASS")
    async function request(name,path,expected,cookie) {
      const response=await fetch(origin+path,{headers:cookie?{cookie}:{},redirect:"manual",signal:AbortSignal.timeout(60000)})
      assert.equal(response.status,expected,name)
      const body=await response.json()
      if(expected===200){persistentListResponseSchema.parse(body);assert.equal(body.data.pagination.total,0);assert.deepEqual(body.data.items,[])}else safeError(body)
      assert.match(response.headers.get("cache-control"),/no-store/)
      await record(name,"PASS",{status:response.status});return body
    }
    const list="/api/v1/ocorrencias",detail=`${list}/${missing}`
    await request("list_no_session",list,401);await request("detail_no_session",detail,401)
    await request("list_invalid_session",list,401,"sentinela-local-session="+"f".repeat(64))
    await request("detail_invalid_session",detail,401,"sentinela-local-session="+"f".repeat(64))
    for(const header of ["x-middleware-subrequest","x-middleware-skip","x-sentinela-role"]) {
      const bypass=await fetch(origin+list,{headers:{[header]:header==="x-sentinela-role"?"Administrador":"proxy:proxy:proxy:proxy:proxy"},redirect:"manual"})
      assert.equal(bypass.status,401);safeError(await bypass.json());await record(`bypass_header_${header}`,"PASS",{status:401})
    }
    for(const account of accounts) {
      const login=await fetch(origin+"/auth/login",{method:"POST",headers:{origin,"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({email:account.email,password}),redirect:"manual",signal:AbortSignal.timeout(60000)})
      assert.equal(login.status,303);const set=login.headers.get("set-cookie")??"";assert.match(set,/HttpOnly/i);assert.match(set,/SameSite=Strict/i)
      const cookie=set.split(";")[0],token=cookie.split("=")[1];assert.match(token,/^[a-f0-9]{64}$/)
      const file=join(privateDir,"sentinela-sessions",createHash("sha256").update(token).digest("hex")+".json");generated.push(file)
      await record(`login_${account.role}`,"PASS")
      if(process.argv.includes("--ui")) {
        const {checkOccurrenceInterface}=await import("./check-persistent-occurrences.mjs")
        const checks=await checkOccurrenceInterface({origin,cookie,privateDir,securityOnly,role:account.role})
        for(const check of checks)await record(check.name,"PASS",{source:check.source})
      }
      await request(`list_${account.role}`,list,securityOnly?503:200,cookie)
      await request(`detail_${account.role}`,detail,securityOnly?503:404,cookie)
      for(const query of invalidQueries)await request(`invalid_${account.role}_${invalidQueries.indexOf(query)}`,list+query,400,cookie)
      await request(`malformed_uuid_${account.role}`,list+"/invalid",400,cookie)
      await request(`detail_query_${account.role}`,detail+"?host=remote",400,cookie)
      for(const query of validQueries)await request(`valid_${account.role}_${validQueries.indexOf(query)}`,list+query,securityOnly?503:200,cookie)
      for(const method of ["POST","PATCH","DELETE"]){
        const denied=await fetch(origin+list,{method,headers:{cookie},redirect:"manual"});assert.equal(denied.status,403);await record(`method_${account.role}_${method}`,"PASS")
      }
      const stored=JSON.parse(await readFile(file,"utf8"));await writeFile(file,JSON.stringify({...stored,expires:0}))
      await request(`list_expired_${account.role}`,list,401,cookie);await request(`detail_expired_${account.role}`,detail,401,cookie)
      const logout=await fetch(origin+"/auth/logout",{method:"POST",headers:{cookie,origin,"content-type":"application/x-www-form-urlencoded"},body:"",redirect:"manual"});assert.equal(logout.status,303)
      await request(`logged_out_${account.role}`,list,401,cookie)
    }
    await record("nonempty_multiple_natures_and_hidden_row_HTTP","NOT_EXERCISED",{reason:securityOnly?"No database connection or fixtures; nonempty/RLS row semantics NOT verified in this run.":"Visible operational set is empty; no fixtures created. Nonempty/RLS row semantics NOT verified in this HTTP run."})
    console.log(`PASS: ${reports.filter(x=>x.result==="PASS").length} checks; ${securityOnly?"HTTP security only; PostgreSQL NOT tested":"real PostgreSQL and HTTP"}.`)
  } catch {
    await record("execution","FAIL");throw new Error("Qualification failed; sanitized report preserved")
  } finally {
    let closed=!child
    if(childIdentity) {
      try {
        const current=processProof(child.pid)
        assert.deepEqual(current,childIdentity)
        const result=spawnSync("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{env:osEnv(),windowsHide:true,encoding:"utf8",timeout:15000})
        assert.equal(result.status,0)
        await new Promise(r=>setTimeout(r,700));await freePort();closed=true
        await record("own_test_server_stopped","PASS")
      } catch {await record("own_test_server_shutdown","UNKNOWN",{pid:child?.pid,serverPid:serverIdentity?.pid})}
    }
    if(closed) {
      for(const file of generated){assert(!relative(privateDir,resolve(file)).startsWith(".."));await unlink(file).catch(e=>{if(e.code!=="ENOENT")throw e})}
      await record("ephemeral_accounts_and_sessions_removed","PASS")
    }
    const types=join(root,"next-env.d.ts");const current=await readFile(types,"utf8").catch(()=>"")
    if(previousTypes&&current.includes(`.next-http-validation-${id}/`))await writeFile(types,previousTypes)
    console.log("Sanitized report: "+reportPath)
  }
  assert(!reports.some(x=>["FAIL","UNKNOWN"].includes(x.result)),"Qualification/cleanup incomplete")
}
if(resolve(process.argv[1]??"")===fileURLToPath(import.meta.url)) {
  if(!process.argv.includes("--execute")&&!process.argv.includes("--security-only")){console.error("Explicit --execute or --security-only required");process.exitCode=1}
  else main(process.argv.includes("--security-only")).catch(()=>{console.error("FAIL: qualification incomplete; no credentials logged.");process.exitCode=1})
}
