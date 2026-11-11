// Browser qualification uses a new loopback server and synthetic HTTP responses only.

// For the real PostgreSQL empty-state check use test-local-reader.ps1 -Interface.

import { spawn } from "node:child_process"

import { fileURLToPath } from "node:url"

const script = fileURLToPath(
  new URL("./homologate-local-reader.mjs", import.meta.url),
)

const child = spawn(
  process.execPath,
  [
    "--conditions=react-server",
    "--experimental-strip-types",
    script,
    "--security-only",
    "--ui",
  ],
  { stdio: "inherit", windowsHide: true },
)

child.on("error", () => {
  console.error("Could not execute isolated interface qualification")
  process.exitCode = 1
})

child.on("exit", (code) => {
  process.exitCode = code ?? 1
})
