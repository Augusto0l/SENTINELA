// Isolated Next preview; no accounts, authentication bypass, SQL or real API data.
import "./contracts-runtime.mjs"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { chromium } from "playwright-core"
const { SYNTHETIC_CATALOGS: catalogs, syntheticRecord } = await import("../src/features/occurrences/simulation.ts")
const { catalogVersion } = await import("../src/contracts/common.ts")
// Optional public catalog projection produced by the authenticated sandbox SQL test.
const nativeCatalog = process.env.SENTINELA_BROWSER_CATALOG_EVIDENCE
  ? JSON.parse(await readFile(process.env.SENTINELA_BROWSER_CATALOG_EVIDENCE, "utf8")) : null
if (nativeCatalog) assert(nativeCatalog.result === "PASS" && nativeCatalog.scope === "sandbox-only" && nativeCatalog.catalog_items?.length === 37)
const getCatalogs = nativeCatalog ? { ...catalogs, regions: nativeCatalog.catalog_items } : catalogs
const origin = "http://127.0.0.1:3316", id = randomUUID(), output = "tmp/occurrence-workflows-" + id
let child, browser, serverLog = "", stage = "preflight"
const checks = [], errors = [], requests = []
const pass = name => checks.push({ name, result: "PASS" })
await mkdir(output, { recursive: true })
const originalNextEnv = await readFile("next-env.d.ts")
try {
  await new Promise((resolve, reject) => { const s = createServer(); s.once("error", reject); s.listen(3316, "127.0.0.1", () => s.close(resolve)) })
  await writeFile(`tmp/next-env-http-${id}.d.ts`, '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n')
  await writeFile(`tmp/tsconfig-http-${id}.json`, JSON.stringify({ extends: "../tsconfig.json", compilerOptions: { incremental: false }, include: ["../src/**/*.ts", "../src/**/*.tsx", `./next-env-http-${id}.d.ts`, `../.next-http-validation-${id}/types/**/*.ts`] }))
  const env = { ...process.env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", SENTINELA_HTTP_VALIDATION_ID: id,
    SENTINELA_AUTH_PROVIDER: "preview", SENTINELA_LOCAL_DEMO: "1", SENTINELA_APP_ORIGIN: origin,
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", SENTINELA_LOCAL_ACCOUNTS_FILE: "",
    SENTINELA_LOCAL_READER_URL: "", SENTINELA_DATABASE_URL: "", SENTINELA_DATABASE_SSLROOTCERT: "" }
  for (const key of Object.keys(env)) if (key.startsWith("PG")) delete env[key]
  child = spawn(process.execPath, ["scripts/next-cli.mjs", "dev", "--hostname", "127.0.0.1", "--port", "3316"], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
  for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { serverLog = (serverLog + data).slice(-20000) })
  let ready = false
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw Error("Owned preview server exited")
    try { if ((await fetch(origin + "/login", { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break } } catch { /* Owned startup only. */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  assert(ready)
  browser = await chromium.launch({ channel: "chrome", headless: true })
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } })
  page.on("pageerror", e => errors.push(e.message))
  page.on("request", r => { if (new URL(r.url()).origin === origin && r.url().includes("/api/")) requests.push({ method: r.method(), path: new URL(r.url()).pathname }) })
  let empty = true
  const envelope = data => ({ success: true, data, meta: { contractVersion: "0.1.0", catalogVersion, execution: { mode: "operacional", persisted: true } } })
  const fixture = syntheticRecord()
  const occurrence = { id: fixture.id, origem: "manual", fonte: "BROWSER-SYNTHETIC-ONLY", anoRegistro: null, unidadeRegistro: null, numeroRegistro: null,
    identidadeStatus: "manual", data: fixture.values.data, horario: fixture.values.horario, local: fixture.values.local,
    latitude: -15.79, longitude: -47.88, localizacaoStatus: "referencia_pendente", consolidacaoStatus: "consolidada", ativo: true, versao: "1",
    criadoEm: "2026-11-12T12:00:00Z", atualizadoEm: "2026-11-12T12:00:00Z", ra: { id: getCatalogs.regions[0].id, codigo: "SYNTHETIC", nome: catalogs.regions[0].nome },
    naturezas: [{ id: randomUUID(), crimeTentado: null, classificacaoStatus: "pendente", natureza: { id: catalogs.natures[0].id, descricao: catalogs.natures[0].descricao, categoriaOriginal: null }, categoria: null }] }
  await page.route("**/api/v1/ocorrencias**", async route => {
    const url = new URL(route.request().url())
    await route.fulfill({ json: envelope(url.pathname === "/api/v1/ocorrencias" ? { items: [occurrence], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } } : occurrence) })
  })
  await page.route("**/api/v1/catalogos/**", async route => {
    const region = route.request().url().includes("regioes-administrativas")
    await route.fulfill({ json: envelope({ items: empty ? [] : region ? getCatalogs.regions : catalogs.natures }) })
  })
  await page.route("https://tile.openstreetmap.org/**", route => route.abort())
  stage = "create_empty_catalog"
  await page.goto(origin + "/ocorrencias/nova")
  await page.getByText("Catálogo persistente vazio.", { exact: false }).waitFor()
  assert(await page.getByRole("button", { name: "Simular cadastro", exact: true }).isDisabled())
  pass("empty_get_catalog_blocks_submission_without_automatic_mock")
  await page.getByRole("button", { name: "Usar cenário sintético explícito" }).click()
  await page.getByLabel("Data *", { exact: true }).fill("2026-11-12")
  await page.getByLabel("Horário *", { exact: true }).fill("12:00:00")
  await page.getByLabel("Endereço, bairro ou setor do fato *", { exact: true }).fill("Endereço SINTÉTICO de teste visual")
  await page.getByLabel("Região Administrativa *", { exact: true }).selectOption(catalogs.regions[0].id)
  await page.getByLabel("Natureza 1", { exact: true }).selectOption(catalogs.natures[0].id)
  await page.getByLabel("Latitude (opcional)", { exact: true }).fill("0")
  await page.getByLabel("Longitude (opcional)", { exact: true }).fill("0")
  await page.getByText("Ponto fora do território representado", { exact: false }).waitFor()
  await page.getByRole("button", { name: "Simular cadastro", exact: true }).click()
  await page.getByRole("alert").filter({ hasText: "Ponto fora do território" }).waitFor()
  assert.equal(await page.getByLabel("Latitude (opcional)", { exact: true }).inputValue(), "0")
  await page.getByLabel("Latitude (opcional)", { exact: true }).fill("-15.79")
  await page.getByLabel("Longitude (opcional)", { exact: true }).fill("-47.88")
  await page.getByText("Ponto consistente com a RA", { exact: false }).waitFor()
  await page.getByLabel("Região Administrativa *", { exact: true }).selectOption(catalogs.regions[1].id)
  await page.getByText("Coordenadas divergentes da RA", { exact: false }).waitFor()
  await page.getByRole("button", { name: "Simular cadastro", exact: true }).click()
  await page.getByRole("alert").filter({ hasText: "Coordenadas divergentes" }).waitFor()
  assert.equal(await page.getByLabel("Latitude (opcional)", { exact: true }).inputValue(), "-15.79")
  await page.getByLabel("Região Administrativa *", { exact: true }).selectOption(catalogs.regions[0].id)
  await page.getByText("Ponto consistente com a RA", { exact: false }).waitFor()
  pass("uuid_binding_consistent_mismatch_blocks_and_preserves_fields")

  await page.getByText("Ajustar localização no mapa (opcional)", { exact: true }).click()
  const map = page.getByRole("region", { name: "Mapa de ajuste da localização" }).locator(".leaflet-container")
  await map.waitFor({ state: "visible" })
  assert.equal(await page.getByLabel("Latitude (opcional)", { exact: true }).inputValue(), "-15.79")
  const bounds = await map.boundingBox()
  await map.scrollIntoViewIfNeeded()
  const visibleBounds = await map.boundingBox()
  await page.mouse.click(visibleBounds.x + bounds.width * .55, visibleBounds.y + bounds.height * .45)
  assert(Number.isFinite(Number(await page.getByLabel("Latitude (opcional)", { exact: true }).inputValue())))
  assert.equal(await page.getByLabel("Região Administrativa *", { exact: true }).inputValue(), catalogs.regions[0].id)
  await page.getByText("Ajustar localização no mapa (opcional)", { exact: true }).click()
  pass("territorial_feedback_outside_blocks_values_preserved_correctable_map_no_automatic_ra")
  await page.getByRole("button", { name: "Adicionar natureza" }).click()
  await page.getByLabel("Natureza 2", { exact: true }).selectOption(catalogs.natures[0].id)
  await page.getByRole("button", { name: "Simular cadastro", exact: true }).click()
  await page.getByRole("alert").filter({ hasText: "Não repetir" }).waitFor()
  await page.getByLabel("Natureza 2", { exact: true }).selectOption(catalogs.natures[1].id)
  await page.getByRole("button", { name: "Simular cadastro", exact: true }).click()
  await page.getByText("Simulação concluída.", { exact: false }).waitFor()
  pass("create_two_natures_validation_and_explicit_non_persistent_success")
  stage = "edit"
  await page.getByLabel("Cenário do registro", { exact: true }).selectOption("regular")
  await page.getByRole("button", { name: "Editar prévia demonstrativa" }).click()
  await page.getByLabel("Endereço, bairro ou setor do fato *", { exact: true }).fill("Edição SINTÉTICA visual")
  await page.getByLabel("Justificativa da edição *", { exact: true }).fill("Homologação demonstrativa")
  await page.getByLabel("Resultado de homologação", { exact: true }).selectOption("conflict")
  await page.getByRole("button", { name: "Simular edição", exact: true }).click()
  await page.getByText("Conflito de versão simulado.", { exact: false }).waitFor()
  await page.getByLabel("Resultado de homologação", { exact: true }).selectOption("normal")
  await page.getByRole("button", { name: "Simular edição", exact: true }).click()
  await page.getByText("Versão esperada: 2", { exact: false }).waitFor()
  pass("edit_expected_version_conflict_and_preview_only_success")
  stage = "inactivate"
  await page.getByRole("button", { name: "Inativar prévia demonstrativa" }).click()
  let dialog = page.getByRole("dialog", { name: "Simular inativação lógica", exact: true })
  await dialog.getByRole("button", { name: "Cancelar inativação" }).click()
  assert.equal(await page.getByRole("dialog").count(), 0)
  await page.getByRole("button", { name: "Inativar prévia demonstrativa" }).click()
  dialog = page.getByRole("dialog", { name: "Simular inativação lógica", exact: true })
  assert(await dialog.getByRole("button", { name: "Confirmar simulação de inativação" }).isDisabled())
  await dialog.getByRole("checkbox").check()
  await dialog.getByRole("button", { name: "Confirmar simulação de inativação" }).click()
  await dialog.getByRole("alert").waitFor()
  await dialog.getByLabel("Justificativa obrigatória").fill("Teste visual sem gravação")
  await dialog.getByRole("button", { name: "Confirmar simulação de inativação" }).dblclick()
  await page.getByText("Versão esperada: 3", { exact: false }).waitFor()
  assert(await page.getByRole("button", { name: "Inativar prévia demonstrativa" }).isDisabled())
  pass("inactivate_confirmation_reason_cancel_and_double_submission_guard")
  stage = "responsive"
  // Return to regular fixture and form before checking all viewport/theme pairs.
  await page.getByLabel("Cenário do registro", { exact: true }).selectOption("review")
  assert(await page.getByRole("button", { name: "Editar prévia demonstrativa" }).isDisabled())
  await page.getByLabel("Cenário do registro", { exact: true }).selectOption("regular")
  await page.getByRole("button", { name: "Editar prévia demonstrativa" }).click()
  for (const width of [1366, 768, 390, 320]) for (const theme of ["claro", "escuro"]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
    await page.screenshot({ path: `${output}/form-${width}-${theme}.png`, fullPage: true })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    assert.equal(overflow, false, `viewport ${width} ${theme}`)
    const form = page.getByRole("region", { name: "Simulação de ocorrências" })
    const bounds = await form.boundingBox(); assert(bounds.width <= width)
    await page.getByLabel("Justificativa da edição *", { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/form-bottom-${width}-${theme}.png`, fullPage: true })
  }
  pass("four_viewports_both_themes_no_document_overflow_screenshots")
  await page.getByLabel("Endereço, bairro ou setor do fato *", { exact: true }).focus(); await page.keyboard.press("Tab")
  assert(await page.evaluate(() => document.activeElement.tagName !== "BODY"))
  await page.getByRole("button", { name: "Cancelar", exact: true }).click()
  // Unchanged form may cancel immediately; dirty edits require explicit discard.
  if (await page.getByRole("dialog").count()) await page.getByRole("button", { name: "Descartar", exact: true }).click()
  pass("keyboard_focus_and_cancel")
  stage = "get_details_copy_isolation"
  empty = false
  await page.goto(origin + "/ocorrencias")
  await page.getByRole("button", { name: "Ver detalhes de " + fixture.id }).click()
  const details = page.getByRole("dialog", { name: "Detalhes da ocorrência", exact: true })
  await details.getByText("Simular edição ou inativação de uma cópia", { exact: true }).click()
  await details.getByText("Catálogos persistentes disponíveis.", { exact: true }).waitFor()
  await details.getByRole("button", { name: "Editar prévia demonstrativa" }).click()
  await details.getByText("Referência territorial pendente", { exact: false }).waitFor()
  assert.equal(await details.getByLabel("Região Administrativa *", { exact: true }).inputValue(), getCatalogs.regions[0].id)
  pass("operational_scope_never_uses_synthetic_uuid_binding")
  await details.getByLabel("Endereço, bairro ou setor do fato *", { exact: true }).fill("Cópia VISUAL; original GET inalterado")
  await details.getByLabel("Justificativa da edição *", { exact: true }).fill("Somente prévia demonstrativa")
  await details.getByRole("button", { name: "Simular edição", exact: true }).click()
  await details.getByText("Versão esperada: 2", { exact: false }).waitFor()
  await details.getByRole("button", { name: "Fechar detalhes" }).click()
  await page.getByRole("button", { name: "Ver detalhes de " + fixture.id }).click()
  await page.getByRole("dialog", { name: "Detalhes da ocorrência", exact: true }).getByText(fixture.values.local, { exact: true }).first().waitFor()
  assert.equal(occurrence.versao, "1"); assert.equal(occurrence.local, fixture.values.local)
  pass("real_get_shape_catalogs_detail_copy_never_changes_original_or_list")
  assert.equal(errors.length, 0)
  assert(requests.length > 0); assert(requests.every(r => r.method === "GET"))
  pass("all_api_requests_get_only_no_database_or_sandbox_transport")
  console.log(JSON.stringify({ result: "PASS", scope: "existing-preview-admin-no-authenticated-user", checks, requests, errors, output }))
  await writeFile(`${output}/result.json`, JSON.stringify({ result: "PASS", catalogEvidence: nativeCatalog ? "native-sandbox-projection" : "static-synthetic", checks, requests, errors }, null, 2))
} catch (error) {
  await writeFile(`${output}/result.json`, JSON.stringify({ result: "FAIL", stage, message: String(error.message).slice(0, 1000), checks }, null, 2))
  console.error("FAIL workflow browser stage: " + stage); process.exitCode = 1
} finally {
  if (browser) await browser.close()
  if (child && child.exitCode === null) await new Promise(resolve => spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("close", resolve))
  await writeFile("next-env.d.ts", originalNextEnv)
  await writeFile(`${output}/server.log`, serverLog)
}
