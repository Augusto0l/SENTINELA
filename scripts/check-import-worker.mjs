import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { chromium } from "playwright-core"
const base = process.env.SENTINELA_TEST_URL ?? "http://127.0.0.1:3000"
const output = "tmp/sprint-03-worker"
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
page.setDefaultTimeout(20000)
const errors = [],
  checks = [],
  writes = []
page.on("pageerror", (error) => errors.push(error.message))
page.on("request", (request) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()))
    writes.push(request.url())
})
await page.route("https://fonts.googleapis.com/**", (route) => route.abort())
await page.route("https://fonts.gstatic.com/**", (route) => route.abort())
// Native Worker parses real files. Only timing/delivery/failure is controlled by this test.
await page.addInitScript(() => {
  const NativeWorker = window.Worker,
    nativeSetTimeout = window.setTimeout,
    nativeClearTimeout = window.clearTimeout
  const probe = (window.__importProbe = {
    mode: "normal",
    workers: [],
    queued: [],
    timers: new Map(),
    seen: [],
  })
  window.setTimeout = function (callback, delay, ...args) {
    if (delay !== 60000) return nativeSetTimeout(callback, delay, ...args)
    const id = nativeSetTimeout(() => {
      probe.timers.delete(id)
      callback(...args)
    }, delay)
    probe.timers.set(id, callback)
    return id
  }
  window.clearTimeout = function (id) {
    probe.timers.delete(id)
    return nativeClearTimeout(id)
  }
  window.Worker = class {
    onmessage = null
    onerror = null
    onmessageerror = null
    terminated = 0
    constructor(url, options) {
      this.native = new NativeWorker(url, options)
      probe.workers.push(this)
      this.native.onmessage = (event) => {
        const delivery = { callback: this.onmessage, data: event.data }
        probe.seen.push(delivery)
        if (probe.mode === "hold") probe.queued.push(delivery)
        else this.onmessage?.(event)
      }
      this.native.onerror = (event) => this.onerror?.(event)
      this.native.onmessageerror = (event) => this.onmessageerror?.(event)
    }
    postMessage(message) {
      if (probe.mode === "send-error")
        throw new DOMException("Controlled DataCloneError", "DataCloneError")
      this.native.postMessage(message)
    }
    terminate() {
      this.terminated++
      this.native.terminate()
    }
  }
})
const head = "data,horario,naturezas,RA,local,latitude,longitude"
const row =
  "25/08/2026,23:59,Furto|Ameaça,Plano Piloto,Quadra demonstrativa 10,-15.79,-47.88"
const upload = (name, count = 1) =>
  page
    .getByLabel("Arquivo CSV ou XLSX", { exact: true })
    .setInputFiles({
      name,
      mimeType: "text/csv",
      buffer: Buffer.from(`${head}\n${Array(count).fill(row).join("\n")}`),
    })
const mode = (value) =>
  page.evaluate((value) => {
    window.__importProbe.mode = value
  }, value)
const mapping = () =>
  page.getByRole("heading", { name: "Mapeamento de colunas", exact: true })
const queued = () =>
  page.waitForFunction(() => window.__importProbe.queued.length > 0)
const release = () =>
  page.evaluate(() => {
    for (const delivery of window.__importProbe.queued.splice(0))
      delivery.callback?.({ data: delivery.data })
  })
const clean = () =>
  page.evaluate(() => ({
    timers: window.__importProbe.timers.size,
    active: window.__importProbe.workers.filter((worker) => !worker.terminated)
      .length,
  }))
