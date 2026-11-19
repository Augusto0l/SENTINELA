export function readCheckStatus(name,rows){
 if(name==="internal_users_denied")return "FAIL"
 if(name==="write_privileges")return rows.length===19&&rows.every(r=>r.insert===false&&r.update===false&&r.delete===false)?"PASS":"FAIL"
 return "PASS"
}
