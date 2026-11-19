import assert from "node:assert/strict"
import { createHash, randomBytes, randomUUID, scryptSync } from "node:crypto"
import { get } from "node:http"
import { createServer } from "node:net"
import { spawnSync } from "node:child_process"
import { open, readFile, realpath, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { assertOperationalRegions, safeError } from "../../../scripts/homologate-local-reader.mjs"
import { freePort, httpValidation } from "../../../scripts/http-validation-output.mjs"
import { persistentDestination, persistentWriters } from "../../../src/lib/db/config.ts"
import { attestMigration, connect, directory, install, readerPasswords } from "./install.mjs"
import { qualifiedWriterPasswords, resolveFixture } from "./install-crud.mjs"
import { approveSyntheticFixture, assertQualifiedPcdf, syntheticPcdfFixture } from "./install-pcdf.mjs"
import { completionQualified, parseXlsx, xlsxFixture, xlsxType } from "./install-completion.mjs"
import { completionRevision } from "./completion-sql.mjs"
import { chromium } from "playwright-core"

const origin = "http://127.0.0.1:3317"
const occurrences = "/api/v1/ocorrencias"
const regions = "/api/v1/catalogos/regioes-administrativas"
const missing = occurrences + "/ffffffff-ffff-4fff-8fff-ffffffffffff"
const id = randomUUID()
const validation = httpValidation(id, { evidence: directory })
const stopNext = validation.stop
const profiles = ["Administrador", "Operador", "Analista"]
let stage = "preflight"

async function accountsConfig(crud = false) {
  const root = join(process.env.USERPROFILE, ".sentinela-local", "sprint4-homologacao-persistente")
  assert.equal(await realpath(root), root)
  const fixture = join(root, "next-login-fixture.json")
  const accountsFile = join(root, crud ? "next-functional-accounts.json" : "next-accounts.json")
  const create = async (path, values) => {
    try { await writeFile(path, JSON.stringify(values), { flag: "wx", mode: 0o600 }) }
    catch (error) { if (error.code !== "EEXIST") throw error }
    assert.equal(await realpath(path), path)
  }
  await create(fixture, profiles.map((role, index) => ({
    role, email: `homologacao-${index + 1}@example.test`,
    password: randomBytes(32).toString("hex"), salt: randomBytes(16).toString("hex"),
  })))
  const accounts = JSON.parse(await readFile(fixture, "utf8"))
  assert(accounts.length === 3 && accounts.every((a, i) => a.role === profiles[i] &&
    a.email === `homologacao-${i + 1}@example.test` && /^[a-f0-9]{64}$/.test(a.password) && /^[a-f0-9]{32}$/.test(a.salt)))
  const hashed = { accounts: accounts.map(({ email, role, password, salt }) => ({
    email, role, salt, hash: scryptSync(password, Buffer.from(salt, "hex"), 64).toString("hex"),
    ...(crud && persistentWriters[role] && {subject:persistentWriters[role].subject}),
  })) }
  await create(accountsFile, hashed)
  assert(JSON.stringify(JSON.parse(await readFile(accountsFile, "utf8"))) === JSON.stringify(hashed))
  return { accounts, accountsFile }
}

async function startNext(accountsFile, run, crud = false, pcdf = false, ledger = []) {
  await freePort()
  const passwords = { ...await readerPasswords(), ...(crud && await qualifiedWriterPasswords()) }
  if (pcdf) await assertQualifiedPcdf()
  const completion = pcdf && ledger.includes(completionRevision) && await completionQualified()
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !/^(PG|SENTINELA_|SUPABASE_|NEXT_PUBLIC_SUPABASE_)/.test(key)))
  Object.assign(env, {
    NODE_ENV: "development", SENTINELA_AUTH_PROVIDER: "local",
    SENTINELA_APP_ORIGIN: origin, SENTINELA_LOCAL_ACCOUNTS_FILE: accountsFile,
    SENTINELA_HTTP_VALIDATION_ID: id, SENTINELA_PERSISTENT_HOMOLOGATION: "1",
    SENTINELA_PERSISTENT_CRUD: crud ? "1" : "",
    SENTINELA_PERSISTENT_PCDF: pcdf ? "1" : "",
    SENTINELA_PERSISTENT_PCDF_COMPLETION: completion ? "1" : "",
    SENTINELA_LOCAL_DEMO: "", SENTINELA_LOCAL_READER_URL: "", SENTINELA_DATABASE_URL: "",
    SENTINELA_SANDBOX_WRITE: "", SENTINELA_SANDBOX_PCDF: "",
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    SUPABASE_SECRET_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "",
  }, Object.fromEntries(Object.entries(passwords).map(([user, password]) => [`SENTINELA_PERSISTENT_PASSWORD_${user}`, password])))
  const log = await open(join(directory, `next-${id}-${run}.log`), "wx")
  let server
  try {
    server = validation.start(env, ["ignore", log.fd, log.fd])
  } finally { await log.close() }
  const deadline = Date.now() + 180000
  while (Date.now() < deadline && server.exitCode === null) {
    try {
      if ((await fetch(origin + "/login", { signal: AbortSignal.timeout(10000) })).ok) break
    } catch { /* Wait for the local compiler and listener. */ }
    await delay(500)
  }
  if (Date.now() >= deadline || server.exitCode !== null || server.signalCode !== null) throw Error("Next.js não ficou pronto")
  return validation.proveListener()
}

