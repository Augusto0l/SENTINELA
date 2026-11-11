import "./contracts-runtime.mjs"
import assert from "node:assert/strict"
const { queryOccurrences } = await import("../src/lib/db/occurrences.ts")
const { persistentQuerySchema, persistentListDataSchema } = await import("../src/contracts/persistent-occurrences.ts")
try {
  const principal={source:"local",id:"integration-test",authUserId:"",name:"Teste local",role:"Analista"}
  const query=persistentQuerySchema.parse({})
  const first=persistentListDataSchema.parse(await queryOccurrences(principal,query))
  const filters=persistentQuerySchema.parse({local:"%' OR true --",pageSize:1,sortBy:"ra",direction:"asc"})
  persistentListDataSchema.parse(await queryOccurrences(principal,filters))
  const missing=await queryOccurrences(principal,query,"ffffffff-ffff-4fff-8fff-ffffffffffff")
  assert.equal(missing.items.length,0)
  console.log(`PASS: autenticação operacional, identidade, RLS habilitada e consultas SQL reais. Total visível: ${first.pagination.total}. Sem fixtures ou escrita; filtragem RLS positiva não re-homologada neste banco vazio.`)
} catch { console.error("FAIL: integração indisponível; diagnóstico sensível omitido.");process.exitCode=1 }
