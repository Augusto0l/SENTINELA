import "../scripts/contracts-runtime.mjs"
import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createHash, randomUUID } from "node:crypto"
const { sandboxEditCommandSchema: edit, sandboxInactivationCommandSchema: inactivate, sandboxMutationRoleAllowed } = await import("../database/local/write-sandbox/mutation-contracts.ts")

test("sandbox HTTP handler fails closed outside the configured loopback origin", async () => {
  const { createSandboxWriteHandler } = await import("../database/local/write-sandbox/http.ts")
  assert.throws(() => createSandboxWriteHandler("http://example.test:3318", {}))
  const origin = "http://127.0.0.1:3318"
  const previous = { NODE_ENV: process.env.NODE_ENV, SENTINELA_SANDBOX_WRITE: process.env.SENTINELA_SANDBOX_WRITE }
  const handle = createSandboxWriteHandler(origin, {})
  const request = (host, site) => new Request(origin + "/api/v1/ocorrencias", {
    method: "POST", headers: { host, origin: site },
  })
  try {
    Object.assign(process.env, { NODE_ENV: "development", SENTINELA_SANDBOX_WRITE: "1" })
    assert.equal((await handle(request("127.0.0.1:3318", "http://localhost:3318"))).status, 403)
    assert.equal((await handle(request("localhost:3318", origin))).status, 403)
    assert.equal((await handle(request("127.0.0.1:3318", origin))).status, 401)
    process.env.NODE_ENV = "production"
    assert.equal((await handle(request("127.0.0.1:3318", origin))).status, 403)
  } finally {
    for (const [name, value] of Object.entries(previous))
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
  }
})