const fetchLocal = (path, cookie, init = {}) => fetch(origin + path, {
  ...init, headers: { ...(cookie && { cookie }), ...init.headers }, redirect: "manual", signal: AbortSignal.timeout(60000),
})
const login = ({ email, password }, requestOrigin = origin) => fetchLocal("/auth/login", null, {
  method: "POST", headers: { origin: requestOrigin, "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ email, password }),
})

async function reads(cookie, bindings) {
  const catalog = await fetchLocal(regions, cookie)
  assert.equal(catalog.status, 200)
  const body = await catalog.json()
  assert.equal(body.meta.execution.persisted, true)
  assertOperationalRegions(body.data.items, bindings)
  const list = await fetchLocal(occurrences, cookie)
  assert.equal(list.status, 200)
  const { data, meta } = await list.json()
  assert.equal(meta.execution.persisted, true)
  assert.deepEqual(data, { items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } })
  assert.equal((await fetchLocal(missing, cookie)).status, 404)
  const analytics = await fetchLocal("/api/v1/analytics/persistente", cookie)
  assert.equal(analytics.status, 200)
  const totals = (await analytics.json()).data
  assert.equal(totals.total, 0)
  assert.equal(totals.mapTotal, 0)
  assert.equal(totals.regions.length, 37)
  assert.deepEqual(totals.points, [])
}

function postgres(command) {
  const data = join(directory, "data")
  const args = command === "stop" ? ["-m", "fast", "-w", "stop"] : ["-l", join(directory, "postgres.log"), "-w", "start"]
  const result = spawnSync("C:/Program Files/PostgreSQL/17/bin/pg_ctl.exe", ["-D", data, "-t", "90", ...args],
    { timeout: 100000, windowsHide: true })
  assert.equal(result.status, 0, `pg_ctl ${command} falhou`)
}

