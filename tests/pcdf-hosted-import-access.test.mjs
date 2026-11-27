import assert from "node:assert/strict";
import test from "node:test";
import { historicalStatus } from "../src/contracts/pcdf-direct.ts";
import { hostedImportMode, hostedOperationalMode } from "../src/lib/db/pcdf-direct-mode.ts";

const hosted = {
  SENTINELA_IMPORT_MODE: "supabase",
  SENTINELA_AUTH_PROVIDER: "supabase",
  SENTINELA_APP_ORIGIN: "https://sentinela.example",
};

test("the historical import flag leaves the other operational write gates closed", () => {
  const env = { ...hosted, SENTINELA_SUPABASE_IMPORT_WRITE: "1", SENTINELA_SUPABASE_OPERATIONAL_WRITE: "0" };
  assert.deepEqual(hostedImportMode(env), { origin: hosted.SENTINELA_APP_ORIGIN, historicalWrite: true, write: false });
  assert.equal(hostedOperationalMode(env).write, false);
  assert.equal(hostedImportMode({ ...env, SENTINELA_SUPABASE_OPERATIONAL_WRITE: "1" }).write, true);
  assert.equal(hostedImportMode(hosted).historicalWrite, false);
});

test("incomplete hosted inventory remains readable and cannot be approved", () => {
  const status = { items: [], canApprove: false, canValidate: false, block: "inventory" };
  assert.deepEqual(historicalStatus.parse(status), status);
  assert.equal(historicalStatus.safeParse({ ...status, canApprove: true }).success, false);
});
