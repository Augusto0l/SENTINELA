import { registerHooks } from "node:module"
import test from "node:test"
import assert from "node:assert/strict"
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/"))
      return nextResolve(
        new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href,
        context,
      )
    return nextResolve(specifier, context)
  },
})
const { GET } = await import("../src/app/api/ocorrencias/geocode/route.ts")

test("proxy valida entrada, identifica aplicação, limita consultas, usa cache e trata falhas", async (t) => {
  let clock = 10000
  t.mock.method(Date, "now", () => clock)
  const upstream = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url.searchParams.get("countrycodes"), "br")
    assert.equal(url.searchParams.get("bounded"), "1")
    assert.match(options.headers["User-Agent"], /SENTINELA.*github.com/)
    return Response.json([
      {
        place_id: 1,
        lat: "-15.79",
        lon: "-47.88",
        display_name: "Rua de teste",
        addresstype: "house",
        address: {
          country_code: "br",
          state: "Distrito Federal",
          house_number: "1",
        },
      },
    ])
  })
  const request = (q) =>
    GET(
      new Request(
        `http://localhost/api/ocorrencias/geocode?${new URLSearchParams({ q })}`,
      ),
    )
  assert.equal((await request("123")).status, 400)
  const first = await request("Rua de teste")
  assert.equal(first.status, 200)
  assert.equal((await first.json()).results.length, 1)
  assert.equal((await request("RUA DE TESTE")).status, 200)
  assert.equal(upstream.mock.callCount(), 1)
  const limited = await request("Outra rua")
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get("Retry-After"), "2")
  clock += 1200
  upstream.mock.mockImplementation(async () => {
    throw new TypeError("Failed to fetch")
  })
  const failure = await request("Outra rua")
  assert.equal(failure.status, 503)
  assert.match((await failure.json()).error, /indisponível/)
  clock += 1200
  upstream.mock.mockImplementation(async () => Response.json([]))
  assert.deepEqual(await (await request("Endereço inexistente")).json(), {
    results: [],
  })

  clock += 1200
  const queries = []
  upstream.mock.mockImplementation(async (url) => {
    const query = url.searchParams.get("q")
    queries.push(query)
    if (query.startsWith("Quadra")) return Response.json([])
    return Response.json([{ place_id: 2, lat: "-15.63", lon: "-47.83", name: "Setor de Mansões de Sobradinho", display_name: "Setor de Mansões de Sobradinho, DF", address: { state: "Distrito Federal", country_code: "br", suburb: "Setor de Mansões de Sobradinho" } }])
  })
  const postal = new URLSearchParams({ q: "Quadra QMS 29C Módulo A, Brasília, Distrito Federal, Brasil", cep: "73081140", street: "Quadra QMS 29C Módulo A", district: "Setor de Mansões de Sobradinho" })
  const postalRequest = () => GET(new Request(`http://localhost/api/ocorrencias/geocode?${postal}`))
  const locations = await (await postalRequest()).json()
  assert.equal(queries.length, 3)
  assert.equal(queries[2], "Setor de Mansões de Sobradinho, Distrito Federal, Brasil")
  assert.equal(locations.results[0].approximate, true)
  assert.equal((await postalRequest()).status, 200)
  assert.equal(queries.length, 3)
})
