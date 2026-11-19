import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
const root="database/local/ra-catalog-v2"
const payload=JSON.parse(await readFile(`${root}/payload.json`,"utf8"))
const matrix=JSON.parse(await readFile("docs/catalogos/ras-revisao-2026-11-13-v1/matrix.json","utf8"))
const sql=await readFile(`${root}/install.sql`,"utf8")
test("RA public sandbox v2: 37 reviewed identities, literal codes and separate original names",()=>{
 assert.equal(payload.scope,"sandbox-only");assert.equal(payload.entries.length,37)
 for(const r of payload.entries){
  const original=matrix.entries.find(x=>x.ideCode===r.code)
  assert.equal(r.name,original.administrativeName)
  assert.equal(r.metadata.sourceName,original.ideName)
  assert.equal(r.metadata.administrativeNumber,original.legalNumber)
  assert.equal(r.metadata.sourceObjectId,original.sourceObjectId)
  assert.equal(r.metadata.ideCode,r.code)
  assert(!("id" in r));assert.equal(r.metadata.legalValidityStatus,"unknown")
  assert.equal(r.metadata.validFrom,null);assert.equal(r.metadata.validTo,null)
 }
 assert.equal(new Set(payload.entries.map(r=>r.code)).size,37)
 assert.equal(payload.entries.find(r=>r.metadata.administrativeNumber===37).code,"XXXVII")
})
test("RA public sandbox v2: all executable artifacts match version manifest",async()=>{
 const manifest=JSON.parse(await readFile(`${root}/manifest.json`,"utf8"))
 for(const [name,sha] of Object.entries(manifest.files))
  assert.equal(createHash("sha256").update(await readFile(`${root}/${name}`)).digest("hex"),sha)
})
test("RA public sandbox v2: additive policies include restrictive protection against permissive OR",()=>{
 assert.match(sql,/AS RESTRICTIVE FOR SELECT TO sentinela_local_reader/)
 assert.match(sql,/approved_reference\(codigo_interno,nome,referencia_cartografica\)/)
 assert(!/DROP POLICY|DISABLE ROW LEVEL|NO FORCE|BYPASSRLS|SECURITY DEFINER/.test(sql))
 assert(!/GRANT (?:INSERT|UPDATE|DELETE|ALL|SELECT)/.test(sql))
 assert.match(sql,/codigo_oficial IS NULL AND lower_inf\(vigencia\) AND upper_inf\(vigencia\)/)
})
