import "../scripts/contracts-runtime.mjs"
import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { readFileSync, realpathSync } from "node:fs"
import { registerHooks } from "node:module"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import test from "node:test"
import { Client } from "pg"

const fixture = process.env.SENTINELA_OPER_DELTA_FIXTURE
const sha = value => createHash("sha256").update(value).digest("hex")
const account = sha("administrador institucional de fixture")
const { lotPurgePreview, lotPurgeHistory, managedLots, managedLotDetail, managedOccurrence } =
  await import("../src/contracts/occurrence-management.ts")
const { prepareGeneralImport } = await import("../src/lib/db/general-import-input.ts")

test("delta operacional em linha de base fabricada, sem cadastro manual ou PCDF v2", { skip: !fixture }, async t => {
  const root = realpathSync(fixture)
  assert.equal(dirname(root).toLowerCase(), realpathSync(tmpdir()).toLowerCase())
  assert.match(basename(root), /^sentinela-occurrence-management-[a-z0-9_]+$/i)
  const password = readFileSync(join(root, "setup-password"), "ascii")
  assert.match(password, /^[a-f0-9]{64}$/)
  const config = { host: "127.0.0.1", port: 55487, database: "sentinela_pcdf_local", user: "postgres", password,
    statement_timeout: 12000, lock_timeout: 3000, options: "-c row_security=on" }
  const clients = []
  async function connect(role) {
    const client = new Client(config)
    clients.push(client)
    await client.connect()
    const { rows: [destination] } = await client.query(`SELECT current_setting('data_directory') AS path,
      current_setting('sentinela.sandbox_uuid') AS marker,system_identifier::text AS system FROM pg_control_system()`)
    assert.equal(realpathSync(destination.path), realpathSync(join(root, "data")))
    assert.equal(destination.marker, process.env.SENTINELA_OPER_DELTA_UUID)
    assert.equal(destination.system, process.env.SENTINELA_OPER_DELTA_SYSTEM)
    if (role) await client.query("SET SESSION AUTHORIZATION " + role)
    return client
  }
  const data = async (client, sql, params = []) => (await client.query(sql, params)).rows[0]?.data
  try {
    const rootDb = await connect()
    const admin = await connect("sentinela_local_admin")
    const other = await connect("sentinela_local_admin")
    const operator = await connect("sentinela_local_operator")
    const analyst = await connect("sentinela_local_analyst")
    const subject = randomUUID()
    const identity = randomUUID()
    const { rows: seeds } = await rootDb.query(`SELECT l.id AS lot,l.competencia::text,s.id AS stage,s.execucao_id AS run,
      s.linha_origem_id AS origin,s.extracao_id AS extraction,s.campos_csv AS raw
      FROM sentinela.lotes_importacao l JOIN sentinela.linhas_staging s ON s.lote_id=l.id ORDER BY l.competencia`)
    assert.equal(seeds.length, 3)
    const [protectedLot, editLot, exclusive] = seeds
    let sharedRemaining
    const ready = (who = subject, key = account) =>
      data(admin, "SELECT sentinela_gestao_autorizacao.capacidade($1,$2) AS data", [who, key])
    const context = async () => managedOccurrence.parse(await data(admin,
      "SELECT sentinela_gestao.contexto('importados',$1) AS data", [editLot.stage]))
    const edit = (revisao, key = account, who = subject, client = admin) => data(client,
      "SELECT sentinela_gestao.mutar($1,$2,$3) AS data", [{ acao: "corrigir_associacao", id: editLot.stage,
        lote: editLot.lot, revisao, justificativa: "Correção autorizada na fixture", alteracoes: { local: "Local revisado" } }, key, who])
    const preview = async lot => lotPurgePreview.parse(await data(admin,
      "SELECT sentinela_exclusao.previa($1,$2,$3) AS data", [lot, subject, account]))
    const approve = plan => rootDb.query(`INSERT INTO sentinela_gestao_autorizacao.exclusoes
      (lote,usuario,revisao,aprovacao,prova_restauracao,validade)
      VALUES($1,$2,$3,'aprovacao-fixture','recuperacao-fixture',clock_timestamp()+interval '1 hour')
      ON CONFLICT(lote) DO UPDATE SET revisao=excluded.revisao`, [plan.id, subject, plan.revisao])
    const exclude = (plan, client = admin, patch = {}) => data(client, "SELECT sentinela_exclusao.excluir($1,$2,$3) AS data",
      [{ acao: "excluir_lote", id: plan.id, confirmacao: plan.id, definitiva: true, revisao: plan.revisao,
        justificativa: "Exclusão autorizada na fixture", ...patch }, account, subject])
    const inventory = (lot, db = rootDb) => data(db, `SELECT jsonb_build_object(
      'lote',(SELECT count(*) FROM sentinela.lotes_importacao WHERE id=$1),
      'staging',(SELECT count(*) FROM sentinela.linhas_staging WHERE lote_id=$1),
      'execucoes',(SELECT count(*) FROM sentinela.execucoes_importacao WHERE lote_id=$1),
      'auditorias',(SELECT count(*) FROM sentinela.eventos_auditoria WHERE depois->>'lot'=$1::text OR depois->>'loteId'=$1::text),
      'recibos',(SELECT count(*) FROM sentinela_import_local.requests WHERE receipt->>'lot'=$1::text),
      'autorizacoes',(SELECT count(*) FROM sentinela_gestao_autorizacao.exclusoes WHERE lote=$1),
      'comprovantes',(SELECT count(*) FROM sentinela_exclusao.comprovantes WHERE lote=$1)) AS data`, [lot])
    const absent = { lote: 0, staging: 0, execucoes: 0, auditorias: 0, recibos: 0, autorizacoes: 0, comprovantes: 1 }

    await t.test("instala fechada e valida vínculo, perfil e prazo", async () => {
      assert.equal(await ready(), false)
      await assert.rejects(edit("0".repeat(64)), { code: "42501" })
      await assert.rejects(admin.query("UPDATE sentinela_gestao_autorizacao.release SET aberta=true"), { code: "42501" })
      await rootDb.query("INSERT INTO sentinela.usuarios(id,auth_user_id,nome_exibicao,perfil,ativo) VALUES($1,$2,'Pessoa teste','Administrador',true)",
        [subject, identity])
      await rootDb.query("UPDATE sentinela_gestao_autorizacao.release SET aberta=true")
      assert.equal(await ready(), false)
      await rootDb.query("INSERT INTO sentinela_gestao_autorizacao.atores VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')",
        [subject, identity, account])
      assert.equal(await ready(), true)
      assert.equal(await ready(subject, sha("conta diferente")), false)
      assert.equal(await ready(randomUUID()), false)
      for (const unprivileged of [operator, analyst])
        await assert.rejects(edit("0".repeat(64), account, subject, unprivileged), { code: "42501" })
      await rootDb.query("UPDATE sentinela.usuarios SET ativo=false WHERE id=$1", [subject])
      assert.equal(await ready(), false)
      await rootDb.query("UPDATE sentinela.usuarios SET ativo=true WHERE id=$1", [subject])
      const catalog = managedLots.parse(await data(admin, "SELECT sentinela_gestao.arquivos($1) AS data", [{ pagina: 1 }]))
      assert.equal(catalog.total, 3)
      assert.equal(managedLotDetail.parse(await data(admin, "SELECT sentinela_gestao.arquivo($1) AS data", [editLot.lot])).id, editLot.lot)
    })

    await t.test("persiste autoria humana e revisão, preservando o CSV original", async () => {
      const before = await context()
      await assert.rejects(edit(before.revisao, sha("incorreto")), { code: "42501" })
      const changes = await Promise.allSettled([edit(before.revisao), edit(before.revisao, account, subject, other)])
      assert.equal(changes.filter(change => change.status === "fulfilled").length, 1, changes.map(change => change.reason?.message).join(" | "))
      assert.equal(changes.find(change => change.status === "rejected").reason.code, "40001")
      const saved = changes.find(change => change.status === "fulfilled").value
      const after = await context()
      assert.equal(after.local, "Local revisado")
      assert.equal(after.historico[0].responsavel, subject)
      assert.notEqual(after.revisao, before.revisao)
      assert.deepEqual(await data(rootDb, "SELECT jsonb_build_array(ator_tipo,usuario_id,servico) AS data FROM sentinela.eventos_auditoria WHERE id=$1",
        [saved.auditoria]), ["usuario", subject, null])
      assert.deepEqual(await data(rootDb, "SELECT campos_csv AS data FROM sentinela.linhas_staging WHERE id=$1", [editLot.stage]), editLot.raw)
      const filtered = await data(admin, "SELECT sentinela_ocorrencias_local.lista('importados',$1,1,'identificacao','asc') AS data",
        [{ lote: editLot.lot }])
      assert.equal(filtered.total, 1)
      assert.equal(filtered.itens[0].local, "Local revisado")
    })

    await t.test("bloqueia lote protegido, vínculo novo e revisão não autorizada", async () => {
      const protectedPlan = await preview(protectedLot.lot)
      assert.ok(protectedPlan.bloqueios.some(block => block.tipo === "lote_protegido"))
      await approve(protectedPlan)
      await assert.rejects(exclude(protectedPlan), { code: "40001" })
      const plan = await preview(exclusive.lot)
      assert.equal(plan.autorizada, false)
      assert.deepEqual(plan.bloqueios, [])
      await assert.rejects(exclude(plan), { code: "42501" })
      await assert.rejects(exclude({ ...plan, revisao: "0".repeat(64) }), { code: "40001" })
      await assert.rejects(exclude(plan, admin, { confirmacao: randomUUID() }), { code: "22023" })
      await rootDb.query("CREATE TABLE sentinela_exclusao.fixture_fk(lote uuid REFERENCES sentinela.lotes_importacao(id) ON DELETE CASCADE)")
      try {
        const blocked = await preview(exclusive.lot)
        assert.ok(blocked.bloqueios.some(block => block.tipo === "dependencia_desconhecida"))
        await assert.rejects(exclude(blocked), { code: "40001" })
      } finally { await rootDb.query("DROP TABLE sentinela_exclusao.fixture_fk") }
    })

    await t.test("reverte falha tardia e confirma remoção exclusiva e consumo da aprovação", async () => {
      const plan = await preview(exclusive.lot)
      await approve(plan)
      const confirmed = await preview(exclusive.lot)
      assert.equal(confirmed.autorizada, true)
      const before = await inventory(exclusive.lot)
      await rootDb.query("ALTER TABLE sentinela_exclusao.comprovantes ADD CONSTRAINT fixture_falha CHECK (lote IS NULL) NOT VALID")
      try {
        await assert.rejects(exclude(confirmed), { code: "23514" })
        assert.deepEqual(await inventory(exclusive.lot), before)
      } finally { await rootDb.query("ALTER TABLE sentinela_exclusao.comprovantes DROP CONSTRAINT fixture_falha") }
      const attempts = await Promise.allSettled([exclude(confirmed), exclude(confirmed, other)])
      assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1)
      assert.equal(attempts.find(result => result.status === "rejected").reason.code, "P0002")
      const reconnect = await connect()
      assert.deepEqual(await inventory(exclusive.lot, reconnect), absent)
      for (const [relation, id] of [["linhas_origem", exclusive.origin], ["extracoes_origem", exclusive.extraction]])
        assert.equal(await data(reconnect, "SELECT count(*)::int AS data FROM sentinela." + relation + " WHERE id=$1", [id]), 0)
      assert.equal(await data(reconnect, "SELECT count(*)::int AS data FROM sentinela.pendencias_revisao WHERE linha_origem_id=$1", [exclusive.origin]), 0)
      const history = lotPurgeHistory.parse(await data(admin, "SELECT sentinela_exclusao.historico(1) AS data"))
      const [proof] = history.itens
      assert.equal(proof.responsavel, subject)
      assert.deepEqual(Object.keys(proof).sort(), ["id", "justificativa", "lote", "momento", "quantidades", "responsavel"])
    })

    await t.test("preserva origem, pendências e extração compartilhadas por outro lote", async () => {
      const peer = randomUUID(), run = randomUUID()
      await rootDb.query(`INSERT INTO sentinela.lotes_importacao(id,extracao_id,nome_arquivo,sha256_arquivo,
        tamanho_bytes,referencia_arquivo,versao_contrato,versao_tratamento,competencia,solicitado_por)
        SELECT $2,extracao_id,'fixture-compartilhada.csv',$3,100,'fixture:partilha','1.0','fixture',competencia,solicitado_por
        FROM sentinela.lotes_importacao WHERE id=$1`, [editLot.lot, peer, sha(peer)])
      await rootDb.query(`INSERT INTO sentinela.execucoes_importacao(id,lote_id,extracao_id,tentativa,solicitado_por,
        versao_importador,versao_validacao,status,linhas_lidas,linhas_processadas,linhas_bloqueadas,finalizado_em)
        SELECT $2,id,extracao_id,1,solicitado_por,'pcdf-local-v1','pcdf-local-v1','concluida',1,1,1,clock_timestamp()
        FROM sentinela.lotes_importacao WHERE id=$1`, [peer, run])
      await rootDb.query(`INSERT INTO sentinela.linhas_staging(execucao_id,lote_id,extracao_id,linha_origem_id,registro_csv,
        campos_csv,derivados_efetivos,diagnosticos,estado)
        SELECT $2,$3,extracao_id,linha_origem_id,registro_csv,campos_csv,derivados_efetivos,diagnosticos,estado
        FROM sentinela.linhas_staging WHERE id=$1`, [editLot.stage, run, peer])
      const plan = await preview(editLot.lot)
      assert.deepEqual(plan.bloqueios, [])
      assert.equal(plan.compartilhadas, 1)
      assert.equal(plan.quantidades.origens, 0)
      assert.equal(plan.quantidades.extracoes, 0)
      assert.equal(plan.quantidades.pendencias, 0)
      await approve(plan)
      await exclude(plan)
      assert.deepEqual(await inventory(editLot.lot), absent)
      assert.equal((await inventory(peer)).staging, 1)
      sharedRemaining = peer
      assert.equal(await data(rootDb, "SELECT count(*)::int AS data FROM sentinela.linhas_origem WHERE id=$1", [editLot.origin]), 1)
      assert.ok(await data(rootDb, "SELECT count(*)::int AS data FROM sentinela.pendencias_revisao WHERE linha_origem_id=$1", [editLot.origin]))
    })

    await t.test("exclui recibo e histórico exclusivo de importação geral", async () => {
      const importedBy = await data(rootDb, "SELECT subject AS data FROM sentinela_general_accounts.individuals WHERE login='sentinela_local_admin'")
      const file = Buffer.from("Data;Hora;Natureza;RA;Local\n08/01/2025;13:04;Furto;Plano Piloto;Fixture geral")
      const { metadata, summary, rows } = await prepareGeneralImport(file, { format: "csv", selection: {
        name: "fixture-geral.csv", sheet: "CSV", delimiter: ";",
        mapping: { data: 0, horario: 1, naturezas: 2, ra: 3, local: 4, latitude: -1, longitude: -1 },
      } })
      const request = randomUUID()
      const batch = { summary, rows }
      await admin.query("SELECT sentinela_import_local.begin_request($1,$2,$3,$4,$5)", [importedBy, request, metadata, file, batch])
      const saved = await data(admin, "SELECT sentinela_import_local.receive($1,$2,$3) AS data", [importedBy, request, batch])
      const plan = await preview(saved.lot)
      assert.equal(plan.contrato, "geral-v1")
      assert.equal(plan.quantidades.recibos, 1)
      assert.deepEqual(plan.bloqueios, [])
      await approve(plan)
      await exclude(plan)
      assert.deepEqual(await inventory(saved.lot), absent)
      assert.equal(await data(rootDb, "SELECT count(*)::int AS data FROM sentinela.eventos_auditoria WHERE request_id=$1", [request]), 0)
    })

    await t.test("o handler operacional chama as funções atestadas e volta a 403 ao fechar a liberação", async () => {
      const key = "SENTINELA_PCDF_LOCAL_PASSWORD_sentinela_local_admin"
      assert.equal(process.env[key], undefined)
      const credential = sha(randomUUID())
      await rootDb.query("ALTER ROLE sentinela_local_admin PASSWORD '" + credential + "'")
      process.env[key] = credential
      const origin = "http://localhost:3000"
      const localEnv = { NODE_ENV: "development", SENTINELA_AUTH_PROVIDER: "local",
        SENTINELA_LOCAL_BIND: "127.0.0.1", SENTINELA_APP_ORIGIN: origin }
      const savedEnv = Object.fromEntries(Object.keys(localEnv).map(key => [key, process.env[key]]))
      Object.assign(process.env, localEnv)
      const slot = Symbol.for("sentinela-operational-delta-handler")
      const epoch = await data(rootDb, "SELECT extract(epoch FROM pg_postmaster_start_time())::bigint::text AS data")
      globalThis[slot] = {
        mode: { origin, port: 55487, id: process.env.SENTINELA_OPER_DELTA_UUID,
          system: process.env.SENTINELA_OPER_DELTA_SYSTEM, epoch },
        actor: { source: "local", role: "Administrador", localSubject: subject, localAccountId: account },
      }
      const bindings = "const fixture=globalThis[Symbol.for('sentinela-operational-delta-handler')]; "
      const stubs = new Map([
        ["server-only", "export {};"],
        ["@/lib/db/pcdf-direct-mode", bindings
          + "export * from " + JSON.stringify(new URL("../src/lib/db/pcdf-direct-mode.ts", import.meta.url).href) + ";"
          + " export const directDatabasePort=55487; export const integratedImportMode=()=>fixture.mode;"],
        ["@/lib/db/occurrence-management-mode", bindings +
          "export const occurrenceManagementMode=()=>null; export const operationalOccurrenceManagementMode=()=>fixture.mode;"],
        ["@/lib/auth/local-server", bindings + "export const getLocalPrincipal=()=>fixture.actor;"],
      ])
      const hook = registerHooks({ resolve(specifier, resolution, next) {
        return stubs.has(specifier)
          ? { url: "data:text/javascript," + encodeURIComponent(stubs.get(specifier)), shortCircuit: true }
          : next(specifier, resolution)
      } })
      try {
        // Replace session and destination only. The handler and its attested DB client are real.
        const { GET, POST } = await import("../src/app/api/v1/ocorrencias/gestao/route.ts")
        const read = async search => {
          const result = await GET(new Request(origin + "/api/v1/ocorrencias/gestao?" + new URLSearchParams(search),
            { headers: { host: "localhost:3000" } }))
          assert.equal(result.status, 200)
          return (await result.json()).data
        }
        const send = (payload, source = origin) => POST(new Request(origin + "/api/v1/ocorrencias/gestao", {
          method: "POST", headers: { host: "localhost:3000", origin: source, "content-type": "application/json" },
          body: JSON.stringify(payload),
        }))
        const stage = await data(rootDb, "SELECT id AS data FROM sentinela.linhas_staging WHERE lote_id=$1", [sharedRemaining])
        const target = await read({ view: "importados", id: stage })
        assert.equal((await read({ view: "disponibilidade" })).escrita, "disponivel")
        assert.equal((await read({ view: "arquivos", busca: sharedRemaining })).total, 1)
        const change = { acao: "corrigir_associacao", id: stage, lote: sharedRemaining, revisao: target.revisao,
          justificativa: "Ensaio do handler operacional", alteracoes: { local: "Campo revisto via HTTP" } }
        assert.equal((await send(change, "http://localhost:3001")).status, 403)
        const saved = await send(change)
        assert.equal(saved.status, 200)
        assert.equal((await saved.json()).meta.execution.persisted, true)
        const plan = await read({ view: "previa_exclusao", id: sharedRemaining })
        assert.equal(plan.autorizada, false)
        const purge = { acao: "excluir_lote", id: plan.id, confirmacao: plan.id, revisao: plan.revisao,
          definitiva: true, justificativa: "Ensaio do handler operacional" }
        assert.equal((await send(purge)).status, 403)
        await approve(plan)
        assert.equal((await read({ view: "previa_exclusao", id: sharedRemaining })).autorizada, true)
        assert.equal((await send(purge)).status, 200)
        assert.deepEqual(await inventory(plan.id), absent)
        await rootDb.query("UPDATE sentinela_gestao_autorizacao.release SET aberta=false")
        assert.equal((await send(change)).status, 403)
        assert.equal((await read({ view: "disponibilidade" })).escrita, "ambiente_bloqueado")
      } finally {
        hook.deregister()
        delete process.env[key]
        for (const [name, value] of Object.entries(savedEnv)) {
          if (value === undefined) delete process.env[name]
          else process.env[name] = value
        }
        delete globalThis[slot]
      }
    })
  } finally {
    await Promise.all(clients.map(client => client.end()))
  }
})
