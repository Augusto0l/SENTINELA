import assert from "node:assert/strict"
import { chromium } from "playwright-core"

const origin = "http://localhost:3000"
const analytics = "/api/v1/analytics/persistente"
const occurrenceSummary = "/api/v1/ocorrencias/consulta?view=resumo"
const management = "/api/v1/ocorrencias/gestao?view=disponibilidade"
const profiles = [{ width: 1440, height: 900 }, { width: 390, height: 844 }]
const checkImportManagement = process.argv.includes("--import-management")
const browser = await chromium.launch({ channel: "msedge", headless: false })
try {
  const context = await browser.newContext({ viewport: profiles[0] })
  if (checkImportManagement) await context.route("**/*", route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== origin) return route.abort()
    return ["GET", "HEAD"].includes(request.method()) || url.pathname === "/auth/login" ? route.continue() : route.abort()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  page.setDefaultNavigationTimeout(120000)

  for (const viewport of profiles) {
    await page.setViewportSize(viewport)
    await page.goto(origin + "/dashboard")
    await page.waitForURL(url => url.pathname === "/login")
    await page.getByText("Acesso institucional com Supabase Auth.", { exact: true }).waitFor()
    const email = page.locator('form input[type="email"]')
    const password = page.locator('form input[type="password"]')
    await Promise.all([email.waitFor(), password.waitFor()])
    assert.equal(await email.isEnabled(), true)
    assert.equal(await password.isEnabled(), true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  }
  assert.equal((await context.request.get(origin + analytics)).status(), 401)
  console.log("Login e bloqueio anônimo verificados em desktop e mobile.")

  await page.setViewportSize(profiles[0])
  console.log("Aguardando o login manual no Edge.")
  await page.waitForURL(url => ["/dashboard", "/acesso-pendente"].includes(url.pathname), { timeout: 300000 })
  assert.equal(new URL(page.url()).pathname, "/dashboard", "O Supabase autenticou uma conta sem acesso ativo.")
  if (checkImportManagement) {
    assert.equal((await page.goto(origin + "/usuarios"))?.status(), 200)
    assert.equal(new URL(page.url()).pathname, "/usuarios")
    assert.equal(await page.locator('[title="Augusto · Administrador"]').count(), 1)
    console.log("Sessão real do Administrador confirmada no backend. Aguardando a instalação qualificada.")
    const lot = "a88ac192-edef-4339-8381-106bbd1b391e"
    const deadline = Date.now() + 480000
    while (true) {
      const response = await context.request.get(origin + management)
      assert.equal(response.status(), 200)
      if ((await response.json()).data.escrita === "disponivel") {
        const preview = await context.request.get(origin + "/api/v1/ocorrencias/gestao", { params: { view: "previa_exclusao", id: lot } })
        if (preview.ok() && (await preview.json()).data.excecao) break
      }
      assert.ok(Date.now() < deadline, "A autorização especial continua indisponível no banco operacional")
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
    const file = "pcdf_naturezas_2021-01.csv"
    for (const viewport of profiles) {
      await page.setViewportSize(viewport)
      await page.goto(origin + "/importar")
      await page.getByRole("button", { name: "Histórico", exact: true }).click()
      const row = page.getByRole("row").filter({ hasText: file })
      await row.waitFor()
      async function action(label) {
        if (viewport.width === 390) await row.locator("summary").click()
        await row.getByRole("button", { name: label + " de " + file }).click()
      }
      await action("Editar registros")
      const list = page.getByRole("dialog", { name: "Editar registros", exact: true })
      await list.getByText("6.393 associações encontradas").waitFor()
      await list.getByRole("button", { name: "Editar", exact: true }).first().click()
      const editor = page.getByRole("dialog", { name: "Corrigir associação" })
      await editor.getByLabel("Local para revisão").waitFor()
      assert.equal(await editor.getByRole("button", { name: "Salvar alterações" }).isEnabled(), true)
      await page.keyboard.press("Escape")
      await editor.waitFor({ state: "hidden" })
      await page.keyboard.press("Escape")
      await list.waitFor({ state: "hidden" })
      await action("Excluir arquivo")
      const preview = page.getByRole("dialog", { name: "Excluir definitivamente esta importação?" })
      await preview.getByText(/Lote protegido contra exclusão operacional/).waitFor()
      await preview.getByText("20.020", { exact: true }).waitFor()
      await preview.getByText("Backup restaurado com integridade verificada").waitFor()
      assert.equal(await preview.getByRole("button", { name: "Autorizar exclusão deste lote" }).isEnabled(), true)
      assert.equal(await preview.getByRole("button", { name: "Excluir definitivamente" }).count(), 0)
      console.log(`Porta 3000 em ${viewport.width}px: edição disponível e prévia do lote protegido conferida sem gravação.`)
    }
  } else {
    async function checkSessionCookies(expected) {
      const cookies = await context.cookies(origin)
      assert.equal(cookies.some(cookie => /^sb-hcmqsqfbrynpfjvmuqdb-auth-token(?:\.\d+)?$/.test(cookie.name)), expected)
      assert.equal(cookies.some(cookie => cookie.name === "sentinela-local-session"), false)
    }
    await checkSessionCookies(true)
    console.log("Login Supabase e cookie SSR confirmados.")

    for (const viewport of profiles) {
      await page.setViewportSize(viewport)
      for (const path of ["/dashboard", "/mapa-criminal", "/ocorrencias", "/ocorrencias/nova", "/importar"]) {
        assert.equal((await page.goto(origin + path))?.status(), 200, path)
        assert.equal(new URL(page.url()).pathname, path)
        await page.locator("main").waitFor()
      }
      await page.reload()
      assert.equal(new URL(page.url()).pathname, "/importar")
    }
    const adminPage = await page.goto(origin + "/usuarios")
    assert.equal(adminPage?.status(), 200)
    assert.equal(new URL(page.url()).pathname, "/usuarios", "A sessão precisa ter o perfil Administrador.")
    await page.locator('[title$=" · Administrador"]').waitFor({ state: "attached" })
    console.log("Perfil Administrador, navegação desktop/mobile e sessão após recarga confirmados.")

    for (const path of [analytics, occurrenceSummary, management, "/api/v1/importacoes/pcdf/direta", "/api/v1/importacoes/geral"]) {
      const result = await context.request.get(origin + path)
      assert.equal(result.status(), 200, path)
      const payload = await result.json()
      assert.equal(payload.success, true, path)
      if (path === management) {
        assert.equal(payload.data.consultaOperacional, true)
        assert.ok(["disponivel", "ambiente_bloqueado"].includes(payload.data.escrita))
        console.log("Disponibilidade institucional da gestão: " + payload.data.escrita)
      }
    }
    console.log("Leituras do PostgreSQL e disponibilidade da gestão confirmadas.")

    // Verify access without this browser's session. Global sign-out would affect other devices.
    await context.clearCookies()
    await checkSessionCookies(false)
    assert.equal((await context.request.get(origin + analytics)).status(), 401)
    await page.goto(origin + "/dashboard")
    await page.waitForURL(url => url.pathname === "/login")
    console.log("API e rotas protegidas confirmadas após limpar os cookies do navegador de teste.")
  }
} finally {
  await browser.close()
}
