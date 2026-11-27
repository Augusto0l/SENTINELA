import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { createHmac, randomBytes, randomUUID } from "node:crypto"
import { mkdirSync, mkdtempSync, realpathSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { Client } from "pg"
import { freePort, projectRoot } from "./http-validation-output.mjs"

// Run a pinned upstream Supabase Auth binary against disposable PostgreSQL.
// All account, signing and database values are synthetic and remain in this process.
const binary = resolve(process.env.SENTINELA_TEST_AUTH_BINARY ?? "tmp/auth-runtime/auth.exe")
const authMigrations = resolve(process.env.SENTINELA_TEST_AUTH_MIGRATIONS ?? "tmp/auth-runtime/source/migrations")
assert(existsSync(binary) && existsSync(authMigrations), "Prepare o binário Supabase Auth e as migrações da mesma release.")
const host = "127.0.0.1"
const authPort = 3357
const pgPort = 55517
const origin = `http://${host}:${authPort}`
await freePort(authPort)
await freePort(pgPort)
const tmp = join(projectRoot, "tmp")
mkdirSync(tmp, { recursive: true })
const dataDir = mkdtempSync(join(tmp, "usuarios-gotrue-"))
const pgBin = process.env.SENTINELA_BROWSER_PG_BIN ?? "C:/Program Files/PostgreSQL/17/bin"
const pg = name => join(pgBin, process.platform === "win32" ? `${name}.exe` : name)
const cleanEnv = Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => !/^(PG|GOTRUE_|SENTINELA_|SUPABASE_|DATABASE_URL|API_EXTERNAL_URL|DB_NAMESPACE|PORT$)/i.test(key)))
function run(command, args) {
  const result = spawnSync(command, args, { cwd: projectRoot, env: cleanEnv, timeout: 90_000, windowsHide: true, encoding: "utf8" })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
}
async function ready(check, detail) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await check()) return
    await delay(500)
  }
  assert.fail(detail())
}
const connect = user => new Client({ host, port: pgPort, user, database: "postgres", connectionTimeoutMillis: 2000 })
const secret = randomBytes(32).toString("hex")
const jwt64 = value => Buffer.from(JSON.stringify(value)).toString("base64url")
const adminClaims = { role: "service_role", exp: Math.floor(Date.now() / 1000) + 3600 }
const unsigned = `${jwt64({ alg: "HS256", typ: "JWT" })}.${jwt64(adminClaims)}`
const adminToken = `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`
const claims = token => JSON.parse(Buffer.from(token.split(".")[1], "base64url"))
async function auth(path, { method = "GET", token, data, status = 200 } = {}) {
  const response = await fetch(origin + path, { method, body: data ? JSON.stringify(data) : undefined,
    headers: { ...(token && { Authorization: `Bearer ${token}` }), "Content-Type": "application/json" },
    redirect: "error", signal: AbortSignal.timeout(10_000) })
  assert.equal(response.status, status, `${method} ${path}: ${await response.clone().text()}`)
  return status === 204 ? null : response.json()
}
const create = data => auth("/admin/users", { method: "POST", token: adminToken, data: { email_confirm: true, ...data } })
const login = (email, password) => auth("/token?grant_type=password", { method: "POST", data: { email, password } })
const password = () => `Auth-1!${randomBytes(18).toString("base64url")}`

