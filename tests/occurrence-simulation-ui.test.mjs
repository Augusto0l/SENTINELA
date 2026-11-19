import "../scripts/contracts-runtime.mjs"
import test from "node:test"
import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { state } from "./fixtures/permission-context.mjs"
registerHooks({
  resolve(s, c, next) {
    if (s === "@/components/OperationalProvider") return { url: new URL("./fixtures/permission-context.mjs", import.meta.url).href, shortCircuit: true }
    if (s === "next/dynamic") return { url: "data:text/javascript,export default function dynamic(){return function MapPlaceholder(){return null}}", shortCircuit: true }
    if (s.endsWith(".css")) return { url: "data:text/javascript,export default new Proxy({}, {get:(_,k)=>String(k)})", shortCircuit: true }
    if (s.startsWith("@/")) for (const ext of [".ts", ".tsx"]) { const url = new URL("../src/" + s.slice(2) + ext, import.meta.url); if (existsSync(url)) return { url: url.href, shortCircuit: true } }
    return next(s, c)
  },
  load(url, c, next) {
    if (url.endsWith(".tsx")) return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText }
    return next(url, c)
  },
})
const { default: Workspace } = await import("../src/features/occurrences/SimulationWorkspace.tsx")
const { syntheticRecord } = await import("../src/features/occurrences/simulation.ts")
const render = (role, props = {}) => {
  state.principal = { role, source: "local", id: "verified-fixture", authUserId: "", name: "Synthetic test" }
  return renderToStaticMarkup(React.createElement(Workspace, props))
}
test("simulation UI: create visible to Admin and Operator; Analyst receives denial", () => {
  for (const role of ["Administrador", "Operador", "Analista"]) {
    const html = render(role, { startCreate: true })
    assert.equal(html.includes('type="submit"'), role !== "Analista")
    assert(html.includes("sem gravação")); assert(html.includes("Nenhum mock automático"))
  }
})
test("simulation UI: regular edit/inactivation buttons enabled for Administrator and Operator", () => {
  for (const role of ["Administrador", "Operador", "Analista"]) {
    const html = render(role, { initial: syntheticRecord() })
    for (const text of ["Editar prévia demonstrativa", "Inativar prévia demonstrativa"]) {
      const button = html.match(new RegExp(`<button[^>]*>${text}</button>`))?.[0]
      assert(button); assert.equal(button.includes('disabled=""'), role === "Analista")
    }
  }
})
test("simulation UI: inactive, review and imported copies never expose enabled regular mutation", () => {
  for (const role of ["Administrador", "Operador"]) {
    for (const record of [syntheticRecord("inactive"), syntheticRecord("review"), { ...syntheticRecord(), origem: "importacao" }]) {
      const html = render(role, { initial: record })
      for (const text of ["Editar prévia demonstrativa", "Inativar prévia demonstrativa"]) assert(html.match(new RegExp(`<button[^>]*>${text}</button>`))?.[0].includes('disabled=""'))
    }
  }
})
