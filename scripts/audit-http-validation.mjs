// Inventories and archives historical Next.js diagnostics. This command has no removal mode.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { lstat, mkdir, open, readdir, readFile, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { archiveHttpDiagnostics, assertHttpValidationIdle, httpValidationId, inspectHttpOutput, projectRoot, realDirectory } from "./http-validation-output.mjs"

assert.deepEqual(process.argv.slice(2), ["--archive"], "Use --archive para inventariar e copiar os diagnósticos")
const prefix = ".next-http-validation-"
const tmp = join(projectRoot, "tmp")
const lockPath = join(tmp, "http-validation.lock")
await realDirectory(projectRoot)
await realDirectory(tmp)
const lock = await open(lockPath, "wx", 0o600)
try {
  await lock.writeFile(JSON.stringify({ operation: "historical-audit", pid: process.pid }))
  await assertHttpValidationIdle()
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: projectRoot, encoding: "utf8" }).split("\0")
  const nextTypes = join(projectRoot, "next-env.d.ts")
  const types = await readFile(nextTypes, "utf8").catch(error => { if (error.code !== "ENOENT") throw error })
  const cache = join(projectRoot, ".cache")
  const historical = join(cache, "http-validation-historical")
  await realDirectory(cache)
  await mkdir(historical).catch(error => { if (error.code !== "EEXIST") throw error })
  await realDirectory(historical)
  const archive = join(historical, randomUUID())
  await mkdir(archive, { mode: 0o700 })

  const runs = []
  for (const name of (await readdir(projectRoot)).filter(name => name.startsWith(prefix)).sort()) {
    const dir = join(projectRoot, name), id = name.slice(prefix.length)
    if (!httpValidationId.test(id) || !(await lstat(dir)).isDirectory()) {
      runs.push({ name, eligible: false, reasons: ["Identidade ou diretório físico inválido"] })
      continue
    }
    const { files, links, diagnostics: paths } = await inspectHttpOutput(dir)
    const diagnostics = await archiveHttpDiagnostics(dir, join(archive, id), paths)
    const reasons = []
    if (links.length) reasons.push("Links ou entradas especiais")
    if (types?.includes(`${name}/`) || types?.includes(`${name}\\`)) reasons.push("Referência no next-env.d.ts")
    if (tracked.some(path => path === name || path.startsWith(`${name}/`))) reasons.push("Arquivo rastreado pelo Git")
    if (!files.some(file => /^(?:dev\/)?(?:build-manifest\.json|package\.json)$/.test(file.path))) reasons.push("Estrutura Next.js não reconhecida")
    const unexpected = files.filter(file => /\.(?:dump|backup|bak|sql|csv|xlsx|xml|zip|mp4|webm|pdf)$/i.test(file.path))
    if (unexpected.length) reasons.push("Arquivo fora do conjunto esperado de build")
    const auxiliary = []
    for (const path of [`tmp/tsconfig-http-${id}.json`, `tmp/next-env-http-${id}.d.ts`]) {
      const info = await lstat(join(projectRoot, path)).catch(error => { if (error.code !== "ENOENT") throw error })
      if (info?.isFile() && !tracked.includes(path)) auxiliary.push(path)
      else if (info) reasons.push("Auxiliar fora do escopo de remoção")
    }
    runs.push({ name, bytes: files.reduce((total, file) => total + file.bytes, 0), files: files.length,
      links, auxiliary, diagnostics, eligible: reasons.length === 0, reasons })
  }
  await assertHttpValidationIdle()
  const eligible = runs.filter(run => run.eligible)
  const totals = { directories: runs.length, eligible: eligible.length,
    eligibleBytes: eligible.reduce((total, run) => total + run.bytes, 0),
    inventoriedBytes: runs.reduce((total, run) => total + (run.bytes ?? 0), 0),
    diagnostics: runs.reduce((total, run) => total + (run.diagnostics?.length ?? 0), 0) }
  await writeFile(join(archive, "inventory.json"), JSON.stringify({ at: new Date().toISOString(), totals, runs }, null, 2) + "\n", { flag: "wx" })
  console.log(JSON.stringify({ archive, ...totals }))
} finally {
  const owned = await lock.stat({ bigint: true })
  await lock.close()
  const current = await lstat(lockPath, { bigint: true })
  assert(current.dev === owned.dev && current.ino === owned.ino && current.isFile())
  await unlink(lockPath)
}
