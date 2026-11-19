const collections=["types","tables","columns","constraints","indexes","triggers","functions","policies","column_grants","schema_acl","defaults","ra_dependencies"]
export function comparePreoperational(operational,sandbox){
 if(operational?.result!=="PASS")return {result:"NOT VERIFIED",reason:"Operational audit did not complete successfully",comparisons:[]}
 if(!operational.snapshot)return {result:"NOT VERIFIED",reason:"Operational snapshot wrapper missing",comparisons:[]}
 if(!sandbox?.snapshot)return {result:"NOT VERIFIED",reason:"Sandbox baseline wrapper missing",comparisons:[]}
 const a=operational.snapshot,b=sandbox.snapshot
 if(a.identity?.host!=="127.0.0.1"||a.identity?.port!==5432||a.identity?.database!=="sentinela_dev_operacional"||a.identity?.executor!=="sentinela_local_reader"||b.identity?.host!=="127.0.0.1"||b.identity?.port!==55432||b.identity?.database!=="sentinela_rls_sandbox"||a.identity?.readonly!=="on"||b.identity?.readonly!=="on")return {result:"FAIL",reason:"Unexpected environment identity",comparisons:[]}
 const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==="object"&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)
 const validCollection=v=>v===null||Array.isArray(v)
 const comparisons=collections.map(name=>({name,status:!Object.hasOwn(a,name)||!Object.hasOwn(b,name)||!validCollection(a[name])||!validCollection(b[name])?"NOT VERIFIED":canonical(a[name])===canonical(b[name])?"PASS":"FAIL"}))
 comparisons.push({name:"versions",status:typeof a.identity.version!=="string"||typeof b.identity.version!=="string"||!Array.isArray(a.extensions)||!Array.isArray(b.extensions)?"NOT VERIFIED":a.identity.version===b.identity.version&&canonical(a.extensions)===canonical(b.extensions)?"PASS":"FAIL"})
 const restricted=r=>r&&["superuser","bypassrls","createdb","createrole","replication","inherit"].every(k=>r[k]===false)&&r.limit===5
 comparisons.push({name:"reader_attributes_expected_login_difference",status:restricted(a.reader)&&restricted(b.reader)&&a.reader.login===true&&b.reader.login===false&&JSON.stringify(a.memberships)===JSON.stringify([])&&JSON.stringify(b.memberships)===JSON.stringify([])?"PASS":"FAIL"})
 return {result:comparisons.some(c=>c.status==="FAIL")?"FAIL":comparisons.some(c=>c.status==="NOT VERIFIED")?"NOT VERIFIED":"PASS",comparisons,note:"Only baseline metadata compared; load schemas, real counts, backup and operational authorization remain separate gates"}
}
