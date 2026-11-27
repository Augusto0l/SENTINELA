import assert from "node:assert/strict"
import { randomUUID, randomBytes, scryptSync } from "node:crypto"
import { readdir, readFile, writeFile, unlink, realpath } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { chromium } from "playwright-core"
import { freePort, httpValidation } from "./http-validation-output.mjs"

const root = await realpath(process.env.SENTINELA_CATALOG_CLONE_ROOT)
assert.match(basename(root), /^clone-[0-9a-f]{32}$/)
assert.equal(dirname(root).toLowerCase(), (await realpath(join(process.env.USERPROFILE,
  ".sentinela-local", "homologacao-clone"))).toLowerCase())
const target = JSON.parse(await readFile(join(root, "identity-55487.json"), "utf8"))
const { origin: source } = JSON.parse(await readFile(join(root, "backup.json"), "utf8"))
assert.equal(target.port, 55487)
assert.notEqual(target.uuid, source.uuid)
assert.notEqual(target.system, source.system)
const csvDir = process.argv[2]
const synthetic = process.env.SENTINELA_HISTORY_SYNTHETIC_FILE
const filenames = (await readdir(csvDir)).filter(name => /^pcdf_naturezas_\d{4}-\d{2}\.csv$/.test(name)).sort()
assert.equal(filenames.length, 68)
const csv = key => join(csvDir, `pcdf_naturezas_${key}.csv`)
const origin = "http://127.0.0.1:3318"
const validationId = randomUUID()
const runtime = httpValidation(validationId, { port: 3318, evidence: root })
const accountsPath = join(root, "accounts-historical-csv.json")
const loginPassword = randomBytes(32).toString("hex")
const accounts = ["Administrador", "Operador", "Analista"].map((role, index) => {
  const salt = randomBytes(16).toString("hex")
  return { email: `historico-${index}@example.test`, role, salt,
    ...(index === 0 && { subject: process.env.SENTINELA_HISTORY_FIXTURE_SUBJECT }),
    hash: scryptSync(loginPassword, Buffer.from(salt, "hex"), 64).toString("hex") }
})
const history = "/api/v1/importacoes/pcdf/direta?modalidade=historico"
const analytics = "/api/v1/analytics/persistente"
await freePort(3318)
await writeFile(accountsPath, JSON.stringify({ accounts }), { flag: "wx" })
let browser
try {
  await runtime.prepare()
  const server = runtime.start({ ...process.env, NODE_ENV: "development", SENTINELA_APP_ORIGIN: origin,
    SENTINELA_HTTP_VALIDATION_ID: validationId, SENTINELA_LOCAL_ACCOUNTS_FILE: accountsPath, SENTINELA_AUTH_PROVIDER: "local",
    SENTINELA_OPERATIONAL_CLONE: "1", SENTINELA_OPERATIONAL_IMPORT_MANAGEMENT: "1", SENTINELA_OCCURRENCE_MANAGEMENT: "0",
    SENTINELA_PCDF_SYNTHETIC: "0", SENTINELA_PCDF_LOCAL_ID: target.uuid, SENTINELA_PCDF_LOCAL_SYSTEM_ID: target.system,
    SENTINELA_PCDF_LOCAL_START: target.start, SENTINELA_LOCAL_DEMO: "0", SENTINELA_SANDBOX_WRITE: "0",
    SENTINELA_PERSISTENT_HOMOLOGATION: "0", SENTINELA_LOCAL_READER_URL: "", SENTINELA_DATABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_TELEMETRY_DISABLED: "1" }, "ignore")
  const deadline = Date.now() + 180000
  let available = false
  while (server.exitCode === null && Date.now() < deadline) {
    if ((await fetch(origin + "/login", { signal: AbortSignal.timeout(4500) }).catch(() => null))?.ok) { available = true; break }
    await delay(300)
  }
  assert(available)
  runtime.proveListener()
  assert.equal((await fetch(origin + history)).status, 401)
  browser = await chromium.launch({ channel: "msedge", headless: true })
  for (const [index, account] of accounts.entries()) {
    const context = await browser.newContext()
    try {
      assert.equal((await context.request.post(origin + "/auth/login", { maxRedirects: 0, headers: { origin },
        form: { email: account.email, password: loginPassword }, timeout: 90000 })).status(), 303)
      const status = async () => {
        const response = await context.request.get(origin + history, { timeout: 90000 })
        assert.equal(response.status(), index === 2 ? 403 : 200)
        if (index < 2) return (await response.json()).data
      }
      const state = await status()
      if (index === 2) continue
      assert.equal(state.canApprove, index === 0)
      if (index === 1) {
        const denied = await context.request.post(origin + history + "&versao=2.0&etapa=confirmar",
          { headers: { origin }, multipart: { sha256: "0".repeat(64) } })
        assert.equal(denied.status(), 403)
        continue
      }
      assert.equal(state.items[0].unique, 6090)
      if (!synthetic) assert.equal(state.items[1].unique, 5221)
      let page = await context.newPage()
      page.setDefaultTimeout(150000)
      page.on("response", response => {
        if (!response.url().includes(history) || response.ok()) return
        void response.json().then(payload => console.log(`Fila HTTP ${response.status()} · ${payload.error?.diagnostic ?? "sem diagnóstico"}`)).catch(() => {})
      })
      const openImport = async () => {
        assert.equal((await page.goto(origin + "/importar", { waitUntil: "domcontentloaded", timeout: 120000 })).status(), 200)
        await page.getByRole("button", { name: "Selecionar CSVs mensais PCDF" }).waitFor()
      }
      const section = () => page.getByRole("region", { name: "Histórico mensal PCDF" })
      const row = key => section().getByRole("row", { name: new RegExp(`pcdf_naturezas_${key}\\.csv`) })
      const waitState = (month, label) => row(month).getByText(label, { exact: true }).waitFor()
      await page.setViewportSize({ width: 1440, height: 900 })
      await openImport()
      if (synthetic) {
        assert.equal(state.items.filter(item => item.lot !== null).length, 1)
        async function selectSynthetic() {
          await section().locator("input[type=file]").setInputFiles(synthetic)
          await section().getByRole("button", { name: "Validar seleção" }).click()
          await waitState("2021-03", "Pronto para importar")
        }
        await selectSynthetic()
        await page.waitForFunction(() => JSON.parse(localStorage.getItem("sentinela-pcdf-fila-historica-v1") ?? "{}")["2021-03"] === "ready")
        await page.close()
        page = await context.newPage()
        await page.setViewportSize({ width: 390, height: 844 })
        page.setDefaultTimeout(150000)
        await openImport()
        await waitState("2021-03", "Interrompido")
        await selectSynthetic()
        await section().getByRole("button", { name: "Aprovar e importar (1)" }).click()
        await waitState("2021-03", "Concluído")
        const item = (await status()).items[2]
        assert.deepEqual([item.records, item.unique, item.links, item.review], [2, 1, 2, 0])
        await section().locator("input[type=file]").setInputFiles(synthetic)
        await section().getByRole("button", { name: "Validar seleção" }).click()
        await waitState("2021-03", "Já importado")
        assert.deepEqual((await status()).items[2], item)
        const response = await context.request.get(origin + analytics,
          { params: { startDate: "2021-03-01", endDate: "2021-03-31" } })
        assert.equal(response.status(), 200)
        const { data } = await response.json()
        assert.deepEqual([data.total, data.byNature.length, data.points, data.byRa], [1, 2, [], []])
        assert.equal(data.hour, null)
        assert.deepEqual(data.timeline, [{ key: "2021-03", count: 1 }])
        await page.screenshot({ path: join(root, "historico-fixture-edge-390.png"), animations: "disabled" })
        await writeFile(join(root, "historico-fixture-edge.json"), JSON.stringify({ ...item, recoveredAcrossTabs: true, idempotent: true }))
        console.log("Edge confirmou gravação sintética, dois vínculos para uma ocorrência, retomada em nova aba e reenvio.")
        continue
      }
      const queue = section()
      const picker = queue.locator("input[type=file]")
      await picker.setInputFiles(filenames.toReversed().map(name => join(csvDir, name)))
      const rows = queue.getByRole("row")
      assert.equal(await rows.count(), 69)
      assert.match(await rows.nth(1).innerText(), /2021-01/)
      assert.match(await rows.last().innerText(), /2026-08/)
      await page.screenshot({ path: join(root, "historico-68-selecao-desktop.png"), animations: "disabled" })
      console.log("Seleção de 68 CSVs reconhecida em ordem cronológica.")
      await queue.getByRole("button", { name: "Cancelar seleção pendente" }).click()

      if (state.items[2].state !== "done" && state.items[3].state !== "done") {
        const ordered = await Promise.all(["2021-04", "2021-03", "2021-01", "2021-05"].map(async key => ({
          name: basename(csv(key)), mimeType: "text/csv", buffer: await readFile(csv(key === "2021-05" ? "2021-04" : key)),
        })))
        await picker.setInputFiles(ordered)
        await queue.getByRole("button", { name: "Validar seleção" }).click()
        await waitState("2021-01", "Já importado")
        await waitState("2021-05", "Requer revisão")
        console.log("Janeiro reconhecido e arquivo divergente encaminhado para revisão.")
        await queue.getByRole("button", { name: "Aprovar e importar (2)", exact: true }).click()
        await queue.getByRole("button", { name: "Interromper após o arquivo atual" }).click()
        await waitState("2021-03", "Concluído")
        await waitState("2021-04", "Interrompido")
        assert.equal((await status()).items[3].state, "missing")
        await openImport()
        await waitState("2021-03", "Já importado")
        await waitState("2021-04", "Interrompido")
        await picker.setInputFiles(csv("2021-04"))
        await queue.getByRole("button", { name: "Validar seleção" }).click()
        await queue.getByRole("button", { name: "Aprovar e importar (1)", exact: true }).click()
        await waitState("2021-04", "Concluído")
        console.log("Pausa, retomada e importação unitária concluídas pelo navegador.")
      }

      const getAnalytics = async (params = {}) => {
        const response = await context.request.get(origin + analytics, { params, timeout: 90000 })
        assert.equal(response.status(), 200)
        return (await response.json()).data
      }
      const data = await getAnalytics()
      assert.equal(data.natures.length, 41)
      assert.equal(data.total, (await status()).items.reduce((total, item) => total + (item.unique ?? 0), 0))
      assert.deepEqual(data.points, [])
      assert.deepEqual(data.heatReference, [])
      const august = data.monthCoverage.at(-1)
      assert.deepEqual(august, { key: "2026-08", status: state.items.at(-1).state === "done" ? "partial" : "not_imported", through: "2026-08-18" })
      const augustCounts = await getAnalytics({ startDate: "2026-08-01", endDate: "2026-08-31" })
      assert.equal(augustCounts.total === 0, august.status === "not_imported")
      const feb = await getAnalytics({ startDate: "2021-02-01", endDate: "2021-02-28" })
      assert.equal(feb.total, 5221)
      const chosen = feb.natures.find(item => item.name === feb.byNature[0].key)
      assert.equal((await getAnalytics({ startDate: "2021-02-01", endDate: "2021-02-28", nature: chosen.id })).total, feb.byNature[0].count)
      const absentNature = feb.natures.find(item => !feb.byNature.some(bucket => bucket.key === item.name))
      const empty = await getAnalytics({ startDate: "2021-02-01", endDate: "2021-02-28", nature: absentNature.id })
      assert.equal(empty.total, 0)
      assert.equal(empty.monthCoverage.find(item => item.key === "2021-02").status, "complete")
      await page.setViewportSize({ width: 390, height: 844 })
      await openImport()
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.screenshot({ path: join(root, "historico-68-importacao-mobile.png"), animations: "disabled" })
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport)
        await page.goto(origin + "/dashboard", { waitUntil: "domcontentloaded", timeout: 120000 })
        await page.locator(`[data-testid="analytics-total"][data-count="${data.total}"]`).waitFor()
        if (august.status === "partial") {
          await page.getByText("Dados parciais até 18/08/2026", { exact: true }).waitFor()
          await page.getByText("Sem período comparável", { exact: true }).waitFor()
        }
        await page.screenshot({ path: join(root, `historico-68-dashboard-${viewport.width}.png`), animations: "disabled" })
      }
    } finally {
      await context.close()
    }
  }
  console.log("Edge desktop/mobile, seleção única e múltipla, API, autenticação e matriz de perfis verificados.")
} finally {
  try { await browser?.close(); await runtime.finish() }
  finally { await unlink(accountsPath) }
}
