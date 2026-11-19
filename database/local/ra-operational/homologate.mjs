import "../../../scripts/contracts-runtime.mjs"
import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { registerHooks } from "node:module"
import { Client } from "pg"
import { applyCatalog, reconcileCatalog, verifyRelease } from "./execute.mjs"

registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true }
  return next(specifier, context)
} })
const { catalogGET } = await import("../../../src/lib/db/catalog-http.ts")
const { catalogSql } = await import("../../../src/lib/db/catalog-query.ts")
const { CATALOG_PATHS, catalogResponseSchemas, catalogDataSchemas } = await import("../../../src/contracts/persistent-catalogs.ts")
const { occurrenceGET } = await import("../../../src/lib/db/http.ts")
const { occurrenceSql } = await import("../../../src/lib/db/occurrence-query.ts")
const { analyticsSql } = await import("../../../src/lib/db/analytics-query.ts")
const { analyticsGET } = await import("../../../src/lib/db/analytics-http.ts")
const { persistentAnalyticsData, persistentAnalyticsResponse, PERSISTENT_ANALYTICS_PATH } = await import("../../../src/contracts/persistent-analytics.ts")
const { persistentListResponseSchema, persistentDetailResponseSchema } = await import("../../../src/contracts/persistent-occurrences.ts")

let input = ""
for await (const chunk of process.stdin) input += chunk
const { admin, reader, systemId } = JSON.parse(input)
input = ""
assert.match(systemId, /^\d{19}$/)
assert.notEqual(systemId, "7702156035351602692")
const clients = []
const report = { result: "FAIL", scenarios: {} }
let stage = "attestation", server

async function connect(user, password) {
  const client = new Client({ host: "127.0.0.1", port: 55432, database: "sentinela_rls_sandbox",
    user, password, ssl: false, connectionTimeoutMillis: 15000, statement_timeout: 15000 })
  client.on("error", () => {})
  clients.push(client)
  await client.connect()
  const { rows: [identity] } = await client.query(`SELECT current_database() AS db,
    current_user AS role, host(inet_server_addr()) AS host, inet_server_port() AS port`)
  assert.deepEqual(identity, { db: "sentinela_rls_sandbox", role: user, host: "127.0.0.1", port: 55432 })
  return client
}