async function ensurePostgres() {
  const data = join(directory,"data")
  assert.equal(await realpath(data),data)
  const bin = "C:/Program Files/PostgreSQL/17/bin"
  const native = (tool,args) => spawnSync(`${bin}/${tool}.exe`,args,{encoding:"utf8",timeout:15000,windowsHide:true})
  const status = native("pg_ctl",["-D",data,"status"])
  if (status.status === 0) return
  assert.equal(status.status,3,"Estado PostgreSQL não reconhecido")
  const control = native("pg_controldata",[data])
  assert.equal(control.status,0)
  assert.equal(control.stdout.match(/^Database system identifier:\s*(\d+)\s*$/m)?.[1],persistentDestination.system)
  for (const [key,value] of Object.entries({port:String(persistentDestination.port),
    listen_addresses:persistentDestination.host,cluster_name:persistentDestination.cluster})) {
    const config = native("postgres",["-D",data,"-C",key])
    assert.equal(config.status,0)
    assert.equal(config.stdout.trim(),value)
  }
  await new Promise((resolve,reject)=>{
    const probe=createServer()
    probe.once("error",reject)
    probe.listen({host:persistentDestination.host,port:persistentDestination.port,exclusive:true},()=>probe.close(resolve))
  })
  postgres("start")
}

async function qualify() {
  const before = await install()
  const { accounts, accountsFile } = await accountsConfig()
  const bindings = JSON.parse(await readFile(new URL("../../../public/data/cartography/ra-bindings.json", import.meta.url), "utf8"))
  const cookies = []
  let pgStopped = false
  try {
    stage = "next_start"
    const first = await startNext(accountsFile, "before")
    stage = "req_negadas"
    assert.equal((await fetchLocal(occurrences)).status, 401)
    assert.equal((await fetchLocal(regions, "sentinela-local-session=" + "0".repeat(64))).status, 401)
    assert.equal((await login(accounts[0], "http://localhost:3317")).status, 403)
    assert.equal(await new Promise((resolve, reject) => {
      get(origin + regions, { headers: { host: "localhost:3317" } }, response => {
        response.resume()
        resolve(response.statusCode)
      }).on("error", reject)
    }), 401)
    for (const account of accounts) {
      stage = `login_e_leitura_${account.role}`
      const response = await login(account)
      assert.equal(response.status, 303)
      assert.equal(response.headers.get("location"), origin + "/dashboard")
      const setCookie = response.headers.get("set-cookie")
      assert(setCookie?.includes("HttpOnly") && setCookie.includes("SameSite=Strict"))
      const cookie = setCookie.split(";")[0]
      cookies.push(cookie)
      await reads(cookie, bindings)
      for (const path of [occurrences, "/api/v1/importacoes/pcdf?competencia=2026-01"]) {
        assert.equal((await fetchLocal(path, cookie, { method: "POST", headers: { origin } })).status, 403)
      }
      assert.equal((await fetchLocal("/api/v1/central-revisao/ffffffff-ffff-4fff-8fff-ffffffffffff", cookie,
        { method: "PATCH", headers: { origin } })).status, 403)
    }
    stage = "reinicio_postgres"
    postgres("stop")
    pgStopped = true
    const unavailable = await fetchLocal(regions, cookies[0])
    assert.equal(unavailable.status, 503)
    safeError(await unavailable.json())
    postgres("start")
    pgStopped = false
    const after = await install()
    assert.deepEqual(after, before)
    stage = "reinicio_next"
    await stopNext()
    const second = await startNext(accountsFile, "after")
    assert.notEqual(second.start, first.start)
    for (const cookie of cookies) await reads(cookie, bindings)
    return { id, target: persistentDestination, regions: before.regions, catalogDigest: before.catalogDigest,
      profiles, checks: ["login_e_leitura", "ocorrencias_vazias_e_detalhe_404", "analytics_vazio", "sessoes_e_origem_negadas",
        "escrita_http_bloqueada", "postgres_parado_503_sem_fallback", "postgres_e_next_reiniciados", "sessoes_e_catalogo_preservados"] }
  } finally {
    try { if (pgStopped) postgres("start") }
    finally { await stopNext() }
  }
}

