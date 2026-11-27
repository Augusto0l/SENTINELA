import assert from "node:assert/strict"
import { randomBytes, randomUUID, scryptSync } from "node:crypto"
import { readFile, realpath, unlink, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { Client } from "pg"
import { chromium } from "playwright-core"
import { freePort, httpValidation } from "./http-validation-output.mjs"

const root = await realpath(process.env.SENTINELA_OPERATIONAL_CLONE_ROOT)
assert.equal(dirname(root).toLowerCase(),
  (await realpath(join(process.env.USERPROFILE, ".sentinela-local", "homologacao-clone"))).toLowerCase())
assert.match(basename(root), /^clone-[0-9a-f]{32}$/)
const readJson = async name => JSON.parse(await readFile(join(root, name), "utf8"))
const target = await readJson("identity-55487.json")
const { origin: source } = await readJson("backup.json")
assert.equal(target.port, 55487)
assert.equal(source.port, 55484)
assert.notEqual(target.system, source.system)
assert.notEqual(target.uuid, source.uuid)
assert.equal(target.name, "sentinela_pcdf_local")
assert.equal((await realpath(target.folder)).toLowerCase(), (await realpath(join(root, "data-55487"))).toLowerCase())
const fixture = JSON.parse(process.env.SENTINELA_CLONE_BROWSER_CASE)
const config = {
  host: "127.0.0.1", port: target.port, database: target.name, user: "postgres",
  password: process.env.SENTINELA_CLONE_ADMIN_PASSWORD, statement_timeout: 20000, lock_timeout: 3000,
}
const admin = new Client(config)
const restricted = new Client({ ...config, user: "sentinela_local_admin",
  password: process.env.SENTINELA_PCDF_LOCAL_PASSWORD_sentinela_local_admin })
const result = async (client, sql, params = []) => (await client.query(sql, params)).rows[0]?.data
const origin = "http://127.0.0.1:3318"
const management = "/api/v1/ocorrencias/gestao"
const consultation = "/api/v1/ocorrencias/consulta"
const id = randomUUID()
const run = httpValidation(id, { port: 3318, evidence: root })
const password = randomBytes(32).toString("hex")
const accounts = ["Administrador", "Operador", "Analista"].map((role, i) => {
  const salt = randomBytes(16).toString("hex")
  return { role, email: ["admin.clone@example.test", "operador.clone@example.test", "analista.clone@example.test"][i],
    salt, hash: scryptSync(password, Buffer.from(salt, "hex"), 64).toString("hex"), ...(i === 0 && { subject: fixture.subject }) }
})
const accountPath = join(root, "accounts-next.json")
let prepared = false, browser, stage = "atestação", accountCreated = false

async function currentIdentity(client) {
  const identity = await result(client, "SELECT sentinela_ocorrencias_local.identidade() AS data")
  assert.ok(identity?.uuid === target.uuid && identity.system === target.system && identity.port === 55487)
}

async function internalPlan() {
  return result(admin, "SELECT sentinela_exclusao.plano($1) AS data", [fixture.lot.id])
}

const groups = {
  lotes: "sentinela.lotes_importacao.id",
  execucoes: "sentinela.execucoes_importacao.id",
  staging: "sentinela.linhas_staging.id",
  origens: "sentinela.linhas_origem.id",
  extracoes: "sentinela.extracoes_origem.id",
  pendencias: "sentinela.pendencias_revisao.id",
  correcoes: "sentinela.historico_correcoes.id",
  recibos: "sentinela_import_local.requests.request",
  auditorias: "sentinela.eventos_auditoria.id",
}
async function inventory(client, plan) {
  const counts = {}
  for (const [group, path] of Object.entries(groups)) {
    const [schema, table, column] = path.split(".")
    counts[group] = await result(client, "SELECT count(*)::int AS data FROM " + schema + "." + table +
      " WHERE " + column + "=ANY($1::uuid[])", [plan.escopo[group]])
  }
  counts.shared = await result(client, "SELECT count(*)::int AS data FROM sentinela.linhas_origem WHERE id=ANY($1::uuid[])", [plan.apoio])
  counts.approvals = await result(client, "SELECT count(*)::int AS data FROM sentinela_gestao_autorizacao.exclusoes WHERE lote=$1", [fixture.lot.id])
  counts.receipts = await result(client, "SELECT count(*)::int AS data FROM sentinela_exclusao.comprovantes WHERE lote=$1", [fixture.lot.id])
  return counts
}

async function open(role, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } })
  await context.route(url => url.origin !== origin, route => route.abort())
  const page = await context.newPage()
  page.setDefaultTimeout(90000)
  page.setDefaultNavigationTimeout(120000)
  const login = await context.request.post(origin + "/auth/login", {
    headers: { Origin: origin }, form: { email: accounts[role].email, password }, maxRedirects: 0, timeout: 120000,
  })
  assert.equal(login.status(), 303)
  assert.equal(new URL(login.headers().location, origin).pathname, "/dashboard")
  return page
}

