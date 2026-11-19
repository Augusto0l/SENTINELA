import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { readFile, realpath, writeFile } from "node:fs/promises"
import { join } from "node:path"
import XLSX from "xlsx"
import { persistentReaders, persistentWriters } from "../../../src/lib/db/config.ts"
import { connect, directory, readerPasswords } from "./install.mjs"
import { qualifiedWriterPasswords } from "./install-crud.mjs"
import { assertQualifiedPcdf, approveSyntheticFixture, pcdfMigrationSession, syntheticPcdfFixture } from "./install-pcdf.mjs"
import { pcdfSchema } from "./pcdf-sql.mjs"
import { completionLedger, completionRevision, completionSql } from "./completion-sql.mjs"

const hash = bytes => createHash("sha256").update(bytes).digest("hex")
const proofPath = join(directory, "completion-sql-qualified.json")
export const xlsxType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export async function completionQualified() {
  try { assert.equal(await realpath(proofPath), proofPath) }
  catch (error) { if (error.code === "ENOENT") return false; throw error }
  const proof = JSON.parse(await readFile(proofPath, "utf8"))
  assert.equal(proof.revision, completionRevision)
  assert.equal(proof.sqlSha256, hash(await completionSql()))
  return true
}

export function xlsxFixture(fixture = syntheticPcdfFixture(), change = sheet => sheet, bookSST = true) {
  const keys = Object.keys(fixture.batch.rows[0].raw)
  const sheet = XLSX.utils.aoa_to_sheet([keys, ...fixture.batch.rows.map(row => keys.map(key => row.raw[key]))])
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, change(sheet), "NATUREZAS")
  return XLSX.write(book, {type:"buffer",bookType:"xlsx",bookSST,compression:true})
}

export function parseXlsx(original, month = "2026-01") {
  const parser = join(directory,"..","..","database","local","persistent-homologation","xlsx.py")
  const result = spawnSync("python",["-E","-B",parser,month], {
    input:original,encoding:"utf8",timeout:30000,maxBuffer:128*1024*1024,windowsHide:true,
  })
  if (result.status !== 0) {
    const code = result.status === 2 && JSON.parse(result.stdout).error
    throw new Error(code || "parser_xlsx_indisponivel")
  }
  const {csv,...prepared} = JSON.parse(result.stdout)
  return {...prepared,csv:Buffer.from(csv,"base64")}
}

async function apply(sql, stem) {
  assert(/^funcional-[a-f0-9]{16}$/.test(stem ?? ""))
  const receipt=JSON.parse(await readFile(join(directory,stem+".json"),"utf8"))
  assert.equal(receipt.tables.length,30)
  assert.equal(receipt.backup,stem+".dump")
  assert.equal(receipt.sha256,hash(await readFile(join(directory,receipt.backup))))
  await assertQualifiedPcdf()
  await pcdfMigrationSession(async db => {
    await db.query("BEGIN")
    try {
      await db.query("SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='5s'; SELECT pg_advisory_xact_lock(743204,41)")
      await db.query(sql)
      await db.query("COMMIT")
    } catch(error) { await db.query("ROLLBACK"); throw error }
  })
}

