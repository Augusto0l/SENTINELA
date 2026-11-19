import assert from "node:assert/strict"
import { createHash, randomBytes } from "node:crypto"
import { readFile, realpath, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { Client } from "pg"
import { verifyRelease } from "../ra-operational/execute.mjs"
import { approvedSource } from "./approved-source.mjs"
import { persistentDestination, persistentReaders } from "../../../src/lib/db/config.ts"

export const directory = resolve(".cache", "sprint4-homologacao-persistente")
export const readersFile = join(directory, "reader-credentials.json")
const roles = Object.values(persistentReaders)
const baseline = ["0001", "0002", "0003", "0004", "0005"]
const catalogMigration = [...baseline, "homolog-persist-0001"]
const expectedLedger = [...catalogMigration, "homolog-persist-0002"]
const crudLedger = [...expectedLedger, "homolog-persist-0003", "homolog-persist-0004"]
const fullLedger = [...crudLedger, "homolog-persist-0005"]
const completeLedger = [...fullLedger, "homolog-persist-0006"]
const sha256 = input => createHash("sha256").update(input).digest("hex")

export function connect(user, password, database = persistentDestination.database) {
  const { host, port } = persistentDestination
  return new Client({ host, port, database, user, password, ssl: false, connectionTimeoutMillis: 3000,
    statement_timeout: 15000, query_timeout: 20000, application_name: "sentinela-homologacao-qualificacao" })
}

export async function attestMigration(client) {
  const { rows: [identity] } = await client.query(`SELECT current_database() AS database, session_user AS login,
    host(inet_server_addr()) AS host, inet_server_port() AS port, current_setting('cluster_name') AS cluster,
    current_setting('listen_addresses') AS listen, system_identifier::text AS system,
    current_setting('server_version_num') AS version, current_setting('data_directory') AS directory,
    (SELECT extversion FROM pg_extension WHERE extname='postgis' AND extnamespace='extensions'::regnamespace) AS postgis
    FROM pg_control_system()`)
  assert(identity, "Identidade ausente")
  const { login, listen, directory: dataDirectory, ...destination } = identity
  assert.deepEqual(destination, persistentDestination)
  assert.equal(login, "sprint4_migration")
  assert.equal(listen, persistentDestination.host)
  assert.equal(await realpath(dataDirectory), join(directory, "data"))
}

export async function catalogRows() {
  const { rows } = await verifyRelease()
  const bytes = await readFile(new URL("../../../public/data/cartography/ra-bindings.json", import.meta.url))
  const bindings = JSON.parse(approvedSource(bytes, "fe843533cb7d77acc7d1ddfc6812cb31560e032cf43bd26ce40baf49a674dbbf"))
  assert.equal(bindings.scope, "operational")
  assert.equal(bindings.version, "ide-df-bindings-2026-11-13-v1")
  assert.equal(bindings.temporalBasis, "extraction-only")
  assert.equal(bindings.validFrom, null)
  assert.equal(bindings.validTo, null)
  assert.equal(bindings.entries.length, 37)
  assert.equal(new Set(bindings.entries.map(entry => entry.raId)).size, 37)
  const byCode = new Map(bindings.entries.map(entry => [entry.code, entry]))
  assert.equal(byCode.size, 37)
  return rows.map(row => {
    const entry = byCode.get(row.code)
    assert(entry && /^[a-f0-9-]{36}$/.test(entry.raId), "Vínculo de UUID ausente")
    assert.equal(entry.status, "approved")
    assert.equal(entry.catalogName, row.label)
    assert.equal(entry.sourceName, row.metadata.sourceName)
    assert.equal(entry.sourceObjectId, row.metadata.sourceObjectId)
    assert.equal(bindings.sourceId, row.metadata.sourceId)
    assert.equal(bindings.sourceHash, row.metadata.sourceHash)
    assert.equal(bindings.extractedOn, row.metadata.extractedOn)
    return { id: entry.raId, ...row }
  })
}

export async function readerPasswords(create = false) {
  if (create) {
    const passwords = Object.fromEntries(roles.map(role => [role, randomBytes(32).toString("hex")]))
    try { await writeFile(readersFile, JSON.stringify(passwords), { flag: "wx", mode: 0o600 }) }
    catch (error) { if (error.code !== "EEXIST") throw error }
  }
  assert.equal(await realpath(readersFile), readersFile)
  const passwords = JSON.parse(await readFile(readersFile, "utf8"))
  assert(Object.keys(passwords).length === 3 && roles.every(role => /^[a-f0-9]{64}$/.test(passwords[role])))
  assert.equal(new Set(Object.values(passwords)).size, 3)
  return passwords
}

async function verifyCatalog(client, rows) {
  const result = await client.query(`WITH expected AS (
    SELECT id,code,label,metadata,extensions.ST_Multi(extensions.ST_SetSRID(
      extensions.ST_GeomFromGeoJSON(geometry),4326)) AS geom
    FROM jsonb_to_recordset($1::jsonb) AS source(id uuid,code text,label text,metadata jsonb,geometry jsonb)
  )
  SELECT count(*)::int AS rows,count(distinct r.id)::int AS ids,count(distinct r.codigo_interno)::int AS codes,
    count(*) FILTER (WHERE r.nome=e.label AND r.codigo_interno=e.code AND r.referencia_cartografica=e.metadata
      AND r.versao_catalogo='SENTINELA_RA_PUBLICO_2026_11_13_V1' AND r.versao_cartografia='IDE-DF-2026-11-13'
      AND r.codigo_oficial IS NULL AND lower_inf(r.vigencia) AND upper_inf(r.vigencia)
      AND extensions.ST_IsValid(r.limite) AND NOT extensions.ST_IsEmpty(r.limite)
      AND extensions.ST_AsEWKB(r.limite)=extensions.ST_AsEWKB(e.geom))::int AS matched
  FROM expected e FULL JOIN sentinela.regioes_administrativas r USING (id)`, [JSON.stringify(rows)])
  assert.deepEqual(result.rows[0], { rows: 37, ids: 37, codes: 37, matched: 37 })
  return sha256(JSON.stringify(rows.map(row => [row.id, row.code, row.label])))
}

async function withMigration(run) {
  assert.equal(await realpath(directory), directory)
  const path = join(directory, "migration.secret")
  assert.equal(await realpath(path), path)
  const client = connect("sprint4_migration", await readFile(path, "utf8"))
  try {
    await client.connect()
    await attestMigration(client)
    return await run(client)
  } finally { await client.end() }
}

export async function install(apply = false) {
  const rows = await catalogRows()
  if (apply) {
    assert.equal(sha256(await readFile(join(directory, "baseline.dump"))),
      "874a523afa71cad49f294e7bd50a588f45bcd4a3257d424c119af3458fd2bda9")
    await withMigration(async client => {
      await client.query("BEGIN")
      try {
        await client.query("SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='5s'")
        await client.query("SELECT pg_advisory_xact_lock(743204,41)")
        const { rows: ledger } = await client.query("SELECT versao FROM sentinela.schema_migrations ORDER BY versao")
        const current = ledger.map(row => row.versao)
        if (JSON.stringify(current) === JSON.stringify(baseline)) {
          const passwords = await readerPasswords(true)
          await client.query("SELECT set_config('sentinela.homolog_catalog',$1,true),set_config('sentinela.homolog_passwords',$2,true)",
            [JSON.stringify(rows), JSON.stringify(passwords)])
          await client.query(await readFile(new URL("0001_catalog_and_read.sql", import.meta.url), "utf8"))
        } else {
          assert.deepEqual(current, catalogMigration)
        }
        await client.query(await readFile(new URL("0002_read_identity.sql", import.meta.url), "utf8"))
        await verifyCatalog(client, rows)
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      }
    })
  }
  const {catalogDigest,active,ledger} = await withMigration(async client => {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const { rows: ledgerRows } = await client.query("SELECT versao FROM sentinela.schema_migrations ORDER BY versao")
    const ledger = ledgerRows.map(row => row.versao)
    const completion = ledger.at(-1) === "homolog-persist-0006"
    const pcdf = completion || ledger.at(-1) === "homolog-persist-0005"
    const crud = pcdf || ledger.at(-1) === "homolog-persist-0004"
    assert.deepEqual(ledger, completion ? completeLedger : pcdf ? fullLedger : crud ? crudLedger : expectedLedger)
    const digest = await verifyCatalog(client, rows)
    const { rows: [state] } = await client.query(`SELECT
      (SELECT count(*)::int FROM sentinela.ocorrencias WHERE NOT (
        ($2::boolean AND fonte='SENTINELA_HOMOLOG_MANUAL_V1') OR ($3::boolean AND fonte='PCDF-SANDBOX'))) AS occurrences,
      (SELECT count(*)::int FROM sentinela.ocorrencias WHERE ativo) AS active,
      (SELECT count(*)::int FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r'
        AND relrowsecurity AND relforcerowsecurity) AS rls,
      (SELECT count(*)::int FROM pg_authid WHERE rolname=ANY($1) AND rolpassword LIKE 'SCRAM-SHA-256$%') AS scram,
      (SELECT prosecdef FROM pg_proc WHERE oid='sentinela_homologacao.system_identifier()'::regprocedure) AS elevated_identity`, [roles,crud,pcdf])
    const {active,...checks} = state
    assert.deepEqual(checks, { occurrences: 0, rls: 19, scram: 3, elevated_identity: false })
    await client.query("COMMIT")
    return {catalogDigest:digest,active,ledger}
  })
  const passwords = await readerPasswords()
  for (const role of roles) {
    const client = connect(role, passwords[role])
    try {
      await client.connect()
      const { rows: [state] } = await client.query(`SELECT
        sentinela_homologacao.system_identifier() AS system,session_user AS login,
        (SELECT count(id)::int FROM sentinela.regioes_administrativas) AS regions,
        (SELECT count(id)::int FROM sentinela.ocorrencias) AS occurrences,
        current_setting('default_transaction_read_only') AS readonly,
        has_database_privilege(current_database(),'TEMP') AS can_temp,
        (SELECT count(*)::int FROM pg_database WHERE datallowconn AND datname<>current_database()
          AND has_database_privilege(oid,'CONNECT')) AS other_databases`)
      assert.deepEqual(state, { system: persistentDestination.system, login: role, regions: 37,
        occurrences: active, readonly: "on", can_temp: false, other_databases: 0 })
      // Test grants independently of the default read-only transaction.
      await client.query("SET default_transaction_read_only=off")
      for (const statement of [
        "UPDATE sentinela.ocorrencias SET ativo=false WHERE false",
        "UPDATE sentinela.pendencias_revisao SET status='resolvida' WHERE false",
        "SELECT count(*) FROM sentinela.eventos_auditoria",
        "SELECT limite FROM sentinela.regioes_administrativas",
      ]) await assert.rejects(client.query(statement), { code: "42501" })
    } finally { await client.end() }
    const wrongDb = connect(role, passwords[role], "postgres")
    try { await assert.rejects(wrongDb.connect(), { code: "42501" }) }
    finally { await wrongDb.end() }
  }
  return { target: persistentDestination, ledger, regions: 37, catalogDigest, active, rls: 19, roles }
}

if (import.meta.main) {
  try {
    assert(process.argv.length === 3 && ["--apply", "--verify"].includes(process.argv[2]))
    process.stdout.write(JSON.stringify(await install(process.argv[2] === "--apply")) + "\n")
  } catch (error) {
    // Intentionally omit SQL arguments, driver diagnostics and credential values.
    console.error("Instalação/verificação interrompida:", error.code ?? error.name)
    if (error.code === "ERR_ASSERTION") console.error(error.stack.split("\n").find(line => line.includes("install.mjs:")))
    process.exitCode = 1
  }
}
