import assert from "node:assert/strict"
import { randomBytes, randomUUID, scryptSync } from "node:crypto"
import { readFile, realpath, unlink, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { chromium } from "playwright-core"
import { freePort, httpValidation } from "./http-validation-output.mjs"

const root = await realpath(process.env.SENTINELA_CATALOG_CLONE_ROOT)
assert.equal(dirname(root).toLowerCase(),
  (await realpath(join(process.env.USERPROFILE, ".sentinela-local", "homologacao-clone"))).toLowerCase())
assert.match(basename(root), /^clone-[0-9a-f]{32}$/)
const load = async name => JSON.parse(await readFile(join(root, name), "utf8"))
const target = await load("identity-55487.json")
const { origin: source } = await load("backup.json")
assert.equal(target.port, 55487)
assert.notEqual(target.system, source.system)
assert.notEqual(target.uuid, source.uuid)
assert.equal((await realpath(target.folder)).toLowerCase(), (await realpath(join(root, "data-55487"))).toLowerCase())
const origin = "http://127.0.0.1:3318"
const validationId = randomUUID()
const run = httpValidation(validationId, { port: 3318, evidence: root })
const loginPassword = randomBytes(32).toString("hex")
const roles = ["Administrador", "Operador", "Analista"]
const coordinateAbsence = process.argv.includes("--coordinate-absence")
const coordinateBaseline = process.argv.includes("--coordinate-baseline")
const historical = process.argv.includes("--historical") ? await load("pcdf-history-result.json") : null
const independentReview = Boolean(historical) || process.argv.includes("--independent-review")
const geographicControl = process.argv.includes("--geo-qualification")
const expectedIssues = coordinateAbsence || independentReview ? 8091 : 20321
const expectedTotal = historical?.total ?? (independentReview ? 6090 : 0)
const expectedRecords = 6393 + (historical?.received.records ?? 0)
const expectedTimeline = historical?.timeline ?? [{ key: "2021-01", count: 6090 }]
const variation = historical?.monthlyVariation.toLocaleString("pt-BR",
  { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" })
const accounts = roles.map((role, i) => {
  const salt = randomBytes(16).toString("hex")
  return { email: `catalogo-${i}@example.test`, role, salt,
    hash: scryptSync(loginPassword, Buffer.from(salt, "hex"), 64).toString("hex") }
})
const accountsPath = join(root, "accounts-original-catalog.json")
await freePort(3318)
await writeFile(accountsPath, JSON.stringify({ accounts }), { flag: "wx" })
let browser
try {
  await run.prepare()
  const child = run.start({ ...process.env, NODE_ENV: "development", SENTINELA_APP_ORIGIN: origin,
    SENTINELA_HTTP_VALIDATION_ID: validationId, SENTINELA_LOCAL_ACCOUNTS_FILE: accountsPath, SENTINELA_AUTH_PROVIDER: "local",
    SENTINELA_OPERATIONAL_CLONE: "1", SENTINELA_OPERATIONAL_IMPORT_MANAGEMENT: "1", SENTINELA_OCCURRENCE_MANAGEMENT: "0",
    SENTINELA_PCDF_SYNTHETIC: "0", SENTINELA_PCDF_LOCAL_ID: target.uuid,
    SENTINELA_PCDF_LOCAL_SYSTEM_ID: target.system, SENTINELA_PCDF_LOCAL_START: target.start,
    SENTINELA_LOCAL_DEMO: "0", SENTINELA_SANDBOX_WRITE: "0", SENTINELA_PERSISTENT_HOMOLOGATION: "0",
    SENTINELA_LOCAL_READER_URL: "", SENTINELA_DATABASE_URL: "", NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_TELEMETRY_DISABLED: "1",
    NEXT_TRACE_SPAN_THRESHOLD_MS: "2147483647",
  }, "ignore")
  const deadline = Date.now() + 180000
  let ready = false
  while (child.exitCode === null && Date.now() < deadline) {
    const response = await fetch(origin + "/login", { signal: AbortSignal.timeout(5000) }).catch(() => null)
    if (response?.ok) { ready = true; break }
    await delay(300)
  }
  assert(ready, "O Next do clone não respondeu")
  run.proveListener()
  const analytics = "/api/v1/analytics/persistente"
  const consultation = "/api/v1/ocorrencias/consulta"
  assert.equal((await fetch(origin + analytics)).status, 401)
  browser = await chromium.launch({ channel: "msedge", headless: true })
  for (const [index, account] of accounts.entries()) {
    const context = await browser.newContext()
    try {
      const signin = await context.request.post(origin + "/auth/login", { maxRedirects: 0, headers: { origin },
        form: { email: account.email, password: loginPassword }, timeout: 90000 })
      assert.equal(signin.status(), 303)
      assert.equal(new URL(signin.headers().location, origin).pathname, "/dashboard")
      const get = async (path, params, status = 200) => {
        const response = await context.request.get(origin + path, { params, timeout: 90000 })
        assert.equal(response.status(), status, `${account.role} ${path} ${params?.view ?? ""}`)
        if (status === 200) return (await response.json()).data
      }
      const data = await get(analytics)
      assert.equal(data.natures.length, 41)
      assert.equal(data.total, expectedTotal)
      if (historical) {
        assert.deepEqual(data.timeline, expectedTimeline)
        assert.deepEqual(data.byRa, [])
      } else if (independentReview) {
        assert.equal(data.byNature.length, 34)
        assert.equal(data.byNature.reduce((sum, item) => sum + item.count, 0), 6392)
        assert.deepEqual(data.timeline, [{ key: "2021-01", count: 6090 }])
        assert.deepEqual(data.byRa, [])
      } else assert.deepEqual(data.byNature, [])
      assert.deepEqual(data.points, [])
      assert.deepEqual(data.heatReference, [])
      const summary = await get(consultation, { view: "resumo" })
      assert.equal(summary.consolidadas, expectedTotal)
      assert.equal(summary.recebidas, index === 2 ? null : expectedRecords)
      assert.equal(summary.pendencias, index === 2 ? null : expectedIssues + (historical?.scope.total_pendencias ?? 0))
      if (index === 2) {
        await get(consultation, { view: "importados" }, 403)
        await get("/api/v1/ocorrencias/manuais", {}, 403)
      } else {
        const list = await get(consultation, { view: "importados" })
        assert.equal(list.total, expectedRecords)
        const detail = await get(consultation, { view: "detalhe", area: "importados", id: list.itens[0].id })
        assert(!detail.pendencias.some(issue => issue.regra === "classificacao_pendente"))
        if (independentReview) assert(detail.pendencias.some(issue => issue.motivo.startsWith("Localização GEO pendente.")))
        await get("/api/v1/importacoes/pcdf/direta")
        await get("/api/v1/importacoes/geral")
        await get("/api/v1/ocorrencias/manuais", {}, 503)
      }
      if (independentReview) {
        const consolidated = await get(consultation, { view: "consolidadas" })
        assert.equal(consolidated.total, expectedTotal)
        const detail = await get(consultation, { view: "detalhe", area: "consolidadas", id: consolidated.itens[0].id })
        assert(detail.localizacaoStatus.startsWith("Localização GEO pendente."))
        assert.equal(detail.latitude, null)
        assert.equal(detail.longitude, null)
      }
      if (index === 0) {
        const chosen = independentReview ? data.natures.find(nature => nature.name === data.byNature[0].key) : data.natures[0]
        const filtered = await get(analytics, { nature: chosen.id })
        assert.equal(filtered.total, independentReview ? data.byNature[0].count : 0)
        assert.deepEqual(filtered.points, [])
        if (independentReview) {
          const start = performance.now()
          const january = await get(analytics, { startDate: "2021-01-01", endDate: "2021-01-31" })
          const januaryMs = Math.round(performance.now() - start)
          const february = await get(analytics, { startDate: "2021-02-01", endDate: "2021-02-28" })
          assert.equal(january.total, 6090)
          assert.equal(february.total, historical?.scope.ocorrencias ?? 0)
          if (historical) {
            assert.deepEqual(january.byNature, historical.januaryByNature)
            assert.deepEqual(february.byNature, historical.februaryByNature)
            const both = await get(analytics, { startDate: "2021-01-01", endDate: "2021-02-28" })
            assert.deepEqual(both.timeline, expectedTimeline)
          }
          const ra = await get(analytics, { ra: data.regions[0]?.code ?? "RA-01" })
          assert.equal(ra.total, 0)
          assert.deepEqual(ra.points, [])
          const byCategory = data.byCategory?.[0]
          assert(byCategory)
          assert.equal((await get(analytics, { category: byCategory.key })).total, byCategory.count)
          let withTime = 0
          for (const hour of ["0-6", "6-12", "12-18", "18-24"]) {
            const time = await get(analytics, { hour })
            assert(time.total > 0)
            assert.deepEqual(time.points, [])
            withTime += time.total
          }
          assert.equal(withTime, expectedTotal - (historical?.scope.horario_nulo ?? 0))
          console.log(`Consulta HTTP aquecida de janeiro no clone (indicadores e pontos): ${januaryMs} ms.`)
        }
        const page = await context.newPage()
        await context.routeWebSocket(/webpack-hmr/, () => {})
        for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
          await page.setViewportSize(viewport)
          const response = await page.goto(origin + "/dashboard", { waitUntil: "domcontentloaded", timeout: 120000 })
          assert.equal(response.status(), 200)
          await page.locator(`[data-testid="analytics-total"][data-count="${expectedTotal}"]`).waitFor({ timeout: 90000 })
          if (historical) {
            await page.getByText(variation, { exact: true }).waitFor()
            await page.getByText("Série mensal em tabela", { exact: true }).click()
            const monthlyTable = page.getByRole("table", { name: "Ocorrências por mês no recorte aplicado" })
            assert.deepEqual(await monthlyTable.locator("tbody tr").allTextContents(),
              expectedTimeline.map(({ key, count }) => `${key.split("-").reverse().join("/")}${count}`))
            await page.screenshot({ path: join(root, `historico-dashboard-${viewport.width}.png`), animations: "disabled" })
            await page.getByLabel("Período", { exact: true }).selectOption("custom")
            const applyPeriod = async (start, end, count) => {
              await page.getByLabel("Data inicial").fill(start)
              await page.getByLabel("Data final").fill(end)
              await page.getByRole("button", { name: "Aplicar período" }).click()
              await page.locator(`[data-testid="analytics-total"][data-count="${count}"]`).waitFor()
            }
            await applyPeriod("2021-02-01", "2021-02-28", 5221)
            await page.getByText("Dados de fevereiro de 2021", { exact: true }).waitFor()
            await page.getByText("Sem período comparável", { exact: true }).waitFor()
            await applyPeriod("2021-01-02", "2021-02-28", (
              await get(analytics, { startDate: "2021-01-02", endDate: "2021-02-28" })
            ).total)
            await page.getByText("Sem período comparável", { exact: true }).waitFor()
            await applyPeriod("2021-01-01", "2021-02-28", expectedTotal)
            await page.getByText(variation, { exact: true }).waitFor()
          } else if (independentReview) {
            await page.getByText("Dados de janeiro de 2021", { exact: true }).waitFor()
            await page.getByText("Sem período comparável", { exact: true }).waitFor()
            if (viewport.width === 1440) {
              const reload = await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 })
              assert.equal(reload.status(), 200)
              assert.equal(new URL(page.url()).pathname, "/dashboard")
              await page.getByText("Dados de janeiro de 2021", { exact: true }).waitFor({ timeout: 90000 })
            }
          }
          await page.getByRole("region", { name: "Ocorrências por Região Administrativa" }).waitFor()
          if (coordinateAbsence || coordinateBaseline) {
            await page.getByText("Nenhuma ocorrência encontrada.", { exact: true }).first().waitFor({ timeout: 90000 })
          }
          if (independentReview) await page.getByRole("button", { name: "Ampliar mapa" }).waitFor({ timeout: 90000 })
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          const screenshot = `catalogo-dashboard-${viewport.width}${coordinateBaseline ? "-antes" : ""}.png`
          if (!historical) await page.screenshot({ path: join(root, screenshot), animations: "disabled" })
          if (coordinateAbsence || independentReview) {
            assert.equal((await page.goto(origin + "/mapa-criminal", { waitUntil: "domcontentloaded", timeout: 120000 })).status(), 200)
            assert.equal(new URL(page.url()).pathname, "/mapa-criminal")
            await page.locator("main").waitFor()
            if (independentReview) for (const mode of ["Pontos", "Clusters", "Calor"]) {
              const button = page.getByRole("button", { name: mode, exact: true })
              await button.click()
              assert.equal(await button.getAttribute("aria-pressed"), "true")
              const layer = page.getByTestId(mode === "Pontos" ? "occurrence-points" :
                mode === "Clusters" ? "occurrence-clusters" : "crime-heatmap")
              await layer.waitFor({ state: "attached", timeout: 90000 })
              if (mode === "Calor") assert.equal(await layer.getAttribute("data-point-count"), "0")
              else assert.equal(await layer.locator(":scope > *").count(), 0)
            }
            if (independentReview) {
              await page.getByText(historical ? "Leitura PostgreSQL · Todo o período disponível"
                : "Leitura PostgreSQL · Dados de janeiro de 2021", { exact: true }).waitFor()
              const prefix = historical ? "historico" : "catalogo"
              await page.screenshot({ path: join(root, `${prefix}-mapa-criminal-${viewport.width}.png`), animations: "disabled" })
            }
          }
        }
        if (geographicControl) {
          // The fixture came from a rolled-back lot of public geodetic controls, never from PCDF positions.
          const control = await load("pcdf-geo-control-analytics.json")
          assert.equal(control.points.length, 1)
          const intercept = `${origin}${analytics}*`
          const apiResponse = await context.request.get(origin + analytics)
          assert.equal(apiResponse.status(), 200)
          const envelope = await apiResponse.json()
          await page.route(intercept, route => route.fulfill({ json: { ...envelope, data: control } }))
          try {
            await page.goto(origin + "/mapa-criminal", { waitUntil: "domcontentloaded", timeout: 120000 })
            for (const mode of ["Pontos", "Clusters", "Calor"]) {
              await page.getByRole("button", { name: mode, exact: true }).click()
              const layer = page.getByTestId(mode === "Pontos" ? "occurrence-points" : mode === "Clusters" ? "occurrence-clusters" : "crime-heatmap")
              await layer.waitFor({ state: "attached", timeout: 90000 })
              if (mode === "Pontos") assert.equal(await layer.locator(":scope > *").count(), 1)
              else if (mode === "Clusters") assert.deepEqual(await layer.locator("text").allTextContents(), ["1"])
              else {
                assert.equal(await layer.getAttribute("data-point-count"), "1")
                await page.waitForFunction(() => Number(document.querySelector('[data-testid="crime-heatmap"]')?.getAttribute("data-reference-peak")) > 0)
              }
            }
          } finally {
            await page.unroute(intercept)
          }
        }
      }
    } finally {
      await context.close()
    }
  }
  console.log("APIs dos três perfis e Dashboard em desktop/mobile conferidos no clone.")
} finally {
  try {
    await browser?.close()
    await run.finish()
  } finally {
    await unlink(accountsPath)
  }
}
