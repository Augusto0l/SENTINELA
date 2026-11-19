import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { catalogRows,verifyCatalogSource } from "../database/local/write-sandbox/catalog-source.mjs"
const bytes=await readFile("public/data/cartography/ras-ide-2026-11-13.geojson")
const source=JSON.parse(bytes.toString("utf8"))
test("canonical catalog source: exact 37 codes and feature IDs, no generated UUID or legal dates",()=>{
 const rows=verifyCatalogSource(bytes);assert.equal(rows.length,37)
 assert(rows.some(r=>r.code==="XXXVII"));assert.equal(new Set(rows.map(r=>r.name)).size,37)
 for(const r of rows)assert.deepEqual(Object.keys(r),["code","name","sourceObjectId"])
})
test("canonical source rejects code or feature identifier duplication independently of hash checks",()=>{
 for(const field of ["ra_codigo","objectid"]){const s=structuredClone(source);s.features[1].properties[field]=s.features[0].properties[field];assert.throws(()=>catalogRows(s),/Ambiguous/)}
})
test("canonical source rejects missing code, name, identifier and incomplete catalogs",()=>{
 for(const field of ["ra_codigo","ra_nome","objectid"]){const s=structuredClone(source);delete s.features[0].properties[field];assert.throws(()=>catalogRows(s),/identity/)}
 assert.throws(()=>catalogRows({...source,features:source.features.slice(1)}),/Complete/)
})
test("canonical source verifies byte-level hash before trusting modified names or codes",()=>{
 const s=structuredClone(source);s.features[0].properties.ra_nome="different";assert.throws(()=>verifyCatalogSource(Buffer.from(JSON.stringify(s))),/hash/)
 assert.throws(()=>verifyCatalogSource(Buffer.concat([bytes,Buffer.from(" ")])),/hash/)
})
