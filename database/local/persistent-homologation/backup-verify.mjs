import assert from "node:assert/strict"
import { createHash, randomBytes } from "node:crypto"
import { spawnSync } from "node:child_process"
import { readFile, realpath, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { attestMigration, connect, directory } from "./install.mjs"
import { persistentDestination } from "../../../src/lib/db/config.ts"

async function fingerprint(client) {
  await client.query("SET LOCAL TIME ZONE 'UTC'; SET LOCAL DateStyle TO 'ISO, YMD'")
  const {rows: tables} = await client.query(`SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,
    (SELECT count(*)::int FROM pg_constraint a WHERE a.conrelid=c.oid) constraints,
    (SELECT count(*)::int FROM pg_trigger a WHERE a.tgrelid=c.oid AND NOT a.tgisinternal) triggers,
    (SELECT count(*)::int FROM pg_policy a WHERE a.polrelid=c.oid) policies
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='r' AND n.nspname IN ('sentinela','sentinela_homolog_crud','sentinela_homolog_pcdf')
    ORDER BY n.nspname,c.relname`)
  assert([27,30,31].includes(tables.length))
  const values = []
  for (const table of tables) {
    for (const name of [table.nspname,table.relname]) assert(/^[a-z_]+$/.test(name))
    const {rows: [data]} = await client.query(`SELECT count(*)::int AS count,
      encode(sha256(convert_to(coalesce(string_agg(j,'' ORDER BY j COLLATE "C"),''),'UTF8')),'hex') AS hash
      FROM (SELECT to_jsonb(t)::text AS j FROM ${table.nspname}.${table.relname} t) entries`)
    values.push({...table,...data})
  }
  return values
}

async function backupRestore() {
  assert.equal(await realpath(directory),directory)
  const secretPath=join(directory,"migration.secret")
  assert.equal(await realpath(secretPath),secretPath)
  const password=await readFile(secretPath,"utf8")
  const source=connect("sprint4_migration",password)
  const suffix=randomBytes(8).toString("hex")
  const restoreDb="sentinela_sprint4_restore_"+suffix
  const backup=join(directory,`funcional-${suffix}.dump`)
  const pgEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.toUpperCase().startsWith("PG")))
  const conn=["-h",persistentDestination.host,"-p",String(persistentDestination.port),"-U","sprint4_migration"]
  const native=(tool,args)=>{
    const result=spawnSync(`C:/Program Files/PostgreSQL/17/bin/${tool}.exe`,args,{
      env:{...pgEnv,PGPASSWORD:password,PGSSLMODE:"disable"},windowsHide:true,stdio:"ignore",timeout:120000,
    })
    assert.equal(result.status,0,`${tool}: operação interrompida`)
  }
  let sourceFingerprint
  try {
    await source.connect()
    await attestMigration(source)
    await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const {rows:[{snapshot}]}=await source.query("SELECT pg_export_snapshot() AS snapshot")
    assert(/^[0-9A-F-]+$/.test(snapshot))
    // Reserve a new path exclusively; an earlier backup can never be overwritten.
    await writeFile(backup,"",{flag:"wx",mode:0o600})
    native("pg_dump",[...conn,"--format=custom","--snapshot",snapshot,"-f",backup,persistentDestination.database])
    sourceFingerprint=await fingerprint(source)
    await source.query("COMMIT")
    // Create the destination with connections disabled until its ACL is closed.
    await source.query(`CREATE DATABASE ${restoreDb} ALLOW_CONNECTIONS false`)
    await source.query(`REVOKE ALL ON DATABASE ${restoreDb} FROM PUBLIC`)
    await source.query(`ALTER DATABASE ${restoreDb} ALLOW_CONNECTIONS true`)
  } finally { await source.end() }
  native("pg_restore",[...conn,"--single-transaction","--exit-on-error","-d",restoreDb,backup])
  const restored=connect("sprint4_migration",password,restoreDb)
  try {
    await restored.connect()
    await restored.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const {rows:[identity]}=await restored.query(`SELECT current_database() AS db,inet_server_port() AS port,
      host(inet_server_addr()) AS host,system_identifier::text AS system FROM pg_control_system()`)
    assert.deepEqual(identity,{db:restoreDb,port:persistentDestination.port,host:persistentDestination.host,
      system:persistentDestination.system})
    assert.deepEqual(await fingerprint(restored),sourceFingerprint)
    await restored.query("COMMIT")
  } finally { await restored.end() }
  const sha256=createHash("sha256").update(await readFile(backup)).digest("hex")
  const result={backup:`funcional-${suffix}.dump`,restoreDb,sha256,tables:sourceFingerprint}
  await writeFile(join(directory,`funcional-${suffix}.json`),JSON.stringify(result)+"\n",{flag:"wx"})
  return {backup:result.backup,restoreDb,sha256,tables:sourceFingerprint.length}
}

try {
  assert.deepEqual(process.argv.slice(2),["--backup-restore"])
  console.log(JSON.stringify(await backupRestore()))
} catch (error) {
  console.error("Backup/restauração interrompido:",error.code??error.name,
    error.stack?.split("\n").find(line=>line.includes("backup-verify.mjs:")))
  process.exitCode=1
}
