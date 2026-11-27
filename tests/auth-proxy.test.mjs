import { registerHooks } from "node:module"
import "../scripts/contracts-runtime.mjs"
import test from "node:test"
import assert from "node:assert/strict"
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@supabase/ssr") return nextResolve(new URL("./fixtures/auth-proxy.mjs",import.meta.url).href,context)
  if (specifier === "next/server") return nextResolve("next/server.js",context)
  return nextResolve(specifier,context)
} })
const { NextRequest } = await import("next/server.js")
const { configure } = await import("./fixtures/auth-proxy.mjs")
const { proxy } = await import("../src/proxy.ts")
function environment(t) {
  for (const [name,value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_test_only" })) {
    const previous = process.env[name]
    process.env[name] = value
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous })
  }
}

test("Proxy nega sessões inválidas/expiradas e falha do provedor sem liberar páginas/API", async t => {
  environment(t)
  for (const scenario of [{}, { throw: true }, { result: { data: null, error: {} } }]) {
    configure(scenario)
    const response = await proxy(new NextRequest("http://localhost:3000/usuarios"))
    assert.equal(new URL(response.headers.get("location")).pathname,"/login")
    assert.match(response.headers.get("cache-control"),/no-store/)
    const api = await proxy(new NextRequest("http://localhost:3000/api/ocorrencias/geocode"))
    assert.equal(api.status,401)
  }
})
test("Proxy conserva todos os cookies renovados em respostas e redirecionamentos", async t => {
  environment(t)
  for (const valid of [true,false]) {
    configure({ cookies: [ [{ name: "sb-a", value: "chunk1", options: { path: "/", sameSite: "lax" } }], [{ name: "sb-b", value: "chunk2", options: { path: "/", sameSite: "lax" } }] ],
      result: valid ? { data: { claims: { sub: "synthetic-user" } }, error: null } : { data: null,error: {} } })
    const response = await proxy(new NextRequest("http://localhost:3000/dashboard"))
    assert.equal(response.cookies.get("sb-a").value,"chunk1")
    assert.equal(response.cookies.get("sb-b").value,"chunk2")
    assert.match(response.headers.get("cache-control"),/no-store/)
    assert.equal(response.headers.get("referrer-policy"),"no-referrer")
    assert.equal(response.headers.has("location"),!valid)
  }
})

test("primeiro acesso bloqueia páginas e APIs com base nos metadados administrativos da sessão", async t => {
  environment(t)
  const claims = { sub: "synthetic-user", app_metadata: { sentinela_onboarding: "password" } }
  configure({ result: { data: { claims }, error: null } })
  const page = await proxy(new NextRequest("http://localhost:3000/usuarios"))
  assert.equal(new URL(page.headers.get("location")).pathname, "/atualizar-senha")
  const api = await proxy(new NextRequest("http://localhost:3000/api/v1/usuarios", { method: "POST" }))
  assert.equal(api.status, 403)
  const password = await proxy(new NextRequest("http://localhost:3000/atualizar-senha"))
  assert.equal(password.headers.has("location"), false)
  configure({ result: { data: { claims: { sub: claims.sub, user_metadata: claims.app_metadata } }, error: null } })
  const legacy = await proxy(new NextRequest("http://localhost:3000/dashboard"))
  assert.equal(legacy.headers.has("location"), false)
})