async function qualifyCrud(pcdf = false, xlsx = false) {
  const initial = await install()
  if (xlsx) assert(initial.ledger.includes(completionRevision) && await completionQualified(), "SQL XLSX e Central sem recibo")
  const { accounts, accountsFile } = await accountsConfig(true)
  const bindings = JSON.parse(await readFile(new URL("../../../public/data/cartography/ra-bindings.json", import.meta.url), "utf8"))
  const withAttestedDb = async read => {
    const db = connect("sprint4_migration",await readFile(join(directory,"migration.secret"),"utf8"))
    try { await db.connect(); await attestMigration(db); return await read(db) }
    finally { await db.end() }
  }
  const fixture = await withAttestedDb(resolveFixture)
  const original = { ...fixture, local:"Ocorrência sintética " + id, endereco:"Via sintética",bairroOuSetor:"Setor de ensaio" }
  const session = []
  let browser, stopped = false
  const send = (path,method,body,cookie,key = randomUUID()) => fetchLocal(path,cookie,{
    method,headers:{origin,"content-type":"application/json","idempotency-key":key},body:JSON.stringify(body),
  })
  const successful = async (response,status) => {
    assert.equal(typeof response.status==="function" ? response.status() : response.status,status)
    const result=await response.json()
    assert(result.success)
    return result.data
  }
  const snapshot = async cookie => {
    const list = await successful(await fetchLocal(occurrences,cookie),200)
    const analytics = await successful(await fetchLocal("/api/v1/analytics/persistente",cookie),200)
    assert.equal(list.pagination.total,analytics.total)
    assert.equal(analytics.total,analytics.mapTotal)
    return {list,analytics}
  }
  const inventory = ids => withAttestedDb(async db => {
    const {rows} = await db.query(`SELECT o.id,o.ativo,o.versao,
      (SELECT count(*)::int FROM sentinela_homolog_crud.occurrence_versions v WHERE v.occurrence_id=o.id) versions,
      (SELECT count(*)::int FROM sentinela_homolog_crud.mutation_history h WHERE h.occurrence_id=o.id) history,
      (SELECT count(*)::int FROM sentinela.eventos_auditoria a WHERE a.ocorrencia_id=o.id) audit
      FROM sentinela.ocorrencias o WHERE o.id=ANY($1) ORDER BY o.id`,[ids])
    return rows
  })
  try {
    stage = "crud_next"
    const first = await startNext(accountsFile,"crud-before",true,pcdf,initial.ledger)
    for (const account of accounts) {
      const response = await login(account)
      assert.equal(response.status,303)
      assert.equal(response.headers.get("location"),origin+"/dashboard")
      session.push(response.headers.get("set-cookie").split(";")[0])
      assertOperationalRegions((await successful(await fetchLocal(regions,session.at(-1)),200)).items,bindings)
    }
    const [admin,operator,analyst] = session
    assert.equal((await send(occurrences,"POST",original,null)).status,401)
    assert.equal((await send(occurrences,"POST",original,analyst)).status,403)
    assert.equal((await send(occurrences,"POST",{...original,role:"Administrador"},operator)).status,422)
    assert.equal((await send(occurrences,"POST",{...original,raId:randomUUID()},admin)).status,422)
    assert.equal((await send(occurrences,"POST",{...original,endereco:""},admin)).status,422)
    assert.equal((await send(occurrences,"POST",{...original,coordenadas:{latitude:0,longitude:0}},admin)).status,422)
    assert.equal((await send("/api/v1/central-revisao/"+randomUUID(),"PATCH",{},operator)).status,403)
    const initialSnapshot=await snapshot(admin)
    assert.equal(initialSnapshot.analytics.total,initial.active)

    stage = "crud_navegador"
    browser = await chromium.launch({channel:"msedge",headless:true})
    const context = await browser.newContext()
    await context.addCookies([{name:"sentinela-local-session",value:admin.split("=")[1],url:origin,httpOnly:true}])
    const page = await context.newPage()
    page.setDefaultTimeout(90000)
    await page.goto(origin+"/ocorrencias/nova")
    for (const [field,value] of Object.entries({data:original.data,horario:original.horario,local:original.local,
      endereco:original.endereco,bairro:original.bairroOuSetor,...original.coordenadas})) {
      await page.locator(`[name="${field}"]`).fill(String(value))
    }
    await page.locator('[name="ra"]').selectOption(original.raId)
    for (const nature of original.naturezas) await page.locator(`[value="${nature.naturezaId}"]`).check()
    const responsePromise = page.waitForResponse(r => r.url()===origin+occurrences && r.request().method()==="POST")
    await page.getByRole("button",{name:"Gravar ocorrência sintética"}).click()
    const response = await responsePromise
    const created=await successful(response,201)
    await page.getByText(/Registro sintético gravado/).waitFor()
    const request=response.request()
    assert.deepEqual(await successful(await send(occurrences,"POST",request.postDataJSON(),admin,
      request.headers()["idempotency-key"]),201),created)
    await page.goto(origin+"/ocorrencias")
    await page.getByRole("button",{name:created.id,exact:true}).click()
    await page.getByText(/Via sintética · Setor de ensaio/).waitFor()
    for (const route of ["/dashboard","/mapa-criminal"]) {
      const analysis=page.waitForResponse(r=>r.url().startsWith(origin+"/api/v1/analytics/persistente") && r.status()===200)
      await page.goto(origin+route)
      await analysis
    }
    if (!xlsx) { await browser.close(); browser = undefined }

    stage = "crud_mutacoes"
    const afterCreate=await snapshot(admin)
    assert.equal(afterCreate.analytics.total,initial.active+1)
    assert.equal(afterCreate.analytics.points.length,initialSnapshot.analytics.points.length+1)
    assert(afterCreate.analytics.points.some(point=>point.raCode==="RA-I"
      && point.latitude===original.coordenadas.latitude && point.longitude===original.coordenadas.longitude))
    const detail=await successful(await fetchLocal(occurrences+"/"+created.id,analyst),200)
    assert.equal(detail.naturezas.length,2)
    assert.equal(detail.ra.id,original.raId)
    const alteracoes={local:"Local sintético editado "+id,endereco:"Via sintética 2",bairroOuSetor:original.bairroOuSetor,
      naturezas:[original.naturezas[0]]}
    const body={alteracoes,justificativa:"Teste de edição com concorrência",versaoEsperada:"1"}
    const competing=await Promise.all([send(occurrences+"/"+created.id,"PATCH",body,operator),
      send(occurrences+"/"+created.id,"PATCH",body,admin)])
    assert.deepEqual(competing.map(r=>r.status).sort(),[200,409])
    assert.equal((await successful(competing.find(r=>r.status===200),200)).versao,"2")
    assert.equal((await successful(await fetchLocal(occurrences+"/"+created.id,analyst),200)).naturezas.length,1)
    const inactive=await successful(await send(occurrences+"/"+created.id+"/inativacao","POST",
      {versaoEsperada:"2",motivo:"Fim do ensaio"},operator),200)
    assert.equal(inactive.versao,"3")
    assert.equal((await fetchLocal(occurrences+"/"+created.id,analyst)).status,404)
    assert.equal((await snapshot(admin)).analytics.total,initial.active)
    const persisted=await successful(await send(occurrences,"POST",{...original,local:"Ocorrência sintética persistida "+id},operator),201)
    let pcdfProof
    if (pcdf) {
      stage = "pcdf_http"
      const workbook = xlsx ? xlsxFixture() : undefined
      const fixture = workbook ? parseXlsx(workbook) : syntheticPcdfFixture()
      const input = workbook ?? fixture.csv
      const importPath="/api/v1/importacoes/pcdf"
      const reviewPath="/api/v1/central-revisao"
      const upload=(data,cookie)=>fetchLocal(importPath+"?competencia=2026-01",cookie,{
        method:"POST",headers:{origin,"content-type":xlsx ? xlsxType : "text/csv"},body:data,
      })
      assert.equal((await upload(input,analyst)).status,403)
      assert.equal((await upload(Buffer.from("arquivo inválido"),operator)).status,422)
      let uploaded
      if (workbook) {
        const importContext=await browser.newContext({viewport:{width:390,height:844}})
        try {
          await importContext.addCookies([{name:"sentinela-local-session",value:operator.split("=")[1],url:origin,httpOnly:true}])
          const uploadPage=await importContext.newPage()
          uploadPage.setDefaultTimeout(90000)
          await uploadPage.goto(origin+"/importar")
          await uploadPage.getByLabel("Competência").fill("2026-01")
          await uploadPage.getByLabel("Arquivo CSV ou XLSX").setInputFiles({
            name:"invalido.xlsx",mimeType:xlsxType,buffer:Buffer.from("xlsx corrompido"),
          })
          await uploadPage.getByRole("button",{name:"Enviar arquivo"}).click()
          await uploadPage.getByText("O arquivo ou a correção foi recusado.").waitFor()
          await uploadPage.getByLabel("Arquivo CSV ou XLSX").setInputFiles({name:"sintetico.xlsx",mimeType:xlsxType,buffer:workbook})
          const receive=uploadPage.waitForResponse(r=>r.url().startsWith(origin+importPath+"?") && r.request().method()==="POST")
          await uploadPage.getByRole("button",{name:"Enviar arquivo"}).click()
          uploaded=await successful(await receive,201)
          await uploadPage.getByText(/2 linhas em staging/).waitFor()
        } finally { await importContext.close() }
      } else uploaded=await successful(await upload(input,operator),201)
      assert(uploaded.issues>=2)
      assert.deepEqual(await successful(await upload(input,operator),200),
        {replay:true,lot:uploaded.lot,run:uploaded.run})
      const issues=await withAttestedDb(async db=>(await db.query(`SELECT p.id FROM sentinela.pendencias_revisao p
        JOIN sentinela.linhas_staging s ON s.linha_origem_id=p.linha_origem_id
        WHERE s.execucao_id=$1 AND p.regra='horario_ausente_ou_invalido' ORDER BY p.id`,[uploaded.run])).rows)
      assert.equal(issues.length,2)
      const queue=await successful(await fetchLocal(reviewPath+"?tipo=datas_horarios&status=aberta",analyst),200)
      if (workbook) {
        const limited=reviewPath+"?tipo=datas_horarios&status=aberta&ordem=antigas&limite=1&q="+uploaded.lot
        const firstPage=await successful(await fetchLocal(limited+"&pagina=1",analyst),200)
        const secondPage=await successful(await fetchLocal(limited+"&pagina=2",analyst),200)
        assert(firstPage.hasMore && !secondPage.hasMore && firstPage.items[0].id!==secondPage.items[0].id)
        assert.equal(firstPage.items[0].lotId,uploaded.lot)
        await page.goto(origin+"/central-revisao")
        await page.getByLabel("Buscar pendência").fill("resultado-sintetico-inexistente-"+id)
        await page.getByRole("button",{name:"Aplicar filtros"}).click()
        await page.getByText("Nenhuma pendência no recorte.").waitFor()
        await page.getByLabel("Buscar pendência").fill(uploaded.lot)
        await page.getByLabel("Tipo").selectOption("datas_horarios")
        await page.getByRole("button",{name:"Aplicar filtros"}).click()
        await page.getByRole("button",{name:"Detalhar horario"}).first().click()
        await page.getByText(uploaded.lot,{exact:true}).waitFor()
        const routes=["/dashboard","/mapa-criminal","/ocorrencias","/ocorrencias/nova","/importar",
          "/central-revisao","/usuarios","/configuracoes"]
        stage="telas_no_navegador"
        for (const width of [1280,390]) {
          const audit=await browser.newContext({viewport:{width,height:844}})
          try {
            await audit.addCookies([{name:"sentinela-local-session",value:admin.split("=")[1],url:origin,httpOnly:true}])
            for (const route of routes) {
              const view=await audit.newPage()
              try {
                view.setDefaultTimeout(90000)
                const response=await view.goto(origin+route)
                assert.equal(response.status(),200,route)
                assert.equal(new URL(response.url()).pathname,route)
                const main=view.locator("#main-content")
                await main.waitFor()
                assert((await main.boundingBox()).width<=width+1,route)
              } finally { await view.close() }
            }
          } finally { await audit.close() }
        }
        const publicPage=await browser.newPage({viewport:{width:390,height:844}})
        try {
          const loginPage=await publicPage.goto(origin+"/login")
          assert.equal(loginPage.status(),200)
          assert(await publicPage.locator('input[type="password"]').isVisible())
        } finally { await publicPage.close() }
        await browser.close(); browser=undefined
        stage="pcdf_http"
      }
      const correction={versaoEsperada:"1",decisao:"resolvida",valor:"12:34:56",justificativa:"Revisão sintética"}
      for (const issue of issues) {
        assert(queue.some(row=>row.id===issue.id && row.original===""))
        const path=reviewPath+"/"+issue.id
        assert.equal((await send(path,"PATCH",correction,operator)).status,403)
        const result=await successful(await send(path,"PATCH",correction,admin),200)
        assert.equal(result.history.author,persistentWriters.Administrador.subject)
        assert.equal(result.original,"")
      }
      const promote=()=>send(importPath+"/"+uploaded.run+"/consolidacao","POST",{},operator)
      const beforePromotion=await snapshot(admin)
      assert.equal((await successful(await promote(),200)).occurrencesCreated,0)
      await approveSyntheticFixture(uploaded.run,fixture)
      const promotion=await successful(await promote(),200)
      assert.equal(promotion.occurrencesCreated,1)
      assert.equal(promotion.associationsCreated,2)
      assert.equal((await successful(await promote(),200)).occurrencesCreated,0)
      const afterPromotion=await snapshot(analyst)
      assert.equal(afterPromotion.analytics.total,beforePromotion.analytics.total+1)
      assert.equal(afterPromotion.analytics.points.length,beforePromotion.analytics.points.length)
      const { rows:[record] }=await withAttestedDb(db=>db.query(`SELECT min(o.id::text) AS occurrence,
        count(DISTINCT o.id)::int AS principals,count(a.id)::int AS links,
        bool_and(o.geometria IS NULL AND o.ra_id IS NULL) AS no_point FROM sentinela.ocorrencias o
        JOIN sentinela.ocorrencia_naturezas a ON a.ocorrencia_id=o.id
        JOIN sentinela.linhas_staging s ON s.linha_origem_id=a.linha_origem_id WHERE s.execucao_id=$1`,[uploaded.run]))
      assert.deepEqual({principals:record.principals,links:record.links,no_point:record.no_point},{principals:1,links:2,no_point:true})
      const archiveSha=workbook && createHash("sha256").update(workbook).digest("hex")
      if (workbook) await withAttestedDb(async db=>{
        const {rows:[row]}=await db.query(`SELECT count(*)::int AS originals FROM sentinela_homolog_pcdf.xlsx_originals
          WHERE lot_id=$1 AND sha256=$2 AND content=$3`,[uploaded.lot,archiveSha,workbook])
        assert.equal(row.originals,1)
      })
      pcdfProof={run:uploaded.run,lot:uploaded.lot,issues:issues.map(issue=>issue.id),occurrence:record.occurrence,
        ...(workbook && {format:"XLSX",views:17,archiveSha})}
    }
    const expected=await install()
    const before=await inventory([created.id,persisted.id])
    assert.equal(before.length,2)
    assert.deepEqual(before.find(row=>row.id===created.id),
      {id:created.id,ativo:false,versao:"3",versions:3,history:2,audit:1})
    assert.deepEqual(before.find(row=>row.id===persisted.id),
      {id:persisted.id,ativo:true,versao:"1",versions:1,history:0,audit:1})

    stage = "crud_reinicio"
    postgres("stop"); stopped = true
    assert.equal((await fetchLocal(occurrences,admin)).status,503)
    postgres("start"); stopped = false
    assert.deepEqual(await install(),expected)
    await stopNext()
    const second=await startNext(accountsFile,"crud-after",true,pcdf,expected.ledger)
    assert.notEqual(first.start,second.start)
    const final = await snapshot(analyst)
    assert.equal(final.analytics.total,initial.active+1+(pcdf ? 1 : 0))
    assert(final.list.items.some(row=>row.id===persisted.id && row.versao==="1"))
    assert.deepEqual(await inventory([created.id,persisted.id]),before)
    if (pcdfProof) {
      const detail=await successful(await fetchLocal(occurrences+"/"+pcdfProof.occurrence,analyst),200)
      assert.equal(detail.naturezas.length,2)
      assert.equal(detail.ra,null)
      const resolved=await successful(await fetchLocal("/api/v1/central-revisao?status=resolvida",analyst),200)
      assert(pcdfProof.issues.every(issue=>resolved.some(row=>row.id===issue && row.occurrenceId===pcdfProof.occurrence)))
      if (pcdfProof.archiveSha) await withAttestedDb(async db=>{
        const {rows:[row]}=await db.query(`SELECT count(*)::int AS originals FROM sentinela_homolog_pcdf.xlsx_originals
          WHERE lot_id=$1 AND sha256=$2 AND sha256=encode(sha256(content),'hex')`,[pcdfProof.lot,pcdfProof.archiveSha])
        assert.equal(row.originals,1)
      })
    }
    return {id,target:persistentDestination,ledger:expected.ledger,regions:expected.regions,occurrences:before,
      totalAtivo:final.analytics.total,pcdf:pcdfProof,checks:["perfis","rbac","cadastro no navegador","dashboard e mapa no navegador",
        "edicao concorrente","inativacao","idempotencia","contagem","reinicio","uuid e auditoria"]}
  } finally {
    try { await browser?.close(); if (stopped) postgres("start") }
    finally { await stopNext() }
  }
}

