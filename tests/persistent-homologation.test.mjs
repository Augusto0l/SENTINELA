import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import { approvedSource } from "../database/local/persistent-homologation/approved-source.mjs"
import { assertPersistentIdentity, DatabaseUnavailable, persistentReadConfig,
  persistentDestination as destination, persistentReaders } from "../src/lib/db/config.ts"

const env = {
  NODE_ENV: "development", SENTINELA_AUTH_PROVIDER: "local", SENTINELA_LOCAL_BIND: "127.0.0.1",
  SENTINELA_APP_ORIGIN: "http://127.0.0.1:3317", SENTINELA_PERSISTENT_HOMOLOGATION: "1",
  ...Object.fromEntries(Object.values(persistentReaders).map((user, i) =>
    [`SENTINELA_PERSISTENT_PASSWORD_${user}`, String(i).repeat(64)])),
}

test("a fonte homologada aceita finais de linha Git e recusa mudanças de conteúdo", () => {
  const sql = "-- fonte homologada\nSELECT 37;\n"
  const windows = Buffer.from(sql.replaceAll("\n", "\r\n"))
  const digest = createHash("sha256").update(windows).digest("hex")
  assert.equal(approvedSource(windows, digest), sql)
  assert.equal(approvedSource(Buffer.from(sql), digest), sql)
  assert.throws(() => approvedSource(Buffer.from(sql.replace("37", "36")), digest), /Fonte homologada divergente/)
  assert.throws(() => approvedSource(Buffer.from([0xff]), digest), TypeError)
})

test("homologação usa credenciais próprias por perfil e recusa configuração conflitante", () => {
  for (const [role, user] of Object.entries(persistentReaders)) {
    assert.deepEqual(persistentReadConfig(role, env), { host: destination.host, port: destination.port,
      database: destination.database, user, password: env[`SENTINELA_PERSISTENT_PASSWORD_${user}`] })
  }
  for (const [key, value] of Object.entries({
    NODE_ENV: "production", SENTINELA_AUTH_PROVIDER: "supabase", SENTINELA_LOCAL_BIND: "0.0.0.0",
    SENTINELA_APP_ORIGIN: "http://example.test", SENTINELA_PERSISTENT_HOMOLOGATION: "", VERCEL: "1",
    SENTINELA_SANDBOX_WRITE: "1", SENTINELA_LOCAL_READER_URL: "configured", SENTINELA_DATABASE_URL: "configured",
    NEXT_PUBLIC_SUPABASE_URL: "configured", SUPABASE_SERVICE_ROLE_KEY: "configured",
    SENTINELA_PERSISTENT_PASSWORD_sprint4_homolog_analyst_read: "invalid",
  })) {
    assert.throws(() => persistentReadConfig("Analista", { ...env, [key]: value }), DatabaseUnavailable, key)
  }
})

test("homologação exige identidade exata e privilégios de leitura a cada transação", () => {
  const user = persistentReaders.Analista
  const identity = { db: destination.database, port: destination.port, host: destination.host, listen: destination.host,
    version: destination.version, postgis: destination.postgis, cluster: destination.cluster, system: destination.system,
    login: user, role: user, elevated: false, member: false, owner: false, rls: 19, readonly: "on", writable: false }
  assert.doesNotThrow(() => assertPersistentIdentity(identity, user))
  for (const key of Object.keys(identity)) {
    assert.throws(() => assertPersistentIdentity({ ...identity, [key]: null }, user), DatabaseUnavailable, key)
  }
  assert.throws(() => assertPersistentIdentity({ ...identity, port: 5432 }, user), DatabaseUnavailable)
  assert.throws(() => assertPersistentIdentity({ ...identity, port: 55432 }, user), DatabaseUnavailable)
})
