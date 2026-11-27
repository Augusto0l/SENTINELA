// Opt-in qualification after run_import_local.py. All Auth identities and files are synthetic.
import "../../../scripts/contracts-runtime.mjs"
import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { readFileSync, realpathSync } from "node:fs"
import { registerHooks } from "node:module"
import { Socket } from "node:net"
import { join } from "node:path"
import { Client } from "pg"
import { utils, write } from "xlsx"
import { fixture } from "../../../tests/fixtures/pcdf-v2-package.mjs"
import { v1 } from "../../../tests/fixtures/pcdf-v1-package.mjs"

const [portArg, directoryArg] = process.argv.slice(2)
const port = Number(portArg)
assert(Number.isInteger(port) && port >= 49152 && port <= 65535 && ![55484, 55487, 55491].includes(port))
const directory = realpathSync(directoryArg)
const fixtureHost = "db.sentinelafixture.supabase.co"
const project = "https://sentinelafixture.supabase.co"
const origin = "https://import.example.test"
const profiles = ["Administrador", "Operador", "Analista"].map((role, index) => ({
  role, id: randomUUID(), session: randomUUID(), login: "sentinela_local_" + ["admin", "operator", "analyst"][index],
}))
const [admin, operator, analyst] = profiles
const ca = readFileSync(join(directory, "server.crt"), "utf8")
const db = new Client({ host: "127.0.0.1", port, user: "bootstrap", database: "postgres", ssl: false })
const sql = async (statement, params) => (await db.query(statement, params)).rows[0]?.data
const counts = () => sql(`SELECT jsonb_build_object(
  'lots',(SELECT count(*) FROM sentinela.lotes_importacao),'runs',(SELECT count(*) FROM sentinela.execucoes_importacao),
  'sources',(SELECT count(*) FROM sentinela.linhas_origem),'staging',(SELECT count(*) FROM sentinela.linhas_staging),
  'pending',(SELECT count(*) FROM sentinela.pendencias_revisao),'audit',(SELECT count(*) FROM sentinela.eventos_auditoria),
  'consolidated',(SELECT count(*) FROM sentinela.ocorrencias)) AS data`)
