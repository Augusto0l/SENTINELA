import assert from "node:assert/strict"
import { Client } from "pg"
import "./contracts-runtime.mjs"
import catalog from "../docs/catalogos/pcdf-naturezas-xml-v1.json" with { type: "json" }

const role = "sentinela_local_analyst"
const password = process.env[`SENTINELA_PCDF_LOCAL_PASSWORD_${role}`]
assert(process.env.SENTINELA_MANAGEMENT_FIXTURE && /^[0-9a-f]{64}$/.test(password ?? ""))
const { analyticsSql } = await import("../src/lib/db/analytics-query.ts")
const { persistentAnalyticsData } = await import("../src/contracts/persistent-analytics.ts")
const client = new Client({ host: "127.0.0.1", port: 55488, database: "sentinela_pcdf_local",
  user: role, password, connectionTimeoutMillis: 3000, statement_timeout: 8000,
  options: "-c default_transaction_read_only=on -c row_security=on" })
await client.connect()
try {
  const { rows: [identity] } = await client.query("SELECT sentinela_ocorrencias_local.identidade() AS data")
  assert.equal(identity.data.uuid, process.env.SENTINELA_PCDF_LOCAL_ID)
  assert.equal(identity.data.system, process.env.SENTINELA_PCDF_LOCAL_SYSTEM_ID)
  assert.equal(identity.data.readonly, "on")
  const query = async (filters = {}) => {
    const { rows: [row] } = await client.query(analyticsSql({ startDate: "2020-02-01", endDate: "2020-02-29", ...filters }, "integrated"))
    return persistentAnalyticsData.parse(row.data)
  }
  const result = await query()
  assert.deepEqual(result.natures.map(item => item.name), catalog.naturezas)
  assert.equal(result.total, 1)
  assert.deepEqual(result.byNature, [{ key: "ESTUPRO", count: 1 }, { key: "ESTUPRO DE VULNERÁVEL", count: 1 }])
  assert.deepEqual(result.byCategory, [{ key: "ESTUPRO", count: 1 }])
  const natureza = result.natures.find(item => item.name === "ESTUPRO DE VULNERÁVEL").id
  assert.equal((await query({ nature: natureza, category: "ESTUPRO" })).total, 1)
  assert.equal((await query({ nature: natureza, category: "CATEGORIA INEXISTENTE" })).total, 0)
  const { rows: [summary] } = await client.query("SELECT sentinela_ocorrencias_local.resumo() AS data")
  assert.equal(summary.data.canImport, false)
  assert.equal(summary.data.recebidas, null)
  const canonical = result.natures.find(item => item.name === "ESTUPRO").id
  assert.deepEqual(summary.data.naturezasConsolidadas.filter(item => item.label === "ESTUPRO"),
    [{ id: canonical, label: "ESTUPRO" }])
  const { rows: [listed] } = await client.query(
    "SELECT sentinela_ocorrencias_local.lista('consolidadas',$1,1,'data','asc') AS data", [{ naturezaId: canonical }],
  )
  assert.equal(listed.data.total, 1)
  await assert.rejects(client.query("SELECT natureza_original FROM sentinela.linhas_origem"), { code: "42501" })
  console.log("Analista: catálogo, categoria da PCDF, contagem distinta, filtros combinados e RLS conferidos no clone.")
} finally {
  await client.end()
}
