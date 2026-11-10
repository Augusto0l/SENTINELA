import { registerHooks } from "node:module"
import "../scripts/contracts-runtime.mjs"
import test from "node:test"
import assert from "node:assert/strict"
import { createServerClient } from "@supabase/ssr"
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,export%20%7B%7D", shortCircuit: true }
  return nextResolve(specifier, context)
} })
const { default: authGateway } = await import("../src/lib/auth/gateway.ts")
const userId = "00000000-0000-4000-8000-000000000001"
const user = { id: userId, aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" }
function jwt(exp) {
  return [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: userId, exp, iat: Math.floor(Date.now()/1000), aud: "authenticated", role: "authenticated" })).toString("base64url"), "synthetic-signature"].join(".")
}
function session(exp = Math.floor(Date.now()/1000)+3600) {
  return { access_token: jwt(exp), refresh_token: "synthetic-refresh-token", token_type: "bearer", expires_in: exp-Math.floor(Date.now()/1000), expires_at: exp, user }
}

test("SDK SSR real: login/gravação de cookies, getUser verificado no provedor, renovação e logout (transporte simulado)", async () => {
  const jar = new Map()
  const calls = []
  const writes = []
  let expired = true
  let refreshes = 0
  const transport = async (url, options) => {
    const parsed = new URL(url)
    assert.equal(parsed.origin, "http://127.0.0.1:54321")
    calls.push(parsed.pathname)
    if (parsed.pathname.endsWith("/token")) {
      if (parsed.searchParams.get("grant_type") === "refresh_token") { refreshes++; expired = false }
      return Response.json(session(expired ? Math.floor(Date.now()/1000)-10 : undefined))
    }
    if (parsed.pathname.endsWith("/user")) return Response.json(user)
    if (parsed.pathname.endsWith("/logout")) {
      assert.equal(parsed.searchParams.get("scope"), "global")
      return new Response(null, { status: 204 })
    }
    assert.fail(`Unexpected mocked Auth path: ${parsed.pathname}, ${options?.method}`)
  }
  function client() {
    return createServerClient("http://127.0.0.1:54321", "sb_publishable_synthetic_test_only", {
      global: { fetch: transport }, cookieOptions: { sameSite: "lax", secure: false },
      cookies: {
        getAll: () => [...jar].map(([name,value]) => ({ name,value })),
        setAll(values, headers) {
          writes.push({ values, headers })
          for (const { name,value,options } of values) { if (options.maxAge === 0) jar.delete(name); else jar.set(name,value) }
        },
      },
    })
  }
  const first = authGateway(client())
  assert.equal(await first.login("fixture@example.test", "synthetic-password"), true)
  assert.ok(jar.size > 0)
  assert.ok(writes.some(write => write.values.some(cookie => cookie.options.sameSite === "lax")))
  const second = authGateway(client())
  assert.deepEqual(await second.identity(), { id: userId })
  assert.ok(refreshes >= 1)
  assert.ok(calls.some(path => path.endsWith("/user")))
  assert.equal(await second.logout(), true)
  assert.equal(jar.size, 0)
})

test("SDK SSR real rejeita token adulterado quando o provedor recusa a identidade (transporte simulado)", async () => {
  const jar = new Map()
  let reject = false
  const client = createServerClient("http://127.0.0.1:54321", "sb_publishable_synthetic_test_only", {
    global: { fetch: async url => new URL(url).pathname.endsWith("/token") ? Response.json(session())
      : reject ? Response.json({ msg: "invalid JWT", code: "bad_jwt" }, { status: 401 }) : Response.json(user) },
    cookies: {
      getAll: () => [...jar].map(([name,value]) => ({ name,value })),
      setAll: values => { for (const {name,value} of values) jar.set(name,value) },
    },
  })
  const gateway = authGateway(client)
  assert.equal(await gateway.login("fixture@example.test", "synthetic-password"), true)
  reject = true
  assert.equal(await gateway.identity(), null)
})