await db.connect()
try {
  const identity = await sql(`SELECT jsonb_build_object('directory',current_setting('data_directory'),
    'port',inet_server_port(),'ssl',current_setting('ssl'),'migration',(SELECT max(versao) FROM sentinela.schema_migrations),
    'users',(SELECT count(*) FROM sentinela.usuarios),'install',sentinela_ambiente.instalacao()) AS data`)
  assert.equal(realpathSync(identity.directory), directory)
  assert.deepEqual([identity.port, identity.ssl, identity.users], [port, "on", 0])
  assert(["0010", "0011"].includes(identity.migration))
  assert.equal((await counts()).lots, 0)

  for (const [i, profile] of profiles.entries()) {
    await sql("INSERT INTO auth.users (id,email,raw_app_meta_data) VALUES ($1,$2,'{}')", [profile.id, `perfil-${i}@example.test`])
    await sql("INSERT INTO sentinela.usuarios(id,auth_user_id,nome_exibicao,perfil,ativo) VALUES ($1,$1,$2::text,$2::text,true)", [profile.id, profile.role])
    await sql("INSERT INTO auth.sessions(id,user_id) VALUES ($1,$2)", [profile.session, profile.id])
    if (profile !== analyst) await sql("INSERT INTO sentinela_general_accounts.individuals VALUES ($1,$2)", [profile.login, profile.id])
  }
  await sql(`INSERT INTO sentinela_gestao_autorizacao.release
    VALUES (true,'local-import-management-0001',repeat('a',64),
      sentinela_ambiente.instalacao(),sentinela_ambiente.sistema(),5432,true)`)
  const account = createHash("sha256").update(JSON.stringify(["sentinela-supabase", project, admin.id])).digest("hex")
  await sql("INSERT INTO sentinela_gestao_autorizacao.atores VALUES ($1,$1,$2,now()+interval '1 hour')", [admin.id, account])

  Object.assign(process.env, {
    NODE_ENV: "production", SENTINELA_AUTH_PROVIDER: "supabase", SENTINELA_IMPORT_MODE: "supabase",
    SENTINELA_SUPABASE_IMPORT_WRITE: "1", SENTINELA_APP_ORIGIN: origin,
    NEXT_PUBLIC_SUPABASE_URL: project, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    SENTINELA_SUPABASE_IMPORT_CA: ca, SENTINELA_SUPABASE_IMPORT_INSTALLATION: identity.install,
  })
  for (const profile of [admin, operator])
    process.env["SENTINELA_SUPABASE_IMPORT_URL_" + profile.login] = `postgresql://${profile.login}:fixture@${fixtureHost}:5432/postgres`
  for (const key of ["SENTINELA_INTEGRATED_SUPABASE", "SENTINELA_OPERATIONAL_CLONE", "SENTINELA_LOCAL_DEMO", "SENTINELA_PCDF_SYNTHETIC"])
    delete process.env[key]

  // Inject only the Auth transport. Use a real pg Client with the fixture certificate and hostname verification.
  // Map the fixture endpoint to its checked loopback port without changing the production validation.
  const connect = Socket.prototype.connect
  Socket.prototype.connect = function (...args) {
    return args[0] === 5432 && args[1] === fixtureHost
      ? connect.call(this, port, "127.0.0.1") : connect.apply(this, args)
  }
  registerHooks({ resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true }
    if (specifier === "next/headers") return {
      url: "data:text/javascript,export const headers=async()=>new Headers();export const cookies=async()=>({get:()=>undefined})",
      shortCircuit: true,
    }
    if (specifier === "next/server") return { url: "data:text/javascript,export const connection=async()=>{}", shortCircuit: true }
    if (specifier === "@/lib/supabase/server") return { url: "data:text/javascript,export default async()=>globalThis.importAuthFixture", shortCircuit: true }
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
      try { return next(specifier, context) } catch (error) {
        if (error.code === "ERR_MODULE_NOT_FOUND") return next(specifier + ".ts", context)
        throw error
      }
    }
    return next(specifier, context)
  } })
  function signIn(profile) {
    globalThis.importAuthFixture = profile ? {
      auth: {
        getUser: async () => ({ data: { user: { id: profile.id, app_metadata: {} } } }),
        getClaims: async () => ({ data: { claims: { sub: profile.id, session_id: profile.session } } }),
      },
      schema: () => ({ rpc: async () => ({ data: [{ usuario_id: profile.id, auth_user_id: profile.id,
        perfil: profile.role, nome_exibicao: profile.role, ativo: true }] }) }),
    } : null
  }
  const general = await import("../../../src/app/api/v1/importacoes/geral/route.ts")
  const detail = await import("../../../src/app/api/v1/importacoes/geral/[id]/route.ts")
  const pcdf = await import("../../../src/app/api/v1/importacoes/pcdf/direta/route.ts")
  const management = await import("../../../src/app/api/v1/ocorrencias/gestao/route.ts")
  const { generalFormats, generalUploadHeader } = await import("../../../src/contracts/general-import.ts")
  const { preparePcdfCsvDelivery } = await import("../../../src/lib/db/pcdf-v2-delivery.ts")
  const generalPath = "/api/v1/importacoes/geral"
  const pcdfPath = "/api/v1/importacoes/pcdf/direta"
  const managementPath = "/api/v1/ocorrencias/gestao"
  const request = (path, options) => new Request(origin + path, {
    ...options, headers: { host: "import.example.test", origin, ...options?.headers },
  })
  async function result(response, expected) {
    const output = await response.json()
    assert.equal(response.status, expected, JSON.stringify(output))
    return output.data
  }
  const mapping = { data: 0, horario: 1, naturezas: 2, ra: 3, local: 4, latitude: -1, longitude: -1 }
  const cells = ["Data", "Hora", "Tipo de crime", "Região Administrativa", "Local"]
  const row = ["2026-02-01", "13:34", "FURTO EM COMERCIO", "Plano Piloto", "Via sintética"]
  const csv = [cells, row, row].map(values => values.join(";")).join("\r\n")
  const book = utils.book_new()
  utils.book_append_sheet(book, utils.aoa_to_sheet([cells, row]), "Dados")
  const xlsx = write(book, { type: "buffer", bookType: "xlsx", compression: true })
  function generalUpload(bytes, format, key, overrides) {
    const selection = { name: `fixture.${format}`, mapping, sheet: format === "csv" ? "CSV" : "Dados", ...overrides }
    return general.POST(request(generalPath, { method: "POST", body: bytes, headers: {
      "content-type": generalFormats[format], "idempotency-key": key ?? randomUUID(),
      [generalUploadHeader]: encodeURIComponent(JSON.stringify(selection)),
    } }))
  }

  signIn(null)
  await result(await general.GET(request(generalPath)), 401)
  signIn(analyst)
  await result(await generalUpload(csv, "csv"), 403)
  signIn(operator)
  const key = randomUUID()
  process.env.SENTINELA_SUPABASE_IMPORT_WRITE = "0"
  await result(await generalUpload(csv, "csv", key), 403)
  process.env.SENTINELA_SUPABASE_IMPORT_WRITE = "1"
  const csvReceipt = await result(await generalUpload(csv, "csv", key), 201)
  assert.equal(csvReceipt.persisted, 2)
  assert.equal(csvReceipt.summary.possibleDuplicates, 1)
  const replay = await result(await generalUpload(csv, "csv", key), 200)
  assert.equal(replay.run, csvReceipt.run)
  const xlsxReceipt = await result(await generalUpload(xlsx, "xlsx"), 201)
  assert.equal(xlsxReceipt.persisted, 1)
  assert.equal(await sql("SELECT solicitado_por::text AS data FROM sentinela.lotes_importacao WHERE id=$1", [csvReceipt.lot]), operator.id)
  assert.equal((await result(await detail.GET(request(generalPath + "/" + csvReceipt.run), { params: Promise.resolve({ id: csvReceipt.run }) }), 200)).total, 2)
  assert.ok((await result(await general.GET(request(generalPath)), 200)).length >= 2)

  const original = await counts()
  await sql("ALTER TABLE sentinela.pendencias_revisao ADD CONSTRAINT fixture_rollback CHECK(false) NOT VALID")
  try {
    await result(await generalUpload(csv.replaceAll("Via sintética", "Via para rollback"), "csv"), 422)
  } finally {
    await sql("ALTER TABLE sentinela.pendencias_revisao DROP CONSTRAINT fixture_rollback")
  }
  assert.deepEqual(await counts(), { ...original, audit: original.audit + 2 })
  console.log("OK CSV, XLSX, histórico, recibo, duplicata, autoria, reenvio e rollback")

  const input = fixture()
  const legacy = v1(Buffer.from("fixture"), input.rows.slice(0, 1), false)
  async function uploadPcdf(file, step, version, sha) {
    const form = new FormData()
    form.append("csv", file)
    if (sha) form.append("sha256", sha)
    return pcdf.POST(request(pcdfPath + "?etapa=" + step + (version === "2" ? "&versao=2.0&modalidade=csv" : ""),
      { method: "POST", body: form }))
  }
  const legacyFile = new File([legacy.csv], "pcdf_naturezas_2021-01.csv")
  const preview = await result(await uploadPcdf(legacyFile, "validar", "1"), 200)
  const legacyReceipt = await result(await uploadPcdf(legacyFile, "confirmar", "1", preview.sha256), 201)
  assert.equal(legacyReceipt.records, 1)
  assert.equal((await result(await uploadPcdf(legacyFile, "confirmar", "1", preview.sha256), 200)).lot, legacyReceipt.lot)
  let v2Text = (await input.csv.text()).replaceAll("2021-01-13", "2021-02-13")
  for (const row of input.rows) {
    const id = createHash("sha256").update("fixture-v2:" + row.linha_origem_id).digest("hex")
    v2Text = v2Text.replace(row.linha_origem_id, id)
  }
  const v2 = new File([v2Text], "pcdf_naturezas_2021-02.csv")
  const prepared = await preparePcdfCsvDelivery(v2)
  await result(await uploadPcdf(v2, "validar", "2"), 403)
  signIn(admin)
  await result(await uploadPcdf(v2, "validar", "2"), 200)
  await result(await uploadPcdf(v2, "confirmar", "2", "0".repeat(64)), 409)
  const modernReceipt = await result(await uploadPcdf(v2, "confirmar", "2", prepared.preview.sha256), 201)
  assert.equal(modernReceipt.records, 2)
  assert.equal((await result(await uploadPcdf(v2, "confirmar", "2", prepared.preview.sha256), 200)).lot, modernReceipt.lot)
  assert.ok((await result(await pcdf.GET(request(pcdfPath)), 200)).some(item => item.lot === modernReceipt.lot))
  assert.equal((await counts()).consolidated, 0)
  assert.equal((await result(await management.GET(request(managementPath + "?view=disponibilidade")), 200)).escrita, "disponivel")
  const records = await result(await management.GET(request(managementPath + "?view=registros_lote&id=" + modernReceipt.lot)), 200)
  assert.equal(records.total, modernReceipt.records)
  const adjustment = id => request(managementPath + "?view=importados&id=" + id)
  const postManagement = command => management.POST(request(managementPath, { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify(command) }))
  const association = records.itens[0].id
  const raw = () => sql("SELECT campos_csv AS data FROM sentinela.linhas_staging WHERE id=$1", [association])
  const beforeEdit = await raw()
  const draft = await result(await management.GET(adjustment(association)), 200)
  const edit = { acao: "corrigir_associacao", id: association, lote: modernReceipt.lot,
    revisao: draft.revisao, alteracoes: { local: "Endereço revisado em homologação" }, justificativa: "Ensaio da trilha de auditoria" }
  signIn(operator)
  await result(await management.GET(request(managementPath + "?view=registros_lote&id=" + modernReceipt.lot)), 403)
  await result(await postManagement(edit), 403)
  signIn(admin)
  const saved = await result(await postManagement(edit), 200)
  const changed = await result(await management.GET(adjustment(association)), 200)
  assert.equal(changed.local, edit.alteracoes.local)
  assert.ok(changed.historico.some(event => event.id === saved.auditoria))
  assert.deepEqual(await raw(), beforeEdit)

  const plan = await result(await management.GET(request(managementPath + "?view=previa_exclusao&id=" + modernReceipt.lot)), 200)
  const deletion = { acao: "excluir_lote", id: modernReceipt.lot, revisao: plan.revisao,
    confirmacao: modernReceipt.lot, definitiva: true, justificativa: "Ensaio de remoção controlada" }
  assert.deepEqual(plan.bloqueios, [])
  await result(await postManagement(deletion), 403)
  await sql(`INSERT INTO sentinela_gestao_autorizacao.exclusoes(lote,usuario,revisao,aprovacao,prova_restauracao,validade)
    VALUES ($1,$2,$3,'Homologação descartável',repeat('a',64),now()+interval '10 minutes')`,
  [modernReceipt.lot, admin.id, plan.revisao])
  await result(await postManagement(deletion), 200)
  assert.equal(await sql("SELECT count(*)::int AS data FROM sentinela_exclusao.comprovantes WHERE lote=$1", [modernReceipt.lot]), 1)
  assert.equal((await counts()).consolidated, 0)
  await sql("DELETE FROM auth.sessions WHERE id=$1", [admin.session])
  await result(await pcdf.GET(request(pcdfPath)), 403)
  console.log("OK PCDF v1/v2, três perfis, revisão auditada, exclusão com autorização, sessão revogada e zero consolidações")
} finally {
  await db.end()
}
