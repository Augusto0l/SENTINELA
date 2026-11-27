import assert from "node:assert/strict"
import { createHash, randomBytes, randomUUID, scryptSync } from "node:crypto"
import { readFile, realpath, unlink, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { Client } from "pg"
import { chromium } from "playwright-core"
import { preparePcdfCsvDelivery } from "../src/lib/db/pcdf-v2-delivery.ts"
import { freePort, httpValidation } from "./http-validation-output.mjs"

const root = await realpath(process.env.SENTINELA_OPERATIONAL_CLONE_ROOT)
const readJson = async filename => JSON.parse(await readFile(join(root, filename), "utf8"))
const [target, backup] = await Promise.all([readJson("identity-55487.json"), readJson("backup.json")])
assert.match(basename(root), /^clone-[0-9a-f]{32}$/)
assert.equal(dirname(root).toLowerCase(),
  (await realpath(join(process.env.USERPROFILE, ".sentinela-local", "homologacao-clone"))).toLowerCase())
assert.equal(target.port, 55487)
assert.equal(backup.origin.port, 55484)
assert.notEqual(target.system, backup.origin.system)
assert.notEqual(target.uuid, backup.origin.uuid)
assert.equal(target.name, "sentinela_pcdf_local")
const [subject, account] = JSON.parse(process.env.SENTINELA_CLONE_CSV_ACTOR)
const filename = process.argv[2]
const name = basename(filename)
assert.notEqual(name, "pcdf_naturezas_2021-01.csv")
const bytes = await readFile(filename)
const prepared = await preparePcdfCsvDelivery(new File([bytes], name))
const { month, sha256, standalone } = prepared.preview
const records = prepared.preview.records.length
assert.equal(standalone.invalid, 0)
assert.ok(records > standalone.candidates && standalone.pending > 0)

const password = randomBytes(32).toString("hex")
const accounts = ["Administrador", "Operador", "Analista"].map((role, index) => {
  const salt = randomBytes(16).toString("hex")
  return { role, email: ["admin.clone@example.test", "operador.clone@example.test", "analista.clone@example.test"][index],
    salt, hash: scryptSync(password, Buffer.from(salt, "hex"), 64).toString("hex"), ...(index === 0 && { subject }) }
})
const accountFile = join(root, "accounts-csv-next.json")
const id = randomUUID()
const origin = "http://127.0.0.1:3318"
const run = httpValidation(id, { port: 3318, evidence: root })
const config = { host: "127.0.0.1", port: 55487, database: target.name, user: "postgres",
  password: process.env.SENTINELA_CLONE_ADMIN_PASSWORD, statement_timeout: 25000, lock_timeout: 3000 }
const admin = new Client(config)
const restricted = new Client({ ...config, user: "sentinela_local_admin",
  password: process.env.SENTINELA_PCDF_LOCAL_PASSWORD_sentinela_local_admin })
const scalar = async (sql, params) => (await admin.query(sql, params)).rows[0]?.data
const intake = "/api/v1/importacoes/pcdf/direta"
const management = "/api/v1/ocorrencias/gestao"
const consultation = "/api/v1/ocorrencias/consulta"
const resetCounts = () => scalar(`SELECT jsonb_build_object(
 'lots',(SELECT count(*) FROM sentinela.lotes_importacao),
 'origins',(SELECT count(*) FROM sentinela.linhas_origem),
 'staging',(SELECT count(*) FROM sentinela.linhas_staging),
 'issues',(SELECT count(*) FROM sentinela.pendencias_revisao),
 'audits',(SELECT count(*) FROM sentinela.eventos_auditoria),
 'extractions',(SELECT count(*) FROM sentinela.extracoes_origem)) AS data`)
let stage = "attestation", preparedHttp = false, createdAccountFile = false, browser

async function session(index, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } })
  await context.route(url => url.origin !== origin, route => route.abort())
  const login = await context.request.post(origin + "/auth/login", {
    headers: { Origin: origin }, form: { email: accounts[index].email, password }, maxRedirects: 0, timeout: 120000,
  })
  assert.equal(login.status(), 303)
  const page = await context.newPage()
  page.setDefaultTimeout(40000)
  return page
}
async function get(page, path, params) {
  const response = await page.request.get(origin + path, { params, timeout: 120000 })
  assert.equal(response.status(), 200)
  return (await response.json()).data
}
function upload(page, step, { buffer = bytes, filename = name, hash = sha256 } = {}) {
  return page.request.post(origin + intake + "?etapa=" + step + "&versao=2.0&modalidade=csv", {
    headers: { Origin: origin }, timeout: 120000,
    multipart: { csv: { name: filename, mimeType: "text/csv", buffer }, ...(step === "confirmar" && { sha256: hash }) },
  })
}
async function fileRow(page, lot) {
  const history = page.getByRole("button", { name: "Histórico", exact: true })
  for (let attempt = 0; attempt < 20 && await history.getAttribute("aria-pressed") !== "true"; attempt++) {
    await history.click()
    if (await history.getAttribute("aria-pressed") !== "true") await delay(500)
  }
  const row = page.getByRole("row").filter({ hasText: lot })
  await row.waitFor()
  return row
}
const command = (page, data) => page.request.post(origin + management, { headers: { Origin: origin }, data })
const waitWrite = (page, path) => page.waitForResponse(response =>
  new URL(response.url()).pathname === path && response.request().method() === "POST")