const check = (message) => {
  checks.push(message)
  console.log(message)
}
try {
  assert.equal(
    (
      await page.goto(base + "/importar", { waitUntil: "networkidle" })
    ).status(),
    200,
  )
  await mode("hold")
  await upload("cancelar.csv")
  await queued()
  await page.getByRole("status").filter({ hasText: "Lendo arquivo" }).waitFor()
  await page.screenshot({ path: `${output}/loading.png` })
  await page
    .getByRole("button", { name: "Cancelar processamento", exact: true })
    .click()
  await release()
  assert.equal(await mapping().count(), 0)
  assert.deepEqual(await clean(), { timers: 0, active: 0 })
  check(
    "Cancelar durante processamento limpa seleção, timer, handlers e Worker; resposta já enfileirada é ignorada.",
  )

  await upload("antigo.csv")
  await queued()
  await mode("normal")
  await upload("novo.csv", 2)
  await mapping().waitFor()
  await release()
  assert.match(await page.locator("body").innerText(), /Selecionado: novo.csv/)
  await page.getByText(/^2 linhas de dados(?: ·|$)/).waitFor()
  assert.deepEqual(await clean(), { timers: 0, active: 1 })
  check(
    "Arquivo novo mantém seus próprios metadados após resposta antiga de outro Worker.",
  )

  await mode("hold")
  await page
    .getByRole("button", { name: "Validar e pré-visualizar", exact: true })
    .click()
  await queued()
  await page.evaluate(() => {
    const probe = window.__importProbe
    const table = [...probe.seen]
      .reverse()
      .find((delivery) => delivery.data.response.type === "table")
    table.callback({ data: table.data })
  })
  await page
    .getByRole("status")
    .filter({ hasText: "Validando os registros" })
    .waitFor()
  assert.equal((await clean()).timers, 1)
  await release()
  await page
    .getByRole("heading", {
      name: "Pré-visualização dos registros",
      exact: true,
    })
    .waitFor()
  assert.match(
    await page.locator("dl").first().innerText(),
    /Total de linhas\s+2/,
  )
  check(
    "Resposta duplicada da leitura no mesmo Worker não interrompe validação nem substitui a prévia.",
  )

  for (const failure of [
    "send-error",
    "messageerror",
    "runtime-error",
    "silent-exit",
  ]) {
    await mode(failure === "send-error" ? "send-error" : "hold")
    await upload(`${failure}.csv`)
    if (failure !== "send-error") {
      await queued()
      await page.evaluate((failure) => {
        const probe = window.__importProbe,
          worker = probe.workers.at(-1)
        if (failure === "messageerror")
          worker.onmessageerror(new MessageEvent("messageerror"))
        else if (failure === "runtime-error")
          worker.onerror(new ErrorEvent("error", { cancelable: true }))
        else {
          worker.native.terminate()
          for (const callback of [...probe.timers.values()]) callback()
        }
      }, failure)
    }
    await page.locator('p[role="alert"]').waitFor()
    await release()
    assert.deepEqual(await clean(), { timers: 0, active: 0 })
    assert.equal(await mapping().count(), 0)
    if (failure === "silent-exit")
      assert.match(
        await page.locator('p[role="alert"]').innerText(),
        /60 segundos/,
      )
    await page.screenshot({ path: `${output}/${failure}.png` })
    await mode("normal")
    await upload("recuperado.csv")
    await mapping().waitFor()
  }
  check(
    "postMessage, messageerror, falha de execução e encerramento silencioso recuperam a UI; watchdog exercitado sem esperar 60s reais.",
  )

  for (const theme of ["claro", "escuro"]) {
    const toggle = page.getByRole("button", {
      name: `Ativar tema ${theme}`,
      exact: true,
    })
    if (await toggle.count()) await toggle.click()
    for (const width of [1366, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await mode("hold")
      await upload("carregando.csv")
      await queued()
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      )
      await page
        .getByRole("button", { name: "Cancelar processamento", exact: true })
        .focus()
      await page.keyboard.press("Tab")
      await page.keyboard.press("Shift+Tab")
      assert.ok(
        await page
          .getByRole("button", { name: "Cancelar processamento", exact: true })
          .evaluate((element) => element.matches(":focus-visible")),
      )
      await page.screenshot({ path: `${output}/loading-${theme}-${width}.png` })
      await page.keyboard.press("Enter")
      await release()
      assert.deepEqual(await clean(), { timers: 0, active: 0 })
    }
  }
  check(
    "Carregamento e cancelamento por teclado nos dois temas e quatro larguras, sem overflow horizontal.",
  )
  await mode("hold")
  await upload("sair.csv")
  await queued()
  await page
    .locator(".system-sidebar")
    .getByRole("button", { name: "Dashboard", exact: true })
    .click()
  await page.waitForURL("**/dashboard")
  await release()
  assert.deepEqual(await clean(), { timers: 0, active: 0 })
  check(
    "Sair da tela desmonta o processamento; mensagens pendentes não alteram a rota seguinte.",
  )
  assert.deepEqual(errors, [])
  assert.deepEqual(writes, [])
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        base,
        browser: browser.version(),
        checks,
        errors,
        writes,
        limitations: [
          "Falhas e ordem de entrega controladas por wrapper de teste; parsing executado pelo Worker nativo.",
          "Watchdog acionado por callback controlado; não é teste de desempenho de 60 segundos reais.",
          "Fontes Google bloqueadas no roteiro.",
        ],
      },
      null,
      2,
    ) + "\n",
  )
} finally {
  await browser.close()
}
