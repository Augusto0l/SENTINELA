import assert from "node:assert/strict"
import { randomBytes, randomUUID, scryptSync } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { chromium } from "playwright-core"
import { freePort, httpValidation } from "./http-validation-output.mjs"

const origin = "http://127.0.0.1:3318"
const root = process.env.SENTINELA_MANUAL_TEST_ROOT
assert(root && root === process.env.SENTINELA_MANAGEMENT_FIXTURE)
const api = origin + "/api/v1/ocorrencias/manuais"
const read = origin + "/api/v1/ocorrencias/consulta"
const password = randomBytes(32).toString("hex")
const users = ["Administrador", "Operador", "Analista"].map((role, i) => {
  const salt = randomBytes(16).toString("hex")
  return { role, email: `manual-test-${i}@example.test`, salt, hash: scryptSync(password, Buffer.from(salt, "hex"), 64).toString("hex") }
})
const accounts = join(root, "accounts.json")
await writeFile(accounts, JSON.stringify({ accounts: users }), { flag: "wx" })
const id = randomUUID()
const run = httpValidation(id, { port: 3318 })
const env = { ...process.env, NODE_ENV: "development", SENTINELA_APP_ORIGIN: origin,
  SENTINELA_LOCAL_ACCOUNTS_FILE: accounts, SENTINELA_HTTP_VALIDATION_ID: id, SENTINELA_AUTH_PROVIDER: "local",
  SENTINELA_PCDF_SYNTHETIC: "1", SENTINELA_OCCURRENCE_MANAGEMENT: "1", SENTINELA_PCDF_V2_SYNTHETIC_WRITE: "0",
  SENTINELA_PERSISTENT_HOMOLOGATION: "0", SENTINELA_SANDBOX_WRITE: "0", SENTINELA_LOCAL_DEMO: "0",
  SENTINELA_LOCAL_READER_URL: "", SENTINELA_DATABASE_URL: "", SENTINELA_DATABASE_SSLROOTCERT: "", NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_TELEMETRY_DISABLED: "1" }
const output = process.env.SENTINELA_SPRINT4_EVIDENCE ?? "tmp/occurrence-persistence-evidence"
const viewport = [1440, 1024, 768, 320, 390]
const raId = "14791512-bdae-4197-96eb-1cd30ea90bb2"
const input = {
  data: "2025-08-06", horario: "11:23:00", cep: "70070010", endereco: "Endereço sintético via API", bairroOuSetor: "Setor de teste", raId,
  coordenadas: { latitude: -15.7942, longitude: -47.8825 },
  localizacaoConfirmada: true,
  naturezas: [],
  dadosCrime: { descricao: "Descrição sintética via API", meio: "outro", vitimas: 0, autores: 0 },
}
let browser
let prepared = false
const cookies = []

