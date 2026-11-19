import "../scripts/contracts-runtime.mjs"
import test from "node:test"
import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
const fixture=new URL("./fixtures/permission-context.mjs",import.meta.url).href
registerHooks({
  resolve(s,c,next) {
    if(["@/components/OperationalProvider","@/components/ThemeProvider","@/components/DemoProvider","@/lib/auth/local-provider","next/navigation"].includes(s))return {url:fixture,shortCircuit:true}
    if(s==="next/server")return next("next/server.js",c)
    if(s==="next/dynamic")return {url:"data:text/javascript,export default function dynamic(){return function UnmountedMap(){return null}}",shortCircuit:true}
    if(s==="next/link")return {url:"data:text/javascript,import React from 'react';export default function Link(p){return React.createElement('a',p,p.children)}",shortCircuit:true}
    if(s.endsWith(".css"))return {url:"data:text/javascript,export default new Proxy({}, {get:(_,k)=>String(k)})",shortCircuit:true}
    if(s.startsWith("@/"))for(const ext of [".ts",".tsx"]) {
      const u=new URL("../src/"+s.slice(2)+ext,import.meta.url)
      if(existsSync(u))return {url:u.href,shortCircuit:true}
    }
    return next(s,c)
  },
  load(url,c,next) {
    if(url.endsWith(".tsx"))return {format:"module",shortCircuit:true,source:ts.transpileModule(readFileSync(fileURLToPath(url),"utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText}
    return next(url,c)
  },
})
const policy=await import("../src/lib/auth/policy.ts")
const {state}=await import(fixture)
const {proxy}=await import("../src/proxy.ts")
const {NextRequest}=await import("next/server.js")
const {default:Sidebar}=await import("../src/components/Sidebar.tsx")
const {default:Header}=await import("../src/components/Header.tsx")
const {default:OccurrenceForm}=await import("../src/components/occurrences/OccurrenceForm.tsx")
const principal=role=>({source:"local",role,id:"LOCAL-"+role,authUserId:"",name:"Administrador"})
test("central policy distinguishes functional permissions, demo availability and blocked persistence",()=>{
  for(const role of policy.ROLES) {
    assert(policy.hasPermission(role,"analisar"));assert(policy.hasPermission(role,"consultar_central"))
    for(const p of ["cadastrar","editar","inativar","importar"])assert.equal(policy.hasPermission(role,p),role!=="Analista")
    for(const p of ["administrar","corrigir"])assert.equal(policy.hasPermission(role,p),role==="Administrador")
    for(const p of ["editar","inativar","corrigir"])assert.equal(policy.actionAccess(role,p).enabled,false)
    assert.equal(policy.actionAccess(role,"cadastrar").enabled,role!=="Analista")
    assert.equal(policy.actionAccess(role,"importar").mode,role==="Analista"?"denied":"demo")
  }
  assert(!policy.hasPermission("forged","administrar"));assert.equal(policy.businessDataEnabled(),false)
})
test("server proxy rejects direct page URLs according to the verified profile, ignoring displayed names",async t=>{
  const previous=process.env.SENTINELA_APP_ORIGIN;process.env.SENTINELA_APP_ORIGIN="http://localhost:3000"
  t.after(()=>{if(previous===undefined)delete process.env.SENTINELA_APP_ORIGIN;else process.env.SENTINELA_APP_ORIGIN=previous})
  for(const role of policy.ROLES) {
    state.principal=principal(role)
    for(const path of ["/dashboard","/mapa-criminal","/ocorrencias","/ocorrencias/nova","/importar","/usuarios","/configuracoes","/configuracoes/avancadas","/central-revisao"]) {
      const r=await proxy(new NextRequest("http://localhost:3000"+path,{headers:{host:"localhost:3000",cookie:"sentinela-local-session=verified-test-session"}}))
      if(policy.canVisit(role,path))assert.equal(r.headers.get("x-middleware-next"),"1",role+path)
      else assert.equal(new URL(r.headers.get("location")).pathname,"/acesso-negado",role+path)
    }
  }
})
test("anonymous/invalid sessions and forged role headers cannot reach pages or GET APIs",async()=>{
  state.principal=principal("Administrador")
  for(const cookie of ["","sentinela-local-session=forged"]) {
    const headers={host:"localhost:3000",cookie,"x-sentinela-role":"Administrador"}
    const page=await proxy(new NextRequest("http://localhost:3000/configuracoes",{headers}))
    assert.equal(new URL(page.headers.get("location")).pathname,"/login")
    const api=await proxy(new NextRequest("http://localhost:3000/api/v1/ocorrencias",{headers}))
    assert.equal(api.status,401)
  }
})
test("all three profiles keep only approved GET endpoints; direct persistent writes stay denied even for Administrator",async()=>{
  for(const role of policy.ROLES) {
    state.principal=principal(role)
    const headers={host:"localhost:3000",cookie:"sentinela-local-session=verified-test-session"}
    for(const path of ["/api/v1/ocorrencias","/api/v1/ocorrencias/id","/api/v1/catalogos/regioes-administrativas","/api/v1/catalogos/naturezas-criminais","/api/v1/analytics/persistente"]) {
      assert.equal((await proxy(new NextRequest("http://localhost:3000"+path,{headers}))).headers.get("x-middleware-next"),"1")
      for(const method of ["POST","PATCH","DELETE"])assert.equal((await proxy(new NextRequest("http://localhost:3000"+path,{headers,method}))).status,403)
    }
    for(const path of ["/api/v1/ocorrencias/id/inativacao","/api/v1/central-revisao/corrigir","/api/usuarios","/api/ocorrencias/geocode"])
      assert.equal((await proxy(new NextRequest("http://localhost:3000"+path,{headers,method:"POST"}))).status,403)
  }
})
test("rendered sidebar and header expose only permitted navigation for each verified role",()=>{
  for(const role of policy.ROLES) {
    state.principal=principal(role)
    const sidebarProps={currentPage:"occurrences",onNavigate(){},collapsed:false,onToggle(){}}
    const html=renderToStaticMarkup(React.createElement(Sidebar,sidebarProps))
    const persisted=renderToStaticMarkup(React.createElement(Sidebar,{...sidebarProps,persistent:true}))
    assert(html.includes("Alterações em memória"))
    assert(persisted.includes("Dados sintéticos no banco local."))
    assert(!persisted.includes("Alterações em memória"))
    for(const label of ["Dashboard","Mapa Criminal"])assert(html.includes(`aria-label="${label}"`))
    for(const label of ["Nova Ocorrência","Importar Dados"])assert.equal(html.includes(`aria-label="${label}"`),role!=="Analista")
    for(const label of ["Usuários","Configurações"])assert.equal(html.includes(`aria-label="${label}"`),role==="Administrador")
    const header=renderToStaticMarkup(React.createElement(Header,{title:"Test"}))
    const button=header.match(/<button[^>]*aria-label="Abrir configurações da conta"[^>]*>/)?.[0]
    assert(button);assert.equal(button.includes('disabled=""'),role!=="Administrador")
  }
})
test("rendered forms deny Analyst creation and keep editing unavailable for every role",()=>{
  for(const role of policy.ROLES) {
    state.principal=principal(role)
    const html=renderToStaticMarkup(React.createElement(OccurrenceForm,{onDone(){}}))
    assert.equal(html.includes('type="submit"'),role!=="Analista")
    assert.equal(html.includes('role="alert"'),role==="Analista")
    const editing=renderToStaticMarkup(React.createElement(OccurrenceForm,{initial:{id:"DEMO-synthetic",latitude:0,longitude:0},onDone(){}}))
    assert(editing.includes('role="alert"'));assert(!editing.includes('type="submit"'))
  }
})
