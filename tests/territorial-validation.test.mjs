import "../scripts/contracts-runtime.mjs"
import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
const { validateTerritory: validate, CARTOGRAPHY_SHA256, structurallyValidCartography } = await import("../src/data/territorial-validation.ts")
const ring = [[0,0],[10,0],[10,10],[0,10],[0,0]]
const feature = (code, coordinates = [ring]) => ({ type:"Feature",properties:{ra_codigo:code,ra_nome:code},geometry:{type:"Polygon",coordinates} })
const geo = (...features) => ({ type:"FeatureCollection",features })
test("territory: structural coordinate validation preserves absence and does not coerce zero",()=>{
 for(const [lat,lon] of [[undefined,1],[null,1],["1",1],[NaN,1],[Infinity,1],[91,1],[1,181]])assert.equal(validate(geo(feature("A")),lat,lon,"A").status,"invalid_coordinate")
 assert.equal(validate(geo(feature("A")),1,1,"A").status,"consistent")
})
test("territory: interior, outside, mismatch and unknown RA are different results",()=>{
 const g=geo(feature("A"),feature("B",[[[20,20],[30,20],[30,30],[20,30],[20,20]]]))
 assert.equal(validate(g,1,1,"A").status,"consistent")
 assert.equal(validate(g,1,1,"B").status,"ra_mismatch")
 assert.equal(validate(g,1,1,"unknown").status,"reference_pending")
 assert.equal(validate(g,-10,-10,"A").status,"outside_df")
})
test("territory: holes, multipolygons, overlap and boundaries do not choose an arbitrary RA",()=>{
 const hole=[[2,2],[4,2],[4,4],[2,4],[2,2]]
 assert.equal(validate(geo(feature("A",[ring,hole])),3,3,"A").status,"outside_df")
 assert.equal(validate(geo(feature("A",[ring,hole])),2,3,"A").status,"boundary_ambiguous")
 assert.equal(validate(geo(feature("A")),0,1,"A").status,"boundary_ambiguous")
 assert.equal(validate(geo(feature("A"),feature("B")),1,1,"A").status,"boundary_ambiguous")
 const multi=feature("A");multi.geometry={type:"MultiPolygon",coordinates:[[ring],[hole]]}
 assert.equal(validate(geo(multi),1,1,"A").status,"consistent")
})
test("territory: missing collection, unclosed rings and duplicate identifiers fail closed",()=>{
 assert.equal(validate(null,1,1,"A").status,"cartography_unavailable")
 assert.equal(validate(geo(feature("A",[[[0,0],[1,0],[1,1],[0,1]]])),1,1,"A").status,"cartography_unavailable")
 assert(!structurallyValidCartography(geo(feature("A"),feature("A"))))
})
test("territory: full official snapshot is pinned, 37 distinct source IDs and untouched legacy",async()=>{
 const raw=await readFile("public/data/cartography/ras-ide-2026-11-13.geojson")
 assert.equal(createHash("sha256").update(raw).digest("hex"),CARTOGRAPHY_SHA256)
 const g=JSON.parse(raw);assert.equal(g.features.length,37);assert(structurallyValidCartography(g))
 const legacy=await readFile("public/data/ras-df.geojson")
 assert.equal(createHash("sha256").update(legacy).digest("hex"),"4b9fcdd6e2ae3c1e8318f55899b463331fc412815c15811116bb1b8665568706")
})