const command = () => ({ id: randomUUID(), payload: { versaoEsperada: "1", justificativa: "Ensaio exclusivamente sintético", alteracoes: { local: "Local sintético atualizado" } } })
test("sandbox mutation contracts: valid UUID, version, allowed fields and mandatory reasons", () => {
  edit.parse(command())
  inactivate.parse({ id: randomUUID(), payload: { versaoEsperada: "2", motivo: "Ensaio sintético" } })
  for (const id of ["", "invalid", 1, null]) assert(!edit.safeParse({ ...command(), id }).success)
  for (const versaoEsperada of [0, "0", "-1", "1.1", "9223372036854775808"]) {
    const c = command(); c.payload.versaoEsperada = versaoEsperada; assert(!edit.safeParse(c).success)
  }
  for (const justificativa of [undefined, "", "   "]) {
    const c = command(); c.payload.justificativa = justificativa; assert(!edit.safeParse(c).success)
    assert(!inactivate.safeParse({ id: randomUUID(), payload: { versaoEsperada: "1", motivo: justificativa } }).success)
  }
})
test("sandbox mutations reject actor, profile, police identity and state injection", () => {
  for (const key of ["ator", "perfil", "usuarioId", "id", "origem", "fonte", "numeroRegistro", "ativo", "consolidacaoStatus"]) {
    const c = command(); c.payload.alteracoes[key] = "forged"; assert(!edit.safeParse(c).success)
  }
  assert(!edit.safeParse({ ...command(), ator: randomUUID() }).success)
  assert(!inactivate.safeParse({ id: randomUUID(), payload: { versaoEsperada: "1", motivo: "teste", ativo: true } }).success)
  const c = command(); c.payload.alteracoes = {}; assert(!edit.safeParse(c).success)
})
test("sandbox edit rejects invalid dates, coordinates and duplicate nature links", () => {
  for (const alteracoes of [{ data: "2026-02-30" }, { horario: "24:00:00" }, { raId: "invalid" }, { coordenadas: null }, { coordenadas: { latitude: 91, longitude: 0 } }, { naturezas: [] }]) {
    const c = command(); c.payload.alteracoes = alteracoes; assert(!edit.safeParse(c).success)
  }
  const id = "abcdefab-abcd-4abc-8abc-abcdefabcdef"
  const c = command(); c.payload.alteracoes = { naturezas: [{ naturezaId: id, crimeTentado: null }, { naturezaId: id.toUpperCase(), crimeTentado: null }] }
  assert(!edit.safeParse(c).success)
  c.payload.alteracoes.naturezas[1].crimeTentado = true
  assert(edit.safeParse(c).success)
})
test("isolated mutations allow Administrator and Operator; Analyst and forged roles are denied", () => {
  assert(sandboxMutationRoleAllowed("Administrador"))
  assert(sandboxMutationRoleAllowed("Operador"))
  for (const role of ["Analista", "admin", null, undefined, { role: "Administrador" }]) assert(!sandboxMutationRoleAllowed(role))
})
test("mutation service refuses absent, forged and Analyst sessions before touching SQL", async () => {
  const { createSandboxRegistrar, SandboxError } = await import("../database/local/write-sandbox/service.ts")
  for (const [session, status] of [[null, 401], [{ kind: "sandbox-synthetic-only", role: "Analista" }, 403], [{ kind: "local", role: "Administrador" }, 403]]) {
    const service = createSandboxRegistrar({ manifest: "must-not-be-read", expectedUUID: randomUUID(), credentials: {} }, async () => session)
    try {
      await assert.rejects(service.edit("test", command()), e => e instanceof SandboxError && e.status === status)
      await assert.rejects(service.inactivate("test", { id: randomUUID(), payload: { versaoEsperada: "1", motivo: "test" } }), e => e instanceof SandboxError && e.status === status)
    } finally { await service.close() }
  }
})
test("experimental SQL keeps triggers, separates technical history and never physically deletes associations", async () => {
  const sql = await readFile(new URL("../database/local/write-sandbox/mutations.sql", import.meta.url), "utf8")
  assert.doesNotMatch(sql, /DISABLE\s+(?:TRIGGER|ROW)|DROP\s+TRIGGER|DELETE\s+FROM\s+sentinela\.ocorrencia_naturezas|CREATE\s+USER\b/i)
  assert.match(sql, /FOR UPDATE/)
  assert.match(sql, /old_row\.versao<>/)
  assert.match(sql, /current_user='sentinela_sbx_mutator' AND session_user IN \('sentinela_sbx_admin','sentinela_sbx_operator'\)/)
  assert.match(sql, /h\.before_row=old_row AND h\.after_row=new_row/)
  assert.match(sql, /REVOKE ALL ON FUNCTION sentinela_write_lab\.mutate\(uuid,jsonb,text\) FROM PUBLIC/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION sentinela_write_lab\.mutate\(uuid,jsonb,text\) TO sentinela_sbx_admin,sentinela_sbx_operator;/)
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION sentinela_write_lab\.mutate[^;]*TO[^;]*analyst/)
  const runner = await readFile(new URL("../database/local/write-sandbox/run-mutations.py", import.meta.url), "utf8")
  assert.doesNotMatch(runner, /operational_snapshot\s*\(|import complete_rls|['"]5432['"]|['"]sentinela_dev_operacional['"]/)
  assert.match(runner, /reference_file\.read_text/)
})
test("approved baseline has unconditional mutation lock and mandatory human correction history", async () => {
  const sql = (await readFile(new URL("../database/supabase/baseline/0001_modelo_inicial.sql", import.meta.url), "utf8")).replace(/\r\n/g, "\n")
  assert.equal(createHash("sha256").update(sql).digest("hex"), "01617b34fc5d2e90aaecf2060210f13b17bb9c63aac51fd7c0f5f8df97ba82bd")
  const body = sql.match(/CREATE FUNCTION sentinela\.bloquear_correcao_sem_backend\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/)?.[1]
  assert(body); assert.match(body, /BEGIN\s+RAISE EXCEPTION/); assert.match(body, /ERRCODE = '42501'/)
  for (const table of ["ocorrencias", "ocorrencia_naturezas"]) {
    assert(sql.includes(`CREATE TRIGGER escrita_correcao_bloqueada BEFORE UPDATE OR DELETE ON sentinela.${table}`))
  }
  assert.match(sql, /BEFORE INSERT ON sentinela\.historico_correcoes\s+FOR EACH STATEMENT EXECUTE FUNCTION sentinela\.bloquear_correcao_sem_backend/)
  const history = sql.match(/CREATE TABLE sentinela\.historico_correcoes \(([\s\S]*?)\n\);/)?.[1]
  assert.match(history, /responsavel_id uuid NOT NULL REFERENCES sentinela\.usuarios\(id\)/)
  assert.match(sql, /h\.transacao_id = pg_current_xact_id\(\) AND h\.versao_registro_anterior = OLD\.versao/)
  const associations = sql.match(/CREATE TABLE sentinela\.ocorrencia_naturezas \(([\s\S]*?)\n\);/)?.[1]
  assert(associations); assert.doesNotMatch(associations, /\bativo\b|\bexcluido_em\b/)
})
