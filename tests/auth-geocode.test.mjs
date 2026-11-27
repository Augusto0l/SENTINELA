import { registerHooks } from "node:module"
import test from "node:test"
import assert from "node:assert/strict"
registerHooks({ resolve(specifier,context,nextResolve) {
  if (specifier === "@/lib/auth/server") return nextResolve(new URL("./fixtures/auth-access.mjs",import.meta.url).href,context)
  if (specifier.startsWith("@/")) return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`,import.meta.url).href,context)
  return nextResolve(specifier,context)
} })
const { GET, POST } = await import("../src/app/api/ocorrencias/geocode/route.ts")
const { setAccess } = await import("./fixtures/auth-access.mjs")
test("API real de geocodificação nega sessão ausente, vínculo ausente e acesso sem escopo; não envia endereços", async t => {
  const fetch = t.mock.method(globalThis,"fetch",async () => { assert.fail("No address may leave the app") })
  for (const [status,expected] of [["unauthenticated",401],["unlinked",403],["unavailable",503]]) {
    setAccess({ status })
    assert.equal((await GET(new Request("http://localhost/api/ocorrencias/geocode?q=Quadra+Teste"))).status,expected)
  }
  for (const role of ["Administrador","Operador","Analista"]) {
    setAccess({ status: "allowed", principal: { role } })
    assert.equal((await GET(new Request("http://localhost/api/ocorrencias/geocode?q=Quadra+Teste"))).status,403)
  }
  assert.equal(fetch.mock.callCount(),0)
})

test("POST do IPEDF envia dados geográficos, filtra o DF e trata limites, timeout e indisponibilidade", async t => {
  for (const [key, value] of Object.entries({ SENTINELA_APP_ORIGIN: "http://localhost:3000",
    SENTINELA_MANUAL_GEOCODER_URL: "https://geocode.ipe.df.gov.br/api/" })) {
    const previous = process.env[key]
    process.env[key] = value
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous })
  }
  let now = 10000
  t.mock.method(Date, "now", () => now)
  const feature = (nome, longitude, latitude) => ({ type: "Feature", properties: { nome },
    geometry: { type: "Point", coordinates: [longitude, latitude] } })
  const inside = feature("SAUS Quadra 1", -47.87835, -15.79977)
  const outside = feature("Área externa à RA", -48.28, -16.18)
  const collection = (...features) => Response.json({ type: "FeatureCollection", features })
  const upstream = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.redirect, "error")
    assert.match(options.headers["User-Agent"], /SENTINELA/)
    assert.deepEqual([...url.searchParams.keys()], ["localidade", "limite"])
    const query = url.searchParams.get("localidade")
    if (query === "70070010") return collection({ ...inside, properties: { nome: "70070-010" } },
      { ...inside, properties: { nome: "70070-011" } })
    assert.equal(query, "SAUS Quadra 1")
    return collection(inside, inside, outside, feature("Sem coordenadas", "-47.88", null))
  })
  const post = (body, origin = "http://localhost:3000") => POST(new Request("http://localhost:3000/api/ocorrencias/geocode", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  }))
  const q = { q: "SAUS Quadra 1, Brasília - DF" }
  for (const role of ["Analista", "Administrador"]) {
    setAccess({ status: "allowed", principal: { role, source: "local" } })
    assert.equal((await post(q, role === "Analista" ? "http://localhost:3000" : "http://localhost:3001")).status, 403)
  }
  assert.equal((await post({ ...q, natureza: "Teste" })).status, 400)
  assert.equal((await post({ q: "SAUS Quadra 1, apto 40" })).status, 400)
  assert.equal((await post({ q: "Setor 123.456.789-00" })).status, 400)
  assert.equal(upstream.mock.callCount(), 0)
  const address = await post(q)
  assert.equal(address.status, 200)
  assert.equal(address.headers.get("Cache-Control"), "private, no-store")
  const { results } = await address.json()
  assert.deepEqual(results.map(result => [result.label, result.latitude, result.longitude, result.approximate, result.source]),
    [["SAUS Quadra 1", -15.79977, -47.87835, true, "IPEDF"]])
  assert.equal((await post(q)).status, 429)
  now += 1200
  const cep = await post({ q: "Somente o CEP vai ao provedor", cep: "70070010", street: "Texto interno" })
  assert.equal(cep.status, 200)
  assert.equal((await cep.json()).results.length, 1)
  assert.equal(upstream.mock.callCount(), 2)
  now += 1200
  upstream.mock.mockImplementation(async () => new Response(null, { status: 429, headers: { "Retry-After": "20" } }))
  const limited = await post(q)
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get("Retry-After"), "20")
  now += 20100
  upstream.mock.mockImplementation(async () => { throw new DOMException("fixture", "TimeoutError") })
  assert.equal((await post(q)).status, 504)
  now += 1200
  upstream.mock.mockImplementation(async () => new Response(null, { status: 503 }))
  assert.equal((await post(q)).status, 503)
  now += 1200
  upstream.mock.mockImplementation(async () => collection(outside))
  assert.deepEqual(await (await post(q)).json(), { results: [] })
})
