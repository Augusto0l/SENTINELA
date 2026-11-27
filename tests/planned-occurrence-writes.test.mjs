import "../scripts/contracts-runtime.mjs"
import test from "node:test"
import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import ts from "typescript"
const c = await import("../src/contracts/planned-occurrence-writes.ts")
const {contractModels} = await import("../src/contracts/examples.ts")
const {buildOpenApi} = await import("../src/contracts/openapi.ts")
const create = () => structuredClone(contractModels.PlannedManualCreate.example)
const update = () => structuredClone(contractModels.PlannedManualUpdate.example)
test("planned create accepts real UUID format, seconds, multiple original natures and unknown attempt without invented categories",()=>{
  const input=create();input.naturezas.push({...input.naturezas[0],crimeTentado:false})
  assert.equal(c.plannedOccurrenceCreateSchema.parse(input).naturezas.length,2)
  delete input.coordenadas;assert(c.plannedOccurrenceCreateSchema.safeParse(input).success)
  for(const key of ["data","horario","raId","local","naturezas"]) {const v=create();delete v[key];assert(!c.plannedOccurrenceCreateSchema.safeParse(v).success,key)}
})
test("planned create rejects demo identifiers, invalid dates/times, forged actor/profile/state and malformed relationships",()=>{
  for(const change of [{raId:"RA-I"},{data:"2026-02-30"},{horario:"24:00:00"},{horario:"12:30"},{local:"    "},{naturezas:[]},{usuarioId:"forged"},{perfil:"Administrador"},{origem:"importacao"},{ativo:false},{fonte:"SENTINELA_TESTE_LOCAL_V1"}])
    assert(!c.plannedOccurrenceCreateSchema.safeParse({...create(),...change}).success)
  const v=create();v.naturezas.push({...v.naturezas[0]});assert(!c.plannedOccurrenceCreateSchema.safeParse(v).success)
  for(const field of ["categoriaId","mapeamentoId","ator"]) {const v=create();v.naturezas[0][field]="forged";assert(!c.plannedOccurrenceCreateSchema.safeParse(v).success)}
})
test("planned coordinates validate pairs and global bounds, never claim to prove DF containment",()=>{
  for(const coordinates of [{latitude:91,longitude:0},{latitude:0,longitude:-181},{latitude:NaN,longitude:0},{latitude:0},{latitude:Infinity,longitude:0}])
    assert(!c.plannedOccurrenceCreateSchema.safeParse({...create(),coordenadas:coordinates}).success)
  assert(c.plannedOccurrenceCreateSchema.safeParse({...create(),coordenadas:{latitude:0,longitude:0}}).success,"DF membership is a future SQL/domain test, not a rectangular Zod shortcut")
})
test("planned patch requires version, justification and changes, excludes immutable and administrative fields",()=>{
  c.plannedOccurrenceUpdateSchema.parse(update())
  for(const input of [{...update(),versaoEsperada:undefined},{...update(),justificativa:" "},{...update(),alteracoes:{}},{...update(),alteracoes:{local:undefined}}])
    assert(!c.plannedOccurrenceUpdateSchema.safeParse(input).success)
  for(const key of ["id","origem","fonte","numeroRegistro","ativo","consolidacaoStatus","responsavelId","versao"])
    assert(!c.plannedOccurrenceUpdateSchema.safeParse({...update(),alteracoes:{[key]:"forged"}}).success)
  assert.deepEqual(c.plannedOccurrenceUpdateSchema.parse({...update(),alteracoes:{coordenadas:null}}).alteracoes,{coordenadas:null})
})
test("planned versions preserve bigint precision and reject zero, overflow, numeric coercion or malformed versions",()=>{
  for(const v of ["1","9007199254740993","9223372036854775807"])assert.equal(c.plannedVersionSchema.parse(v),v)
  for(const v of ["0","01","-1","1.0","9223372036854775808",1,"1;DROP TABLE x"])
    assert(!c.plannedVersionSchema.safeParse(v).success)
})
test("planned inactivation needs reason and version; response cannot claim active=true",()=>{
  c.plannedOccurrenceInactivationSchema.parse(contractModels.PlannedInactivation.example)
  for(const change of [{motivo:" "},{versaoEsperada:"0"},{usuarioId:"forged"},{ativo:false}])
    assert(!c.plannedOccurrenceInactivationSchema.safeParse({...contractModels.PlannedInactivation.example,...change}).success)
  const response=structuredClone(contractModels.PlannedInactivationResponse.example)
  c.plannedInactivationResponseSchema.parse(response);response.data.ativo=true
  assert(!c.plannedInactivationResponseSchema.safeParse(response).success)
})
test("planned OpenAPI writes are unavailable proposals, use UUID paths, idempotency and non-persistence examples",()=>{
  const api=buildOpenApi()
  for(const [path,method] of [["/api/v1/ocorrencias","post"],["/api/v1/ocorrencias/{id}","patch"],["/api/v1/ocorrencias/{id}/inativacao","post"]]) {
    const op=api.paths[path][method];assert.equal(op["x-implementation-status"],"planned")
    assert(op.parameters.some(p=>p.name==="Idempotency-Key"&&p.required))
    const id=op.parameters.find(p=>p.name==="id");if(id)assert.equal(id.schema.format,"uuid")
    for(const code of ["400","401","403","409","422","500","503"])assert(op.responses[code])
    const success=op.responses[method==="post"&&path==="/api/v1/ocorrencias"?"201":"200"]
    assert.deepEqual(success.content["application/json"].example.meta.execution,{mode:"proposto",persisted:false})
  }
  assert.equal(api.paths["/api/v1/ocorrencias"].get["x-implementation-status"],"implemented-local-development")
  assert(!api.paths["/api/v1/ocorrencias/{id}"].delete)
})
test("idempotency header is UUID and baseline protections remain intact",async()=>{
  c.plannedWriteHeadersSchema.parse(contractModels.PlannedWriteHeaders.example)
  assert(!c.plannedWriteHeadersSchema.safeParse({"Idempotency-Key":"shared-default"}).success)
  const baseline=await readFile(new URL("../database/supabase/baseline/0001_modelo_inicial.sql",import.meta.url),"utf8")
  for(const name of ["bloquear_correcao_sem_backend","bloquear_autoria_manual_sem_auth","exigir_historico_correcao","exigir_revisor_administrador"])assert(baseline.includes(name))
})