async function login(account) {
  const response = await fetch(origin + "/auth/login", { method: "POST", redirect: "manual",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: account.email, password }),
  })
  assert.equal(response.status, 303)
  const cookie = response.headers.get("set-cookie")?.split(";")[0]
  assert.match(cookie, /^sentinela-local-session=[0-9a-f]{64}$/)
  cookies.push(cookie)
  return cookie
}
function post(cookie, payload = input, key = randomUUID(), source = origin) {
  return fetch(api, { method: "POST", headers: { cookie, origin: source, "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) })
}
async function query(cookie, params) {
  const result = await fetch(read + "?" + new URLSearchParams(params), { headers: { cookie }, signal: AbortSignal.timeout(30000) })
  assert.equal(result.status, 200, JSON.stringify(params))
  return (await result.json()).data
}
async function startApp() {
  await freePort(3318)
  const child = run.start(env, "inherit")
  let online = false
  const deadline = Date.now() + 180000
  while (child.exitCode === null && Date.now() < deadline) {
    const response = await fetch(origin + "/login", { signal: AbortSignal.timeout(5000) }).catch(() => null)
    if (response?.status === 200) { online = true; break }
    await delay(350)
  }
  assert(online, "Next.js de homologação indisponível")
  run.proveListener()
}
try {
  await run.prepare()
  prepared = true
  await startApp()
  const [admin, oper, analyst] = await Promise.all(users.map(login))
  const catalogResponse = await fetch(api, { headers: { cookie: admin } })
  assert.equal(catalogResponse.status, 200)
  const catalogEnvelope = await catalogResponse.json()
  const catalog = catalogEnvelope.data
  assert.equal(catalog.regioes.length, 37)
  assert.equal(catalog.cadastroDisponivel, true)
  assert.deepEqual(catalog.naturezas.map(item => item.codigo), ["TESTE-A", "TESTE-B", "TESTE-C"])
  input.naturezas = catalog.naturezas.slice(0, 2).map(({ id }, index) => ({ naturezaId: id, crimeTentado: index === 0 ? true : null }))
  const searchCatalog = term => fetch(api + "?" + new URLSearchParams({ q: term }), { headers: { cookie: admin } })
  for (const [term, count, expected] of [["agua quente", "regioes", "RA-XXXV"], ["TESTE-A", "naturezas", "TESTE-A"],
    ["sintetica b", "naturezas", "TESTE-B"]]) {
    const found = await searchCatalog(term)
    assert.equal(found.status, 200)
    assert.deepEqual((await found.json()).data[count].map(item => item.codigo), [expected])
  }
  assert.deepEqual((await (await searchCatalog("sem resultado")).json()).data, { regioes: [], naturezas: [], cadastroDisponivel: true })
  assert.equal((await searchCatalog(" ")).status, 400)
  assert.equal((await fetch(api + "?q=a&q=b", { headers: { cookie: admin } })).status, 400)
  const operatorCatalog = await fetch(api, { headers: { cookie: oper } })
  assert.equal(operatorCatalog.status, 200)
  assert.deepEqual((await operatorCatalog.json()).data, catalog)
  assert.equal((await fetch(api, { headers: { cookie: analyst } })).status, 403)
  assert.equal((await post(analyst)).status, 403)
  assert.equal((await post(admin, input, randomUUID(), "http://127.0.0.1:3319")).status, 403)
  assert.equal((await post(admin, { ...input, coordenadas: null })).status, 422)
  assert.equal((await post(admin, { ...input, coordenadas: { latitude: 0, longitude: 0 } })).status, 422)
  assert.equal((await post(admin, { ...input, data: "2035-02-31" })).status, 422)
  for (const value of [undefined, false, "true"]) {
    assert.equal((await post(admin, { ...input, localizacaoConfirmada: value })).status, 422)
  }
  assert.equal((await post(admin, { ...input, naturezas: [] })).status, 422)
  assert.equal((await post(admin, { ...input, raId: randomUUID() })).status, 422)
  assert.equal((await post(admin, { ...input, cep: "70070-010" })).status, 422)
  assert.equal((await post(admin, { ...input, naturezas: [input.naturezas[0], input.naturezas[0]] })).status, 422)
  for (const suffix of [3, 4]) {
    const inacessivel = { naturezaId: `31000000-0000-4000-8000-00000000000${suffix}`, crimeTentado: false }
    assert.equal((await post(admin, { ...input, naturezas: [input.naturezas[0], inacessivel] })).status, 422)
  }
  const baseline = (await query(admin, { view: "manuais" })).total
  const rollbackKey = process.env.SENTINELA_MANUAL_ROLLBACK_KEY
  assert.match(rollbackKey, /^[a-f0-9-]{36}$/)
  assert.equal((await post(admin, input, rollbackKey)).status, 503)
  assert.equal((await query(admin, { view: "manuais" })).total, baseline)
  const key = randomUUID()
  const copies = await Promise.all([post(oper, input, key), post(oper, input, key)])
  assert.deepEqual(copies.map(response => response.status), [201, 201])
  const [registered, replay] = await Promise.all(copies.map(response => response.json()))
  assert.equal(registered.data.situacao, "em_revisao")
  assert.equal(registered.data.id, replay.data.id)
  assert.equal((await post(oper, { ...input, numero: "1" }, key)).status, 409)
  const detail = await query(analyst, { view: "detalhe", area: "manuais", id: registered.data.id })
  assert.equal(detail.endereco.endereco, input.endereco)
  assert.deepEqual(detail.dadosCrime, input.dadosCrime)
  assert.equal(detail.naturezas.length, 2)
  assert.deepEqual(detail.naturezas.map(item => item.crimeTentado), [true, null])
  console.log("API validada com os três perfis, rollback, idempotência e consulta.")

  browser = await chromium.launch({ channel: "msedge", headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1030 }, reducedMotion: "reduce" })
  const [name, value] = admin.split("=")
  await context.addCookies([{ name, value, url: origin }])
  await context.route("**/*", route => {
    const url = new URL(route.request().url())
    if (url.origin === origin) return route.continue()
    if (url.hostname === "viacep.com.br") {
      const number = url.pathname.split("/")[2]
      const address = { uf: "DF", cep: "70070-010", logradouro: "Logradouro de teste", bairro: "Setor sintético", localidade: "Brasília" }
      const fixtures = {
        99999999: { erro: true },
        70000000: { ...address, cep: "70000-000", logradouro: "", bairro: "" },
        70070011: { ...address, cep: "70070-011", logradouro: "Rua sem coordenadas", bairro: "" },
      }
      return route.fulfill({ json: fixtures[number] ?? address })
    }
    return route.abort()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(35000)
  await mkdir(output, { recursive: true })
  const capture = path => page.screenshot({ path: join(output, path),
    style: "nextjs-portal { display: none !important; }", animations: "disabled" })
  const states = await context.newPage()
  states.setDefaultTimeout(60000)
  states.setDefaultNavigationTimeout(120000)
  for (const { status, json, expected } of [
    { status: 200, json: { ...catalogEnvelope, data: { ...catalog, naturezas: [] } }, expected: "O catálogo de naturezas para cadastro manual está vazio." },
    { status: 200, json: { ...catalogEnvelope, data: { regioes: [], naturezas: [], cadastroDisponivel: true } }, expected: "O catálogo de Regiões Administrativas está vazio." },
    { status: 403, json: { error: {} }, expected: "Acesso ao catálogo negado para este perfil." },
    { status: 503, json: { error: { message: "Serviço de catálogo indisponível." } }, expected: "Serviço de catálogo indisponível." },
    { status: 200, json: { ...catalogEnvelope, data: { ...catalog, cadastroDisponivel: false } }, expected: "O PostgreSQL deste ambiente ainda não está qualificado para o cadastro." },
  ]) {
    const unqualified = json.data?.cadastroDisponivel === false
    await states.route(api, route => route.fulfill({ status, json }))
    await Promise.all([
      states.waitForResponse(response => response.url() === api && response.request().method() === "GET", { timeout: 120000 }),
      states.goto(origin + "/ocorrencias/nova"),
    ])
    assert.equal(await states.getByRole("heading", { name: "Naturezas associadas" }).count(), 0)
    if (json.data?.regioes.length === 0) await states.getByText(expected, { exact: true }).waitFor()
    const proceed = states.getByRole("button", { name: "Continuar", exact: true })
    assert(await proceed.isEnabled())
    await states.getByLabel("Data *", { exact: true }).fill("2025-08-04")
    await states.getByLabel("Horário *", { exact: true }).fill("12:00:05")
    await states.getByLabel("CEP *", { exact: true }).fill("70070-010")
    await states.getByLabel("Endereço *", { exact: true }).fill("Endereço sintético")
    await states.getByLabel("Bairro / Setor *", { exact: true }).fill("Setor sintético")
    await states.getByLabel("Latitude *", { exact: true }).fill("-15.7942")
    await states.getByLabel("Longitude *", { exact: true }).fill("-47.8825")
    await states.getByLabel("Região Administrativa *").selectOption("RA-I")
    await states.getByRole("button", { name: "Confirmar ponto no mapa" }).click()
    await proceed.click()
    await states.getByRole("heading", { name: "Dados do Crime", exact: true }).waitFor()
    const nature = states.getByRole("combobox", { name: "Natureza 1", exact: true })
    const submit = states.getByRole("button", { name: "Registrar ocorrência", exact: true })
    assert(await submit.isEnabled())
    if (unqualified) {
      const writes = []
      states.on("request", request => { if (request.url() === api && request.method() === "POST") writes.push(request) })
      await nature.fill("TESTE-A")
      await states.getByRole("option", { name: /TESTE-A/ }).click()
      await states.getByLabel("Tentativa 1").selectOption("nao-informada")
      await states.locator("#manual-descricao").fill("Rascunho de homologação")
      await states.locator("#manual-meio").selectOption("outro")
      await states.locator("#manual-vitimas").fill("0")
      await states.locator("#manual-autores").fill("0")
      await submit.click()
      await states.getByText(expected, { exact: true }).waitFor()
      assert.equal(writes.length, 0)
      assert.equal(await states.locator("#manual-descricao").inputValue(), "Rascunho de homologação")
    } else {
      if (json.data?.regioes.length !== 0) await states.getByText(expected, { exact: true }).waitFor()
      assert(await nature.isDisabled())
    }
    await states.unroute(api)
  }
  await states.close()
  await page.goto(origin + "/ocorrencias/nova")
  await page.getByRole("heading", { name: "Nova Ocorrência", exact: true }).waitFor()
  const map = page.getByRole("region", { name: "Mapa de ajuste da localização" })
  await map.locator(".leaflet-overlay-pane path").first().waitFor()
  const register = page.getByRole("button", { name: "Registrar ocorrência" })
  const advance = page.getByRole("button", { name: "Continuar", exact: true })
  const back = page.getByRole("button", { name: "Voltar", exact: true })
  const writeRequests = []
  page.on("request", request => {
    if (request.url() === api && request.method() === "POST") writeRequests.push(request)
  })
  assert.equal(await register.count(), 0)
  assert(await advance.isEnabled())
  const extras = page.getByRole("region", { name: "Detalhes complementares (opcional)" })
  await extras.getByLabel("Número", { exact: true }).waitFor()
  assert.equal(await extras.locator("summary").count(), 0)
  const requiredFields = ["data", "horario", "cep", "endereco", "bairroOuSetor", "regiao", "latitude", "longitude"]
  assert.equal(await page.locator("[id^='manual-'][id$='-erro']").count(), 0)
  await advance.click()
  assert.equal(await page.getByRole("heading", { name: "Dados do Crime" }).count(), 0)
  for (const key of requiredFields) {
    assert.equal(await page.locator(`#manual-${key}`).getAttribute("aria-invalid"), "true")
    await page.locator(`#manual-${key}-erro`).waitFor()
  }
  await page.waitForFunction(() => document.activeElement?.id === "manual-data")
  assert.equal(writeRequests.length, 0)
  const date = page.getByLabel("Data *", { exact: true })
  await date.fill("2025-08-04")
  assert.equal(await page.locator("#manual-data-erro").count(), 0)
  await date.click({ position: { x: 25, y: 16 } })
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Enter")
  assert.equal(await date.inputValue(), "2025-08-05")
  await page.getByLabel("Horário *", { exact: true }).fill("12:00:05")
  const cep = page.getByLabel("CEP *", { exact: true })
  const postalFeedback = page.locator("#manual-postal-status")
  const lat = page.getByLabel("Latitude *", { exact: true })
  const lon = page.getByLabel("Longitude *", { exact: true })
  const marker = map.locator(".leaflet-marker-icon")
  await cep.fill("700")
  assert.equal(await cep.getAttribute("aria-invalid"), "true")
  await cep.fill("99999-999")
  await postalFeedback.getByText(/CEP não encontrado/).waitFor()
  await cep.fill("70000-000")
  await postalFeedback.getByText(/CEP encontrado com endereço incompleto/).waitFor()
  assert.equal(await marker.count(), 0)
  await cep.fill("70070-011")
  await postalFeedback.getByText(/Coordenadas indisponíveis/).waitFor()
  assert.equal(await lat.inputValue(), "")
  await cep.fill("70070-010")
  await page.getByText("Localização aproximada. Ajuste ou confirme o ponto.", { exact: true }).waitFor()
  assert.equal(await lat.inputValue(), "-15.7942")
  const placed = await marker.boundingBox()
  const mapBounds = await map.boundingBox()
  assert(placed && mapBounds)
  assert(Math.abs(placed.x + placed.width / 2 - (mapBounds.x + mapBounds.width / 2)) < 5)
  assert(Math.abs(placed.y + placed.height / 2 - (mapBounds.y + mapBounds.height / 2)) < 5)
  await capture("cep-com-marcador-aproximado.png")
  const address = page.getByLabel("Endereço *", { exact: true })
  assert.equal(await address.inputValue(), "Logradouro de teste")
  assert.equal(await page.getByLabel("Região Administrativa *").inputValue(), "RA-I")
  await page.getByRole("button", { name: "Confirmar ponto no mapa" }).click()
  await page.getByRole("heading", { name: "Localização identificada" }).waitFor()
  await address.fill("Endereço digitado 45")
  await address.press("Enter")
  await page.getByText("Endereço digitado 45, Brasília, Distrito Federal", { exact: true }).waitFor()
  await address.fill("Endereço digitado de teste")
  await page.getByText("Ponto pendente de confirmação.", { exact: true }).waitFor()
  assert.equal(await page.getByLabel("Região Administrativa *").inputValue(), "")
  const search = page.getByRole("searchbox", { name: "Buscar endereço ou CEP" })
  assert.equal(await search.inputValue(), "Endereço digitado de teste")
  await search.fill("Logradouro sintético 45")
  await page.getByRole("button", { name: "Buscar localização", exact: true }).click()
  await page.getByText("Logradouro sintético 45, Brasília, Distrito Federal", { exact: true }).waitFor()
  await search.fill("Endereço ambíguo")
  await search.press("Enter")
  const matches = page.getByRole("list", { name: "Resultados da localização" })
  await matches.getByRole("button", { name: /Segundo resultado/ }).waitFor()
  assert.equal(await lat.inputValue(), "-15.7942")
  await matches.getByRole("button", { name: /Segundo resultado/ }).press("Enter")
  assert.equal(await lat.inputValue(), "-15.7961")
  await search.fill("Endereço sem coordenadas")
  await search.press("Enter")
  await page.getByText("Nenhum endereço encontrado no Distrito Federal.", { exact: true }).waitFor()
  assert.equal(await lat.inputValue(), "-15.7961")
  const endpoint = "**/api/ocorrencias/geocode"
  let releaseDelayed
  const delayed = new Promise(resolve => { releaseDelayed = resolve })
  await page.route(endpoint, async route => {
    await delayed
    await route.fulfill({ json: { results: [{ id: "obsoleto", label: "Resposta atrasada", latitude: -15.799,
      longitude: -47.883, approximate: true }] } }).catch(() => {})
  })
  await search.fill("Resposta atrasada")
  await Promise.all([page.waitForRequest(request => request.url().endsWith("/geocode")), search.press("Enter")])
  await lat.fill("-15.795")
  releaseDelayed()
  await page.unrouteAll({ behavior: "wait" })
  assert.equal(await lat.inputValue(), "-15.795")
  assert.equal(await page.getByText("Resposta atrasada", { exact: true }).count(), 0)
  await search.fill("70070-010")
  await page.getByText("Localização aproximada. Ajuste ou confirme o ponto.", { exact: true }).waitFor()
  assert.equal(await cep.inputValue(), "70070-010")
  await lat.waitFor()
  await page.waitForFunction(() => document.querySelector("#manual-latitude")?.value === "-15.7942")
  assert.equal(await address.inputValue(), "Endereço digitado de teste")
  assert.equal(await register.count(), 0)
  await page.getByRole("button", { name: "Confirmar ponto no mapa" }).click()
  await page.getByRole("heading", { name: "Localização identificada" }).waitFor()
  const pin = await marker.boundingBox()
  assert(pin)
  await page.mouse.move(pin.x + pin.width / 2, pin.y + pin.height / 2)
  await page.mouse.down()
  await page.mouse.move(pin.x + pin.width / 2 + 18, pin.y + pin.height / 2 - 12, { steps: 6 })
  await page.mouse.up()
  assert.notEqual(await lat.inputValue(), "-15.7942")
  await map.locator(".leaflet-control-zoom-in").click()
  await page.getByRole("button", { name: "Centralizar mapa" }).click()
  const beforeClick = await lon.inputValue()
  await map.locator(".leaflet-container").click({ position: { x: 120, y: 190 } })
  assert.notEqual(await lon.inputValue(), beforeClick)
  await lat.fill("0")
  await lon.fill("0")
  await page.getByText(/Ponto fora do território/).first().waitFor()
  await lat.fill("-15.7942")
  await lon.fill("-47.8825")
  await page.getByLabel("Região Administrativa *").selectOption("RA-II")
  await page.locator("#manual-territory").getByText(/diverge da RA selecionada/).waitFor()
  await page.getByRole("button", { name: "Usar RA identificada" }).click()
  assert.equal(await page.getByLabel("Região Administrativa *").inputValue(), "RA-I")
  await extras.getByLabel("Número", { exact: true }).fill("20")
  await extras.getByLabel("Complemento", { exact: true }).fill("Bloco A")
  await extras.getByLabel("Referência do local", { exact: true }).fill("Praça de teste")
  await page.getByLabel("Região Administrativa *").selectOption("RA-I")
  assert(await advance.isEnabled())
  await advance.click()
  await page.getByText("Confirme um ponto válido no mapa para continuar.").waitFor()
  assert.equal(writeRequests.length, 0)
  await page.getByRole("button", { name: "Confirmar ponto no mapa" }).click()
  await advance.click()
  await page.getByRole("heading", { name: "Dados do Crime", exact: true }).waitFor()
  const description = page.getByRole("textbox", { name: /Descrição do fato/ })
  await page.getByRole("heading", { name: "Informações adicionais", exact: true }).waitFor()
  const natureA = page.getByRole("combobox", { name: "Natureza 1", exact: true })
  assert(await register.isEnabled())
  await register.click()
  await page.waitForFunction(() => document.activeElement?.id === "manual-nature-0")
  for (const id of ["nature-0", "attempt-0", "descricao", "meio", "vitimas", "autores"]) {
    assert.equal(await page.locator(`#manual-${id}`).getAttribute("aria-invalid"), "true")
    await page.locator(`#manual-${id}-erro`).waitFor()
  }
  assert.equal(writeRequests.length, 0)
  await natureA.click()
  assert.equal(await page.getByRole("listbox").getByRole("option").count(), 3)
  await natureA.fill("teste-a")
  await page.getByRole("option", { name: "TESTE-A · Natureza sintetica A", exact: true }).waitFor()
  await capture("naturezas-por-codigo.png")
  await natureA.press("ArrowDown")
  await natureA.press("Enter")
  assert.equal(await natureA.inputValue(), "TESTE-A · Natureza sintetica A")
  await page.getByLabel("Tentativa 1").selectOption("nao-informada")
  await page.getByRole("button", { name: "Adicionar natureza" }).click()
  await page.getByRole("button", { name: "Remover natureza 2" }).click()
  await page.getByRole("button", { name: "Adicionar natureza" }).click()
  await page.getByRole("combobox", { name: "Natureza 2", exact: true }).fill("NATUREZA SINTETICA A")
  await page.getByRole("option", { name: "TESTE-A · Natureza sintetica A", exact: true }).click()
  assert.equal(await page.getByRole("combobox", { name: "Natureza 2", exact: true }).getAttribute("aria-expanded"), "false")
  await page.getByLabel("Tentativa 2").selectOption("nao-informada")
  await page.getByText("Revise as combinações de natureza e tentativa repetidas.", { exact: true }).waitFor()
  await register.click()
  assert.equal(writeRequests.length, 0)
  await page.getByRole("combobox", { name: "Natureza 2", exact: true }).fill("NATUREZA SINTETICA B")
  await page.getByRole("option", { name: "TESTE-B · Natureza sintetica B", exact: true }).click()
  await page.getByLabel("Tentativa 2").selectOption("consumado")
  assert(await register.isEnabled())
  await back.click()
  assert.equal(await address.inputValue(), "Endereço digitado de teste")
  assert.equal(await date.inputValue(), "2025-08-05")
  await page.getByRole("button", { name: "Cancelar", exact: true }).click()
  await page.getByRole("dialog", { name: "Descartar preenchimento?" }).getByRole("button", { name: "Continuar preenchendo" }).click()
  assert.equal(await address.inputValue(), "Endereço digitado de teste")
  await advance.click()
  assert.equal(await natureA.inputValue(), "TESTE-A · Natureza sintetica A")
  assert.equal(await page.getByLabel("Tentativa 2").inputValue(), "consumado")
  assert.equal(await description.getAttribute("aria-invalid"), "true")
  await description.fill("   ")
  assert.equal(await description.getAttribute("aria-invalid"), "true")
  await description.fill("Descrição sintética do fato.")
  assert.equal(await description.getAttribute("aria-invalid"), "false")
  await page.locator("#manual-meio").selectOption("veiculo")
  await page.locator("#manual-vitimas").fill("-1")
  await register.click()
  assert.equal(await page.locator("#manual-vitimas").getAttribute("aria-invalid"), "true")
  assert.equal(writeRequests.length, 0)
  await page.locator("#manual-vitimas").fill("0")
  await page.locator("#manual-autores").fill("2")
  await page.getByLabel("Observações adicionais").fill("Observação sintética do navegador")
  assert(await register.isEnabled())
  assert.equal(writeRequests.length, 0)
  await back.click()

  for (const width of viewport) {
    await page.setViewportSize({ width, height: 1030 })
    await page.locator("form[aria-label='Cadastro de ocorrência']").evaluate(element => { element.parentElement.scrollTop = 0 })
    const fits = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth <= innerWidth,
      form: document.querySelector("form[aria-label='Cadastro de ocorrência']").scrollWidth <=
        document.querySelector("form[aria-label='Cadastro de ocorrência']").clientWidth + 1,
    }))
    assert(fits.document && fits.form, `Overflow em ${width}px`)
    const boundaries = await page.locator("form[aria-label='Cadastro de ocorrência']").evaluate(form => {
      const address = form.querySelector("#manual-endereco").closest("section").getBoundingClientRect()
      const postal = form.querySelector("#manual-cep").getBoundingClientRect()
      const details = form.querySelector("#manual-extras").closest("section").getBoundingClientRect()
      const coordinates = form.querySelector("#manual-coordinates").closest("section").getBoundingClientRect()
      return { addressBottom: address.bottom, detailsTop: details.top, detailsBottom: details.bottom,
        coordinatesTop: coordinates.top, postalWidth: postal.width }
    })
    assert(boundaries.addressBottom <= boundaries.detailsTop && boundaries.detailsBottom <= boundaries.coordinatesTop, `Ordem incorreta em ${width}px`)
    assert(boundaries.postalWidth >= 100, `CEP sem espaço para exibir o valor completo em ${width}px`)
    await capture(`nova-ocorrencia-${width}.png`)
    await advance.click()
    await description.waitFor()
    assert(await page.locator("form[aria-label='Cadastro de ocorrência']").evaluate(form =>
      document.documentElement.scrollWidth <= innerWidth && form.scrollWidth <= form.clientWidth + 1), `Overflow na etapa 2 em ${width}px`)
    await capture(`dados-crime-${width}.png`)
    await back.click()
  }
  await map.scrollIntoViewIfNeeded()
  const mobilePin = await marker.boundingBox()
  const mobileCard = await page.getByRole("heading", { name: "Localização identificada" }).locator("..").boundingBox()
  assert(mobilePin && mobileCard && mobilePin.y + mobilePin.height <= mobileCard.y, "O cartão no celular encobre o marcador")
  await capture("nova-ocorrencia-390-mapa.png")
  await page.setViewportSize({ width: 1440, height: 1030 })
  await page.locator("form[aria-label='Cadastro de ocorrência']").evaluate(element => { element.parentElement.scrollTop = 0 })
  await page.getByRole("button", { name: "Ativar tema claro" }).click()
  assert.equal(await page.locator("html").getAttribute("data-theme"), "claro")
  await capture("nova-ocorrencia-claro.png")
  await search.fill("Endereço indisponível")
  await search.press("Enter")
  await page.getByText(/Serviço de localização indisponível/).waitFor()
  await advance.click()
  assert.equal(await description.inputValue(), "Descrição sintética do fato.")
  assert(await register.isEnabled())
  await register.click()
  await page.getByRole("heading", { name: "Ocorrência registrada" }).waitFor()
  const consult = page.getByRole("link", { name: "Consultar registro" })
  const createdId = new URL(await consult.getAttribute("href"), origin).searchParams.get("manual")
  assert.match(createdId, /^[a-f0-9-]{36}$/)
  await consult.click()
  const dialog = page.getByRole("dialog", { name: "Detalhes do cadastro manual" })
  await dialog.getByText("Endereço digitado de teste", { exact: true }).waitFor()
  for (const value of ["20", "Bloco A", "Praça de teste", "Descrição sintética do fato.", "Veículo", "0", "2", "Observação sintética do navegador", "Sim"])
    await dialog.getByText(value, { exact: true }).waitFor()
  await page.reload()
  await dialog.getByText("Endereço digitado de teste", { exact: true }).waitFor()
  await page.keyboard.press("Escape")
  const row = page.locator("#consulta-manuais").getByRole("row").filter({ hasText: createdId })
  await row.getByRole("button", { name: "Editar ocorrência", exact: true }).click()
  const edit = page.getByRole("dialog", { name: "Editar ocorrência" })
  assert.equal(await edit.locator("#manual-cep").inputValue(), "70070-010")
  assert.equal(await edit.locator("#manual-numero").inputValue(), "20")
  assert.equal(await edit.locator("#manual-complemento").inputValue(), "Bloco A")
  assert.equal(await edit.locator("#manual-referencia").inputValue(), "Praça de teste")
  await edit.getByRole("button", { name: "Confirmar ponto no mapa" }).click()
  await edit.getByRole("button", { name: "Continuar", exact: true }).click()
  assert.equal(await edit.locator("#manual-descricao").inputValue(), "Descrição sintética do fato.")
  assert.equal(await edit.locator("#manual-meio").inputValue(), "veiculo")
  assert.equal(await edit.locator("#manual-vitimas").inputValue(), "0")
  assert.equal(await edit.locator("#manual-autores").inputValue(), "2")
  assert.equal(await edit.locator("#manual-observacoes").inputValue(), "Observação sintética do navegador")
  await edit.locator("#manual-observacoes").fill("Observação revisada no navegador")
  await edit.getByLabel("Justificativa").fill("Alteração isolada de observação")
  await edit.getByRole("checkbox", { name: /Confirmo a atualização/ }).check()
  await edit.getByRole("button", { name: "Salvar alterações", exact: true }).click()
  await edit.waitFor({ state: "hidden" })
  const edited = await query(admin, { view: "detalhe", area: "manuais", id: createdId })
  assert.deepEqual(edited.dadosCrime, { descricao: "Descrição sintética do fato.", meio: "veiculo", vitimas: 0,
    autores: 2, observacoes: "Observação revisada no navegador" })
  assert.equal(edited.endereco.complemento, "Bloco A")
  assert.equal((await page.goto(origin + "/importar"))?.status(), 200)
  await page.getByRole("heading", { name: "Importação PCDF", exact: true }).waitFor()
  const touchContext = await browser.newContext({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 840 } })
  await touchContext.addCookies([{ name, value, url: origin }])
  await touchContext.route("**/*", route => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort())
  const touchPage = await touchContext.newPage()
  await touchPage.goto(origin + "/ocorrencias/nova")
  await touchPage.waitForFunction(() => {
    const map = document.querySelector(".leaflet-container")
    return matchMedia("(pointer: coarse)").matches && map && !map.classList.contains("leaflet-touch-drag")
  })
  await touchContext.close()
  await run.stop()
  cookies.length = 0
  await startApp()
  const newAnalyst = await login(users[2])
  const afterRestart = await query(newAnalyst, { view: "detalhe", area: "manuais", id: registered.data.id })
  assert.deepEqual(afterRestart, detail)
  assert.equal((await query(newAnalyst, { view: "manuais" })).total, baseline + 2)
  await writeFile(join(output, "browser.json"), JSON.stringify({
    result: "APROVADO", viewport, mobileTouch: true, nextRestart: true, lateRollback: true, profiles: users.map(user => user.role),
  }, null, 2))
  console.log("Edge homologado nas duas etapas em " + viewport.join(", ") + " px. Cadastro, detalhes e leitura após reinício confirmados.")
} finally {
  await browser?.close()
  for (const cookie of cookies) await fetch(origin + "/auth/logout", { method: "POST", redirect: "manual",
    headers: { origin, cookie, "content-type": "application/x-www-form-urlencoded" }, body: "",
    signal: AbortSignal.timeout(3000) }).catch(() => {})
  if (prepared) await run.finish()
}
