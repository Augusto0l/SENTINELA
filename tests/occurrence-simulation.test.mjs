import "../scripts/contracts-runtime.mjs"
import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
const { simulateOccurrence: simulate, syntheticRecord, SYNTHETIC_CATALOGS: catalogs, fromReadOccurrence } = await import("../src/features/occurrences/simulation.ts")
const input = () => structuredClone(syntheticRecord().values)
const edit = (record, alteracoes = { local: "Local simulado atualizado" }) => ({ versaoEsperada: record.versao, justificativa: "Teste exclusivamente demonstrativo", alteracoes })
test("simulation: create authorization for the three profiles, no persistence and independent preview", () => {
  for (const role of ["Administrador", "Operador", "Analista"]) {
    const body = input(), before = structuredClone(body)
    const result = simulate(role, "create", body, catalogs)
    assert.equal(result.success, role !== "Analista"); assert.equal(result.persisted, false)
    assert.deepEqual(body, before)
    if (result.success) { assert.equal(result.preview.consolidacaoStatus, "em_revisao"); result.preview.values.local = "changed"; assert.deepEqual(body, before); assert(result.message.includes("Nenhum dado")) }
  }
})
test("simulation: required fields, invalid dates, coordinates, UUIDs and nature associations", () => {
  for (const field of ["data", "horario", "raId", "local", "naturezas"]) { const body = input(); delete body[field]; assert.equal(simulate("Administrador", "create", body, catalogs).success, false) }
  for (const patch of [{ data: "2026-02-30" }, { horario: "24:00:00" }, { coordenadas: { latitude: 91, longitude: 0 } }, { naturezaId: "bad" }, { naturezas: [] }, { origem: "manual" }])
    assert.equal(simulate("Administrador", "create", { ...input(), ...patch }, catalogs).success, false)
  const body = input(); body.naturezas.push({ ...body.naturezas[0] }); assert.equal(simulate("Administrador", "create", body, catalogs).success, false)
})
test("simulation: empty catalogs never fall back to synthetic data; unknown references refused", () => {
  for (const c of [{ regions: [], natures: [] }, { ...catalogs, regions: [] }, { ...catalogs, natures: [] }]) assert.equal(simulate("Operador", "create", input(), c).success, false)
  const body = input(); body.naturezas[0].naturezaId = crypto.randomUUID(); assert.equal(simulate("Administrador", "create", body, catalogs).success, false)
  body.naturezas = input().naturezas; body.raId = crypto.randomUUID(); assert.equal(simulate("Administrador", "create", body, catalogs).success, false)
})
test("simulation: Administrator and Operator edit a copy; Analyst is denied", () => {
  for (const role of ["Administrador", "Operador", "Analista"]) {
    const record = syntheticRecord(), before = structuredClone(record)
    const result = simulate(role, "edit", edit(record, { local: "Local simulado atualizado", naturezas: catalogs.natures.map(n => ({ naturezaId: n.id, crimeTentado: null })) }), catalogs, record)
    assert.equal(result.success, role !== "Analista"); assert.equal(result.persisted, false); assert.deepEqual(record, before)
    if (role === "Analista") assert.equal(result.code, 403)
    if (result.success) { assert.equal(result.preview.versao, "2"); assert.equal(result.preview.values.naturezas.length, 2) }
  }
})
test("simulation: immutable fields, missing reason, stale version, inactive/review and imported records denied", () => {
  const record = syntheticRecord()
  for (const field of ["id", "origem", "fonte", "numeroRegistro", "ativo", "ator", "consolidacaoStatus"]) assert(!simulate("Administrador", "edit", edit(record, { [field]: "forged" }), catalogs, record).success)
  assert(!simulate("Administrador", "edit", { ...edit(record), justificativa: "" }, catalogs, record).success)
  assert.equal(simulate("Administrador", "edit", { ...edit(record), versaoEsperada: "2" }, catalogs, record).code, 409)
  for (const r of [syntheticRecord("inactive"), syntheticRecord("review"), { ...record, origem: "importacao" }]) assert(!simulate("Administrador", "edit", edit(r), catalogs, r).success)
})
test("simulation: Administrator and Operator can inactivate a copy; Analyst is denied", () => {
  for (const role of ["Administrador", "Operador", "Analista"]) {
    const record = syntheticRecord(), before = structuredClone(record)
    const result = simulate(role, "inactivate", { versaoEsperada: "1", motivo: "Teste simulado" }, catalogs, record)
    assert.equal(result.success, role !== "Analista"); assert.equal(result.persisted, false); assert.deepEqual(record, before)
    if (role === "Analista") assert.equal(result.code, 403)
    if (result.success) { assert.equal(result.preview.ativo, false); assert.deepEqual(result.preview.values, record.values)
      assert(!simulate(role, "inactivate", { versaoEsperada: "2", motivo: "Teste" }, catalogs, result.preview).success) }
  }
  assert(!simulate("Administrador", "inactivate", { versaoEsperada: "1", motivo: " " }, catalogs, syntheticRecord()).success)
})
test("simulation: predictable conflict, unavailable and forbidden errors leave source unchanged", () => {
  const record = syntheticRecord(), before = structuredClone(record)
  for (const [scenario, status] of [["conflict", 409], ["unavailable", 503], ["denied", 403]]) {
    for (const operation of ["edit", "inactivate"]) {
      const r = simulate("Administrador", operation, operation === "edit" ? edit(record) : { versaoEsperada: "1", motivo: "teste" }, catalogs, record, scenario)
      assert.equal(r.success, false); assert.equal(r.code, status); assert.equal(r.persisted, false); assert.deepEqual(record, before)
    }
  }
})
test("simulation: adapting GET preserves UUID, version and nulls without modifying source", () => {
  const record = { id: crypto.randomUUID(), versao: "123", ativo: true, origem: "manual", consolidacaoStatus: "consolidada", data: null, horario: null, ra: null, local: null, latitude: null, longitude: null, naturezas: [] }
  const before = structuredClone(record), preview = fromReadOccurrence(record)
  assert.equal(preview.id, record.id); assert.equal(preview.versao, "123"); assert.equal(preview.values.coordenadas, null); assert.deepEqual(record, before)
})
test("simulation integration has no transport, SQL, browser persistence or active writes", async () => {
  const model = await readFile(new URL("../src/features/occurrences/simulation.ts", import.meta.url), "utf8")
  assert.doesNotMatch(model, /\bfetch\s*\(|localStorage|sessionStorage|from ["']pg["']|write-sandbox|DATABASE_URL|use server/)
  const ui = await readFile(new URL("../src/features/occurrences/SimulationWorkspace.tsx", import.meta.url), "utf8")
  assert.match(ui, /locked\.current/); assert.match(ui, /readCatalog\("regioes"/); assert.match(ui, /readCatalog\("naturezas"/)
  assert.doesNotMatch(ui, /method:\s*["'](?:POST|PATCH|DELETE)|use server|write-sandbox|DATABASE_URL/)
  assert.match(ui, /if \(locked\.current\) return/)
  assert.match(ui, /setMode\("view"\); setErrors\(\{\}\); setMessage\("Preenchimento cancelado/)
})