async function verify(sql) {
  const writers=await qualifiedWriterPasswords()
  const readers=await readerPasswords()
  const {Administrador:admin,Operador:operator}=persistentWriters
  const analyst=persistentReaders.Analista
  const clients=[
    connect(operator.login,writers[operator.login]),connect(admin.login,writers[admin.login]),
    connect(admin.login,writers[admin.login]),connect(analyst,readers[analyst]),
  ]
  const [writer, reviewer, concurrentReviewer, viewer]=clients
  const original=xlsxFixture()
  const document=parseXlsx(original)
  const upload=async (client,sheet,parsed,xmlSha=parsed.xmlSha) =>
    (await client.query(`SELECT ${pcdfSchema}.upload_xlsx($1,$2,$3,$4,$5,$6) AS data`,
      [operator.subject,parsed.batch,parsed.csv,xmlSha,parsed.xmlSize,sheet])).rows[0].data
  const page=async (pageNumber,limit,keyword,order="antigas") =>
    (await viewer.query(`SELECT ARRAY(SELECT ${pcdfSchema}.review_page(
      'datas_horarios',NULL,NULL,$1,$2,$3,$4)) AS data`,[keyword,order,pageNumber,limit])).rows[0].data
  const data=await pcdfMigrationSession(async db=>{
    const {rows}=await db.query("SELECT versao FROM sentinela.schema_migrations ORDER BY versao")
    assert.deepEqual(rows.map(row=>row.versao),completionLedger)
    const {rows:[result]}=await db.query(`SELECT relrowsecurity AND relforcerowsecurity AS forced
      FROM pg_class WHERE oid='${pcdfSchema}.xlsx_originals'::regclass`)
    assert.equal(result.forced,true)
    return result
  })
  try {
    for (const client of clients) await client.connect()
    await assert.rejects(upload(viewer,original,document),{code:"42501"})
    await assert.rejects(writer.query(`SELECT content FROM ${pcdfSchema}.xlsx_originals`),{code:"42501"})
    await assert.rejects(upload(writer,original,document,"0".repeat(64)),{code:"22023"})
    let abandoned
    await writer.query("BEGIN")
    try { abandoned=await upload(writer,original,document) }
    finally { await writer.query("ROLLBACK") }
    const receipt=await upload(writer,original,document)
    assert.equal(receipt.records,2)
    assert.notEqual(receipt.lot,abandoned.lot)
    assert.deepEqual(await upload(writer,original,document),{replay:true,lot:receipt.lot,run:receipt.run})
    const first=await page(1,1,receipt.lot)
    const second=await page(2,1,receipt.lot)
    assert.equal(first.length,2)
    assert.equal(second.length,1)
    assert.equal(first[1].id,second[0].id)
    assert.equal(first[0].lotId,receipt.lot)
    assert.notEqual(first[0].id,second[0].id)
    assert.deepEqual(await page(1,1,"sem_coincidencia_"+receipt.run),[])
    const originalFixture={batch:document.batch}
    const divergent=xlsxFixture(originalFixture,sheet=>{ sheet.I2={t:"s",v:"Natureza sintética divergente"}; return sheet })
    await assert.rejects(upload(writer,divergent,parseXlsx(divergent)),{code:"23505"})
    const decide=(client,subject,issue)=>client.query(`SELECT ${pcdfSchema}.decide($1,$2,$3,'resolvida','12:34:56','Ensaio XLSX') AS data`,
      [subject,issue.id,issue.version])
    await assert.rejects(decide(writer,operator.subject,first[0]),{code:"42501"})
    const competing=await Promise.allSettled([decide(reviewer,admin.subject,first[0]),decide(concurrentReviewer,admin.subject,first[0])])
    assert.equal(competing.filter(result=>result.status==="fulfilled").length,1)
    assert.equal(competing.find(result=>result.status==="rejected").reason.code,"40001")
    await decide(reviewer,admin.subject,second[0])
    const resolved=await page(1,2,receipt.lot)
    assert(resolved.every(issue=>issue.original==="" && issue.history.author===admin.subject && issue.version==="2"))
    const promote=async run=>(await writer.query(`SELECT ${pcdfSchema}.workspace_promote($1,$2) AS data`,[operator.subject,run])).rows[0].data
    assert.equal((await promote(receipt.run)).occurrencesCreated,0)
    await approveSyntheticFixture(receipt.run,document)
    const promoted=await promote(receipt.run)
    assert.equal(promoted.occurrencesCreated,1)
    assert.equal(promoted.associationsCreated,2)

    const collision=xlsxFixture(syntheticPcdfFixture(),sheet=>{
      const number=Object.keys(document.batch.rows[0].raw).indexOf("numero_registro")
      const column=XLSX.utils.encode_col(number)
      for (const row of [2,3]) sheet[column+row]={t:"s",v:document.batch.rows[0].raw.numero_registro}
      return sheet
    })
    const collisionBatch=parseXlsx(collision)
    const conflict=await upload(writer,collision,collisionBatch)
    await approveSyntheticFixture(conflict.run,collisionBatch)
    assert.equal((await promote(conflict.run)).pending,2)

    const category=xlsxFixture(syntheticPcdfFixture(),sheet=>{
      for (const row of [2,3]) sheet["I"+row]={t:"s",v:"Natureza sem regra"}
      return sheet
    })
    const categoryBatch=parseXlsx(category)
    const unmatched=await upload(writer,category,categoryBatch)
    await approveSyntheticFixture(unmatched.run,categoryBatch)
    assert.equal((await promote(unmatched.run)).pending,2)

    const incomplete=xlsxFixture(syntheticPcdfFixture(),sheet=>{ sheet.C2={t:"s",v:""}; return sheet })
    const missing=await upload(writer,incomplete,parseXlsx(incomplete))
    const {rows:[{data:issues}]}=await viewer.query(`SELECT ARRAY(SELECT ${pcdfSchema}.review_page(
      'identificacao',NULL,NULL,$1,'antigas',1,25)) AS data`,[missing.lot])
    assert(issues.some(issue=>!issue.canResolve && issue.lotId===missing.lot))

    const {rows:[state]}=await pcdfMigrationSession(db=>db.query(`SELECT
      (SELECT count(*)::int FROM ${pcdfSchema}.xlsx_originals WHERE lot_id=$1 AND sha256=$2 AND content=$3) AS original,
      (SELECT count(*)::int FROM sentinela.lotes_importacao WHERE id=$4) AS rolled_back,
      (SELECT count(*)::int FROM sentinela.lotes_importacao WHERE sha256_arquivo=$5) AS divergent
    `,[receipt.lot,hash(original),original,abandoned.lot,parseXlsx(divergent).batch.sha256]))
    assert.deepEqual(state,{original:1,rolled_back:0,divergent:0})
    const proof={revision:completionRevision,sqlSha256:hash(sql),...data,lot:receipt.lot,
      run:receipt.run,collision:conflict.lot,unmapped:unmatched.lot,incomplete:missing.lot}
    try { await writeFile(proofPath,JSON.stringify(proof)+"\n",{flag:"wx"}) }
    catch (error) { if (error.code!=="EEXIST") throw error; await completionQualified() }
    return proof
  } finally { await Promise.all(clients.map(client=>client.end().catch(()=>{}))) }
}

if (import.meta.main) try {
  const [mode,stem]=process.argv.slice(2)
  assert(["--apply","--verify","--hash"].includes(mode))
  const sql=await completionSql()
  if (mode==="--hash") console.log(hash(sql))
  else {
    if (mode==="--apply") await apply(sql,stem)
    console.log(JSON.stringify(await verify(sql)))
  }
} catch(error) {
  console.error("Qualificação XLSX/Central interrompida:",error.code??error.name,
    error.stack?.split("\n").find(line=>line.includes("install-completion.mjs:")||line.includes("completion-sql.mjs:")))
  process.exitCode=1
}
