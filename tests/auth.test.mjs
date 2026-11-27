import "../scripts/contracts-runtime.mjs"
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
const { resolveAccess, authPost, confirmAuth, trustedOrigin } = await import("../src/lib/auth/core.ts")
const { ROLES, hasPermission, isProtectedPath, routePermission, businessDataEnabled } = await import("../src/lib/auth/policy.ts")
const origin = "http://localhost:3000"
const authId = "00000000-0000-4000-8000-000000000001"
const internalId = "00000000-0000-4000-8000-000000000002"
const row = { usuario_id: internalId, auth_user_id: authId, nome_exibicao: "Conta sintética", perfil: "Analista", ativo: true }
function gateway(changes = {}) {
  return {
    identity: async () => ({ id: authId }), access: async () => [row], login: async () => true,
    logout: async () => true, recover: async () => {}, updatePassword: async () => true,
    exchange: async () => true, verify: async () => true, ...changes,
  }
}
function request(action, fields = {}, headers = {}) {
  return new Request(`${origin}/auth/${action}`, { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(fields) })
}
const target = response => new URL(response.headers.get("location")).pathname

test("logout mantém a rejeição de Origin null sem revogar a sessão Supabase", async () => {
  let calls = 0
  const result = await authPost("logout", request("logout", {}, { origin: "null" }), origin, gateway({ logout: async () => { calls++; return true } }))
  assert.equal(result.status, 403)
  assert.equal(calls, 0)
})

test("login real delega credenciais, usa vínculo ativo e ignora perfil enviado pelo formulário", async () => {
  let credentials
  const response = await authPost("login", request("login", { email: "teste@example.test", password: "senha-sintetica", perfil: "Administrador", next: "https://evil.invalid" }), origin,
    gateway({ login: async (...args) => { credentials = args; return true } }))
  assert.deepEqual(credentials, ["teste@example.test", "senha-sintetica"])
  assert.equal(target(response), "/dashboard")
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.equal((await resolveAccess(gateway())).principal.role, "Analista")
})
test("login inválido, sessão expirada/adulterada e falha de vínculo negam acesso", async () => {
  const invalid = await authPost("login", request("login", { email: "teste@example.test", password: "errada" }), origin, gateway({ login: async () => false }))
  assert.match(invalid.headers.get("location"), /erro=credenciais$/)
  assert.deepEqual(await resolveAccess(gateway({ identity: async () => null })), { status: "unauthenticated" })
  assert.deepEqual(await resolveAccess(gateway({ identity: async () => ({ id: "forjado" }) })), { status: "unauthenticated" })
  assert.deepEqual(await resolveAccess(gateway({ access: async () => { throw Error("segredo que nao deve vazar") } })), { status: "unavailable" })
})
test("usuários sem vínculo, desativados, vínculos cruzados, perfis arbitrários ou duplicados são rejeitados", async () => {
  for (const rows of [[], [{ ...row, ativo: false }], [{ ...row, auth_user_id: internalId }], [{ ...row, perfil: "root" }], [row, row]]) {
    assert.equal((await resolveAccess(gateway({ access: async () => rows }))).status, "unlinked")
    const response = await authPost("login", request("login", { email: "teste@example.test", password: "sintetica" }), origin, gateway({ access: async () => rows }))
    assert.equal(target(response), "/acesso-pendente")
  }
})
test("logout invoca o provedor e só informa sucesso quando concluído", async () => {
  let calls = 0
  const response = await authPost("logout", request("logout"), origin, gateway({ logout: async () => { calls++; return true } }))
  assert.equal(calls, 1)
  assert.match(response.headers.get("location"), /estado=saiu$/)
  const failed = await authPost("logout", request("logout"), origin, gateway({ logout: async () => false }))
  assert.equal(target(failed), "/acesso-pendente")
})
test("CSRF, tipo de conteúdo inesperado e payload excessivo são bloqueados antes do Auth", async () => {
  const never = gateway({ login: async () => { assert.fail("Auth não deveria ser chamado") } })
  assert.equal((await authPost("login", request("login", {}, { origin: "https://evil.invalid" }), origin, never)).status, 403)
  assert.equal((await authPost("login", request("login", {}, { "content-type": "application/json" }), origin, never)).status, 415)
  assert.equal((await authPost("login", request("login", { payload: "x".repeat(9000) }), origin, never)).status, 413)
  for (const value of [undefined, "https://user:pass@example.test", "https://example.test/evil", "http://example.test", "javascript:alert(1)"]) assert.equal(trustedOrigin(value), null)
})
test("recuperação não enumera contas nem expõe erros do provedor", async () => {
  const responses = []
  for (const recover of [async () => {}, async () => { throw Error("token=NAO-EXIBIR") }]) {
    responses.push((await authPost("recuperar", request("recuperar", { email: "ausente@example.test" }), origin, gateway({ recover }))).headers.get("location"))
  }
  assert.equal(responses[0], responses[1])
  assert.equal(new URL(responses[0]).pathname, "/recuperar-senha")
})
test("confirmação aceita somente recovery/invite ou troca PKCE, sem redirect arbitrário", async () => {
  for (const type of ["recovery", "invite"]) {
    const response = await confirmAuth(new Request(`${origin}/auth/confirm?token_hash=sintetico&type=${type}&next=https://evil.invalid`), origin, gateway())
    assert.equal(target(response), "/atualizar-senha")
  }
  for (const query of ["type=signup&token_hash=falso", "code=expirado", ""]) {
    const response = await confirmAuth(new Request(`${origin}/auth/confirm?${query}`), origin, gateway({ exchange: async () => false }))
    assert.match(response.headers.get("location"), /erro=link$/)
  }
})
test("atualização de senha exige sessão, confirmação e logout após sucesso", async () => {
  const fields = { password: "senha-sintetica-123", confirmation: "senha-sintetica-123" }
  const result = await authPost("senha", request("senha", fields), origin, gateway())
  assert.match(result.headers.get("location"), /estado=senha$/)
  const expired = await authPost("senha", request("senha", fields), origin, gateway({ identity: async () => null }))
  assert.match(expired.headers.get("location"), /erro=sessao$/)
  const mismatch = await authPost("senha", request("senha", { ...fields, confirmation: "diferente" }), origin, gateway())
  assert.match(mismatch.headers.get("location"), /erro=senha$/)
})

