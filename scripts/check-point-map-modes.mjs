import assert from "node:assert/strict"
import { chromium } from "playwright-core"

const base = new URL(process.env.SENTINELA_TEST_URL ?? "http://127.0.0.1:3394")
assert.equal(base.hostname, "127.0.0.1", "Execute contra a demonstração isolada em loopback.")
const browser = await chromium.launch({ channel: "msedge", headless: true })
const results = []
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({
      viewport, locale: "pt-BR", isMobile: viewport.width < 500, hasTouch: viewport.width < 500,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(90000)
    const errors = []
    page.on("pageerror", error => errors.push(error.message))
    // Qualifica camadas e layout independentemente dos provedores de tiles.
    await context.route(/^https:\/\//, route => route.abort())
    assert.equal((await page.goto(new URL("/mapa-criminal", base).href, { waitUntil: "domcontentloaded", timeout: 180000 })).status(), 200)
    await page.getByTestId("crime-heatmap").waitFor()
    for (const theme of ["escuro", "claro"]) {
      const themeButton = page.getByRole("button", { name: `Ativar tema ${theme}`, exact: true })
      if (await themeButton.count()) await themeButton.click()
      await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme)
      for (const [mode, testId] of [["Pontos", "occurrence-points"], ["Calor", "crime-heatmap"],
        ["Clusters", "occurrence-clusters"], ["Satélite", "satellite-map"]]) {
        const button = page.getByRole("button", { name: mode, exact: true })
        await button.click()
        assert.equal(await button.getAttribute("aria-pressed"), "true")
        const layer = page.getByTestId(testId)
        await layer.waitFor().catch(async error => {
          const text = (await page.locator("main").innerText().catch(() => "")).slice(-1400)
          throw new Error(`${viewport.width}px / ${theme} / ${mode}: ${text} ${errors.join(" | ")}`, { cause: error })
        })
        if (mode === "Pontos") {
          await page.waitForFunction(() => Number(document.querySelector('[data-testid="occurrence-points"]')?.dataset.pointCount) > 0)
          assert.equal(await layer.evaluate(element => element.tagName), "CANVAS")
          assert(await page.getByTestId("point-symbol-count").isVisible())
        } else if (mode === "Satélite") await layer.locator("path[data-ra-code]").first().waitFor()
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        results.push({ width: viewport.width, theme, mode })
      }
    }
    assert.deepEqual(errors, [])
    await context.close()
  }
  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}
