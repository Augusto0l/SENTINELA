import "./contracts-runtime.mjs"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import SwaggerParser from "@apidevtools/swagger-parser"
import Ajv2020 from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
const { buildOpenApi } = await import("../src/contracts/openapi.ts")
const { contractModels } = await import("../src/contracts/examples.ts")

export async function validateApiContracts() {
  const document = JSON.parse(
    await readFile(
      new URL("../docs/contratos/openapi-v0.1.0.json", import.meta.url),
      "utf8",
    ),
  )
  assert.deepEqual(
    document,
    buildOpenApi(),
    "OpenAPI desatualizado: execute pnpm generate:openapi.",
  )
  await SwaggerParser.validate(structuredClone(document))
  const ajv = new Ajv2020({ strict: false, allErrors: true })
  addFormats(ajv)
  const validators = {}
  for (const [name, model] of Object.entries(contractModels)) {
    model.schema.parse(model.example)
    const validate = ajv.compile(document.components.schemas[name])
    assert.ok(
      validate(model.example),
      `${name}: exemplo incompatível com JSON Schema: ${ajv.errorsText(validate.errors)}`,
    )
    validators[name] = validate
  }
  let payloads = 0
  const verifyPayloads = (value) => {
    if (!value || typeof value !== "object") return
    if (value.schema?.$ref && "example" in value) {
      const name = value.schema.$ref.split("/").at(-1)
      contractModels[name].schema.parse(value.example)
      assert.ok(validators[name](value.example), `${name}: payload inválido.`)
      payloads++
    }
    for (const nested of Object.values(value)) verifyPayloads(nested)
  }
  verifyPayloads(document.paths)
  verifyPayloads(document.components.responses)
  const operations = Object.values(document.paths).flatMap((path) =>
    Object.values(path),
  )
  assert.equal(
    new Set(operations.map((operation) => operation.operationId)).size,
    operations.length,
  )
  for (const operation of operations)
    assert.equal(operation["x-implementation-status"], ["getPersistentOccurrence", "listPersistentOccurrences"].includes(operation.operationId) ? "implemented-local-development" : "planned")
  return {
    schemas: Object.keys(contractModels).length,
    paths: Object.keys(document.paths).length,
    operations: operations.length,
    payloads,
  }
}
