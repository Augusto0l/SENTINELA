import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const systemId = "7702156035351602692"
const database = "sentinela_dev_operacional"
const version = "ra-public-sandbox-2026-11-13-v2"
const catalogVersion = "SENTINELA_RA_PUBLICO_2026_11_13_V1"
const v2ManifestHash = "f871d94812c763a9b2decfffc7a94a9991e4fd04e519a0538fca35d12e2877bc"
const baseLedger = ["0001", "0002", "0003", "0004", "0005", "local-read-0001"]
const installedLedger = [...baseLedger.slice(0, 5), "local-ra-0002", "local-read-0001"]
const migration = "../migrations/0002_ra_official_catalog.sql"
const releaseFiles = ["execute.mjs", "preflight.sql", "inspect.sql", "stage.sql", "compare.sql", "load.sql", migration]
const v2Files = ["install.sql", "payload.json", "qualify.mjs", "run.py"]
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex")
const hexHash = value => typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const readAsset = name => readFile(new URL(name, import.meta.url))

class CheckFailed extends Error {}

function requireCheck(ok, code) {
  if (!ok) throw new CheckFailed(code)
}

async function verifyFiles(read, prefix, files, names) {
  requireCheck(files && same(Object.keys(files).sort(), [...names].sort()), "MANIFEST_ENTRIES")
  const checked = {}
  for (const name of names) {
    const bytes = await read(prefix + name)
    requireCheck(sha256(bytes) === files[name], "ASSET_HASH")
    checked[name] = bytes.toString("utf8")
  }
  return checked
}

export async function verifyRelease(read = readAsset, expectedReleaseHash) {
  const releaseBytes = await read("manifest.json")
  const releaseHash = sha256(releaseBytes)
  requireCheck(expectedReleaseHash === undefined || releaseHash === expectedReleaseHash, "RELEASE_HASH")
  const release = JSON.parse(releaseBytes)
  requireCheck(release.version === "local-ra-0002" && release.sourceManifestSha256 === v2ManifestHash, "RELEASE_VERSION")
  const sql = await verifyFiles(read, "", release.files, releaseFiles)

  const v2Bytes = await read("../ra-catalog-v2/manifest.json")
  requireCheck(sha256(v2Bytes) === v2ManifestHash, "V2_MANIFEST_HASH")
  const v2 = JSON.parse(v2Bytes)
  requireCheck(v2.version === version && v2.scope === "sandbox-only", "V2_VERSION")
  const assets = await verifyFiles(read, "../ra-catalog-v2/", v2.files, v2Files)
  const payload = JSON.parse(assets["payload.json"])
  requireCheck(payload.version === version && payload.catalogVersion === catalogVersion &&
    payload.scope === "sandbox-only" && payload.entries.length === 37, "PAYLOAD")
  const source = await read("../../../public/data/cartography/ras-ide-2026-11-13.geojson")
  requireCheck(sha256(source) === payload.sourceHash, "SOURCE_HASH")
  const features = JSON.parse(source).features
  const byCode = new Map(features.map(feature => [feature.properties.ra_codigo, feature]))
  requireCheck(features.length === 37 && byCode.size === 37, "SOURCE_DUPLICATES")
  const rows = payload.entries.map(({ code, name, metadata }) => {
    const feature = byCode.get(code)
    requireCheck(feature && String(feature.properties.objectid) === metadata.sourceObjectId &&
      feature.properties.ra_nome === metadata.sourceName && code === metadata.ideCode &&
      metadata.sourceHash === payload.sourceHash && metadata.approvalStatus === "approved", "SOURCE_IDENTITY")
    return { code, label: name, metadata, geometry: feature.geometry }
  })
  requireCheck(new Set(rows.map(row => row.code)).size === 37 &&
    new Set(rows.map(row => row.metadata.administrativeNumber)).size === 37 &&
    new Set(rows.map(row => row.metadata.sourceObjectId)).size === 37, "PAYLOAD_DUPLICATES")
  const approved = Object.fromEntries(rows.map(row => [row.code, { name: row.label, metadata: row.metadata }]))
  const literal = "'" + JSON.stringify(approved).replaceAll("'", "''") + "'"
  requireCheck(sql[migration].split("__APPROVED_JSON__").length === 3 &&
    sql[migration].split("__RENDERED_RELEASE__").length === 2 &&
    !literal.includes("$$") && !literal.includes("$migration$"), "DDL_TEMPLATE")
  sql[migration] = sql[migration].replace("__RENDERED_RELEASE__", release.version)
    .replaceAll("__APPROVED_JSON__", () => literal)
  return { sql, rows, releaseHash }
}

