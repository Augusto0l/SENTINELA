import { createHash } from "node:crypto"
const SOURCE_HASH="fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553"
export function catalogRows(source){
 if(source?.type!=="FeatureCollection"||!Array.isArray(source.features)||source.features.length!==37)throw Error("Complete pinned catalog required")
 const rows=source.features.map(f=>{
  const p=f?.properties
  if(typeof p?.ra_codigo!=="string"||!p.ra_codigo.trim()||typeof p.ra_nome!=="string"||!p.ra_nome.trim()||!Number.isSafeInteger(p.objectid)||p.objectid<0)throw Error("Source identity missing")
  return {code:p.ra_codigo,name:p.ra_nome,sourceObjectId:String(p.objectid)}
 })
 for(const field of ["code","sourceObjectId"])if(new Set(rows.map(r=>r[field])).size!==37)throw Error("Ambiguous source identity")
 return rows
}
export function verifyCatalogSource(bytes){
 if(createHash("sha256").update(bytes).digest("hex")!==SOURCE_HASH)throw Error("Source hash incompatible")
 return catalogRows(JSON.parse(bytes.toString("utf8")))
}
