import "./contracts-runtime.mjs"
import assert from "node:assert/strict"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { readFile, realpath, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import pg from "pg"
import { preparePcdfCsvDelivery } from "../src/lib/db/pcdf-v2-delivery.ts"
const { analyticsSql } = await import("../src/lib/db/analytics-query.ts")
const { persistentAnalyticsData } = await import("../src/contracts/persistent-analytics.ts")

const root = await realpath(process.env.SENTINELA_CATALOG_CLONE_ROOT)
assert.match(basename(root), /^clone-[0-9a-f]{32}$/)
assert.equal(dirname(root).toLowerCase(), (await realpath(join(process.env.USERPROFILE,
  ".sentinela-local", "homologacao-clone"))).toLowerCase())
const load = async (name) => JSON.parse(await readFile(join(root, name), "utf8"))
const identity = await load("identity-55487.json")
const { origin } = await load("backup.json")
assert.equal(identity.port, 55487)
assert.notEqual(identity.system, origin.system)
assert.notEqual(identity.uuid, origin.uuid)

const [csvFile, manifestFile] = process.argv.slice(2)
const month = "2021-02"
const filename = `pcdf_naturezas_${month}.csv`
assert.equal(basename(csvFile), filename)
const manifest = JSON.parse(await readFile(manifestFile, "utf8"))
const hash = (value) => createHash("sha256").update(value).digest("hex")
const bytes = await readFile(csvFile)
const sha = "da6ee640e44b627198deb253cbdb5d078f5af2f877d4a97b2fb092aac459fa8c"
assert.equal(hash(bytes), sha)
assert.equal(manifest.competencia, month)
assert.equal(manifest.crs_origem, null)
assert.deepEqual(manifest.arquivos[filename], { bytes: bytes.length, sha256: sha })
const prepared = await preparePcdfCsvDelivery(new File([bytes], filename), true)
const { batch } = prepared
assert.equal(batch.records, 5490)
assert.equal(batch.candidates, 5221)
assert.equal(batch.sha256, sha)
const sql = await readFile(new URL("../database/local/pcdf-sandbox/pcdf-history-consolidation.sql", import.meta.url), "utf8")
const client = new pg.Client({ host: "127.0.0.1", port: 55487, database: "sentinela_pcdf_local", user: "postgres",
  password: process.env.SENTINELA_PG_REVIEW_CLONE, connectionTimeoutMillis: 3000,
  application_name: "sentinela-homologacao-historica", statement_timeout: 90000 })
await client.connect()
const query = async (statement, values) => (await client.query(statement, values)).rows
const [target] = await query(`SELECT inet_server_port() AS port,
  current_setting('sentinela.sandbox_uuid') AS uuid, system_identifier::text AS system,
  current_setting('data_directory') AS folder FROM pg_control_system()`)
assert.deepEqual([target.port, target.uuid, target.system], [55487, identity.uuid, identity.system])
assert.equal((await realpath(target.folder)).toLowerCase(), (await realpath(join(root, "data-55487"))).toLowerCase())

const januaryLot = "84908630-bd04-4a03-923d-616649c8de74"
const janSnapshot = async () => (await query(`WITH s AS MATERIALIZED (
  SELECT * FROM sentinela.linhas_staging WHERE lote_id=$1
 ), a AS MATERIALIZED (
  SELECT a.* FROM sentinela.ocorrencia_naturezas a JOIN s ON s.linha_origem_id=a.linha_origem_id
 ), o AS MATERIALIZED (
  SELECT * FROM sentinela.ocorrencias WHERE id IN (SELECT ocorrencia_id FROM a)
 ), all_rows(table_name,row_hash) AS (
  SELECT 'staging',sha256(convert_to(to_jsonb(s)::text,'UTF8')) FROM s UNION ALL
  SELECT 'vinculos',sha256(convert_to(to_jsonb(a)::text,'UTF8')) FROM a UNION ALL
  SELECT 'ocorrencias',sha256(convert_to(to_jsonb(o)::text,'UTF8')) FROM o UNION ALL
  SELECT 'origens',sha256(convert_to(to_jsonb(r)::text,'UTF8')) FROM sentinela.linhas_origem r JOIN s ON s.linha_origem_id=r.id UNION ALL
  SELECT 'pendencias',sha256(convert_to(to_jsonb(p)::text,'UTF8')) FROM sentinela.pendencias_revisao p JOIN s ON s.linha_origem_id=p.linha_origem_id UNION ALL
  SELECT 'lote',sha256(convert_to(to_jsonb(l)::text,'UTF8')) FROM sentinela.lotes_importacao l WHERE l.id=$1 UNION ALL
  SELECT 'extracao',sha256(convert_to(to_jsonb(x)::text,'UTF8')) FROM sentinela.extracoes_origem x
    JOIN sentinela.lotes_importacao l ON l.extracao_id=x.id WHERE l.id=$1 UNION ALL
  SELECT 'execucao',sha256(convert_to(to_jsonb(e)::text,'UTF8')) FROM sentinela.execucoes_importacao e WHERE e.lote_id=$1
 ) SELECT table_name,count(*)::int AS count,encode(sha256(convert_to(string_agg(encode(row_hash,'hex'),''
    ORDER BY row_hash),'UTF8')),'hex') AS sha256 FROM all_rows GROUP BY table_name ORDER BY table_name`, [januaryLot]))

async function receive(auth, delivery, content) {
  await query("SET SESSION AUTHORIZATION sentinela_local_admin")
  const [{ data }] = await query("SELECT sentinela_pcdf_local.receive_csv($1,$2,$3,$4,$5) AS data",
    [randomUUID(), auth.usuario, auth.conta, delivery, content])
  await query("RESET SESSION AUTHORIZATION")
  return data
}

async function setupAuthorization() {
  await query(`CREATE TEMP TABLE history_actor_before ON COMMIT DROP AS SELECT * FROM sentinela_gestao_autorizacao.atores;
    CREATE TEMP TABLE history_release_before ON COMMIT DROP AS SELECT * FROM sentinela_gestao_autorizacao.release`)
  const actors = await query(`UPDATE sentinela_gestao_autorizacao.atores
    SET conta=$1,validade=statement_timestamp()+interval '5 minutes' RETURNING usuario,conta`, [randomBytes(32).toString("hex")])
  assert.equal(actors.length, 1)
  assert.equal((await query(`UPDATE sentinela_gestao_autorizacao.release SET porta=55487,cluster_uuid=$1,system_id=$2,aberta=true
    RETURNING singleton`, [identity.uuid, identity.system])).length, 1)
  return actors[0]
}

async function restoreAuthorization() {
  await query(`UPDATE sentinela_gestao_autorizacao.release t SET porta=b.porta,cluster_uuid=b.cluster_uuid,
    system_id=b.system_id,aberta=b.aberta FROM history_release_before b WHERE b.singleton=t.singleton;
    UPDATE sentinela_gestao_autorizacao.atores t SET conta=b.conta,validade=b.validade
    FROM history_actor_before b WHERE b.usuario=t.usuario`)
}

async function consolidate(receipt) {
  await query(`SELECT set_config('sentinela.history_uuid',$1,true),set_config('sentinela.history_system',$2,true),
    set_config('sentinela.history_lot',$3,true),set_config('sentinela.history_run',$4,true),
    set_config('sentinela.history_month',$5,true),set_config('sentinela.history_sha',$6,true)`,
  [identity.uuid, identity.system, receipt.lot, receipt.run, month + "-01", receipt.sha256])
  await query(sql)
  const [event] = await query(`SELECT id,depois FROM sentinela.eventos_auditoria
    WHERE execucao_id=$1 AND acao='pcdf.consolidacao_historica'`, [receipt.run])
  assert.equal(event.depois.consolidadas, 5221)
  assert.equal(event.depois.vinculos, 5490)
  assert.equal(event.depois.pontosValidados, 0)
  assert.equal(event.depois.gruposEmRevisao, 0)
  assert.equal(event.depois.origensEmRevisao, 0)
  return event
}

async function scopedState(receipt) {
  const [row] = await query(`WITH a AS MATERIALIZED (
    SELECT a.* FROM sentinela.ocorrencia_naturezas a JOIN sentinela.linhas_staging s
    ON s.linha_origem_id=a.linha_origem_id WHERE s.lote_id=$1
  ), o AS MATERIALIZED (
    SELECT * FROM sentinela.ocorrencias WHERE id IN (SELECT ocorrencia_id FROM a)
  ), p AS (
    SELECT p.* FROM sentinela.pendencias_revisao p
    JOIN sentinela.linhas_staging s ON s.linha_origem_id=p.linha_origem_id WHERE s.lote_id=$1
  )
  SELECT (SELECT count(*)::int FROM o) AS ocorrencias,
    (SELECT count(*)::int FROM a) AS vinculos,
    (SELECT count(*)::int FROM o WHERE horario_fato IS NULL) AS horario_nulo,
    (SELECT count(*)::int FROM o WHERE data_fato IS NULL) AS data_nula,
    (SELECT count(*)::int FROM o WHERE ra_id IS NOT NULL OR geometria IS NOT NULL OR latitude IS NOT NULL OR longitude IS NOT NULL) AS territorio_publicavel,
    (SELECT count(*)::int FROM (SELECT ocorrencia_id FROM a GROUP BY 1 HAVING count(DISTINCT natureza_id)>1) m) AS ocorrencias_multinatureza,
    (SELECT count(*)::int FROM a WHERE natureza_id IS NULL) AS vinculos_sem_catalogo,
    (SELECT count(*)::int FROM p) AS total_pendencias,
    (SELECT count(DISTINCT linha_origem_id)::int FROM p) AS origens_com_pendencia,
    (SELECT jsonb_object_agg(localizacao_status,n) FROM (SELECT localizacao_status,count(*) n FROM o GROUP BY 1) x) AS estado_geo,
    (SELECT jsonb_agg(to_jsonb(q) ORDER BY q.tipo,q.regra) FROM
      (SELECT tipo,regra,efeito,status,count(*)::int AS quantidade FROM p GROUP BY 1,2,3,4) q) AS pendencias,
    (SELECT encode(sha256(convert_to(string_agg(row_hash,'' ORDER BY row_hash),'UTF8')),'hex') FROM
      (SELECT encode(sha256(convert_to(to_jsonb(a)::text,'UTF8')),'hex') AS row_hash FROM a UNION ALL
       SELECT encode(sha256(convert_to(to_jsonb(o)::text,'UTF8')),'hex') FROM o UNION ALL
       SELECT encode(sha256(convert_to(to_jsonb(p)::text,'UTF8')),'hex') FROM p) hashes) AS sha256`, [receipt.lot])
  return row
}

async function warehouseCounts() {
  const [row] = await query(`SELECT (SELECT count(*) FROM sentinela.lotes_importacao) AS lotes,
    (SELECT count(*) FROM sentinela.extracoes_origem) AS extracoes,
    (SELECT count(*) FROM sentinela.linhas_origem) AS origens,
    (SELECT count(*) FROM sentinela.linhas_staging) AS staging,
    (SELECT count(*) FROM sentinela.execucoes_importacao) AS execucoes,
    (SELECT count(*) FROM sentinela.ocorrencias) AS ocorrencias,
    (SELECT count(*) FROM sentinela.ocorrencia_naturezas) AS vinculos,
    (SELECT count(*) FROM sentinela.pendencias_revisao) AS pendencias,
    (SELECT count(*) FROM sentinela.eventos_auditoria) AS eventos`)
  return row
}

async function analytics(filters) {
  const { text, values } = analyticsSql(filters, "integrated")
  const [{ data }] = await query(text, values)
  return persistentAnalyticsData.parse(data)
}

try {
  const baseline = await warehouseCounts()
  const januaryHashes = await janSnapshot()
  assert.equal(januaryHashes.find(({ table_name }) => table_name === "ocorrencias").count, 6090)
  await query("BEGIN")
  const trial = await receive(await setupAuthorization(), batch, bytes)
  assert.equal(trial.replay, false)
  await consolidate(trial)
  assert.equal((await scopedState(trial)).ocorrencias, 5221)
  await query("ROLLBACK")
  assert.deepEqual(await warehouseCounts(), baseline)
  assert.deepEqual(await janSnapshot(), januaryHashes)
  assert.deepEqual(await query("SELECT id FROM sentinela.lotes_importacao WHERE competencia='2021-02-01'"), [])

  await query("BEGIN")
  const auth = await setupAuthorization()
  await query("SAVEPOINT hash_validation")
  await assert.rejects(receive(auth, { ...batch, sha256: "0".repeat(64) }, bytes), { code: "22023" })
  await query("ROLLBACK TO SAVEPOINT hash_validation")
  const received = await receive(auth, batch, bytes)
  assert.equal(received.replay, false)
  const event = await consolidate(received)
  await restoreAuthorization()
  await query("COMMIT")

  const scope = await scopedState(received)
  assert.equal(scope.ocorrencias, 5221)
  assert.equal(scope.vinculos, 5490)
  assert.equal(scope.vinculos_sem_catalogo, 0)
  assert.equal(scope.territorio_publicavel, 0)
  assert.equal(scope.data_nula, 0)
  assert(scope.ocorrencias_multinatureza > 0)

  await query("BEGIN")
  const replayAuth = await setupAuthorization()
  const replay = await receive(replayAuth, batch, bytes)
  assert.deepEqual(replay, { ...received, replay: true })
  assert.deepEqual(await consolidate(replay), event)
  const otherBytes = Buffer.concat([bytes, Buffer.from("\r\n")])
  const conflict = await receive(replayAuth, { ...batch, sha256: hash(otherBytes) }, otherBytes)
  assert.deepEqual(conflict, { conflict: "competencia" })
  await restoreAuthorization()
  await query("COMMIT")
  assert.deepEqual(await scopedState(received), scope)
  assert.deepEqual(await janSnapshot(), januaryHashes)
  const audit = await query(`SELECT acao,count(*)::int FROM sentinela.eventos_auditoria WHERE execucao_id=$1 GROUP BY 1 ORDER BY 1`,
    [received.run])
  assert.deepEqual(Object.fromEntries(audit.map(({ acao, count }) => [acao, count])),
    { "pcdf.consolidacao_historica": 1, reenvio_pcdf: 1, staging_pcdf: 1, tentativa_pcdf: 2 })
  const { rows: foreignFailures } = await client.query(`SELECT conrelid::regclass::text,conname FROM pg_constraint
    WHERE contype='f' AND NOT convalidated AND connamespace='sentinela'::regnamespace`)
  assert.deepEqual(foreignFailures, [])

  const feb = { startDate: "2021-02-01", endDate: "2021-02-28" }
  const jan = { startDate: "2021-01-01", endDate: "2021-01-31" }
  const expectedTimeline = [{ key: "2021-01", count: 6090 }, { key: month, count: 5221 }]
  const [{ relation }] = await query("SELECT 'sentinela.linhas_origem'::regclass::oid AS relation")
  for (const role of ["sentinela_local_admin", "sentinela_local_operator", "sentinela_local_analyst"]) {
    await query("BEGIN READ ONLY")
    await query(`SET SESSION AUTHORIZATION ${role}`)
    assert.deepEqual((await analytics({})).timeline, expectedTimeline)
    assert.equal((await query("SELECT row_security_active($1::oid) AS rls", [relation]))[0].rls, true)
    await query("SAVEPOINT rls")
    await assert.rejects(query("SELECT * FROM sentinela.linhas_origem LIMIT 1"), { code: "42501" })
    await query("ROLLBACK TO SAVEPOINT rls")
    if (role !== "sentinela_local_admin") {
      await query("SAVEPOINT write_acl")
      await assert.rejects(query(`SELECT sentinela_pcdf_local.receive_csv(NULL,NULL,NULL,NULL,NULL)`), { code: "42501" })
      await query("ROLLBACK TO SAVEPOINT write_acl")
    }
    await query("ROLLBACK")
  }
  await query("BEGIN READ ONLY")
  await query("SET SESSION AUTHORIZATION sentinela_local_analyst")
  const all = await analytics({})
  assert.equal(all.total, 11311)
  assert.deepEqual(all.timeline, expectedTimeline)
  for (const key of ["byRa", "points", "heatReference"]) assert.deepEqual(all[key], [])
  const january = await analytics(jan)
  const february = await analytics(feb)
  assert.equal(january.total, 6090)
  assert.equal(february.total, 5221)
  assert.deepEqual((await analytics({ startDate: jan.startDate, endDate: feb.endDate })).timeline, expectedTimeline)
  assert.equal((await analytics({ startDate: "2021-03-01", endDate: "2021-03-31" })).total, 0)
  const selection = february.natures.find(value => value.name === february.byNature[0].key)
  assert.equal((await analytics({ ...feb, nature: selection.id })).total, february.byNature[0].count)
  assert.equal((await analytics({ ...feb, ra: "RA-01" })).total, 0)
  const hourBands = {}
  for (const hour of ["0-6", "6-12", "12-18", "18-24"]) hourBands[hour] = (await analytics({ ...feb, hour })).total
  assert.equal(Object.values(hourBands).reduce((sum, count) => sum + count, 0) + scope.horario_nulo, february.total)
  await query("ROLLBACK")

  const result = { received, event, scope, audit, januaryHashes, timeline: all.timeline, total: all.total,
    januaryByNature: january.byNature, februaryByNature: february.byNature, februaryHourBands: hourBands,
    monthlyVariation: (february.total - january.total) / january.total, foreignKeys: true,
    rolledBack: true, replayVerified: true, rlsProfiles: 3 }
  await writeFile(join(root, "pcdf-history-result.json"), JSON.stringify(result, null, 2), { flag: "wx" })
  console.log(JSON.stringify({ received, timeline: all.timeline, caseCounts: scope, audit }, null, 2))
} finally {
  await client.end()
}
