import assert from "node:assert/strict";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { freePort, httpValidation } from "./http-validation-output.mjs";

const origin = "http://127.0.0.1:3318";
const output = "tmp/imported-files-presentation";
const root = await mkdtemp(join(tmpdir(), "sentinela-arquivos-ui-"));
const password = randomBytes(24).toString("hex");
const accounts = ["Administrador", "Operador", "Analista"].map((role, i) => {
  const salt = randomBytes(16).toString("hex");
  return { role, salt, email: `arquivos-ensaio-${i}@example.test`, hash: scryptSync(password, Buffer.from(salt, "hex"), 64).toString("hex") };
});
const accountPath = join(root, "accounts.json");
await writeFile(accountPath, JSON.stringify({ accounts }), { flag: "wx" });
await mkdir(output, { recursive: true });
const { versao } = JSON.parse(await readFile("docs/contratos/catalogos-v0.1.0.json", "utf8"));
const success = data => ({ success: true, data, meta: {
  contractVersion: "0.1.0", catalogVersion: versao, execution: { mode: "operacional", persisted: false },
} });
const lotId = randomUUID(), runId = randomUUID();
const date = "2026-11-23T14:20:08.000Z";
const summary = {
  canImport: true, recebidas: 38, consolidadas: 0, pendencias: 2, competencias: ["2021-01"],
  rasImportadas: [], naturezasImportadas: [], rasConsolidadas: [], naturezasConsolidadas: [],
};
const general = Array.from({ length: 26 }, (_, i) => ({
  request: randomUUID(), name: i === 0 ? "teste_importacao_campo.csv" : `teste-planilha-${i}.xlsx`,
  format: i === 0 ? "csv" : "xlsx", sheet: i === 0 ? "CSV" : "Dados", actor: "Operador", created: date,
  status: i === 0 ? "concluida" : "falhou",
  receipt: i === 0 ? { lot: lotId, run: runId, persisted: 13, replay: false,
    summary: { total: 13, structural: 13, valid: 13, invalid: 0, pending: 0, possibleDuplicates: 0, issues: 2 } } : null,
}));
const pcdf = {
  request: randomUUID(), name: "pcdf_naturezas_2021-01.csv", month: "2021-01", sha256: "a".repeat(64),
  bytes: 1400, manifestSha: null, lot: randomUUID(), run: randomUUID(), records: 25, persisted: 25,
  status: "reenvio", role: "Administrador", issues: 0, at: "2026-11-23T15:00:00.000Z",
};
const lot = {
  id: lotId, arquivo: "teste_importacao_campo.csv", competencia: "2021-01", contrato: "geral-v1", formato: "CSV",
  data: date, responsavel: "Operador", situacao: "concluida", execucao: runId,
  recebidos: 13, candidatas: null, pendencias: 2, novas: null, reutilizadas: null,
};
const lots = Array.from({ length: 26 }, (_, i) => i === 0 ? lot : {
  ...lot, id: randomUUID(), arquivo: `teste-planilha-${i}.xlsx`, formato: "XLSX", situacao: "falhou",
});
const detail = {
  ...lot, sha256: "b".repeat(64), bytes: 1400, fonte: "IMPORTACAO-GERAL-LOCAL", shaXml: null, manifesto: null, pacote: null,
  tentativas: [], historico: [], revisao: "e".repeat(64), compartilhadas: 0, lotesRelacionados: 0,
  recebidosAfetados: 13, candidatasAfetadas: 0, pendenciasAfetadas: 2, vinculosConsolidados: 0,
};
const preview = {
  id: lotId, arquivo: lot.arquivo, competencia: lot.competencia, contrato: lot.contrato,
  revisao: detail.revisao, candidatas: 0, compartilhadas: 0, quantidades: {
    lotes: 1, execucoes: 1, staging: 13, origens: 13, extracoes: 1, pendencias: 2,
    correcoes: 0, inativacoes: 0, recibos: 1, entregas: 0, aprovacoes: 0, auditorias: 2, artefatos: 0,
  },
};
const deletion = { acao: "excluir_lote", id: lotId, confirmacao: lotId, definitiva: true, revisao: detail.revisao };
const api = "/api/v1/ocorrencias/gestao";

