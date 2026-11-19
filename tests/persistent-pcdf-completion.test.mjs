import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import { completionSql } from "../database/local/persistent-homologation/completion-sql.mjs"
import { parseXlsx, xlsxFixture } from "../database/local/persistent-homologation/install-completion.mjs"
import { syntheticPcdfFixture } from "../database/local/persistent-homologation/install-pcdf.mjs"

test("XLSX preserves 34 fields, zeros, Unicode and significant spaces in the CSV pipeline", () => {
  const fixture=syntheticPcdfFixture()
  const original='  Área; "São Paulo" 🧪  '
  for (const row of fixture.batch.rows) {
    row.raw.numero_registro="000042"
    row.raw.local=original
  }
  for (const shared of [true,false]) {
    const workbook=xlsxFixture(fixture,sheet=>sheet,shared)
    const {batch,csv}=parseXlsx(workbook)
    assert.equal(batch.rows.length,2)
    assert.equal(batch.sha256,createHash("sha256").update(csv).digest("hex"))
    assert.deepEqual(batch.rows.map(row=>row.raw),fixture.batch.rows.map(row=>row.raw))
    assert(batch.rows.every(row=>Object.keys(row.raw).length===34 && row.raw.local===original))
    assert(batch.rows.every(row=>row.derived.candidate[2]==="000042"))
  }
})

test("XLSX reports coordinates for formulas and rejects ambiguous or invalid input", () => {
  const fixture=syntheticPcdfFixture()
  const replace=(cell,value)=>xlsxFixture(fixture,sheet=>{sheet[cell]=value;return sheet})
  assert.throws(()=>parseXlsx(replace("C2",{t:"str",v:"000042",f:'"000042"'})),/linha_2_coluna_3_formula_recusada/)
  assert.throws(()=>parseXlsx(replace("C2",{t:"n",v:42,z:"000000"})),/linha_2_coluna_3_use_texto/)
  assert.throws(()=>parseXlsx(replace("AH1",{t:"s",v:"invalido"})),/cabecalho_invalido/)
  assert.throws(()=>parseXlsx(Buffer.from("xlsx_corrompido")),/xlsx_malformado/)
  const emptyIdentifier=parseXlsx(replace("C2",{t:"s",v:""}))
  assert(emptyIdentifier.batch.rows[0].diagnostics.some(item=>item.rule==="identidade_incompleta"))
  const repeatedText="s".repeat(16_384)
  const raw=Object.fromEntries(Object.keys(fixture.batch.rows[0].raw).map(key=>[key,repeatedText]))
  fixture.batch.rows=Array.from({length:40},()=>({raw}))
  assert.throws(()=>parseXlsx(xlsxFixture(fixture)),/linha_\d+_csv_excede_limite/)
})

test("completion migration binds original storage and review paging to the approved cluster", async () => {
  const sql=await completionSql()
  assert.equal(createHash("sha256").update(sql).digest("hex"),
    "64f584933fca5a18c319cf3915ad3db0bb7ff2104ee943fc8faf57f2ad403190")
  assert.match(sql,/ALTER TABLE sentinela_homolog_pcdf.xlsx_originals FORCE ROW LEVEL SECURITY/)
  assert.match(sql,/ON CONFLICT\(lot_id,sha256\) DO NOTHING/)
  assert.match(sql,/ORDER BY CASE WHEN p_order='prioridade'/)
  assert.doesNotMatch(sql,/55432|sentinela_rls_sandbox/)
})
