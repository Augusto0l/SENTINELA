import "../scripts/contracts-runtime.mjs"
import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
const { raBindingSchema, validateBoundTerritory: validate } = await import("../src/data/ra-bindings.ts")
const load = async name => JSON.parse(await readFile(`public/data/cartography/${name}`, "utf8"))
const mapping = await load("ra-bindings-synthetic.json"), operational = await load("ra-bindings.json"), geo = await load("ras-ide-2026-11-13.geojson")
const payload = JSON.parse(await readFile("database/local/ra-catalog-v2/payload.json", "utf8"))
const row = mapping.entries.find(e => e.code === "RA-I")
const check = (data = mapping, id = row.raId, scope = "sandbox", version = mapping.version) => validate(geo, -15.79, -47.88, id, data, scope, version).status
test("bindings: 37 unique synthetic identities and 37 distinct persisted operational identities", () => {
 assert(raBindingSchema.safeParse(mapping).success); assert(raBindingSchema.safeParse(operational).success)
 assert.equal(mapping.entries.length,37); assert.equal(operational.entries.length,37)
 const syntheticIds = new Set(mapping.entries.map(e=>e.raId))
 for(const {code,name,metadata} of payload.entries) {
  const entry=operational.entries.find(e=>e.code===code)
  assert(entry)
  assert.equal(entry.catalogName,name)
  assert.equal(entry.sourceName,metadata.sourceName)
  assert.equal(entry.sourceObjectId,metadata.sourceObjectId)
  assert.equal(entry.status,"approved")
  assert(!syntheticIds.has(entry.raId))
  assert(geo.features.some(f=>f.properties.ra_codigo===code && String(f.properties.objectid)===entry.sourceObjectId))
 }
 for(const e of mapping.entries) assert(geo.features.some(f => f.properties.ra_codigo === e.code && String(f.properties.objectid) === e.sourceObjectId))
 assert.equal(check(),"consistent"); assert.equal(check(mapping,row.raId,"operational"),"reference_pending")
 assert.equal(check(operational,row.raId,"operational"),"reference_pending")
 const persistedId=operational.entries.find(e=>e.code==="RA-I").raId
 assert.equal(check(operational,persistedId,"operational",operational.version),"consistent")
})
test("bindings: duplicates rejected rather than silently selecting a row", () => {
 assert(!raBindingSchema.safeParse({...mapping,entries:[...mapping.entries,row]}).success)
 assert(!raBindingSchema.safeParse({...mapping,entries:[row,{...mapping.entries[1],code:row.code}]}).success)
})
test("bindings: invalid identities and pending or conflicting evidence never approve", () => {
 for(const id of [null,"RA-I","00000000-0000-4000-8000-000000000000"])assert.equal(check(mapping,id),"reference_pending")
 for(const status of ["pending","unmapped","conflict"])assert.equal(check({...mapping,entries:mapping.entries.map(e=>({...e,status}))}),"reference_pending")
})
test("bindings: version, source, geometry revision and feature identifier are explicit", () => {
 for(const patch of [{version:"unknown"},{sourceId:"https://invalid.example"},{sourceHash:"0".repeat(64)},{entries:[{...row,code:"unknown"}]},{entries:[{...row,sourceObjectId:"unknown"}]}])assert.equal(check({...mapping,...patch}),"reference_pending")
 assert.equal(check(mapping,row.raId,"sandbox","missing-version"),"reference_pending")
 assert.equal(check({...mapping,entries:[{...row,catalogName:"different display name",sourceName:"different display name"}]}),"consistent")
})
test("bindings: extraction date is not legal validity", () => {
 assert.equal(mapping.validFrom,null);assert.equal(mapping.temporalBasis,"extraction-only")
 assert(!raBindingSchema.safeParse({...mapping,validFrom: "2026-11-13"}).success)
 assert(!raBindingSchema.safeParse({...mapping,temporalBasis:"documented-validity",validFrom:null}).success)
})
test("bindings: mismatch, outside, missing cartography and malformed coordinates stay distinct", () => {
 assert.equal(check(mapping,mapping.entries.find(e=>e.code!==row.code).raId),"ra_mismatch")
 assert.equal(validate(geo,0,0,row.raId,mapping,"sandbox").status,"outside_df")
 assert.equal(validate(null,-15.79,-47.88,row.raId,mapping,"sandbox").status,"cartography_unavailable")
 assert.equal(validate(geo,null,null,row.raId,mapping,"sandbox").status,"invalid_coordinate")
})
