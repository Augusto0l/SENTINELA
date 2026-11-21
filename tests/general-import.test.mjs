import "../scripts/contracts-runtime.mjs"
import assert from "node:assert/strict"
import test from "node:test"
import { join } from "node:path"
import { utils, write } from "xlsx"
const { generalInput, prepareGeneralImport } = await import("../src/lib/db/general-import-input.ts")
const { generalFormats, generalUploadHeader } = await import("../src/contracts/general-import.ts")
const { isInstitutionalPcdf } = await import("../src/data/importSource.ts")
const { verifyImportWorkbookSize, inspectImportZip } = await import("../src/data/importParser.ts")
const { generalImportMode, isGeneralImportEndpoint } = await import("../src/lib/db/isolated-write-mode.ts")

const mapping={data:0,horario:1,naturezas:2,ra:3,local:4,latitude:-1,longitude:-1}
const header="Data;Hora;Tipo de crime;Região Administrativa;Local;Observação"
const first="2026-01-01;13:34;Furto;Plano Piloto;Rua de ensaio;000001"
const csv=Buffer.from("\ufeff\r\n"+header+"\r\n"+first+"\r\n"+first+"\r\n2026-01-02;13:34;Furto;Inexistente;;\"Acentuação; e\r\nquebra\"")
const metadata={name:"dados.csv",sheet:"CSV",mapping}
const input = (meta=metadata,mime=generalFormats.csv) => generalInput(new Request("http://127.0.0.1",{
  headers:{[generalUploadHeader]:encodeURIComponent(JSON.stringify(meta))}}),mime)

test("general write endpoints require the isolated local mode and expose only declared methods", () => {
  const id="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
  const env={NODE_ENV:"development",SENTINELA_SANDBOX_GENERAL_IMPORT:"1",SENTINELA_SANDBOX_WRITE:"1",
    SENTINELA_SANDBOX_WRITE_ID:id,SENTINELA_AUTH_PROVIDER:"local",SENTINELA_LOCAL_BIND:"127.0.0.1",
    SENTINELA_APP_ORIGIN:"http://127.0.0.1:3317",USERPROFILE:"fixture"}
  env.SENTINELA_LOCAL_ACCOUNTS_FILE=join(env.USERPROFILE,".sentinela-local","rls-sandboxes","rls-sandbox-"+id,"next-accounts.json")
  assert(generalImportMode(env))
  for(const delta of [{NODE_ENV:"production"},{VERCEL:"1"},{SENTINELA_SANDBOX_GENERAL_IMPORT:""},
    {SENTINELA_LOCAL_ACCOUNTS_FILE:"other.json"},{SENTINELA_PERSISTENT_HOMOLOGATION:"1"}])
    assert.equal(generalImportMode({...env,...delta}),null)
  const base="/api/v1/importacoes/geral"
  assert(isGeneralImportEndpoint(base,"POST"))
  assert(isGeneralImportEndpoint(base+"/"+id,"GET"))
  assert(isGeneralImportEndpoint(base+"/revisao/"+id,"PATCH"))
  assert(!isGeneralImportEndpoint(base+"/"+id+"/consolidacao","POST"))
  assert(!isGeneralImportEndpoint(base+"/revisao/"+id,"DELETE"))
})

test("general intake parses original bytes, preserves unused cells and uses a stable content identity", async () => {
  const payload=await prepareGeneralImport(csv,input())
  assert.equal(payload.summary.total,3)
  assert.equal(payload.summary.possibleDuplicates,1)
  assert.equal(payload.summary.invalid,1)
  assert.equal(payload.rows[0].line,3)
  assert.equal(payload.rows[1].snapshot.duplicateOf,3)
  assert.equal(payload.rows[0].snapshot.cells[5].value,"000001")
  assert.equal(payload.rows[2].snapshot.cells[4].value,"")
  assert.equal(payload.rows[2].snapshot.cells[5].value,"Acentuação; e\r\nquebra")
  const renamed=await prepareGeneralImport(csv,input({...metadata,name:"renomeado.csv",delimiter:";"}))
  assert.equal(renamed.metadata.sha,payload.metadata.sha)
  assert.equal(renamed.metadata.context,payload.metadata.context)
  assert.equal(renamed.metadata.sheetKey,payload.metadata.sheetKey)
})

test("mixed header separators require explicit choice and duplicate assignments are refused", async () => {
  const bytes=Buffer.from(header.replace("Observação","Nota, extra")+"\n"+first)
  await assert.rejects(prepareGeneralImport(bytes,input()),{status:422})
  const parsed=await prepareGeneralImport(bytes,input({...metadata,delimiter:";"}))
  assert.equal(parsed.metadata.headers[5],"Nota, extra")
  await assert.rejects(prepareGeneralImport(csv,input({...metadata,mapping:{...mapping,local:0}})),{status:422})
})

test("the official namespace is refused before any persistent receipt can be prepared", async () => {
  const renamed=Buffer.from(header+";linha_origem_id;aba_origem\n"+first+";somente-ensaio;NATUREZAS")
  assert(isInstitutionalPcdf("outro.csv",[" Versão tratamento "]))
  await assert.rejects(prepareGeneralImport(renamed,input()),{status:422,diagnostic:"pcdf_institucional"})
  await assert.rejects(prepareGeneralImport(csv,input({...metadata,name:"pcdf_naturezas_2021-01.csv"})),
    {status:422,diagnostic:"pcdf_institucional"})
  assert.throws(()=>input({...metadata,name:"outro.xml"}))
  assert.throws(()=>input(metadata,generalFormats.xlsx),{status:415})
})

test("XLSX is independently expanded within limits and the requested sheet is parsed", async () => {
  const book=utils.book_new()
  utils.book_append_sheet(book,utils.aoa_to_sheet([["Instruções"]]),"Instruções")
  utils.book_append_sheet(book,utils.aoa_to_sheet([header.split(";"),
    [new Date(2026,2,1,12),0.5,"Furto","Plano Piloto","Via local","00018"]]),"Dados")
  const buffer=write(book,{type:"array",bookType:"xlsx",compression:true})
  await verifyImportWorkbookSize(buffer)
  const meta={name:"dados.xlsx",sheet:"Dados",mapping}
  const payload=await prepareGeneralImport(new Uint8Array(buffer),input(meta,generalFormats.xlsx))
  assert.equal(payload.rows[0].normalized.data,"01/03/2026")
  assert.equal(payload.rows[0].snapshot.cells[5].value,"00018")
  await assert.rejects(prepareGeneralImport(new Uint8Array(buffer),
    input({...meta,sheet:"Ausente"},generalFormats.xlsx)),{status:422})
  const malicious=buffer.slice(0)
  const view=new DataView(malicious)
  const central=view.getUint32(view.byteLength-22+16,true)
  const local=view.getUint32(central+42,true)
  assert.equal(view.getUint16(central+10,true),8)
  const claimed=view.getUint32(central+24,true)-1
  view.setUint32(central+24,claimed,true)
  view.setUint32(local+22,claimed,true)
  assert(inspectImportZip(malicious).length>0)
  await assert.rejects(verifyImportWorkbookSize(malicious),/expandido/)
})
