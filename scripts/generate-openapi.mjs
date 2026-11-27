import "./contracts-runtime.mjs"
import { writeFile } from "node:fs/promises"
const { buildOpenApi } = await import("../src/contracts/openapi.ts")

await writeFile(
  new URL("../docs/contratos/openapi-v0.1.0.json", import.meta.url),
  JSON.stringify(buildOpenApi(), null, 2) + "\n",
)
console.log(
  "OpenAPI gerado a partir dos contratos Zod, sem publicar endpoints.",
)
