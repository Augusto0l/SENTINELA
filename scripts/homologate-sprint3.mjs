import { spawn } from "node:child_process"
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises"
import { join } from "node:path"

// Requires an existing local server; never starts, publishes or changes Git state.
const cases = [
  ["worker", "check-import-worker.mjs", "tmp/sprint-03-worker"],
  ["import", "check-import.mjs", "tmp/import-evidence"],
  ["analytics", "check-analytics.mjs", "tmp/analytics-evidence"],
  ["occurrences", "check-occurrences.mjs", null],
  ["sprint2", "check-sprint2.mjs", "tmp/sprint-02-evidence"],
  ["satellite", "check-satellite.mjs", "tmp/satellite-evidence"],
  ["location", "check-cep-location.mjs", null],
  ["location-ui", "check-cep-location.mjs", "tmp/location-evidence"],
  ["navigation", "check-navigation.mjs", "tmp/navigation-evidence"],
]
const requested = process.argv
  .find((arg) => arg.startsWith("--only="))
  ?.slice(7)
  .split(",")
if (requested?.some((name) => !cases.some(([key]) => key === name)))
  throw new Error("Roteiro desconhecido em --only.")
const selected = requested
  ? cases.filter(([key]) => requested.includes(key))
  : cases
const startedAt = new Date()
const output = join(
  "tmp/sprint-03-homologacao",
  startedAt.toISOString().replace(/[:.]/g, "-"),
)
await mkdir(output, { recursive: true })
const base = process.env.SENTINELA_TEST_URL ?? "http://127.0.0.1:3000"
assertLocal(base)
function assertLocal(value) {
  const url = new URL(value)
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Homologação requer servidor local.")
}
const health = await fetch(`${base}/login`, {
  signal: AbortSignal.timeout(10000),
})
if (!health.ok) throw new Error(`Servidor indisponível: ${health.status}`)
const results = []
const report = {
  startedAt: startedAt.toISOString(),
  base,
  buildId: (await readFile(".next/BUILD_ID", "utf8")).trim(),
  results,
}
console.log(`Evidências novas em ${output}`)
for (const [name, script, directory] of selected) {
  const begin = new Date()
  let log = ""
  console.log(`INÍCIO ${name}`)
  const code = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        "--experimental-strip-types",
        `scripts/${script}`,
        ...(name === "location-ui" ? ["--fixtures"] : []),
      ],
      { env: { ...process.env, SENTINELA_TEST_URL: base }, windowsHide: true },
    )
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (data) => {
        log += data.toString()
        process.stdout.write(data)
      })
    child.on("error", (error) => {
      log += error.stack
      resolve(-1)
    })
    child.on("close", (value) => resolve(value ?? -1))
  })
  await writeFile(join(output, `${name}.log`), log)
  const artifacts = []
  // Copy only artifacts produced by a successful current run, never historical evidence.
  if (code === 0 && directory) {
    const target = join(output, name)
    await mkdir(target, { recursive: true })
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      const source = join(directory, entry.name),
        info = await stat(source)
      if (info.mtimeMs < begin.getTime()) continue
      await copyFile(source, join(target, entry.name))
      artifacts.push(entry.name)
    }
  }
  results.push({
    name,
    command: `node --experimental-strip-types scripts/${script}${
      name === "location-ui" ? " --fixtures" : ""
    }`,
    startedAt: begin.toISOString(),
    finishedAt: new Date().toISOString(),
    exitCode: code,
    status: code === 0 ? "passed" : "failed",
    log: `${name}.log`,
    artifacts,
  })
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(report, null, 2) + "\n",
  )
  console.log(`FIM ${name}: ${code === 0 ? "APROVADO" : "REPROVADO"}`)
}
report.finishedAt = new Date().toISOString()
await writeFile(
  join(output, "results.json"),
  JSON.stringify(report, null, 2) + "\n",
)
if (results.some((result) => result.status !== "passed")) process.exitCode = 1
