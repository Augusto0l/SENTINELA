// Visual qualification with explicit HTTP fixtures and a real local test session.
import assert from "node:assert/strict"
import { chromium } from "playwright-core"
import { mkdir, readFile } from "node:fs/promises"
import "./contracts-runtime.mjs"

const { persistentAnalyticsResponse } = await import("../src/contracts/persistent-analytics.ts")
const { CONTRACT_VERSION, catalogVersion } = await import("../src/contracts/common.ts")
const bindings = JSON.parse(await readFile(new URL("../public/data/cartography/ra-bindings.json", import.meta.url), "utf8"))
const analyticsRoute = "**/api/v1/analytics/persistente**"
const point = { raCode: "RA-I", latitude: -15.79, longitude: -47.88 }
const natures = [
  { id: "30000000-0000-4000-8000-000000000001", name: "Natureza de teste A" },
  { id: "30000000-0000-4000-8000-000000000002", name: "Natureza de teste B" },
]
const category = { id: "20000000-0000-4000-8000-000000000001", name: "Categoria de teste" }
const availableTotal = 6
const filterLabels = ["Período", "Região Administrativa", "Natureza criminal", "Categoria", "Faixa de horário"]
const kpiLabels = ["OCORRÊNCIAS", "RAs AFETADAS", "DIA CRÍTICO", "VARIAÇÃO"]
const panelLabels = [
  "Top 5 RAs por ocorrências", "Ocorrências por natureza", "Evolução das ocorrências",
  "Ocorrências por categoria",
]
const captures = "tmp/dashboard-redesign-evidence"
const capture = process.argv.includes("--analytics-screenshots")
const screenshotOptions = { style: "nextjs-portal { display: none !important; }", animations: "disabled" }
const mapRegion = page => page.getByRole("region", { name: "Ocorrências por Região Administrativa", exact: true })
const analysisRegion = page => page.getByRole("region", { name: "Análises do Período", exact: true })
const kpiRegion = page => page.locator('[aria-label="Indicadores principais"]')

function response(total) {
  // Fixed data for browser verification. The application never loads this fixture directly.
  return persistentAnalyticsResponse.parse({
    success: true,
    meta: { contractVersion: CONTRACT_VERSION, catalogVersion, execution: { mode: "operacional", persisted: true } },
    data: {
      total, mapTotal: total, byRa: total ? [{ key: point.raCode, count: total }] : [],
      byNature: total ? [{ key: natures[0].name, count: 4 }, { key: natures[1].name, count: 3 }] : [],
      byCategory: total ? [{ key: category.name, count: total }] : [],
      timeline: total ? [{ key: "2026-01", count: 1 }, { key: "2026-02", count: 2 }, { key: "2026-03", count: 3 }] : [],
      weekday: total ? 1 : null, hour: total ? 10 : null,
      regions: bindings.entries.map(entry => ({ code: entry.code, name: entry.catalogName })),
      natures, categories: [category], points: total ? [point] : [], heatReference: total ? [point] : [],
      pointsTruncated: false, heatUnavailable: false,
    },
  })
}

async function verifyDashboard(page) {
  const filters = page.getByRole("form", { name: "Filtros analíticos" })
  const map = mapRegion(page)
  const sidebar = analysisRegion(page)
  const kpis = kpiRegion(page)
  const filterMenu = page.locator("summary").filter({ hasText: /^Filtros/ })
  await filters.getByLabel("Período", { exact: true }).waitFor()
  await toggleFilters(page, true)
  for (const label of filterLabels) await filters.getByLabel(label, { exact: true }).waitFor()
  await filters.getByRole("button", { name: "Limpar filtros" }).waitFor()
  await verifyWidth(page)
  await toggleFilters(page, false)
  await filterMenu.waitFor()
  for (const label of kpiLabels) await kpis.getByText(label, { exact: true }).waitFor()
  for (const label of panelLabels.slice(0, 3)) await sidebar.getByText(label, { exact: true }).waitFor()
  assert.equal(await sidebar.getByText(panelLabels[3], { exact: true }).count(), 1)
  await map.getByText("Como interpretar o mapa?", { exact: true }).waitFor()
  for (const name of ["Mapa", "Mapa de calor", "Pontos", "Clusters", "Satélite"]) {
    await map.getByRole("button", { name, exact: true }).waitFor()
  }
}

async function toggleFilters(page, open) {
  const menu = page.locator("summary").filter({ hasText: /^Filtros/ })
  const details = menu.locator("..")
  if (((await details.getAttribute("open")) !== null) !== open) await menu.click()
}