try {
  const observer = await connect("postgres", admin)
  const { rows: [identity] } = await observer.query(`SELECT system_identifier::text AS system_id,
    current_setting('server_version') AS postgres,
    (SELECT datcollate FROM pg_database WHERE datname=current_database()) AS locale,
    (SELECT extversion FROM pg_extension WHERE extname='postgis') AS postgis FROM pg_control_system()`)
  assert.equal(identity.system_id, systemId)
  report.environment = { ...identity, host: "127.0.0.1", port: 55432, database: "sentinela_rls_sandbox" }

  const release = await verifyRelease()
  report.releaseSha256 = release.releaseHash
  const nativePreflight = release.sql["preflight.sql"]
  const labPreflight = nativePreflight.replace("'sentinela_dev_operacional'", "'sentinela_rls_sandbox'")
    .replace("inet_server_port() = 5432", "inet_server_port() = 55432")
  assert.notEqual(nativePreflight, labPreflight)

  function adapted(client, intercept) {
    return { async query(sql, args) {
      if (sql === nativePreflight) {
        const refused = await client.query(sql, args)
        assert.equal(refused.rows[0].ok, false)
        return client.query(labPreflight, [systemId, args[1]])
      }
      if (intercept) return intercept(client, sql, args)
      return client.query(sql, args)
    } }
  }

  async function reconcile() {
    const client = await connect("postgres", admin)
    try { return await reconcileCatalog(adapted(client), release, identity) }
    finally { await client.end() }
  }

  async function execute(intercept) {
    const client = await connect("postgres", admin)
    const audit = {}
    try {
      const result = await applyCatalog(adapted(client, intercept), release, identity, audit)
      return { result, audit }
    } catch (error) {
      report.lastExecutorFailure = { ...audit, sqlState: error.code,
        check: /^[A-Z_]+$/.test(error.message) ? error.message : undefined }
      return { error: error.message, sqlState: error.code, audit }
    } finally {
      await client.end()
    }
  }

  const snapshotSql = `SELECT (SELECT count(*)::int FROM sentinela.regioes_administrativas) AS total,
    to_regnamespace('sentinela_ra_catalog') IS NOT NULL AS schema,
    (SELECT count(*)::int FROM pg_attribute WHERE attrelid='sentinela.regioes_administrativas'::regclass
      AND attname='referencia_cartografica' AND NOT attisdropped) AS metadata_columns,
    (SELECT count(*)::int FROM pg_policies WHERE schemaname='sentinela') AS policies,
    (SELECT array_agg(versao ORDER BY versao COLLATE "C") FROM sentinela.schema_migrations) AS ledger`
  const snapshot = async () => (await observer.query(snapshotSql)).rows[0]
  const empty = await snapshot()
  assert.deepEqual(empty, { total: 0, schema: false, metadata_columns: 0, policies: 6,
    ledger: ["0001", "0002", "0003", "0004", "0005", "local-read-0001"] })

  stage = "C/rollback"
  const asset = name => readFile(new URL(name, import.meta.url))
  await assert.rejects(verifyRelease(async name => name === "manifest.json" ? Buffer.from("{}") : asset(name)), /RELEASE_VERSION/)
  await assert.rejects(verifyRelease(async name => name === "load.sql" ? Buffer.from("SELECT 1") : asset(name)), /ASSET_HASH/)
  const migrationFailure = await execute((client, sql, args) => {
    if (sql === release.sql["../migrations/0002_ra_official_catalog.sql"]) {
      return client.query(sql.replace("INSERT INTO sentinela.schema_migrations", "PERFORM 1/0; INSERT INTO sentinela.schema_migrations"))
    }
    return client.query(sql, args)
  })
  assert.equal(migrationFailure.sqlState, "22012", JSON.stringify(migrationFailure))
  assert.deepEqual(await snapshot(), empty)
  const wrongLedger = await execute(async (client, sql, args) => {
    if (sql === release.sql["inspect.sql"]) await client.query(
      "INSERT INTO sentinela.schema_migrations(versao,descricao) VALUES ('lab-wrong','fixture')")
    return client.query(sql, args)
  })
  assert.equal(wrongLedger.error, "BASELINE")
  assert.deepEqual(await snapshot(), empty)
  const injected = await execute(async (client, sql, args) => {
    const result = await client.query(sql, args)
    if (sql === release.sql["load.sql"]) {
      assert.equal(result.rowCount, 37)
      await client.query("SELECT 1/0")
    }
    return result
  })
  assert.equal(injected.audit.rollback, "confirmed", JSON.stringify(injected))
  assert.equal(injected.sqlState, "22012", JSON.stringify(injected))
  assert.deepEqual(await snapshot(), empty)
  const partial = await execute(async (client, sql, args) => {
    if (sql === release.sql["inspect.sql"]) await client.query(`INSERT INTO sentinela.regioes_administrativas
      (codigo_interno,nome,versao_catalogo,vigencia)
      VALUES ('TESTE-PARCIAL','Fixture parcial','SENTINELA_TESTE_LOCAL_V1',daterange(NULL,NULL))`)
    return client.query(sql, args)
  })
  assert.equal(partial.error, "EXISTING_CATALOG")
  assert.deepEqual(await snapshot(), empty)
  report.scenarios.C = { rollback: injected.audit.rollback, nativeSqlState: injected.sqlState,
    partialRejected: true, migrationFailure: migrationFailure.sqlState, invalidManifest: true,
    invalidHash: true, incompatibleLedger: true, stateAfterRollback: empty }

  stage = "E/lost-before-commit"
  const before = await execute(async (client, sql, args) => {
    if (sql === "COMMIT") {
      await observer.query("SELECT pg_terminate_backend($1, 5000)", [client.processID])
      throw new Error("simulated lost commit transmission")
    }
    return client.query(sql, args)
  })
  assert.equal(before.audit.commit, "unknown")
  assert.deepEqual(await snapshot(), empty)
  assert.equal((await reconcile()).outcome, "NOT_PERSISTED")
  report.scenarios.E = { beforeCommit: { executor: "unknown", reconciled: "NOT_PERSISTED" }, automaticRetry: false }

  stage = "A/initial-load"
  const first = await execute()
  assert.deepEqual(first.result, { inserted: 37, reused: 0 }, JSON.stringify(first))
  const loaded = await snapshot()
  assert.deepEqual(loaded, { total: 37, schema: true, metadata_columns: 1, policies: 8,
    ledger: [...empty.ledger.slice(0, 5), "local-ra-0002", "local-read-0001"] })
  const rows = async () => (await observer.query(`SELECT codigo_interno AS code, nome, id,
    referencia_cartografica AS metadata FROM sentinela.regioes_administrativas ORDER BY codigo_interno COLLATE "C"`)).rows
  const official = await rows()
  assert.equal(new Set(official.map(row => row.id)).size, 37)
  for (const row of official) {
    const expected = release.rows.find(item => item.code === row.code)
    assert.equal(row.nome, expected.label)
    assert.deepEqual(row.metadata, expected.metadata)
  }
  report.scenarios.A = { ...first.result, ...loaded, exactReferences: true,
    uuidFingerprint: createHash("sha256").update(JSON.stringify(official.map(({ code, id }) => [code, id]))).digest("hex") }

  stage = "B/idempotence"
  const second = await execute()
  assert.deepEqual(second.result, { inserted: 0, reused: 37 }, JSON.stringify(second))
  assert.deepEqual(await snapshot(), loaded)
  assert.deepEqual(await rows(), official)
  report.scenarios.B = { ...second.result, duplicates: 0, unchangedUuids: 37, ledger: loaded.ledger }

  stage = "C/divergence"
  const divergence = await execute(async (client, sql, args) => {
    if (sql === release.sql["compare.sql"]) {
      await client.query(`ALTER TABLE sentinela.regioes_administrativas DISABLE TRIGGER imutavel;
        UPDATE sentinela.regioes_administrativas SET limite=(
          SELECT limite FROM sentinela.regioes_administrativas WHERE codigo_interno='RA-II')
        WHERE codigo_interno='RA-I'`)
    }
    return client.query(sql, args)
  })
  assert.equal(divergence.error, "CATALOG_MISMATCH", JSON.stringify(divergence))
  assert.equal(divergence.audit.rollback, "confirmed")
  assert.deepEqual(await rows(), official)
  assert.deepEqual((await execute()).result, second.result)
  report.scenarios.C.divergenceRejected = true

  stage = "E/lost-after-commit"
  const after = await execute(async (client, sql, args) => {
    if (sql !== "COMMIT") return client.query(sql, args)
    // A private temporary marker would vanish on disconnect. Use a transaction
    // marker in the disposable lab schema to distinguish the two outcomes.
    await client.query("CREATE TABLE sentinela_ra_catalog.lab_commit_marker (confirmed boolean)")
    await client.query(sql, args)
    client.connection.stream.destroy()
    throw new Error("simulated lost commit acknowledgement at executor boundary")
  })
  assert.equal(after.audit.commit, "unknown")
  const marker = await observer.query("SELECT to_regclass('sentinela_ra_catalog.lab_commit_marker') IS NOT NULL AS committed")
  assert.equal(marker.rows[0].committed, true)
  assert.equal((await reconcile()).outcome, "PERSISTED")
  assert.deepEqual(await snapshot(), loaded)
  assert.deepEqual(await rows(), official)
  await observer.query("DROP TABLE sentinela_ra_catalog.lab_commit_marker")
  report.scenarios.E.afterCommit = { executor: "unknown", reconciled: "PERSISTED", uuidPreserved: 37 }

  stage = "D/reader"
  await observer.query(`INSERT INTO sentinela.regioes_administrativas (codigo_interno,nome,versao_catalogo,vigencia)
    VALUES ('LAB-LEGACY','Fixture sintética','SENTINELA_TESTE_LOCAL_V1',daterange(NULL,NULL)),
           ('LAB-OTHER','Fixture outra versão','LAB-OTHER',daterange(NULL,NULL))`)
  assert.equal((await reconcile()).outcome, "DIVERGENT_OR_INCONCLUSIVE")
  report.scenarios.E.divergent = "DIVERGENT_OR_INCONCLUSIVE"
  await assert.rejects(observer.query(`INSERT INTO sentinela.regioes_administrativas
    (codigo_interno,nome,versao_catalogo,vigencia) SELECT 'LAB-INVALID',nome,versao_catalogo,vigencia
    FROM sentinela.regioes_administrativas WHERE codigo_interno='RA-I'`), error => error.code === "23514")
  const readClient = await connect("sentinela_local_reader", reader)
  const projection = (await readClient.query(catalogSql("regioes"))).rows
  assert.equal(projection.length, 37)
  assert.deepEqual(projection.map(row => row.id).sort(), official.map(row => row.id).sort())
  const denials = ["SELECT referencia_cartografica FROM sentinela.regioes_administrativas",
    "SELECT limite FROM sentinela.regioes_administrativas", "SELECT * FROM sentinela.schema_migrations",
    "SELECT * FROM sentinela.usuarios", "INSERT INTO sentinela.regioes_administrativas(id) SELECT gen_random_uuid() WHERE false",
    "UPDATE sentinela.regioes_administrativas SET nome='fixture' WHERE false",
    "DELETE FROM sentinela.regioes_administrativas WHERE false"]
  for (const sql of denials) await assert.rejects(readClient.query(sql), error => error.code === "42501")
  const { rows: [security] } = await observer.query(`SELECT
    (SELECT count(*)::int FROM pg_policies WHERE schemaname='sentinela') AS policies,
    (SELECT count(*)::int FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r'
      AND relrowsecurity AND relforcerowsecurity) AS forced,
    (SELECT count(*)::int FROM information_schema.column_privileges WHERE grantee='sentinela_local_reader'
      AND table_schema='sentinela' AND privilege_type='SELECT') AS column_grants`)
  assert.deepEqual(security, { policies: 8, forced: 19, column_grants: 48 })
  report.scenarios.D = { ...security, visible: 37, hiddenFixtures: 2,
    rejectedOfficialFixture: true, privilegeDenials: denials.length, databaseRolesForProfiles: 1 }

  stage = "F/HTTP"
  const analytics = async filters => persistentAnalyticsData.parse((await readClient.query(analyticsSql(filters))).rows[0].data)
  const emptyAnalytics=await analytics({})
  assert.equal(emptyAnalytics.total,0)
  assert.deepEqual(emptyAnalytics.timeline,[])
  assert.equal(emptyAnalytics.regions.length,37)
  const { rows: natures } = await observer.query(`INSERT INTO sentinela.naturezas_criminais (fonte,descricao_original)
    VALUES ('SENTINELA_TESTE_LOCAL_V1','Fixture alfa %_'),('SENTINELA_TESTE_LOCAL_V1','Fixture beta'),
      ('SENTINELA_TESTE_NEGATIVO_V1','Fixture oculta %_') RETURNING id,descricao_original AS descricao`)
  const { rows: occurrences } = await observer.query(`INSERT INTO sentinela.ocorrencias
    (origem,fonte,versao_identidade,identidade_status,data_fato,horario_fato,ra_id,local,consolidacao_status,ativo)
    VALUES ('manual','SENTINELA_TESTE_LOCAL_V1','TESTE-V1','manual','2026-01-01','12:00',$1,'Fixture alfa','consolidada',true),
           ('manual','SENTINELA_TESTE_LOCAL_V1','TESTE-V1','manual','2026-01-02','12:00',$1,'Fixture beta','consolidada',true),
           ('manual','SENTINELA_TESTE_NEGATIVO_V1','TESTE-V1','manual','2026-01-03','12:00',$1,'Fixture oculta','consolidada',true)
    RETURNING id,local`,[projection[0].id])
  const alfa=occurrences.find(row=>row.local==="Fixture alfa")
  const beta=occurrences.find(row=>row.local==="Fixture beta")
  const hidden=occurrences.find(row=>row.local==="Fixture oculta")
  const nature=natures.find(row=>row.descricao==="Fixture alfa %_")
  const secondNature=natures.find(row=>row.descricao==="Fixture beta")
  const category=(await observer.query(`INSERT INTO sentinela.categorias_criminais(nome,versao_catalogo,status,evidencia_homologacao)
    VALUES ('Categoria sintética','SENTINELA_TESTE_LOCAL_V1','homologada','Fixture isolada') RETURNING id`)).rows[0].id
  const mapping=(await observer.query(`INSERT INTO sentinela.mapeamentos_natureza(natureza_id,versao,categoria_id,status,evidencia_homologacao)
    VALUES ($1,'SENTINELA_TESTE_LOCAL_V1',$2,'homologado','Fixture isolada') RETURNING id`,[nature.id,category])).rows[0].id
  await observer.query(`INSERT INTO sentinela.ocorrencia_naturezas (ocorrencia_id,natureza_id,origem,classificacao_status,mapeamento_id)
    VALUES ($1,$2,'manual','mapeada',$3),($1,$4,'manual','pendente',NULL)`,[alfa.id,nature.id,mapping,secondNature.id])
  const visibleNatures=natures.filter(row=>!row.descricao.startsWith("Fixture oculta"))
  const roles = new Map(["Administrador", "Operador", "Analista"].map(role => [randomUUID(), role]))
  let origin
  server = createServer(async (req, res) => {
    try {
      const request = new Request(origin + req.url, { headers: req.headers })
      const path=new URL(request.url).pathname
      const kind = Object.keys(CATALOG_PATHS).find(key => CATALOG_PATHS[key] === path)
      const occurrence=/^\/api\/v1\/ocorrencias(?:\/([^/]+))?$/.exec(path)
      if (!kind && !occurrence && path!==PERSISTENT_ANALYTICS_PATH) { res.writeHead(404).end(); return }
      const role = roles.get(req.headers.authorization ?? "")
      const principal=async () => role ? { source: "local", role, name: "Fixture", id: "lab", authUserId: "" } : null
      const response = path===PERSISTENT_ANALYTICS_PATH ? await analyticsGET(request,principal,(_,filters)=>analytics(filters))
      : occurrence ? await occurrenceGET(request,occurrence[1],{
        principal,query:async (_,query,id)=>{
          const {rows:[row]}=await readClient.query(occurrenceSql(query,id))
          const total=Number(row.total)
          return {items:row.items,pagination:{page:query.page,pageSize:query.pageSize,total,totalPages:Math.ceil(total/query.pageSize)}}
        },
      }) : await catalogGET(request, kind, {
        principal,
        query: async (_, catalog, query) => catalogDataSchemas[catalog].parse({ items: (await readClient.query(catalogSql(catalog,query))).rows }),
      })
      res.writeHead(response.status, Object.fromEntries(response.headers)).end(await response.text())
    } catch {
      res.writeHead(500).end()
    }
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  origin = `http://127.0.0.1:${server.address().port}`
  Object.assign(process.env, { NODE_ENV: "development", SENTINELA_AUTH_PROVIDER: "local",
    SENTINELA_LOCAL_BIND: "127.0.0.1", SENTINELA_APP_ORIGIN: origin })
  for (const authorization of roles.keys()) {
    for (const [kind, path] of Object.entries(CATALOG_PATHS)) {
      const response = await fetch(origin + path, { headers: { authorization } })
      assert.equal(response.status, 200)
      assert.match(response.headers.get("cache-control"), /no-store/)
      const result = catalogResponseSchemas[kind].parse(await response.json())
      assert.deepEqual(result.data.items, kind === "regioes" ? projection : visibleNatures)
    }
  }
  for (const path of Object.values(CATALOG_PATHS)) assert.equal((await fetch(origin + path)).status, 401)
  assert.equal((await fetch(origin + CATALOG_PATHS.regioes + "?x=1",
    { headers: { authorization: roles.keys().next().value } })).status, 400)
  const detail = await fetch(origin + CATALOG_PATHS.regioes + "/" + projection[0].id,
    { headers: { authorization: roles.keys().next().value } })
  assert.equal(detail.status, 404)
  const auth={headers:{authorization:roles.keys().next().value}}
  const request=(path)=>fetch(origin+path,auth)
  const filtered=await request(CATALOG_PATHS.naturezas+"?q=%25_&direction=desc")
  assert.equal(filtered.status,200)
  assert.deepEqual(catalogResponseSchemas.naturezas.parse(await filtered.json()).data.items,[nature])
  const ordered=await request(CATALOG_PATHS.naturezas+"?direction=desc")
  assert.deepEqual(catalogResponseSchemas.naturezas.parse(await ordered.json()).data.items,[...visibleNatures].reverse())
  assert.equal((await request(CATALOG_PATHS.naturezas+"?q=a&q=b")).status,400)
  const base="/api/v1/ocorrencias"
  for (const [authorization, role] of roles) {
    const response=await fetch(origin+base,{headers:{authorization}})
    assert.equal(response.status,200,role)
    assert.match(response.headers.get("cache-control"),/no-store/)
    const {data}=persistentListResponseSchema.parse(await response.json())
    assert.equal(data.pagination.total,2)
    assert.deepEqual(data.items.map(row=>row.id).sort(),[alfa.id,beta.id].sort())
    const row=data.items.find(item=>item.id===alfa.id)
    assert.deepEqual(row.naturezas.map(link=>link.natureza.id).sort(),[nature.id,secondNature.id].sort())
  }
  const firstPage=await request(base+"?pageSize=1&sortBy=data&direction=desc")
  const list=persistentListResponseSchema.parse(await firstPage.json()).data
  assert.deepEqual(list.pagination,{page:1,pageSize:1,total:2,totalPages:2})
  assert.equal(list.items[0].id,beta.id)
  const secondPage=await request(base+"?page=2&pageSize=1&sortBy=data&direction=desc")
  assert.equal(persistentListResponseSchema.parse(await secondPage.json()).data.items[0].id,alfa.id)
  const combined=await request(base+"?raId="+projection[0].id+"&naturezaId="+nature.id+"&local=ALFA&startDate=2026-01-01&endDate=2026-01-01")
  assert.deepEqual(persistentListResponseSchema.parse(await combined.json()).data.items.map(row=>row.id),[alfa.id])
  const occurrenceDetail=await request(base+"/"+alfa.id)
  assert.equal(occurrenceDetail.status,200)
  assert.deepEqual(persistentDetailResponseSchema.parse(await occurrenceDetail.json()).data.naturezas
    .map(link=>link.natureza.id).sort(),[nature.id,secondNature.id].sort())
  assert.equal((await request(base+"/"+hidden.id)).status,404)
  assert.equal((await request(base+"?page=0")).status,400)
  assert.equal((await fetch(origin+base)).status,401)
  report.scenarios.F = { profiles: [...roles.values()], authenticated200: 6, noSession401: 2,
    invalidQuery400: 1, undefinedDetail404: 1, regioes: 37, naturezas: 2, strictContracts: true,
    natureFiltersAndOrdering:true, occurrenceListDetailFiltersPagination:true, occurrenceHiddenByRls:true,
    occurrenceProfiles200:3, distinctOccurrences:2, multipleNatureLinks:2, strictOccurrencePayload:true }
  stage="G/analytics"
  const catalogAnalytics=await analytics({})
  assert.equal(catalogAnalytics.total,2)
  assert.deepEqual(catalogAnalytics.byNature.map(item=>item.count),[1,1])
  assert.deepEqual(catalogAnalytics.timeline,[{key:"2026-01",count:2}])
  assert.equal(catalogAnalytics.byRa[0].count,2)
  const code=catalogAnalytics.byRa[0].key
  const filteredAnalytics=await analytics({ra:code,nature:nature.id,category,startDate:"2026-01-01",endDate:"2026-01-01",hour:"12-18"})
  assert.equal(filteredAnalytics.total,1)
  assert.equal((await analytics({nature:visibleNatures[1].id,category})).total,0)
  for(const authorization of roles.keys()) {
    const result=await fetch(origin+PERSISTENT_ANALYTICS_PATH,{headers:{authorization}})
    assert.equal(result.status,200)
    assert.equal(persistentAnalyticsResponse.parse(await result.json()).data.total,2)
  }
  assert.equal((await fetch(origin+PERSISTENT_ANALYTICS_PATH)).status,401)
  assert.equal((await request(PERSISTENT_ANALYTICS_PATH+"?ra=RA-I&ra=RA-II")).status,400)

  const loadPoints=async count=>observer.query(`INSERT INTO sentinela.ocorrencias
    (origem,fonte,versao_identidade,identidade_status,data_fato,ra_id,latitude,longitude,geometria,
     referencia_espacial_confirmada,regra_transformacao,localizacao_status,consolidacao_status)
    SELECT 'manual','SENTINELA_TESTE_LOCAL_V1','TESTE-V1','manual','2026-02-01',id,
      extensions.ST_Y(geom),extensions.ST_X(geom),geom,'fixture','fixture','validada','consolidada'
    FROM (SELECT id,extensions.ST_PointOnSurface(limite) AS geom FROM sentinela.regioes_administrativas WHERE id=$1) r
    CROSS JOIN generate_series(1,$2::int)`,[projection[0].id,count])
  await assert.rejects(observer.query(`INSERT INTO sentinela.ocorrencias
    (origem,fonte,versao_identidade,identidade_status,localizacao_status)
    VALUES ('manual','SENTINELA_TESTE_LOCAL_V1','TESTE-V1','manual','validada')`), error=>error.code==="23514")
  await loadPoints(1)
  const mapped=await analytics({})
  assert.equal(mapped.points.length,1)
  assert.deepEqual(mapped.points,mapped.heatReference)
  assert.equal(mapped.points[0].raCode,code)
  assert.equal((await analytics({startDate:"2026-01-01",endDate:"2026-01-31"})).heatReference.length,1)
  await loadPoints(9999)
  const started=performance.now()
  const volume=await analytics({})
  const durationMs=Math.round(performance.now()-started)
  assert.equal(volume.total,10002)
  assert.equal(volume.points.length,5000)
  assert.equal(volume.heatReference.length,0)
  assert.equal(volume.pointsTruncated,true);assert.equal(volume.heatUnavailable,true)
  report.scenarios.G={empty:true,distinctTotal:true,categoryAndNatureSameAssociation:true,located:10000,aggregatedTotal:volume.total,
    returnedPoints:volume.points.length,invalidGeometryRejected:true,heatBounded:true,durationMs,responseBytes:Buffer.byteLength(JSON.stringify(volume)),http200:3,http401:1,http400:1}
  delete report.lastExecutorFailure
  report.result = "PASS"
} catch (error) {
  report.failedStage = stage
  report.error = error.name
  report.sqlState = error.code
  if (error.message === "timeout expired" || error.message === "Connection terminated due to connection timeout") report.connectionTimeout = true
  const frames = error.stack?.split("\n").filter(line => line.includes("homologate.mjs:")) ?? []
  report.frames = frames.map(frame => frame.match(/homologate\.mjs:\d+:\d+/)?.[0]).filter(Boolean)
  if (error instanceof assert.AssertionError && /^[0-9]{5}$/.test(error.actual?.sqlState ?? "")) {
    report.nativeSqlState = error.actual.sqlState
  }
} finally {
  if (server) await new Promise(resolve => server.close(resolve))
  await Promise.allSettled(clients.map(client => client.end()))
  process.stdout.write(JSON.stringify(report))
  process.exitCode = report.result === "PASS" ? 0 : 1
}
