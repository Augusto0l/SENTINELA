import assert from "node:assert/strict"
import { chromium } from "playwright-core"

const origin = "http://localhost:3000"
const api = origin + "/api/v1/ocorrencias/gestao"
const file = "pcdf_naturezas_2021-01.csv"
const browser = await chromium.launch({ channel: "msedge", headless: false })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const writes = []
  await context.route("**/*", route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== origin) return route.abort()
    if (request.method() === "GET" || request.method() === "HEAD" || url.pathname === "/auth/login") return route.continue()
    writes.push(url.pathname)
    return route.abort()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(45000)
  page.setDefaultNavigationTimeout(120000)
  await page.goto(origin + "/login")
  console.log("Entre como Administrador na janela do Edge. A senha é enviada apenas ao formulário local.")
  await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 420000 })
  const availability = await page.request.get(api + "?view=disponibilidade")
  assert.equal(availability.status(), 200)
  const capability = (await availability.json()).data
  assert.equal(capability.consultaOperacional, true)
  assert.equal(capability.escrita, "ambiente_bloqueado")

  async function action(row, name, width) {
    const menu = row.locator("summary")
    if (width === 390 && await menu.locator("..").getAttribute("open") === null) await menu.click()
    const button = row.getByRole("button", { name: name + " de " + file })
    assert.equal(await button.isEnabled(), true)
    await button.click()
  }

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(origin + "/ocorrencias")
    await page.getByRole("button", { name: "Arquivos importados", exact: true }).click()
    const row = page.getByRole("row").filter({ hasText: file }).first()
    await row.waitFor()

    await action(row, "Ver detalhes", width)
    const detail = page.getByRole("dialog")
    await detail.getByText(file, { exact: true }).first().waitFor()
    await page.keyboard.press("Escape")
    await detail.waitFor({ state: "hidden" })

    await action(row, "Editar registros", width)
    const records = page.getByRole("dialog", { name: "Editar registros" })
    await records.getByText("6.393 associações encontradas").waitFor()
    await records.getByRole("button", { name: "Editar", exact: true }).first().click()
    const review = page.getByRole("dialog", { name: "Corrigir associação" })
    await review.getByLabel("Local para revisão").waitFor()
    await review.getByLabel("Justificativa").fill("Verificação sem gravação")
    assert.equal(await review.getByRole("button", { name: "Salvar alterações" }).isDisabled(), true)
    await page.keyboard.press("Escape")
    await review.waitFor({ state: "hidden" })
    await page.keyboard.press("Escape")
    await records.waitFor({ state: "hidden" })

    await action(row, "Excluir arquivo", width)
    const preview = page.getByRole("dialog", { name: "Excluir definitivamente esta importação?" })
    await preview.getByText("20.020", { exact: true }).waitFor()
    await preview.getByRole("heading", { name: "Dependências a verificar" }).waitFor()
    const confirmation = preview.getByLabel(/Digite o identificador/)
    const id = (await confirmation.locator("..").getByText(/^[0-9a-f-]{36}$/i).textContent())?.trim()
    assert.match(id ?? "", /^[0-9a-f-]{36}$/i)
    await confirmation.fill(id)
    await preview.getByLabel("Justificativa").fill("Verificação sem gravação")
    await preview.getByRole("checkbox").check()
    assert.equal(await preview.getByRole("button", { name: "Excluir definitivamente" }).isDisabled(), true)
    await preview.getByRole("button", { name: "Cancelar" }).click()
    await preview.waitFor({ state: "hidden" })
    await page.getByRole("button", { name: "Atualizar histórico" }).click()
    await row.waitFor()
    console.log(`Porta 3000, ${width}px: detalhes, revisão, prévia e bloqueio confirmados.`)
  }
  assert.deepEqual(writes, [])
} finally {
  await browser.close()
}