async function verifyWidth(page) {
  const bounds = await page.evaluate(() => ({ window: window.innerWidth, body: document.documentElement.scrollWidth }))
  assert(bounds.body <= bounds.window, "The dashboard does not require horizontal scrolling")
}

async function verifyLayout(page, width) {
  const map = mapRegion(page)
  const sidebar = analysisRegion(page)
  const headings = panelLabels.slice(0, 3).map(label => sidebar.getByText(label, { exact: true }))
  const [mapBox, kpis, ranking, nature, timeline] = await Promise.all(
    [map, kpiRegion(page), ...headings].map(locator => locator.boundingBox()),
  )
  assert(mapBox && kpis && ranking && nature && timeline, "All dashboard sections have rendered dimensions")
  assert(mapBox.height >= 340, "The map remains usable at this viewport")
  await verifyWidth(page)
  if (width >= 1600) {
    assert(mapBox.x + mapBox.width <= kpis.x + 1, "The dominant map sits to the left of the KPIs")
    assert(mapBox.y >= kpis.y - 24 && mapBox.y <= kpis.y + 140)
    assert(mapBox.width >= kpis.width * .8, "The map takes close to half the dashboard")
    assert(ranking.x < nature.x && Math.abs(ranking.y - nature.y) <= 10, "Ranking and donut share a row")
    assert(timeline.y > Math.max(ranking.y, nature.y), "Monthly trend sits below the ranking and donut")
  }
  if (width < 740) {
    assert(kpis.y + kpis.height <= mapBox.y + 1)
    assert(mapBox.y < ranking.y && ranking.y < nature.y && nature.y < timeline.y, "Mobile order follows the approved layout")
  }
}

async function captureDashboard(page, width, height, state) {
  if (!capture) return
  await mkdir(captures, { recursive: true })
  await page.screenshot({ ...screenshotOptions, path: `${captures}/dashboard-${state}-${width}x${height}.png` })
  if (width < 740) {
    await mapRegion(page).scrollIntoViewIfNeeded()
    await page.screenshot({ ...screenshotOptions, path: `${captures}/dashboard-${state}-mobile-mapa.png` })
    await analysisRegion(page).getByText(panelLabels[1], { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ ...screenshotOptions, path: `${captures}/dashboard-${state}-mobile-paineis.png` })
  }
}

async function waitForTotal(page, count) {
  const attr = count === undefined ? ":not([data-count])" : `[data-count="${count}"]`
  await page.locator(`[data-testid="analytics-total"]${attr}`).waitFor({ timeout: 10000 })
}

