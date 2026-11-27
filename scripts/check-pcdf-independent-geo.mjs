import "./contracts-runtime.mjs"
import assert from "node:assert/strict"
import { readFile, realpath } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { randomUUID } from "node:crypto"
import pg from "pg"
import { fixture } from "../tests/fixtures/pcdf-v2-package.mjs"
import { preparePcdfCsvDelivery } from "../src/lib/db/pcdf-v2-delivery.ts"
const { analyticsSql } = await import("../src/lib/db/analytics-query.ts")
const { persistentAnalyticsData } = await import("../src/contracts/persistent-analytics.ts")

const root = await realpath(process.env.SENTINELA_CATALOG_CLONE_ROOT)
assert.match(basename(root), /^clone-[0-9a-f]{32}$/)
assert.equal(dirname(root).toLowerCase(), (await realpath(join(process.env.USERPROFILE,
  ".sentinela-local", "homologacao-clone"))).toLowerCase())
const identity = JSON.parse(await readFile(join(root, "identity-55487.json"), "utf8"))
const { origin } = JSON.parse(await readFile(join(root, "backup.json"), "utf8"))
assert.equal(identity.port, 55487)
assert.notEqual(identity.system, origin.system)
assert.notEqual(identity.uuid, origin.uuid)
const client = new pg.Client({ host: "127.0.0.1", port: 55487, database: "sentinela_pcdf_local", user: "postgres",
  password: process.env.SENTINELA_PG_REVIEW_CLONE, connectionTimeoutMillis: 3000,
  application_name: "sentinela-qualificacao-pcdf-geo", statement_timeout: 20000 })