export async function verifyBackup(directory, reportHash) {
  const reportBytes = await readFile(join(directory, "report.json"))
  requireCheck(sha256(reportBytes) === reportHash, "BACKUP_REPORT_HASH")
  const report = JSON.parse(reportBytes)
  requireCheck(report.result === "PASS" && report.source_state_preserved === true &&
    report.sandbox_final === "STOPPED" && report.source?.database === database &&
    report.source.system_id === systemId && report.source.readonly === "on" &&
    /^3\.[0-9]+\.[0-9]+$/.test(report.source.postgis) &&
    report.backup?.format === "custom" && report.backup.consistent_exported_snapshot === true &&
    hexHash(report.backup.sha256) && report.restore?.table_data_hashes_equal === true &&
    same(report.restore.structural_differences, []) && report.global_checks?.catalog_total === 0 &&
    report.global_checks.distinct_codes === 0 && report.global_checks.duplicate_code_groups === 0 &&
    same(report.global_checks.ledger, baseLedger), "BACKUP_SCOPE")
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(join(directory, "database.dump"))) hash.update(chunk)
  requireCheck(hash.digest("hex") === report.backup.sha256, "BACKUP_ARCHIVE_HASH")
  return { postgis: report.source.postgis }
}

function catalogState(state) {
  if (state?.protected !== true || state.total !== state.distinct_codes) return "DIVERGENT_OR_INCONCLUSIVE"
  if (!state.installed && !state.has_reference && !state.reference_checks && !state.official_policies &&
    state.policies === 6 && state.total === 0 && same(state.ledger, baseLedger)) return "NOT_PERSISTED"
  if (state.installed && state.has_reference && state.reference_checks && state.official_policies &&
    state.policies === 8 && state.total === 37 && same(state.ledger, installedLedger)) return "PERSISTED"
  return "DIVERGENT_OR_INCONCLUSIVE"
}

export async function reconcileCatalog(client, release, backup) {
  let locked = false
  let transaction = false
  try {
    await client.query("BEGIN READ ONLY")
    transaction = true
    await client.query("SET LOCAL search_path = pg_catalog; SET LOCAL statement_timeout = '5s'")
    const identity = await client.query(release.sql["preflight.sql"], [systemId, backup.postgis])
    requireCheck(identity.rows[0]?.ok === true, "TARGET")
    const { rows: [lock] } = await client.query("SELECT pg_try_advisory_lock(743204,23) AS acquired")
    requireCheck(lock.acquired === true, "MAINTENANCE_BUSY")
    locked = true
    await client.query("ROLLBACK")
    transaction = false
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
    transaction = true
    await client.query("SET LOCAL search_path = pg_catalog; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '60s'")
    // Start the snapshot after acquiring the same lock used by the writer.
    const { rows: [state] } = await client.query(release.sql["inspect.sql"])
    let outcome = catalogState(state)
    if (outcome === "PERSISTED") {
      const { rows: [catalog] } = await client.query(release.sql["compare.sql"], [JSON.stringify(release.rows)])
      if (catalog.total !== 37 || catalog.matched !== 37) outcome = "DIVERGENT_OR_INCONCLUSIVE"
    }
    return { outcome, catalogTotal: state.total, ledger: state.ledger }
  } finally {
    try {
      if (transaction) await client.query("ROLLBACK")
    } finally {
      if (locked) await client.query("SELECT pg_catalog.pg_advisory_unlock(743204,23)")
    }
  }
}

