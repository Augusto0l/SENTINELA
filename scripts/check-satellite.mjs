import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { chromium } from "playwright-core"

const base = process.env.SENTINELA_TEST_URL ?? "http://127.0.0.1:3000"
const output = "tmp/satellite-evidence"
await mkdir(output, { recursive: true })
const geo = JSON.parse(await readFile("public/data/ras-df.geojson", "utf8"))
const browser = await chromium.launch({ channel: "chrome", headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })
const page = await context.newPage()
const errors = [], checks = [], imagery = new Map()
let failureStatus = 0
page.on("pageerror", (error) => errors.push(error.message))
// Reuse actual provider responses during this test; never synthesize imagery.
await page.route("https://tiles.maps.eox.at/**", async (route) => {
  if (failureStatus) return route.fulfill({ status: failureStatus, body: "Unavailable" })
  const url = route.request().url()
  const cached = imagery.get(url)
  if (cached) return route.fulfill({ contentType: "image/jpeg", body: cached })
  const response = await route.fetch()
  if (response.ok()) imagery.set(url, await response.body())
  return route.fulfill({ response })
})
const satellite = () => page.getByTestId("satellite-map")
const polygons = () => satellite().locator("path[data-ra-code]")
const oldMap = () => page.locator('svg:has(path[role="button"]):not(.leaflet-zoom-animated)')
const total = async (locator) => locator.evaluateAll((paths) => paths.reduce((sum, path) => sum + Number(path.getAttribute("aria-label").match(/(\d+) ocorr/)[1]), 0))
const check = (message) => { checks.push(message); console.log(`PASS ${message}`) }
const go = async (path) => {
  assert.equal((await page.goto(base + path, { waitUntil: "domcontentloaded" })).status(), 200)
  await page.locator('canvas[data-testid="crime-heatmap"]').waitFor()
}
const activate = async () => {
  await page.getByRole("button", { name: "Satélite", exact: true }).click()
  await satellite().waitFor()
  await page.waitForFunction(() => document.querySelector('[data-testid="satellite-map"]')?.dataset.imageryStatus === "ready", undefined, { timeout: 30000 })
}

