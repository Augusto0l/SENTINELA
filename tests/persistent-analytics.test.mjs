import "../scripts/contracts-runtime.mjs"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import test from "node:test"
const { parseAnalyticsSearch, persistentAnalyticsData, PERSISTENT_ANALYTICS_PATH } = await import("../src/contracts/persistent-analytics.ts")
const { analyticsSql } = await import("../src/lib/db/analytics-query.ts")
const { analyticsGET } = await import("../src/lib/db/analytics-http.ts")
const { isLocalReadEndpoint } = await import("../src/lib/db/http.ts")
const { DatabaseUnavailable, persistentDestination } = await import("../src/lib/db/config.ts")
const { occurrenceSql } = await import("../src/lib/db/occurrence-query.ts")
const { persistentQuerySchema } = await import("../src/contracts/persistent-occurrences.ts")
const { projectOfficialRegions } = await import("../src/components/map/officialRegions.ts")
const { CARTOGRAPHY_SHA256 } = await import("../src/data/territorial-validation.ts")
const { dashboardPeriod } = await import("../src/components/analytics/dashboard-period.ts")

test("PCDF Dashboard restricts source and applies nature and category to the same links", () => {
  const nature = "30000000-0000-4000-8000-000000000001"
  const sql = analyticsSql({ scope: "pcdf", nature, category: "Categoria", ra: "I" }, "integrated")
  assert.match(sql.text, /o\.fonte='PCDF' AND o\.origem='importacao'/)
  assert.equal(sql.text.match(/a\.categoria=\$2::text/g)?.length, 2)
  assert.match(sql.text, /'natureLinks'/)
  assert.match(sql.text, /FROM selected WHERE code IS NOT NULL/)
  assert.deepEqual(sql.values, [nature, "Categoria", "I"])
})

