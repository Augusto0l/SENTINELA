import assert from "node:assert/strict"
import { createHash, randomBytes } from "node:crypto"
import { spawnSync } from "node:child_process"
import { readFile, realpath, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { attestMigration, connect, directory, readerPasswords } from "./install.mjs"
import { qualifiedWriterPasswords } from "./install-crud.mjs"
import { pcdfLedger, pcdfRevision, pcdfSchema, pcdfSql } from "./pcdf-sql.mjs"
import { persistentReaders, persistentWriters } from "../../../src/lib/db/config.ts"

const hash=input=>createHash("sha256").update(input).digest("hex")
const proofPath=join(directory,"pcdf-sql-qualified.json")

export async function assertQualifiedPcdf() {
  assert.equal(await realpath(proofPath),proofPath)
  const proof=JSON.parse(await readFile(proofPath,"utf8"))
  assert.equal(proof.revision,pcdfRevision)
  assert.equal(proof.sqlSha256,hash(await pcdfSql()))
  return proof
}

export function syntheticPcdfFixture(rows = 2) {
  assert([2,10000].includes(rows))
  const index=randomBytes(4).readUInt32BE()*2+20000
  const result=spawnSync("python",["-E","-B","-c",`
import json,sys,base64
sys.path.insert(0,"database/local/pcdf-sandbox")
from qualify import fixture
from workspace import prepare_synthetic
raw=fixture(range(${index},${index+rows}),"2026-01",horario="",latitude="",longitude="",
            natureza_original="Natureza de ensaio A",natureza_padronizada_pcdf="Categoria de ensaio",
            overrides={${index+1}:{"natureza_original":"Natureza de ensaio B"}})
sys.stdout.buffer.write(json.dumps({"csv":base64.b64encode(raw).decode(),
    **prepare_synthetic(raw,"2026-01")},ensure_ascii=False).encode("utf8"))
`],{timeout:60000,maxBuffer:128*1024*1024,encoding:"utf8",windowsHide:true})
  assert.equal(result.status,0,"Parser sintético indisponível")
  const resultData=JSON.parse(result.stdout)
  return {...resultData,csv:Buffer.from(resultData.csv,"base64")}
}

export async function pcdfMigrationSession(run) {
  const path=join(directory,"migration.secret")
  assert.equal(await realpath(path),path)
  const client=connect("sprint4_migration",await readFile(path,"utf8"))
  try { await client.connect(); await attestMigration(client); return await run(client) }
  finally { await client.end() }
}

export async function approveSyntheticFixture(run,fixture) {
  const candidate=fixture.batch.rows[0].derived.candidate
  assert.deepEqual(candidate,fixture.batch.rows[1].derived.candidate)
  return pcdfMigrationSession(async db=>{
    const result=await db.query(`INSERT INTO ${pcdfSchema}.approved_groups
      SELECT e.id,$2::jsonb,'pcdf-sandbox-v1','Aprovacao unicamente para fixture sintetica gerada pelo ensaio'
      FROM sentinela.execucoes_importacao e
      JOIN sentinela.lotes_importacao l ON l.id=e.lote_id
      JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id
      WHERE e.id=$1 AND l.sha256_arquivo=$3 AND x.fonte='PCDF-SANDBOX' AND x.sha256_xml=$4
        AND (SELECT count(*) FROM sentinela.linhas_staging s WHERE s.execucao_id=e.id
               AND s.derivados_efetivos->'candidate'=$2::jsonb)=2
      RETURNING run_id`,[run,JSON.stringify(candidate),fixture.batch.sha256,fixture.xmlSha])
    assert.equal(result.rowCount,1)
  })
}

async function apply(sql,backupStem) {
  assert(/^funcional-[a-f0-9]{16}$/.test(backupStem??""))
  const receipt=JSON.parse(await readFile(join(directory,backupStem+".json"),"utf8"))
  assert.equal(receipt.backup,backupStem+".dump")
  assert.equal(receipt.tables.length,27)
  assert.equal(receipt.sha256,hash(await readFile(join(directory,receipt.backup))))
  await qualifiedWriterPasswords()
  await pcdfMigrationSession(async db=>{
    await db.query("BEGIN")
    try {
      await db.query("SET LOCAL search_path=pg_catalog;SET LOCAL lock_timeout='5s';SELECT pg_advisory_xact_lock(743204,41)")
      await db.query(sql)
      await db.query("COMMIT")
    } catch(error) { await db.query("ROLLBACK"); throw error }
  })
}

async function verify(sql) {
  const passwords=await qualifiedWriterPasswords()
  const readers=await readerPasswords()
  const operator=persistentWriters.Operador, admin=persistentWriters.Administrador
  const accounts=[connect(operator.login,passwords[operator.login]),connect(admin.login,passwords[admin.login]),
    connect(persistentReaders.Analista,readers[persistentReaders.Analista])]
  const [writer,reviewer,analyst]=accounts
  const fixture=syntheticPcdfFixture()
  let upload
  const decisionIds=[]
  try {
    for(const client of accounts) await client.connect()
    await assert.rejects(writer.query(`SELECT ${pcdfSchema}.stage(NULL,NULL,NULL)`),{code:"42501"})
    await assert.rejects(analyst.query(`SELECT ${pcdfSchema}.upload(NULL,NULL,NULL,NULL,NULL)`),{code:"42501"})
    await assert.rejects(writer.query(`SELECT content FROM ${pcdfSchema}.uploads`),{code:"42501"})
    const send=async (xml=fixture.xmlSha)=>(await writer.query(`SELECT ${pcdfSchema}.upload($1,$2,$3,$4,$5) AS d`,
      [operator.subject,fixture.batch,fixture.csv,xml,fixture.xmlSize])).rows[0].d
    await assert.rejects(send("0".repeat(64)),{code:"22023"})
    upload=await send()
    assert.equal(upload.replay,false)
    assert.deepEqual(await send(),{replay:true,run:upload.run,lot:upload.lot})
    const {rows:issues}=await analyst.query(`SELECT x FROM ${pcdfSchema}.workspace_review('datas_horarios',NULL,'aberta',NULL) x`)
    // Identify only the issues belonging to this newly staged synthetic run.
    const {rows:expected}=await pcdfMigrationSession(db=>db.query(`SELECT p.id FROM sentinela.pendencias_revisao p
      JOIN sentinela.linhas_staging s ON s.linha_origem_id=p.linha_origem_id
      WHERE s.execucao_id=$1 AND p.regra='horario_ausente_ou_invalido' ORDER BY p.id`,[upload.run]))
    assert.equal(expected.length,2)
    const decide=(client,subject,issue,value)=>client.query(`SELECT ${pcdfSchema}.decide($1,$2,1,'resolvida',$3,'Correcao sintetica confirmada') AS d`,
      [subject,issue,value])
    await assert.rejects(decide(writer,operator.subject,expected[0].id,"12:34:56"),{code:"42501"})
    await assert.rejects(decide(reviewer,admin.subject,expected[0].id,"24:00:00"),{code:"22023"})
    for(const {id} of expected) {
      assert(issues.some(row=>row.x.id===id && row.x.original===""))
      const {rows:[{d}]}=await decide(reviewer,admin.subject,id,"12:34:56")
      assert.equal(d.history.author,admin.subject); assert.equal(d.normalized,"12:34:56")
      assert.equal(d.original,"")
      decisionIds.push(id)
    }
    const promote=async ()=>(await writer.query(`SELECT ${pcdfSchema}.workspace_promote($1,$2) AS d`,[operator.subject,upload.run])).rows[0].d
    assert.equal((await promote()).occurrencesCreated,0)
    await approveSyntheticFixture(upload.run,fixture)
    await writer.query("BEGIN")
    assert.equal((await promote()).associationsCreated,2)
    await writer.query("ROLLBACK")
    assert.deepEqual(await promote(),{run:upload.run,rows:2,consolidated:2,pending:0,occurrencesCreated:1,associationsCreated:2})
    assert.deepEqual(await promote(),{run:upload.run,rows:2,consolidated:2,pending:0,occurrencesCreated:0,associationsCreated:0})
  } finally { await Promise.all(accounts.map(client=>client.end().catch(()=>{}))) }
  const state=await pcdfMigrationSession(async db=>{
    const {rows}=await db.query("SELECT versao FROM sentinela.schema_migrations ORDER BY versao")
    assert.deepEqual(rows.map(row=>row.versao),pcdfLedger)
    const {rows:[row]}=await db.query(`SELECT count(DISTINCT o.id)::int AS occurrences,count(a.id)::int AS associations,
      bool_and(o.geometria IS NULL AND o.ra_id IS NULL AND o.latitude IS NULL AND o.longitude IS NULL) AS no_point,
      min(o.id::text) AS id
      FROM sentinela.ocorrencias o JOIN sentinela.ocorrencia_naturezas a ON a.ocorrencia_id=o.id
      JOIN sentinela.linhas_staging s ON s.linha_origem_id=a.linha_origem_id WHERE s.execucao_id=$1`,[upload.run])
    assert.equal(row.occurrences,1); assert.equal(row.associations,2); assert.equal(row.no_point,true)
    return row
  })
  const proof={revision:pcdfRevision,sqlSha256:hash(sql),run:upload.run,lot:upload.lot,decisionIds,...state}
  try { await writeFile(proofPath,JSON.stringify(proof)+"\n",{flag:"wx"}) }
  catch(error) { if(error.code!=="EEXIST") throw error; await assertQualifiedPcdf() }
  return proof
}

async function bulkRollback() {
  await assertQualifiedPcdf()
  const operator=persistentWriters.Operador
  const passwords=await qualifiedWriterPasswords()
  const fixture=syntheticPcdfFixture(10000)
  const client=connect(operator.login,passwords[operator.login])
  const started=Date.now()
  try {
    await client.connect()
    await client.query("BEGIN")
    await client.query("SET LOCAL statement_timeout='90s'")
    const {rows:[{data}]}=await client.query({text:`SELECT ${pcdfSchema}.upload($1,$2,$3,$4,$5) AS data`,
      values:[operator.subject,fixture.batch,fixture.csv,fixture.xmlSha,fixture.xmlSize],query_timeout:100000})
    assert.equal(data.records,10000)
    assert.equal(data.candidates,5000)
    assert.equal(data.replay,false)
    await client.query("ROLLBACK")
    const { rows:[{count}] }=await pcdfMigrationSession(db=>db.query(
      "SELECT count(*)::int AS count FROM sentinela.lotes_importacao WHERE sha256_arquivo=$1",[fixture.batch.sha256]))
    assert.equal(count,0)
    return { rows:10000,csvBytes:fixture.csv.length,durationMs:Date.now()-started,rollback:true }
  } finally { await client.end() }
}

if (import.meta.main) try {
  const [mode,backup]=process.argv.slice(2)
  assert(["--apply","--verify","--hash","--bulk-rollback"].includes(mode))
  const sql=await pcdfSql()
  if(mode==="--hash") console.log(hash(sql))
  else if(mode==="--bulk-rollback") console.log(JSON.stringify(await bulkRollback()))
  else {
    if(mode==="--apply") await apply(sql,backup)
    console.log(JSON.stringify(await verify(sql)))
  }
} catch(error) {
  console.error("Qualificação PCDF SQL interrompida:",error.code??error.name,
    error.stack?.split("\n").find(line=>line.includes("install-pcdf.mjs:")||line.includes("pcdf-sql.mjs:")))
  process.exitCode=1
}
