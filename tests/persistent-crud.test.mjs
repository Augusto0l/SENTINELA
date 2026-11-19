import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import { crudSql } from "../database/local/persistent-homologation/crud-sql.mjs"
import { persistentCrudEnabled } from "../src/lib/db/config.ts"
import { pcdfSql } from "../database/local/persistent-homologation/pcdf-sql.mjs"

test("rendered CRUD migration is pinned to its qualified persistent destination", async () => {
  const sql = await crudSql()
  assert.equal(createHash("sha256").update(sql).digest("hex"),
    "7082b2baaa7295c99e0725936e70c18dce641472540a345a14901f13b91916ea")
  assert.match(sql,/7709847064550752852/)
  assert.match(sql,/CREATE ROLE s4_hom_mutator NOLOGIN NOSUPERUSER NOBYPASSRLS/)
  assert.match(sql,/REVOKE EXECUTE ON FUNCTION sentinela_homolog_crud.cadastrar/)
  assert.doesNotMatch(sql,/55432|sentinela_rls_sandbox|Regiao SINTETICA de ensaio/)
  assert.doesNotMatch(sql,/DISABLE\s+(?:TRIGGER|ROW LEVEL)|NO\s+FORCE/i)
})

test("persistent CRUD requires both local development flags and loopback", () => {
  const env={NODE_ENV:"development",SENTINELA_AUTH_PROVIDER:"local",SENTINELA_LOCAL_BIND:"127.0.0.1",
    SENTINELA_PERSISTENT_HOMOLOGATION:"1",SENTINELA_PERSISTENT_CRUD:"1"}
  assert(persistentCrudEnabled(env))
  for (const key of Object.keys(env)) assert(!persistentCrudEnabled({...env,[key]:""}),key)
  assert(!persistentCrudEnabled({...env,VERCEL:"1"}))
})

test("persistent PCDF uses the qualified SQL, synthetic provenance and private approval", async () => {
  const sql=await pcdfSql()
  assert.equal(createHash("sha256").update(sql).digest("hex"),
    "affd01fafbbc839360258ea1eac9ad0eca36b0db16596f9faeb0b196990c707f")
  assert.match(sql,/Proveniencia sintetica recusada/)
  assert.match(sql,/CREATE ROLE s4_hom_pcdf NOLOGIN NOSUPERUSER NOBYPASSRLS/)
  assert.match(sql,/GRANT EXECUTE ON FUNCTION sentinela_homolog_pcdf.decide\(uuid,uuid,bigint,text,text,text\) TO s4_hom_admin_write/)
  assert.doesNotMatch(sql,/55432|sentinela_rls_sandbox|GRANT.*approved_groups.*s4_hom_(?:admin|operator)_write/)
})