try {
  assert.equal(process.argv.length, 3)
  const flag = process.argv[2]
  assert(["--qualify", "--serve", "--qualify-crud", "--serve-crud", "--qualify-functional", "--serve-functional",
    "--qualify-completion"].includes(flag))
  try {
    await validation.prepare()
    if (flag.startsWith("--serve")) {
      await ensurePostgres()
      const {ledger}=await install()
      const crud = flag !== "--serve"
      await startNext((await accountsConfig(crud)).accountsFile, "serve", crud, flag === "--serve-functional",ledger)
      console.log(`Next.js disponível em ${origin}`)
      const onSignal = () => { void stopNext().catch(() => { process.exitCode = 1 }) }
      process.once("SIGINT", onSignal)
      process.once("SIGTERM", onSignal)
      try { await validation.waitForExit() }
      finally {
        process.off("SIGINT", onSignal)
        process.off("SIGTERM", onSignal)
      }
    } else {
      const report = JSON.stringify(flag === "--qualify" ? await qualify()
        : await qualifyCrud(flag!=="--qualify-crud",flag==="--qualify-completion"))
      await writeFile(join(directory, `http-${id}.json`), report + "\n", { flag: "wx" })
      console.log(report)
    }
  } finally {
    await validation.finish()
  }
} catch (error) {
  console.error(`Qualificação interrompida em ${stage} (${error.code ?? error.name}, execução ${id}).`)
  console.error(error.stack.split("\n").find(line => line.includes("qualify.mjs:")))
  process.exitCode = 1
}
