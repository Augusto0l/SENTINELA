import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

export const REVIEW_ROOT = "docs/catalogos/ras-revisao-2026-11-13-v1"
const HASH = "fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553"
const statuses = ["APROVADA", "APROVADA COM RESSALVA", "DIVERGENTE", "NÃO VERIFICADA"]
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex")

// Consistency of an explicitly reviewed dossier; not an automated legal opinion.
export function validateRaReview(review, sourceBytes) {
 const fail = message => { throw Error(message) }
 if (sha256(sourceBytes) !== HASH || review.sourceHash !== HASH) fail("Source hash mismatch")
 if (review.kind !== "sentinela-ra-administrative-review" || review.version !== "ra-review-2026-11-13-v1"
  || review.scope !== "identity-review-only" || review.loadAuthorized !== false
  || review.legalGeometryValidity !== null) fail("Review scope/version mismatch")
 const geo = JSON.parse(sourceBytes.toString("utf8"))
 if (review.entries?.length !== 37 || geo.features.length !== 37) fail("Incomplete review")
 for (const field of ["ideCode", "sourceObjectId", "legalNumber"])
  if (new Set(review.entries.map(row => row[field])).size !== 37) fail("Duplicate identity")
 const counts = Object.fromEntries(statuses.map(status => [status, 0]))
 for (const row of review.entries) {
  const f = geo.features.find(f => String(f.properties.objectid) === row.sourceObjectId)?.properties
  if (!f || f.ra_codigo !== row.ideCode || f.ra_nome !== row.ideName || f.ra_cira !== row.ideCira) fail("Source identity drift")
  if (!Number.isInteger(row.legalNumber) || row.legalNumber < 1 || row.legalNumber > 37
   || row.legalNumber !== row.ideCira || !row.administrativeName?.trim()
   || row.operationalUUID !== null || row.sourceSha256 !== HASH
   || row.snapshot !== "IDE-DF-2026-11-13") fail("Administrative mapping mismatch")
  const ref = review.sources.find(s => s.id === row.administrativeSource)
  if (!ref || !ref.url.startsWith("https://") || !/^[a-f0-9]{64}$/.test(ref.sha256)
   || row.sourceUrl !== ref.url || row.document !== ref.document
   || row.administrativeSourceSha256 !== ref.sha256) fail("Missing administrative evidence")
  const expected = row.legalNumber <= 35 ? "sag2025" : row.legalNumber === 36 ? "lei7918" : "lei7917"
  if (row.administrativeSource !== expected || !statuses.includes(row.status)) fail("Evidence scope/status mismatch")
  if ([32, 37].includes(row.legalNumber) && row.status === "APROVADA") fail("Known qualification omitted")
  counts[row.status]++
 }
 if (statuses.some(s => counts[s] !== review.counts[s])) fail("Classification counts mismatch")
 return { counts, loadAuthorized: false, geometryLegalValidity: "NOT VERIFIED" }
}

export async function verifyRaReviewPackage() {
 const manifestBytes = await readFile(`${REVIEW_ROOT}/manifest.json`)
 const receipt = await readFile(`${REVIEW_ROOT}/sha256.txt`, "utf8")
 if (receipt.trim() !== `${sha256(manifestBytes)}  manifest.json`) throw Error("Manifest checksum mismatch")
 const manifest = JSON.parse(manifestBytes)
 for (const [name, expected] of Object.entries(manifest.files)) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(name) || sha256(await readFile(`${REVIEW_ROOT}/${name}`)) !== expected)
   throw Error("Package checksum mismatch")
 }
 if (manifest.loadAuthorized !== false || manifest.sqlPackageChanged !== false) throw Error("Unexpected executable package")
 const review = JSON.parse(await readFile(`${REVIEW_ROOT}/matrix.json`, "utf8"))
 return validateRaReview(review, await readFile("public/data/cartography/ras-ide-2026-11-13.geojson"))
}
