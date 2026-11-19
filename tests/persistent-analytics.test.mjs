import "../scripts/contracts-runtime.mjs"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import test from "node:test"
const { parseAnalyticsSearch, persistentAnalyticsData, PERSISTENT_ANALYTICS_PATH } = await import("../src/contracts/persistent-analytics.ts")
const { analyticsSql } = await import("../src/lib/db/analytics-query.ts")
const { analyticsGET } = await import("../src/lib/db/analytics-http.ts")
const { isLocalReadEndpoint } = await import("../src/lib/db/http.ts")
const { projectOfficialRegions } = await import("../src/components/map/officialRegions.ts")
const { CARTOGRAPHY_SHA256 } = await import("../src/data/territorial-validation.ts")

test("persistent filters reject duplicate, malformed and out-of-order inputs", () => {
  for (const value of ["ra=RA-I&ra=RA-I", "startDate=2026-02-30", "startDate=2026-02-01&endDate=2026-01-01", "category=not-uuid", "host=local", "hour=17-24"]) {
    assert.throws(() => parseAnalyticsSearch(new URLSearchParams(value)))
  }
  const sql = analyticsSql({ ra: "XXXVII", nature: "30000000-0000-4000-8000-000000000001",
    category: "20000000-0000-4000-8000-000000000001", hour: "18-24" })
  assert.match(sql.text, /EXISTS.*SELECT 1 FROM sentinela.ocorrencia_naturezas/)
  assert.match(sql.text, /count\(DISTINCT s.id\)/)
  assert.equal(sql.values.at(-1), "XXXVII")
  assert(!sql.text.includes("XXXVII"))
  assert(!sql.text.includes("numero_registro"))
})

test("operational map projects all 37 official features without modifying the pinned source", async () => {
  const raw = await readFile(new URL("../public/data/cartography/ras-ide-2026-11-13.geojson", import.meta.url))
  assert.equal(createHash("sha256").update(raw).digest("hex"), CARTOGRAPHY_SHA256)
  const regions = projectOfficialRegions(JSON.parse(raw))
  assert.equal(new Set(regions.map(region => region.code)).size, 37)
  assert(regions.some(region => region.code === "XXXVII" && region.path.length > 0))
  assert(regions.every(region => region.bounds.width > 0 && region.bounds.height > 0))
})

test("persistent analytics authenticates before querying and returns only private contract data", async () => {
  const previous = { ...process.env }
  const env = { NODE_ENV:"development", SENTINELA_AUTH_PROVIDER:"local", SENTINELA_LOCAL_BIND:"127.0.0.1", SENTINELA_APP_ORIGIN:"http://127.0.0.1:3317" }
  Object.assign(process.env, env)
  const data = { total:0,mapTotal:0,byRa:[],byNature:[],timeline:[],weekday:null,hour:null,
    regions:[],natures:[],categories:[],points:[],heatReference:[],pointsTruncated:false,heatUnavailable:false }
  let calls = 0
  const request = (search = "") => new Request(env.SENTINELA_APP_ORIGIN + PERSISTENT_ANALYTICS_PATH + search, { headers:{ host:"127.0.0.1:3317" } })
  const run = (principal, search) => analyticsGET(request(search), async () => principal, async () => { calls++;return data })
  try {
    const user = { id:"fixture", role:"Administrador", source:"local", name:"Fixture", authUserId:"" }
    assert.equal((await run(null,"?bad=1")).status,401)
    assert.equal((await run({...user,source:"preview"})).status,403)
    assert.equal((await run(user,"?bad=1")).status,400)
    assert.equal(calls,0)
    for (const role of ["Administrador","Operador","Analista"]) {
      const response = await run({ ...user, role })
      assert.equal(response.status,200)
      assert.match(response.headers.get("cache-control"),/no-store/)
      persistentAnalyticsData.parse((await response.json()).data)
    }
    assert(!persistentAnalyticsData.safeParse({ ...data, points:[{ raCode:"RA-I", latitude:-15.8, longitude:-47.8, local:"private" }] }).success)
    assert(isLocalReadEndpoint(PERSISTENT_ANALYTICS_PATH,"GET"))
    assert(!isLocalReadEndpoint(PERSISTENT_ANALYTICS_PATH,"POST"))
    assert(!isLocalReadEndpoint("/api/v1/analytics/dashboard","GET"))
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
})
