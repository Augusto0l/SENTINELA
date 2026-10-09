import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = process.env.SENTINELA_TEST_URL ?? "http://127.0.0.1:3001";
const run = process.env.SENTINELA_TEST_RUN ?? "inicial";
const output = resolve("docs/evidencias/sprint-01", run);
mkdirSync(output, { recursive: true });
const report = { base, browser: "", routes: [], checks: [], pageErrors: [], consoleErrors: [], failedRequests: [], httpErrors: [], screenshots: [] };
const browser = await chromium.launch({ channel: "chrome", headless: true, chromiumSandbox: true });
report.browser = browser.version();
const context = await browser.newContext({ locale: "pt-BR", timezoneId: "America/Sao_Paulo", reducedMotion: "reduce" });
const page = await context.newPage();
page.on("pageerror", (error) => report.pageErrors.push({ url: page.url(), error: error.message }));
page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push({ url: page.url(), error: message.text() }); });
page.on("requestfailed", (request) => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
page.on("response", (response) => { if (response.status() >= 400) report.httpErrors.push({ url:response.url(), status:response.status() }); });
const routes = [
  ["/login", "Acesse a demonstração"], ["/dashboard", "Visão Geral do DF"],
  ["/mapa-criminal", "Mapa Criminal"], ["/ocorrencias", "Ocorrências"],
  ["/ocorrencias/nova", "Nova ocorrência"], ["/importar", "Importar dados"],
  ["/usuarios", "Usuários"], ["/configuracoes", "Configurações"],
];
async function ready(route, heading) {
  const response = await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: heading, exact: true }).waitFor({ timeout: 30000 });
  assert.equal(response.status(), 200);
  if (route !== "/login") await page.locator(".demo-banner").waitFor();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Carregando tela demonstrativa"]'));
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  return response.status();
}
async function shot(name) {
  const file = `${name}.png`;
  await page.screenshot({ path: resolve(output, file), fullPage: true });
  report.screenshots.push(file);
}
async function check(name, action) {
  try { const evidence = await action(); report.checks.push({ name, passed: true, evidence }); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); await shot(`falha-${report.checks.length}`); }
}
try {
  for (const [width, height] of [[1920,1080], [1366,768], [768,1024], [1024,768], [1200,800]]) {
    await page.setViewportSize({ width, height });
    for (const [route, heading] of routes) {
      try {
        const api = await context.request.get(base + route);
        const status = await ready(route, heading);
        const layout = await page.evaluate(() => {
          const rect = (element) => { if (!element) return null; const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
          return { viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth, sidebar: rect(document.querySelector("aside")), topbar: rect(document.querySelector("header")), main: rect(document.querySelector("main")), grids: [...document.querySelectorAll(".two-column-grid,.kpi-grid")].map((element) => ({ rect: rect(element), columns: getComputedStyle(element).gridTemplateColumns })), tables: [...document.querySelectorAll("table")].map((element) => ({ width: element.getBoundingClientRect().width, parentWidth: element.parentElement.clientWidth, parentOverflow: getComputedStyle(element.parentElement).overflowX })) };
        });
        report.routes.push({ route, width, height, http: api.status(), browserHttp: status, heading, layout, passed: api.status() === 200 && layout.documentWidth <= width });
        await shot(`${width}x${height}-${route.slice(1).replaceAll("/","-")}`);
        console.log(`HTTP/render ${width}x${height} ${route}: ${api.status()}`);
      } catch (error) { report.routes.push({ route, width, height, passed: false, error: error.message }); console.log(`FAIL route ${route}: ${error.message}`); }
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await check("login e toast explícito de demonstração", async () => {
    await ready("/login", "Acesse a demonstração");
    await page.getByRole("button", { name: "Entrar na demonstração" }).click();
    await page.waitForURL(base + "/dashboard");
    await page.getByRole("heading", { name: "Visão Geral do DF" }).waitFor();
    const text = await page.locator(".demo-toast").innerText();
    assert.match(text, /Nenhuma autenticação/);
    await shot("login-toast");
    return text;
  });
  const nav = [["Mapa Criminal","/mapa-criminal","Mapa Criminal"],["Ocorrências","/ocorrencias","Ocorrências"],["Nova Ocorrência","/ocorrencias/nova","Nova ocorrência"],["Importar Dados","/importar","Importar dados"],["Usuários","/usuarios","Usuários"],["Configurações","/configuracoes","Configurações"],["Dashboard","/dashboard","Visão Geral do DF"],["Voltar ao login demonstrativo","/login","Acesse a demonstração"]];
  await check("navegação por todos os destinos da Sidebar", async () => {
    await ready("/dashboard", "Visão Geral do DF");
    for (const [label,route,heading] of nav) {
      await page.locator("aside").getByRole("button", { name: label, exact: true }).click();
      await page.waitForURL(base + route);
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    }
    return nav.map((entry) => entry[1]);
  });
  await check("contagens coerentes entre dashboard, mapa e listagem", async () => {
    await ready("/dashboard", "Visão Geral do DF");
    const dashboard = Number((await page.locator(".kpi-grid > div").first().innerText()).match(/\n([\d.]+)\n/)[1].replaceAll(".",""));
    await ready("/ocorrencias", "Ocorrências");
    const listing = Number((await page.locator("p").filter({ hasText: "registros demonstrativos" }).innerText()).match(/([\d.]+) registros/)[1].replaceAll(".",""));
    await ready("/mapa-criminal", "Mapa Criminal");
    const map = await page.locator('svg path[aria-label$="ocorrências demonstrativas"]').evaluateAll((elements) => elements.reduce((sum,element) => sum + Number(element.getAttribute("aria-label").match(/: (\d+) ocorrências/)[1]), 0));
    assert.equal(dashboard, listing); assert.equal(map, listing);
    return { dashboard, map, listing };
  });
  await check("filtros de mocks e estado vazio", async () => {
    await ready("/ocorrencias", "Ocorrências");
    await page.getByRole("textbox", { name: "Buscar ID, RA ou natureza" }).fill("REGISTRO-INEXISTENTE");
    await page.getByText("Nenhum registro encontrado com os filtros aplicados.").waitFor();
    await ready("/mapa-criminal", "Mapa Criminal");
    await page.getByRole("combobox", { name: "Natureza criminal", exact: true }).selectOption("Furto");
    const labels = await page.locator('svg path[aria-label$="ocorrências demonstrativas"]').count();
    const filteredCount = await page.locator('svg path[aria-label$="ocorrências demonstrativas"]').evaluateAll((elements) => elements.reduce((sum,element) => sum + Number(element.getAttribute("aria-label").match(/: (\d+) ocorrências/)[1]), 0));
    assert.ok(labels > 0);
    assert.ok(filteredCount > 0 && filteredCount < 790);
    return { emptyTable: true, filteredRegions: labels, filteredCount };
  });
  await check("paginação acessível e KPI contido no card em notebook", async () => {
    await page.setViewportSize({width:1366,height:768});
    await ready("/dashboard", "Visão Geral do DF");
    const overflow = await page.locator(".kpi-grid > div").evaluateAll((elements)=>elements.map((element)=>({width:element.clientWidth,content:element.scrollWidth})));
    assert.ok(overflow.every((item)=>item.content <= item.width));
    await ready("/ocorrencias", "Ocorrências");
    const footer=page.locator("span").filter({hasText:/^Página 1 de /}).first();
    const box=await footer.boundingBox();
    assert.ok(box && box.y+box.height<=768);
    const first=await page.locator("tbody tr td").first().innerText();
    await page.getByRole("button",{name:"›",exact:true}).click();
    await page.locator("span").filter({hasText:/^Página 2 de /}).first().waitFor();
    const next=await page.locator("tbody tr td").first().innerText();
    assert.notEqual(first,next);
    await shot("paginacao-notebook");
    return {overflow,footer:box,first,next};
  });
  for (const viewport of [{width:1366,height:768},{width:768,height:1024}]) {
    await page.setViewportSize(viewport);
    await check(`diálogo, foco preso e Escape ${viewport.width}`, async () => {
      await ready("/usuarios", "Usuários");
      const trigger = page.getByRole("button", { name: /Novo usuário/ });
      await trigger.focus(); await trigger.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Novo usuário demonstrativo" });
      await dialog.waitFor();
      for (let i=0;i<12;i++) { await page.keyboard.press("Tab"); assert.ok(await dialog.evaluate((element) => element.contains(document.activeElement))); }
      const box = await dialog.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= viewport.width && box.y >= 0 && box.y + box.height <= viewport.height);
      await shot(`dialogo-${viewport.width}`);
      await page.keyboard.press("Escape"); await dialog.waitFor({ state:"hidden" });
      assert.ok(await trigger.evaluate((element) => element === document.activeElement));
      return { box, focusRestored: true };
    });
  }
  await check("usuário fictício e feedback sem conta real", async () => {
    await ready("/usuarios", "Usuários");
    await page.getByRole("button", { name: /Novo usuário/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name:"Nome completo" }).fill("Usuário de homologação");
    await dialog.getByRole("textbox", { name:"E-mail", exact:true }).fill("homologacao@example.com");
    await dialog.getByRole("button", { name:"Criar usuário" }).click();
    await page.getByText("Usuário de homologação", { exact:true }).waitFor();
    const toast = await page.locator(".demo-toast").innerText(); assert.match(toast, /nenhuma conta foi criada/);
    return toast;
  });
  await check("menu em portal e drawer por teclado", async () => {
    await ready("/usuarios", "Usuários");
    await page.getByRole("button", { name:/Ações do usuário/ }).first().focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name:/Visualizar usuário/ }).press("Enter");
    await page.getByRole("dialog", { name:"Detalhes do usuário" }).waitFor();
    await shot("drawer-usuario");
    await page.keyboard.press("Escape");
    return "Menu e drawer abertos por Enter e encerrados por Escape";
  });
  await check("skip link, foco visível e seleção de RA por teclado", async () => {
    await ready("/mapa-criminal", "Mapa Criminal");
    await page.keyboard.press("Tab");
    const skip=page.getByRole("link",{name:"Ir para o conteúdo"});
    assert.ok(await skip.evaluate((element)=>element===document.activeElement));
    await page.keyboard.press("Enter");
    assert.ok(await page.locator("#main-content").evaluate((element)=>element===document.activeElement));
    const ra=page.locator('svg path[role="button"]').first();
    await ra.focus();
    const outline=await ra.evaluate((element)=>getComputedStyle(element).outlineStyle);
    assert.notEqual(outline,"none");
    await page.keyboard.press("Enter");
    await page.waitForFunction(()=>document.querySelector('select[aria-label="Região Administrativa"]').value!=="");
    assert.equal(await page.locator('svg path[role="button"]').count(),1);
    await shot("mapa-ra-teclado");
    return {outline,selectedRa:await page.getByRole("combobox",{name:"Região Administrativa",exact:true}).inputValue()};
  });
  await check("importação e configurações anunciam simulação", async () => {
    await ready("/importar", "Importar dados");
    await page.getByRole("button", { name:"Simular validação e importação" }).click();
    const importToast = await page.locator(".demo-toast").innerText(); assert.match(importToast, /nenhum arquivo foi validado ou importado/);
    await ready("/configuracoes", "Configurações");
    await page.getByRole("button",{name:"Claro",exact:true}).click();
    await page.getByText("Prévia demonstrativa; a seleção não altera o tema global.",{exact:true}).waitFor();
    await shot("tema-demonstrativo");
    assert.equal(await page.locator('input[type="password"]').evaluateAll((elements)=>elements.filter((element)=>element.value).length), 0);
    await page.getByRole("button", { name:"Simular alterações" }).click();
    await page.getByRole("button", { name:"Simular alterações" }).waitFor();
    const settingsToast = await page.locator(".demo-toast").innerText(); assert.match(settingsToast, /não foram gravadas/);
    return { importToast, settingsToast };
  });
  await check("cadastro e descarte demonstrativo", async () => {
    await ready("/ocorrencias/nova", "Nova ocorrência");
    await page.getByRole("button", { name:"Simular cadastro" }).click();
    await page.getByText("Preencha os campos obrigatórios antes de salvar.", { exact:true }).waitFor();
    await page.getByRole("combobox", { name:"Natureza da ocorrência" }).selectOption("Furto");
    await page.locator("#occ-data").fill("2026-08-20");
    await page.locator("#occ-horario").fill("12:30");
    await page.locator("#occ-raCode").selectOption("RA-I");
    await page.locator("#occ-setor").selectOption({ index:1 });
    await page.locator("#occ-descricao").fill("Registro fictício de homologação, sem dados reais.");
    await page.getByRole("button", { name:"Cancelar", exact:true }).click();
    const discard = page.getByRole("dialog", { name:"Descartar alterações?" }); await discard.waitFor();
    await discard.getByRole("button", { name:"Continuar editando" }).click();
    await page.getByRole("button", { name:"Simular cadastro" }).click();
    await page.getByText("Simulação de cadastro concluída", {exact:true}).waitFor();
    const text=await page.getByText("Nenhum registro foi gravado.", {exact:false}).innerText();
    await shot("cadastro-simulado");
    return text;
  });
  await check("skeleton visível durante carregamento do módulo", async () => {
    await context.route(/\/_next\/static\/.*\.js/, async (route) => { await new Promise((done)=>setTimeout(done,350)); await route.continue(); });
    await page.goto(base + "/dashboard", { waitUntil:"commit" });
    await page.getByRole("status", { name:"Carregando tela demonstrativa" }).waitFor({ timeout:10000 });
    await shot("skeleton-dashboard");
    await page.getByRole("heading", {name:"Visão Geral do DF",exact:true}).waitFor();
    await context.unroute(/\/_next\/static\/.*\.js/);
    return "Skeleton observado com atraso controlado de 350 ms nas respostas JS";
  });
} finally {
  writeFileSync(resolve(output,"resultados.json"),JSON.stringify(report,null,2));
  await browser.close();
}
console.log(`Evidências: ${output}`);
if (report.routes.some((item)=>!item.passed) || report.checks.some((item)=>!item.passed) || report.pageErrors.length) process.exitCode=1;
