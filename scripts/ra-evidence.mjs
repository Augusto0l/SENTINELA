import { readFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
export class EvidenceError extends Error { constructor(code){super(code);this.code=code} }
export function evidencePath(file,base=process.cwd()){
 if(typeof file!=="string"||!file||/^[\\/]{2}/.test(file)||/^[a-z]+:\/\//i.test(file)||file.includes("\0"))throw new EvidenceError("LOCAL_PATH_REQUIRED")
 return path.resolve(base,file)
}
export async function readVerifiedEvidence(file,kind,expectedHash){
 const resolved=evidencePath(file)
 let bytes
 try{bytes=await readFile(resolved)}catch{throw new EvidenceError("EVIDENCE_UNAVAILABLE")}
 if(kind==="operational"){
  try{expectedHash=(await readFile(path.join(path.dirname(resolved),"sha256.txt"),"utf8")).replace(/^\uFEFF/,"").trim()}catch{throw new EvidenceError("HASH_SIDECAR_UNAVAILABLE")}
 }
 if(typeof expectedHash!=="string"||!/^[a-f0-9]{64}$/i.test(expectedHash))throw new EvidenceError("EXPECTED_HASH_REQUIRED")
 const sha256=createHash("sha256").update(bytes).digest("hex")
 if(sha256!==expectedHash.toLowerCase())throw new EvidenceError("HASH_MISMATCH")
 let data
 try{data=JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/,""))}catch{throw new EvidenceError("INVALID_JSON")}
 if(!data||typeof data!=="object"||Array.isArray(data)||!data.snapshot||typeof data.snapshot!=="object"||Array.isArray(data.snapshot))throw new EvidenceError("SNAPSHOT_WRAPPER_MISSING")
 if(kind==="operational"&&(data.format!==1||!Array.isArray(data.checks)||!data.snapshot.identity))throw new EvidenceError("AUDIT_FORMAT_UNSUPPORTED")
 if(kind==="sandbox"&&data.scope!=="sandbox-baseline-only")throw new EvidenceError("BASELINE_SCOPE_REQUIRED")
 return {data,path:resolved,sha256,integrity:"PASS"}
}
