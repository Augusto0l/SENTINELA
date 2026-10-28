import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import * as XLSX from "xlsx";

const base = process.env.SENTINELA_TEST_URL ?? "http://127.0.0.1:3000";
const output = "tmp/import-evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.setDefaultTimeout(20000);
page.setDefaultNavigationTimeout(60000);
// A fonte remota não faz parte do fluxo de importação; evita espera de rede externa no roteiro local.
await page.route("https://fonts.googleapis.com/**", route => route.abort());
await page.route("https://fonts.gstatic.com/**", route => route.abort());
const errors = [], checks = [];
page.on("pageerror", error => errors.push(error.message));
const uploads = [];
page.on("request", request => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) uploads.push(request.url()); });
const head = "data,horario,natureza,RA,endereco,latitude,longitude";
const valid = "29/02/2024,12:00,Furto|Ameaça,Plano Piloto,Quadra demonstrativa 10,-15.79,-47.88";
const csv = `${head}\n${valid}\n${valid}\n${valid.replace("-15.79,-47.88", ",")}\n${valid.replace("12:00", "25:99")}`;
const upload = async (name, text, mimeType = "text/csv") => page.getByLabel("Arquivo CSV ou XLSX", { exact: true }).setInputFiles({ name, mimeType, buffer: Buffer.isBuffer(text) ? text : Buffer.from(text) });
const validate = async () => {
  await page.getByRole("button", { name: "Validar e pré-visualizar", exact: true }).click();
  await page.getByRole("heading", { name: "Pré-visualização dos registros", exact: true }).waitFor();
};
const check = message => { checks.push(message); console.log(message); };
try {
  console.log(`Verificando importação em ${base}`);
  assert.equal((await page.goto(`${base}/importar`, { waitUntil: "domcontentloaded" })).status(), 200);
  await page.getByRole("heading", { name: "Importar ocorrências", exact: true }).waitFor();
  await upload("erro.txt", "conteúdo");
  await page.getByRole("alert").filter({ hasText: /Formato não aceito/ }).waitFor();
  await upload("vazio.csv", "");
  await page.getByRole("alert").filter({ hasText: /vazio/ }).waitFor();
  await upload("corrompido.xlsx", "conteúdo inválido");
  await page.getByRole("alert").filter({ hasText: /XLSX inválido/ }).waitFor();
  check("Arquivos de formato inválido, vazios e XLSX corrompido apresentam erros.");

  await upload("ocorrencias.csv", csv);
  await validate();
  const counts = await page.locator("dl").first().innerText();
  for (const expected of [/Total de linhas\s+4/, /Válidos\s+2/, /Inválidos\s+1/, /Pendentes de localização\s+1/, /Possíveis duplicatas\s+1/]) assert.match(counts, expected);
  await page.getByRole("combobox", { name: "Filtrar linhas" }).selectOption("invalido");
  assert.match(await page.getByRole("region", { name: "Registros interpretados" }).innerText(), /Coluna 2 \(horario\)/);
  await page.getByRole("combobox", { name: "Filtrar linhas" }).selectOption("todos");
  await page.getByText("Valores originais da linha 2", { exact: true }).click();
  assert.match(await page.getByRole("region", { name: "Registros interpretados" }).innerText(), /Furto\|Ameaça/);
  await page.getByText("Valores originais da linha 2", { exact: true }).click();
  check("Prévia real: contagens, múltiplas naturezas, duplicata preservada, filtro e valores originais corretos.");

  for (const theme of ["claro", "escuro"]) {
    const toggle = page.getByRole("button", { name: `Ativar tema ${theme}`, exact: true });
    if (await toggle.count()) await toggle.click();
    for (const width of [1366, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${theme} ${width}: overflow horizontal na página`);
      const region = page.getByRole("region", { name: "Registros interpretados" });
      assert.equal(await region.evaluate(element => getComputedStyle(element).overflowX), "auto");
      await region.screenshot({ path: `${output}/preview-${theme}-${width}.png` });
      await page.locator('[class*="ImportWorkflow"][class*="content"]').evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: `${output}/page-${theme}-${width}.png` });
    }
  }
  check("Temas claro/escuro em 1366, 768, 390 e 320 px: sem overflow da página, tabela com rolagem própria.");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByRole("button", { name: "Preparar simulação", exact: true }).click();
  await page.getByRole("button", { name: "Voltar à pré-visualização", exact: true }).click();
  await page.getByRole("button", { name: "Preparar simulação", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar simulação", exact: true }).click();
  await page.getByRole("heading", { name: "Simulação concluída", exact: true }).waitFor();
  assert.match(await page.getByRole("status").filter({ hasText: /Resultado demonstrativo/ }).innerText(), /2 aptos, 1 pendentes de localização e 1 rejeitados/);
  await page.getByRole("button", { name: "Rever registros analisados", exact: true }).click();
  await page.getByRole("button", { name: "Voltar ao mapeamento", exact: true }).click();
  await page.getByLabel("Horário *", { exact: true }).selectOption("-1");
  assert.equal(await page.getByRole("button", { name: "Validar e pré-visualizar" }).isDisabled(), true);
  await page.getByLabel("Horário *", { exact: true }).selectOption("1");
  await validate();
  check("Confirmação explícita sem persistência, retorno à prévia e correção de mapeamento funcionam.");

  const manualCsv = csv.replace(head, "A,B,C,D,E,F,G");
  await upload("manual.csv", manualCsv);
  await page.getByRole("heading", { name: "Mapeamento de colunas", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Validar e pré-visualizar" }).isDisabled(), true);
  for (const [label, index] of [["Data *", 0], ["Horário *", 1], ["Naturezas criminais *", 2], ["Região Administrativa *", 3], ["Local/endereço *", 4], ["Latitude (opcional)", 5], ["Longitude (opcional)", 6]]) await page.getByLabel(label, { exact: true }).selectOption(String(index));
  await page.locator('[class*="ImportWorkflow"][class*="content"]').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.screenshot({ path: `${output}/mapping-desktop.png` });
  await validate();
  assert.match(await page.locator("dl").first().innerText(), /Válidos\s+2/);
  check("Mapeamento inteiramente manual de cabeçalhos desconhecidos produz a mesma análise.");

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), "Vazia");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([head.split(","), valid.split(",")]), "Dados reais");
  await upload("planilhas.xlsx", XLSX.write(book, { bookType: "xlsx", type: "buffer", compression: true }), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  await page.getByRole("combobox", { name: "Planilha", exact: true }).selectOption("Dados reais");
  await validate();
  assert.match(await page.locator("dl").first().innerText(), /Válidos\s+1/);
  await page.getByRole("combobox", { name: "Planilha", exact: true }).selectOption("Vazia");
  await page.getByRole("alert").filter({ hasText: /vazia/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Preparar simulação" }).count(), 0);
  check("XLSX identifica planilhas, lê a selecionada e limpa a análise ao selecionar planilha vazia.");

  await page.locator('input[type="file"]').setInputFiles([]);
  await page.locator("[class*='drop']").first().evaluate((element, content) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([content], "arrastado.csv", { type: "text/csv" }));
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
  }, csv);
  await validate();
  assert.match(await page.locator("dl").first().innerText(), /Total de linhas\s+4/);
  await page.getByRole("button", { name: "Limpar seleção", exact: true }).click();
  assert.equal(await page.getByRole("heading", { name: "Pré-visualização dos registros" }).count(), 0);
  await upload("ocorrencias.csv", csv);
  await page.getByRole("heading", { name: "Mapeamento de colunas", exact: true }).waitFor();
  check("Drag-and-drop, limpeza e seleção repetida funcionam sem dados antigos.");
  await upload("paginado.csv", `${head}\n${Array.from({ length: 26 }, () => valid).join("\n")}`);
  await validate();
  assert.equal(await page.locator("tbody tr").count(), 25);
  await page.getByRole("button", { name: "Próxima", exact: true }).click();
  assert.equal(await page.locator("tbody tr").count(), 1);
  check("Prévia pagina os 26 registros reais em 25 + 1, sem truncamento.");
  for (const format of ["csv", "xlsx"]) {
    const response = await page.request.get(`${base}/modelos/ocorrencias-demonstracao.${format}`);
    assert.equal(response.status(), 200);
    assert.ok((await response.body()).length > 0);
  }
  await page.getByRole("button", { name: "Selecionar arquivo", exact: true }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.getByRole("button", { name: "Selecionar arquivo", exact: true }).evaluate(element => element.matches(":focus-visible")), true);
  assert.deepEqual(errors, []);
  assert.deepEqual(uploads, []);
  check("Modelos disponíveis, foco visível e nenhum erro JavaScript ou requisição de gravação.");
  await writeFile(`${output}/resultados.json`, JSON.stringify({ base, environment: { node: process.version, browser: browser.version(), viewportHeight: 900, remoteFonts: "blocked-in-test" }, checks, errors, uploads, screenshots: [1366, 768, 390, 320], themes: ["claro", "escuro"] }, null, 2));
} finally { await browser.close(); }
