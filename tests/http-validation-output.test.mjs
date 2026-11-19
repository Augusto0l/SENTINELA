import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { httpValidation, projectRoot, realDirectory } from "../scripts/http-validation-output.mjs"

async function fixture(t) {
  const tmp = join(projectRoot, "tmp")
  await mkdir(tmp, { recursive: true })
  await realDirectory(tmp)
  const root = await mkdtemp(join(tmp, "http-cleanup-test-"))
  t.after(async () => { await realDirectory(root); await rm(root, { recursive: true }) })
  const evidence = join(root, "evidence"), id = randomUUID()
  const basename = `.next-http-validation-${id}`
  const dist = join(root, basename), types = join(root, "next-env.d.ts")
  await mkdir(evidence)
  return { evidence, id, root, basename, dist, types, run: httpValidation(id, { root, evidence, addStub: true }) }
}

const missing = path => assert.rejects(lstat(path), { code: "ENOENT" })
const generated = dir => `import "./${dir}/dev/types/routes.d.ts";\n// NOTE: This file should not be edited\n`

test("shutdown cleanup archives hashes, restores types and only removes owned artifacts", async t => {
  const { evidence, id, root, basename, dist, types, run } = await fixture(t)
  const initial = Buffer.from("// anterior\r\n")
  await writeFile(types, initial)
  const historical = join(root, `.next-http-validation-${randomUUID()}`)
  await mkdir(historical)
  await run.prepare()
  const competitor = httpValidation(randomUUID(), { root, port: 3316 })
  await assert.rejects(competitor.prepare(), { code: "EEXIST" })
  await competitor.finish()
  await writeFile(types, generated(basename))
  await mkdir(join(dist, "dev", "logs"), { recursive: true })
  const log = Buffer.from("diagnóstico sintético\n")
  await writeFile(join(dist, "dev", "logs", "next-development.log"), log)
  await run.finish()
  await missing(dist)
  await missing(join(root, "tmp", `tsconfig-http-${id}.json`))
  await missing(join(root, "tmp", `next-env-http-${id}.d.ts`))
  await missing(join(root, "tmp", "http-validation.lock"))
  assert((await lstat(historical)).isDirectory())
  assert.deepEqual(await readFile(types), initial)
  const archive = join(evidence, `http-diagnostics-${id}`)
  assert.deepEqual(await readFile(join(archive, "dev", "logs", "next-development.log")), log)
  const manifest = JSON.parse(await readFile(join(archive, "manifest.json"), "utf8"))
  assert.equal(manifest.diagnostics[0].sha256, createHash("sha256").update(log).digest("hex"))
})

test("failed preservation retains source and restores the original absence of next-env.d.ts", async t => {
  const { evidence, id, root, basename, dist, types, run } = await fixture(t)
  await run.prepare()
  await writeFile(types, generated(basename))
  await mkdir(join(dist, "dev"))
  await writeFile(join(dist, "dev", "trace"), "conteúdo")
  const archive = join(evidence, `http-diagnostics-${id}`)
  await mkdir(archive)
  await writeFile(join(archive, "sentinel"), "existente")
  await assert.rejects(run.finish(), { code: "EEXIST" })
  assert.equal(await readFile(join(dist, "dev", "trace"), "utf8"), "conteúdo")
  assert.equal(await readFile(join(archive, "sentinel"), "utf8"), "existente")
  assert((await lstat(join(root, "tmp", `tsconfig-http-${id}.json`))).isFile())
  await missing(types)
})

test("cleanup refuses reused or linked directories", async t => {
  const { root, dist, run } = await fixture(t)
  const sentinel = join(root, "sentinel")
  await mkdir(sentinel)
  await writeFile(join(sentinel, "proof"), "preserve")
  await mkdir(dist)
  await assert.rejects(run.prepare(), { code: "EEXIST" })
  await run.finish()
  assert((await lstat(dist)).isDirectory())

  const id = randomUUID(), second = httpValidation(id, { root })
  const output = join(root, `.next-http-validation-${id}`)
  await second.prepare()
  await mkdir(join(output, "dev"))
  const link = join(output, "dev", "linked")
  await symlink(sentinel, link, "junction")
  try {
    await assert.rejects(second.finish(), /contém links/)
    assert((await lstat(link)).isSymbolicLink())
    assert.equal(await readFile(join(sentinel, "proof"), "utf8"), "preserve")
  } finally { await unlink(link) }
})
