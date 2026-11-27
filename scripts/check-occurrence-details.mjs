import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

const fieldNames = [
  "ano_registro", "unidade_registro", "numero_registro", "ocorrencia_chave", "ano_fato",
  "data_inicio_fato_original", "data", "horario", "natureza_original", "natureza_padronizada_pcdf",
  "crime_tentado", "natureza_sentinela_codigo", "classificacao_status", "versao_mapeamento",
  "cidade_endereco_original", "ra_original", "area_endereco_original", "quadra_endereco_original",
  "ra_codigo", "local", "latitude_geo_original", "longitude_geo_original", "latitude_utm_original",
  "longitude_utm_original", "latitude", "longitude", "coordenada_status", "flagrante", "unidade_apuracao",
  "fonte", "linha_origem_id", "linha_xml", "aba_origem", "versao_tratamento",
]
const uid = number => "a1000000-0000-4000-8000-" + String(number).padStart(12, "0")
const lot = uid(801)
const execution = uid(802)
const row = ordinal => ({
  id: uid(ordinal), origem_id: uid(700 + ordinal), identificacao: "2024 / UNIDADE TESTE / " + String(ordinal).padStart(5, "0"),
  data: "2024-02-23", hora: "16:00", natureza: "Natureza sintética", padronizada: "Classificação de teste",
  ra: "RA de teste", local: "LOCAL SINTÉTICO", situacao: ordinal === 27 ? "recebida" : "bloqueada",
  lote: lot, arquivo: "pcdf_naturezas_teste.csv", competencia: "2024-02", execucao: execution,
  ordinal, pendencias: ordinal === 27 ? 0 : 3,
})
const detail = ordinal => ({
  origemId: uid(700 + ordinal), stagingId: uid(ordinal), lote: lot, execucao: execution,
  arquivo: "pcdf_naturezas_teste.csv", competencia: "2024-02", ordinal, situacao: row(ordinal).situacao,
  campos: Object.assign(Object.fromEntries(fieldNames.map(field => [field, ""])), {
    ano_registro: "2024", unidade_registro: "UNIDADE TESTE", numero_registro: String(ordinal).padStart(5, "0"),
    ocorrencia_chave: JSON.stringify(["TESTE", "2024", "UNIDADE TESTE", String(ordinal).padStart(5, "0")]),
    ano_fato: "2024", data_inicio_fato_original: "23/02/2024 16:00:00", data: "2024-02-23", horario: "16:00:00",
    natureza_original: "Natureza sintética", natureza_padronizada_pcdf: "Classificação de teste",
    ra_original: "RA de teste", local: "  LOCAL SINTÉTICO  ", coordenada_status: "em_revisao",
    linha_origem_id: "ORIGEM-DE-TESTE", linha_xml: "0001", aba_origem: "NATUREZAS", versao_tratamento: "v1-teste",
  }),
  pendencias: ordinal === 27 ? [] : [
    { campo: "coordenada_status", regra: "estado", motivo: "estado_recebido_inválido", prioridade: "media", situacao: "aberta" },
    { campo: "natureza_sentinela_codigo", regra: "mapeamento", motivo: "mapeamento_a_homologar", prioridade: "media", situacao: "aberta" },
    { campo: "ra_codigo", regra: "referencia", motivo: "RA_a_homologar", prioridade: "baixa", situacao: "em_analise" },
  ],
})