async function read(page, path, params) {
  const response = await page.request.get(origin + path, { params, timeout: 120000 })
  assert.equal(response.status(), 200)
  return (await response.json()).data
}
async function selectFile(page, lot, width) {
  stage = "seleção da guia Histórico"
  const tab = page.getByRole("button", { name: fixture.editOnly ? "Histórico" : "Arquivos importados", exact: true })
  // On a cold Next.js build, the server-rendered button can appear before hydration.
  for (let attempt = 0; attempt < 40 && await tab.getAttribute("aria-pressed") !== "true"; attempt++) {
    await tab.click()
    if (await tab.getAttribute("aria-pressed") !== "true") await delay(500)
  }
  assert.equal(await tab.getAttribute("aria-pressed"), "true")
  stage = "localização da linha no Histórico"
  const catalog = await read(page, management, { view: "arquivos", busca: lot })
  assert.ok(catalog.itens.some(item => item.id === lot))
  const row = page.getByRole("row").filter({ hasText: lot })
  await row.waitFor()
  if (width === 390) {
    const menu = row.locator("summary")
    if (await menu.locator("..").getAttribute("open") === null) await menu.click()
  }
  return row
}

async function removeProtectedLot(desktop, post) {
  const lot = fixture.lot.id
  const plan = await internalPlan()
  const before = await inventory(admin, plan)
  const summaryBefore = await read(desktop, consultation, { view: "resumo" })
  const revision = await result(admin, "SELECT sentinela_exclusao.revisao($1) AS data", [plan])
  assert.equal(before.staging, 6393)
  assert.equal(before.pendencias, 20020)
  assert.equal(before.approvals, 0)
  const authorization = { acao: "autorizar_exclusao", id: lot, confirmacao: lot, revisao: revision }
  const command = { ...authorization, acao: "excluir_lote", palavra: "EXCLUIR", definitiva: true,
    justificativa: "Exclusão manual exclusivamente no clone descartável" }
  const adminPage = await open(0, 390)
  await adminPage.goto(origin + "/importar", { waitUntil: "domcontentloaded" })
  const row = await selectFile(adminPage, lot, 390)
  await row.getByRole("button", { name: /^Excluir arquivo/ }).click()
  stage = "prévia e ações de autorização"
  const modal = adminPage.getByRole("dialog", { name: "Excluir definitivamente esta importação?" })
  const authorize = modal.getByRole("button", { name: "Autorizar exclusão deste lote" })
  const confirm = modal.getByRole("button", { name: "Excluir definitivamente", exact: true })
  await modal.getByText("Backup restaurado com integridade verificada").waitFor()
  await modal.getByText(/Lote protegido contra exclusão operacional/).waitFor()
  assert.equal(await confirm.count(), 0)
  assert.equal((await post(desktop, command)).status(), 403)
  assert.equal((await post(desktop, { ...authorization, confirmacao: randomUUID() })).status(), 422)
  assert.equal((await post(desktop, { ...authorization, revisao: "0".repeat(64) })).status(), 409)
  await assert.rejects(restricted.query("SELECT sentinela_exclusao.autorizar_jan2021($1,$2,$3,$4,$5)",
    [lot, fixture.subject, fixture.account, revision, "0".repeat(64)]), { code: "42501" })
  for (const role of [1, 2]) {
    const user = await open(role, 1440)
    assert.equal((await post(user, authorization)).status(), 403)
    assert.equal((await post(user, command)).status(), 403)
    await user.context().close()
  }
  const waitPost = () => adminPage.waitForResponse(response =>
    response.url().endsWith(management) && response.request().method() === "POST")
  async function authorizeInModal() {
    const response = waitPost()
    await authorize.click()
    const approved = await response
    assert.equal(approved.status(), 200)
    const { data, meta } = await approved.json()
    assert.equal(meta.execution.persisted, true)
    assert.equal(data.revisao, revision)
    const lifetime = Date.parse(data.validade) - Date.now()
    assert.ok(lifetime > 0 && lifetime <= 15 * 60 * 1000)
    await confirm.waitFor()
  }
  await authorizeInModal()
  assert.equal((await post(desktop, authorization)).status(), 409)
  assert.equal((await post(desktop, { ...command, revisao: "0".repeat(64) })).status(), 409)
  assert.equal((await post(desktop, { ...command, palavra: undefined })).status(), 422)
  await admin.query("UPDATE sentinela_gestao_autorizacao.exclusoes SET validade=clock_timestamp()-interval '1 second' WHERE lote=$1", [lot])
  assert.equal((await post(desktop, command)).status(), 403)
  await modal.getByRole("button", { name: "Reconsultar impacto" }).click()
  await authorizeInModal()

  stage = "rollback após falha de registro do comprovante"
  await admin.query("ALTER TABLE sentinela_exclusao.comprovantes ADD CONSTRAINT clone_falha CHECK (lote IS NULL) NOT VALID")
  try {
    await assert.rejects(restricted.query("SELECT sentinela_exclusao.excluir($1,$2,$3)",
      [{ ...command, provaBackup: fixture.proof.backup }, fixture.account, fixture.subject]), { code: "23514" })
    assert.deepEqual(await inventory(admin, plan), { ...before, approvals: 1 })
  } finally {
    await admin.query("ALTER TABLE sentinela_exclusao.comprovantes DROP CONSTRAINT clone_falha")
  }

  stage = "confirmação, exclusão e comprovante independente"
  await modal.getByLabel("Justificativa").fill(command.justificativa)
  await modal.getByLabel("Digite EXCLUIR").fill("excluir")
  await modal.getByRole("checkbox").check()
  assert.equal(await confirm.isDisabled(), true)
  await modal.getByLabel("Digite EXCLUIR").fill("EXCLUIR")
  assert.equal(await confirm.isEnabled(), true)
  const removal = waitPost()
  await confirm.click()
  const response = await removal
  assert.equal(response.status(), 200)
  const { data, meta } = await response.json()
  assert.equal(meta.execution.persisted, true)
  await adminPage.getByText("Arquivo excluído definitivamente. O comprovante foi registrado.").waitFor()
  await row.waitFor({ state: "detached" })
  assert.equal((await post(desktop, command)).status(), 404)

  const reconnect = new Client(config)
  try {
    await reconnect.connect()
    assert.equal(await result(reconnect, "SELECT current_setting('sentinela.sandbox_uuid')=$1 AND inet_server_port()=55487 AS data", [target.uuid]), true)
    const after = await inventory(reconnect, plan)
    for (const group of Object.keys(groups)) assert.equal(after[group], 0)
    assert.equal(after.shared, before.shared)
    assert.equal(after.approvals, 0)
    assert.equal(after.receipts, 1)
    assert.equal(await result(reconnect, `SELECT id=$2 AND responsavel=$3 AND revisao_autorizada=$4 AND backup_restaurado=$5
      AND justificativa=$6 AND momento IS NOT NULL AND quantidades=sentinela_exclusao.quantidades($7) AS data
      FROM sentinela_exclusao.comprovantes WHERE lote=$1`,
    [lot, data.auditoria, fixture.subject, revision, fixture.proof.backup, command.justificativa, plan]), true)
    assert.equal(await result(reconnect, "SELECT NOT EXISTS(SELECT FROM sentinela_exclusao.vinculos_inesperados()) AS data"), true)
    assert.equal(await result(reconnect, "SELECT count(*)=1 AS data FROM sentinela.linhas_staging WHERE id=$1", [fixture.edit.stage]), true)
    const summaryAfter = await read(adminPage, consultation, { view: "resumo" })
    assert.equal(summaryAfter.recebidas, summaryBefore.recebidas - before.staging)
    assert.equal(summaryAfter.pendencias, summaryBefore.pendencias - before.pendencias)
    const history = await read(adminPage, management, { view: "exclusoes", pagina: 1 })
    assert.ok(history.itens.some(item => item.id === data.auditoria && item.lote === lot && item.responsavel === fixture.subject))
    const proof = { ...fixture.proof, protectedRemoval: true, expiration: 403, duplicateUse: 404, staleRevision: 409,
      wrongId: 422, rollback: true, independentReceipt: true, rolesDenied: 2, editPersisted: true,
      browser: [1440, 390], before, after }
    await writeFile(join(root, "january-browser-proof.json"), JSON.stringify(proof, null, 2), { flag: "wx" })
    console.log(JSON.stringify(proof))
  } finally {
    await reconnect.end()
  }
}