async function alignment() {
  const result = await satellite().evaluate((container, features) => {
    const tile = [...container.querySelectorAll("img.leaflet-tile-loaded")].find((image) => image.naturalWidth > 0)
    if (!tile) throw new Error("Nenhum tile real carregado")
    const segments = new URL(tile.src).pathname.split("/")
    const z = Number(segments.at(-3)), row = Number(segments.at(-2)), col = parseInt(segments.at(-1))
    const rect = tile.getBoundingClientRect(), n = 2 ** z
    const project = ([lon, lat]) => {
      const sin = Math.sin(lat * Math.PI / 180)
      return [rect.x + ((lon + 180) / 360 * n - col) * rect.width,
        rect.y + ((0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * n - row) * rect.height]
    }
    let maximumError = 0
    for (const feature of features) {
      const path = container.querySelector(`path[data-ra-code="${feature.properties.ra_codigo}"]`)
      if (!path) continue
      const points = []
      const collect = (coordinates) => {
        if (typeof coordinates[0] === "number") points.push(project(coordinates))
        else coordinates.forEach(collect)
      }
      collect(feature.geometry.coordinates)
      const actual = path.getBoundingClientRect()
      const x = points.map((point) => point[0]), y = points.map((point) => point[1])
      maximumError = Math.max(maximumError, Math.abs(actual.left - Math.min(...x)), Math.abs(actual.right - Math.max(...x)), Math.abs(actual.top - Math.min(...y)), Math.abs(actual.bottom - Math.max(...y)))
    }
    return { maximumError, tiles: container.querySelectorAll("img.leaflet-tile-loaded").length }
  }, geo.features)
  assert.ok(result.maximumError < 3, `Desalinhamento imagem/GeoJSON: ${JSON.stringify(result)}`)
  return result
}

async function noSatelliteCounters() {
  assert.equal(await satellite().locator(".leaflet-marker-icon").count(), 0, "Satélite não deve exibir contadores sobre as RAs")
}

try {
  await go("/dashboard")
  for (const theme of ["escuro", "claro"]) {
    if (await page.locator("html").getAttribute("data-theme") !== theme)
      await page.getByRole("button", { name: theme === "claro" ? "Ativar tema claro" : "Ativar tema escuro", exact: true }).click()
    for (const route of ["/dashboard", "/mapa-criminal"]) {
      await go(route)
      const expected = await total(oldMap().locator('path[role="button"]'))
      await activate()
      assert.equal(await polygons().count(), 37)
      assert.equal(await total(polygons()), expected)
      assert.match(await satellite().locator(".leaflet-control-attribution").innerText(), /EOxCloudless.*Copernicus Sentinel data 2024.*CC BY-NC-SA/)
      const aligned = await alignment()
      await noSatelliteCounters()
      const path = satellite().locator('path[data-ra-code="RA-I"]')
      await path.dispatchEvent("mouseover")
      await satellite().locator(".leaflet-tooltip").waitFor()
      assert.match(await satellite().locator(".leaflet-tooltip").innerText(), /Plano Piloto.*RA-I/s)
      await path.dispatchEvent("mouseout")
      const before = await path.boundingBox()
      await satellite().locator(".leaflet-control-zoom-in").click()
      await page.waitForTimeout(300)
      const zoomed = await path.boundingBox()
      assert.ok(zoomed.width > before.width * 1.3)
      const map = satellite().locator(".leaflet-container")
      const mapBox = await map.boundingBox()
      const pane = satellite().locator(".leaflet-map-pane")
      const previousTransform = await pane.getAttribute("style")
      await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(mapBox.x + mapBox.width / 2 + 90, mapBox.y + mapBox.height / 2 + 50, { steps: 8 })
      await page.mouse.up()
      assert.notEqual(await pane.getAttribute("style"), previousTransform)
      await page.getByRole("button", { name: "Restaurar enquadramento do satélite" }).click()
      await page.waitForTimeout(200)
      assert.ok(Math.abs((await path.boundingBox()).width - before.width) < 3)
      for (const label of ["Pontos", "Clusters", route === "/dashboard" ? "Mapa de calor" : "Calor", "Satélite"]) {
        await page.getByRole("button", { name: label, exact: true }).click()
        assert.equal(await page.getByRole("button", { name: label, exact: true }).getAttribute("aria-pressed"), "true")
      }
      await satellite().waitFor()
      await page.waitForFunction(() => document.querySelector('[data-testid="satellite-map"]')?.dataset.imageryStatus === "ready")
      await page.screenshot({ path: `${output}/${theme}-${route.slice(1)}.png` })
      check(`${theme} ${route}: 4 modos, 37 RAs, quantitativos, tooltip, zoom, arraste, restauração; alinhamento ${aligned.maximumError.toFixed(2)} px`)
    }
  }

  await go("/mapa-criminal")
  await activate()
  const full = await total(polygons())
  await page.getByRole("combobox", { name: "Natureza criminal", exact: true }).selectOption("Furto")
  const filtered = await total(polygons())
  assert.ok(filtered > 0 && filtered < full)
  await page.getByRole("combobox", { name: "Faixa de horário", exact: true }).selectOption("18-24")
  await page.getByRole("combobox", { name: "Período da base fictícia", exact: true }).selectOption("7d")
  const combined = await total(polygons())
  await page.getByRole("button", { name: "Calor", exact: true }).click()
  assert.equal(await total(oldMap().locator('path[role="button"]')), combined)
  await activate()
  await page.getByRole("combobox", { name: "Região Administrativa", exact: true }).selectOption("RA-I")
  assert.equal(await polygons().count(), 1)
  assert.equal(await polygons().first().getAttribute("data-ra-code"), "RA-I")
  await page.getByRole("combobox", { name: "Região Administrativa", exact: true }).selectOption("RA-VI")
  assert.equal(await polygons().first().getAttribute("data-ra-code"), "RA-VI")
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click()
  assert.equal(await polygons().count(), 37)
  await page.getByRole("combobox", { name: "Período da base fictícia", exact: true }).selectOption("today")
  assert.equal(await total(polygons()), 0)
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click()
  await satellite().locator('path[data-ra-code="RA-I"]').focus()
  await page.keyboard.press("Enter")
  assert.equal(await page.getByRole("combobox", { name: "Região Administrativa", exact: true }).inputValue(), "RA-I")
  check("Filtros de natureza, horário, período, RA e vazio; quantitativos iguais ao Calor; seleção por teclado")

  await go("/dashboard")
  await activate()
  await satellite().locator('path[data-ra-code="RA-I"]').dispatchEvent("click")
  await page.waitForURL(/mapa-criminal\?ra=RA-I/)
  assert.equal(await page.getByRole("button", { name: "Calor", exact: true }).getAttribute("aria-pressed"), "true")
  await page.getByRole("button", { name: "Satélite", exact: true }).click()
  await page.locator(".system-sidebar").getByRole("button", { name: "Dashboard", exact: true }).click()
  await page.waitForURL(base + "/dashboard")
  assert.equal(await page.getByRole("button", { name: "Mapa de calor", exact: true }).getAttribute("aria-pressed"), "true")
  check("Clique na RA do Dashboard navega corretamente; escolhas de modo independentes")

  for (const width of [1440, 820, 390, 320]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 })
    for (const route of ["/dashboard", "/mapa-criminal"]) {
      await go(route)
      await activate()
      await satellite().scrollIntoViewIfNeeded()
      await noSatelliteCounters()
      const box = await satellite().boundingBox()
      assert.ok(box.width > 180 && box.height >= 200)
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1)
      const button = await page.getByRole("button", { name: "Satélite", exact: true }).boundingBox()
      assert.ok(button.x >= 0 && button.x + button.width <= width + 1)
      await page.screenshot({ path: `${output}/${route.slice(1)}-${width}.png` })
    }
  }
  check("Dashboard e Mapa Criminal em desktop, tablet e celulares (1440, 820, 390 e 320 px)")

  for (const status of [403, 429, 503]) {
    failureStatus = status
    await go("/dashboard")
    await page.getByRole("button", { name: "Satélite", exact: true }).click()
    await page.getByText(/Imagens de satélite indisponíveis/).waitFor()
    await page.getByRole("button", { name: "Mapa de calor", exact: true }).click()
    await page.locator('canvas[data-testid="crime-heatmap"]').waitFor()
  }
  failureStatus = 0
  await activate()
  await context.setOffline(true)
  await page.getByText(/Imagens de satélite indisponíveis/).waitFor()
  await context.setOffline(false)
  await page.getByRole("button", { name: "Tentar novamente" }).click()
  await page.waitForFunction(() => document.querySelector('[data-testid="satellite-map"]')?.dataset.imageryStatus === "ready")
  await page.getByRole("button", { name: "Mapa de calor", exact: true }).click()
  await page.route("**/data/ras-df.geojson", (route) => route.fulfill({ status: 503, body: "Unavailable" }))
  await page.getByRole("button", { name: "Satélite", exact: true }).click()
  await page.getByText(/Limites geográficos indisponíveis/).waitFor()
  await page.getByRole("button", { name: "Mapa de calor", exact: true }).click()
  await page.locator('canvas[data-testid="crime-heatmap"]').waitFor()
  check("Erros 403/429/503, offline, nova tentativa e falha do GeoJSON com retorno aos modos existentes")
  const brokenContext = await browser.newContext()
  try {
    const brokenPage = await brokenContext.newPage()
    await brokenPage.goto(base + "/dashboard")
    await brokenPage.locator('canvas[data-testid="crime-heatmap"]').waitFor()
    await brokenPage.route("**/_next/static/chunks/*.js", (route) => route.abort())
    await brokenPage.getByRole("button", { name: "Satélite", exact: true }).click()
    await brokenPage.getByText(/Não foi possível carregar o mapa de satélite/).waitFor()
    await brokenPage.getByRole("button", { name: "Mapa de calor", exact: true }).click()
    await brokenPage.locator('canvas[data-testid="crime-heatmap"]').waitFor()
    check("Falha de carregamento do componente isolada pelo boundary, com retorno ao Calor")
  } finally {
    await brokenContext.close()
  }
  assert.deepEqual(errors, [])
  assert.ok(imagery.size > 0)
  await writeFile(`${output}/report.json`, JSON.stringify({ checks, errors, realTiles: imagery.size }, null, 2))
} finally {
  await browser.close()
}
