// Import ONE monthly PCDF v2 CSV into the disposable clone 127.0.0.1:55487 through the real historical receiver.
// Usage (from the repository root): node database/local/catalogo-criminal/importar_competencia.mjs <clone-root> <csv-dir> <AAAA-MM>
// The clone password arrives in SENTINELA_PG_REVIEW_CLONE (set in memory by the Python harness).
import "../../../scripts/contracts-runtime.mjs"
import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { readFile, realpath } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import pg from "pg"
import { historicalReceipt } from "../../../src/contracts/pcdf-direct.ts"
import { preparePcdfCsvDelivery } from "../../../src/lib/db/pcdf-v2-delivery.ts"

const [rootArg, csvDir, month] = process.argv.slice(2)
assert.match(month ?? "", /^\d{4}-(0[1-9]|1[0-2])$/)
const root = await realpath(rootArg)
assert.match(basename(root), /^clone-[0-9a-f]{32}$/)
assert.equal(dirname(root).toLowerCase(), (await realpath(join(process.env.USERPROFILE, ".sentinela-local", "homologacao-clone"))).toLowerCase())
const identity = JSON.parse(await readFile(join(root, "identity-55487.json"), "utf8"))
const client = new pg.Client({ host: "127.0.0.1", port: 55487, database: "sentinela_pcdf_local", user: "postgres",
  password: process.env.SENTINELA_PG_REVIEW_CLONE, application_name: "sentinela-catalogo-ensaio", statement_timeout: 120000 })
await client.connect()
const query = async (sql, values) => (await client.query(sql, values)).rows
try {
  const [{ port, uuid, system }] = await query(`SELECT inet_server_port() AS port, current_setting('sentinela.sandbox_uuid') AS uuid,
    system_identifier::text AS system FROM pg_control_system()`)
  assert.deepEqual([port, uuid, system], [55487, identity.uuid, identity.system])
  const name = `pcdf_naturezas_${month}.csv`
  const bytes = await readFile(join(csvDir, name))
  const delivery = await preparePcdfCsvDelivery(new File([bytes], name), true)
  assert.equal(delivery.preview.standalone.invalid, 0)
  const [{ usuario, conta, validade }] = await query("SELECT usuario,conta,validade::text FROM sentinela_gestao_autorizacao.atores")
  const [release] = await query("SELECT cluster_uuid,system_id,porta,aberta FROM sentinela_gestao_autorizacao.release")
  const account = randomBytes(32).toString("hex")
  await query("UPDATE sentinela_gestao_autorizacao.atores SET conta=$1,validade=clock_timestamp()+interval '1 hour'", [account])
  await query("UPDATE sentinela_gestao_autorizacao.release SET cluster_uuid=$1,system_id=$2,porta=55487,aberta=true", [identity.uuid, identity.system])
  try {
    await query("BEGIN")
    await query("SET LOCAL SESSION AUTHORIZATION sentinela_local_admin")
    const [{ data }] = await query("SELECT sentinela_pcdf_historico.receive($1,$2,$3,$4,$5) AS data",
      [randomUUID(), usuario, account, delivery.batch, bytes])
    await query("COMMIT")
    const receipt = historicalReceipt.parse(data)
    console.log(JSON.stringify({ month: receipt.month, state: receipt.state, lot: receipt.lot, unique: receipt.unique, links: receipt.links }))
  } catch (error) {
    await query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    await query("UPDATE sentinela_gestao_autorizacao.atores SET conta=$1,validade=$2::timestamptz", [conta, validade])
    await query("UPDATE sentinela_gestao_autorizacao.release SET cluster_uuid=$1,system_id=$2,porta=$3,aberta=$4",
      [release.cluster_uuid, release.system_id, release.porta, release.aberta])
  }
} finally {
  await client.end()
}
