import assert from "node:assert/strict"
import { readFile, readdir, realpath, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { chromium } from "playwright-core"

const root = await realpath(process.argv[2])
assert.match(basename(root), /^clone-[a-f0-9]{32}$/)
assert.equal(dirname(root).toLowerCase(),
  (await realpath(join(process.env.USERPROFILE, ".sentinela-local", "homologacao-clone"))).toLowerCase())
const csvDir = process.argv[3]
const afterOnly = process.argv.includes("--after-only")
const csv = month => join(csvDir, `pcdf_naturezas_${month}.csv`)
const origin = "http://localhost:3000"
const endpoint = "/api/v1/importacoes/pcdf/direta"
const analytics = "/api/v1/analytics/persistente"
const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844 }]
const browser = await chromium.launch({ channel: "msedge", headless: false, chromiumSandbox: true })
const context = await browser.newContext({ viewport: viewports[0] })
const page = await context.newPage()
page.setDefaultTimeout(60000)
await context.route(url => url.origin === origin && url.pathname === endpoint && url.searchParams.get("etapa") === "confirmar",
  route => route.abort())

async function get(path, params) {
  const response = await context.request.get(origin + path, { params })
  assert.equal(response.status(), 200, path)
  const result = await response.json()
  assert.equal(result.success, true, path)
  return result.data
}

async function capture(phase) {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    assert.equal((await page.goto(origin + "/dashboard", { waitUntil: "domcontentloaded" }))?.status(), 200)
    await page.locator('[data-testid="analytics-total"][data-count="6090"]').waitFor()
    await page.getByText("Dados de janeiro de 2021", { exact: true }).waitFor()
    await page.getByRole("button", { name: "Ampliar mapa" }).waitFor()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: join(root, `fila-real-${phase}-dashboard-${viewport.width}.png`), animations: "disabled" })
    assert.equal((await page.goto(origin + "/mapa-criminal", { waitUntil: "domcontentloaded" }))?.status(), 200)
    for (const [label, testId] of [["Pontos", "occurrence-points"], ["Clusters", "occurrence-clusters"], ["Calor", "crime-heatmap"]]) {
      await page.getByRole("button", { name: label, exact: true }).click()
      const layer = page.getByTestId(testId)
      await layer.waitFor({ state: "attached" })
      if (label === "Calor") assert.equal(await layer.getAttribute("data-point-count"), "0")
      else assert.equal(await layer.locator(":scope > *").count(), 0)
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: join(root, `fila-real-${phase}-mapa-${viewport.width}.png`), animations: "disabled" })
  }
}

try {
  assert.equal((await fetch(origin + endpoint + "?modalidade=historico")).status, 401)
  await page.goto(origin + "/importar", { waitUntil: "domcontentloaded", timeout: 120000 })
  if (new URL(page.url()).pathname === "/login") {
    await page.getByText("Acesso institucional com Supabase Auth.", { exact: true }).waitFor()
    await page.bringToFront()
    console.log("Edge institucional aberto. Aguardando o login no formulário local.")
    await page.waitForURL(url => url.origin === origin && url.pathname !== "/login", { timeout: 5400000 })
  }
  assert.equal((await page.goto(origin + "/usuarios", { waitUntil: "domcontentloaded" }))?.status(), 200)
  const summary = await get("/api/v1/ocorrencias/consulta?view=resumo")
  assert.deepEqual([summary.consolidadas, summary.recebidas, summary.pendencias], [6090, 6393, 8091])
  const cookies = await context.cookies(origin)
  assert(cookies.some(cookie => /^sb-.+-auth-token/.test(cookie.name)))
  assert(!cookies.some(cookie => cookie.name === "sentinela-local-session"))
  await writeFile(join(root, afterOnly ? "fila-sessao-institucional-depois.json" : "fila-sessao-institucional.json"), JSON.stringify({
    utc: new Date().toISOString(), provider: "Supabase Auth", administrator: true,
  }, null, 2), { flag: "wx" })
  console.log("Sessão Supabase do Administrador atestada.")
  if (!afterOnly) await capture("antes")

  const marker = join(root, "fila-operacional-instalada.json")
  const deadline = Date.now() + 5400000
  for (let nextRefresh = Date.now() + 60000; ; ) {
    const release = await readFile(marker, "utf8").then(JSON.parse).catch(error => {
      if (error.code === "ENOENT") return null
      throw error
    })
    if (release?.accepted) break
    assert(Date.now() < deadline, "Prazo de espera pelo encerramento da instalação")
    if (Date.now() >= nextRefresh) {
      await context.request.get(origin + analytics, { timeout: 10000 }).catch(() => null)
      nextRefresh = Date.now() + 60000
    }
    await delay(3000)
  }
  const status = async () => get(endpoint, { modalidade: "historico" })
  const before = await status()
  assert.equal(before.canApprove, true)
  assert.equal(before.items.length, 68)
  assert.deepEqual(before.items.filter(item => item.lot !== null).map(item => [item.month, item.records, item.unique, item.links]), [
    ["2021-01", 6393, 6090, 6392],
  ])

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    assert.equal((await page.goto(origin + "/importar", { waitUntil: "domcontentloaded" }))?.status(), 200)
    const region = page.getByRole("region", { name: "Histórico mensal PCDF" })
    await region.getByRole("button", { name: "Selecionar CSVs mensais PCDF" }).waitFor()
    const picker = region.locator("input[type=file]")
    if (viewport.width === 1440) {
      const files = (await readdir(csvDir)).filter(name => /^pcdf_naturezas_\d{4}-\d{2}\.csv$/.test(name)).sort().reverse()
      assert.equal(files.length, 68)
      await picker.setInputFiles(files.map(name => join(csvDir, name)))
      assert.equal(await region.getByRole("row").count(), 69)
      await region.getByRole("button", { name: "Cancelar seleção pendente" }).click()
    }
    await picker.setInputFiles([csv("2021-02"), csv("2021-01")])
    await region.getByRole("button", { name: "Validar seleção" }).click()
    await region.getByRole("row", { name: /2021-01\.csv/ }).getByText("Já importado", { exact: true }).waitFor()
    await region.getByRole("row", { name: /2021-02\.csv/ }).getByText("Pronto para importar", { exact: true }).waitFor()
    assert(await region.getByRole("button", { name: "Aprovar e importar (1)" }).isEnabled())
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: join(root, `fila-real-importar-${viewport.width}.png`), animations: "disabled" })
    await page.reload({ waitUntil: "domcontentloaded" })
    await region.getByRole("row", { name: /2021-01\.csv/ }).getByText("Já importado", { exact: true }).waitFor()
    await region.getByRole("row", { name: /2021-02\.csv/ }).getByText("Interrompido", { exact: true }).waitFor()
  }
  assert.deepEqual(await status(), before)
  const analyticsData = await get(analytics)
  assert.equal(analyticsData.total, 6090)
  assert.equal(analyticsData.natures.length, 41)
  assert.deepEqual(analyticsData.points, [])
  assert.equal(analyticsData.monthCoverage.find(item => item.key === "2021-02").status, "not_imported")
  await capture("depois")
  await writeFile(join(root, "fila-edge-operacional.json"), JSON.stringify({
    utc: new Date().toISOString(), provider: "Supabase Auth", administrator: true, authorized: true, selected: 68,
    januaryReused: true, februaryPreview: true, writeConfirmed: false, dashboard: 6090, viewports,
  }, null, 2), { flag: "wx" })
  console.log("Edge operacional validou seleção, prévia, autorização de aprovação e retomada sem enviar confirmação.")
} finally {
  await browser.close()
}
