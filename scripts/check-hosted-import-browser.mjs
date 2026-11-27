import "./contracts-runtime.mjs"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { chromium } from "playwright-core"
import { utils, write } from "xlsx"
import { v1 } from "../tests/fixtures/pcdf-v1-package.mjs"
import { fixture } from "../tests/fixtures/pcdf-v2-package.mjs"
import { withHostedImportEnvironment } from "./hosted-import-browser-environment.mjs"

const evidence = process.argv[2]
if (evidence) await mkdir(evidence, { recursive: true })
const generalPath = "/api/v1/importacoes/geral"
const pcdfPath = "/api/v1/importacoes/pcdf/direta"
const managementPath = "/api/v1/ocorrencias/gestao"
const rows = [
  ["Data", "Hora", "Tipo de crime", "Região Administrativa", "Local"],
  ["2026-02-01", "13:34", "FURTO EM COMERCIO", "Plano Piloto", "Via sintética"],
  ["2026-02-01", "13:34", "FURTO EM COMERCIO", "Plano Piloto", "Via sintética"],
]
const workbook = utils.book_new()
utils.book_append_sheet(workbook, utils.aoa_to_sheet([rows[0], rows[1]]), "Dados")
const pcdf = fixture()
const legacy = v1(Buffer.from("fixture de navegador"), pcdf.rows.slice(0, 1), false)
let v2 = (await pcdf.csv.text()).replaceAll("2021-01-13", "2021-02-13")
for (const row of pcdf.rows) {
  const id = createHash("sha256").update("browser-v2:" + row.linha_origem_id).digest("hex")
  v2 = v2.replace(row.linha_origem_id, id)
}
const inputs = [
  { name: "ensaio-geral.csv", mimeType: "text/csv", buffer: Buffer.from(rows.map(row => row.join(";")).join("\r\n")) },
  { name: "ensaio-geral.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: write(workbook, { type: "buffer", bookType: "xlsx", compression: true }) },
  { name: "pcdf_naturezas_2021-01.csv", mimeType: "text/csv", buffer: Buffer.from(legacy.csv), version: "1.0" },
  { name: "pcdf_naturezas_2021-02.csv", mimeType: "text/csv", buffer: Buffer.from(v2), version: "2.0" },
]

await withHostedImportEnvironment(async ({ origin, actors, sql }) => {
  const browser = await chromium.launch({ channel: "msedge", headless: true })
  const unexpected = []
  const requested = (page, path, method, step) => page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.pathname === path && response.request().method() === method
      && (!step || url.searchParams.get("etapa") === step)
  })
  const photo = (page, name) => evidence && page.screenshot({ path: join(evidence, name + ".png") })
  const heading = (page, name) => page.getByRole("heading", { name, exact: true })
  const button = (scope, name) => scope.getByRole("button", { name, exact: true })
  const visible = locator => locator.waitFor({ state: "visible" })
  const assertWidth = async page => {
    const { viewport, content } = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth,
    }))
    assert(content <= viewport + 1, `Página com overflow horizontal: ${content}/${viewport}`)
  }
  async function session(index, width) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 500,
      hasTouch: width < 500, ignoreHTTPSErrors: true, locale: "pt-BR" })
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
    const { email, password, role } = actors[index]
    const login = await context.request.post(origin + "/auth/login", { headers: { Origin: origin },
      form: { email, password }, maxRedirects: 0 })
    assert.equal(login.status(), 303, await login.text())
    assert.equal(new URL(login.headers().location, origin).pathname, "/dashboard", role)
    assert((await context.cookies()).some(cookie => cookie.name.startsWith("sb-") && cookie.secure))
    const page = await context.newPage()
    page.setDefaultTimeout(25_000)
    page.on("pageerror", error => unexpected.push(error.message))
    await page.goto(origin + "/importar")
    return page
  }
  async function choose(page, input) {
    const chooser = page.waitForEvent("filechooser")
    await button(page, "Selecionar arquivo").click()
    await (await chooser).setFiles({ name: input.name, mimeType: input.mimeType, buffer: input.buffer })
  }
  async function reviewConfirmation(page, input) {
    const initial = input.version && requested(page, pcdfPath, "POST", "validar")
    await choose(page, input)
    if (initial) {
      const response = await initial
      assert.equal(response.status(), 200, await response.text())
      await visible(page.getByText("Layout PCDF v" + input.version + " reconhecido", { exact: true }))
    } else {
      if (input.name.endsWith(".xlsx")) await visible(page.getByRole("combobox", { name: "Planilha" }))
      await button(page, "Validar arquivo").click()
      if (input.name.endsWith(".csv")) await visible(page.getByText(/possível duplicata sinalizada/))
    }
    await button(page, "Revisar registros").click()
    await visible(page.getByRole("table").first())
    await assertWidth(page)
    await button(page, "Revisar confirmação").click()
    await visible(page.getByText("PostgreSQL hospedado", { exact: true }))
    await assertWidth(page)
  }
  async function submit(page, input, replay) {
    await reviewConfirmation(page, input)
    if (!replay && input.version === "1.0") await photo(page, "desktop-confirmacao-pcdf-v1")
    const confirmation = requested(page, input.version ? pcdfPath : generalPath, "POST", input.version && "confirmar")
    await button(page, "Confirmar importação").click()
    const response = await confirmation
    assert.equal(response.status(), replay ? 200 : 201, await response.text())
    const { data } = await response.json()
    assert.equal(data.replay, replay)
    assert((data.issues ?? data.summary?.issues) > 0)
    await visible(heading(page, replay ? "Arquivo já recebido" : "Gravação confirmada"))
    await assertWidth(page)
    await button(page, "Ver detalhes").click()
    const dialog = page.getByRole("dialog", { name: "Detalhes da importação", exact: true })
    await visible(dialog.getByText(data.run, { exact: true }))
    await button(dialog, "Abrir registros importados").click()
    await visible(input.version ? dialog.getByRole("table") : dialog.getByRole("region", { name: "Registros gerais gravados" }))
    if (!replay && input.version === "2.0") await photo(page, "desktop-recibo-pcdf-v2")
    await button(dialog, "Fechar").click()
    return data
  }
  async function history(page) {
    await button(page.getByRole("navigation", { name: "Área de importação" }), "Histórico").click()
    await visible(page.getByRole("region", { name: /Lotes de importação|Importações registradas/ }))
    for (const input of inputs) await visible(page.getByRole("rowheader").filter({ hasText: input.name }).first())
    await assertWidth(page)
  }
  async function edit(page, receipt) {
    const association = await sql("SELECT id AS data FROM sentinela.linhas_staging WHERE lote_id=$1 ORDER BY registro_csv LIMIT 1", [receipt.lot])
    const raw = () => sql("SELECT campos_csv AS data FROM sentinela.linhas_staging WHERE id=$1", [association])
    const original = await raw()
    const row = page.getByRole("row").filter({ hasText: inputs[3].name })
    if (await row.locator("summary").isVisible()) await row.locator("summary").click()
    await button(row, "Editar registros de " + inputs[3].name).click()
    const dialog = page.getByRole("dialog", { name: "Editar registros", exact: true })
    await dialog.getByLabel("Buscar associação").fill(association)
    await button(dialog, "Buscar").click()
    const found = dialog.getByText("1 associação encontrada", { exact: true })
    const error = dialog.getByRole("alert")
    await visible(found.or(error).first())
    if (!await found.isVisible()) assert.fail(await error.first().textContent())
    await button(dialog, "Editar").click()
    const editor = page.getByRole("dialog", { name: "Corrigir associação", exact: true })
    const corrected = "Endereço corrigido pelo ensaio Edge"
    const justification = "Verificação da trilha de auditoria no Edge"
    await editor.getByLabel("Local para revisão").fill(corrected)
    await button(editor, "Salvar alterações").click()
    await visible(editor.getByText("Informe a justificativa.", { exact: true }))
    await editor.getByLabel("Justificativa").fill(justification)
    await photo(page, "desktop-revisao-pcdf-v2")
    const saving = requested(page, managementPath, "POST")
    await button(editor, "Salvar alterações").click()
    const response = await saving
    assert.equal(response.status(), 200, await response.text())
    const { data } = await response.json()
    await visible(page.getByText("Alteração registrada com auditoria.", { exact: true }))
    assert.deepEqual(await raw(), original)
    const recorded = await sql("SELECT depois->'campos'->>'local' AS data FROM sentinela.eventos_auditoria WHERE id=$1 AND acao='corrigir_associacao'", [data.auditoria])
    assert.equal(recorded, corrected)
    await button(dialog, "Editar").click()
    await visible(editor.getByText(justification, { exact: true }))
    await photo(page, "desktop-auditoria-pcdf-v2")
    await button(editor, "Fechar").click()
    await button(dialog, "Fechar").click()
  }

  try {
    console.log("Edge " + browser.version())
    const desktop = await session(0, 1440)
    await visible(heading(desktop, "Importar ocorrências"))
    await visible(desktop.getByText("PostgreSQL conectado", { exact: true }))
    assert.equal(await button(desktop, "Selecionar arquivo").count(), 1)
    await photo(desktop, "desktop-selecao")
    await choose(desktop, { name: "invalido.txt", mimeType: "text/plain", buffer: Buffer.from("fixture") })
    await visible(desktop.getByRole("alert").filter({ hasText: /CSV|XLSX|formato/i }))
    const receipts = []
    for (const input of inputs) {
      const receipt = await submit(desktop, input, false)
      receipts.push(receipt)
      console.log("OK desktop 1440: " + input.name)
      await button(desktop.getByRole("region", { name: "Confirmar importação" }), "Nova importação").click()
    }
    await history(desktop)
    await photo(desktop, "desktop-historico")
    await edit(desktop, receipts[3])
    console.log("OK edição auditada, validação da justificativa e original preservado")

    const mobile = await session(0, 390)
    for (const [index, input] of inputs.entries()) {
      const receipt = await submit(mobile, input, true)
      assert.equal(receipt.run, receipts[index].run)
      if (index === 3) await photo(mobile, "mobile-reenvio-pcdf-v2")
      await button(mobile.getByRole("region", { name: "Confirmar importação" }), "Nova importação").click()
      console.log("OK mobile 390: " + input.name)
    }
    const conflictCsv = v2.replace(/;SIM;/, ";NÃO;")
    assert.notEqual(conflictCsv, v2)
    await reviewConfirmation(mobile, { ...inputs[3], buffer: Buffer.from(conflictCsv) })
    const conflict = requested(mobile, pcdfPath, "POST", "confirmar")
    await button(mobile, "Confirmar importação").click()
    assert.equal((await conflict).status(), 409)
    await visible(mobile.getByRole("alert").filter({ hasText: /Já existe um lote PCDF nesta competência/i }))
    await history(mobile)
    await photo(mobile, "mobile-historico")
    console.log("OK conflito de competência e histórico no mobile")

    const operator = await session(1, 1440)
    const blocked = requested(operator, pcdfPath, "POST", "validar")
    await choose(operator, inputs[3])
    assert.equal((await blocked).status(), 403)
    await visible(operator.getByRole("alert").filter({ hasText: /não autorizada/i }))
    await history(operator)
    await visible(operator.getByText("Edição e exclusão exigem o perfil Administrador.", { exact: true }))
    assert.equal(await operator.getByRole("button", { name: /^Editar registros/ }).and(operator.locator(":enabled:not([aria-disabled=true])")).count(), 0)
    await operator.goto(origin + "/importar")
    const operatorReceipt = await submit(operator, { ...inputs[0], name: "ensaio-operador.csv",
      buffer: Buffer.from(inputs[0].buffer.toString().replaceAll("Via sintética", "Via sintética do Operador")) }, false)
    assert.equal(await sql("SELECT solicitado_por::text AS data FROM sentinela.lotes_importacao WHERE id=$1", [operatorReceipt.lot]), actors[1].id)
    console.log("OK Operador importa CSV, consulta o histórico e recebe bloqueio em PCDF v2 e edição")

    const analyst = await session(2, 390)
    await visible(heading(analyst, "Acesso negado"))
    assert.equal(await button(analyst, "Selecionar arquivo").count(), 0)
    assert.equal((await analyst.request.get(origin + generalPath)).status(), 403)
    assert.deepEqual(await sql(`SELECT jsonb_build_array(
      (SELECT count(*) FROM sentinela.lotes_importacao),
      (SELECT count(*) FROM sentinela.ocorrencias),
      (SELECT count(*) FROM sentinela.eventos_auditoria WHERE acao='corrigir_associacao')) AS data`), [5, 0, 1])
    assert.deepEqual(unexpected, [], "Exceptions JavaScript inesperadas")
    console.log("OK três perfis, erros visíveis, cinco lotes esperados, uma correção auditada e zero consolidações")
  } finally {
    await browser.close()
  }
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
