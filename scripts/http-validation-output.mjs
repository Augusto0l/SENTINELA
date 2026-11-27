import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { lstat, mkdir, open, readdir, readFile, realpath, rm, unlink, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { dirname, join, relative, resolve, sep } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"

export const projectRoot = fileURLToPath(new URL("../", import.meta.url)).replace(/[\\/]$/, "")
export const httpValidationId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const diagnosticPattern = /^(?:dev\/)?(?:trace(?:-build)?|logs\/[^/]+\.log|diagnostics\/[^/]+\.json)$/
const samePath = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b
const digest = data => createHash("sha256").update(data).digest("hex")
const nativeEnv = () => Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => !/^(?:PG|SENTINELA_)|SUPABASE|DATABASE|READER_URL/i.test(key)))

async function optionalStat(path) {
  try { return await lstat(path, { bigint: true }) }
  catch (error) { if (error.code !== "ENOENT") throw error }
}

export async function realDirectory(path) {
  const info = await lstat(path, { bigint: true })
  assert(info.isDirectory() && samePath(await realpath(path), path), `Diretório físico exigido: ${path}`)
  return info
}

async function assertOwned(path, original) {
  const current = await lstat(path, { bigint: true })
  assert(!current.isSymbolicLink() && current.dev === original.dev && current.ino === original.ino,
    `Identidade do artefato mudou: ${path}`)
}

export async function inspectHttpOutput(root) {
  await realDirectory(root)
  const files = [], links = [], diagnostics = []
  async function walk(path) {
    for (const name of await readdir(path)) {
      const file = join(path, name), key = relative(root, file).split(sep).join("/")
      const info = await lstat(file)
      if (info.isDirectory()) await walk(file)
      else if (info.isFile()) {
        files.push({ path: key, bytes: info.size })
        if (diagnosticPattern.test(key)) diagnostics.push(key)
      } else links.push(key)
    }
  }
  await walk(root)
  return { files, links, diagnostics: diagnostics.sort() }
}

export async function archiveHttpDiagnostics(source, destination, paths) {
  await realDirectory(source)
  await realDirectory(dirname(destination))
  await mkdir(destination, { mode: 0o700 })
  const diagnostics = []
  for (const path of paths) {
    assert(diagnosticPattern.test(path) && !path.split("/").some(part => part === ".." || part === "."))
    const file = join(source, path), target = join(destination, path)
    assert((await lstat(file)).isFile() && samePath(await realpath(file), file), `Diagnóstico fora do escopo: ${path}`)
    const data = await readFile(file), sha256 = digest(data)
    await mkdir(dirname(target), { recursive: true, mode: 0o700 })
    await realDirectory(dirname(target))
    await writeFile(target, data, { flag: "wx", mode: 0o600 })
    assert.equal(digest(await readFile(target)), sha256)
    assert.equal(digest(await readFile(file)), sha256)
    diagnostics.push({ path, bytes: data.length, sha256 })
  }
  await writeFile(join(destination, "manifest.json"), JSON.stringify({ diagnostics }, null, 2) + "\n", { flag: "wx", mode: 0o600 })
  return diagnostics
}

export async function freePort(port = 3317) {
  await new Promise((ok, bad) => {
    const server = createServer()
    server.once("error", bad)
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => server.close(ok))
  })
}

function native(command, args) {
  const result = spawnSync(command, args, { env: nativeEnv(), encoding: "utf8", timeout: 30000, windowsHide: true })
  assert.equal(result.status, 0, `Verificação indisponível: ${command}`)
  return result.stdout.trim()
}