test("primeiro acesso intercepta o login e mantém a autorização bloqueada antes da nova senha", async () => {
  let updates = 0
  const client = gateway({
    identity: async () => ({ id: authId, onboarding: "password" }),
    access: async () => assert.fail("Vínculo não deve liberar um primeiro acesso pendente"),
    updatePassword: async () => { updates++; return true },
  })
  assert.deepEqual(await resolveAccess(client), { status: "first_password" })
  const first = await authPost("login", request("login", { email: "fixture@example.test", password: "temporaria" }), origin, client)
  assert.equal(target(first), "/atualizar-senha")
  const weak = await authPost("senha", request("senha", { password: "123456", confirmation: "123456" }), origin, client)
  assert.match(weak.headers.get("location"), /erro=primeira_senha$/)
  assert.equal(updates, 0)
  const fields = { password: "Fixture!long-A7-Test", confirmation: "Fixture!long-A7-Test" }
  const saved = await authPost("senha", request("senha", fields), origin, client)
  assert.match(saved.headers.get("location"), /estado=senha$/)
  assert.equal(updates, 1)
  const incomplete = gateway({ identity: async () => ({ id: authId, onboarding: "provisioning" }) })
  assert.equal((await resolveAccess(incomplete)).status, "unlinked")
  assert.equal(target(await authPost("senha", request("senha", fields), origin, incomplete)), "/acesso-pendente")
})

test("cadastro institucional valida e-mail, senha, perfil, nome e status inicial", async () => {
  const { institutionalCreate, institutionalDelete, institutionalEdit } = await import("../src/contracts/institutional-users.ts")
  const input = { name: "Pessoa de teste", email: " Teste+qa@EXAMPLE.TEST ", perfil: "Operador", password: "Fixture!long-A7-Test" }
  assert.equal(institutionalCreate.parse(input).email, "teste+qa@example.test")
  assert.equal(institutionalCreate.parse(input).ativo, true)
  assert.equal(institutionalCreate.parse({ ...input, ativo: false }).ativo, false)
  for (const invalid of [{ password: "123456" }, { perfil: "root" }, { email: "teste@inválido" }, { name: " " }, { ativo: "false" }])
    assert.equal(institutionalCreate.safeParse({ ...input, ...invalid }).success, false)
  const target = { id: "68ad2bb1-9840-43cc-bf27-95b12e29c581", version: "a".repeat(64) }
  assert(institutionalEdit.safeParse({ ...target, perfil: "Analista" }).success)
  assert(institutionalEdit.safeParse({ ...target, ativo: false }).success)
  assert(!institutionalEdit.safeParse({ ...target, perfil: "Administrador", ativo: true }).success)
  assert(!institutionalDelete.safeParse(target).success)
  assert(institutionalDelete.safeParse({ ...target, email: "teste@example.test" }).success)
})
test("permissões dos três perfis, rotas e escopo de dados permanecem restritos", () => {
  for (const role of ROLES) {
    assert.equal(hasPermission(role, "consultar_central"), true)
    assert.equal(hasPermission(role, "analisar"), true)
    assert.equal(hasPermission(role, "cadastrar"), role !== "Analista")
    assert.equal(hasPermission(role, "importar"), role !== "Analista")
    assert.equal(hasPermission(role, "administrar"), role === "Administrador")
    assert.equal(hasPermission(role, "corrigir"), role === "Administrador")
  }
  for (const path of ["/dashboard", "/usuarios", "/usuarios/1", "/api/ocorrencias/geocode", "/ocorrencias/nova", "/central-revisao"]) assert.equal(isProtectedPath(path), true)
  assert.equal(isProtectedPath("/login"), false)
  assert.equal(routePermission("/usuarios"), "administrar")
  assert.equal(routePermission("/ocorrencias/nova"), "cadastrar")
  assert.equal(businessDataEnabled(), false)
})
test("fontes da autenticação não expõem chaves administrativas, cadastro público ou autoridade no sessionStorage", () => {
  for (const directory of ["src/lib/auth", "src/lib/supabase"]) {
    for (const file of readdirSync(directory)) {
      const source = readFileSync(`${directory}/${file}`, "utf8")
      assert.doesNotMatch(source, /process\.env\.[A-Z_]*(?:SERVICE_ROLE|SECRET_KEY)|\.signUp\(|sessionStorage/)
    }
  }
  assert.doesNotMatch(readFileSync("src/components/OperationalProvider.tsx", "utf8"), /sessionStorage|setRole|<select/)
  assert.match(readFileSync("src/lib/auth/gateway.ts", "utf8"), /\.getUser\(/)
  assert.doesNotMatch(readFileSync("src/lib/auth/gateway.ts", "utf8"), /\.getSession\(/)
})
