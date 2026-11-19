import test from "node:test"
import assert from "node:assert/strict"
import { mkdir,writeFile,readFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID,createHash } from "node:crypto"
import { evidencePath,readVerifiedEvidence } from "../scripts/ra-evidence.mjs"
import { comparePreoperational } from "../database/local/write-sandbox/compare-preoperational.mjs"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
const root=path.resolve("tmp",`ra-evidence-test-${randomUUID()}`)
const hash=b=>createHash("sha256").update(b).digest("hex")
async function fixture(value,{bom=false,expected}={}){
 const dir=path.join(root,randomUUID(),"Windows folder with spaces");await mkdir(dir,{recursive:true})
 const bytes=Buffer.from((bom?"\uFEFF":"")+JSON.stringify(value));const file=path.join(dir,"audit.json")
 await writeFile(file,bytes);await writeFile(path.join(dir,"sha256.txt"),"\uFEFF"+(expected??hash(bytes)).toUpperCase()+"\r\n")
 return {file,sha:hash(bytes)}
}
const audit=()=>({format:1,result:"PASS",checks:[{name:"ledger",status:"NOT VERIFIED",sqlState:"42501"}],catalogTotal:{status:"NOT VERIFIED",reason:"RLS"},snapshot:{identity:{readonly:"on"}}})
test("evidence: authenticated wrapper, BOM and CRLF hash sidecar preserve exact-byte integrity",async()=>{
 const f=await fixture(audit(),{bom:true});const r=await readVerifiedEvidence(f.file,"operational")
 assert.equal(r.sha256,f.sha);assert.equal(r.data.checks[0].status,"NOT VERIFIED");assert.equal(r.data.catalogTotal.status,"NOT VERIFIED")
})
test("evidence: altered bytes or forged hash never qualify",async()=>{
 const f=await fixture(audit(),{expected:"0".repeat(64)})
 await assert.rejects(readVerifiedEvidence(f.file,"operational"),e=>e.code==="HASH_MISMATCH")
 const g=await fixture(audit());await writeFile(g.file,Buffer.concat([await readFile(g.file),Buffer.from(" ")]))
 await assert.rejects(readVerifiedEvidence(g.file,"operational"),e=>e.code==="HASH_MISMATCH")
})
test("evidence: missing file, sidecar and snapshot each have specific diagnostics",async()=>{
 await assert.rejects(readVerifiedEvidence(path.join(root,"absent.json"),"operational"),e=>e.code==="EVIDENCE_UNAVAILABLE")
 const dir=path.join(root,randomUUID());await mkdir(dir,{recursive:true});const f=path.join(dir,"audit.json");await writeFile(f,"{}")
 await assert.rejects(readVerifiedEvidence(f,"operational"),e=>e.code==="HASH_SIDECAR_UNAVAILABLE")
 const g=await fixture({format:1,result:"FAIL",stage:"configuration",checks:[]})
 await assert.rejects(readVerifiedEvidence(g.file,"operational"),e=>e.code==="SNAPSHOT_WRAPPER_MISSING")
})
test("evidence: sandbox wrapper needs the explicitly approved hash and baseline scope",async()=>{
 const f=await fixture({scope:"sandbox-baseline-only",snapshot:{identity:{readonly:"on"}}})
 await assert.rejects(readVerifiedEvidence(f.file,"sandbox"),e=>e.code==="EXPECTED_HASH_REQUIRED")
 assert.equal((await readVerifiedEvidence(f.file,"sandbox",f.sha)).integrity,"PASS")
 const g=await fixture({scope:"sandbox-final",snapshot:{}})
 await assert.rejects(readVerifiedEvidence(g.file,"sandbox",g.sha),e=>e.code==="BASELINE_SCOPE_REQUIRED")
})
test("evidence: unknown audit formats are not silently interpreted as authenticated",async()=>{
 const f=await fixture({...audit(),format:2})
 await assert.rejects(readVerifiedEvidence(f.file,"operational"),e=>e.code==="AUDIT_FORMAT_UNSUPPORTED")
})
test("evidence: Windows relative paths and spaces resolve locally; UNC and URLs are refused",async()=>{
 const f=await fixture(audit());assert.equal(evidencePath(path.relative(process.cwd(),f.file)),f.file)
 if(process.platform==="win32")assert.equal(evidencePath(f.file.replaceAll("\\","/")),f.file)
 for(const p of ["\\\\server\\share\\audit.json","//server/share/audit.json","https://example.org/audit.json"])assert.throws(()=>evidencePath(p),e=>e.code==="LOCAL_PATH_REQUIRED")
})
test("comparison: missing restrictive attributes and missing versions are never PASS",()=>{
 const a={result:"PASS",snapshot:{identity:{host:"127.0.0.1",port:5432,database:"sentinela_dev_operacional",executor:"sentinela_local_reader",readonly:"on"},reader:{login:true,limit:5},memberships:[]}}
 const b={snapshot:structuredClone(a.snapshot)};Object.assign(b.snapshot.identity,{port:55432,database:"sentinela_rls_sandbox"});b.snapshot.reader.login=false
 const r=comparePreoperational(a,b);assert.notEqual(r.result,"PASS");assert.equal(r.comparisons.find(c=>c.name==="versions").status,"NOT VERIFIED")
})
test("CLI preserves historical evidence, records sources and keeps RLS/ledger gates unresolved",async()=>{
 const a=audit();Object.assign(a.snapshot,{identity:{host:"127.0.0.1",port:5432,database:"sentinela_dev_operacional",executor:"sentinela_local_reader",readonly:"on",version:"17.11"},reader:{login:true,superuser:false,bypassrls:false,createdb:false,createrole:false,replication:false,inherit:false,limit:5},memberships:[],extensions:[]})
 for(const k of ["types","tables","columns","constraints","indexes","triggers","functions","policies","column_grants","schema_acl","defaults","ra_dependencies"])a.snapshot[k]=[]
 const b={scope:"sandbox-baseline-only",snapshot:structuredClone(a.snapshot)};Object.assign(b.snapshot.identity,{port:55432,database:"sentinela_rls_sandbox",executor:"postgres"});b.snapshot.reader.login=false
 const x=await fixture(a),y=await fixture(b)
 const historical=await readFile("tmp/ra-preoperational-comparison.json").catch(()=>null)
 const run=async()=>JSON.parse((await promisify(execFile)(process.execPath,["scripts/compare-ra-preoperational.mjs",x.file,y.file,"--sandbox-sha256",y.sha],{windowsHide:true})).stdout)
 const first=await run(),second=await run();assert.notEqual(first.directory,second.directory)
 const result=JSON.parse(await readFile(path.join(first.directory,"comparison.json"),"utf8"))
 assert.equal(result.result,"PASS");assert.equal(result.readiness,"BLOCKED");assert.equal(result.gates.ledger.sqlState,"42501");assert.equal(result.gates.catalogTotal.status,"NOT VERIFIED");assert.equal(result.sources.operational.sha256,x.sha)
 if(historical)assert.deepEqual(await readFile("tmp/ra-preoperational-comparison.json"),historical)
})
test("future global verification is read-only, explicitly checks RLS bypass and cannot silently use reader",async()=>{
 const sql=await readFile("database/local/audit/verify-ra-global-readonly.sql","utf8")
 const statements=sql.replace(/^--.*$/gm,"")
 assert.match(statements,/REPEATABLE READ READ ONLY/);assert.match(statements,/rolsuper OR rolbypassrls/);assert.match(statements,/NOT row_security_active/)
 assert.doesNotMatch(statements,/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|GRANT|REVOKE|DROP|VACUUM|ANALYZE)\b/i)
 assert.doesNotMatch(statements,/SET\s+(ROLE|SESSION AUTHORIZATION)|row_security\s*=\s*off/i)
})