export async function checkPersistentAnalyticsInterface({ origin, cookie }) {
  const browser = await chromium.launch({ channel: "msedge", headless: true })
  const [name, value] = cookie.split("=")
  const checks = []
  let stage = "browser"
  try {
    for (const { width, height } of [{ width: 1672, height: 941 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport: { width, height } })
      await context.addCookies([{ name, value, url: origin, httpOnly: true, sameSite: "Strict" }])
      let holdResponse
      const serveFixture = async route => {
        const wait = holdResponse
        if (wait) await wait
        const params = new URL(route.request().url()).searchParams
        const ra = params.get("ra")
        const total = params.has("hour") || (ra && ra !== point.raCode) ? 0 : availableTotal
        await route.fulfill({ status: 200, json: response(total) })
      }
      await context.route(analyticsRoute, serveFixture)
      const page = await context.newPage()
      page.setDefaultNavigationTimeout(120000)
      page.setDefaultTimeout(60000)
      const open = async path => {
        const response = await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 90000 })
        assert.equal(response?.status(), 200)
        assert.equal(new URL(page.url()).pathname, path.split("?")[0])
      }
      const errors = []
      page.on("pageerror", error => errors.push(error.name))
      stage = `${width} dashboard loading navigation`
      let releaseResponse
      holdResponse = new Promise(resolve => { releaseResponse = resolve })
      await open("/dashboard")
      stage = `${width} dashboard loading announcement`
      await page.getByText("Consultando indicadores…", { exact: true }).waitFor()
      stage = `${width} dashboard loading scaffold`
      await verifyDashboard(page)
      await waitForTotal(page)
      assert.equal(await kpiRegion(page).getAttribute("aria-busy"), "true")

      stage = `${width} dashboard with records`
      releaseResponse()
      holdResponse = undefined
      await waitForTotal(page, availableTotal)
      await verifyDashboard(page)
      await page.getByTestId("crime-heatmap").waitFor()
      const natureLegend = analysisRegion(page).getByRole("list", { name: "Participação nas associações por natureza" })
      for (const [index, share] of ["57,1%", "42,9%"].entries()) {
        await natureLegend.getByText(natures[index].name, { exact: true }).waitFor()
        assert.match(await natureLegend.getByText(natures[index].name, { exact: true }).locator("..").innerText(), new RegExp(share))
      }
      await analysisRegion(page).getByText("Série mensal em tabela", { exact: true }).waitFor()
      await verifyLayout(page, width)
      await captureDashboard(page, width, height, "com-dados-de-teste")
      const categoryMenu = analysisRegion(page).getByText("Ocorrências por categoria", { exact: true })
      await categoryMenu.click()
      await analysisRegion(page).getByText(`${category.name} · ${availableTotal}`, { exact: true }).waitFor()
      await categoryMenu.click()
      if (width >= 1600) {
        stage = `${width} dashboard sidebar and theme controls`
        await page.getByRole("button", { name: "Recolher navegação", exact: true }).click()
        await page.getByRole("button", { name: "Expandir navegação", exact: true }).click()
        await page.getByRole("button", { name: "Ativar tema claro", exact: true }).click()
        await page.getByRole("button", { name: "Ativar tema escuro", exact: true }).click()
        for (const narrower of [{ width: 1366, height: 768 }, { width: 820, height: 1180 }]) {
          stage = `${narrower.width} dashboard responsive width`
          await page.setViewportSize(narrower)
          await verifyLayout(page, narrower.width)
        }
        await page.setViewportSize({ width, height })
      }

      stage = `${width} dashboard layers and official boundaries`
      const map = mapRegion(page)
      const mapSvg = map.locator("svg:has(path[role=button])")
      const initialViewBox = await mapSvg.getAttribute("viewBox")
      await map.getByRole("button", { name: "Ampliar mapa", exact: true }).click()
      assert.notEqual(await mapSvg.getAttribute("viewBox"), initialViewBox)
      await map.getByRole("button", { name: "Reduzir mapa", exact: true }).click()
      assert.equal(await mapSvg.getAttribute("viewBox"), initialViewBox)
      await map.getByRole("button", { name: "Ampliar mapa", exact: true }).click()
      await map.getByRole("button", { name: "Restaurar enquadramento do mapa", exact: true }).click()
      assert.equal(await mapSvg.getAttribute("viewBox"), initialViewBox)
      await map.getByRole("button", { name: "Pontos", exact: true }).click()
      await page.getByTestId("occurrence-points").waitFor()
      await map.getByRole("button", { name: "Clusters", exact: true }).click()
      await page.getByTestId("occurrence-clusters").waitFor()
      // Verify the official polygons without making the test depend on remote tile availability.
      await context.route(/^https:\/\//, route => route.abort())
      await map.getByRole("button", { name: "Satélite", exact: true }).click()
      const dashboardSatellite = page.getByTestId("satellite-map")
      await dashboardSatellite.locator('[data-ra-code="XXXVII"]').waitFor()
      assert.equal(await dashboardSatellite.locator("[data-ra-code]").count(), 37)
      await map.getByRole("button", { name: "Mapa", exact: true }).click()
      await map.getByRole("button", { name: "Mapa de calor", exact: true }).click()
      await page.getByTestId("crime-heatmap").waitFor()

      stage = `${width} dashboard combined filters`
      await toggleFilters(page, true)
      for (const [label, key, value] of [
        ["Região Administrativa", "ra", point.raCode],
        ["Natureza criminal", "nature", natures[0].id],
        ["Categoria", "category", category.id],
      ]) {
        const filtered = page.waitForRequest(req => {
          const url = new URL(req.url())
          return url.pathname === "/api/v1/analytics/persistente" && url.searchParams.get(key) === value
        })
        await page.getByLabel(label, { exact: true }).selectOption(value)
        await filtered
        await waitForTotal(page, availableTotal)
      }
      await page.getByLabel("3 filtros complementares ativos", { exact: true }).waitFor()
      await page.getByLabel("Região Administrativa", { exact: true }).press("Escape")
      assert.equal(await page.getByLabel("Região Administrativa", { exact: true }).isVisible(), false)
      await page.getByLabel("Período", { exact: true }).selectOption("custom")
      await page.getByLabel("Data inicial", { exact: true }).fill("2026-01-01")
      await page.getByLabel("Data final", { exact: true }).fill("2026-03-31")
      const customPeriod = page.waitForRequest(req => {
        const params = new URL(req.url()).searchParams
        return params.get("startDate") === "2026-01-01" && params.get("endDate") === "2026-03-31"
      })
      await page.getByRole("button", { name: "Aplicar período", exact: true }).click()
      await customPeriod
      await waitForTotal(page, availableTotal)
      await toggleFilters(page, true)
      await page.getByRole("button", { name: "Limpar filtros" }).click()
      await waitForTotal(page, availableTotal)

      stage = `${width} dashboard empty`
      await toggleFilters(page, true)
      await page.getByLabel("Faixa de horário", { exact: true }).selectOption("0-6")
      await waitForTotal(page, 0)
      assert.equal(await page.getByTestId("analytics-total").textContent(), "0")
      await verifyDashboard(page)
      await page.getByRole("status").filter({ hasText: "Nenhuma ocorrência encontrada no intervalo" }).waitFor()
      await kpiRegion(page).getByText(/^0\s*\/\s*37$/).waitFor()
      assert.equal(await map.locator("svg path[role=button]").count(), 37)

      stage = `${width} dashboard stale result suppression`
      holdResponse = new Promise(resolve => { releaseResponse = resolve })
      await toggleFilters(page, true)
      await page.getByRole("button", { name: "Limpar filtros" }).click()
      await waitForTotal(page)
      await toggleFilters(page, true)
      await page.getByLabel("Faixa de horário", { exact: true }).selectOption("0-6")
      assert.equal(await kpiRegion(page).getAttribute("aria-busy"), "true")
      await waitForTotal(page)
      releaseResponse()
      holdResponse = undefined
      await waitForTotal(page, 0)

      stage = `${width} dashboard unavailable response`
      await context.unroute(analyticsRoute, serveFixture)
      const unavailable = page.waitForResponse(res => new URL(res.url()).pathname === "/api/v1/analytics/persistente")
      await open("/dashboard")
      assert.equal((await unavailable).status(), 503)
      await page.getByRole("alert").filter({ hasText: "Não foi possível consultar os indicadores" }).waitFor()
      await verifyDashboard(page)
      await waitForTotal(page)
      assert.equal(await page.getByTestId("analytics-total").textContent(), "—")
      for (const label of kpiLabels) {
        const card = kpiRegion(page).getByText(label, { exact: true }).locator("..")
        assert.match(await card.innerText(), /—/)
        assert.equal(await card.getByText("0", { exact: true }).count(), 0)
      }
      const polygons = map.locator('svg path[role=button][aria-label$="dados indisponíveis"]')
      await polygons.first().waitFor()
      assert.equal(await polygons.count(), 37)
      assert.equal(await page.getByTestId("crime-heatmap").count(), 0)
      await verifyLayout(page, width)
      await captureDashboard(page, width, height, "indisponivel")

      stage = `${width} dashboard retry`
      await context.route(analyticsRoute, serveFixture)
      const retried = page.waitForRequest(req => new URL(req.url()).pathname === "/api/v1/analytics/persistente")
      await page.getByRole("button", { name: "Tentar novamente", exact: true }).click()
      await retried
      await waitForTotal(page, availableTotal)
      assert.equal(await page.getByRole("alert").filter({ hasText: "Não foi possível consultar os indicadores" }).count(), 0)

      stage = `${width} crime map indicators and heatmap`
      const selectedRa = map.getByRole("button", { name: /^Plano Piloto:/ })
      await selectedRa.press("Enter")
      await page.waitForURL(url => url.pathname === "/mapa-criminal" && url.searchParams.get("ra") === point.raCode)
      await waitForTotal(page, availableTotal)
      await page.getByTestId("crime-heatmap").waitFor()
      assert.equal(await page.getByRole("option", { name: "Ponte Alta" }).count(), 1)
      stage = `${width} points and clusters`
      await page.getByRole("button", { name: "Pontos", exact: true }).click()
      await page.getByTestId("occurrence-points").waitFor()
      await page.getByRole("button", { name: "Clusters", exact: true }).click()
      await page.getByTestId("occurrence-clusters").waitFor()
      stage = `${width} satellite boundaries`
      // Qualify the official overlay independently of external imagery availability.
      await open("/mapa-criminal")
      await page.getByRole("button", { name: "Satélite", exact: true }).click()
      const satellite = page.getByTestId("satellite-map")
      await satellite.locator('[data-ra-code="XXXVII"]').waitFor()
      assert.equal(await satellite.locator("[data-ra-code]").count(), 37)
      assert.deepEqual(errors, [])
      checks.push(`persistent_analytics_ui_${width}`)
      await context.close()
    }
    return checks
  } catch (error) {
    console.error(`Analytics browser check failed at ${stage} (${error.name}).`)
    const locator = error.message.split("\n").find(line => line.includes("waiting for"))
    if (locator) console.error(locator)
    throw error
  } finally { await browser.close() }
}
