import test from "node:test"
import assert from "node:assert/strict"
import { comparePreoperational } from "../database/local/write-sandbox/compare-preoperational.mjs"
import { readCheckStatus } from "../scripts/ra-audit-policy.mjs"
const fixture=()=>{
 const snapshot={identity:{host:"127.0.0.1",port:5432,database:"sentinela_dev_operacional",executor:"sentinela_local_reader",readonly:"on",version:"17.11"},reader:{login:true,superuser:false,bypassrls:false,createdb:false,createrole:false,replication:false,inherit:false,limit:5},memberships:[],extensions:[["postgis","3.6.2","extensions"]]}
 for(const k of ["types","tables","columns","constraints","indexes","triggers","functions","policies","column_grants","schema_acl","defaults","ra_dependencies"])snapshot[k]=[]
 const sandbox=structuredClone(snapshot);Object.assign(sandbox.identity,{port:55432,database:"sentinela_rls_sandbox",executor:"postgres"});sandbox.reader.login=false
 return [{result:"PASS",snapshot},{snapshot:sandbox}]
}
test("preoperational comparison accepts only the explicit baseline LOGIN difference",()=>assert.equal(comparePreoperational(...fixture()).result,"PASS"))
test("preoperational comparison refuses metadata, ACL, policy and function drift",()=>{
 for(const key of ["columns","constraints","indexes","triggers","functions","policies","column_grants","defaults"]){const [a,b]=fixture();b.snapshot[key]=["changed"];assert.equal(comparePreoperational(a,b).result,"FAIL")}
})
test("preoperational comparison rejects administrative roles and unexpected memberships",()=>{
 for(const key of ["superuser","bypassrls","createdb","createrole","replication","inherit"]){const [a,b]=fixture();a.snapshot.reader[key]=true;assert.equal(comparePreoperational(a,b).result,"FAIL")}
 const [a,b]=fixture();a.snapshot.memberships=[["unexpected"]];assert.equal(comparePreoperational(a,b).result,"FAIL")
})
test("preoperational comparison never treats absent credentials or partial snapshots as approval",()=>{
 assert.equal(comparePreoperational({result:"FAIL"},{}).result,"NOT VERIFIED")
 const [a,b]=fixture();delete a.snapshot.policies;assert.equal(comparePreoperational(a,b).result,"NOT VERIFIED")
 const [x,y]=fixture();y.snapshot.identity.port=5432;assert.equal(comparePreoperational(x,y).result,"FAIL")
})
test("read-only audit never accepts unexpected internal access even with zero rows",()=>assert.equal(readCheckStatus("internal_users_denied",[]),"FAIL"))
test("read-only audit checks effective column writes without attempting any forbidden SQL",()=>{
 const rows=Array.from({length:19},()=>({insert:false,update:false,delete:false}))
 assert.equal(readCheckStatus("write_privileges",rows),"PASS")
 rows[0].update=true;assert.equal(readCheckStatus("write_privileges",rows),"FAIL")
 assert.equal(readCheckStatus("write_privileges",[]),"FAIL")
})
