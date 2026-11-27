import "../scripts/contracts-runtime.mjs"
import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { readFileSync } from "node:fs"
import test from "node:test"
import { assertHostedEnvironment } from "../scripts/hosted-env.mjs"

registerHooks({ resolve(s, c, next) { return s === "server-only" ? { url: "data:text/javascript,export{}", shortCircuit: true } : next(s, c) } })
const { publicSupabaseConfig } = await import("../src/lib/supabase/config.ts")
const { trustedOrigin } = await import("../src/lib/auth/core.ts")
const { localAllowed, localSelected } = await import("../src/lib/auth/local-provider.ts")
const { localDemoEnabled } = await import("../src/lib/auth/local-demo.ts")
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

const project = "https://hcmqsqfbrynpfjvmuqdb.supabase.co"
const publishable = "sb_publishable_" + "x".repeat(31)

// publicSupabaseConfig reads the literal process.env names so Next can inline them; tests swap them temporarily.
function withPublicEnv(url, key, fn) {
  const saved = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY]
  const assign = (name, value) => { if (value === undefined) delete process.env[name]; else process.env[name] = value }
  assign("NEXT_PUBLIC_SUPABASE_URL", url); assign("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key)
  try { return fn() } finally { assign("NEXT_PUBLIC_SUPABASE_URL", saved[0]); assign("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", saved[1]) }
}

// Mirrors the Supabase branch of AuthPanel; the source contract below keeps both in sync.
const supabaseLoginEnabled = (url, key, origin) => withPublicEnv(url, key, () => Boolean(publicSupabaseConfig() && origin))

test("login Supabase corretamente configurado fica habilitado, inclusive em produção hospedada", () => {
  assert.equal(supabaseLoginEnabled(project, publishable, "https://sentinela-eight-chi.vercel.app"), true)
  assert.equal(trustedOrigin("https://sentinela-eight-chi.vercel.app"), "https://sentinela-eight-chi.vercel.app")
  assert.deepEqual(withPublicEnv(project, publishable, publicSupabaseConfig), { url: project, key: publishable })
})

test("login sem configuração válida permanece bloqueado", () => {
  const origin = "https://sentinela-eight-chi.vercel.app"
  assert.equal(supabaseLoginEnabled(project, publishable, undefined), false, "SENTINELA_APP_ORIGIN ausente")
  assert.equal(supabaseLoginEnabled(project, publishable, ""), false, "SENTINELA_APP_ORIGIN vazio")
  assert.equal(supabaseLoginEnabled(undefined, publishable, origin), false, "URL ausente")
  assert.equal(supabaseLoginEnabled(project, undefined, origin), false, "chave ausente")
  assert.equal(supabaseLoginEnabled(project, "eyJhbGciOiJIUzI1NiJ9.legado", origin), false, "chave anon JWT legada")
  assert.equal(supabaseLoginEnabled(`${project}/rest/v1`, publishable, origin), false, "URL com caminho")
  assert.equal(supabaseLoginEnabled("http://hcmqsqfbrynpfjvmuqdb.supabase.co", publishable, origin), false, "HTTP fora do loopback")
})

test("AuthPanel deriva configured da configuração pública e da origem, e o formulário depende dele", () => {
  const panel = source("src/components/auth/AuthPanel.tsx")
  assert.match(panel, /const configured = local \? localReady : Boolean\(publicSupabaseConfig\(\) && process\.env\.SENTINELA_APP_ORIGIN\)/)
  assert.match(panel, /if \(local && localAllowed\(\(await headers\(\)\)\.get\("host"\)\)\)/)
  const form = source("src/components/auth/LoginForm.tsx")
  for (const id of ["auth-email", "auth-password"]) assert.match(form, new RegExp(`id="${id}"[^>]*disabled=\\{!configured\\}`))
  assert.match(form, /type="submit" disabled=\{!configured \|\| pending\}/)
  assert.doesNotMatch(panel + form, /VERCEL|NODE_ENV === "production"/, "o ramo Supabase não depende do ambiente de hospedagem")
})

test("o provedor local não pode ser usado na Vercel", () => {
  const local = { SENTINELA_AUTH_PROVIDER: "local", SENTINELA_LOCAL_BIND: "127.0.0.1", SENTINELA_APP_ORIGIN: "http://localhost:3000" }
  assert.equal(localSelected(local), true)
  assert.equal(localAllowed("localhost:3000", { ...local, NODE_ENV: "development" }), true, "permitido só no loopback em desenvolvimento")
  for (const hosted of [{ NODE_ENV: "production", VERCEL: "1" }, { NODE_ENV: "production", VERCEL_ENV: "production" }, { NODE_ENV: "production", VERCEL_ENV: "preview" }]) {
    assert.equal(localAllowed("localhost:3000", { ...local, ...hosted }), false)
    assert.equal(localAllowed("sentinela-eight-chi.vercel.app", { ...local, ...hosted, SENTINELA_APP_ORIGIN: "https://sentinela-eight-chi.vercel.app" }), false)
    assert.throws(() => assertHostedEnvironment({ ...hosted, SENTINELA_AUTH_PROVIDER: "local" }), /SENTINELA_AUTH_PROVIDER/)
  }
  assert.equal(localAllowed("sentinela-eight-chi.vercel.app", { ...local, NODE_ENV: "development", SENTINELA_APP_ORIGIN: "https://sentinela-eight-chi.vercel.app" }), false)
})

test("nenhuma conta demonstrativa adquire acesso operacional em produção", () => {
  const demo = { SENTINELA_LOCAL_DEMO: "1", SENTINELA_LOCAL_BIND: "127.0.0.1" }
  for (const hosted of [{ NODE_ENV: "production" }, { NODE_ENV: "production", VERCEL: "1" }, { NODE_ENV: "production", VERCEL_ENV: "production" }]) {
    assert.equal(localDemoEnabled("localhost:3000", { ...demo, ...hosted }), false)
    assert.equal(localDemoEnabled("sentinela-eight-chi.vercel.app", { ...demo, ...hosted }), false)
    if (hosted.VERCEL || hosted.VERCEL_ENV) assert.throws(() => assertHostedEnvironment({ ...hosted, ...demo }), /SENTINELA_LOCAL_DEMO|SENTINELA_LOCAL_BIND/)
  }
  // The preview principal exists only for page rendering behind isLocalDemo; API handlers keep real Auth.
  const access = source("src/lib/auth/page-access.ts")
  assert.match(access, /if \(await isLocalDemo\(\)\) return \{\s*source: "preview"/)
  assert.match(access, /return !localSelected\(\) && localDemoEnabled\(\(await headers\(\)\)\.get\("host"\)\)/)
})
