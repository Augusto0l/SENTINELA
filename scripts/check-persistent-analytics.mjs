// Visual qualification with explicit HTTP fixtures and a real local test session.
import assert from "node:assert/strict"
import { chromium } from "playwright-core"
import { readFile } from "node:fs/promises"
import "./contracts-runtime.mjs"

const { persistentAnalyticsResponse } = await import("../src/contracts/persistent-analytics.ts")
const { CONTRACT_VERSION, catalogVersion } = await import("../src/contracts/common.ts")
const bindings = JSON.parse(await readFile(new URL("../public/data/cartography/ra-bindings.json", import.meta.url), "utf8"))
export async function checkPersistentAnalyticsInterface({ origin, cookie }) {
  const browser = await chromium.launch({ channel: "msedge", headless: true })
  const [name, value] = cookie.split("=")
  const checks = []
  let stage = "browser"
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      await context.addCookies([{ name, value, url: origin, httpOnly: true, sameSite: "Strict" }])
      let unavailable = false
      await context.route("**/api/v1/analytics/persistente**", async route => {
        if (unavailable) {
          await route.fulfill({ status: 503, json: {} })
          return
        }
        const ra = new URL(route.request().url()).searchParams.get("ra")
        const point = { raCode: "RA-I", latitude: -15.79, longitude: -47.88 }
        const total = ra && ra !== point.raCode ? 0 : 1
        const json = persistentAnalyticsResponse.parse({ success: true, meta: {
          contractVersion: CONTRACT_VERSION, catalogVersion, execution: { mode: "operacional", persisted: true },
        }, data: { total, mapTotal: 1, byRa: [{ key: "RA-I", count: 1 }], byNature: [],
          timeline: total ? [{ key: "2026-01", count: 1 }] : [], weekday: null, hour: null,
          regions: bindings.entries.map(entry => ({ code: entry.code, name: entry.catalogName })),
          natures: [], categories: [], points: total ? [point] : [], heatReference: [point], pointsTruncated: false, heatUnavailable: false } })
        await route.fulfill({ status: 200, json })
      })
      const page = await context.newPage()
      page.setDefaultTimeout(60000)
      const errors = []
      page.on("pageerror", error => errors.push(error.name))
      const verify = async path => {
        stage = `${width} ${path} navigation`
        const response = await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 90000 })
        assert.equal(response?.status(), 200)
        assert.equal(new URL(page.url()).pathname, path.split("?")[0])
        stage = `${width} ${path} indicators`
        await page.locator('[data-testid="analytics-total"][data-count="1"]').waitFor()
        stage = `${width} ${path} heatmap`
        await page.getByTestId("crime-heatmap").waitFor()
        stage = `${width} ${path} region options and width`
        assert.equal(await page.getByRole("option", { name: "Ponte Alta" }).count(), 1)
        const bounds = await page.evaluate(() => ({ window: window.innerWidth, body: document.documentElement.scrollWidth }))
        assert(bounds.body <= bounds.window)
      }
      await verify("/dashboard")
      await verify("/mapa-criminal?ra=RA-I")
      stage = `${width} points and clusters`
      await page.getByRole("button", { name: "Pontos", exact: true }).click()
      await page.getByTestId("occurrence-points").waitFor()
      await page.getByRole("button", { name: "Clusters", exact: true }).click()
      await page.getByTestId("occurrence-clusters").waitFor()
      stage = `${width} satellite boundaries`
      // Qualify the official overlay independently of external imagery availability.
      await context.route(/^https:\/\//, route => route.abort())
      await page.goto(origin + "/mapa-criminal")
      await page.getByRole("button", { name: "Satélite", exact: true }).click()
      const satellite = page.getByTestId("satellite-map")
      await satellite.locator('[data-ra-code="XXXVII"]').waitFor()
      assert.equal(await satellite.locator("[data-ra-code]").count(), 37)
      unavailable = true
      stage = `${width} unavailable response`
      await page.goto(origin + "/dashboard")
      await page.getByRole("alert").filter({ hasText: "Não foi possível consultar os indicadores" }).waitFor()
      assert.equal(await page.getByTestId("analytics-total").count(), 0)
      assert.deepEqual(errors, [])
      checks.push(`persistent_analytics_ui_${width}`)
      await context.close()
    }
    return checks
  } catch (error) {
    console.error(`Analytics browser check failed at ${stage} (${error.name}).`)
    throw error
  } finally { await browser.close() }
}
