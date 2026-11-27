import "./contracts-runtime.mjs"
import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { readFile, realpath, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import pg from "pg"

const { analyticsSql } = await import("../src/lib/db/analytics-query.ts")
const { persistentAnalyticsData } = await import("../src/contracts/persistent-analytics.ts")
const [perimeterPath, sourceControlsPath, targetControlsPath] = process.argv.slice(2)
const installed = process.argv.includes("--installed")
assert(perimeterPath && sourceControlsPath && targetControlsPath, "Forneça perímetro IDE/DF e controles em 4674 e 4326.")
const root = await realpath(process.env.SENTINELA_CATALOG_CLONE_ROOT)
assert.match(basename(root), /^clone-[0-9a-f]{32}$/)
assert.equal(dirname(root).toLowerCase(), (await realpath(join(process.env.USERPROFILE, ".sentinela-local", "homologacao-clone"))).toLowerCase())
const { origin } = JSON.parse(await readFile(join(root, "backup.json"), "utf8"))
const identity = JSON.parse(await readFile(join(root, "identity-55487.json"), "utf8"))
assert.equal(identity.port, 55487)
assert.notEqual(identity.system, origin.system)
assert.notEqual(identity.uuid, origin.uuid)

const [perimeter, sourceBytes, targetBytes, ras, install, auditSql] = await Promise.all([
  perimeterPath, sourceControlsPath, targetControlsPath, "public/data/cartography/ras-ide-2026-11-13.geojson",
  "database/local/pcdf-sandbox/pcdf-geo-validation.sql", "database/local/pcdf-sandbox/pcdf-geo-audit.sql",
].map(path => readFile(path, "utf8")))
const sha = value => createHash("sha256").update(value).digest("hex")
const client = new pg.Client({ host: "127.0.0.1", port: 55487, database: "sentinela_pcdf_local", user: "postgres",
  password: process.env.SENTINELA_PG_REVIEW_CLONE, connectionTimeoutMillis: 5000, statement_timeout: 120000 })
const lot = "84908630-bd04-4a03-923d-616649c8de74"
const roles = ["sentinela_local_admin", "sentinela_local_operator", "sentinela_local_analyst"]
const base = `SELECT sentinela_pcdf_geo.geojson_poligono($3::jsonb)`
const proposed = `FROM sentinela_pcdf_geo.propor($1,$2,(${base}))`
const signature = `SELECT sentinela_pcdf_geo.assinatura($1,$2,(${base})) AS hash`
const publish = `SELECT sentinela_pcdf_geo.publicar($1,$2,(${base}),$4)::int AS total`
const first = async (sql, params) => (await client.query(sql, params)).rows[0]
const envGuard = () => client.query("SELECT set_config('sentinela.geo_clone_uuid',$1,true),set_config('sentinela.geo_clone_system',$2,true)", [identity.uuid, identity.system])

async function reject(sql, parameters, message) {
  await client.query("SAVEPOINT rejeicao")
  try {
    await assert.rejects(client.query(sql, parameters), message)
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT rejeicao; RELEASE SAVEPOINT rejeicao")
  }
}

async function analytics(filters) {
  const { text, values } = analyticsSql(filters, "integrated")
  return persistentAnalyticsData.parse((await first(text, values)).data)
}

await client.connect()
try {
  const target = await first(`SELECT inet_server_port() AS port, system_identifier::text AS system,
    current_setting('sentinela.sandbox_uuid') AS uuid,current_setting('data_directory') AS folder FROM pg_control_system()`)
  assert.deepEqual([target.port, target.system, target.uuid], [55487, identity.system, identity.uuid])
  assert.equal((await realpath(target.folder)).toLowerCase(), (await realpath(join(root, "data-55487"))).toLowerCase())
  await client.query("BEGIN")
  await envGuard()
  if (!installed) await client.query(install)
  const { auditoria } = await first(auditSql, [lot, perimeter, ras])
  assert.deepEqual(auditoria.estadosConsolidados, { ausente: 630, referencia_pendente: 5460 })
  assert.deepEqual(auditoria.porEstado, { ausente: 641, referencia_pendente: 5752 })
  assert.equal(auditoria.chavesComPar, 5461)
  assert.equal(auditoria.assocEmRevisaoComPar, 1)
  assert.equal(auditoria.perimetro.valido, true)
  await reject(publish, [lot, null, perimeter, "0".repeat(64)], /exige evidência/)

  // Os dois formatos vêm do serviço oficial da IDE/DF. As estações não pertencem ao lote PCDF.
  const targetPoints = new Map(JSON.parse(targetBytes).features.map(f => [f.properties.objectid, f.geometry.coordinates]))
  const controls = []
  const outsideControls = []
  for (const feature of JSON.parse(sourceBytes).features) {
    const other = targetPoints.get(feature.properties.objectid)
    const [lon, lat] = feature.geometry.coordinates
    if (!other) continue
    const hit = await first(`SELECT extensions.ST_Covers(sentinela_pcdf_geo.geojson_poligono($1),
      sentinela_pcdf_geo.transformar($2,$3,4674)) AS inside`, [perimeter, lat, lon])
    const destination = hit.inside ? controls : outsideControls
    destination.push({ lat: String(lat), lon: String(lon), lat_alvo: String(other[1]), lon_alvo: String(other[0]) })
  }
  assert(controls.length >= 2)
  const [station, secondStation] = controls
  const [outside] = outsideControls
  assert(outside)

  const ids = { extraction: randomUUID(), batch: randomUUID(), run: randomUUID(), occurrence: randomUUID(), disputed: randomUUID(),
    outside: randomUUID() }
  const geoEvidence = {
    sha256_xml: sha(sourceBytes), sha256_csv: sha(targetBytes), epsg: 4674, datum: "SIRGAS2000",
    documento: "https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/IDEDF/FeatureServer/22",
    documento_sha256: sha(sourceBytes), metodo: "Amostras da Rede Geodésica, exclusivas para este teste em clone",
    precisao: "Tolerância de comparação da transformação, restrita ao ensaio",
    transformacoes: "A IDE/DF exportou as mesmas estações em EPSG:4674 e EPSG:4326",
    ordem: "latitude,longitude", unidade: "grau", perimetro: "IDE/DF camada Limite do DF",
    perimetro_ewkb_sha256: auditoria.perimetro.sha256EWKB, tolerancia_m: 2,
    controles_documento: "Consulta IDE/DF com outSR=4326", controles_sha256: sha(targetBytes), controles: controls,
  }
  await reject(`SELECT * ${proposed}`, [lot, geoEvidence, perimeter], /outro lote/)
  await client.query("SAVEPOINT controles_publicos")
  await client.query(`INSERT INTO sentinela.extracoes_origem(id,fonte,nome_xml,sha256_xml,tamanho_bytes,referencia_arquivo)
    VALUES ($1,'PCDF','CONTROLE IDE/DF - SOMENTE TESTE',$2,1,'controle-publico')`, [ids.extraction, geoEvidence.sha256_xml])
  await client.query(`INSERT INTO sentinela.lotes_importacao(id,extracao_id,nome_arquivo,sha256_arquivo,tamanho_bytes,
      referencia_arquivo,versao_contrato,versao_tratamento,competencia,solicitado_por)
    SELECT $1,$2,'controle-publico',$3,1,'controle-publico',versao_contrato,versao_tratamento,DATE '2099-01-01',solicitado_por
    FROM sentinela.lotes_importacao WHERE id=$4`, [ids.batch, ids.extraction, geoEvidence.sha256_csv, lot])
  await client.query(`INSERT INTO sentinela.execucoes_importacao(id,lote_id,extracao_id,solicitado_por,versao_importador,versao_validacao,tentativa)
     SELECT $1,$2,$3,solicitado_por,versao_importador,versao_validacao,1 FROM sentinela.execucoes_importacao WHERE lote_id=$4 LIMIT 1`,
  [ids.run, ids.batch, ids.extraction, lot])
  for (const [index, occurrence] of [ids.occurrence, ids.disputed, ids.outside].entries()) {
    await client.query(`INSERT INTO sentinela.ocorrencias(id,origem,fonte,ano_registro,unidade_registro,numero_registro,
      identidade_status,versao_identidade,evidencia_identidade,consolidacao_status,localizacao_status,data_fato)
      VALUES ($1,'importacao','PCDF','2099','CONTROLE IDE/DF',$2,'homologada','pcdf-tupla-conferida-v1',
        'ensaio descartável com pontos públicos','consolidada','referencia_pendente',DATE '2099-01-01')`, [occurrence, String(index)])
  }
  const samples = [[ids.occurrence, station], [ids.occurrence, station], [ids.disputed, station],
    [ids.disputed, secondStation], [ids.outside, outside]]
  for (const [index, [occurrence, control]] of samples.entries()) {
    const line = randomUUID()
    await client.query(`INSERT INTO sentinela.linhas_origem(id,extracao_id,linha_origem_id,aba_origem,linha_xml,versao_identificador,
      natureza_original,latitude_geo_original,longitude_geo_original)
      VALUES ($1,$2,$1::uuid::text,'CONTROLE',$3,'controle-publico','CONTROLE IDE/DF',$4,$5)`,
    [line, ids.extraction, index + 1, control.lat, control.lon])
    await client.query(`INSERT INTO sentinela.linhas_staging(execucao_id,lote_id,extracao_id,linha_origem_id,registro_csv,campos_csv)
        VALUES ($1,$2,$3,$4,$5,'{}')`, [ids.run, ids.batch, ids.extraction, line, index + 1])
    await client.query(`INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,origem,linha_origem_id,classificacao_status)
        VALUES ($1,'importacao',$2,'sem_correspondencia')`, [occurrence, line])
  }
  const params = [ids.batch, geoEvidence, perimeter]
  const { rows: decisions } = await client.query(`SELECT id,estado,ra_estado ${proposed}`, params)
  assert.deepEqual(new Map(decisions.map(row => [row.id, [row.estado, row.ra_estado]])), new Map([
    [ids.occurrence, ["elegivel", "ra_sem_vinculo"]], [ids.disputed, ["divergente", null]], [ids.outside, ["fora_df", null]],
  ]))
  await client.query("SAVEPOINT cartografia_controle")
  const insertRegion = code => client.query(`INSERT INTO sentinela.regioes_administrativas(codigo_interno,nome,versao_catalogo,
    vigencia,versao_cartografia,evidencia_referencia_espacial,limite)
    SELECT $4,'Ensaio descartável','controle-publico',daterange('2099-01-01','2099-02-01'),
      'IDE/DF 2026','Malha pública usada no ensaio de coerência',extensions.ST_Multi(r.g)
    FROM jsonb_array_elements($1::jsonb->'features') f CROSS JOIN LATERAL (
      SELECT extensions.ST_GeomFromGeoJSON(f->'geometry') AS g) r
    WHERE extensions.ST_Contains(r.g,sentinela_pcdf_geo.transformar($2,$3,4674)) LIMIT 1`, [ras, station.lat, station.lon, code])
  assert.equal((await insertRegion("RA-TESTE-1")).rowCount, 1)
  assert.equal((await first(`SELECT estado,ra_estado ${proposed} WHERE id=$4`, [...params, ids.occurrence])).ra_estado,
    "ra_candidata_sem_vinculo")
  assert.equal((await insertRegion("RA-TESTE-2")).rowCount, 1)
  assert.deepEqual(await first(`SELECT estado,geometria ${proposed} WHERE id=$4`, [...params, ids.occurrence]),
    { estado: "ra_ambigua", geometria: null })
  await client.query("ROLLBACK TO SAVEPOINT cartografia_controle; RELEASE SAVEPOINT cartografia_controle")
  await reject(`SELECT * ${proposed}`, [ids.batch, { ...geoEvidence, epsg: 3857 }, perimeter], /CRS geográfico/)
  await reject(`SELECT * ${proposed}`, [ids.batch, { ...geoEvidence, ordem: "longitude,latitude" }, perimeter], /incompatível/)
  await reject(`SELECT * ${proposed}`, [ids.batch, { ...geoEvidence, controles: [station, station] }, perimeter], /Controles/)
  await reject(publish, [...params, "0".repeat(64)], /assinatura aprovada/)
  const { hash } = await first(signature, params)
  assert.equal((await first(publish, [...params, hash])).total, 1)
  assert.equal((await first(publish, [...params, hash])).total, 0)
  assert.equal((await first(`SELECT count(*)::int AS total FROM sentinela.eventos_auditoria
    WHERE acao='pcdf.geo.publicacao_clone' AND depois->>'lote'=$1`, [ids.batch])).total, 1)
  assert.equal((await first(`SELECT count(*)::int AS total FROM sentinela.ocorrencias WHERE id=$1 AND geometria IS NOT NULL`, [ids.occurrence])).total, 0)
  let positive
  for (const role of roles) {
    await client.query(`SET SESSION AUTHORIZATION ${role}`)
    const data = await analytics({})
    assert.equal(data.total, 6093)
    assert.equal(data.points.length, 1)
    assert.deepEqual(data.heatReference, data.points)
    assert.equal(data.points[0].raCode, null)
    assert.deepEqual((await analytics({ startDate: "2021-01-01", endDate: "2021-01-31" })).points, [])
    assert.deepEqual((await analytics({ ra: "RA-01" })).points, [])
    await reject("SELECT geometria FROM sentinela_pcdf_geo.publicacoes", [], /permission denied/)
    await client.query("RESET SESSION AUTHORIZATION")
    positive = data
  }
  await client.query("ROLLBACK TO SAVEPOINT controles_publicos; RELEASE SAVEPOINT controles_publicos")
  assert.equal((await first("SELECT count(*)::int AS total FROM sentinela_pcdf_geo.publicacoes")).total, 0)
  assert.equal((await first("SELECT count(*)::int AS total FROM sentinela.eventos_auditoria WHERE acao='pcdf.geo.publicacao_clone'")).total, 0)
  assert.equal((await first("SELECT count(*)::int AS total FROM sentinela.ocorrencias WHERE unidade_registro='CONTROLE IDE/DF'")).total, 0)
  await client.query("COMMIT")
  const result = { auditoria, documents: { perimeter: sha(perimeter), sourceControls: sha(sourceBytes), targetControls: sha(targetBytes) },
    testedControls: controls.length, outsideRejected: true, ambiguousRARejected: true,
    roles: 3, idempotent: true, rollback: true, publishedReal: 0 }
  await writeFile(join(root, "pcdf-geo-validation-final.json"), JSON.stringify(result, null, 2), { flag: "wx" })
  await writeFile(join(root, "pcdf-geo-control-analytics.json"), JSON.stringify(positive), { flag: "wx" })
  console.log(JSON.stringify(result))
} finally {
  await client.end()
}
