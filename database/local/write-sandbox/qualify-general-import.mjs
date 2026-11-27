import "../../../scripts/contracts-runtime.mjs"
import assert from "node:assert/strict"
import { createHash, randomBytes, randomUUID, scryptSync } from "node:crypto"
import { dirname, join } from "node:path"
import { writeFile, unlink } from "node:fs/promises"
import { setTimeout as delay } from "node:timers/promises"
import { chromium } from "playwright-core"
import { Client } from "pg"
import { utils, write } from "xlsx"
import { freePort, httpValidation } from "../../../scripts/http-validation-output.mjs"
const { generalInput, prepareGeneralImport } = await import("../../../src/lib/db/general-import-input.ts")

const input = []
for await (const chunk of process.stdin) input.push(chunk)
const { config, analyst, subjects } = JSON.parse(Buffer.concat(input).toString("utf8"))
const origin = "http://127.0.0.1:3317"
const path = "/api/v1/importacoes/geral"
const password = randomBytes(32).toString("hex")
const roles = ["Administrador", "Operador", "Analista"]
const accounts = roles.map((role, i) => {
  const salt = randomBytes(16).toString("hex")
  return { role, salt, subject: subjects[i], email: "general-" + i + "@example.test",
    hash: scryptSync(password, Buffer.from(salt,"hex"),64).toString("hex") }
})
const accountsFile = join(dirname(config.manifest), "next-accounts.json")
const env = { ...process.env, NODE_ENV: "development", SENTINELA_AUTH_PROVIDER: "local",
  SENTINELA_APP_ORIGIN: origin, SENTINELA_LOCAL_ACCOUNTS_FILE: accountsFile, SENTINELA_SANDBOX_WRITE: "1",
  SENTINELA_SANDBOX_GENERAL_IMPORT: "1", SENTINELA_SANDBOX_WRITE_ID: config.expectedUUID,
  SENTINELA_SANDBOX_PCDF: "", SENTINELA_PERSISTENT_HOMOLOGATION: "", SENTINELA_LOCAL_READER_URL: "", SENTINELA_DATABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "",
  SENTINELA_SANDBOX_ADMIN_PASSWORD: config.credentials.Administrador.password,
  SENTINELA_SANDBOX_OPERATOR_PASSWORD: config.credentials.Operador.password, SENTINELA_SANDBOX_ANALYST_PASSWORD: analyst }
const sessions = [], checks = []
let lifecycle, browser, browserPage, ownedAccounts = false
let stage = "preflight"

async function start() {
  await freePort()
  const id = randomUUID()
  lifecycle = httpValidation(id)
  await lifecycle.prepare()
  const child = lifecycle.start({ ...env, SENTINELA_HTTP_VALIDATION_ID: id }, "ignore")
  const deadline = Date.now() + 150000
  while (child.exitCode === null && Date.now() < deadline) {
    const res = await fetch(origin + "/login", {signal:AbortSignal.timeout(5000)}).catch(() => null)
    if (res?.status === 200) { lifecycle.proveListener(); return }
    await delay(500)
  }
  throw Error("Next local não ficou pronto")
}

