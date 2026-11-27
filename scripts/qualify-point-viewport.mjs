import assert from "node:assert/strict"
import pg from "pg"
import { registerHooks } from "node:module"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const resolver = registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) return next(pathToFileURL(resolve("src", specifier.slice(2) + ".ts")).href, context)
  return next(specifier, context)
} })
const { analyticsSql, pointViewportSql } = await import("../src/lib/db/analytics-query.ts")
const { pointViewportResult } = await import("../src/contracts/point-viewport.ts")
resolver.deregister()

const host = process.env.PGHOST
const port = Number(process.env.PGPORT)
const database = process.env.PGDATABASE
assert.equal(host, "127.0.0.1")
assert(port >= 55526 && port <= 55539)
assert.equal(database, "mapa_pontos_clone")
const clientFor = user => new pg.Client({ host, port, database, user, ssl: false, connectionTimeoutMillis: 3000 })
const dense = { west: -48, south: -16, east: -47, north: -15, zoom: 12 }
const detail = { west: -47.902, south: -15.802, east: -47.897, north: -15.797, zoom: 17 }
const edge = { west: -47.9, south: -15.8, east: -47.8999, north: -15.7999, zoom: 19 }
const first = "40000000-0000-4000-8000-000000000001"
const second = "40000000-0000-4000-8000-000000000002"
const manual = "40000000-0000-4000-8000-000000100004"
const nature = "50000000-0000-4000-8000-000000000001"
const filters = { ra: "RA-TESTE", startDate: "2021-01-01", endDate: "2021-01-01", hour: "0-6" }
const ids = points => points.map(point => point.id).sort()
const roles = ["sentinela_local_admin", "sentinela_local_operator", "sentinela_local_analyst"]
const data = async (client, query) => (await client.query(query)).rows[0].data
async function baselineData(client, filters) {
  // Match the existing HTTP handler when historical coverage is installed.
  await client.query("SET LOCAL enable_nestloop=off")
  const result = await data(client, analyticsSql(filters, "integrated", true))
  await client.query("SET LOCAL enable_nestloop=on")
  return result
}
const pointsIn = (points, { west, south, east, north }) => points.filter(point =>
  point.longitude >= west && point.longitude <= east && point.latitude >= south && point.latitude <= north)
const timings = []
assert.throws(() => pointViewportSql({}, { ...dense, west: dense.east }))
assert.throws(() => pointViewportSql({}, { ...dense, zoom: 23 }))

