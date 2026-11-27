import "../scripts/contracts-runtime.mjs"
import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
const {validQueries,invalidQueries,safeError,assertOperationalRegions}=await import("../scripts/homologate-local-reader.mjs")
const {parsePersistentQuery}=await import("../src/contracts/persistent-occurrences.ts")
const {contractError}=await import("../src/contracts/common.ts")

test("HTTP qualification matrix: valid filters/sorts/pages and all invalid attempts agree with Zod",()=>{
  for(const query of validQueries)parsePersistentQuery(new URLSearchParams(query))
  for(const query of invalidQueries)assert.throws(()=>parsePersistentQuery(new URLSearchParams(query)),query)
})
test("HTTP qualification validates error envelopes and rejects internal SQL/URI leakage",()=>{
  safeError(contractError("SERVICE_UNAVAILABLE","Banco indisponível."))
  for(const message of ["SELECT id FROM sentinela.ocorrencias","postgresql://synthetic","ECONNREFUSED","password failure"])
    assert.throws(()=>safeError(contractError("INTERNAL_ERROR",message)))
})

test("HTTP qualification requires exact agreement with the 37 persisted RA bindings",async()=>{
  const bindings=JSON.parse(await readFile(new URL("../public/data/cartography/ra-bindings.json",import.meta.url),"utf8"))
  const items=bindings.entries.map(entry=>({id:entry.raId,nome:entry.catalogName}))
  assertOperationalRegions(items.toReversed(),bindings)
  assert.throws(()=>assertOperationalRegions(items.slice(1),bindings))
  assert.throws(()=>assertOperationalRegions([{...items[0],nome:"Fixture divergente"},...items.slice(1)],bindings))
  assert.throws(()=>assertOperationalRegions([{...items[0],limite:{}},...items.slice(1)],bindings))
})
test("interactive command selects complete HTTP qualification by default, without secret argv or file configuration",async()=>{
  const script=await readFile(new URL("../scripts/test-local-reader.ps1",import.meta.url),"utf8")
  assert.match(script,/Read-Host.*-AsSecureString/);assert.match(script,/EscapeDataString/)
  assert.match(script,/homologate-local-reader\.mjs/);assert.match(script,/--execute/)
  assert.match(script,/ZeroFreeBSTR/);assert.match(script,/finally/)
  assert(!script.includes("Set-Content"));assert(!script.includes(".env.local"))
})
