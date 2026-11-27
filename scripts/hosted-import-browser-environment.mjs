import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync, realpathSync } from "node:fs"
import { createServer } from "node:https"
import { Socket } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { Client } from "pg"
import { freePort, httpValidationId, projectRoot } from "./http-validation-output.mjs"

// The test starts a new cluster in a randomly named directory. All writes are local.
export async function withHostedImportEnvironment(test, { operational = false, review = false } = {}) {
  const ref = operational ? "sentinelafixture0000" : "sentinelafixture"
  const project = `https://${ref}.supabase.co`
  const fixtureHost = `db.${ref}.supabase.co`
  const authAdminKey = "sb_secret_" + randomBytes(32).toString("hex")
  const appPort = 3320
  const pgPort = 55498
  await freePort(appPort)
  await freePort(pgPort)
  const origin = `https://localhost:${appPort}`
  assert.match(process.env.SENTINELA_HTTP_VALIDATION_ID ?? "", httpValidationId)
  const directory = mkdtempSync(join(tmpdir(), "sentinela-import-edge-"))
  const data = join(directory, "data")
  const pgBin = process.env.SENTINELA_BROWSER_PG_BIN ?? "C:/Program Files/PostgreSQL/17/bin"
  const openssl = process.env.SENTINELA_BROWSER_OPENSSL ?? "C:/Program Files/Git/mingw64/bin/openssl.exe"
  const postgisVersion = process.env.SENTINELA_BROWSER_POSTGIS_VERSION
  for (const key of Object.keys(process.env)) {
    if (/^(?:PG|SENTINELA_)|SUPABASE/.test(key) && key !== "SENTINELA_HTTP_VALIDATION_ID") process.env[key] = ""
  }
  Object.assign(process.env, {
    NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", SENTINELA_APP_ORIGIN: origin,
    SENTINELA_AUTH_PROVIDER: "supabase", SENTINELA_IMPORT_MODE: "supabase", SENTINELA_SUPABASE_IMPORT_WRITE: "1",
    SENTINELA_SUPABASE_OPERATIONAL_WRITE: operational ? "1" : "0",
    SENTINELA_USERS_AUTH_KEY: operational ? authAdminKey : "",
    NEXT_PUBLIC_SUPABASE_URL: project, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_fixture",
    SENTINELA_LOCAL_DEMO: "0", SENTINELA_DATABASE_URL: "", SENTINELA_DATABASE_SSLROOTCERT: "",
    SENTINELA_LOCAL_ACCOUNTS_FILE: "", SENTINELA_MANUAL_GEOCODER_URL: "",
  })

  const pg = name => join(pgBin, process.platform === "win32" ? name + ".exe" : name)
  function run(command, args, quiet = false) {
    const result = spawnSync(command, args, { windowsHide: true, encoding: "utf8", timeout: 90_000 })
    assert.equal(result.status, 0, result.error?.message ?? result.stderr)
    if (!quiet) process.stdout.write(result.stdout)
  }
  run(pg("initdb"), ["-D", data, "--username=bootstrap", "--auth=trust", "--encoding=UTF8", "--locale=C"], true)
  const cert = join(data, "server.crt")
  const key = join(data, "server.key")
  run(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert,
    "-days", "2", "-subj", `/CN=${fixtureHost}`, "-addext", `subjectAltName=DNS:${fixtureHost},DNS:localhost`,
    "-addext", "basicConstraints=critical,CA:TRUE"], true)
  writeFileSync(join(data, "pg_hba.conf"),
    "host postgres bootstrap 127.0.0.1/32 trust\n" +
    "host postgres postgres 127.0.0.1/32 trust\n" +
    "hostssl postgres sentinela_local_admin,sentinela_local_operator,sentinela_local_analyst 127.0.0.1/32 scram-sha-256\n")

  const postgres = spawn(pg("postgres"), ["-D", data, "-h", "127.0.0.1", "-p", String(pgPort), "-c", "ssl=on"],
    { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] })
  let pgLog = ""
  postgres.stderr.on("data", chunk => { pgLog = (pgLog + chunk.toString()).slice(-8000) })
  const dbConfig = { host: "127.0.0.1", port: pgPort, user: "bootstrap", database: "postgres", ssl: false, connectionTimeoutMillis: 2500 }
  let db, server, next, attested = false
  const fetchOriginal = globalThis.fetch
  const connect = Socket.prototype.connect
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      const ready = spawnSync(pg("pg_isready"), ["-q", "-h", "127.0.0.1", "-p", String(pgPort), "-U", "bootstrap"], { windowsHide: true })
      if (ready.status === 0) break
      assert.equal(postgres.exitCode, null, pgLog)
      assert(attempt < 59, pgLog)
      await delay(350)
    }
    db = new Client(dbConfig)
    await db.connect()
    const sql = async (statement, params) => (await db.query(statement, params)).rows[0]?.data
    const identity = await sql("SELECT jsonb_build_array(current_setting('data_directory'),inet_server_port(),current_setting('ssl')) AS data")
    assert.deepEqual([realpathSync(identity[0]), ...identity.slice(1)], [realpathSync(data), pgPort, "on"])
    attested = true
    run("python", ["-B", "database/supabase/tests/run_import_local.py", "--psql", pg("psql"), "--port", String(pgPort),
      "--data-directory", data, "--install-only", ...(operational ? ["--before-importer"] : []),
      ...(postgisVersion ? ["--postgis-version", postgisVersion] : [])])
    const ca = readFileSync(cert, "utf8")
    process.env.SENTINELA_SUPABASE_IMPORT_CA = ca
    const actors = ["Administrador", "Operador", "Analista"].map((role, index) => ({
      role, id: randomUUID(), session: randomUUID(), login: "sentinela_local_" + ["admin", "operator", "analyst"][index],
      email: `ensaio-${index}@example.test`, password: randomBytes(24).toString("hex"),
    }))
    for (const actor of actors) {
      actor.authId = operational ? randomUUID() : actor.id
      await sql("INSERT INTO auth.users (id,email,raw_app_meta_data) VALUES ($1,$2,'{}')", [actor.authId, actor.email])
      await sql("INSERT INTO sentinela.usuarios(id,auth_user_id,nome_exibicao,perfil,ativo) VALUES ($1,$2,$3::text,$3::text,true)", [actor.id, actor.authId, actor.role])
      await sql("INSERT INTO auth.sessions(id,user_id) VALUES ($1,$2)", [actor.session, actor.authId])
    }
    if (operational) {
      await sql(`INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,justificativa)
        VALUES ('servico','fixture-anterior','fixture.anterior','Auditoria sintética anterior à migração')`)
      const snapshot = () => sql(`SELECT jsonb_build_array(
        (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM auth.users a),
        (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM auth.sessions s),
        (SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM sentinela.usuarios u),
        (SELECT jsonb_agg(to_jsonb(p) ORDER BY perfil,acao) FROM sentinela.perfil_permissoes p),
        (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM sentinela.eventos_auditoria e)) AS data`)
      const before = await snapshot()
      function runSqlAs(user, path) {
        run(pg("psql"), ["-Xw", "-h", "127.0.0.1", "-p", String(pgPort), "-U", user,
          "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", path], true)
      }
      runSqlAs("postgres", "database/supabase/migrations/0009_importador_papeis_ambiente.sql")
      runSqlAs("postgres", "database/supabase/migrations/0010_importador_objetos.sql")
      assert.deepEqual(await snapshot(), before)
      runSqlAs("bootstrap", "database/supabase/tests/import_security.sql")
      console.log("OK 0009/0010 incrementais, RLS/ACLs e preservação de vínculos, sessões e auditoria preexistentes")
      if (review) {
        runSqlAs("postgres", "database/supabase/migrations/0011_central_revisao_hospedada.sql")
        assert.deepEqual(await snapshot(), before)
      }
    }
    process.env.SENTINELA_SUPABASE_IMPORT_INSTALLATION = await sql("SELECT sentinela_ambiente.instalacao() AS data")
    for (const actor of actors) {
      if (!operational && actor.role === "Analista") continue
      if (actor.role !== "Analista")
        await sql("INSERT INTO sentinela_general_accounts.individuals VALUES ($1,$2)", [actor.login, actor.id])
      const password = randomBytes(32).toString("hex")
      await sql(`ALTER ROLE ${actor.login} PASSWORD '${password}'`)
      process.env["SENTINELA_SUPABASE_IMPORT_URL_" + actor.login] =
        `postgresql://${actor.login}:${password}@${fixtureHost}:5432/postgres`
    }
    const admin = actors[0]
    const account = createHash("sha256").update(JSON.stringify(["sentinela-supabase", project, admin.authId])).digest("hex")
    await sql(`INSERT INTO sentinela_gestao_autorizacao.release
      VALUES (true,'local-import-management-0001',repeat('a',64),
        sentinela_ambiente.instalacao(),sentinela_ambiente.sistema(),5432,true)`)
    await sql("INSERT INTO sentinela_gestao_autorizacao.atores VALUES ($1,$2,$3,now()+interval '1 hour')", [admin.id, admin.authId, account])

    Socket.prototype.connect = function (...args) {
      return args[0] === 5432 && args[1] === fixtureHost
        ? connect.call(this, pgPort, "127.0.0.1") : connect.apply(this, args)
    }
    const tokens = new Map()
    let authDeletionFailure = false
    const sign = randomBytes(32)
    const json64 = value => Buffer.from(JSON.stringify(value)).toString("base64url")
    const user = actor => ({ id: actor.authId, email: actor.email, aud: "authenticated", role: "authenticated",
      app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" })
    const authIdentity = id => sql(`SELECT jsonb_build_object('id',id,'email',email,'aud','authenticated','role','authenticated',
      'app_metadata',raw_app_meta_data,'user_metadata','{}'::jsonb,'created_at','2026-01-01T00:00:00Z') AS data FROM auth.users WHERE id=$1`, [id])
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input)
      if (url.origin === origin) return fetchOriginal(input, init)
      assert.equal(url.origin, project, "Destino de rede fora do ensaio")
      const request = new Request(input, init)
      if (operational && request.headers.get("apikey") === authAdminKey) {
        const match = /^\/auth\/v1\/admin\/users(?:\/([0-9a-f-]{36}))?$/.exec(url.pathname)
        const id = match?.[1]
        if (match && !id && request.method === "POST") {
          const { email, app_metadata } = await request.json()
          const created = randomUUID()
          await sql("INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES ($1,$2,$3)", [created, email, app_metadata])
          return Response.json(await authIdentity(created))
        }
        if (id) {
          const previous = await authIdentity(id)
          if (!previous) return Response.json({ code: "user_not_found", msg: "Conta sintética ausente" }, { status: 404 })
          if (request.method === "GET") return Response.json(previous)
          if (request.method === "PUT") {
            const { app_metadata } = await request.json()
            await sql("UPDATE auth.users SET raw_app_meta_data=$2 WHERE id=$1", [id, app_metadata])
            return Response.json(await authIdentity(id))
          }
          if (request.method === "DELETE") {
            if (authDeletionFailure) {
              authDeletionFailure = false
              return Response.json({ code: "unexpected_failure", msg: "Falha sintética" }, { status: 500 })
            }
            await sql("DELETE FROM auth.users WHERE id=$1", [id])
            return Response.json(previous)
          }
        }
        if (url.pathname === "/rest/v1/rpc/consultar_cadastro" || url.pathname === "/rest/v1/rpc/bloquear_exclusao_usuario") {
          const payload = await request.json()
          const rpc = new Client(dbConfig)
          await rpc.connect()
          try {
            await rpc.query("BEGIN")
            await rpc.query("SET LOCAL ROLE service_role")
            const result = url.pathname.endsWith("/consultar_cadastro")
              ? await rpc.query("SELECT sentinela_api.consultar_cadastro($1,$2) AS data", [payload.email, payload.cadastro])
              : await rpc.query("SELECT sentinela_api.bloquear_exclusao_usuario($1,$2,$3,$4,$5) AS data",
                [payload.ator, payload.identidade, payload.alvo, payload.vinculo, payload.email])
            await rpc.query("COMMIT")
            return result.rows[0].data === "" ? new Response(null, { status: 204 }) : Response.json(result.rows[0].data)
          } catch (error) {
            return Response.json({ code: error.code, message: error.message }, { status: 400 })
          } finally { await rpc.end() }
        }
        throw new Error("Operação administrativa fora do Auth sintético: " + url.pathname)
      }
      if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
        const { email, password } = await request.json()
        const actor = actors.find(value => value.email === email && value.password === password)
        if (!actor) return Response.json({ msg: "invalid credentials", code: "invalid_credentials" }, { status: 400 })
        const iat = Math.floor(Date.now() / 1000)
        const claims = { sub: actor.authId, session_id: actor.session, iat, exp: iat + 3600,
          aud: "authenticated", role: "authenticated", app_metadata: {} }
        const unsigned = json64({ alg: "HS256", typ: "JWT" }) + "." + json64(claims)
        const access_token = unsigned + "." + createHmac("sha256", sign).update(unsigned).digest("base64url")
        tokens.set(access_token, { actor, claims })
        return Response.json({ access_token, refresh_token: randomUUID(), token_type: "bearer",
          expires_in: 3600, expires_at: claims.exp, user: user(actor) })
      }
      if (url.pathname === "/auth/v1/.well-known/jwks.json") return Response.json({ keys: [] })
      const session = tokens.get(request.headers.get("authorization")?.replace(/^Bearer /i, ""))
      if (!session) return Response.json({ msg: "invalid session", code: "session_not_found" }, { status: 401 })
      if (url.pathname === "/auth/v1/user") return Response.json(user(session.actor))
      if (url.pathname === "/rest/v1/rpc/meu_acesso") {
        const rpc = new Client(dbConfig)
        await rpc.connect()
        try {
          await rpc.query("BEGIN READ ONLY")
          await rpc.query("SET LOCAL ROLE authenticated")
          await rpc.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify(session.claims)])
          return Response.json((await rpc.query("SELECT * FROM sentinela_api.meu_acesso()")).rows)
        } finally { await rpc.end() }
      }
      throw new Error("Caminho do Auth sintético inesperado: " + url.pathname)
    }

    const { default: createNext } = await import("next")
    server = createServer({ cert: ca, key: readFileSync(key) })
    next = createNext({ dev: false, dir: projectRoot, hostname: "localhost", port: appPort, httpServer: server })
    await next.prepare()
    const handle = next.getRequestHandler()
    server.on("request", (request, response) => {
      request.headers["x-forwarded-proto"] = "https"
      void handle(request, response)
    })
    await new Promise((resolve, reject) => {
      server.once("error", reject)
      server.listen(appPort, "127.0.0.1", resolve)
    })
    async function withActor(actor, callback) {
      const config = new URL(process.env["SENTINELA_SUPABASE_IMPORT_URL_" + actor.login])
      const client = new Client({ host: fixtureHost, port: 5432, database: "postgres", user: actor.login,
        password: config.password, ssl: { ca, rejectUnauthorized: true, servername: fixtureHost } })
      await client.connect()
      try {
        await client.query("BEGIN")
        await client.query("SELECT set_config('sentinela.import_session',$1,true)", [actor.session])
        return await callback(client)
      } finally {
        await client.query("ROLLBACK").catch(() => {})
        await client.end()
      }
    }
    await test({ origin, project, actors, sql, withActor, failNextAuthDeletion: () => { authDeletionFailure = true } })
  } finally {
    try {
      if (server?.listening) {
        server.closeAllConnections()
        await new Promise(resolve => server.close(resolve))
      }
      await next?.close()
      await db?.end()
    } finally {
      globalThis.fetch = fetchOriginal
      Socket.prototype.connect = connect
      if (postgres.exitCode === null && attested) run(pg("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], true)
      else if (postgres.exitCode === null) postgres.kill()
    }
  }
}
