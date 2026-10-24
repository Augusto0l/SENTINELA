import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { chromium } from "playwright-core"

const base = process.env.SENTINELA_TEST_URL ?? "http://127.0.0.1:3000"
const output = "tmp/navigation-evidence"
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: "chrome", headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" })
const page = await context.newPage()
const errors = []
const checks = []
page.on("pageerror", (error) => errors.push(error.message))
const routes = [
  ["/dashboard", "Dashboard"], ["/mapa-criminal", "Mapa Criminal"],
  ["/ocorrencias", "Ocorrências"], ["/ocorrencias/nova", "Nova Ocorrência"],
  ["/importar", "Importar Dados"], ["/usuarios", "Usuários"], ["/configuracoes", "Configurações"],
]
const sidebar = page.getByRole("complementary", { name: "Navegação do SENTINELA" })
const header = page.locator(".system-topbar")
const profile = () => page.getByRole("combobox", { name: "Simular perfil" })
const go = async (path) => {
  assert.equal((await page.goto(base + path, { waitUntil: "domcontentloaded" })).status(), 200)
}
const record = (message) => { checks.push(message); console.log(`PASS ${message}`) }

async function layoutFits() {
  const geometry = await page.evaluate(() => {
    const selectors = [".system-topbar", ".system-topbar button", ".system-topbar select", ".system-sidebar"]
    return selectors.flatMap((selector) => [...document.querySelectorAll(selector)].map((element) => {
      const rect = element.getBoundingClientRect()
      return { selector, visible: rect.width > 0 && rect.height > 0, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewport: innerWidth }
    }))
  })
  for (const rect of geometry.filter((item) => item.visible)) {
    assert.ok(rect.left >= -1 && rect.right <= rect.viewport + 1, `Fora da tela: ${JSON.stringify(rect)}`)
  }
  const boxes = await header.locator("button, select").evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom }
  }))
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]
    assert.ok(a.right <= b.x + 1 || b.right <= a.x + 1 || a.bottom <= b.y + 1 || b.bottom <= a.y + 1, "Controles do header sobrepostos")
  }
}

try {
  await go("/dashboard")
  await header.waitFor()
  for (const theme of ["escuro", "claro"]) {
    const current = await page.locator("html").getAttribute("data-theme")
    if (current !== theme) await header.getByRole("button", { name: theme === "claro" ? "Ativar tema claro" : "Ativar tema escuro" }).click()
    for (const [path, label] of routes) {
      await sidebar.getByRole("button", { name: label, exact: true }).click()
      await page.waitForURL(base + path)
      await header.waitFor()
      const active = sidebar.locator('[aria-current="page"]')
      assert.equal(await active.count(), 1)
      assert.equal(await active.getAttribute("aria-label"), label)
      assert.equal(await active.evaluate((element) => getComputedStyle(element).borderTopStyle), "solid")
      assert.ok((await header.innerText()).includes(label))
      assert.match(await header.innerText(), /Demonstração · sem persistência/)
      assert.equal(await header.getByRole("combobox", { name: "Simular perfil" }).count(), 1)
      await layoutFits()
    }
    await go("/dashboard")
    await header.waitFor()
    await page.screenshot({ path: `${output}/${theme}-desktop.png` })
    record(`7 rotas por navegação, item ativo e header no tema ${theme}`)

    await sidebar.getByRole("button", { name: "Recolher navegação" }).click()
    assert.equal(await sidebar.evaluate((element) => Math.round(element.getBoundingClientRect().width)), 80)
    await sidebar.getByRole("button", { name: "Ocorrências", exact: true }).click()
    await page.waitForURL(base + "/ocorrencias")
    assert.equal(await sidebar.locator('[aria-current="page"]').getAttribute("aria-label"), "Ocorrências")
    await sidebar.getByRole("button", { name: "Expandir navegação" }).click()
    assert.equal(await sidebar.evaluate((element) => Math.round(element.getBoundingClientRect().width)), 264)
    record(`Recolher, navegar e expandir no tema ${theme}`)

    for (const width of [1920, 1366, 1280, 1024, 1023, 820, 768, 767, 640, 480, 390, 360, 320]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 })
      for (const path of ["/dashboard", "/ocorrencias/nova", "/configuracoes"]) {
        await go(path)
        await header.waitFor()
        await layoutFits()
      }
      if ([1366, 820, 390, 320].includes(width)) await page.screenshot({ path: `${output}/${theme}-${width}.png` })
    }
    record(`Responsividade de sidebar/header em 13 larguras, 3 telas, tema ${theme}`)
    await page.setViewportSize({ width: 1440, height: 900 })
  }

  await header.getByRole("button", { name: "Notificações demonstrativas" }).click()
  await page.getByText("Notificações ilustrativas. Não há alertas de ocorrências reais.", { exact: true }).waitFor()
  await header.getByRole("button", { name: "Abrir configurações do usuário demonstrativo" }).click()
  await page.waitForURL(base + "/configuracoes")
  await page.keyboard.press("Tab")
  await sidebar.getByRole("button", { name: "Dashboard", exact: true }).focus()
  assert.notEqual(await sidebar.getByRole("button", { name: "Dashboard", exact: true }).evaluate((element) => getComputedStyle(element).outlineStyle), "none")
  await page.keyboard.press("Enter")
  await page.waitForURL(base + "/dashboard")
  record("Notificações, avatar, navegação por teclado e foco visível")

  await profile().selectOption("Analista")
  for (const label of ["Nova Ocorrência", "Importar Dados", "Usuários"]) assert.equal(await sidebar.getByRole("button", { name: label, exact: true }).count(), 0)
  for (const path of ["/ocorrencias/nova", "/importar", "/usuarios"]) {
    await go(path)
    await page.getByRole("heading", { name: "Acesso negado na demonstração" }).waitFor()
    assert.equal(await profile().inputValue(), "Analista")
  }
  await profile().selectOption("Operador")
  await go("/importar")
  await header.waitFor()
  assert.equal(await sidebar.getByRole("button", { name: "Usuários", exact: true }).count(), 0)
  assert.equal(await sidebar.getByRole("button", { name: "Nova Ocorrência", exact: true }).count(), 1)
  await go("/usuarios")
  await page.getByRole("heading", { name: "Acesso negado na demonstração" }).waitFor()
  await profile().selectOption("Administrador")
  await header.waitFor()
  assert.equal(await sidebar.getByRole("button", { name: "Usuários", exact: true }).count(), 1)
  assert.equal(await profile().inputValue(), "Administrador")
  record("Permissões dos três perfis e recuperação do seletor na tela de acesso negado")

  await sidebar.getByRole("button", { name: "Voltar ao login demonstrativo", exact: true }).click()
  await page.waitForURL(base + "/login")
  await page.getByRole("heading", { name: "Acesse a demonstração" }).waitFor()
  assert.deepEqual(errors, [])
  record("Retorno ao login demonstrativo; nenhum erro JavaScript")
  await writeFile(`${output}/report.json`, JSON.stringify({ checks, errors }, null, 2))
} finally {
  await browser.close()
}