test("static route inventory allows only explicitly gated write handlers under api/v1",async()=>{
  const routes=[]
  async function visit(dir) {
    for(const entry of await readdir(dir,{withFileTypes:true})) {
      const url=new URL(entry.name+(entry.isDirectory()?"/":""),dir)
      if(entry.isDirectory())await visit(url)
      else if(entry.name==="route.ts")routes.push(url)
    }
  }
  await visit(new URL("../src/app/api/v1/",import.meta.url))
  assert(routes.length>0)
  const expected = new Map([
    ["ocorrencias/route.ts", "POST"], ["ocorrencias/[id]/route.ts", "PATCH"], ["ocorrencias/[id]/inativacao/route.ts", "POST"],
    ["ocorrencias/manuais/route.ts", "POST"],
    ["ocorrencias/gestao/route.ts", "POST"],
    ["importacoes/pcdf/route.ts", "POST"], ["importacoes/pcdf/[id]/consolidacao/route.ts", "POST"],
    ["importacoes/pcdf/direta/route.ts", "POST"],
    ["importacoes/geral/route.ts", "POST"], ["importacoes/geral/revisao/[id]/route.ts", "PATCH"],
    ["central-revisao/[id]/route.ts", "PATCH"],
    ["usuarios/route.ts", ["POST", "PATCH", "DELETE"]],
  ])
  const writeOnly = new Set(["ocorrencias/[id]/inativacao/route.ts",
    "importacoes/pcdf/[id]/consolidacao/route.ts", "central-revisao/[id]/route.ts", "importacoes/geral/revisao/[id]/route.ts"])
  const generalOperations = new Map([["importacoes/geral/route.ts", "general-upload"],
    ["importacoes/geral/revisao/[id]/route.ts", "general-decide"]])
  for(const file of routes) {
    const source=await readFile(file,"utf8")
    const ast=ts.createSourceFile(file.pathname,source,ts.ScriptTarget.Latest,true)
    const names=[]
    for(const node of ast.statements) {
      if(ts.isExportDeclaration(node)) {
        assert(node.exportClause&&ts.isNamedExports(node.exportClause),"Route wildcard exports require explicit review")
        names.push(...node.exportClause.elements.map(e=>e.name.text))
      } else if(node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)) {
        if(ts.isFunctionDeclaration(node)&&node.name)names.push(node.name.text)
        if(ts.isVariableStatement(node))for(const declaration of node.declarationList.declarations)
          if(ts.isIdentifier(declaration.name))names.push(declaration.name.text)
      }
    }
    const relative = decodeURIComponent(file.pathname).split("/api/v1/")[1]
    const method = expected.get(relative)
    assert.deepEqual(names.filter(name=>["POST","PUT","PATCH","DELETE"].includes(name)),
      Array.isArray(method) ? method : method ? [method] : [],
      `Unexpected write methods in ${relative}`)
    if (relative === "importacoes/pcdf/direta/route.ts") assert.match(source, /export const POST = directPcdf/)
    else if (relative === "ocorrencias/manuais/route.ts") {
      assert.match(source, /hasPermission\(principal\.role, "cadastrar"\)/)
      assert.match(source, /request\.headers\.get\("origin"\) !== mode\.origin/)
      assert.match(source, /withOperationalDatabase\(principal, false,/)
      assert.match(source, /hostedOperationalMode\(\)\?\.write === false/)
    }
    else if (relative === "ocorrencias/gestao/route.ts") {
      assert.match(source, /occurrenceManagementMode\(\)/)
      assert.match(source, /request\.headers\.get\("origin"\) !== mode\.origin/)
      assert.match(source, /hasPermission\(principal\.role, "administrar"\)/)
      assert.match(source, /withLocalOccurrenceDatabase\(principal, false,/)
    }
    else if (relative === "usuarios/route.ts") {
      assert.match(source, /const mode = institutionalDatabaseMode\(\)/)
      assert.match(source, /request\.headers\.get\("host"\) !== new URL\(mode\.origin\)\.host/)
      assert.match(source, /request\.method !== "GET" && request\.headers\.get\("origin"\) !== mode\.origin/)
      assert.match(source, /principal\.role !== "Administrador" \|\| principal\.source !== "supabase"/)
      assert.match(source, /request\.method !== "GET" && hostedOperationalMode\(\)\?\.write === false/)
      assert.equal((source.match(/await authorize\(request\)/g) ?? []).length, 4)
      assert.match(source, /institutionalEdit\.safeParse\(body\.data\)/)
      assert.match(source, /await institutionalUsers\(principal, edit\.data\)/)
    }
    else if (relative === "central-revisao/[id]/route.ts") {
      assert.match(source, /if \(hostedOperationalMode\(\)\) return hostedReview\(request, id\)/)
      assert.match(source, /return pcdfWorkspace\(request, "decide", id\)/)
      const hosted = await readFile(new URL("../src/lib/db/hosted-review.ts", import.meta.url), "utf8")
      assert.match(hosted, /!mode\.write \|\| request\.headers\.get\("origin"\) !== mode\.origin/)
      assert.match(hosted, /hasPermission\(principal\.role, write \? "corrigir" : "consultar_central"\)/)
      assert.match(hosted, /withHostedOperationalDatabase\(principal, false,/)
    }
    else if (generalOperations.has(relative)) assert(source.includes(`return pcdfWorkspace(request, "${generalOperations.get(relative)}"`))
    else if (method) assert.match(source, relative.startsWith("ocorrencias/")
      ? /return isolatedOccurrenceMutation\(request\)/ : /return pcdfWorkspace\(request, "(upload|promote|decide)"/)
    assert.equal(names.includes("GET"), !writeOnly.has(relative), `Unexpected GET registration in ${relative}`)
    expected.delete(relative)
  }
  assert.equal(expected.size,0)
})
