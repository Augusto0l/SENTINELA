import { registerHooks } from "node:module"
import { existsSync } from "node:fs"
import test from "node:test"
import assert from "node:assert/strict"
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const url = new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url)
      if (existsSync(url)) return nextResolve(url.href, context)
    }
    return nextResolve(specifier, context)
  },
})
const { occurrenceSchema, simulateGeocoding } = await import(
  "../src/data/occurrenceForm.ts"
)
const { canWrite, canInactivate, canVisit } = await import(
  "../src/data/demoPermissions.ts"
)
const valid = {
  natureza: "Furto",
  data: "29/02/2024",
  horario: "23:59",
  raCode: "RA-I",
  local: "Quadra fictícia 10",
  latitude: "-15.79",
  longitude: "-47.88",
}
test("formulário aceita data bissexta e rejeita datas, horários, catálogos e coordenadas inválidos", () => {
  assert.equal(occurrenceSchema.safeParse(valid).success, true)
  for (const [field, values] of Object.entries({
    data: ["29/02/2025", "31/04/2026", "2026-01-01", ""],
    horario: ["24:00", "12:60", "9:00", ""],
    natureza: ["inventada", ""],
    raCode: ["inventada", ""],
    local: ["   ", "abcd"],
    latitude: ["", "Infinity", "-20"],
    longitude: ["", "NaN", "0"],
  })) {
    for (const value of values)
      assert.equal(
        occurrenceSchema.safeParse({ ...valid, [field]: value }).success,
        false,
        `${field}: ${value}`,
      )
  }
})
test("geocodificação simulada rejeita endereço/RA inválidos e devolve referência declaradamente sintética", () => {
  for (const [address, ra] of [
    ["", "RA-I"],
    ["123456", "RA-I"],
    ["Quadra fictícia", "ausente"],
  ])
    assert.equal(simulateGeocoding(address, ra), null)
  const point = simulateGeocoding(valid.local, valid.raCode)
  assert.ok(
    point &&
      point.latitude < -15.4 &&
      point.latitude > -16.2 &&
      point.longitude < -47.3 &&
      point.longitude > -48.3,
  )
})
test("matriz distingue consulta, escrita, gestão e inativação nos três perfis", () => {
  for (const role of ["Administrador", "Operador", "Analista"]) {
    assert.equal(canWrite(role), role !== "Analista")
    assert.equal(canInactivate(role), role !== "Analista")
    assert.equal(canVisit(role, "/usuarios"), role === "Administrador")
    assert.equal(canVisit(role, "/ocorrencias/nova"), role !== "Analista")
    assert.equal(canVisit(role, "/importar"), role !== "Analista")
    assert.equal(canVisit(role, "/ocorrencias"), true)
  }
})