const get = (url,cookie) => fetch(origin + url,{headers:{cookie},signal:AbortSignal.timeout(70000)})
async function signIn(i) {
  const r = await fetch(origin + "/auth/login",{method:"POST",redirect:"manual",headers:{origin,"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({email:accounts[i].email,password}),signal:AbortSignal.timeout(70000)})
  assert.equal(r.status,303)
  const cookie = r.headers.get("set-cookie")?.split(";")[0]
  const token = cookie?.split("=")[1]
  assert.match(token,/^[a-f0-9]{64}$/)
  sessions.push(join(dirname(accountsFile),"sentinela-sessions",createHash("sha256").update(token).digest("hex") + ".json"))
  return {cookie,token}
}
const csvType="text/csv", xlsxType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const csv = Buffer.from("\ufeff\r\nData do fato;Horário;Tipo de crime;RA;Logradouro alternativo;Nota\r\n2026-01-12;12:10;Furto;Plano Piloto;Via sintética 42;00021\r\n2026-01-12;12:10;Furto;Plano Piloto;Via sintética 42;00022\r\n2026-01-13;12:10;Furto;Plano Piloto;;\"Texto; com acento\r\ne quebra\"\r\n")
const book=utils.book_new()
utils.book_append_sheet(book,utils.aoa_to_sheet([["Somente instruções"]]),"Instruções")
utils.book_append_sheet(book,utils.aoa_to_sheet([["Data","Hora","Natureza","RA","Local","Nota"],
  [new Date(2026,1,1,12),0.5,"Furto","Plano Piloto","Via sintética XLSX","00031"],
  [new Date(2026,1,2,12),0.5,"Furto","Plano Piloto","Via sintética XLSX",null]], {cellDates:false}),"Dados")
const workbook=write(book,{type:"buffer",bookType:"xlsx",compression:true})
const mapping={data:0,horario:1,naturezas:2,ra:3,local:4,latitude:-1,longitude:-1}
const selection={name:"geral.csv",sheet:"CSV",delimiter:";",mapping}
const upload=(data,cookie,{meta=selection,site=origin,key=randomUUID(),mime=csvType}={})=>
  fetch(origin + path,{method:"POST",headers:{origin:site,"content-type":mime,"idempotency-key":key,
    "x-sentinela-import":encodeURIComponent(JSON.stringify(meta)),...(cookie && {cookie})},body:data,signal:AbortSignal.timeout(85000)})

async function selectFile(page,file) {
  await page.getByRole("navigation",{name:"Área de importação"}).getByRole("button",{name:"Nova importação"}).click()
  await page.getByLabel("Arquivo CSV ou XLSX",{exact:true}).setInputFiles(file)
}

async function browserUpload(page,file,expected,mapManually=false,sheet) {
  await selectFile(page,file)
  if (sheet) {
    await page.getByLabel("Planilha").selectOption(sheet)
    await page.getByRole("button",{name:"Validar arquivo",exact:true}).waitFor()
  }
  if (mapManually) await page.getByLabel("Local/endereço *",{exact:true}).selectOption("4")
  await page.getByRole("button",{name:"Validar arquivo",exact:true}).click()
  await page.getByRole("button",{name:"Revisar registros",exact:true}).click()
  await page.getByRole("button",{name:"Revisar confirmação"}).click()
  const post = page.waitForResponse(r => r.url() === origin + path && r.request().method()==="POST",{timeout:85000})
  await page.getByRole("button",{name:"Confirmar importação",exact:true}).click()
  const response=await post
  const payload=await response.json()
  assert.equal(response.status(),expected,JSON.stringify(payload.error ?? {}))
  await page.getByRole("heading",{name:expected===200 ? "Arquivo já recebido" : "Gravação confirmada"}).waitFor()
  return payload.data
}

try {
  await writeFile(accountsFile,JSON.stringify({accounts}),{flag:"wx"})
  ownedAccounts=true
  await start()
  stage="login_and_denials"
  const [admin,operator,viewer]=await Promise.all([0,1,2].map(signIn))
  assert.equal((await upload(csv)).status,401)
  assert.equal((await upload(csv,viewer.cookie)).status,403)
  assert.equal((await get(path,viewer.cookie)).status,403)
  assert.equal((await upload(csv,operator.cookie,{site:"https://example.test"})).status,403)
  assert.equal((await upload(csv,operator.cookie,{meta:{...selection,mapping:{...mapping,ra:0}}})).status,422)
  assert.equal((await upload(csv,operator.cookie,{meta:{...selection,name:"pcdf_naturezas_2021-01.csv"}})).status,422)
  assert.equal((await upload(Buffer.from("Data;linha_origem_id\n2026-01-01;teste"),operator.cookie)).status,422)
  assert.equal((await upload(Buffer.from("invalid"),operator.cookie,{mime:xlsxType,meta:{name:"bad.xlsx",sheet:"Dados",mapping}})).status,422)
  assert.equal((await upload(Buffer.alloc(8*1024*1024+1),operator.cookie)).status,413)
  checks.push("autenticacao_perfil_origem_formato_tamanho_e_bloqueio_pcdf")

  stage="browser_csv"
  browser=await chromium.launch({channel:"msedge",headless:true})
  const context=await browser.newContext({viewport:{width:390,height:844}})
  await context.route(/^https:\/\//, route=>route.abort())
  await context.addCookies([{name:"sentinela-local-session",value:operator.token,url:origin,httpOnly:true}])
  const page=await context.newPage()
  browserPage=page
  page.setDefaultTimeout(70000)
  await page.goto(origin + "/importar",{waitUntil:"networkidle",timeout:90000})
  const file={name:"geral.csv",mimeType:csvType,buffer:csv}
  await selectFile(page,file)
  await page.getByText("Mapeamento de colunas",{exact:true}).waitFor()
  await page.getByRole("button",{name:"Remover seleção"}).click()
  assert.equal((await (await get(path,operator.cookie)).json()).data.length,0)
  const first=await browserUpload(page,file,201,true)
  assert.equal(first.persisted,3)
  assert.equal(first.summary.possibleDuplicates,1)
  assert.equal(first.summary.invalid,1)
  const width=await page.evaluate(()=>({view:innerWidth,body:document.documentElement.scrollWidth}))
  assert(width.body<=width.view)
  const persisted = await get(path+"/"+first.run+"?pagina=1",operator.cookie)
  const persistedBody = await persisted.json()
  assert.equal(persisted.status,200,JSON.stringify(persistedBody.error ?? {}))
  assert.equal(persistedBody.data.rows.length,3)
  await page.reload({waitUntil:"networkidle",timeout:90000})
  const detailResponse = page.waitForResponse(r=>r.url()===origin+path+"/"+first.run+"?pagina=1",{timeout:70000})
  await page.getByRole("button",{name:"Histórico",exact:true}).click()
  await page.getByRole("button",{name:"Ver detalhes de geral.csv",exact:true}).click()
  await page.getByRole("button",{name:"Abrir registros importados"}).click()
  assert.equal((await detailResponse).status(),200)
  await page.getByRole("region",{name:"Registros gerais gravados"}).waitFor()
  await page.locator("summary").filter({hasText:/^Registro 3 ·/}).click()
  await page.getByText("00021",{exact:true}).waitFor()
  await page.keyboard.press("Escape")
  checks.push("csv_preview_manual_cancel_commit_refresh_detalhe_mobile")

  stage="browser_xlsx_replay"
  await page.setViewportSize({width:1440,height:900})
  const second=await browserUpload(page,{name:"geral.xlsx",mimeType:xlsxType,buffer:workbook},201,false,"Dados")
  assert.equal(second.persisted,2)
  assert.equal(second.summary.invalid,0)
  const replay=await browserUpload(page,{...file,name:"renomeado.csv"},200,true)
  assert.equal(replay.lot,first.lot)
  const repeat=await browserUpload(page,{name:"geral.xlsx",mimeType:xlsxType,buffer:workbook},200,false,"Dados")
  assert.equal(repeat.run,second.run)
  checks.push("xlsx_planilhas_datas_reenvio_csv_renomeado")
  await browser.close()
  browser=undefined
  browserPage=undefined

  stage="volume_concurrent_review"
  const rows=Array.from({length:2500},(_,i)=>"2026-03-01;12:05;Furto;Plano Piloto;Via sintética "+i+";"+String(i).padStart(6,"0"))
  const large=Buffer.from("Data;Hora;Natureza;RA;Local;Nota\n"+rows.join("\n"))
  const concurrent=await Promise.all([upload(large,operator.cookie),upload(large,admin.cookie)])
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,201])
  const receipts=await Promise.all(concurrent.map(async r=>(await r.json()).data))
  assert.equal(receipts[0].lot,receipts[1].lot)
  assert.equal(receipts[0].persisted,2500)
  const key=randomUUID()
  const changed={...selection,mapping:{...mapping,local:5}}
  assert.equal((await upload(csv,operator.cookie,{key,meta:changed})).status,409)
  assert.equal((await upload(csv,operator.cookie,{key})).status,409)
  const review=path+"/revisao?pagina=1&tipo=endereco_ra"
  const issues=(await (await get(review,viewer.cookie)).json()).data.items
  const issue=issues.find(item=>item.lotId===first.lot && item.field==="local")
  assert(issue)
  const decide=cookie=>fetch(origin+path+"/revisao/"+issue.id,{method:"PATCH",headers:{cookie,origin,"content-type":"application/json"},
    body:JSON.stringify({decisao:"resolvida",valor:"Local sintético revisado",justificativa:"Conferência restrita",versaoEsperada:"1"}),
    signal:AbortSignal.timeout(70000)})
  assert.equal((await decide(operator.cookie)).status,403)
  const decided=await decide(admin.cookie)
  const result=await decided.json()
  assert.equal(decided.status,200,JSON.stringify(result.error ?? {}))
  assert.equal(result.data.history.author,subjects[0])
  const client=new Client({ ...config.credentials.Operador, host:"127.0.0.1",port:55432,database:"sentinela_rls_sandbox",connectionTimeoutMillis:3000 })
  await client.connect()
  const retryData=Buffer.from("Data;Hora;Natureza;RA;Local;Nota\n2026-03-01;12:05;Furto;Plano Piloto;Via de retentativa;Teste")
  try {
    await assert.rejects(client.query("INSERT INTO sentinela.linhas_staging DEFAULT VALUES"), {code:"42501"})
    await assert.rejects(client.query("SELECT sentinela_import_lab.check_actor($1,false)",[subjects[1]]), {code:"42501"})
    const inputHeaders={"x-sentinela-import":encodeURIComponent(JSON.stringify(selection))}
    const prepared=await prepareGeneralImport(retryData,generalInput(new Request(origin,{headers:inputHeaders}),csvType))
    const failureKey=randomUUID(), actor=subjects[1]
    const bad={rows:prepared.rows,summary:{...prepared.summary,issues:prepared.summary.issues+1}}
    const begin="SELECT sentinela_import_lab.begin_request($1,$2,$3,$4,$5)"
    await assert.rejects(client.query(begin,[actor,failureKey,prepared.metadata,Buffer.from("outro"),bad]),{code:"22023"})
    await client.query(begin,[actor,failureKey,prepared.metadata,retryData,bad])
    await client.query("BEGIN")
    await assert.rejects(client.query("SELECT sentinela_import_lab.receive($1,$2,$3)",[actor,failureKey,bad]),{code:"23514"})
    await client.query("ROLLBACK")
    await client.query("SELECT sentinela_import_lab.fail($1,$2)",[actor,failureKey])
    const failures=(await (await get(path,operator.cookie)).json()).data
    assert(failures.some(item=>item.request===failureKey && item.status==="falhou" && item.receipt===null))
  } finally { await client.end() }
  const retry=await upload(retryData,operator.cookie)
  assert.equal(retry.status,201)
  assert.equal((await retry.json()).data.persisted,1)
  checks.push("volume_2500_concorrencia_conflito_revisao_rbac_e_escrita_direta_negada")
  checks.push("rollback_apos_escrita_parcial_e_retentativa")

  stage="restart"
  await lifecycle.finish()
  lifecycle=undefined
  await start()
  const history=(await (await get(path,operator.cookie)).json()).data
  assert(history.some(item=>item.receipt?.run===first.run))
  assert(history.some(item=>item.receipt?.run===second.run))
  const detail=(await (await get(path+"/"+first.run,operator.cookie)).json()).data
  assert.equal(detail.rows[0].cells[5].value,"00021")
  assert.equal(detail.rows[2].cells[4].value,"")
  const restarted=await chromium.launch({channel:"msedge",headless:true})
  browser=restarted
  const restartedContext=await restarted.newContext({viewport:{width:768,height:900}})
  await restartedContext.route(/^https:\/\//, route=>route.abort())
  await restartedContext.addCookies([{name:"sentinela-local-session",value:operator.token,url:origin,httpOnly:true}])
  const reopened=await restartedContext.newPage()
  await reopened.goto(origin+"/importar",{waitUntil:"networkidle",timeout:90000})
  await reopened.getByRole("button",{name:"Histórico",exact:true}).click()
  await reopened.getByRole("heading",{name:"Histórico de importações"}).waitFor({timeout:70000})
  const originalRow=reopened.getByRole("row").filter({
    has:reopened.locator('td[data-label="Persistidos"]').filter({hasText:/^3$/}),
  }).filter({has:reopened.getByRole("button",{name:"Ver detalhes de geral.csv",exact:true})})
  await originalRow.getByRole("button",{name:"Ver detalhes de geral.csv",exact:true}).click()
  await reopened.getByRole("dialog").getByText(first.run,{exact:true}).waitFor({timeout:70000})
  checks.push("reinicio_next_historico_e_originais_recuperados")
  console.log(JSON.stringify({result:"PASS",checks,runs:[first.run,second.run,receipts[0].run],rows:2506}))
} catch (error) {
  const alerts=browserPage ? await browserPage.getByRole("alert").allTextContents().catch(()=>[]) : []
  console.log(JSON.stringify({result:"FAIL",stage,error:error.name,message:String(error.message).split("\n").slice(0,8).join(" "),alerts}))
  process.exitCode=1
} finally {
  await browser?.close()
  await lifecycle?.finish()
  if (ownedAccounts) for (const p of [accountsFile,...sessions]) await unlink(p).catch(error=>{if(error.code!=="ENOENT")throw error})
}
