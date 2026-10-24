import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { chromium } from "playwright-core"
const base = process.env.SENTINELA_TEST_URL ?? "http://localhost:3000"
const output = "tmp/sprint-02-evidence"
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
page.setDefaultTimeout(15000)
page.setDefaultNavigationTimeout(120000)
const errors = [],
  checks = []
page.on("pageerror", (error) => errors.push(error.message))
const check = (message) => {
  checks.push(message)
  console.log(message)
}
const role = (value) =>
  page.getByRole("combobox", { name: "Simular perfil" }).selectOption(value)
const go = async (path) => {
  assert.equal(
    (await page.goto(base + path, { waitUntil: "domcontentloaded" })).status(),
    200,
  )
}
const form = page.locator("form.occurrence-form")
try {
  await go("/ocorrencias")
  await role("Analista")
  await page
    .getByRole("button", { name: "Nova Ocorrência", exact: true })
    .waitFor({ state: "hidden" })
  assert.equal(await page.getByRole("button", { name: /^Editar / }).count(), 0)
  assert.equal(
    await page.getByRole("button", { name: /^Inativar / }).count(),
    0,
  )
  assert.equal(
    await page
      .getByRole("button", { name: "Nova Ocorrência", exact: true })
      .count(),
    0,
  )
  for (const path of ["/ocorrencias/nova", "/usuarios", "/importar"]) {
    await go(path)
    await page
      .getByRole("heading", { name: "Acesso negado na demonstração" })
      .waitFor()
  }
  check("Analista: ações ocultas e acesso direto bloqueado nas três rotas.")
  await role("Operador")
  await go("/usuarios")
  await page
    .getByRole("heading", { name: "Acesso negado na demonstração" })
    .waitFor()
  await go("/importar")
  await page.locator(".system-topbar").waitFor()
  await go("/ocorrencias")
  await page
    .getByRole("button", { name: /^Editar / })
    .first()
    .waitFor()
  assert.equal(
    await page.getByRole("button", { name: /^Inativar / }).count(),
    0,
  )
  await page.getByRole("link", { name: "Nova ocorrência", exact: true }).click()
  assert.equal(await page.locator(".occurrence-form-grid").evaluate(element => getComputedStyle(element).display), "grid", "Estilos do formulário devem estar presentes no build")
  assert.equal(await page.locator(".demo-profile-bar").evaluate(element => getComputedStyle(element).display), "flex", "Estilos do seletor de perfil devem estar presentes no build")
  await form.getByLabel("Endereço", { exact: false }).fill("Valor descartável")
  await form.getByRole("button", { name: "Cancelar", exact: true }).click()
  const discard = page.getByRole("dialog", {
    name: "Descartar alterações?",
    exact: true,
  })
  await discard.getByRole("button", { name: "Continuar editando" }).click()
  assert.equal(
    await form.getByLabel("Endereço", { exact: false }).inputValue(),
    "Valor descartável",
  )
  await form.getByRole("button", { name: "Cancelar", exact: true }).click()
  await discard.getByRole("button", { name: "Descartar", exact: true }).click()
  await page.getByRole("link", { name: "Nova ocorrência", exact: true }).click()
  assert.equal(
    await form.getByLabel("Endereço", { exact: false }).inputValue(),
    "",
  )
  await form
    .getByRole("button", { name: "Criar ocorrência demonstrativa" })
    .click()
  await page
    .getByText("Informe uma data válida em DD/MM/AAAA.", { exact: true })
    .waitFor()
  await form.getByRole("button", { name: "Simular geocodificação" }).click()
  await page
    .getByText(
      "Informe uma RA e um endereço válido com pelo menos cinco caracteres e letras.",
      { exact: true },
    )
    .waitFor()
  await form.getByLabel("Natureza", { exact: false }).selectOption("Furto")
  await form
    .getByLabel("Data (DD/MM/AAAA)", { exact: false })
    .fill("31/02/2026")
  await form.getByLabel("Hora (HH:mm)", { exact: false }).fill("25:00")
  await form
    .getByLabel("Região Administrativa", { exact: false })
    .selectOption("RA-I")
  await form
    .getByLabel("Endereço", { exact: false })
    .fill("Quadra teste Sprint Dois")
  await form.getByRole("button", { name: "Simular geocodificação" }).click()
  const lat = form.getByLabel("Latitude", { exact: false })
  const lng = form.getByLabel("Longitude", { exact: false })
  assert.notEqual(await lat.inputValue(), "")
  await form
    .getByRole("button", { name: "Criar ocorrência demonstrativa" })
    .click()
  await page
    .getByText("Informe um horário válido em HH:mm.", { exact: true })
    .waitFor()
  await form
    .getByLabel("Data (DD/MM/AAAA)", { exact: false })
    .fill("28/02/2026")
  await form.getByLabel("Hora (HH:mm)", { exact: false }).fill("21:30")
  const map = page.locator(".leaflet-container")
  await map.waitFor()
  const before = await lat.inputValue()
  await map.click({ position: { x: 180, y: 100 } })
  assert.notEqual(await lat.inputValue(), before)
  const pin = page.locator(".occurrence-pin")
  await pin.hover()
  const box = await pin.boundingBox()
  assert.ok(box)
  const beforeDrag = [await lat.inputValue(), await lng.inputValue()]
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 65, box.y + 45, { steps: 12 })
  await page.mouse.up()
  assert.notDeepEqual(
    [await lat.inputValue(), await lng.inputValue()],
    beforeDrag,
  )
  await lat.fill("-15.800000")
  await lng.fill("-47.900000")
  for (const width of [390, 768, 1366]) {
    await page.setViewportSize({ width, height: 844 })
    await map.scrollIntoViewIfNeeded()
    await page.waitForFunction(() => {
      const marker = document.querySelector(".occurrence-pin")?.getBoundingClientRect()
      const container = document.querySelector(".leaflet-container")?.getBoundingClientRect()
      return marker && container && marker.x >= container.x && marker.y >= container.y && marker.right <= container.right && marker.bottom <= container.bottom
    })
    for (const theme of ["claro", "escuro"]) {
      if (await page.locator("html").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: `Ativar tema ${theme}` }).click()
      await form.evaluate(element => { element.parentElement.scrollTop = 0 })
      await page.screenshot({ path: `${output}/cadastro-${width}-${theme}-inicio.png` })
      await form.getByRole("button", { name: "Criar ocorrência demonstrativa" }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${output}/cadastro-${width}-${theme}-fim.png` })
    }
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    )
  }
  check("Cadastro nos temas claro/escuro em 390, 768 e 1366 pixels, sem rolagem horizontal da página; capturas locais geradas.")
  await form
    .getByRole("button", { name: "Criar ocorrência demonstrativa" })
    .click()
  const search = page.getByRole("textbox", {
    name: "Buscar ID, RA, natureza ou localização",
  })
  await search.fill("Quadra teste Sprint Dois")
  const row = page.locator("tbody tr").first()
  await row.getByRole("button", { name: /^Editar / }).waitFor()
  assert.ok((await row.innerText()).includes("28/02/2026"))
  check(
    "Operador: validação, geocodificação inválida/válida, clique/arraste e criação em memória aprovados.",
  )
  await row.getByRole("button", { name: /^Editar / }).click()
  await form.getByLabel("Endereço", { exact: false }).fill("Edição descartada")
  await form.getByRole("button", { name: "Cancelar", exact: true }).click()
  await discard.getByRole("button", { name: "Descartar", exact: true }).click()
  assert.ok((await row.innerText()).includes("Quadra teste Sprint Dois"))
  await row.getByRole("button", { name: /^Editar / }).click()
  await form
    .getByLabel("Endereço", { exact: false })
    .fill("Quadra editada Sprint Dois")
  await form
    .getByRole("button", { name: "Aplicar edição demonstrativa" })
    .click()
  await search.fill("Quadra editada Sprint Dois")
  await row.getByRole("button", { name: /^Ver detalhes / }).click()
  await page
    .getByRole("dialog", { name: "Detalhes da ocorrência", exact: true })
    .getByText("Quadra editada Sprint Dois", { exact: true })
    .waitFor()
  await page.keyboard.press("Escape")
  await role("Administrador")
  await row.getByRole("button", { name: /^Inativar / }).click()
  const confirmation = page.getByRole("dialog", {
    name: "Inativar ocorrência demonstrativa?",
    exact: true,
  })
  assert.equal(
    await confirmation
      .getByRole("button", { name: "Confirmar inativação demonstrativa" })
      .isDisabled(),
    true,
  )
  await confirmation
    .getByRole("button", { name: "Cancelar", exact: true })
    .click()
  await row.getByRole("button", { name: /^Inativar / }).click()
  await confirmation
    .getByLabel("Motivo obrigatório")
    .fill("Teste demonstrativo da Sprint 2")
  await confirmation
    .getByRole("button", { name: "Confirmar inativação demonstrativa" })
    .click()
  await page
    .getByText("Nenhum registro encontrado com os filtros aplicados.")
    .waitFor()
  await page.getByLabel("Incluir inativas").check()
  await row.getByText(/Inativa/).waitFor()
  assert.equal(await row.getByRole("button", { name: /^Editar / }).count(), 0)
  check(
    "Edição, detalhes atualizados, cancelamento, motivo obrigatório e inativação aprovados.",
  )
  await page.reload()
  await search.fill("Quadra editada Sprint Dois")
  await page
    .getByText("Nenhum registro encontrado com os filtros aplicados.")
    .waitFor()
  await go("/usuarios")
  await page.locator(".system-topbar").waitFor()
  check(
    "Recarregar descarta o cenário; Administrador acessa gestão de usuários.",
  )
  assert.deepEqual(errors, [])
  await writeFile(
    `${output}/resultados.json`,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: browser.version(),
        base,
        checks,
        errors,
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