export async function checkImportedOccurrenceDetails({ browser, origin, cookie, output }) {
  const catalog = JSON.parse(await readFile(new URL("../docs/contratos/catalogos-v0.1.0.json", import.meta.url), "utf8"))
  const meta = { contractVersion: "0.1.0", catalogVersion: catalog.versao, execution: { mode: "operacional", persisted: false } }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" })
  const [name, value] = cookie.split("=")
  const errors = []
  const queries = []
  const checkedWidths = []
  await context.addCookies([{ name, value, url: origin, httpOnly: true, sameSite: "Strict" }])
  await context.route("**/*", async route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin || route.request().method() !== "GET") return route.abort()
    if (!url.pathname.startsWith("/api/")) return route.continue()
    if (url.pathname !== "/api/v1/ocorrencias/consulta") return route.abort()
    const query = url.searchParams
    const view = query.get("view")
    let data
    if (view === "resumo") {
      data = { canImport: true, recebidas: 51, consolidadas: 0, pendencias: 150, competencias: ["2024-02"],
        rasImportadas: ["RA de teste"], naturezasImportadas: ["Natureza sintética"], rasConsolidadas: [], naturezasConsolidadas: [] }
    } else if (view === "importados") {
      queries.push(Object.fromEntries(query))
      const pagina = Number(query.get("pagina"))
      data = { pagina, total: 51, itens: Array.from({ length: pagina === 3 ? 1 : 25 }, (_, i) => row((pagina - 1) * 25 + i + 1)) }
    } else if (view === "detalhe") {
      const ordinal = Number(query.get("id")?.slice(-12))
      assert(ordinal > 0 && ordinal <= 51)
      data = detail(ordinal)
    } else {
      data = { pagina: 1, total: 0, itens: [] }
    }
    return route.fulfill({ json: { success: true, data, meta } })
  })
  try {
    await mkdir(output, { recursive: true })
    const page = await context.newPage()
    page.setDefaultTimeout(35000)
    page.on("pageerror", error => errors.push(error.name))
    await page.goto(origin + "/ocorrencias", { waitUntil: "domcontentloaded" })
    const imports = page.locator("#consulta-importados")
    const table = imports.getByRole("region", { name: "Tabela · Registros importados" })
    const search = imports.getByLabel("Buscar por identificação")
    await search.fill("UNIDADE TESTE")
    await imports.getByRole("button", { name: "Aplicar filtros" }).click()
    await table.getByRole("button", { name: "Identificação" }).click()
    await imports.getByRole("button", { name: "Próxima" }).click()
    const pager = imports.getByText("Página 2 de 3", { exact: true })
    await pager.waitFor()
    const opener = table.getByRole("button", { name: "Ver detalhes · registro 26", exact: true })
    await opener.focus()
    await page.keyboard.press("Enter")
    const dialog = page.getByRole("dialog", { name: "Detalhes da associação importada" })
    const close = dialog.getByRole("button", { name: "Fechar detalhes" })
    const issues = dialog.getByRole("region", { name: "Pendências registradas (3)" })
    const fields = dialog.getByRole("region", { name: "34 campos do arquivo recebido" })
    await fields.waitFor()
    assert.equal(await close.evaluate(element => element === document.activeElement), true)
    assert.match(await dialog.getAttribute("aria-describedby"), /\S/)
    const summary = dialog.locator('dl[aria-label="Resumo da associação"]')
    for (const text of [row(26).identificacao, "fevereiro de 2024", "Bloqueada", lot, execution]) {
      await summary.getByText(text, { exact: true }).waitFor()
    }
    assert.equal(await issues.getByRole("listitem").count(), 3)
    await issues.getByText("Aberta · Prioridade média", { exact: true }).first().waitFor()
    await issues.getByText("mapeamento a homologar", { exact: true }).waitFor()
    const sections = fields.locator("details")
    assert.equal(await sections.count(), 5)
    assert.equal(await sections.first().getAttribute("open"), "")
    for (const text of [detail(26).arquivo, detail(26).origemId, detail(26).stagingId, lot, execution]) {
      await sections.first().getByText(text, { exact: true }).waitFor()
    }
    const capture = name => page.screenshot({ path: join(output, name + ".png"), animations: "disabled",
      style: "nextjs-portal { display: none !important; }" })
    await capture("modal-desktop")

    const geometry = () => dialog.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const overlay = document.querySelector(".dialog-overlay")
      const issues = element.querySelector("#association-issues").closest("section").getBoundingClientRect()
      const fields = element.querySelector("#association-fields").closest("section").getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, vw: innerWidth, vh: innerHeight,
        overlay: getComputedStyle(overlay).backgroundColor, columns: fields.x > issues.x, pageWidth: document.documentElement.scrollWidth }
    })
    for (const width of [1920, 1440, 1366, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 })
      const box = await geometry()
      assert(Math.abs(box.x + box.width / 2 - width / 2) < 2)
      assert(Math.abs(box.y + box.height / 2 - box.vh / 2) < 2)
      assert(box.width <= Math.min(1201, width) && box.height <= box.vh * 0.90 + 1)
      assert.equal(box.columns, width > 900)
      assert(box.pageWidth <= width)
      assert.match(box.overlay, /^rgba\(0, 0, 0, 0\.[5-9]/)
      const closeBox = await close.boundingBox()
      assert(closeBox && closeBox.y >= 0 && closeBox.y + closeBox.height <= box.vh)
      checkedWidths.push(width)
      if (width === 768 || width === 390) await capture(width === 768 ? "modal-tablet" : "modal-mobile")
    }
    const body = dialog.locator("[aria-busy]").first()
    assert(await body.evaluate(element => {
      element.scrollTop = element.scrollHeight
      return element.scrollTop > 0
    }))
    const closeAfterScroll = await close.boundingBox()
    assert(closeAfterScroll && closeAfterScroll.y >= 0 && closeAfterScroll.y + closeAfterScroll.height <= 900)
    await body.evaluate(element => { element.scrollTop = 0 })
    await page.setViewportSize({ width: 1920, height: 1200 })
    const toggles = sections.locator("summary")
    for (let i = 0; i < await sections.count(); i++) {
      if (await sections.nth(i).getAttribute("open") === null) {
        await toggles.nth(i).focus()
        await page.keyboard.press("Enter")
      }
    }
    const raw = await fields.locator("details:not(:first-of-type) dt").allTextContents()
    assert.deepEqual([...raw].sort(), [...fieldNames].sort())
    await fields.getByText("00026", { exact: true }).waitFor()
    assert.equal(await fields.locator("dd").filter({ hasText: /LOCAL SINTÉTICO/ }).textContent(), "  LOCAL SINTÉTICO  ")
    assert(await fields.getByText("Vazio", { exact: true }).count() > 0)
    await close.focus()
    await capture("modal-expandido")
    await page.keyboard.press("Shift+Tab")
    assert(await dialog.evaluate(element => element.contains(document.activeElement)))
    await page.keyboard.press("Tab")
    assert.equal(await close.evaluate(element => element === document.activeElement), true)
    for (let i = 0; i < await sections.count(); i++) await toggles.nth(i).click()
    assert.equal(await fields.locator("details[open]").count(), 0)
    await close.focus()
    await capture("modal-recolhido")
    await close.click()
    await dialog.waitFor({ state: "hidden" })
    assert.equal(await opener.evaluate(element => element === document.activeElement), true)
    await pager.waitFor()
    assert.equal(await search.inputValue(), "UNIDADE TESTE")
    assert.equal(queries.at(-1).pagina, "2")
    assert.equal(queries.at(-1).ordenar, "identificacao")
    assert.equal(queries.at(-1).identificacao, "UNIDADE TESTE")
    await page.getByRole("button", { name: "Ativar tema claro" }).click()
    const second = table.getByRole("button", { name: "Ver detalhes · registro 27", exact: true })
    await second.click()
    await dialog.getByText(row(27).identificacao, { exact: true }).waitFor()
    await dialog.getByText("Nenhuma pendência registrada para esta linha.").waitFor()
    assert.equal(await dialog.getByText(row(26).identificacao, { exact: true }).count(), 0)
    assert.equal(await page.locator("html").getAttribute("data-theme"), "claro")
    await close.focus()
    await capture("modal-tema-claro")
    await page.keyboard.press("Escape")
    await dialog.waitFor({ state: "hidden" })
    assert.equal(await second.evaluate(element => element === document.activeElement), true)
    assert.deepEqual(errors, [])
    await writeFile(join(output, "resultado.json"), JSON.stringify({ result: "APROVADO", widths: checkedWidths,
      fields: raw.length, source: "Respostas de teste exclusivamente sintéticas", errors }, null, 2))
  } finally {
    await context.close()
  }
}