function processes() {
  const output = native("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    String.raw`$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process | Where-Object CreationDate | ForEach-Object { @{pid=$_.ProcessId; parent=$_.ParentProcessId; path=$_.ExecutablePath; start=([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds(); next=($_.Name -eq 'node.exe' -and $_.CommandLine -match '(?i)(next-cli\.mjs|[\\/]next[\\/]dist[\\/]|next-server|\.next-http-validation-)')} }) | ConvertTo-Json -Compress`])
  return [].concat(JSON.parse(output))
}

export async function assertHttpValidationIdle() {
  assert.equal(process.platform, "win32", "A verificação de processos históricos é específica para Windows")
  assert(!processes().some(row => row.next), "Existe um processo Next.js ativo")
  await freePort(3316)
  await freePort()
}

function tree(rows, pid) {
  const pids = new Set([pid])
  // A process created before its alleged parent can belong to a reused PID.
  const parents = new Map(rows.map(row => [row.pid, row.start]))
  for (let count = 0; count < rows.length; count++) {
    const size = pids.size
    for (const row of rows) if (pids.has(row.parent) && row.start >= (parents.get(row.parent) ?? 0)) pids.add(row.pid)
    if (pids.size === size) break
  }
  return pids
}

// All four runners share next-env.d.ts, including runs on different ports.
export function httpValidation(id, { port = 3317, evidence, root = projectRoot, addStub = false } = {}) {
  assert(httpValidationId.test(id), "UUID de validação inválido")
  root = resolve(root)
  const local = relative(projectRoot, root)
  assert(resolve(projectRoot, local) === root && !local.split(sep).includes("..") && !local.includes(":"), "Raiz de validação fora do projeto")
  const tmp = join(root, "tmp"), types = join(root, "next-env.d.ts")
  const distName = `.next-http-validation-${id}`, dist = join(root, distName)
  const lockPath = join(tmp, "http-validation.lock")
  const owned = new Map()
  let lock, lockInfo, previousTypes, snapshot = false, child, identity, exit, listener, spawnedAt

  async function create(path, text) {
    const file = await open(path, "wx", 0o600)
    try { owned.set(path, await file.stat({ bigint: true })); await file.writeFile(text) }
    finally { await file.close() }
  }

  async function prepare() {
    await realDirectory(root)
    await mkdir(tmp).catch(error => { if (error.code !== "EEXIST") throw error })
    await realDirectory(tmp)
    lock = await open(lockPath, "wx", 0o600)
    lockInfo = await lock.stat({ bigint: true })
    const info = await optionalStat(types)
    if (info) assert(info.isFile() && info.nlink === 1n, "next-env.d.ts precisa ser um arquivo regular sem links")
    previousTypes = info ? await readFile(types) : undefined
    snapshot = true
    await lock.writeFile(JSON.stringify({ id, pid: process.pid, previousTypes: previousTypes?.toString("base64") ?? null }))
    await mkdir(dist)
    owned.set(dist, await realDirectory(dist))
    const include = ["../src/**/*.ts", "../src/**/*.tsx", `../${distName}/dev/types/**/*.ts`, `../${distName}/types/**/*.ts`]
    if (addStub) {
      const stub = `next-env-http-${id}.d.ts`
      await create(join(tmp, stub), '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n')
      include.push(`./${stub}`)
    }
    await create(join(tmp, `tsconfig-http-${id}.json`), JSON.stringify({ extends: "../tsconfig.json", compilerOptions: { incremental: false }, include }))
  }

  function start(env, stdio, { detached = false } = {}) {
    assert(lock && owned.has(dist) && !child && env.SENTINELA_HTTP_VALIDATION_ID === id)
    spawnedAt = Date.now()
    child = spawn(process.execPath, ["scripts/next-cli.mjs", "dev", "--hostname", "127.0.0.1", "--port", String(port)],
      { cwd: root, env, stdio, detached, windowsHide: true })
    exit = new Promise(ok => { child.once("exit", ok); child.once("error", ok) })
    return child
  }

  function proveListener() {
    const rows = processes()
    identity = rows.find(row => row.pid === child?.pid)
    assert(identity && identity.start >= spawnedAt - 2000 && samePath(identity.path ?? "", process.execPath), "Processo Next.js não reconhecido")
    const listeners = native("netstat.exe", ["-ano", "-p", "tcp"]).split(/\r?\n/)
      .map(line => line.trim().split(/\s+/)).filter(row => row[0] === "TCP" && row[1].endsWith(`:${port}`) && row[3] === "LISTENING")
    assert(listeners.length === 1 && listeners[0][1] === `127.0.0.1:${port}`, "Listener HTTP fora de loopback")
    const pid = Number(listeners[0][4])
    assert(tree(rows, child.pid).has(pid), "Listener fora da árvore do ensaio")
    listener = rows.find(row => row.pid === pid)
    assert(listener)
    return listener
  }

  let stopping
  async function stop() {
    if (!child) return
    if (stopping) return stopping
    stopping = (async () => {
      const rows = processes(), pid = child.pid
      const ownedPids = pid ? tree(rows, pid) : new Set()
      if (listener) ownedPids.add(listener.pid)
      if (pid && child.exitCode === null && child.signalCode === null) {
        const current = rows.find(row => row.pid === pid)
        if (current) {
          assert(current.start >= spawnedAt - 2000 && samePath(current.path ?? "", process.execPath), "Processo Next.js não reconhecido")
          if (identity) assert.deepEqual(current, identity)
          const result = spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"],
            { env: nativeEnv(), timeout: 15000, windowsHide: true, stdio: "ignore" })
          assert(!result.error, "Parada do Next.js indisponível")
        }
      }
      await Promise.race([exit, delay(10000, undefined, { ref: false }).then(() => { throw Error("Saída do Next.js não confirmada") })])
      const deadline = Date.now() + 10000
      for (;;) {
        const remaining = processes()
        if (!remaining.some(row => ownedPids.has(row.pid)) && (!pid || tree(remaining, pid).size === 1)) {
          try { await freePort(port); break }
          catch (error) { if (error.code !== "EADDRINUSE") throw error }
        }
        if (Date.now() >= deadline) throw Error("Processos ou porta do Next.js ainda presentes")
        await delay(250)
      }
      child = identity = listener = exit = undefined
    })()
    try { await stopping }
    finally { stopping = undefined }
  }

  async function restoreTypes() {
    if (!snapshot) return
    const info = await optionalStat(types)
    if (!info) {
      if (previousTypes) await writeFile(types, previousTypes, { flag: "wx" })
      return
    }
    assert(info.isFile() && info.nlink === 1n, "next-env.d.ts precisa ser um arquivo regular sem links")
    const current = await readFile(types, "utf8")
    if (!current.includes(`${distName}/`)) return
    assert(current.includes("NOTE: This file should not be edited"), "next-env.d.ts contém referência de teste e precisa de revisão")
    await assertOwned(types, info)
    if (previousTypes) await writeFile(types, previousTypes)
    else await unlink(types)
  }

  async function finish() {
    if (!lock) return
    let safeToRelease = false
    try {
      await stop()
      await realDirectory(tmp)
      await assertOwned(lockPath, lockInfo)
      await restoreTypes()
      safeToRelease = true
      for (const [path, info] of owned) await assertOwned(path, info)
      const output = owned.has(dist) ? await inspectHttpOutput(dist) : undefined
      if (output?.diagnostics.length) {
        const archive = evidence ? resolve(root, evidence) : join(root, ".cache", "http-validation-diagnostics")
        if (!evidence) {
          await mkdir(dirname(archive)).catch(error => { if (error.code !== "EEXIST") throw error })
          await realDirectory(dirname(archive))
          await mkdir(archive).catch(error => { if (error.code !== "EEXIST") throw error })
        }
        await archiveHttpDiagnostics(dist, join(archive, `http-diagnostics-${id}`), output.diagnostics)
      }
      assert(!output?.links.length, "Saída contém links ou arquivos especiais e foi preservada")
      if (output) {
        const entries = await readdir(dist)
        assert(entries.every(name => name === "dev") || (entries.includes("BUILD_ID") && entries.includes("build-manifest.json")),
          "Layout inesperado na saída do Next.js")
      }
      for (const [path, info] of owned) {
        await assertOwned(path, info)
        if (path === dist) await rm(path, { recursive: true, maxRetries: 3, retryDelay: 150 })
        else await unlink(path)
      }
    } finally {
      await lock.close()
      lock = undefined
      if (safeToRelease) { await assertOwned(lockPath, lockInfo); await unlink(lockPath) }
    }
  }

  return { prepare, start, proveListener, stop, finish, waitForExit: () => exit, isStopped: () => !child }
}