try {
  await admin.connect()
  await restricted.connect()
  assert.equal(await scalar(`SELECT current_setting('sentinela.sandbox_uuid')=$1
    AND inet_server_port()=55487 AND (SELECT system_identifier::text FROM pg_control_system())=$2
    AND NOT pg_is_in_recovery() AS data`, [target.uuid, target.system]), true)
  assert.equal((await restricted.query("SELECT sentinela_gestao_autorizacao.capacidade($1,$2) AS data", [subject, account])).rows[0].data, true)
  const original = await resetCounts()
  stage = "rollback da importação após escrita parcial"
  await admin.query("ALTER TABLE sentinela.linhas_staging ADD CONSTRAINT clone_csv_failure CHECK (lote_id IS NULL) NOT VALID")
  try {
    await assert.rejects(restricted.query("SELECT sentinela_pcdf_local.receive_csv($1,$2,$3,$4,$5)",
      [randomUUID(), subject, account, prepared.batch, bytes]), { code: "23514", constraint: "clone_csv_failure" })
    assert.deepEqual(await resetCounts(), original)
  } finally {
    await admin.query("ALTER TABLE sentinela.linhas_staging DROP CONSTRAINT clone_csv_failure")
  }

  stage = "inicialização HTTP do clone"
  await writeFile(accountFile, JSON.stringify({ accounts }), { flag: "wx" })
  createdAccountFile = true
  await freePort(3318)
  await run.prepare()
  preparedHttp = true
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !/^(?:PG|SENTINELA_)|SUPABASE|DATABASE|READER_URL/i.test(key)
      || key.startsWith("SENTINELA_PCDF_LOCAL_PASSWORD_")))
  const child = run.start({ ...env, NODE_ENV: "development", SENTINELA_APP_ORIGIN: origin,
    SENTINELA_HTTP_VALIDATION_ID: id, SENTINELA_LOCAL_ACCOUNTS_FILE: accountFile, SENTINELA_AUTH_PROVIDER: "local",
    SENTINELA_OPERATIONAL_CLONE: "1", SENTINELA_OPERATIONAL_IMPORT_MANAGEMENT: "1", SENTINELA_LOCAL_BIND: "127.0.0.1",
    SENTINELA_PCDF_LOCAL_ID: target.uuid, SENTINELA_PCDF_LOCAL_SYSTEM_ID: target.system, SENTINELA_PCDF_LOCAL_START: target.start,
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_TELEMETRY_DISABLED: "1",
  }, "ignore")
  const deadline = Date.now() + 180000
  let ready = false
  while (child.exitCode === null && Date.now() < deadline) {
    if ((await fetch(origin + "/login", { signal: AbortSignal.timeout(5000) }).catch(() => null))?.ok) { ready = true; break }
    await delay(300)
  }
  assert.ok(ready)
  run.proveListener()
  browser = await chromium.launch({ channel: "msedge", headless: true })
  stage = "impedir gravação para Operador e Analista"
  for (const index of [1, 2]) {
    const page = await session(index, 1440)
    assert.equal((await upload(page, "validar")).status(), 403)
    assert.equal((await upload(page, "confirmar")).status(), 403)
    await page.context().close()
  }
  const desktop = await session(0, 1440)
  stage = "prévia e confirmação pelo navegador"
  const before = await get(desktop, consultation, { view: "resumo" })
  await desktop.goto(origin + "/importar", { waitUntil: "networkidle", timeout: 120000 })
  const uploadTest = desktop.waitForResponse(response =>
    new URL(response.url()).searchParams.get("etapa") === "validar" && response.request().method() === "POST")
  await desktop.getByLabel("Arquivo CSV ou XLSX").setInputFiles(filename)
  const previewResponse = await uploadTest
  assert.equal(previewResponse.status(), 200)
  assert.deepEqual((await previewResponse.json()).data.standalone, standalone)
  await desktop.getByText("Layout PCDF v2.0 reconhecido", { exact: true }).waitFor()
  assert.equal(await desktop.getByLabel(/Manifesto técnico JSON/).count(), 0)
  await desktop.getByRole("button", { name: "Revisar registros", exact: true }).click()
  await desktop.getByRole("button", { name: "Revisar confirmação" }).click()
  const confirming = waitWrite(desktop, intake)
  await desktop.getByRole("button", { name: "Confirmar importação", exact: true }).click()
  const confirmed = await confirming
  assert.equal(confirmed.status(), 201)
  const receipt = (await confirmed.json()).data
  const { lot, run: execution, issues } = receipt
  assert.equal(receipt.records, records)
  await desktop.getByText("Gravação confirmada", { exact: true }).waitFor()
  await desktop.getByRole("button", { name: "Consultar histórico" }).click()
  const row = await fileRow(desktop, lot)
  assert.match(await row.innerText(), /pcdf_naturezas_/)

  stage = "persistência e idempotência"
  assert.equal(await scalar(`SELECT l.solicitado_por=$2 AND e.solicitado_por=$2 AND x.sha256_xml IS NULL
    AND x.nome_xml IS NULL AND e.ocorrencias_criadas=0 AND e.linhas_lidas=$3 AND e.pendencias_detectadas=$4
    AND e.checkpoint_detalhes->>'candidatas'=$5 AND l.sha256_arquivo=$6 AS data
    FROM sentinela.lotes_importacao l JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id
    JOIN sentinela.execucoes_importacao e ON e.lote_id=l.id WHERE l.id=$1`,
  [lot, subject, records, issues, String(standalone.candidates), sha256]), true)
  const detail = await get(desktop, intake, { execucao: execution, pagina: 1 })
  assert.equal(detail.headers.length, 26)
  assert.equal(detail.total, records)
  assert.equal(detail.rows.length, 25)
  assert.equal(await scalar(`SELECT count(*)=2 AND bool_and(depois->>'actor'=$2 AND registrado_em IS NOT NULL) AS data
    FROM sentinela.eventos_auditoria WHERE execucao_id=$1`, [execution, subject]), true)
  assert.equal((await upload(desktop, "confirmar", { hash: "0".repeat(64) })).status(), 409)
  const replay = await upload(desktop, "confirmar")
  assert.equal(replay.status(), 200)
  assert.deepEqual((await replay.json()).data, { ...receipt, replay: true })
  const variant = Buffer.from(bytes.toString("utf8").replace(/;SIM;/, ";NÃO;"))
  assert.notDeepEqual(variant, bytes)
  const variantHash = createHash("sha256").update(variant).digest("hex")
  const conflict = await upload(desktop, "confirmar", { buffer: variant, hash: variantHash })
  assert.equal(conflict.status(), 409)
  assert.equal((await conflict.json()).error.diagnostic, "competencia_ja_importada")
  const summary = await get(desktop, consultation, { view: "resumo" })
  assert.equal(summary.recebidas, before.recebidas + records)
  assert.equal(summary.pendencias, before.pendencias + issues)

  stage = "edição auditada e recarga"
  const association = await scalar("SELECT id AS data FROM sentinela.linhas_staging WHERE lote_id=$1 ORDER BY registro_csv LIMIT 1", [lot])
  const rawHash = () => scalar("SELECT encode(sha256(convert_to(campos_csv::text,'UTF8')),'hex') AS data FROM sentinela.linhas_staging WHERE id=$1", [association])
  const raw = await rawHash()
  await row.getByRole("button", { name: /^Editar registros/ }).click()
  const editing = desktop.getByRole("dialog", { name: "Editar registros", exact: true })
  await editing.getByLabel("Buscar associação").fill(association)
  await editing.getByRole("button", { name: "Buscar", exact: true }).click()
  await editing.getByText("1 associação encontrada").waitFor()
  await editing.getByRole("button", { name: "Editar", exact: true }).click()
  const editor = desktop.getByRole("dialog", { name: "Corrigir associação" })
  await editor.getByLabel("Local para revisão").fill("Correção de homologação em clone")
  await editor.getByLabel("Justificativa").fill("Verificação da edição de CSV v2")
  const saving = waitWrite(desktop, management)
  await editor.getByRole("button", { name: "Salvar alterações" }).click()
  const saved = await saving
  assert.equal(saved.status(), 200)
  const audit = (await saved.json()).data.auditoria
  await desktop.reload()
  const changed = await get(desktop, management, { view: "importados", id: association })
  assert.equal(changed.local, "Correção de homologação em clone")
  assert.ok(changed.historico.some(event => event.id === audit))
  assert.equal(await rawHash(), raw)

  stage = "exclusão controlada no navegador móvel"
  const mobile = await session(0, 390)
  await mobile.goto(origin + "/importar", { waitUntil: "networkidle", timeout: 120000 })
  const mobileRow = await fileRow(mobile, lot)
  const removal = { acao: "excluir_lote", id: lot, confirmacao: lot, definitiva: true,
    justificativa: "Exclusão após homologação em clone" }
  const plan = await get(mobile, management, { view: "previa_exclusao", id: lot })
  assert.deepEqual(plan.bloqueios, [])
  assert.equal(plan.autorizada, false)
  assert.equal((await command(mobile, { ...removal, revisao: plan.revisao })).status(), 403)
  await admin.query(`INSERT INTO sentinela_gestao_autorizacao.exclusoes(lote,usuario,revisao,aprovacao,prova_restauracao,validade)
    VALUES($1,$2,$3,'Qualificação descartável do CSV v2',$4,clock_timestamp()+interval '10 minutes')`,
  [lot, subject, plan.revisao, backup.sha256])
  await mobileRow.locator("summary").click()
  await mobileRow.getByRole("button", { name: /^Excluir arquivo/ }).click()
  const deletion = mobile.getByRole("dialog", { name: "Excluir definitivamente esta importação?" })
  await deletion.getByLabel("Justificativa").fill(removal.justificativa)
  await deletion.getByLabel(/Digite o identificador/).fill(lot)
  await deletion.getByRole("checkbox").check()
  const deleting = waitWrite(mobile, management)
  await deletion.getByRole("button", { name: "Excluir definitivamente", exact: true }).click()
  assert.equal((await deleting).status(), 200)
  await mobileRow.waitFor({ state: "detached" })
  assert.deepEqual(await resetCounts(), original)
  assert.equal(await scalar("SELECT count(*)=1 AND bool_and(responsavel=$2) AS data FROM sentinela_exclusao.comprovantes WHERE lote=$1",
    [lot, subject]), true)
  assert.equal(await scalar("SELECT NOT EXISTS(SELECT FROM sentinela_exclusao.vinculos_inesperados()) AS data"), true)
  const proof = { month, records, candidates: standalone.candidates, issues, consolidated: 0, replay: "200",
    sameMonthConflict: "409", roleDenials: 2, rollback: true, auditedEdit: true, controlledPurge: true, retainedReceipt: true,
    browserWidths: [1440, 390], restoredTables: backup.tables, restoredArchive: backup.sha256,
    migrationSha256: createHash("sha256").update(await readFile("database/release/pcdf-monthly-csv.psql")).digest("hex") }
  await writeFile(join(root, "csv-qualification.json"), JSON.stringify(proof, null, 2))
  console.log(JSON.stringify(proof))
} catch (error) {
  const mismatch = Number.isInteger(error.actual) && Number.isInteger(error.expected)
    ? ` (${error.actual}, esperado ${error.expected})` : ""
  console.error(`Falha em ${stage} · ${error.code ?? error.name}${mismatch}`)
  process.exitCode = 1
} finally {
  await browser?.close()
  try { if (preparedHttp) await run.finish() }
  finally {
    await Promise.allSettled([admin.end(), restricted.end()])
    if (createdAccountFile) await unlink(accountFile)
  }
}