test("confirmed maps use the published projection independently of the PCDF statistical population", async () => {
  const { text, values } = analyticsSql({ scope: "pcdf", ra: "RA-I", hour: "18-24" }, "integrated", true)
  assert.match(text, /statistical AS \(SELECT \* FROM matched o WHERE o\.fonte='PCDF' AND o\.origem='importacao'\)/)
  // Spatial RA has priority for filtering and counting points; the territorial link is a separate field.
  assert.match(text, /SELECT id,coalesce\(to_jsonb\(p\)->>'ra_codigo',m\.code\) AS "raCode",p\.latitude,p\.longitude,m\.code AS "territorialRaCode"/)
  assert.match(text, /WHERE coalesce\(to_jsonb\(p\)->>'ra_codigo',m\.code\)=\$3::text/)
  assert.match(text, /'pcdf_crs_unverified' ELSE 'validated' END AS "publicationStatus"/)
  assert.match(text, /'eligiblePoints',\(SELECT count\(\*\) FROM mapped\)/)
  assert.match(text, /selected AS MATERIALIZED \(SELECT \* FROM statistical WHERE code=\$3::text\)/)
  assert.match(text, /'points',\(SELECT coalesce\(jsonb_agg\(to_jsonb\(p\) ORDER BY id\)/)
  assert.match(text, /'mappedByRa'/)
  // Heat: weighted 0.002° cells of the filtered points and of every published point; no 10,000-occurrence cutoff.
  assert.match(text, /heat AS \(SELECT \(round\(latitude::numeric\*500\)\/500\)::float8 AS latitude,\(round\(longitude::numeric\*500\)\/500\)::float8 AS longitude,"raCode",count\(\*\)::int AS weight\s+FROM mapped GROUP BY 1,2,3/)
  assert.match(text, /FROM sentinela_ocorrencias_analytics\.pontos_confirmados GROUP BY 1,2 ORDER BY 1,2/)
  assert.match(text, /'heat',CASE WHEN/)
  assert.doesNotMatch(text, /pontos_confirmados ORDER BY id LIMIT/)
  assert.deepEqual(values, [18, "24:00", "RA-I"])
  const install = await readFile(new URL("../database/release/map-confirmed-points.psql", import.meta.url), "utf8")
  assert.match(install, /o\.origem='manual' AND o\.fonte='SENTINELA_MANUAL'/)
  assert.match(install, /o\.localizacao_status='validada' AND o\.referencia_espacial_confirmada='WGS84; IDE-DF-2026-11-13'/)
  assert.match(install, /NULL::float8 AS longitude WHERE false/)
})

test("monthly Dashboard compares known zero counts and excludes missing and partial months", () => {
  const filters = { period: "all", startDate: "", endDate: "" }
  const data = { total: 4, timeline: [{ key: "2026-06", count: 4 }], monthCoverage: [
    { key: "2026-06", status: "complete", through: "2026-06-30" },
    { key: "2026-07", status: "complete", through: "2026-07-31" },
    { key: "2026-08", status: "not_imported", through: "2026-08-18" },
  ] }
  const full = dashboardPeriod(data, filters)
  assert.deepEqual(full.timeline, [{ key: "2026-06", count: 4 }, { key: "2026-07", count: 0 }])
  assert.equal(full.variation, "-100%")
  const custom = { period: "custom", startDate: "2026-06-01", endDate: "2026-08-31" }
  assert.equal(dashboardPeriod(data, custom).variation, null)
  assert.equal(dashboardPeriod(data, custom).notice, "1 competência ainda sem importação")
  assert.equal(dashboardPeriod({ ...data, total: 0, timeline: [] }, { ...custom, startDate: "2026-08-01" }).uncovered, true)
  assert.equal(dashboardPeriod({ ...data, monthCoverage: data.monthCoverage.slice(0, 2) }, custom).variation, null)
  const partial = { ...data, monthCoverage: data.monthCoverage.map(month => month.key === "2026-08" ? { ...month, status: "partial" } : month) }
  assert.equal(dashboardPeriod(partial, filters).variation, null)
  assert.equal(dashboardPeriod(partial, filters).notice, "Dados parciais até 18/08/2026")
  const beyondCutoff = dashboardPeriod({ ...partial, total: 0, timeline: [] }, { ...custom, startDate: "2026-08-19" })
  assert.deepEqual(beyondCutoff.timeline, [])
  assert.equal(beyondCutoff.uncovered, true)
})

test("persistent filters reject duplicate, malformed and out-of-order inputs", () => {
  for (const value of ["ra=RA-I&ra=RA-I", "startDate=2026-02-30", "startDate=2026-02-01&endDate=2026-01-01", "category=+", "host=local", "hour=17-24"]) {
    assert.throws(() => parseAnalyticsSearch(new URLSearchParams(value)))
  }
  const sql = analyticsSql({ ra: "XXXVII", nature: "30000000-0000-4000-8000-000000000001",
    category: "Categoria de origem PCDF", hour: "18-24" })
  assert.match(sql.text, /o\.id IN \(SELECT a\.ocorrencia_id FROM links/)
  assert.match(sql.text, /selected_links AS MATERIALIZED \([\s\S]*?JOIN selected s ON s.id=a.ocorrencia_id/)
  assert.equal([...sql.text.matchAll(/count\(DISTINCT a\.ocorrencia_id\)/g)].length, 2)
  assert.equal(sql.values.at(-1), "XXXVII")
  assert(sql.values.includes("Categoria de origem PCDF"))
  assert.doesNotMatch(sql.text, /mapeamentos_natureza|categorias_criminais/)
  assert(!sql.text.includes("XXXVII"))
  assert(!sql.text.includes("numero_registro"))
})

test("occurrence list, detail, dashboard and heat reference share the same local fixture boundary", () => {
  const query = persistentQuerySchema.parse({ page: 2, pageSize: 3 })
  const list = occurrenceSql(query)
  const detail = occurrenceSql(query, "30000000-0000-4000-8000-000000000001")
  const analytics = analyticsSql({})
  for (const statement of [list, detail, analytics]) {
    assert.match(statement.text, /o\.origem='manual'/)
    assert(statement.text.includes(`current_database()='${persistentDestination.database}'`))
    assert.match(statement.text, /o\.fonte='PCDF-SANDBOX' AND o\.ativo AND o\.consolidacao_status='consolidada'/)
    assert.doesNotMatch(statement.text, /linhas_staging|linhas_origem/)
  }
  assert.deepEqual(list.values, [3, 3])
  assert.deepEqual(detail.values, ["30000000-0000-4000-8000-000000000001", 1, 0])
  assert.match(analytics.text, /matched AS MATERIALIZED \(SELECT \* FROM visible/)
  assert.match(analytics.text, /reference AS \(\s*SELECT .* FROM visible/)
  assert.equal(analytics.text.match(/localizacao_status='validada' AND latitude IS NOT NULL AND longitude IS NOT NULL/g)?.length, 2)
})

test("operational map projects all 37 official features without modifying the pinned source", async () => {
  const raw = await readFile(new URL("../public/data/cartography/ras-ide-2026-11-13.geojson", import.meta.url))
  assert.equal(createHash("sha256").update(raw).digest("hex"), CARTOGRAPHY_SHA256)
  const regions = projectOfficialRegions(JSON.parse(raw))
  assert.equal(new Set(regions.map(region => region.code)).size, 37)
  assert(regions.some(region => region.code === "XXXVII" && region.path.length > 0))
  assert(regions.every(region => region.bounds.width > 0 && region.bounds.height > 0))
})

test("validated integrated GEO points without RA contribute to points and heat but not the RA filter", () => {
  const sql = analyticsSql({ ra: "RA-I" }, "integrated")
  assert.match(sql.text, /selected AS MATERIALIZED \(SELECT \* FROM matched WHERE code=\$1::text\)/)
  assert.doesNotMatch(sql.text, /WHERE code IS NOT NULL AND localizacao_status/)
  assert.match(sql.text, /count\(\*\) AS count FROM matched WHERE code IS NOT NULL/)
  assert.match(sql.text, /LIMIT 10001/)
  const geo = { latitude: -15.8, longitude: -47.9, raCode: null }
  const data = { total: 1, mapTotal: 1, byRa: [], byNature: [], timeline: [], weekday: null, hour: null,
    regions: [], natures: [], categories: [], points: [geo], heatReference: [geo], pointsTruncated: false, heatUnavailable: false }
  assert.deepEqual(persistentAnalyticsData.parse(data).points, [geo])
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
    assert.equal((await run(user,"?west=-48&south=-16&east=-47&north=-15&zoom=12")).status,400)
    assert.equal(calls,0)
    for (const role of ["Administrador","Operador","Analista"]) {
      const response = await run({ ...user, role })
      assert.equal(response.status,200)
      assert.match(response.headers.get("cache-control"),/no-store/)
      persistentAnalyticsData.parse((await response.json()).data)
    }
    const unavailable = await analyticsGET(request(), async () => user, async () => { throw new DatabaseUnavailable() })
    assert.equal(unavailable.status,503)
    assert.match(unavailable.headers.get("cache-control"),/no-store/)
    assert.equal((await unavailable.json()).success,false)
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

test("publicação PCDF: um ponto por ocorrência, RA oficial única, auditoria e decisão sobre o CRS registradas", async () => {
  const sql = await readFile(new URL("../database/release/pcdf-publicar-pontos.psql", import.meta.url), "utf8")
  const rollback = await readFile(new URL("../database/release/pcdf-publicar-pontos-rollback.psql", import.meta.url), "utf8")
  for (const script of [sql, rollback])
    assert.deepEqual(script.split(/\r?\n/).filter(line => /^(BEGIN|COMMIT|ROLLBACK);$/.test(line)), ["BEGIN;", "COMMIT;"])
  assert.match(sql, /p\.origens=p\.validas AND p\.distintos=1/)
  assert.match(sql, /WHERE v\.ras=1/)
  assert.match(sql, /o\.ativo AND o\.consolidacao_status='consolidada' AND o\.fonte='PCDF' AND o\.origem='importacao'/)
  assert.match(sql, /AND o\.versao=p\.versao_ocorrencia/)
  assert.match(sql, /sem comprovação formal/)
  assert.match(sql, /'pcdf\.publicacao_pontos'/)
  assert.doesNotMatch(sql, /UPDATE sentinela\.ocorrencias|DELETE FROM sentinela\.ocorrencias|INSERT INTO sentinela\.ocorrencias/)
  assert.match(rollback, /NULL::float8 AS longitude WHERE false/)
})

test("publicação PCDF pode ser revertida e reinstalada com ledger imutável", async () => {
  const sql = await readFile(new URL("../database/release/pcdf-publicar-pontos.psql", import.meta.url), "utf8")
  const rollback = await readFile(new URL("../database/release/pcdf-publicar-pontos-rollback.psql", import.meta.url), "utf8")
  assert.match(sql, /'local-pcdf-pontos-0001-reinstalada-'\|\|\(n\+1\)/)
  assert.match(rollback, /'local-pcdf-pontos-0001-revertida-'\|\|\(n\+1\)/)
  assert.doesNotMatch(sql + rollback, /DELETE FROM sentinela\.schema_migrations/)
  // Active exactly while installs exceed reversals by one.
  assert.match(rollback, /<>\(SELECT count\(\*\) FROM sentinela\.schema_migrations WHERE versao LIKE 'local-pcdf-pontos-0001-revertida%'\)\+1/)
})

test("heat cells weigh each occurrence once and the contract keeps the heat bounded", async () => {
  const { createDensityField } = await import("../src/components/map/heatmapDensity.ts")
  const single = createDensityField([{ x: 50, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 50 }], 100, 100)
  const weighted = createDensityField([{ x: 50, y: 50, weight: 3 }], 100, 100)
  assert.ok(Math.abs(single.peak - weighted.peak) < 1e-6)
  const base = { total: 0, mapTotal: 0, byRa: [], byNature: [], timeline: [], weekday: null, hour: null, regions: [],
    natures: [], categories: [], points: [], pointsTruncated: false }
  assert(persistentAnalyticsData.safeParse({ ...base, heatReference: [{ latitude: -15.8, longitude: -47.9, raCode: null, weight: 12 }],
    heat: [{ latitude: -15.8, longitude: -47.9, raCode: "RA-I", weight: 2 }], heatUnavailable: false }).success)
  assert(!persistentAnalyticsData.safeParse({ ...base, heatReference: [], heat: [{ latitude: -15.8, longitude: -47.9, raCode: null, weight: 1 }],
    heatUnavailable: true }).success)
})

test("0018 publishes PCDF map points automatically with the reviewed rule and least privilege", async () => {
  const sql = await readFile(new URL("../database/supabase/pendentes/0018_publicacao_automatica_pontos_pcdf.sql", import.meta.url), "utf8")
  assert.match(sql, /CREATE TRIGGER pontos_pcdf_vinculos AFTER INSERT ON sentinela\.ocorrencia_naturezas/)
  assert.match(sql, /CREATE TRIGGER pontos_pcdf_ocorrencias AFTER UPDATE ON sentinela\.ocorrencias/)
  assert.match(sql, /o\.ativo AND o\.consolidacao_status = 'consolidada' AS consolidada/)
  assert.match(sql, /p\.origens = p\.validas AND p\.distintos = 1/)
  assert.match(sql, /HAVING count\(\*\) = 1/)
  assert.match(sql, /ON CONFLICT \(ocorrencia_id\) DO UPDATE/)
  assert.match(sql, /NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/)
  assert.match(sql, /REVOKE USAGE ON SCHEMA sentinela_ocorrencias_analytics FROM SESSION_USER/)
  assert.doesNotMatch(sql, /DISABLE ROW LEVEL SECURITY|TO sentinela_local_(admin|operator|analyst)/)
})
