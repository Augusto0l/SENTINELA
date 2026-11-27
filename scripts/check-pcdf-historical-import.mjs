import "./contracts-runtime.mjs"
import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { readFile, realpath, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import pg from "pg"
import { historicalMonth, historicalReceipt } from "../src/contracts/pcdf-direct.ts"
import { preparePcdfCsvDelivery } from "../src/lib/db/pcdf-v2-delivery.ts"
const { analyticsSql } = await import("../src/lib/db/analytics-query.ts")
const { persistentAnalyticsData } = await import("../src/contracts/persistent-analytics.ts")

const root = await realpath(process.env.SENTINELA_CATALOG_CLONE_ROOT)
assert.match(basename(root), /^clone-[0-9a-f]{32}$/)
assert.equal(dirname(root).toLowerCase(), (await realpath(join(process.env.USERPROFILE,
  ".sentinela-local", "homologacao-clone"))).toLowerCase())
const load = async name => JSON.parse(await readFile(join(root, name), "utf8"))
const identity = await load("identity-55487.json")
const { origin } = await load("backup.json")
assert.equal(identity.port, 55487)
assert.notEqual(identity.system, origin.system)
assert.notEqual(identity.uuid, origin.uuid)

const connection = { host: "127.0.0.1", port: 55487, database: "sentinela_pcdf_local", user: "postgres",
  password: process.env.SENTINELA_PG_REVIEW_CLONE, connectionTimeoutMillis: 3000,
  application_name: "sentinela-qualificacao-historica-68", statement_timeout: 120000 }
const client = new pg.Client(connection)
await client.connect()
const query = async (statement, values) => (await client.query(statement, values)).rows
const readCatalog = async () => (await query("SELECT sentinela_pcdf_historico.status() AS data"))[0].data.map(item => historicalMonth.parse(item))
const [csvDir, option] = process.argv.slice(2)
const lastTwo = ["2026-07", "2026-08"]
const verifyPartial = option === "--all" || option === "--partial"
const [{ port, uuid, system, folder }] = await query(`SELECT inet_server_port() AS port,
  current_setting('sentinela.sandbox_uuid') AS uuid,system_identifier::text AS system,current_setting('data_directory') AS folder FROM pg_control_system()`)
assert.deepEqual([port, uuid, system], [55487, identity.uuid, identity.system])
assert.equal((await realpath(folder)).toLowerCase(), (await realpath(join(root, "data-55487"))).toLowerCase())

const jan = async () => (await query(`WITH origins AS (
 SELECT linha_origem_id FROM sentinela.linhas_staging WHERE lote_id='84908630-bd04-4a03-923d-616649c8de74'
 ), links AS (
 SELECT a.* FROM sentinela.ocorrencia_naturezas a JOIN origins o ON o.linha_origem_id=a.linha_origem_id
 ), fingerprints AS (
 SELECT to_jsonb(l)::text AS row FROM links l UNION ALL
 SELECT to_jsonb(o)::text FROM sentinela.ocorrencias o WHERE id IN (SELECT ocorrencia_id FROM links) UNION ALL
 SELECT to_jsonb(p)::text FROM sentinela.pendencias_revisao p JOIN origins o ON o.linha_origem_id=p.linha_origem_id
 ) SELECT encode(sha256(convert_to(string_agg(encode(sha256(convert_to(row,'UTF8')),'hex'),'' ORDER BY row),'UTF8')),'hex') AS hash
 FROM fingerprints`))[0].hash

async function prepared(month) {
  const name = `pcdf_naturezas_${month}.csv`
  const bytes = await readFile(join(csvDir, name))
  const delivery = await preparePcdfCsvDelivery(new File([bytes], name), true)
  assert.equal(delivery.preview.standalone.invalid, 0)
  return { bytes, batch: delivery.batch }
}

async function receive(user, account, { bytes, batch }) {
  await query("SET LOCAL SESSION AUTHORIZATION sentinela_local_admin")
  const [{ data }] = await query("SELECT sentinela_pcdf_historico.receive($1,$2,$3,$4,$5) AS data",
    [randomUUID(), user, account, batch, bytes])
  await query("RESET SESSION AUTHORIZATION")
  return historicalReceipt.parse(data)
}

const start = Date.now()
try {
  const original = await readCatalog()
  assert.equal(original.length, 68)
  const janHash = await jan()
  assert.deepEqual([original[0].state, original[0].unique, original[0].links, original[0].review], ["done", 6090, 6392, 1])
  const account = randomBytes(32).toString("hex")
  // Clone fixtures for the institutional actor and release; restore after the assay.
  const actorRows = await query("SELECT usuario,conta,validade::text FROM sentinela_gestao_autorizacao.atores")
  assert.equal(actorRows.length, 1)
  const [{ usuario, conta, validade }] = actorRows
  const [release] = await query("SELECT cluster_uuid,system_id,porta,aberta FROM sentinela_gestao_autorizacao.release")
  await query("UPDATE sentinela_gestao_autorizacao.atores SET conta=$1,validade=clock_timestamp()+interval '3 hours'", [account])
  await query("UPDATE sentinela_gestao_autorizacao.release SET cluster_uuid=$1,system_id=$2,porta=55487,aberta=true",
    [identity.uuid, identity.system])
  try {
    if (original[1].state === "missing") {
      await query("BEGIN")
      const january = await receive(usuario, account, await prepared("2021-01"))
      assert.equal(january.replay, true)
      await query("COMMIT")

      const february = await prepared("2021-02")
      await query("BEGIN")
      await assert.rejects(receive(usuario, account, { ...february, bytes: Buffer.concat([february.bytes, Buffer.from("\n")]) }),
        { code: "22023" })
      await query("ROLLBACK")

      await query("BEGIN")
      const trial = await receive(usuario, account, february)
      assert.deepEqual([trial.unique, trial.links, trial.replay], [5221, 5490, false])
      await query("ROLLBACK")
      assert.equal((await readCatalog())[1].state, "missing")
      assert.equal(await jan(), janHash)

      await query("BEGIN")
      const feb = await receive(usuario, account, february)
      assert.deepEqual([feb.unique, feb.links, feb.replay], [5221, 5490, false])
      await query("COMMIT")
      await query("BEGIN")
      assert.deepEqual(await receive(usuario, account, february), { ...feb, replay: true })
      await query("COMMIT")
      console.log("Janeiro preservado, hash incorreto recusado, fevereiro homologado, rollback e reenvio atômicos.")
    }
    const competing = new pg.Client(connection)
    await competing.connect()
    try {
      const february = await prepared("2021-02")
      await competing.query("BEGIN")
      await competing.query("SELECT pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0))")
      await query("BEGIN")
      await query("SET LOCAL lock_timeout='250ms'")
      await assert.rejects(receive(usuario, account, february), { code: "55P03" })
      await query("ROLLBACK")
      console.log("Bloqueio transacional recusou uma confirmação concorrente da mesma competência.")
    } finally {
      await competing.end()
    }
    const collisionMonth = (await readCatalog()).find(item => item.state === "missing")
    if (collisionMonth) {
      const delivery = await prepared(collisionMonth.month)
      const byKey = Map.groupBy(delivery.batch.rows, ({ raw }) => raw.ocorrencia_chave)
      const { raw } = [...byKey.values()].find(rows => rows.length === 1)[0]
      await query("BEGIN")
      await query(`INSERT INTO sentinela.ocorrencias(origem,fonte,ano_registro,unidade_registro,numero_registro,versao_identidade)
        VALUES ('importacao','PCDF',$1,$2,$3,'fixture-reversivel')`,
      [raw.ano_registro, raw.unidade_registro, raw.numero_registro])
      const quarantined = await receive(usuario, account, delivery)
      assert(quarantined.review >= 1)
      assert.equal(quarantined.links + quarantined.review, quarantined.records)
      const [classified] = await query(`SELECT count(*)::int AS total
        FROM sentinela.pendencias_revisao p JOIN sentinela.linhas_origem o ON o.id=p.linha_origem_id
        WHERE p.regra='identidade_em_conflito' AND o.linha_origem_id=$1`, [raw.linha_origem_id])
      assert.equal(classified.total, 1)
      await query("ROLLBACK")
      assert.equal((await readCatalog()).find(item => item.month === collisionMonth.month).state, "missing")
      console.log("Colisão com ocorrência de outra origem isolada em revisão e revertida.")
    }
    if (verifyPartial) {
      const scheduled = (await readCatalog()).filter(item => item.state !== "done"
        && (option === "--all" || lastTwo.includes(item.month)))
      for (const expected of scheduled) {
        const input = await prepared(expected.month)
        await query("BEGIN")
        const result = await receive(usuario, account, input)
        assert.equal(result.sha256, expected.sha256)
        assert.equal(result.links + result.review, expected.records)
        assert.equal(result.state, "done")
        await query("COMMIT")
        console.log(`${result.month} ${result.records} associações, ${result.unique} ocorrências, ${result.review} em revisão`)
      }
    }
    const outcomes = await readCatalog()
    assert.equal(await jan(), janHash)
    const [counts] = await query(`SELECT (SELECT count(*)::int FROM sentinela.linhas_origem) AS origins,
      (SELECT count(*)::int FROM sentinela.ocorrencias) AS occurrences,
      (SELECT count(*)::int FROM sentinela.ocorrencia_naturezas) AS links,
      (SELECT count(*)::int FROM sentinela.ocorrencias WHERE geometria IS NOT NULL OR ra_id IS NOT NULL
        OR latitude IS NOT NULL OR longitude IS NOT NULL) AS geo,
      (SELECT count(*)::int FROM sentinela.ocorrencia_naturezas WHERE natureza_id IS NULL) AS unmapped,
      (SELECT count(*)::int FROM sentinela.eventos_auditoria WHERE acao='pcdf.consolidacao_historica') AS events`)
    assert.equal(counts.geo, 0)
    assert.equal(counts.unmapped, 0)
    const completed = outcomes.filter(item => item.state === "done")
    assert.equal(counts.events, completed.length - 1)
    for (const [field, key] of [["origins", "records"], ["occurrences", "unique"], ["links", "links"]])
      assert.equal(counts[field], completed.reduce((sum, item) => sum + item[key], 0))
    if (option === "--all") {
      assert.equal(completed.length, 68)
      assert.deepEqual([counts.origins, counts.occurrences, counts.links], [369660, 349579, 369656])
      assert.deepEqual(completed.filter(item => item.review).map(item => [item.month, item.review]),
        [["2021-01", 1], ["2024-01", 1], ["2026-01", 2]])
    }
    for (const role of ["admin", "operator", "analyst"]) {
      await query("BEGIN READ ONLY")
      await query(`SET LOCAL SESSION AUTHORIZATION sentinela_local_${role}`)
      const [access] = await query(`SELECT has_function_privilege('sentinela_pcdf_historico.status()','EXECUTE') AS history,
       has_function_privilege('sentinela_pcdf_historico.receive(uuid,uuid,text,jsonb,bytea)','EXECUTE') AS approve,
       has_table_privilege('sentinela_pcdf_historico.arquivos','SELECT') AS direct`)
      assert.deepEqual(access, { history: role !== "analyst", approve: role === "admin", direct: false })
      const [{ data }] = await query("SELECT sentinela_pcdf_historico.coverage() AS data")
      assert.equal(data.length, 68)
      assert.equal(data[0].status, "complete")
      assert.equal(data.at(-1).status, verifyPartial ? "partial" : "not_imported")
      await query("ROLLBACK")
    }
    await query("BEGIN READ ONLY")
    await query("SET LOCAL SESSION AUTHORIZATION sentinela_local_analyst")
    const analytics = async (filter = {}) => {
      const { text, values } = analyticsSql(filter, "integrated")
      return persistentAnalyticsData.parse((await query(text, values))[0].data)
    }
    const series = await analytics()
    assert.equal(series.total, counts.occurrences)
    assert.deepEqual(series.timeline, completed.map(item => ({ key: item.month, count: item.unique })))
    assert.equal(series.natures.length, 41)
    assert.deepEqual([series.points, series.heatReference, series.byRa], [[], [], []])
    const februaryRange = { startDate: "2021-02-01", endDate: "2021-02-28" }
    const february = await analytics(februaryRange)
    const nature = february.natures.find(item => item.name === february.byNature[0].key)
    assert.equal((await analytics({ ...februaryRange, nature: nature.id })).total, february.byNature[0].count)
    if (verifyPartial) {
      const august = await analytics({ startDate: "2026-08-01", endDate: "2026-08-31" })
      assert.equal(august.total, completed.at(-1).unique)
      assert.equal((await analytics({ startDate: "2026-08-19", endDate: "2026-08-31" })).total, 0)
    }
    await query("ROLLBACK")
    const result = { counts, completed: completed.length, januaryPreserved: true, outcomes, seconds: Math.round((Date.now() - start) / 1000) }
    const suffix = option === "--all" ? "68" : verifyPartial ? "partial" : "pilot"
    await writeFile(join(root, `pcdf-historical-${suffix}.json`), JSON.stringify(result, null, 2))
    console.log(JSON.stringify({ counts, completed: result.completed, seconds: result.seconds }))
  } finally {
    await query("ROLLBACK").catch(() => {})
    await query("RESET SESSION AUTHORIZATION")
    await query("UPDATE sentinela_gestao_autorizacao.atores SET conta=$1,validade=$2 WHERE usuario=$3", [conta, validade, usuario])
    await query("UPDATE sentinela_gestao_autorizacao.release SET cluster_uuid=$1,system_id=$2,porta=$3,aberta=$4",
      [release.cluster_uuid, release.system_id, release.porta, release.aberta])
  }
} finally {
  await client.end()
}