async function login(account) {
  const response = await fetch(origin + "/auth/login", {
    method: "POST", redirect: "manual", headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: account.email, password }),
  });
  assert.equal(response.status, 303);
  const session = response.headers.get("set-cookie")?.split(";")[0];
  assert.match(session, /^sentinela-local-session=[a-f0-9]{64}$/);
  return session;
}

async function verifyViewport(page, width) {
  await page.setViewportSize({ width, height: 960 });
  const area = page.locator("#consulta-arquivos");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + " px: rolagem da página");
  const overflow = await area.evaluate(element => {
    if (element.scrollWidth <= element.clientWidth + 1) return null;
    const right = element.getBoundingClientRect().right;
    return {
      scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
      oversize: [...element.querySelectorAll("*")].filter(node => node.getBoundingClientRect().right > right + 1)
        .slice(0, 10).map(node => [node.tagName, node.className, Math.round(node.getBoundingClientRect().right)]),
    };
  });
  assert.equal(overflow, null, width + " px: rolagem no card " + JSON.stringify(overflow));
  const inputs = await area.locator("input, select").evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, width: rect.width, height: rect.height };
  }));
  assert.ok(inputs.every(item => item.height >= 40 && item.width >= 100));
  if (width === 1440 && inputs.length === 3) {
    assert.equal(new Set(inputs.map(item => item.top)).size, 1);
    assert.ok(inputs[0].width > inputs[1].width && Math.abs(inputs[1].width - inputs[2].width) <= 1);
  }
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const managed of [false, true]) {
    const id = randomUUID();
    const run = httpValidation(id, { port: 3318 });
    await freePort(3318);
    await run.prepare();
    try {
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
        !/^(PG|SENTINELA_|SUPABASE|NEXT_PUBLIC_SUPABASE)/i.test(key)));
      const child = run.start({ ...env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1",
        SENTINELA_APP_ORIGIN: origin, SENTINELA_AUTH_PROVIDER: "local", SENTINELA_LOCAL_ACCOUNTS_FILE: accountPath,
        SENTINELA_HTTP_VALIDATION_ID: id, SENTINELA_PCDF_LOCAL_ID: randomUUID(), SENTINELA_PCDF_LOCAL_SYSTEM_ID: "12345678901234567",
        SENTINELA_PCDF_LOCAL_START: "1700000000", SENTINELA_PCDF_SYNTHETIC: "1", SENTINELA_OCCURRENCES_QUALIFICATION: "1",
        SENTINELA_OCCURRENCE_MANAGEMENT: managed ? "1" : "0", SENTINELA_PCDF_V2_SYNTHETIC_WRITE: "0",
        SENTINELA_DATABASE_URL: "", SENTINELA_DATABASE_SSLROOTCERT: "", SENTINELA_MANUAL_GEOCODER_URL: "",
        SENTINELA_PCDF_LOCAL_PASSWORD_sentinela_local_admin: "", SENTINELA_PCDF_LOCAL_PASSWORD_sentinela_local_operator: "",
        SENTINELA_PCDF_LOCAL_PASSWORD_sentinela_local_analyst: "", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      }, "ignore");
      const deadline = Date.now() + 180000;
      let ready = false;
      while (child.exitCode === null && Date.now() < deadline) {
        const ping = await fetch(origin + "/login", { signal: AbortSignal.timeout(5000) }).catch(() => null);
        if (ping?.ok) { ready = true; break; }
        await delay(400);
      }
      assert.ok(ready, "A instância isolada não respondeu.");
      run.proveListener();

      let scenario = "initial", blocked = false, refreshes = 0, mutations = 0;
      async function open(index) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
        const session = await login(accounts[index]);
        const [name, value] = session.split("=");
        await context.addCookies([{ name, value, url: origin }]);
        await context.route(/^https?:/, async route => {
          const req = route.request(), url = new URL(req.url());
          if (url.origin !== origin) return route.abort();
          if (!url.pathname.startsWith("/api/")) return route.continue();
          if (req.method() !== "GET") { mutations++; return route.abort(); }
          const query = url.searchParams;
          if (url.pathname === api && query.get("view") === "disponibilidade") return route.fulfill({
            json: success({ catalogoGestao: managed, escrita: index ? "sem_permissao" : managed ? "disponivel" : "ambiente_bloqueado" }),
          });
          if (url.pathname === "/api/v1/ocorrencias/consulta") return route.fulfill({
            json: success(query.get("view") === "resumo" ? summary : { pagina: 1, total: 0, itens: [] }),
          });
          if (url.pathname === api && query.get("view") === "arquivo") return route.fulfill({
            json: success({ ...detail, bloqueiaConsolidacao: false }),
          });
          if (url.pathname === api && query.get("view") === "previa_exclusao") return route.fulfill({
            json: success({ ...preview, bloqueios: blocked ? [{ tipo: "consolidacao", quantidade: 1, ids: [runId] }] : [] }),
          });
          if (url.pathname === "/api/v1/importacoes/geral/" + runId) return route.fulfill({ json: {
            success: true, scope: "importacao-local", data: { total: 1, headers: ["Campo verificado"], rows: [
              { line: 1, status: "valido", cells: [{ value: "Fixture de leitura" }], issues: [] },
            ] },
          } });
          const generalPath = "/api/v1/importacoes/geral";
          const pcdfPath = "/api/v1/importacoes/pcdf/direta";
          if (![api, generalPath, pcdfPath].includes(url.pathname)) return route.abort();
          refreshes++;
          await delay(200);
          if (scenario === "failed") return route.fulfill({ status: 503, json: { success: false, error: { message: "Histórico indisponível no ensaio." } } });
          if (url.pathname === api) {
            const all = scenario === "empty" ? [] : scenario === "long" ? lots : [lot];
            const items = all.filter(item => !query.get("busca") || item.arquivo.includes(query.get("busca")));
            const page = Number(query.get("pagina") ?? 1);
            const rows = items.slice((page - 1) * 25, page * 25).map(item => ({ ...item, acoes: {
              edicao: "contrato", bloqueiosExclusao: blocked ? [{ tipo: "consolidacao", quantidade: 1, ids: [runId] }] : [],
            } }));
            return route.fulfill({ json: success({ pagina: page, total: items.length, itens: rows }) });
          }
          const records = url.pathname === generalPath ? scenario === "long" ? general : [general[0]] : [pcdf];
          return route.fulfill({ json: {
            success: true, ...(url.pathname === generalPath && { scope: "importacao-local" }),
            data: scenario === "empty" ? [] : records,
          } });
        });
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        page.setDefaultNavigationTimeout(120000);
        await page.goto(origin + "/ocorrencias", { waitUntil: "networkidle" });
        await page.getByRole("button", { name: "Arquivos importados", exact: true }).click();
        return { page, session };
      }

      const { page, session: adminSession } = await open(0);
      const area = page.locator("#consulta-arquivos");
      const table = area.getByRole("region", { name: managed ? "Lotes de importação" : "Importações registradas" });
      const target = table.getByRole("row").filter({ hasText: lot.arquivo });
      const reload = area.getByRole("button", { name: "Atualizar histórico", exact: true });
      const result = managed ? "1 lote encontrado" : "2 importações encontradas";
      await area.getByText(result, { exact: true }).waitFor();
      for (const width of [320, 390, 768, 1024, 1440]) {
        await verifyViewport(page, width);
        if ([390, 1440].includes(width)) {
          if (width === 390) {
            await area.evaluate(node => node.scrollIntoView({ block: "start" }));
            await target.locator("summary").press("Enter");
          }
          if (width === 1440) await page.getByRole("heading", { name: "Ocorrências", exact: true }).scrollIntoViewIfNeeded();
          await page.screenshot({ path: `${output}/${managed ? "lotes" : "historico"}-${width}.png`, style: "nextjs-portal { display:none }" });
        }
      }
      assert.match(await table.locator("time").first().innerText(), /23\/11\/2026/);
      await table.getByRole("columnheader", { name: "Ações", exact: true }).waitFor();
      assert.ok(await target.getByRole("button", { name: /Editar registros/ }).isDisabled());
      assert.equal(await target.getByRole("button", { name: /Excluir arquivo/ }).isEnabled(), managed);
      await target.getByRole("button", { name: /Ver detalhes/ }).click();
      let dialog = page.getByRole("dialog", { name: "Detalhes da importação" });
      if (managed) {
        await dialog.getByRole("heading", { name: "Proveniência e integridade" }).waitFor();
      } else {
        await area.getByText(/A instalação atual autoriza consultas/).waitFor();
        const rejected = await fetch(origin + api, { method: "POST", headers: {
          cookie: adminSession, origin, "content-type": "application/json",
        }, body: JSON.stringify({ ...deletion, justificativa: "Ensaio de proteção" }) });
        assert.equal(rejected.status, 403);
        assert.match((await rejected.json()).error.message, /ambiente sintético de homologação autorizado/);
        await dialog.getByRole("heading", { name: "Histórico da importação" }).waitFor();
        await dialog.getByRole("button", { name: "Abrir registros importados" }).click();
        await dialog.getByText("Registro 1 · Sem avisos", { exact: true }).click();
        await dialog.getByText("Fixture de leitura", { exact: true }).waitFor();
      }
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      if (managed) {
        await target.getByRole("button", { name: /Excluir arquivo/ }).click();
        assert.ok(await page.getByRole("button", { name: "Excluir definitivamente", exact: true }).isDisabled());
        await page.keyboard.press("Escape");
        blocked = true;
        await reload.click();
        await target.getByText(/vínculo impeditivo de consolidação/).waitFor();
        assert.ok(await target.getByRole("button", { name: /Excluir arquivo/ }).isDisabled());
        blocked = false;
      }

      scenario = "long";
      const before = refreshes;
      await reload.click();
      await area.getByText(managed ? "26 lotes encontrados" : "27 importações encontradas", { exact: true }).waitFor();
      assert.ok(refreshes > before);
      const pageNav = area.getByRole("navigation", { name: /Paginação/ });
      await pageNav.getByRole("button", { name: "Próxima" }).click();
      await pageNav.getByText("Página 2 de 2").waitFor();
      await pageNav.getByRole("button", { name: "Anterior" }).click();
      await pageNav.getByText("Página 1 de 2").waitFor();
      const search = area.getByLabel(managed ? "Buscar por arquivo ou lote" : "Buscar pelo nome");
      await search.fill("sem-arquivo-correspondente");
      if (managed) await area.getByRole("button", { name: "Aplicar filtros" }).click();
      await area.getByText(managed ? "Nenhum lote corresponde aos filtros." : "Nenhuma importação corresponde aos filtros.", { exact: true }).waitFor();
      if (managed) await area.getByRole("button", { name: "Limpar filtros" }).click();
      else {
        await search.clear();
        await area.getByLabel("Tipo", { exact: true }).selectOption("CSV");
        await area.getByText("1 importação encontrada", { exact: true }).waitFor();
        await area.getByLabel("Situação", { exact: true }).selectOption("falhou");
        await area.getByText("0 importações encontradas", { exact: true }).waitFor();
        await area.getByLabel("Tipo", { exact: true }).selectOption("");
        await area.getByLabel("Situação", { exact: true }).selectOption("");
      }
      scenario = "empty";
      await reload.click();
      await area.getByText(managed ? "Nenhum lote registrado." : "Nenhuma importação registrada.", { exact: true }).waitFor();
      scenario = "failed";
      await reload.click();
      await area.getByRole("alert").first().waitFor();
      scenario = "initial";
      await reload.click();
      await area.getByText(result, { exact: true }).waitFor();
      await page.context().close();

      if (managed) {
        const { page: operator, session } = await open(1);
        await operator.getByRole("region", { name: "Lotes de importação" }).getByRole("button", { name: "Ver detalhes" }).click();
        const operatorDetail = operator.getByRole("dialog");
        await operatorDetail.getByRole("heading", { name: "Associações e vínculos ativos" }).waitFor();
        assert.equal(await operatorDetail.getByRole("button", { name: /Excluir arquivo/ }).count(), 0);
        const rejected = await fetch(origin + api, { method: "POST", headers: {
          cookie: session, origin, "content-type": "application/json",
        }, body: JSON.stringify({ ...deletion, justificativa: "Ensaio de autorização" }) });
        assert.equal(rejected.status, 403);
        await operator.context().close();
        const { page: analyst } = await open(2);
        await analyst.getByText("A consulta aos arquivos está disponível para Administrador e Operador.").waitFor();
        await analyst.context().close();
      }
      assert.equal(mutations, 0, "A interface consultada não deve enviar mutações.");
      console.log(`${managed ? "Lotes" : "Histórico"}: 320, 390, 768, 1024 e 1440 px; filtros, paginação, detalhes, atualização e estados conferidos.`);
    } finally { await run.finish(); }
  }
} finally { await browser.close(); }
