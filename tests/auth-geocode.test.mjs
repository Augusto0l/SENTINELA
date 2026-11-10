import { registerHooks } from "node:module"
import test from "node:test"
import assert from "node:assert/strict"
registerHooks({ resolve(specifier,context,nextResolve) {
  if (specifier === "@/lib/auth/server") return nextResolve(new URL("./fixtures/auth-access.mjs",import.meta.url).href,context)
  if (specifier.startsWith("@/")) return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`,import.meta.url).href,context)
  return nextResolve(specifier,context)
} })
const { GET } = await import("../src/app/api/ocorrencias/geocode/route.ts")
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
