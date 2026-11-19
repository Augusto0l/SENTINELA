// Real native SQL connections only to the disposable cluster. No .env/admin login.
import "../../../scripts/contracts-runtime.mjs"
import assert from "node:assert/strict"
import { randomUUID, randomBytes } from "node:crypto"
import { createServer } from "node:http"
import { Readable } from "node:stream"
import { Pool } from "pg"
const { createSandboxRegistrar, SandboxError } = await import("./service.ts")
const { createSandboxWriteHandler } = await import("./http.ts")
let input = ""; for await (const chunk of process.stdin) input += chunk
const { config, analyst, subjects } = JSON.parse(input); input = ""
const sessions = new Map(["Administrador", "Operador", "Analista"].map(role => [randomBytes(32).toString("hex"), { kind: "sandbox-synthetic-only", role }]))
const token = role => [...sessions].find(([, s]) => s.role === role)[0]
const service = createSandboxRegistrar(config, async t => sessions.get(t) ?? null)
const checks = [], pools = []
function pool(user, password) {
  const p = new Pool({ host: "127.0.0.1", port: 55432, database: "sentinela_rls_sandbox", user, password,
    max: 1, ssl: false, connectionTimeoutMillis: 2500, statement_timeout: 5000 })
  p.on("error", () => {}); pools.push(p); return p
}
const admin = pool(config.credentials.Administrador.user, config.credentials.Administrador.password)
const operator = pool(config.credentials.Operador.user, config.credentials.Operador.password)
const observer = pool("sentinela_sbx_analyst", analyst)
const id = i => `51000000-0000-4000-8000-00000000000${i}`
const nature = (i, crimeTentado = null) => ({ naturezaId: `31000000-0000-4000-8000-00000000000${i}`, crimeTentado })
const edit = (i, version = "1", alteracoes = { local: "Local SINTETICO atualizado" }, justificativa = "Ensaio tecnico sintetico") => ({ id: id(i), payload: { versaoEsperada: version, justificativa, alteracoes } })
const inactive = (i, version = "1", motivo = "Inativacao exclusivamente sintetica") => ({ id: id(i), payload: { versaoEsperada: version, motivo } })
const inspect = async i => (await admin.query("SELECT sentinela_write_lab.inspect($1::uuid) AS result", [id(i)])).rows[0].result
let stage = "identity", result, server
function pass(name) { checks.push({ name, result: "PASS" }) }
async function reject(name, fn, status) { stage = name; await assert.rejects(fn, e => e instanceof SandboxError && e.status === status); pass(name) }
async function denied(p, sql, args = []) { await assert.rejects(p.query(sql, args), e => e.code === "42501") }
try {
  for (const p of [admin, operator, observer]) {
    const { rows: [r] } = await p.query(`SELECT current_database() AS db,host(inet_server_addr()) AS host,inet_server_port() AS port,current_user AS actor,
      rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit AS elevated,
      EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) AS member,
      EXISTS(SELECT FROM pg_class WHERE relowner=r.oid) AS owner FROM pg_roles r WHERE rolname=current_user`)
    assert.equal(r.db, "sentinela_rls_sandbox"); assert.equal(r.host, "127.0.0.1"); assert.equal(r.port, 55432)
    assert.equal(r.elevated, false); assert.equal(r.member, false); assert.equal(r.owner, false)
  }
  pass("three_direct_scram_logins_restricted_and_isolated")
  await reject("Analista_edit_denied_service", () => service.edit(token("Analista"), edit(1)), 403)
  await reject("Analista_inactivate_denied_service", () => service.inactivate(token("Analista"), inactive(2)), 403)
  for (const [operation, command] of [["edit", edit(1)], ["inactivate", inactive(2)]]) {
    await denied(observer, "SELECT sentinela_write_lab.mutate($1::uuid,$2::jsonb,$3::text)", [command.id, JSON.stringify(command.payload), operation])
  }
  pass("Analista_mutation_denied_sql")
  await denied(operator, "UPDATE sentinela.ocorrencias SET ativo=false WHERE id=$1", [id(1)])
  await denied(operator, "SELECT sentinela_write_lab.inspect($1::uuid)", [id(1)])
  await denied(operator, "SET ROLE sentinela_sbx_admin")
  await reject("operator_cannot_edit_review_occurrence", () => service.edit(token("Operador"), edit(3)), 422)
  await reject("absent_session", () => service.edit(undefined, edit(1)), 401)
  await reject("forged_session", () => service.inactivate("forged", inactive(2)), 401)
  stage = "successful_edit"
  const initial = await inspect(1)
  const first = await service.edit(token("Administrador"), edit(1, "1", {
    data: "2026-11-12", horario: "13:14:15", raId: "11000000-0000-4000-8000-000000000001",
    local: "Local SINTETICO com todos os campos", coordenadas: { latitude: -15.8, longitude: -47.9 }, naturezas: [nature(1), nature(2)] }))
  assert.equal(first.data.versao, "2"); assert(first.persisted); assert.equal(first.data.atorSintetico, "sentinela_sbx_admin")
  let actual = await inspect(1)
  assert.equal(actual.links.length, 2); assert.equal(actual.history.length, 1)
  const h = actual.history[0]
  assert.deepEqual(h.before_row, initial.row); assert.deepEqual(h.after_row, actual.row)
  assert.deepEqual(h.before_links, initial.links); assert.deepEqual(h.after_links, actual.links)
  assert.equal(h.actor, "sentinela_sbx_admin"); assert.equal(h.operation, "edit"); assert(h.recorded_at); assert(h.tx)
  assert.equal(h.old_version, 1); assert.equal(h.new_version, 2); assert(h.changed_fields.includes("naturezas")); assert(h.reason)
  pass("administrator_edit_all_fields_native_actor_versions_exact_history_and_nature_addition")
  stage = "nature_replacement"
  await service.edit(token("Administrador"), edit(1, "2", { naturezas: [nature(2, true)] }))
  actual = await inspect(1)
  assert.equal(actual.row.versao, 3); assert.equal(actual.links.length, 1); assert.equal(actual.allLinks.length, 3)
  assert.equal(actual.links[0].crime_tentado, true); assert.equal(actual.history.length, 2)
  assert(actual.allLinks.some(a => a.id === initial.links[0].id)); pass("nature_replacement_and_retirement_preserve_original_rows_and_history")
  await service.edit(token("Administrador"), edit(1, "3", { naturezas: [nature(1)] }))
  actual = await inspect(1); assert.equal(actual.links.length, 1); assert.equal(actual.allLinks.length, 4)
  assert.notEqual(actual.links[0].id, initial.links[0].id); pass("readding_retired_pair_creates_new_identity_without_resurrection")
  await reject("stale_version", () => service.edit(token("Administrador"), edit(1, "1")), 409)
  await reject("in_review", () => service.edit(token("Administrador"), edit(3)), 422)
  await reject("inactive_edit", () => service.edit(token("Administrador"), edit(4)), 422)
  await reject("in_review_inactivation", () => service.inactivate(token("Administrador"), inactive(3)), 422)
  await reject("nonexistent_uuid", () => service.edit(token("Administrador"), { ...edit(1), id: randomUUID() }), 404)
  await reject("invalid_uuid", () => service.edit(token("Administrador"), { ...edit(1), id: "bad" }), 422)
  for (const alteracoes of [{ ativo: false }, { origem: "importacao" }, { numeroRegistro: "x" }, { ator: randomUUID() }, { naturezas: [] }, { coordenadas: null }, { data: "2026-02-30" }, { horario: "24:00:00" }])
    await reject("strict_input_" + Object.keys(alteracoes)[0], () => service.edit(token("Administrador"), edit(5, "1", alteracoes)), 422)
  await reject("missing_reason", () => service.edit(token("Administrador"), edit(5, "1", { local: "Outro local" }, "")), 422)
  await reject("missing_inactivation_reason", () => service.inactivate(token("Administrador"), inactive(2, "1", "")), 422)
  for (const alteracoes of [{ raId: randomUUID() }, { coordenadas: { latitude: -20, longitude: -50 } }])
    await reject("invalid_reference_or_boundary", () => service.edit(token("Administrador"), edit(5, "1", alteracoes)), 422)
  stage = "rollback_associations"
  const beforeFailure = await inspect(5)
  const mismatched = createSandboxRegistrar(config, async () => ({
    kind: "sandbox-synthetic-only", role: "Operador", subject: subjects[0],
  }))
  try {
    await reject("cross_profile_subject_binding_denied", () => mismatched.edit(undefined, edit(5), {
      address: "Via sintética", district: "Setor sintético",
    }), 403)
    assert.deepEqual(await inspect(5), beforeFailure)
    pass("individual_binding_failure_rolls_back_mutation")
  } finally {
    await mismatched.close()
  }
  await reject("rollback_after_parent_retirements_and_first_new_association", () => service.edit(token("Administrador"), edit(5, "1", {
    local: "Should not survive rollback", naturezas: [nature(2, false), { naturezaId: randomUUID(), crimeTentado: null }] })), 422)
  assert.deepEqual(await inspect(5), beforeFailure); pass("rollback_parent_links_history_and_version_confirmed")
  await reject("rollback_audit_constraint_failure", () => service.edit(token("Administrador"), edit(5, "1", { local: "Should not survive audit failure" }, "SYNTHETIC_AUDIT_FAILURE")), 422)
  assert.deepEqual(await inspect(5), beforeFailure); pass("audit_failure_rollback_confirmed")
  stage = "rollback_after_function"
  await admin.query("BEGIN")
  try {
    await admin.query("SELECT sentinela_write_lab.mutate($1::uuid,$2::jsonb,'edit')", [id(5), JSON.stringify(edit(5).payload)])
    await assert.rejects(admin.query("SELECT 1/0"), e => e.code === "22012")
  } finally { await admin.query("ROLLBACK") }
  assert.deepEqual(await inspect(5), beforeFailure); pass("caller_failure_after_audit_rolls_back_all_effects")
  stage = "concurrency"
  const concurrent = await Promise.allSettled([
    service.edit(token("Administrador"), edit(6, "1", { local: "Concurrent synthetic edit A" })),
    service.edit(token("Administrador"), edit(6, "1", { local: "Concurrent synthetic edit B" })),
  ])
  assert.equal(concurrent.filter(x => x.status === "fulfilled").length, 1)
  const conflict = concurrent.find(x => x.status === "rejected"); assert.equal(conflict.reason.status, 409)
  const winner = await inspect(6); assert.equal(winner.row.versao, 2); assert.equal(winner.history.length, 1)
  pass("two_concurrent_versions_exactly_one_commit_one_conflict_no_lost_update")
  stage = "inactivation"
  const beforeInactive = await inspect(2)
  await service.inactivate(token("Administrador"), inactive(2))
  const afterInactive = await inspect(2)
  assert.equal(afterInactive.row.ativo, false); assert.equal(afterInactive.row.versao, 2)
  assert.deepEqual(afterInactive.links, beforeInactive.links); assert.equal(afterInactive.history[0].operation, "inactivate")
  assert.deepEqual(afterInactive.history[0].changed_fields, ["ativo"])
  await reject("repeated_inactivation", () => service.inactivate(token("Administrador"), inactive(2, "2")), 422)
  await reject("reactivation_forbidden", () => service.edit(token("Administrador"), edit(2, "2", { ativo: true })), 422)
  pass("logical_inactivation_keeps_data_and_associations_with_single_version_increment")
  stage = "injection"
  const literal = "'; UPDATE sentinela.usuarios SET ativo=true; --"
  await service.edit(token("Administrador"), edit(5, "1", { local: literal }))
  assert.equal((await inspect(5)).row.local, literal); pass("sql_injection_stored_only_as_literal")
  // Close runtime pools before SQL probes: never raise connection limits for tests.
  await service.close()
  stage = "direct_security"
  for (const p of [admin, operator, observer]) {
    for (const sql of ["UPDATE sentinela.ocorrencias SET ativo=false WHERE false", "DELETE FROM sentinela.ocorrencias WHERE false",
      "UPDATE sentinela.ocorrencia_naturezas SET crime_tentado=true WHERE false", "SELECT * FROM sentinela_write_lab.mutation_context",
      "SELECT * FROM sentinela_write_lab.mutation_history", "SELECT * FROM sentinela.usuarios",
      "INSERT INTO sentinela_write_lab.mutation_history(id) SELECT gen_random_uuid() WHERE false",
      "SET ROLE sentinela_sbx_mutator", "CREATE TEMP TABLE forbidden_synthetic_probe(id int)"]) await denied(p, sql)
  }
  pass("native_roles_cannot_dml_forge_history_set_owner_or_create_temp")
  const mutate = (p, payload) => p.query("SELECT sentinela_write_lab.mutate($1::uuid,$2::jsonb,'edit')", [id(5), JSON.stringify(payload)])
  for (const payload of [{ ...edit(5, "2").payload, actor: "postgres" }, edit(5, "2", { ativo: true }).payload, edit(5, "2", { local: null }).payload])
    await assert.rejects(mutate(admin, payload), e => ["22023", "23514"].includes(e.code))
  pass("direct_sql_revalidates_fields_and_actor_without_trusting_zod")
  const operatorConnection = await operator.connect()
  try {
    await operatorConnection.query("BEGIN")
    await operatorConnection.query("SET LOCAL app.perfil='Administrador'")
    await denied(operatorConnection, "SET ROLE sentinela_sbx_admin")
  } finally {
    await operatorConnection.query("ROLLBACK")
    operatorConnection.release()
  }
  pass("client_guc_cannot_promote_operator")
  await admin.query("SET row_security=off")
  await assert.rejects(mutate(admin, edit(5, "2").payload), e => e.code === "42501")
  await admin.query("SET row_security=on"); pass("force_rls_cannot_be_disabled_by_runtime")
  stage = "loopback_http"
  let handle, origin
  server=createServer((req,res)=>{
    void handle(new Request(origin+req.url,{method:req.method,headers:req.headers,
      body:req.method==="GET"?undefined:Readable.toWeb(req),duplex:"half"})).then(async response=>{
      res.writeHead(response.status,Object.fromEntries(response.headers))
      res.end(await response.text())
    }).catch(()=>res.writeHead(503).end())
  })
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)})
  origin="http://127.0.0.1:"+server.address().port
  handle=createSandboxWriteHandler(origin,service)
  const root="/api/v1/ocorrencias"
  const post=(path,role,body,{method="POST",website=origin,key=randomUUID(),type="application/json"}={})=>fetch(origin+path,{
    method,headers:{origin:website,"content-type":type,"idempotency-key":key,
      ...(role?{authorization:"Bearer "+token(role)}:{})},body:typeof body==="string"?body:JSON.stringify(body),
  })
  const payload={data:"2026-11-11",horario:"12:34:56",raId:"11000000-0000-4000-8000-000000000001",local:"Endereço sintético HTTP",
    bairroOuSetor:"Setor sintético",coordenadas:{latitude:-15.79,longitude:-47.88},naturezas:[nature(1),nature(2)]}
  assert.equal((await post(root,null,payload)).status,401)
  assert.equal((await post(root,"Analista",payload)).status,403)
  assert.equal((await post(root,"Administrador",payload,{website:"http://localhost:9"})).status,403)
  assert.equal((await post(root,"Administrador",payload,{type:"text/plain"})).status,415)
  assert.equal((await post(root,"Administrador","{")).status,400)
  assert.equal((await post(root,"Administrador"," ".repeat(33000))).status,413)
  assert.equal((await post(root,"Administrador",{...payload,bairroOuSetor:" "})).status,422)
  assert.equal((await post(root,"Administrador",{...payload,coordenadas:{latitude:-20,longitude:-50}})).status,422)
  const key=randomUUID()
  const created=await post(root,"Operador",payload,{key})
  assert.equal(created.status,201)
  const body=await created.json()
  assert.equal(body.scope,"sandbox-synthetic-only")
  assert.equal(body.data.naturezas.length,2)
  assert.deepEqual(await (await post(root,"Operador",payload,{key})).json(),body)
  assert.equal((await admin.query("SELECT sentinela_write_lab.inspect($1::uuid) AS result",[body.data.id])).rows[0].result.row.local,
    payload.local+" — "+payload.bairroOuSetor)
  const change=edit(5,"2",{local:"Endereço editado via HTTP"}).payload
  change.alteracoes.bairroOuSetor="Setor sintético"
  assert.equal((await post(root+"/"+id(5),"Analista",change,{method:"PATCH"})).status,403)
  assert.equal((await post(root+"/"+id(5),"Operador",{...change,ator:"sentinela_sbx_admin"},{method:"PATCH"})).status,422)
  const changed=await post(root+"/"+id(5),"Operador",change,{method:"PATCH"})
  assert.equal(changed.status,200)
  assert.equal((await changed.json()).data.atorSintetico,"sentinela_sbx_operator")
  assert.equal((await post(root+"/"+id(5),"Administrador",change,{method:"PATCH"})).status,409)
  const disable=inactive(5,"3").payload
  assert.equal((await post(root+"/"+id(5)+"/inativacao","Analista",disable)).status,403)
  const disabled=await post(root+"/"+id(5)+"/inativacao","Operador",disable)
  assert.equal(disabled.status,200)
  assert.equal((await disabled.json()).data.atorSintetico,"sentinela_sbx_operator")
  const history=await inspect(5)
  assert.equal(history.row.ativo,false)
  assert.equal(history.history.length,3)
  assert.deepEqual(history.history.slice(-2).map(row=>row.actor),["sentinela_sbx_operator","sentinela_sbx_operator"])
  pass("loopback_http_create_edit_inactivate_authorization_idempotency_and_native_history")
  const wrong = createSandboxRegistrar({ ...config, credentials: { ...config.credentials, Administrador: { user: "sentinela_sbx_admin", password: randomBytes(32).toString("hex") } } }, async () => ({ kind: "sandbox-synthetic-only", role: "Administrador" }))
  await reject("connection_failure_sanitized", () => wrong.edit("test", edit(5, "2")), 503); await wrong.close()
  const original = process.env.NODE_ENV; process.env.NODE_ENV = "production"
  await reject("production_disabled", () => service.edit(token("Administrador"), edit(5, "2")), 403); process.env.NODE_ENV = original
  sessions.delete(token("Administrador")); await reject("revoked_session", () => service.edit("revoked", edit(5, "2")), 401)
  result = { result: "PASS", sqlReal: true, actorKind: "synthetic-service-not-human", checks }
} catch (error) {
  result = { result: "FAIL", stage, sqlReal: true, checks, status: error instanceof SandboxError ? error.status : undefined,
    sqlState: error.sqlState ?? (/^[0-9A-Z]{5}$/.test(error.code ?? "") ? error.code : undefined),
    assertionCode: error.code === "ERR_ASSERTION" ? error.code : undefined }
} finally {
  if(server?.listening)await new Promise(resolve=>server.close(resolve))
  await service.close(); await Promise.all(pools.map(p => p.end()))
}
process.stdout.write(JSON.stringify(result)); if (result.result !== "PASS") process.exitCode = 1
