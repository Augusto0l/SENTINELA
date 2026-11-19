import assert from "node:assert/strict"
import { randomBytes, randomUUID, scryptSync, createHash } from "node:crypto"
import { spawn, spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { readFile, writeFile, unlink } from "node:fs/promises"
import { setTimeout as delay } from "node:timers/promises"
import { chromium } from "playwright-core"
import { freePort, processProof, listenerProof } from "../../../scripts/homologate-local-reader.mjs"
const { attestManifest } = await import("./service.ts")

const {config, subjects, analyst, pcdf} = JSON.parse(await new Promise(resolve => {
  let text = ""
  process.stdin.setEncoding("utf8").on("data", value => { text += value }).on("end", () => resolve(text))
}))
const origin = "http://127.0.0.1:3317"
const password = randomBytes(32).toString("hex")
const profiles = ["Administrador", "Operador", "Analista"]
const accounts = profiles.map((role, i) => {
  const salt = randomBytes(16).toString("hex")
  return { email: `isolated-${i}@example.test`, subject: subjects[i], role, salt, hash: scryptSync(password, Buffer.from(salt, "hex"), 64).toString("hex") }
})
const accountsFile = join(dirname(config.manifest), "next-accounts.json")
const id = randomUUID()
const types = "next-env.d.ts"
const previousTypes = await readFile(types).catch(() => null)
const checks = []
const sessionFiles = []
let child, identity, browser, stage = "preflight", ownedAccounts = false, stopped = true
let result
try {
  await attestManifest(config)
  await freePort()
  await writeFile(accountsFile, JSON.stringify({ accounts }), { flag: "wx" })
  ownedAccounts = true
  await writeFile(`tmp/tsconfig-http-${id}.json`, JSON.stringify({
    extends: "../tsconfig.json", compilerOptions: { incremental: false },
    include: ["../src/**/*.ts", "../src/**/*.tsx", `../.next-http-validation-${id}/dev/types/**/*.ts`],
  }))
  const env = { ...process.env, NODE_ENV: "development", SENTINELA_AUTH_PROVIDER: "local",
    SENTINELA_APP_ORIGIN: origin, SENTINELA_LOCAL_ACCOUNTS_FILE: accountsFile,
    SENTINELA_SANDBOX_WRITE: "1", SENTINELA_SANDBOX_WRITE_ID: config.expectedUUID,
    SENTINELA_SANDBOX_PCDF: pcdf ? "1" : "",
    SENTINELA_SANDBOX_ADMIN_PASSWORD: config.credentials.Administrador.password,
    SENTINELA_SANDBOX_OPERATOR_PASSWORD: config.credentials.Operador.password,
    SENTINELA_SANDBOX_ANALYST_PASSWORD: analyst,
    SENTINELA_HTTP_VALIDATION_ID: id, SENTINELA_LOCAL_READER_URL: "", SENTINELA_DATABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "", PGHOST: "", PGPASSWORD: "" }
  stage = "next_start"
  child = spawn(process.execPath, ["scripts/next-cli.mjs", "dev", "--port", "3317"], { env, stdio: "ignore", windowsHide: true })
  stopped = false
  child.on("error", () => {})
  identity = processProof(child.pid)
  const deadline = Date.now() + 120000
  let ready = false
  while (!ready && Date.now() < deadline && child.exitCode === null) {
    try { ready = (await fetch(origin + "/login", { signal: AbortSignal.timeout(3000) })).ok } catch { /* wait for startup */ }
    if (!ready) await delay(500)
  }
  assert(ready)
  listenerProof(child.pid)

  const postAuth = (action, values, cookie) => fetch(origin + "/auth/" + action, {
    method: "POST", redirect: "manual",
    headers: { origin, "content-type": "application/x-www-form-urlencoded", ...(cookie && { cookie }) },
    body: new URLSearchParams(values),
  })
  const root = "/api/v1/ocorrencias"
  const payload = { data: "2026-11-11", horario: "12:34:56", local: "Endereço sintético Next.js",
    endereco: "Via sintética, 45", bairroOuSetor: "Setor sintético", raId: "11000000-0000-4000-8000-000000000001",
    coordenadas: { latitude: -15.79, longitude: -47.88 },
    naturezas: [1, 2].map(number => ({ naturezaId: "31000000-0000-4000-8000-00000000000" + number, crimeTentado: null })),
  }
  const send = (path, method, data, cookie, site = origin, key = randomUUID()) => fetch(origin + path, {
    method, headers: { origin: site, "content-type": "application/json", "idempotency-key": key, ...(cookie && { cookie }) },
    body: JSON.stringify(data), signal: AbortSignal.timeout(60000),
  })
  const openForm = async (token, path = "/ocorrencias/nova") => {
    browser ??= await chromium.launch({ channel: "msedge", headless: true })
    const context = await browser.newContext()
    await context.addCookies([{ name: "sentinela-local-session", value: token, url: origin, httpOnly: true }])
    const page = await context.newPage()
    await page.goto(origin + path, { timeout: 90000 })
    return page
  }
  const fillFields = async (page, local = payload.local) => {
    for (const [name, value] of Object.entries({ data: payload.data, horario: payload.horario, local, endereco: payload.endereco, bairro: payload.bairroOuSetor,
      latitude: payload.coordenadas.latitude, longitude: payload.coordenadas.longitude })) {
      await page.locator(`[name=${name}]`).fill(String(value))
    }
    await page.locator('[name=ra]').selectOption(payload.raId)
    for (const link of payload.naturezas) await page.locator(`[value="${link.naturezaId}"]`).check()
  }
  const submitForm = async (page, path, method, label, status, writer, notice = /Registro sintético gravado no cluster isolado/) => {
    const response = page.waitForResponse(r => r.url() === origin + path && r.request().method() === method, { timeout: 60000 })
    await page.getByRole("button", { name: label }).click()
    const receipt = await response
    assert.equal(receipt.status(), status)
    assert.equal((await receipt.json()).data.atorSintetico, writer)
    await page.getByText(notice).waitFor({ timeout: 60000 })
  }
  const pcdfPath = "/api/v1/importacoes/pcdf"
  const reviewPath = "/api/v1/central-revisao"
  const uploadPath = pcdfPath + "?competencia=2026-01"
  const uploadCsv = (value, cookie) => fetch(origin + uploadPath, {
    method: "POST", headers: { origin, cookie, "content-type": "text/csv" }, body: value,
    signal: AbortSignal.timeout(60000),
  })
  let reviewTarget
  const correction = { decisao: "resolvida", versaoEsperada: "1", valor: "12:34:56", justificativa: "Conferência sintética" }
  async function uploadInBrowser(token, content, status, notice) {
    const page = await openForm(token, "/importar")
    const response = page.waitForResponse(r => r.url() === origin + uploadPath && r.request().method() === "POST")
    await page.getByLabel("Competência").fill("2026-01")
    await page.getByLabel("Arquivo CSV").setInputFiles({ name: "pcdf_naturezas_2026-01.csv",
      mimeType: "text/csv", buffer: Buffer.from(content) })
    await page.getByRole("button", { name: "Enviar CSV" }).click()
    assert.equal((await response).status(), status)
    await page.getByText(notice).waitFor()
    return page
  }
  assert.equal((await send(root, "POST", payload)).status, 401)
  checks.push("no_session_401")
  async function verifyPcdf(index, account, cookie, token) {
    if (!pcdf) return
    stage = "pcdf_" + account.role
    if (index === 0) {
      if (pcdf.analytics) {
        const empty = await fetch(origin + "/api/v1/analytics/persistente", { headers: { cookie } })
        assert.equal(empty.status, 200)
        const { data } = await empty.json()
        assert.equal(data.total, 0)
        assert.deepEqual(data.points, [])
        checks.push("pcdf_empty_before_first_promotion")
      }
      const rejected = await uploadCsv("invalid csv", cookie)
      assert.equal(rejected.status, 422)
      const page = await uploadInBrowser(token, pcdf.upload, 201, /1 linhas em staging/)
      await page.context().close()
      const filtered = await fetch(origin + reviewPath + "?tipo=datas_horarios&status=aberta", { headers: { cookie } })
      assert.equal(filtered.status, 200)
      const { data } = await filtered.json()
      assert.equal(data.length, 1)
      reviewTarget = data[0].id
      assert.equal(data[0].original, "")
      assert.equal(data[0].normalized, null)
      assert.equal((await send(reviewPath + "/" + reviewTarget, "PATCH", { ...correction, valor: "24:00:00" }, cookie)).status, 422)
      const review = await openForm(token, "/central-revisao")
      await review.getByRole("button", { name: "Detalhar horario", exact: true }).click()
      await review.getByLabel("Novo valor").fill("12:34:56")
      await review.getByLabel("Justificativa").fill(correction.justificativa)
      const done = review.waitForResponse(r => r.url() === origin + reviewPath + "/" + reviewTarget &&
        r.request().method() === "PATCH")
      await review.getByRole("button", { name: "Confirmar decisão" }).click()
      const result = await done
      assert.equal(result.status(), 200)
      const { data: corrected } = await result.json()
      assert.equal(corrected.history.author, account.subject)
      assert.equal(corrected.normalized, correction.valor)
      await review.getByText("Decisão registrada no histórico.").waitFor()
      assert.equal((await send(reviewPath + "/" + reviewTarget, "PATCH", correction, cookie)).status, 409)
      const flags = await fetch(origin + reviewPath + "?tipo=informacoes_policiais&status=aberta", { headers: { cookie } })
      assert.equal(flags.status, 200)
      const { data: issues } = await flags.json()
      const flag = issues.find(issue => issue.field === "flagrante")
      assert.equal(flag.original, "?")
      assert.equal(flag.canResolve, true)
      assert.equal((await send(reviewPath + "/" + flag.id, "PATCH", { ...correction, valor: "maybe" }, cookie)).status, 422)
      const accepted = await send(reviewPath + "/" + flag.id, "PATCH", { ...correction, valor: "true" }, cookie)
      assert.equal(accepted.status, 200)
      assert.equal((await accepted.json()).data.normalized, "true")
      await review.context().close()
      checks.push("pcdf_browser_upload_and_admin_review_with_conflict")
    } else if (index === 1) {
      assert.equal((await send(reviewPath + "/" + reviewTarget, "PATCH", correction, cookie)).status, 403)
      assert.equal((await send(pcdfPath + "/" + pcdf.run + "/consolidacao", "POST", {}, cookie, "http://localhost:3317")).status, 403)
      const page = await uploadInBrowser(token, pcdf.csv, 200, /Arquivo já recebido/)
      const lot = page.getByRole("article").filter({ hasText: pcdf.lot })
      await lot.getByRole("button", { name: "Consolidar grupos aprovados" }).click()
      await page.getByText(/1 novas ocorrências, 2 novas associações e 0 linhas ainda pendentes/).waitFor()
      await lot.getByText(/2 linhas · 2 consolidadas/).waitFor()
      const replay = await send(pcdfPath + "/" + pcdf.run + "/consolidacao", "POST", {}, cookie)
      assert.equal(replay.status, 200)
      assert.equal((await replay.json()).data.occurrencesCreated, 0)
      await page.context().close()
      checks.push("pcdf_browser_replay_operator_promotion_and_denied_review")
    } else {
      assert.equal((await uploadCsv(pcdf.csv, cookie)).status, 403)
      assert.equal((await send(pcdfPath + "/" + pcdf.run + "/consolidacao", "POST", {}, cookie)).status, 403)
      assert.equal((await send(reviewPath + "/" + reviewTarget, "PATCH", correction, cookie)).status, 403)
      const page = await openForm(token, "/central-revisao")
      await page.getByLabel("Situação").selectOption("resolvida")
      await page.getByRole("button", { name: "Aplicar filtros" }).click()
      await page.getByRole("button", { name: "Detalhar horario", exact: true }).click()
      await page.getByText(correction.justificativa, { exact: true }).waitFor()
      await page.getByText("Ocorrência consolidada", { exact: true }).waitFor()
      assert.equal(await page.getByRole("button", { name: "Confirmar decisão" }).count(), 0)
      await page.context().close()
      checks.push("pcdf_browser_analyst_read_only")
      if (pcdf.analytics) {
        stage = "pcdf_analytics_and_list"
        const apiPath = "/api/v1/analytics/persistente"
        const get = path => fetch(origin + path, { headers: { cookie } })
        const response = await get(apiPath)
        assert.equal(response.status, 200)
        const { scope, data } = await response.json()
        assert.equal(scope, "sandbox-synthetic-only")
        assert.equal(data.total, 1)
        assert.equal(data.byNature.length, 2)
        assert.deepEqual(data.byCategory, [{ key: "Categoria de ensaio", count: 1 }])
        assert.deepEqual(data.timeline, [{ key: "2026-01", count: 1 }])
        assert.equal(data.hour, 12)
        assert.deepEqual(data.points, [])
        assert.deepEqual(data.heatReference, [])
        const mismatch = await get(apiPath + "?startDate=2026-02-01&hour=12-18")
        assert.equal(mismatch.status, 200)
        assert.equal((await mismatch.json()).data.total, 0)
        const list = await openForm(token, "/ocorrencias")
        const imported = list.getByText("PCDF consolidada", { exact: true })
        await imported.waitFor({ timeout: 60000 })
        assert.equal(await imported.count(), 1)
        const dashboard = await list.context().newPage()
        await dashboard.goto(origin + "/dashboard", { timeout: 90000 })
        await dashboard.getByText("Categoria de ensaio · 1", { exact: true }).waitFor({ timeout: 60000 })
        const map = await list.context().newPage()
        const mapData = map.waitForResponse(r => new URL(r.url()).pathname === apiPath, { timeout: 90000 })
        await map.goto(origin + "/mapa-criminal", { timeout: 90000 })
        const mapResponse = await mapData
        assert.equal(mapResponse.status(), 200)
        assert.equal((await mapResponse.json()).data.mapTotal, data.total)
        await map.getByRole("heading", { name: "Mapa Criminal", level: 1 }).waitFor()
        await list.context().close()
        checks.push("pcdf_analytics_counts_and_browser_consistency")
      }
    }
  }
  for (const [index, account] of accounts.entries()) {
    stage = "http_" + account.role
    const login = await postAuth("login", { email: account.email, password })
    assert.equal(login.status, 303)
    const cookieHeader = login.headers.get("set-cookie") ?? ""
    assert.match(cookieHeader, /;\s*HttpOnly(?:;|$)/i)
    assert.match(cookieHeader, /;\s*SameSite=Strict(?:;|$)/i)
    const cookie = cookieHeader.split(";")[0]
    assert.match(cookie, /^sentinela-local-session=[0-9a-f]{64}$/)
    const token = cookie.slice("sentinela-local-session=".length)
    sessionFiles.push(join(dirname(accountsFile), "sentinela-sessions", createHash("sha256").update(token).digest("hex") + ".json"))
    if (index !== 2) await verifyPcdf(index, account, cookie, token)
    if (account.role === "Analista") {
      assert.equal((await send(root, "POST", payload, cookie)).status, 403)
      assert.equal((await send(root + "/51000000-0000-4000-8000-000000000006", "PATCH", {}, cookie)).status, 403)
      assert.equal((await send(root + "/51000000-0000-4000-8000-000000000006/inativacao", "POST", {}, cookie)).status, 403)
      const page = await openForm(token, "/ocorrencias")
      await page.getByRole("heading", { name: "Ocorrências sintéticas" }).waitFor()
      const row = page.getByRole("row").filter({ hasText: "51000000-0000-4000-8000-000000000006" })
      await row.getByText("Inativa", { exact: true }).waitFor()
      assert.equal(await page.getByRole("button", { name: "Editar", exact: true }).count(), 0)
      await page.context().close()
    } else {
      assert.equal((await send(root, "POST", payload, cookie, "http://localhost:3317")).status, 403)
      assert.equal((await send(root, "POST", { ...payload, ator: "forged" }, cookie)).status, 422)
      const writer = index === 0 ? "sentinela_sbx_admin" : "sentinela_sbx_operator"
      if (index === 0) {
        const key = randomUUID()
        const created = await send(root, "POST", payload, cookie, origin, key)
        assert.equal(created.status, 201)
        const receipt = await created.json()
        assert.equal(receipt.data.atorSintetico, writer)
        const replay = await send(root, "POST", payload, cookie, origin, key)
        assert.equal(replay.status, 201)
        assert.deepEqual(await replay.json(), receipt)
        assert.equal((await send(root, "POST", { ...payload, endereco: "Outro endereço" }, cookie, origin, key)).status, 409)
        checks.push("structured_address_idempotency")
      }
      stage = "browser_create_" + account.role
      const createPage = await openForm(token)
      await fillFields(createPage)
      await submitForm(createPage, root, "POST", "Gravar ocorrência sintética", 201, writer)
      await createPage.context().close()
      checks.push("browser_create_" + account.role)
      const fixture = root + "/51000000-0000-4000-8000-000000000006"
      const version = index === 0 ? "2" : "3"
      const change = { versaoEsperada: version, justificativa: "Homologação sintética Next",
        alteracoes: { local: "Local atualizado Next " + index, endereco: "Endereço atualizado " + index, bairroOuSetor: "Setor sintético" } }
      if (index === 0) {
        stage = "browser_edit_Administrador"
        const page = await openForm(token, "/ocorrencias")
        const row = page.getByRole("row").filter({ hasText: fixture.split("/").at(-1) })
        await row.getByRole("button", { name: "Editar", exact: true }).click()
        assert.equal(await page.locator('[name=versao]').inputValue(), version)
        await fillFields(page, change.alteracoes.local)
        await page.locator('[name=endereco]').fill(change.alteracoes.endereco)
        await page.locator('[name=motivo]').fill(change.justificativa)
        await submitForm(page, fixture, "PATCH", "Gravar ocorrência sintética", 200, writer, "Ocorrência atualizada.")
        await page.context().close()
        checks.push("browser_edit_Administrador")
      } else {
        const edited = await send(fixture, "PATCH", change, cookie)
        assert.equal(edited.status, 200)
        assert.equal((await edited.json()).data.atorSintetico, writer)
      }
      assert.equal((await send(fixture, "PATCH", change, cookie)).status, 409)
      if (index === 1) {
        stage = "browser_edit"
        const page = await openForm(token, "/ocorrencias")
        const logicalId = fixture.split("/").at(-1)
        const row = page.getByRole("row").filter({ hasText: logicalId })
        await row.getByRole("button", { name: "Editar", exact: true }).click()
        assert.equal(await page.locator('[name=versao]').inputValue(),"4")
        assert.equal(await page.locator('[name=endereco]').inputValue(),"Endereço atualizado 1")
        await page.locator('[name=motivo]').fill("Edição do formulário isolado")
        await page.locator('[name=endereco]').fill("Endereço editado no navegador")
        await submitForm(page, fixture, "PATCH", "Gravar ocorrência sintética", 200, writer, "Ocorrência atualizada.")
        checks.push("browser_edit_persisted")
        stage = "browser_inactivate"
        await row.getByRole("button", { name: logicalId }).click()
        await page.getByText(/Endereço editado no navegador/).waitFor()
        await page.getByRole("button", { name: "Inativar ocorrência", exact: true }).click()
        assert.equal(await page.locator('[name=versao]').inputValue(),"5")
        await page.locator('[name=motivo]').fill("Inativação do formulário isolado")
        await page.getByLabel("Confirmo a inativação lógica").check()
        await submitForm(page, fixture + "/inativacao", "POST", "Inativar ocorrência sintética", 200, writer, "Ocorrência inativada.")
        await row.getByText("Inativa", { exact: true }).waitFor()
        checks.push("browser_inactivation_persisted")
        await page.context().close()
      }
      if (index === 0) {
        stage = "browser_inactivate_Administrador"
        const logicalId = "51000000-0000-4000-8000-000000000001"
        const page = await openForm(token, "/ocorrencias")
        const row = page.getByRole("row").filter({ hasText: logicalId })
        await row.getByRole("button", { name: logicalId }).click()
        await page.getByRole("button", { name: "Inativar ocorrência", exact: true }).click()
        assert.equal(await page.locator('[name=versao]').inputValue(), "4")
        await page.locator('[name=motivo]').fill("Inativação administrativa Next")
        await page.getByLabel("Confirmo a inativação lógica").check()
        await submitForm(page, root + "/" + logicalId + "/inativacao", "POST", "Inativar ocorrência sintética", 200, writer, "Ocorrência inativada.")
        await row.getByText("Inativa", { exact: true }).waitFor()
        await page.context().close()
        checks.push("browser_inactivate_Administrador")
      }
    }
    if (index === 2) await verifyPcdf(index, account, cookie, token)
    assert.equal((await postAuth("logout", {}, cookie)).status, 303)
    assert.equal((await send(root, "POST", payload, cookie)).status, 401)
    checks.push("profile_" + account.role)
  }
  stage = "session_expiration"
  const login = await postAuth("login", { email: accounts[0].email, password })
  assert.equal(login.status, 303)
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0]
  assert.match(cookie, /^sentinela-local-session=[0-9a-f]{64}$/)
  const token = cookie.split("=")[1]
  const sessionFile = join(dirname(accountsFile), "sentinela-sessions", createHash("sha256").update(token).digest("hex") + ".json")
  sessionFiles.push(sessionFile)
  const session = JSON.parse(await readFile(sessionFile, "utf8"))
  await writeFile(sessionFile, JSON.stringify({ ...session, expires: Date.now() - 1000 }))
  assert.equal((await send(root, "POST", payload, cookie)).status, 401)
  checks.push("expired_session_401")
  result = { result: "PASS", checks }
} catch (error) {
  result = { result: "FAIL", stage, checks, error: error.name, frame: error.stack?.match(/qualify-next\.mjs:\d+:\d+/)?.[0],
    ...(Number.isInteger(error.actual) && Number.isInteger(error.expected) && { actual: error.actual, expected: error.expected }) }
} finally {
  await browser?.close().catch(() => {})
  try {
    if (child) {
      if (child.exitCode === null) {
        assert.deepEqual(processProof(child.pid), identity)
        spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 15000, stdio: "ignore" })
      }
      for (let i=0; i<20 && !stopped; i++) {
        try { await freePort(); stopped = true } catch { await delay(300) }
      }
      assert(stopped)
    }
    if (ownedAccounts) for (const path of [accountsFile, ...sessionFiles]) {
      await unlink(path).catch(error => { if (error.code !== "ENOENT") throw error })
    }
    if (previousTypes && (await readFile(types, "utf8")).includes(`.next-http-validation-${id}/`)) await writeFile(types, previousTypes)
  } catch { result = { ...result, result: "FAIL", cleanup: "UNCONFIRMED" } }
}
process.stdout.write(JSON.stringify({ ...result, stopped }))
if (result.result !== "PASS") process.exitCode = 1
