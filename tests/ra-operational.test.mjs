import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { applyCatalog, reconcileCatalog, verifyRelease } from "../database/local/ra-operational/execute.mjs"

const root = new URL("../database/local/ra-operational/", import.meta.url)
const release = await verifyRelease()
const base = ["0001", "0002", "0003", "0004", "0005", "local-read-0001"]
const migrated = ["0001", "0002", "0003", "0004", "0005", "local-ra-0002", "local-read-0001"]
const migration = release.sql["../migrations/0002_ra_official_catalog.sql"]

function fixture({ existing = false, total = existing ? 37 : 0, distinct = total,
  matched = 37, target = true, fail = "" } = {}) {
  const statements = []
  let installed = existing, loaded = false
  const client = {
    async query(sql, args) {
      statements.push(sql)
      if (sql === fail) throw new Error("simulated database failure")
      switch (sql) {
        case release.sql["preflight.sql"]:
          return { rows: [{ ok: target }] }
        case release.sql["inspect.sql"]:
          return { rows: [{ protected: true, installed, ledger: installed ? migrated : base,
            policies: installed ? 8 : 6, official_policies: installed, has_reference: installed,
            reference_checks: installed, total: loaded ? 37 : total, distinct_codes: loaded ? 37 : distinct }] }
        case release.sql["stage.sql"]:
          assert.equal(JSON.parse(args[0]).length, 37)
          return { rowCount: 37 }
        case migration:
          installed = true
          break
        case release.sql["load.sql"]:
          loaded = true
          return { rowCount: 37 }
        case release.sql["compare.sql"]:
          return { rows: [{ total: 37, matched }] }
        default:
          if (sql.includes("AS acquired")) return { rows: [{ acquired: true }] }
          if (sql.includes("AS exposed")) return { rows: [{ exposed: false }] }
          if (sql.includes("AS named")) return { rows: [{ total: 37, named: 37 }] }
      }
      return { rows: [] }
    },
  }
  return { statements, client, audit: {} }
}

test("release pins the reviewed source and renders an incremental migration without a stored loader", async () => {
  assert.equal(release.rows.length, 37)
  assert.equal(release.rows.find(row => row.code === "XXXVII").label, "Ponte Alta")
  assert.match(migration, /AS RESTRICTIVE FOR SELECT TO sentinela_local_reader/)
  assert.match(migration, /approved_reference\(codigo_interno,nome,referencia_cartografica\)/)
  assert.match(migration, /local-ra-0002/)
  assert.doesNotMatch(migration, /__APPROVED_JSON__|__RENDERED_RELEASE__|SECURITY DEFINER|load_catalog|COMMIT/)
  await assert.rejects(verifyRelease(undefined, "0".repeat(64)), /RELEASE_HASH/)
  const withTamper = async name => {
    const bytes = await readFile(new URL(name, root))
    return name === "load.sql" ? Buffer.concat([bytes, Buffer.from(" ")]) : bytes
  }
  await assert.rejects(verifyRelease(withTamper), /ASSET_HASH/)
})

test("DDL, load and ledger verification finish before the single commit", async () => {
  const { client, statements, audit } = fixture()
  assert.deepEqual(await applyCatalog(client, release, {}, audit), { inserted: 37, reused: 0 })
  assert.equal(statements[0], "BEGIN")
  assert(statements.indexOf(migration) < statements.indexOf(release.sql["load.sql"]))
  assert.equal(statements.at(-1), "COMMIT")
})

test("rerun verifies exact contents and commits without reapplying DDL or inserting UUIDs", async () => {
  const { client, statements, audit } = fixture({ existing: true })
  assert.deepEqual(await applyCatalog(client, release, {}, audit), { inserted: 0, reused: 37 })
  assert(!statements.includes(migration))
  assert(!statements.includes(release.sql["load.sql"]))
})

test("wrong target, partial or duplicate catalogs and content drift abort the transaction", async () => {
  for (const [options, error] of [
    [{ target: false }, /TARGET/],
    [{ total: 1 }, /EXISTING_CATALOG/],
    [{ existing: true, distinct: 36 }, /EXISTING_CATALOG/],
    [{ existing: true, matched: 36 }, /CATALOG_MISMATCH/],
  ]) {
    const { client, statements, audit } = fixture(options)
    await assert.rejects(applyCatalog(client, release, {}, audit), error)
    assert(!statements.includes(migration))
    assert.equal(statements.at(-1), "ROLLBACK")
  }
})

test("load failure rolls back and a lost commit acknowledgement is reported as unknown", async () => {
  const failedLoad = fixture({ fail: release.sql["load.sql"] })
  await assert.rejects(applyCatalog(failedLoad.client, release, {}, failedLoad.audit))
  assert.equal(failedLoad.audit.rollback, "confirmed")
  assert.equal(failedLoad.statements.at(-1), "ROLLBACK")

  const failedCommit = fixture({ fail: "COMMIT" })
  await assert.rejects(applyCatalog(failedCommit.client, release, {}, failedCommit.audit))
  assert.equal(failedCommit.audit.commit, "unknown")
  assert.equal(failedCommit.statements.at(-1), "COMMIT")
})

test("reconciliation only reads and distinguishes empty, exact, partial and divergent states", async () => {
  for (const [options, outcome] of [
    [{}, "NOT_PERSISTED"],
    [{ existing: true }, "PERSISTED"],
    [{ total: 12 }, "DIVERGENT_OR_INCONCLUSIVE"],
    [{ existing: true, matched: 36 }, "DIVERGENT_OR_INCONCLUSIVE"],
  ]) {
    const { client, statements } = fixture(options)
    assert.equal((await reconcileCatalog(client, release, {})).outcome, outcome)
    assert.equal(statements[0], "BEGIN READ ONLY")
    assert.equal(statements.at(-2), "ROLLBACK")
    assert.match(statements.at(-1), /pg_advisory_unlock/)
    assert(!statements.includes(migration))
    assert(!statements.includes(release.sql["load.sql"]))
  }
})
