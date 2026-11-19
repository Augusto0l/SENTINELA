import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { validateRaReview, verifyRaReviewPackage, REVIEW_ROOT } from "../scripts/review-ra-catalog.mjs"
const review = JSON.parse(await readFile(`${REVIEW_ROOT}/matrix.json`, "utf8"))
const bytes = await readFile("public/data/cartography/ras-ide-2026-11-13.geojson")
const check = edit => { const r = structuredClone(review); edit(r); return () => validateRaReview(r, bytes) }

test("official RA dossier: version, receipts, 37 classified identities and no operational authority", async () => {
 const result = await verifyRaReviewPackage()
 assert.deepEqual(result.counts, { APROVADA: 35, "APROVADA COM RESSALVA": 2, DIVERGENTE: 0, "NÃO VERIFICADA": 0 })
 assert.equal(result.loadAuthorized, false)
 assert.equal(result.geometryLegalValidity, "NOT VERIFIED")
})
test("official RA dossier: independent legal references for the two 2026 creations", () => {
 for (const [n, ref] of [[36, "lei7918"], [37, "lei7917"]]) {
  const row = review.entries.find(r => r.legalNumber === n)
  assert.equal(row.administrativeSource, ref)
  assert.equal(row.operationalUUID, null)
 }
 assert.equal(review.entries.find(r => r.legalNumber === 37).ideCode, "XXXVII")
})
test("official RA dossier: no duplicate code, feature ID or administrative number", () => {
 for (const field of ["ideCode", "sourceObjectId", "legalNumber"])
  assert.throws(check(r => { r.entries[1][field] = r.entries[0][field] }), /Duplicate/)
})
test("official RA dossier: no fuzzy matching or silent cartographic renumbering", () => {
 assert.throws(check(r => { r.entries[36].ideCode = "RA-XXXVII" }), /Source identity/)
 assert.throws(check(r => { r.entries[0].ideName = "BRASILIA" }), /Source identity/)
 assert.throws(check(r => { r.entries[0].legalNumber = 38 }), /mapping/)
})
test("official RA dossier: missing evidence and unqualified promotion rejected", () => {
 assert.throws(check(r => { r.entries[36].administrativeSource = "sag2025" }), /evidence|scope/)
 assert.throws(check(r => { r.entries[31].status = "APROVADA" }), /qualification/)
 assert.throws(check(r => { r.entries.pop() }), /Incomplete/)
})
test("official RA dossier: new version, source tampering, legal validity and operational UUID fail closed", () => {
 assert.throws(() => validateRaReview(review, Buffer.concat([bytes, Buffer.from(" ")])), /hash/)
 assert.throws(check(r => { r.version = "unknown" }), /version/)
 assert.throws(check(r => { r.legalGeometryValidity = "2026-11-13" }), /scope/)
 assert.throws(check(r => { r.loadAuthorized = true }), /scope/)
 assert.throws(check(r => { r.entries[0].operationalUUID = "invented" }), /mapping/)
})
