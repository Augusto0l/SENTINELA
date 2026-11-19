import assert from "node:assert/strict"
import test from "node:test"
import { assertHostedEnvironment } from "../scripts/hosted-env.mjs"

test("hosted builds reject local accounts, maintenance secrets and service keys by name only", () => {
  for (const target of [{ VERCEL: "1" }, { VERCEL_ENV: "preview" }, { VERCEL_ENV: "production" }]) {
    assert.doesNotThrow(() => assertHostedEnvironment({ ...target, SENTINELA_LOCAL_DEMO: "0" }))
    for (const [name, value] of Object.entries({
      SENTINELA_AUTH_PROVIDER: "local", SENTINELA_LOCAL_DEMO: "1",
      SENTINELA_LOCAL_ACCOUNTS_FILE: "secret-fixture", SENTINELA_LOCAL_READER_URL: "secret-fixture",
      SENTINELA_SANDBOX_PCDF: "1",
      SENTINELA_DATABASE_URL: "secret-fixture", SUPABASE_SERVICE_ROLE_KEY: "secret-fixture",
      SUPABASE_SECRET_KEY: "secret-fixture", PGPASSFILE: "secret-fixture",
    })) {
      assert.throws(() => assertHostedEnvironment({ ...target, [name]: value }),
        error => error.message.includes(name) && !error.message.includes("secret-fixture"))
    }
  }
  assert.doesNotThrow(() => assertHostedEnvironment({ SENTINELA_AUTH_PROVIDER: "local" }))
})