await client.connect()
try {
  const { rows: [target] } = await client.query(`SELECT inet_server_port() AS port,
    current_setting('sentinela.sandbox_uuid') AS uuid,system_identifier::text AS system,
    current_setting('data_directory') AS folder FROM pg_control_system()`)
  assert.deepEqual([target.port, target.uuid, target.system], [55487, identity.uuid, identity.system])
  assert.equal((await realpath(target.folder)).toLowerCase(), (await realpath(join(root, "data-55487"))).toLowerCase())
  await client.query("BEGIN")
  const { rows: [geo] } = await client.query(`WITH samples AS (
    SELECT extensions.ST_MakeEnvelope(-48,-16,-47,-15,4326) AS limite
  ), point AS (
    SELECT sentinela_pcdf_revisao.ponto_geo('-15.81234567','-47.91234567',4326,'referência exclusiva do teste',limite) AS p,limite FROM samples
  ) SELECT extensions.ST_Y(p) AS lat,extensions.ST_X(p) AS lon,
    sentinela_pcdf_revisao.ponto_geo('-15.8','-47.9',NULL,NULL,limite) IS NULL AS unconfirmed,
    sentinela_pcdf_revisao.ponto_geo('-15.8','-47.9',3857,'projeção incompatível',limite) IS NULL AS wrong_crs,
    sentinela_pcdf_revisao.ponto_geo('-47.9','-15.8',4326,'eixos trocados',limite) IS NULL AS reversed,
    sentinela_pcdf_revisao.ponto_geo('-15.8','-49',4326,'fora do limite',limite) IS NULL AS outside,
    sentinela_pcdf_revisao.estado_geo('91','-47.9') AS invalid,
    sentinela_pcdf_revisao.estado_geo('NULL','-47.9') AS incomplete,
    sentinela_pcdf_revisao.estado_geo('','NULL') AS missing FROM point`)
  assert.deepEqual(geo, { lat: -15.81234567, lon: -47.91234567, unconfirmed: true, wrong_crs: true,
    reversed: true, outside: true, invalid: "invalida", incomplete: "incompleta", missing: "ausente" })

  const csv = { ano_registro: "2021", unidade_registro: "TESTE", numero_registro: "0007",
    ocorrencia_chave: '["PCDF", "2021", "TESTE", "0007"]', data: "2021-02-31", ano_fato: "2021", horario: "24:00:00" }
  const { rows: [candidate] } = await client.query("SELECT sentinela_pcdf_local.efetivos_csv_v1($1,$2) AS result", [csv, "2021-01-01"])
  assert.deepEqual(candidate.result, { chave: ["PCDF", "2021", "TESTE", "0007"], geo: "ausente",
    data: null, horario: null, recepcao: "nova_origem" })

  const sample = fixture(({ rows }) => {
    rows[0].data = "2021-02-31"
    rows[0].horario = "24:00:00"
    rows[0].natureza_original = ""
    rows[1].ocorrencia_chave = "chave inválida; preservar literal"
  }).csv
  const prepared = await preparePcdfCsvDelivery(new File([sample], "pcdf_naturezas_2099-01.csv"), true)
  assert.equal(prepared.preview.standalone.invalid, 0)
  assert.equal(prepared.batch.candidates, 1)
  const account = "7".repeat(64)
  const { rows: [actor] } = await client.query(`UPDATE sentinela_gestao_autorizacao.atores
    SET conta=$1,validade=statement_timestamp()+interval '2 minutes' RETURNING usuario`, [account])
  await client.query(`UPDATE sentinela_gestao_autorizacao.release SET porta=55487,cluster_uuid=$1,system_id=$2,aberta=true`,
    [identity.uuid, identity.system])
  await client.query("SET SESSION AUTHORIZATION sentinela_local_admin")
  const receive = async () => (await client.query(`SELECT sentinela_pcdf_local.receive_csv($1,$2,$3,$4,$5) AS data`,
    [randomUUID(), actor.usuario, account, prepared.batch, Buffer.from(prepared.content)])).rows[0].data
  const received = await receive()
  assert.equal(received.replay, false)
  assert.equal((await receive()).lot, received.lot)
  await client.query("RESET SESSION AUTHORIZATION")
  const { rows: staged } = await client.query(`SELECT estado,campos_csv,derivados_efetivos FROM sentinela.linhas_staging
    WHERE lote_id=$1 ORDER BY registro_csv`, [received.lot])
  assert.deepEqual(staged.map(row => row.estado), ["recebida", "recebida"])
  assert.equal(staged[0].campos_csv.data, "2021-02-31")
  assert.equal(staged[0].derivados_efetivos.data, null)
  assert.equal(staged[0].derivados_efetivos.horario, null)
  assert.equal(staged[1].derivados_efetivos.chave, null)

  const { rows: [source] } = await client.query(`SELECT id FROM sentinela.linhas_origem
    WHERE extracao_id=(SELECT extracao_id FROM sentinela.lotes_importacao WHERE id=$1) AND natureza_original=''`, [received.lot])

  const insertValidatedFixture = `WITH ponto AS (
    SELECT sentinela_pcdf_revisao.ponto_geo('-15.81234567','-47.91234567',4326,'referência exclusiva do teste',
     extensions.ST_MakeEnvelope(-48,-16,-47,-15,4326)) AS g
  ) INSERT INTO sentinela.ocorrencias(id,origem,fonte,ano_registro,unidade_registro,numero_registro,
    identidade_status,versao_identidade,evidencia_identidade,consolidacao_status,localizacao_status,
    latitude,longitude,geometria,referencia_espacial_confirmada,regra_transformacao)
  SELECT '4224b49d-ab5f-4818-857b-a6b1ade09cee','importacao','PCDF','2021','TESTE DESCARTÁVEL','0007',
    'homologada','pcdf-tupla-conferida-v1','somente teste com rollback','consolidada','validada',
    extensions.ST_Y(g),extensions.ST_X(g),g,'EPSG:4326 somente neste teste','GEO v1' FROM ponto`
  await client.query(insertValidatedFixture)
  await client.query(`INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,origem,linha_origem_id,classificacao_status)
    VALUES ('4224b49d-ab5f-4818-857b-a6b1ade09cee','importacao',$1,'sem_correspondencia')`, [source.id])
  await client.query("ROLLBACK")

  await client.query("BEGIN")
  await client.query(insertValidatedFixture)
  await client.query("SET SESSION AUTHORIZATION sentinela_local_analyst")
  async function analytics(filters) {
    const { text, values } = analyticsSql(filters, "integrated")
    const { rows: [row] } = await client.query(text, values)
    return persistentAnalyticsData.parse(row.data)
  }
  const result = await analytics({})
  const validated = { latitude: geo.lat, longitude: geo.lon, raCode: null }
  assert.equal(result.total, 6091)
  assert.deepEqual(result.timeline, [{ key: "2021-01", count: 6090 }])
  assert.deepEqual(result.byRa, [])
  assert.deepEqual(result.points, [validated])
  assert.deepEqual(result.heatReference, [validated])
  assert.equal((await analytics({ ra: "RA-I" })).points.length, 0)
  await client.query("ROLLBACK")
  const { rows: [after] } = await client.query("SELECT count(*)::int AS total, count(geometria)::int AS points FROM sentinela.ocorrencias")
  assert.deepEqual(after, { total: 6090, points: 0 })
  console.log("Recepção, reenvio idempotente, GEO, nulidade, filtros e rollback da amostra verificados no clone.")
} finally {
  await client.end()
}