run(pg("initdb"), ["-D", dataDir, "--username=bootstrap", "--auth=trust", "--encoding=UTF8", "--locale=C"])
const postgres = spawn(pg("postgres"), ["-D", dataDir, "-h", host, "-p", String(pgPort)], { env: cleanEnv, windowsHide: true })
let db, gotrue, attested = false
let pgLog = "", authLog = ""
postgres.stderr.on("data", chunk => { pgLog = (pgLog + chunk).slice(-6000) })
try {
  await ready(() => spawnSync(pg("pg_isready"), ["-q", "-h", host, "-p", String(pgPort), "-U", "bootstrap"],
    { windowsHide: true }).status === 0, () => pgLog)
  db = connect("bootstrap")
  await db.connect()
  const { rows: [identity] } = await db.query("SELECT current_setting('data_directory') AS dir, inet_server_port() AS port")
  assert.equal(realpathSync(identity.dir), realpathSync(dataDir))
  assert.equal(identity.port, pgPort)
  attested = true
  await db.query(`CREATE ROLE postgres LOGIN CREATEROLE BYPASSRLS;
    ALTER DATABASE postgres OWNER TO postgres;
    CREATE SCHEMA extensions AUTHORIZATION postgres;
    CREATE SCHEMA auth AUTHORIZATION postgres;
    CREATE EXTENSION postgis WITH SCHEMA extensions;
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    ALTER ROLE postgres SET search_path=auth,public;
    SET ROLE postgres;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb
    $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT (auth.jwt()->>'sub')::uuid
    $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    RESET ROLE;`)
  const authEnv = { ...cleanEnv, DATABASE_URL: `postgres://postgres@${host}:${pgPort}/postgres?sslmode=disable`,
    DB_NAMESPACE: "auth", GOTRUE_DB_DRIVER: "postgres", GOTRUE_DB_MIGRATIONS_PATH: authMigrations,
    GOTRUE_API_HOST: host, PORT: String(authPort), API_EXTERNAL_URL: origin, GOTRUE_SITE_URL: origin,
    GOTRUE_JWT_SECRET: secret, GOTRUE_JWT_EXP: "3600", GOTRUE_JWT_AUD: "authenticated",
    GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated", GOTRUE_JWT_ADMIN_ROLES: "service_role",
    GOTRUE_DISABLE_SIGNUP: "true", GOTRUE_EXTERNAL_EMAIL_ENABLED: "true", GOTRUE_MAILER_AUTOCONFIRM: "false" }
  gotrue = spawn(binary, [], { cwd: dataDir, env: authEnv, windowsHide: true })
  gotrue.on("error", error => { authLog += error.message })
  for (const stream of [gotrue.stdout, gotrue.stderr]) stream.on("data", chunk => { authLog = (authLog + chunk).slice(-8000) })
  await ready(async () => (await fetch(origin + "/health", { signal: AbortSignal.timeout(1000) }).catch(() => null))?.ok, () => authLog)
  const health = await auth("/health")
  const sqlFile = name => run(pg("psql"), ["-Xwq", "-h", host, "-p", String(pgPort), "-U", "postgres",
    "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", name])
  sqlFile("database/supabase/baseline/0001_modelo_inicial.sql")
  for (const name of ["0006_auth_vinculo_acesso", "0007_cadastro_institucional", "0008_exclusao_institucional",
    "0009_importador_papeis_ambiente", "0010_importador_objetos", "0011_central_revisao_hospedada"]) {
    sqlFile(`database/supabase/migrations/${name}.sql`)
  }
  const actorEmail = "admin-ensaio@example.com"
  const actorPassword = password()
  const admin = await create({ email: actorEmail, password: actorPassword })
  const adminId = randomUUID()
  await db.query("INSERT INTO sentinela.usuarios(id,auth_user_id,nome_exibicao,perfil,ativo) VALUES($1,$2,'Admin de ensaio','Administrador',true)",
    [adminId, admin.id])
  sqlFile("database/supabase/pendentes/0014_gestao_usuarios_institucionais.sql")
  const session = claims((await login(actorEmail, actorPassword)).access_token).session_id
  const requestId = randomUUID()
  const email = "pessoa-ensaio@example.com"
  const initial = password()
  const chosen = password()
  const profile = { name: "Pessoa de ensaio", email, orgao: "", perfil: "Operador", ativo: true }
  const scoped = connect("sentinela_local_admin")
  try {
    await scoped.connect()
    await scoped.query("SELECT set_config('sentinela.import_session',$1,false)", [session])
    assert.deepEqual((await scoped.query("SELECT sentinela_pessoas.preparar_cadastro($1,$2,$3,$4) AS data",
      [adminId, admin.id, requestId, profile])).rows[0].data, {})
    const account = await create({ email, password: initial,
      app_metadata: { sentinela_cadastro_solicitacao: requestId, sentinela_onboarding: "password" } })
    assert.equal(account.app_metadata.sentinela_onboarding, "password")
    const receipt = (await scoped.query("SELECT sentinela_pessoas.preparar_cadastro($1,$2,$3,$4) AS data",
      [adminId, admin.id, requestId, profile])).rows[0].data.record
    assert.equal(receipt.id, account.id)
    assert.equal(receipt.perfil, "Operador")
    assert.equal(receipt.firstAccessPending, true)
    const initialSession = (await login(email, initial)).access_token
    async function profileFor(token) {
      await db.query("BEGIN READ ONLY")
      try {
        await db.query("SET LOCAL ROLE authenticated")
        await db.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims(token))])
        return (await db.query("SELECT perfil FROM sentinela_api.meu_acesso()")).rows
      } finally { await db.query("ROLLBACK") }
    }
    assert.deepEqual(await profileFor(initialSession), [])
    await auth("/user", { method: "PUT", token: initialSession, data: { password: chosen } })
    await auth(`/admin/users/${account.id}`, { method: "PUT", token: adminToken,
      data: { app_metadata: { ...account.app_metadata, sentinela_onboarding: "complete" } } })
    await auth("/logout?scope=global", { method: "POST", token: initialSession, status: 204 })
    assert.deepEqual(await profileFor(initialSession), [])
    await auth("/token?grant_type=password", { method: "POST", data: { email, password: initial }, status: 400 })
    assert.deepEqual(await profileFor((await login(email, chosen)).access_token), [{ perfil: "Operador" }])
    console.log(JSON.stringify({ supabaseAuth: health.version, database: "PostgreSQL descartável em loopback",
      enrollment: true, initialPasswordBlocked: true, passwordChanged: true, liveSessionCheckedByDatabase: true }))
  } finally { await scoped.end() }
} finally {
  gotrue?.kill()
  await db?.end()
  if (postgres.exitCode === null && attested) run(pg("pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"])
  else if (postgres.exitCode === null) postgres.kill()
}
