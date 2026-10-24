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
})
