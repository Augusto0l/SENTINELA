import assert from "node:assert/strict"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { readFile, realpath, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { attestMigration, connect, directory, readerPasswords } from "./install.mjs"
import { crudSql, manualSource, previousLedger, revision, writers } from "./crud-sql.mjs"
import { persistentReaders } from "../../../src/lib/db/config.ts"

const schema = "sentinela_homolog_crud"
const credentialsPath = join(directory, "writer-credentials.json")
const proofPath = join(directory, "crud-sql-qualified.json")
const backupHash = "b57d6bce6a9ae74aba91c7e7dba768b5a09b60d102b4576d749cbe0d2e77c1a7"
const hash = bytes => createHash("sha256").update(bytes).digest("hex")
const finalLedger = [...previousLedger, revision, "homolog-persist-0004"]

export async function writerPasswords(create = false) {
  assert.equal(await realpath(directory), directory)
  const names = Object.values(writers).map(x => x.login)
  if (create) try {
    await writeFile(credentialsPath, JSON.stringify(Object.fromEntries(names.map(x => [x, randomBytes(32).toString("hex")]))),
      { flag: "wx", mode: 0o600 })
  } catch (error) { if (error.code !== "EEXIST") throw error }
  assert.equal(await realpath(credentialsPath), credentialsPath)
  const passwords = JSON.parse(await readFile(credentialsPath, "utf8"))
  assert(Object.keys(passwords).length===2 && names.every(x => /^[a-f0-9]{64}$/.test(passwords[x]))
    && new Set(Object.values(passwords)).size===2)
  return passwords
}

export async function qualifiedWriterPasswords() {
  assert.equal(await realpath(proofPath), proofPath)
  const proof = JSON.parse(await readFile(proofPath, "utf8"))
  assert.equal(proof.revision, revision)
  assert.equal(proof.sqlSha256, hash(await crudSql()))
  return writerPasswords()
}

async function migrationSession(run) {
  const secret = join(directory, "migration.secret")
  assert.equal(await realpath(secret), secret)
  const client = connect("sprint4_migration", await readFile(secret, "utf8"))
  try {
    await client.connect()
    await attestMigration(client)
    return await run(client)
  } finally { await client.end() }
}

async function apply(sql) {
  assert.equal(hash(await readFile(join(directory, "pre-funcional-04acd52f41ee.dump"))), backupHash)
  await migrationSession(async client => {
    await client.query("BEGIN")
    try {
      await client.query("SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='5s'; SELECT pg_advisory_xact_lock(743204,41)")
      const {rows} = await client.query("SELECT versao FROM sentinela.schema_migrations ORDER BY versao")
      if (rows.at(-1)?.versao !== revision) {
        await client.query(sql)
        await client.query("SET LOCAL password_encryption='scram-sha-256'")
        for (const [login,password] of Object.entries(await writerPasswords(true))) {
          // Both tokens are pinned or strictly validated; do not log SQL arguments.
          await client.query(`ALTER ROLE ${login} PASSWORD '${password}'`)
        }
      }
      await client.query(await readFile(new URL("0004_crud_spatial_reference.sql", import.meta.url),"utf8"))
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    }
  })
}

export async function resolveFixture(client) {
  const { rows: [region] } = await client.query(`SELECT r.id,extensions.ST_X(p.point) AS longitude,extensions.ST_Y(p.point) AS latitude
    FROM sentinela.regioes_administrativas r CROSS JOIN LATERAL (SELECT extensions.ST_PointOnSurface(r.limite) AS point) p
    WHERE r.codigo_interno='RA-I' AND (SELECT count(*) FROM sentinela.regioes_administrativas s WHERE extensions.ST_Covers(s.limite,p.point))=1`)
  assert(region, "Ponto sintético sem referência territorial inequívoca")
  return { data: "2026-11-17", horario: "12:00:00", local: "Local sintético de verificação", raId: region.id,
    coordenadas: { longitude: region.longitude, latitude: region.latitude },
    naturezas: [1,2].map(i => ({ naturezaId: "31000000-0000-4000-8000-00000000000" + i, crimeTentado: null })) }
}

async function verify(sql) {
  const fixture = await migrationSession(async client => {
    const { rows } = await client.query("SELECT versao FROM sentinela.schema_migrations ORDER BY versao")
    assert.deepEqual(rows.map(r => r.versao), finalLedger)
    const { rows: [state] } = await client.query(`SELECT
      (SELECT count(*)::int FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r'
         AND relrowsecurity AND relforcerowsecurity) AS baseline_rls,
      (SELECT count(*)::int FROM pg_class WHERE relnamespace='${schema}'::regnamespace AND relkind='r'
         AND relrowsecurity AND relforcerowsecurity) AS crud_rls,
      (SELECT count(*)::int FROM pg_authid WHERE rolname=ANY($1) AND rolpassword LIKE 'SCRAM-SHA-256$%') AS scram`, [Object.values(writers).map(x => x.login)])
    assert.deepEqual(state, { baseline_rls: 19, crud_rls: 8, scram: 2 })
    return resolveFixture(client)
  })
  const passwords = await writerPasswords()
  const ids = []
  for (const {login,subject} of Object.values(writers)) {
    const client = connect(login,passwords[login])
    try {
      await client.connect()
      for (const statement of [
        "UPDATE sentinela.ocorrencias SET ativo=false WHERE false",
        "UPDATE sentinela.pendencias_revisao SET status='resolvida' WHERE false",
        "SELECT * FROM sentinela.eventos_auditoria",
        `SELECT ${schema}.cadastrar(NULL,NULL)`,
        `SELECT ${schema}.mutate(NULL,NULL,NULL)`,
        `SELECT ${schema}.record_version(NULL,NULL,NULL,NULL,NULL,NULL,NULL)`,
      ]) await assert.rejects(client.query(statement), {code:"42501"})
      const command = async (key,mode,id,body,address = "Via sintética 1",district = "Setor de ensaio") =>
        (await client.query(`SELECT ${schema}.command($1,$2,$3,$4,$5,$6,$7) AS data`,
          [subject,key,mode,id,JSON.stringify(body),address,district])).rows[0].data
      await assert.rejects(client.query(`SELECT ${schema}.command($1,$2,'create',NULL,'{}','Via','Setor')`,
        [randomUUID(),randomUUID()]), {code:"42501"})
      await assert.rejects(command(randomUUID(),"create",null,{...fixture,
        naturezas:[{ naturezaId: randomUUID(), crimeTentado:null }]}), {code:"23503"})
      await assert.rejects(command(randomUUID(),"create",null,{...fixture, coordenadas:{longitude:0,latitude:0}}), {code:"22023"})
      const createKey = randomUUID()
      const created = await command(createKey,"create",null,fixture)
      assert.deepEqual(await command(createKey,"create",null,fixture),created)
      await assert.rejects(command(createKey,"create",null,fixture,"Via diferente"),{code:"23505"})
      const patch = {versaoEsperada:"1",justificativa:"Revisão sintética",alteracoes:{local:"Local sintético revisado",
        endereco:"Via sintética 2",bairroOuSetor:"Setor de ensaio",naturezas:[fixture.naturezas[0]]}}
      const editKey = randomUUID()
      const edited = await command(editKey,"edit",created.id,patch,"Via sintética 2")
      assert.equal(edited.versao,"2")
      assert.deepEqual(await command(editKey,"edit",created.id,patch,"Via sintética 2"),edited)
      await assert.rejects(command(randomUUID(),"edit",created.id,patch,"Via sintética 2"),{code:"40001"})
      const inactiveKey = randomUUID()
      const inactivation = {versaoEsperada:"2",motivo:"Encerramento do cenário de ensaio"}
      const inactive = await command(inactiveKey,"inactivate",created.id,inactivation,null,null)
      assert.equal(inactive.ativo,false)
      assert.equal(inactive.versao,"3")
      assert.deepEqual(await command(inactiveKey,"inactivate",created.id,inactivation,null,null),inactive)
      ids.push(created.id)
    } finally { await client.end() }
  }
  const passwordsRead = await readerPasswords()
  const analyst = connect(persistentReaders.Analista,passwordsRead[persistentReaders.Analista])
  try {
    await analyst.connect()
    await assert.rejects(analyst.query(`SELECT ${schema}.command(NULL,NULL,NULL,NULL,NULL,NULL,NULL)`), {code:"42501"})
  } finally { await analyst.end() }
  await migrationSession(async client => {
    const {rows} = await client.query(`SELECT o.id,o.versao,o.ativo,
      (SELECT count(*)::int FROM ${schema}.occurrence_versions v WHERE v.occurrence_id=o.id) AS versions,
      (SELECT count(*)::int FROM ${schema}.mutation_history h WHERE h.occurrence_id=o.id) AS history,
      (SELECT count(*)::int FROM sentinela.eventos_auditoria e WHERE e.ocorrencia_id=o.id) AS audit,
      (SELECT count(*)::int FROM ${schema}.retirements r WHERE r.occurrence_id=o.id) AS retired
      FROM sentinela.ocorrencias o WHERE id=ANY($1) AND fonte=$2`, [ids,manualSource])
    assert.equal(rows.length,2)
    for (const {id,...row} of rows) {
      assert(ids.includes(id))
      assert.deepEqual(row,{versao:"3",ativo:false,versions:3,history:2,audit:1,retired:1})
    }
  })
  const proof = {revision,sqlSha256:hash(sql),ids,checks:["sql-rbac","author","rollback","geometry","all-command-replays","versions","audit","retirements"]}
  try { await writeFile(proofPath,JSON.stringify(proof)+"\n",{flag:"wx"}) }
  catch (error) { if (error.code !== "EEXIST") throw error; await qualifiedWriterPasswords() }
  return proof
}

if (import.meta.main) try {
  assert(process.argv.length===3 && ["--apply","--verify","--hash"].includes(process.argv[2]))
  const sql = await crudSql()
  if (process.argv[2]==="--hash") console.log(hash(sql))
  else {
    if (process.argv[2]==="--apply") await apply(sql)
    console.log(JSON.stringify(await verify(sql)))
  }
} catch (error) {
  console.error("CRUD SQL interrompido:",error.code ?? error.name,
    error.stack?.split("\n").find(line => line.includes("install-crud.mjs:") || line.includes("crud-sql.mjs:")))
  if (error.code !== "ERR_ASSERTION" && /^[0-9A-Z]{5}$/.test(error.code ?? "")) {
    console.error("Diagnóstico SQL:",error.message?.replace(/'[^']*'/g,"'[omitido]'"))
  }
  process.exitCode=1
}