try {
  await admin.connect()
  await restricted.connect()
  const proof = await result(admin, `SELECT jsonb_build_object('system',(SELECT system_identifier::text FROM pg_control_system()),
    'uuid',current_setting('sentinela.sandbox_uuid'),'port',inet_server_port(),'folder',current_setting('data_directory')) AS data`)
  assert.ok(proof.system === target.system && proof.uuid === target.uuid && proof.port === target.port)
  assert.equal((await realpath(proof.folder)).toLowerCase(), (await realpath(target.folder)).toLowerCase())
  await currentIdentity(restricted)
  const originRaw = await result(admin, "SELECT encode(sha256(convert_to(campos_csv::text,'UTF8')),'hex') AS data FROM sentinela.linhas_staging WHERE id=$1",
    [fixture.edit.stage])
  await writeFile(accountPath, JSON.stringify({ accounts }), { flag: "wx" })
  accountCreated = true
  stage = "inicialização HTTP"
  await freePort(3318)
  await run.prepare()
  prepared = true
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !key.startsWith("SENTINELA_") || key.startsWith("SENTINELA_PCDF_LOCAL_PASSWORD_")))
  const child = run.start({ ...env, NODE_ENV: "development", SENTINELA_APP_ORIGIN: origin,
    SENTINELA_HTTP_VALIDATION_ID: id, SENTINELA_LOCAL_ACCOUNTS_FILE: accountPath, SENTINELA_AUTH_PROVIDER: "local",
    SENTINELA_OPERATIONAL_CLONE: "1", SENTINELA_OPERATIONAL_IMPORT_MANAGEMENT: "1", SENTINELA_OCCURRENCE_MANAGEMENT: "0",
    SENTINELA_PCDF_SYNTHETIC: "0", SENTINELA_PCDF_V2_SYNTHETIC_WRITE: "0", SENTINELA_PCDF_LOCAL_ID: target.uuid,
    SENTINELA_PCDF_LOCAL_SYSTEM_ID: target.system, SENTINELA_PCDF_LOCAL_START: target.start,
    SENTINELA_LOCAL_DEMO: "0", SENTINELA_SANDBOX_WRITE: "0", SENTINELA_PERSISTENT_HOMOLOGATION: "0",
    SENTINELA_LOCAL_READER_URL: "", SENTINELA_DATABASE_URL: "", SENTINELA_MANUAL_GEOCODER_URL: "",
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_TELEMETRY_DISABLED: "1",
    NEXT_TRACE_SPAN_THRESHOLD_MS: "2147483647",
  }, "ignore")
  const deadline = Date.now() + 180000
  let ready = false
  while (child.exitCode === null && Date.now() < deadline) {
    const request = await fetch(origin + "/login", { signal: AbortSignal.timeout(5000) }).catch(() => null)
    if (request?.ok) { ready = true; break }
    await delay(300)
  }
  assert.ok(ready)
  run.proveListener()
  browser = await chromium.launch({ channel: "msedge", headless: true })
  stage = "sessão de Administrador de homologação"
  const desktop = await open(0, 1440)
  stage = "capacidade de edição no clone"
  const availability = await read(desktop, management, { view: "disponibilidade" })
  assert.equal(availability.escrita, "disponivel")
  stage = "acesso à lista de arquivos e ao formulário"
  await desktop.goto(origin + (fixture.editOnly ? "/importar" : "/ocorrencias"), { waitUntil: "domcontentloaded" })
  stage = "histórico e arquivo de ensaio"
  const editRow = await selectFile(desktop, fixture.edit.lot, 1440)
  stage = "abertura da lista de associações"
  await editRow.getByRole("button", { name: /^Editar registros/ }).click()
  const records = desktop.getByRole("dialog", { name: "Editar registros", exact: true })
  await records.getByLabel("Buscar associação").fill(fixture.edit.stage)
  await records.getByRole("button", { name: "Buscar", exact: true }).click()
  stage = "resultado da busca por associação"
  await records.getByText("1 associação encontrada").waitFor()
  await records.getByRole("button", { name: "Editar", exact: true }).click()
  stage = "preenchimento e validação local do editor"
  const edit = desktop.getByRole("dialog", { name: "Corrigir associação" })
  const newValue = "Correção de homologação exclusivamente no clone " + id
  await edit.getByLabel("Local para revisão").fill(newValue)
  await edit.getByRole("button", { name: "Salvar alterações" }).click()
  await edit.getByText("Informe a justificativa.").waitFor()
  stage = "salvamento e releitura da revisão"
  await edit.getByLabel("Justificativa").fill("Homologação autorizada no clone")
  const savePending = desktop.waitForResponse(response => response.url().endsWith(management) && response.request().method() === "POST")
  await edit.getByRole("button", { name: "Salvar alterações" }).click()
  const save = await savePending
  assert.equal(save.status(), 200)
  const saved = await save.json()
  assert.equal(saved.meta.execution.persisted, true)
  await desktop.reload()
  const refreshed = await read(desktop, management, { view: "importados", id: fixture.edit.stage })
  assert.ok(refreshed.local === newValue && refreshed.historico.some(event => event.id === saved.data.auditoria))
  assert.equal(await result(admin, "SELECT encode(sha256(convert_to(campos_csv::text,'UTF8')),'hex') AS data FROM sentinela.linhas_staging WHERE id=$1",
    [fixture.edit.stage]), originRaw)
  const author = await result(admin, `SELECT ator_tipo='usuario' AND usuario_id=$2 AND servico IS NULL
    AND registrado_em IS NOT NULL AND antes IS NOT NULL AND antes->>'local' IS DISTINCT FROM $3
    AND depois->'campos'->>'local'=$3 AND justificativa=$4 AS data FROM sentinela.eventos_auditoria WHERE id=$1`,
    [saved.data.auditoria, fixture.subject, newValue, "Homologação autorizada no clone"])
  assert.equal(author, true)
  const post = (page, payload) => page.request.post(origin + management, { data: payload, headers: { Origin: origin }, timeout: 120000 })
  stage = "revisão concorrente e perfis sem autorização"
  const savedCommand = save.request().postDataJSON()
  assert.equal((await post(desktop, savedCommand)).status(), 409)
  for (const role of [1, 2]) {
    const user = await open(role, 1440)
    assert.equal((await post(user, savedCommand)).status(), 403)
    await user.context().close()
  }
  console.log("Edição no navegador e auditoria SQL confirmadas; staging original preservado.")

  stage = "prévia protegida"
  for (const protectedLot of fixture.protected) {
    const preview = fixture.editOnly
      ? await result(restricted, "SELECT sentinela_exclusao.previa($1,$2,$3) AS data", [protectedLot, fixture.subject, fixture.account])
      : await read(desktop, management, { view: "previa_exclusao", id: protectedLot })
    assert.ok(preview.bloqueios.some(entry => entry.tipo === "lote_protegido"))
    assert.equal(preview.autorizada, false)
  }
  if (fixture.protectedRemoval) {
    stage = "autorização especial e validade na interface"
    await removeProtectedLot(desktop, post)
  } else if (fixture.editOnly) {
    const report = { ...fixture.proof, edit: true, originalPreserved: true, humanAuditTestIdentity: true,
      staleRevision: 409, roleDenials: 2, purgeExecuted: false }
    await writeFile(join(root, "edit-proof.json"), JSON.stringify(report, null, 2), { flag: "wx" })
    console.log(JSON.stringify(report))
  } else {
    stage = "bloqueios, UUID, aprovação e rollback"
    const plan = await internalPlan()
    const before = await inventory(admin, plan)
    const summaryBefore = await read(desktop, consultation, { view: "resumo" })
    const preview = await read(desktop, management, { view: "previa_exclusao", id: fixture.lot.id })
    assert.equal(preview.autorizada, false)
    assert.deepEqual(preview.bloqueios, [])
    const command = { acao: "excluir_lote", id: fixture.lot.id, confirmacao: fixture.lot.id, revisao: preview.revisao,
      definitiva: true, justificativa: "Homologação autorizada no clone" }
    assert.equal((await post(desktop, command)).status(), 403)
    assert.equal((await post(desktop, { ...command, confirmacao: randomUUID() })).status(), 422)
    for (const role of [1, 2]) {
      const user = await open(role, 1440)
      assert.equal((await post(user, command)).status(), 403)
      await user.context().close()
    }
    await admin.query(`INSERT INTO sentinela_gestao_autorizacao.exclusoes(lote,usuario,revisao,aprovacao,prova_restauracao,validade)
      VALUES($1,$2,$3,'ensaio exclusivamente no clone','dump restaurado e verificado',clock_timestamp()+interval '1 hour')`,
    [fixture.lot.id, fixture.subject, preview.revisao])
    assert.equal((await post(desktop, { ...command, revisao: "0".repeat(64) })).status(), 409)
    await admin.query("ALTER TABLE sentinela_exclusao.comprovantes ADD CONSTRAINT clone_falha CHECK (lote IS NULL) NOT VALID")
    try {
      await assert.rejects(restricted.query("SELECT sentinela_exclusao.excluir($1,$2,$3)", [command, fixture.account, fixture.subject]),
        { code: "23514" })
      assert.deepEqual(await inventory(admin, plan), { ...before, approvals: 1 })
    } finally { await admin.query("ALTER TABLE sentinela_exclusao.comprovantes DROP CONSTRAINT clone_falha") }

    stage = "exclusão física pelo navegador e reconexão"
    const mobile = await open(0, 390)
    await mobile.goto(origin + "/ocorrencias")
    const purgeRow = await selectFile(mobile, fixture.lot.id, 390)
    await purgeRow.getByRole("button", { name: /^Excluir arquivo/ }).click()
    const modal = mobile.getByRole("dialog", { name: "Excluir definitivamente esta importação?" })
    const confirm = modal.getByRole("button", { name: "Excluir definitivamente", exact: true })
    await modal.getByLabel("Justificativa").fill(command.justificativa)
    await modal.getByLabel(/Digite o identificador/).fill(randomUUID())
    await modal.getByRole("checkbox").check()
    assert.equal(await confirm.isDisabled(), true)
    await modal.getByLabel(/Digite o identificador/).fill(fixture.lot.id)
    assert.equal(await confirm.isEnabled(), true)
    const removing = mobile.waitForResponse(response => response.url().endsWith(management) && response.request().method() === "POST")
    await confirm.click()
    const removal = await removing
    assert.equal(removal.status(), 200)
    assert.equal((await removal.json()).meta.execution.persisted, true)
    await modal.waitFor({ state: "hidden" })
    await purgeRow.waitFor({ state: "hidden" })
    const reconnect = new Client(config)
    await reconnect.connect()
    try {
      const postClone = await result(reconnect, "SELECT current_setting('sentinela.sandbox_uuid')=$1 AND inet_server_port()=55487 AS data", [target.uuid])
      assert.equal(postClone, true)
      const after = await inventory(reconnect, plan)
      for (const group of Object.keys(groups)) assert.equal(after[group], 0)
      assert.equal(after.shared, before.shared)
      assert.equal(after.approvals, 0)
      assert.equal(after.receipts, 1)
      const receipt = await result(reconnect, "SELECT responsavel=$2 AS data FROM sentinela_exclusao.comprovantes WHERE lote=$1",
        [fixture.lot.id, fixture.subject])
      assert.equal(receipt, true)
      const summaryAfter = await read(mobile, consultation, { view: "resumo" })
      assert.equal(summaryAfter.recebidas, summaryBefore.recebidas - before.staging)
      const history = await read(mobile, management, { view: "exclusoes", pagina: 1 })
      assert.ok(history.itens.some(item => item.lote === fixture.lot.id && item.responsavel === fixture.subject))
      const report = { ...fixture.proof, edit: true, humanAuditTestIdentity: true, originalPreserved: true,
        roleDenials: 2, approvalDeniedWithoutRecord: true, rollback: true, browser: [1440, 390], before, after,
        indicators: { before: summaryBefore.recebidas, after: summaryAfter.recebidas }, reconnect: true }
      await writeFile(join(root, "browser-proof.json"), JSON.stringify(report, null, 2), { flag: "wx" })
      console.log(JSON.stringify(report))
    } finally { await reconnect.end() }
  }
} catch (error) {
  // Database and Playwright exceptions can carry imported data. Publish the stage and error class only.
  const timeout = error.name === "TimeoutError" ? String(error.message).match(/^[a-z.]+: (?:Timeout[ .0-9a-z]+|Request timed out)/i)?.[0] : undefined
  const status = Number.isInteger(error.actual) && Number.isInteger(error.expected) ? ` ${error.actual} / esperado ${error.expected}` : ""
  console.error("Etapa interrompida: " + stage + " (" + (timeout ?? error.code ?? error.name) + status + ").")
  process.exitCode = 1
} finally {
  await browser?.close()
  try { if (prepared) await run.finish() }
  finally {
    await Promise.allSettled([admin.end(), restricted.end()])
    if (accountCreated) await unlink(accountPath)
  }
}