export async function applyCatalog(client, release, backup, audit) {
  const { rows, sql } = release
  const query = (file, parameters) => client.query(sql[file], parameters)
  let transaction = false
  try {
    await client.query("BEGIN")
    transaction = true
    audit.stage = "preflight"
    await client.query(`SET LOCAL search_path = pg_catalog;
      SET LOCAL standard_conforming_strings = on;
      SET LOCAL lock_timeout = '5s';
      SET LOCAL statement_timeout = '60s';`)
    const identity = await query("preflight.sql", [systemId, backup.postgis])
    requireCheck(identity.rows[0]?.ok === true, "TARGET")
    await client.query(`SELECT pg_advisory_xact_lock(743204,23);
      LOCK TABLE sentinela.schema_migrations, sentinela.regioes_administrativas IN ACCESS EXCLUSIVE MODE;`)

    const { rows: [state] } = await query("inspect.sql")
    const installed = state.installed
    requireCheck(same(state.ledger, installed ? installedLedger : baseLedger), "BASELINE")
    requireCheck(state.total === state.distinct_codes && state.total === (installed ? 37 : 0), "EXISTING_CATALOG")
    const fresh = catalogState(state) === "NOT_PERSISTED"
    requireCheck(fresh || catalogState(state) === "PERSISTED", "BASELINE")

    audit.stage = "stage-source"
    await client.query(`CREATE TEMP TABLE expected_ra (
      code text PRIMARY KEY, label text NOT NULL, metadata jsonb NOT NULL,
      geom extensions.geometry(MultiPolygon,4326) NOT NULL
    ) ON COMMIT DROP`)
    requireCheck((await query("stage.sql", [JSON.stringify(rows)])).rowCount === 37, "STAGED_COUNT")
    let inserted = 0
    if (fresh) {
      audit.stage = "migration"
      await query(migration)
      audit.stage = "load"
      inserted = (await query("load.sql")).rowCount
      requireCheck(inserted === 37, "INSERT_COUNT")
    }
    audit.stage = "postconditions"
    const { rows: [catalog] } = await query("compare.sql", [JSON.stringify(rows)])
    requireCheck(catalog.total === 37 && catalog.matched === 37, "CATALOG_MISMATCH")
    const { rows: [ledger] } = await query("inspect.sql")
    requireCheck(catalogState(ledger) === "PERSISTED", "POST_MIGRATION")
    const { rows: [metadata] } = await client.query(`SELECT
      has_column_privilege('sentinela_local_reader','sentinela.regioes_administrativas',
                           'referencia_cartografica','SELECT') AS exposed`)
    requireCheck(metadata.exposed === false, "METADATA_EXPOSED")
    await client.query("SET LOCAL ROLE sentinela_local_reader")
    const { rows: [visible] } = await client.query(`SELECT count(id)::int AS total,
      count(nome)::int AS named FROM sentinela.regioes_administrativas`)
    requireCheck(visible.total === 37 && visible.named === 37, "READER_PROJECTION")
    await client.query("RESET ROLE")
    audit.stage = "commit"
    await client.query("COMMIT")
    return { inserted, reused: 37 - inserted }
  } catch (error) {
    if (transaction && audit.stage !== "commit") {
      try {
        await client.query("ROLLBACK")
        audit.rollback = "confirmed"
      } catch {
        audit.rollback = "unconfirmed"
      }
    } else if (audit.stage === "commit") {
      audit.commit = "unknown"
    }
    throw error
  }
}

async function main(args) {
  const audit = { result: "FAIL", stage: "arguments" }
  let client
  try {
    const offline = args.length === 0 || same(args, ["--verify"])
    const [action, releaseHash, backupHash, directory] = args
    requireCheck(offline || (args.length === 4 && ["--apply", "--reconcile"].includes(action) &&
      hexHash(releaseHash) && hexHash(backupHash) && directory), "ARGUMENTS")
    audit.stage = "release"
    const release = await verifyRelease(readAsset, releaseHash)
    audit.releaseSha256 = release.releaseHash
    if (!offline) {
      audit.stage = "backup"
      const backup = await verifyBackup(directory, backupHash)
      audit.backupReportSha256 = backupHash
      audit.stage = "connect"
      const password = process.env.SENTINELA_RA_MAINTENANCE_PASSWORD
      requireCheck(password, "MAINTENANCE_CREDENTIAL_REQUIRED")
      const { Client } = await import("pg")
      client = new Client({
        host: "127.0.0.1", port: 5432, database, user: "postgres", password,
        ssl: false, connectionTimeoutMillis: 5000, application_name: "sentinela-ra-operational",
        options: action === "--reconcile" ? "-c default_transaction_read_only=on" : "",
      })
      client.on("error", () => {})
      await client.connect()
      if (action === "--reconcile") {
        audit.stage = "reconcile"
        Object.assign(audit, await reconcileCatalog(client, release, backup))
        audit.result = "RECONCILED"
        if (audit.outcome === "DIVERGENT_OR_INCONCLUSIVE") process.exitCode = 1
      } else {
        Object.assign(audit, await applyCatalog(client, release, backup, audit))
        audit.result = "COMMITTED"
      }
    }
    if (offline) audit.result = "VERIFIED_OFFLINE"
    audit.stage = "complete"
  } catch (error) {
    if (args[0] === "--reconcile") audit.outcome = "DIVERGENT_OR_INCONCLUSIVE"
    audit.code = error instanceof CheckFailed ? error.message : "EXECUTION_ERROR"
    if (/^[0-9A-Z]{5}$/.test(error?.code ?? "")) audit.sqlState = error.code
    process.exitCode = 1
  } finally {
    if (client) {
      try { await client.end() } catch { audit.connectionClose = "unconfirmed" }
    }
    process.stdout.write(JSON.stringify(audit) + "\n")
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main(process.argv.slice(2))
}