const admin = clientFor("bootstrap")
await admin.connect()
try {
  const { rows: [identity] } = await admin.query("SELECT system_identifier::text FROM pg_control_system()")
  assert.equal(identity.system_identifier, process.env.SENTINELA_MAP_CLONE_SYSTEM)
  const { rows } = await admin.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT ocorrencia_id FROM sentinela_ocorrencias_analytics.pcdf_pontos
    WHERE extensions.ST_Intersects(geometria,extensions.ST_MakeEnvelope(-47.9001,-15.8001,-47.8999,-15.7999,4326))`)
  assert.match(JSON.stringify(rows[0]["QUERY PLAN"]), /pcdf_pontos_geometria_gist/)
} finally { await admin.end() }

const anon = clientFor("anon")
await anon.connect()
try {
  await assert.rejects(anon.query(pointViewportSql({}, detail)), { code: "42501" })
  await assert.rejects(anon.query("SELECT * FROM sentinela_ocorrencias_analytics.pontos_no_enquadramento(-48,-16,-47,-15)"), { code: "42501" })
} finally { await anon.end() }

let reference
for (const role of roles) {
  const client = clientFor(role)
  await client.connect()
  try {
    const { rows: [access] } = await client.query("SELECT has_schema_privilege(current_user,'extensions','USAGE') AS postgis")
    assert.equal(access.postgis, false)
    await assert.rejects(client.query("SELECT geometria FROM sentinela_ocorrencias_analytics.pcdf_pontos LIMIT 1"), { code: "42501" })
    await client.query("BEGIN TRANSACTION READ ONLY")
    await client.query("SET LOCAL work_mem='48MB'; SET LOCAL statement_timeout='25s'")
    const baseline = await baselineData(client, filters)
    const actual = pointViewportResult.parse(await data(client, pointViewportSql(filters, detail)))
    assert.equal(baseline.pointsTruncated, false)
    assert.equal(actual.kind, "points")
    assert.deepEqual(ids(actual.points), ids(pointsIn(baseline.points, detail)))
    assert(actual.points.some(point => point.id === first && point.raCode === "RA-TESTE" &&
      point.territorialRaCode === "RA-VINCULO" && point.publicationStatus === "pcdf_crs_unverified"))
    assert(actual.points.some(point => point.id === manual && point.publicationStatus === "validated"))
    const combo = { ...filters, nature, category: "Categoria A de ensaio" }
    const compatible = pointViewportResult.parse(await data(client, pointViewportSql(combo, detail)))
    assert.equal(compatible.kind, "points")
    assert.deepEqual(ids(compatible.points), ids(pointsIn((await baselineData(client, combo)).points, detail)))
    assert(compatible.points.some(point => point.id === first))
    assert.equal((await data(client, pointViewportSql({ ...combo, category: "Categoria B de ensaio" }, detail))).representedOccurrences, 0)
    assert.equal((await data(client, pointViewportSql({ ra: "RA-VINCULO" }, detail))).representedOccurrences, 0)

    const boundary = pointViewportResult.parse(await data(client, pointViewportSql({}, edge)))
    assert.equal(boundary.kind, "points")
    for (const id of [first, second, manual]) assert(boundary.points.some(point => point.id === id))
    const denseResult = pointViewportResult.parse(await data(client, pointViewportSql({}, dense)))
    assert.equal(denseResult.kind, "groups")
    assert.equal(denseResult.representedOccurrences, 100001)
    const denseBaseline = await baselineData(client, {})
    assert.equal(denseBaseline.eligiblePoints, denseResult.representedOccurrences)
    assert.equal(denseBaseline.points.length, 10000)
    assert.equal(denseBaseline.pointsTruncated, true)
    const { rows: [uuidParity] } = await client.query(`
      SELECT (SELECT count(*) FROM sentinela_ocorrencias_analytics.pontos_confirmados) = 100001
        AND (SELECT array_agg(id ORDER BY id) FROM sentinela_ocorrencias_analytics.pontos_confirmados)
        = (SELECT array_agg(id ORDER BY id)
           FROM sentinela_ocorrencias_analytics.pontos_no_enquadramento(-48,-16,-47,-15)) AS equal`)
    assert.equal(uuidParity.equal, true)
    if (reference) assert.deepEqual(denseResult, reference)
    reference = denseResult

    const times = async run => {
      const samples = []
      for (let repetition = 0; repetition < 3; repetition += 1) {
        const start = performance.now()
        await run()
        samples.push(performance.now() - start)
      }
      return Number(samples.sort((a, b) => a - b)[1].toFixed(1))
    }
    timings.push({ role, detailIds: actual.points.length,
      detailMs: await times(() => data(client, pointViewportSql(filters, detail))),
      denseMs: await times(() => data(client, pointViewportSql({}, dense))),
      baselineMs: await times(() => baselineData(client, {})),
      baselineBytes: Buffer.byteLength(JSON.stringify(denseBaseline)),
      denseBytes: Buffer.byteLength(JSON.stringify(denseResult)) })
    await client.query("ROLLBACK")
  } finally { await client.end() }
}
console.log(JSON.stringify({ timings, groups: reference.groups.length, occurrences: reference.representedOccurrences,
  index: "pcdf_pontos_geometria_gist", deniedAnonymous: true, deniedProjectionAccess: true }))
