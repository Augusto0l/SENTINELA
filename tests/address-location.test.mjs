import "../scripts/contracts-runtime.mjs"
import test from "node:test"
import assert from "node:assert/strict"
const {
  completeCep,
  looksLikeCep,
  parseLocations,
  locationRa,
  postalAddressFrom,
  postalSearches,
  parsePostalLocations,
} = await import("../src/data/addressLocation.ts")

test("dados postais preservam bairro e oferecem referência regional sem inventar coordenadas", () => {
  const postal = postalAddressFrom({ cep: "73081-140", logradouro: "Quadra QMS 29C Módulo A", bairro: "Setor de Mansões de Sobradinho", localidade: "Brasília", uf: "DF" })
  const searches = postalSearches(postal.query, postal.street, postal.district)
  assert.equal(searches.length, 3)
  assert.equal(searches[2].query, "Setor de Mansões de Sobradinho, Distrito Federal, Brasil")
  assert.equal(searches[2].reference, postal.district)
  const broad = postalAddressFrom({ uf: "DF", localidade: "Brasília", bairro: "Asa Norte" })
  assert.equal(postalSearches(broad.query, broad.street, broad.district).length, 1)
  assert.deepEqual(postalSearches("Brasília, DF, Brasil", "", ""), [])
  assert.throws(() => postalAddressFrom({ erro: true }), /CEP não encontrado/)
  assert.throws(() => postalAddressFrom({ uf: "GO" }), /não pertence/)
})

test("referências postais rejeitam correspondência frouxa e pontos fora do DF", () => {
  const region = { place_id: 10, lat: "-15.63", lon: "-47.83", name: "Setor de Mansões de Sobradinho", display_name: "Setor de Mansões de Sobradinho, DF", address: { state: "Distrito Federal", country_code: "br", suburb: "Setor de Mansões de Sobradinho", house_number: "10" }, addresstype: "house" }
  const results = parsePostalLocations([region, { ...region, place_id: 11 }], "Setor de Mansoes de Sobradinho")
  assert.equal(results.length, 2)
  assert.ok(results.every((result) => result.approximate))
  assert.deepEqual(parsePostalLocations([region], "QMS 29C"), [])
  assert.deepEqual(parsePostalLocations([{ ...region, lat: "-17" }], region.name), [])
  assert.deepEqual(parsePostalLocations([{ ...region, address: { ...region.address, state: "Goiás" } }], region.name), [])
})

test("CEP só é consultado automaticamente quando completo, com ou sem hífen", () => {
  assert.equal(completeCep(" 70790-075 "), "70790075")
  assert.equal(completeCep("70790075"), "70790075")
  for (const value of ["70790", "707900750", "7079A075", "Rua 70790075", ""])
    assert.equal(completeCep(value), null)
  assert.equal(looksLikeCep("7079-0"), true)
  assert.equal(looksLikeCep("Rua 10"), false)
})

test("resultados respeitam DF, limites existentes e distinguem imóvel de referência aproximada", () => {
  const house = {
    place_id: 1,
    lat: "-15.79",
    lon: "-47.88",
    display_name: "Endereço de teste, DF",
    addresstype: "house",
    address: {
      country_code: "br",
      state: "Distrito Federal",
      house_number: "10",
    },
  }
  assert.equal(parseLocations([house])[0].approximate, false)
  assert.equal(
    parseLocations([{ ...house, addresstype: "road" }])[0].approximate,
    true,
  )
  assert.equal(
    parseLocations([
      { ...house, address: { ...house.address, house_number: undefined } },
    ])[0].approximate,
    true,
  )
  for (const invalid of [
    { ...house, lat: "NaN" },
    { ...house, lon: "-49" },
    { ...house, address: { ...house.address, state: "Goiás" } },
    { ...house, address: undefined },
    null,
  ])
    assert.deepEqual(parseLocations([invalid]), [])
  assert.throws(() => parseLocations({ error: "indisponível" }))
})

test("conferência de RA considera Polygon, MultiPolygon e buracos sem usar os retângulos dos mocks", () => {
  const outer = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ]
  const hole = [
    [3, 3],
    [7, 3],
    [7, 7],
    [3, 7],
    [3, 3],
  ]
  const polygon = {
    type: "Feature",
    properties: { ra_nome: "Teste", ra_codigo: "interno" },
    geometry: { type: "Polygon", coordinates: [outer, hole] },
  }
  const geo = { type: "FeatureCollection", features: [polygon] }
  assert.equal(locationRa(geo, 1, 1), polygon)
  assert.equal(locationRa(geo, 5, 5), undefined)
  assert.equal(locationRa(geo, 20, 20), undefined)
  const multi = {
    ...polygon,
    geometry: { type: "MultiPolygon", coordinates: [[outer, hole]] },
  }
  assert.equal(locationRa({ ...geo, features: [multi] }, 1, 1), multi)
})
