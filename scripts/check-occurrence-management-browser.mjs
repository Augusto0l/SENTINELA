import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { Client } from "pg";
import { freePort, httpValidation } from "./http-validation-output.mjs";

const root = await realpath(process.env.SENTINELA_MANAGEMENT_FIXTURE);
assert.equal(dirname(root).toLowerCase(), (await realpath(tmpdir())).toLowerCase());
assert.match(basename(root), /^sentinela-occurrence-management-[a-z0-9_]+$/i);
const serving = process.argv.includes("--serve");
const blockedMode = process.argv.includes("--blocked");
const fixture = serving ? null : JSON.parse(await readFile(join(root, "browser-fixtures.json"), "utf8"));
const origin = "http://127.0.0.1:3318";
const id = randomUUID();
const run = httpValidation(id, { port: 3318 });
const password = serving ? readFileSync(0, "utf8").replace(/\r?\n$/, "") : randomBytes(32).toString("hex");
assert.ok(password.length >= 12 && password.length <= 1024, "Senha de homologação inválida.");
const accounts = ["Administrador", "Operador", "Analista"].map((role, i) => {
  const salt = randomBytes(16).toString("hex");
  const email = serving && !i ? "admin.homologacao@example.test" : `gestao-fixture-${i}@example.test`;
  const secret = serving && i ? randomBytes(32).toString("hex") : password;
  return { role, email, salt, hash: scryptSync(secret, Buffer.from(salt, "hex"), 64).toString("hex") };
});
const accountPath = join(root, "accounts-" + id + ".json");
await writeFile(accountPath, JSON.stringify({ accounts }), { flag: "wx" });
const output = join(process.env.SENTINELA_SPRINT4_EVIDENCE ?? "tmp/occurrence-persistence-evidence", "edicao");
if (!serving) await mkdir(output, { recursive: true });
let browser;
let prepared = false;
const interrupted = serving ? new Promise(resolve => {
  process.once("SIGINT", resolve);
  process.once("SIGTERM", resolve);
}) : null;
try {
  await freePort(3318);
  await run.prepare();
  prepared = true;
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !key.startsWith("POSTGRES_") && key !== "SENTINELA_MANAGEMENT_FIXTURE"));
  const child = run.start({ ...env, NODE_ENV: "development", SENTINELA_APP_ORIGIN: origin,
    SENTINELA_HTTP_VALIDATION_ID: id, SENTINELA_LOCAL_ACCOUNTS_FILE: accountPath, SENTINELA_AUTH_PROVIDER: "local",
    SENTINELA_PCDF_SYNTHETIC: "1", SENTINELA_PCDF_V2_SYNTHETIC_WRITE: "0", SENTINELA_OCCURRENCE_MANAGEMENT: blockedMode ? "0" : "1",
    SENTINELA_OCCURRENCES_QUALIFICATION: blockedMode ? "1" : "0",
    SENTINELA_PERSISTENT_HOMOLOGATION: "0", SENTINELA_SANDBOX_WRITE: "0", SENTINELA_LOCAL_DEMO: "0",
    SENTINELA_LOCAL_READER_URL: "", SENTINELA_DATABASE_URL: "", SENTINELA_DATABASE_SSLROOTCERT: "", SENTINELA_MANUAL_GEOCODER_URL: "",
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_TELEMETRY_DISABLED: "1",
  }, "inherit", { detached: serving });
  const deadline = Date.now() + 180000;
  let ready = false;
  while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
    const ping = await fetch(origin + "/login", { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (ping?.ok) { ready = true; break; }
    await delay(400);
  }
  assert.ok(ready, "Next.js de qualificação não respondeu.");
  run.proveListener();
  if (serving) {
    await proveManualWorkspace();
    console.log(`\nHomologação sintética disponível em ${origin}/ocorrencias\nConta Administrador: ${accounts[0].email}\nUse a senha definida neste terminal. Ctrl+C encerra a aplicação e o banco.\n`);
    await Promise.race([interrupted, new Promise((resolve, reject) =>
      child.once("exit", code => code === 0 ? resolve() : reject(Error("Next.js de homologação encerrou."))))]);
  } else await exercise();
} finally {
  await browser?.close();
  try { if (prepared) await run.finish(); }
  finally { await unlink(accountPath); }
}

async function proveManualWorkspace() {
  const login = await fetch(origin + "/auth/login", { method: "POST", redirect: "manual",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: accounts[0].email, password }), signal: AbortSignal.timeout(60000) });
  assert.equal(login.status, 303);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.match(cookie ?? "", /^sentinela-local-session=[a-f0-9]{64}$/);
  const api = origin + "/api/v1/ocorrencias/gestao?view=";
  try {
    const capability = await fetch(api + "disponibilidade", { headers: { cookie }, signal: AbortSignal.timeout(60000) });
    assert.equal(capability.status, 200);
    assert.equal((await capability.json()).data.escrita, "disponivel");
    const catalog = await fetch(api + "arquivos", { headers: { cookie }, signal: AbortSignal.timeout(30000) });
    assert.equal(catalog.status, 200);
    const { itens } = (await catalog.json()).data;
    assert.equal(itens.length, 2);
    assert.ok(itens.every(lot => lot.acoes?.edicao === "disponivel" && lot.acoes.bloqueiosExclusao.length === 0));
  } finally {
    const logout = await fetch(origin + "/auth/logout", { method: "POST", redirect: "manual",
      headers: { origin, cookie, "content-type": "application/x-www-form-urlencoded" }, body: "",
      signal: AbortSignal.timeout(10000) });
    assert.equal(logout.status, 303);
  }
}

async function exercise() {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const viewport = [1440, 390];
  async function open(user, width) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route(url => url.origin !== origin, route => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    page.setDefaultNavigationTimeout(120000);
    await page.goto(origin + "/login");
    await page.getByLabel(/e-mail/i).fill(accounts[user].email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    const signedIn = page.waitForResponse(response => response.url() === origin + "/auth/login" && response.status() === 303);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await signedIn;
    await page.waitForURL(url => url.pathname !== "/login");
    return page;
  }
  const consultation = "/api/v1/ocorrencias/consulta";
  const management = "/api/v1/ocorrencias/gestao";
  const proof = [];
  async function read(page, path, query) {
    const response = await page.request.get(origin + path, { params: query });
    assert.equal(response.status(), 200);
    return (await response.json()).data;
  }
  async function fileAction(row, name) {
    await row.waitFor();
    const menu = row.locator("summary");
    if (await menu.isVisible() && !await row.locator("details[open]").count()) {
      await menu.focus();
      await menu.press("Enter");
    }
    return row.getByRole("button", { name: new RegExp("^" + name + " de ") });
  }
  async function sql(statement, values) {
    const client = new Client({ host: "127.0.0.1", port: 55488, database: "sentinela_pcdf_local", user: "postgres",
      password: await readFile(join(root, "setup-password"), "ascii"), options: "-c default_transaction_read_only=on",
      connectionTimeoutMillis: 3000, statement_timeout: 8000 });
    try {
      await client.connect();
      const { rows: [identity] } = await client.query(`SELECT current_setting('data_directory') AS directory,
        current_setting('sentinela.sandbox_uuid', true) AS marker, inet_server_port() AS port,
        current_setting('transaction_read_only') AS readonly`);
      assert.equal(await realpath(identity.directory), await realpath(join(root, "data")));
      assert.equal(identity.marker, process.env.SENTINELA_PCDF_LOCAL_ID);
      assert.equal(identity.port, 55488);
      assert.equal(identity.readonly, "on");
      return (await client.query(statement, values)).rows[0];
    } finally { await client.end(); }
  }
  function countLot(target) {
    return sql(`SELECT
      (SELECT count(*)::int FROM sentinela.lotes_importacao WHERE id=$1) AS lotes,
      (SELECT count(*)::int FROM sentinela.execucoes_importacao WHERE lote_id=$1) AS execucoes,
      (SELECT count(*)::int FROM sentinela.linhas_staging WHERE lote_id=$1) AS staging,
      (SELECT count(*)::int FROM sentinela.linhas_origem WHERE id=ANY($3::uuid[])) AS origens,
      (SELECT count(*)::int FROM sentinela.pendencias_revisao WHERE linha_origem_id=ANY($3::uuid[])) AS pendencias,
      (SELECT count(*)::int FROM sentinela_pcdf_local.entregas_pacote WHERE execucao_id=$2) AS entregas,
      (SELECT count(*)::int FROM sentinela.eventos_auditoria WHERE execucao_id=$2 OR depois->>'loteId'=$1::uuid::text) AS auditorias,
      (SELECT count(*)::int FROM sentinela_exclusao.comprovantes WHERE lote=$1) AS comprovantes`,
    [fixture.deleteLot, target.execucao, target.origens]);
  }
  if (blockedMode) {
    const page = await open(0, 1440);
    await page.goto(origin + "/ocorrencias");
    await page.getByRole("button", { name: "Arquivos importados", exact: true }).click();
    await page.getByText(/A instalação atual autoriza consultas/).waitFor();
    const row = page.getByRole("region", { name: "Importações registradas" }).getByRole("row").filter({ hasText: "pcdf_naturezas" }).first();
    for (const label of ["Editar registros", "Excluir arquivo"]) assert.ok(await (await fileAction(row, label)).isDisabled());
    assert.equal((await read(page, management, { view: "disponibilidade" })).escrita, "ambiente_bloqueado");
    for (const acao of ["excluir_lote", "corrigir_associacao"]) {
      const response = await page.request.post(origin + management, { headers: { origin }, data: { acao } });
      assert.equal(response.status(), 403);
      assert.match((await response.json()).error.message, /homologação autorizado/);
    }
    await page.screenshot({ path: `${output}/ambiente-bloqueado.png`, style: "nextjs-portal { display:none }" });
    console.log("Ambiente sem autorização verificado com o servidor real e histórico PCDF sintético.");
    return;
  }
  for (const width of viewport) {
    const page = await open(0, width);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin + "/ocorrencias", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Arquivos importados", exact: true }).click();
    assert.equal((await read(page, management, { view: "disponibilidade" })).escrita, "disponivel");
    await page.getByLabel("Buscar por arquivo ou lote").fill(fixture.lot);
    await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
    const table = page.getByRole("region", { name: "Lotes de importação" });
    const row = table.getByRole("row").filter({ hasText: fixture.lot });
    await row.waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const details = await fileAction(row, "Ver detalhes");
    for (const action of ["Ver detalhes", "Editar registros", "Excluir arquivo"])
      assert.ok(await row.getByRole("button", { name: new RegExp("^" + action + " de ") }).isEnabled());
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/arquivos-${width}.png`, style: "nextjs-portal { display:none }" });
    await details.click();
    const detail = page.getByRole("dialog", { name: "Detalhes da importação" });
    await detail.getByRole("heading", { name: "Proveniência e integridade" }).waitFor();
    await detail.getByRole("heading", { name: "Histórico da operação" }).waitFor();
    await page.keyboard.press("Escape");
    await detail.waitFor({ state: "hidden" });

    const scopedResponse = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === consultation && url.searchParams.get("lote") === fixture.lot;
    });
    await (await fileAction(row, "Editar registros")).click();
    const records = page.getByRole("dialog", { name: "Editar registros", exact: true });
    await records.getByText("1 associação encontrada").waitFor();
    const { data: scoped } = await (await scopedResponse).json();
    assert.equal(scoped.total, 1);
    const [association] = scoped.itens;
    assert.equal(association.lote, fixture.lot);
    const raw = await sql("SELECT campos_csv FROM sentinela.linhas_staging WHERE id=$1", [association.id]);
    const all = await read(page, consultation, { view: "importados" });
    const other = all.itens.find(item => item.lote !== fixture.lot && item.competencia === association.competencia);
    assert.ok(other);
    const search = records.getByLabel("Buscar associação");
    await search.fill(other.id);
    await records.getByRole("button", { name: "Buscar", exact: true }).click();
    await records.getByText("0 associações encontradas").waitFor();
    await search.fill(association.identificacao ?? association.id);
    await records.getByRole("button", { name: "Buscar", exact: true }).click();
    await records.getByText("1 associação encontrada").waitFor();
    await records.getByRole("button", { name: "Editar", exact: true }).click();
    const correction = page.getByRole("dialog", { name: "Corrigir associação" });
    await correction.getByRole("button", { name: "Salvar alterações", exact: true }).click();
    await correction.getByText("Informe a justificativa.").waitFor();
    const newLocal = "Local sintético revisado " + width;
    await correction.getByLabel("Local para revisão").fill(newLocal);
    await correction.getByLabel("Justificativa").fill("Revisão administrativa no navegador");
    assert.equal(await correction.locator("input[name], textarea[name]").count(), 5);
    await correction.screenshot({ path: `${output}/pcdf-${width}.png` });
    const editResponse = page.waitForResponse(response => response.url().endsWith(management) && response.request().method() === "POST");
    await correction.getByRole("button", { name: "Salvar alterações", exact: true }).click();
    const edit = await editResponse;
    assert.equal(edit.request().postDataJSON().lote, fixture.lot);
    assert.equal(edit.status(), 200);
    const { data: receipt, meta } = await edit.json();
    assert.equal(meta.execution.persisted, true);
    await correction.waitFor({ state: "hidden" });
    await records.getByText(new RegExp(newLocal)).waitFor();
    const persisted = await read(page, management, { view: "importados", id: association.id });
    assert.equal(persisted.local, newLocal);
    assert.equal(persisted.historico[0].id, receipt.auditoria);
    assert.equal(persisted.historico[0].antes.local, association.local);
    assert.equal(persisted.historico[0].depois.local, newLocal);
    await page.getByText("Alteração registrada com auditoria.").waitFor();
    await page.keyboard.press("Escape");
    await records.waitFor({ state: "hidden" });
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Arquivos importados", exact: true }).click();
    await page.getByLabel("Buscar por arquivo ou lote").fill(fixture.lot);
    await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
    await (await fileAction(row, "Editar registros")).click();
    await records.getByText(new RegExp(newLocal)).waitFor();
    await page.keyboard.press("Escape");
    await records.waitFor({ state: "hidden" });
    const persistedSql = await sql(`SELECT s.campos_csv,a.depois->'campos'->>'local' AS local
      FROM sentinela.linhas_staging s JOIN sentinela.eventos_auditoria a ON a.id=$2
      WHERE s.id=$1 AND a.acao='corrigir_associacao' AND a.depois->>'stagingId'=s.id::text`, [association.id, receipt.auditoria]);
    assert.equal(persistedSql.local, newLocal);
    assert.deepEqual(persistedSql.campos_csv, raw.campos_csv);

    await page.getByLabel("Buscar por arquivo ou lote").fill(fixture.blockedLot);
    await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
    const unsafe = table.getByRole("row").filter({ hasText: fixture.blockedLot });
    assert.ok(await (await fileAction(unsafe, "Excluir arquivo")).isDisabled());
    await unsafe.getByText(/vínculo impeditivo de consolidação/).waitFor();
    const unsafePreview = await read(page, management, { view: "previa_exclusao", id: fixture.blockedLot });
    const purge = { acao: "excluir_lote", id: fixture.blockedLot, confirmacao: fixture.blockedLot,
      justificativa: "Teste de dependência em homologação", definitiva: true, revisao: unsafePreview.revisao };
    assert.equal((await page.request.post(origin + management, { headers: { origin }, data: purge })).status(), 409);

    await page.getByLabel("Buscar por arquivo ou lote").fill(fixture.deleteLot);
    await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
    const deletionRow = table.getByRole("row").filter({ hasText: fixture.deleteLot });
    const deleteButton = await fileAction(deletionRow, "Excluir arquivo");
    assert.ok(await deleteButton.isEnabled());
    await deleteButton.click();
    const dialog = page.getByRole("dialog", { name: "Excluir definitivamente esta importação?" });
    await dialog.getByText("Registros de origem compartilhados preservados", { exact: true }).waitFor();
    const confirm = dialog.getByRole("button", { name: "Excluir definitivamente", exact: true });
    const confirmation = dialog.getByRole("textbox", { name: /Digite o identificador/ });
    await confirmation.fill(fixture.deleteLot);
    await dialog.getByRole("checkbox", { name: /Confirmo a exclusão permanente/ }).check();
    assert.equal(await confirm.isDisabled(), true);
    await dialog.getByLabel("Justificativa").fill("Cenário sintético de navegador");
    await confirmation.fill(randomUUID());
    assert.equal(await confirm.isDisabled(), true);
    await confirmation.fill(fixture.deleteLot);
    assert.equal(await confirm.isEnabled(), true);
    await dialog.screenshot({ path: `${output}/exclusao-previa-${width}.png` });
    const result = { width, loteEditado: fixture.lot, associacao: association.id, auditoriaEdicao: receipt.auditoria,
      edicaoVisivelAposRecarregar: true, originalPreservado: true, loteExclusao: fixture.deleteLot, loteBloqueado: fixture.blockedLot };
    if (width === 390) {
      const before = await read(page, consultation, { view: "resumo" });
      const target = await sql(`SELECT e.id AS execucao, ARRAY(SELECT s.linha_origem_id FROM sentinela.linhas_staging s
        WHERE s.lote_id=e.lote_id) AS origens FROM sentinela.execucoes_importacao e WHERE e.lote_id=$1`, [fixture.deleteLot]);
      const sqlBefore = await countLot(target);
      assert.equal(sqlBefore.staging, 2);
      assert.equal(sqlBefore.entregas, 1);
      const signal = page.waitForResponse(response => response.url().endsWith(management)
        && response.request().method() === "POST" && response.request().postDataJSON().acao === "excluir_lote");
      await confirm.click();
      const deletion = await signal;
      assert.equal(deletion.status(), 200);
      const { data: purge, meta: deletionMeta } = await deletion.json();
      assert.equal(deletionMeta.execution.persisted, true);
      await deletionRow.waitFor({ state: "hidden" });
      assert.equal((await page.request.get(origin + management, { params: { view: "arquivo", id: fixture.deleteLot } })).status(), 404);
      const after = await read(page, consultation, { view: "resumo" });
      assert.equal(after.recebidas, before.recebidas - sqlBefore.staging);
      assert.equal((await read(page, consultation, { view: "importados", lote: fixture.deleteLot })).total, 0);
      const sqlAfter = await countLot(target);
      assert.deepEqual(sqlAfter, { lotes: 0, execucoes: 0, staging: 0, origens: 0, pendencias: 0,
        entregas: 0, auditorias: 0, comprovantes: 1 });
      assert.deepEqual(await countLot(target), sqlAfter);
      await page.locator("dl").filter({ hasText: "Associações PCDF ativas em staging" }).getByText(String(after.recebidas), { exact: true }).first().waitFor();
      await page.getByRole("button", { name: "Comprovantes de exclusão" }).click();
      const history = page.getByRole("dialog", { name: "Comprovantes de exclusão" });
      await history.getByRole("heading", { name: "Lote " + fixture.deleteLot }).waitFor();
      const proofs = await read(page, management, { view: "exclusoes" });
      assert.equal(proofs.itens.filter(item => item.lote === fixture.deleteLot && item.id === purge.auditoria).length, 1);
      Object.assign(result, { comprovante: purge.auditoria, recebidasAntes: before.recebidas, recebidasDepois: after.recebidas,
        sqlAntes: sqlBefore, sqlDepoisPorNovaConexao: sqlAfter });
      await history.screenshot({ path: `${output}/comprovantes-${width}.png` });
    } else {
      await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal((await read(page, management, { view: "arquivo", id: fixture.deleteLot })).id, fixture.deleteLot);
      result.cancelou = true;
    }
    proof.push(result);
    assert.deepEqual(errors, []);
    await page.context().close();
  }
  await writeFile(join(output, "exclusao-navegador.json"), JSON.stringify(proof, null, 2) + "\n");
  async function assertNoWrites(page) {
    const revision = "0".repeat(64);
    for (const data of [
      { acao: "excluir_lote", id: fixture.lot, confirmacao: fixture.lot, definitiva: true, revisao: revision, justificativa: "Teste de perfil" },
      { acao: "corrigir_associacao", id: proof[0].associacao, lote: fixture.lot, revisao: revision, justificativa: "Teste de perfil", alteracoes: { local: "Teste" } },
    ]) assert.equal((await page.request.post(origin + management, { headers: { origin }, data })).status(), 403);
    assert.equal((await read(page, management, { view: "disponibilidade" })).escrita, "sem_permissao");
  }
  for (const [index, width] of viewport.entries()) {
    const id = fixture.manuals[index];
    const oper = await open(1, width);
    const errors = [];
    const writes = [];
    oper.on("pageerror", error => errors.push(error.message));
    oper.on("request", request => {
      if (request.method() === "POST" && request.url().endsWith("/api/v1/ocorrencias/gestao")) writes.push(request);
    });
    await oper.goto(origin + "/ocorrencias", { waitUntil: "networkidle" });
    assert.equal(await oper.getByRole("button", { name: "Corrigir associação" }).count(), 0);
    await oper.getByRole("button", { name: "Arquivos importados", exact: true }).click();
    const file = oper.getByRole("region", { name: "Lotes de importação" }).getByRole("row").filter({ hasText: "pcdf_naturezas_2021-01.csv" }).first();
    await (await fileAction(file, "Ver detalhes")).waitFor();
    assert.equal(await file.getByRole("button", { name: /Editar registros|Excluir arquivo/ }).count(), 0);
    await oper.getByText("Edição e exclusão exigem o perfil Administrador.").waitFor();
    await assertNoWrites(oper);
    await oper.getByRole("button", { name: "Cadastro manual", exact: true }).click();
    const manualPanel = oper.locator("#consulta-manuais");
    await manualPanel.getByLabel("Buscar por identificação").fill(id);
    await manualPanel.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
    const manual = manualPanel.getByRole("row").filter({ hasText: id });
    await manual.getByRole("button", { name: "Editar ocorrência", exact: true }).click();
    const edit = oper.getByRole("dialog", { name: "Editar ocorrência" });
    assert.equal(await edit.getByLabel("CEP *", { exact: true }).inputValue(), "70070-010");
    const date = edit.getByLabel("Data *", { exact: true });
    await date.fill("2025-01-04");
    await edit.getByLabel("Latitude *", { exact: true }).fill(String(fixture.moved.coordenadas.latitude));
    await edit.getByLabel("Longitude *", { exact: true }).fill(String(fixture.moved.coordenadas.longitude));
    await edit.getByLabel("Região Administrativa *", { exact: true }).selectOption(fixture.moved.codigo);
    await edit.getByRole("button", { name: "Continuar", exact: true }).click();
    await edit.getByText("Confirme um ponto válido no mapa para continuar.").waitFor();
    await edit.getByRole("button", { name: "Confirmar ponto no mapa", exact: true }).click();
    assert.ok(await edit.evaluate(element => element.scrollWidth <= element.clientWidth));
    await edit.screenshot({ path: `${output}/localizacao-${width}.png` });
    await edit.getByRole("button", { name: "Continuar", exact: true }).click();
    assert.equal(await edit.getByLabel("Descrição do fato").inputValue(), "Descrição original sintética");
    assert.equal(await edit.getByLabel("Quantidade de vítimas").inputValue(), "0");
    await edit.getByRole("button", { name: "Remover natureza 2", exact: true }).click();
    await edit.getByRole("button", { name: "Adicionar natureza", exact: true }).click();
    await edit.getByRole("combobox", { name: "Natureza 2", exact: true }).fill("Natureza sintetica C");
    await edit.getByRole("option", { name: /Natureza sintetica C/ }).click();
    await edit.getByLabel("Tentativa 2").selectOption("tentado");
    await edit.getByLabel("Descrição do fato").fill("Descrição sintética do navegador");
    const authors = edit.getByLabel("Quantidade de autores");
    await authors.fill("-1");
    await edit.getByRole("button", { name: "Salvar alterações", exact: true }).click();
    assert.equal(await authors.getAttribute("aria-invalid"), "true");
    assert.equal(writes.length, 0);
    assert.equal(await edit.getByLabel("Descrição do fato").inputValue(), "Descrição sintética do navegador");
    await authors.fill("2");
    await edit.getByLabel("Justificativa").fill("Correção sintética do navegador");
    await edit.getByRole("checkbox", { name: /Confirmo a atualização/ }).check();
    await edit.screenshot({ path: `${output}/edicao-${width}.png` });
    await edit.getByRole("button", { name: "Salvar alterações", exact: true }).click();
    await edit.waitFor({ state: "hidden" });
    await oper.getByText("Alteração registrada com auditoria.").waitFor();
    assert.equal(writes.length, 1);
    await manual.getByRole("button", { name: /Ver detalhes/ }).click();
    const detail = oper.getByRole("dialog", { name: "Detalhes do cadastro manual" });
    await detail.getByText("04/01/2025", { exact: true }).waitFor();
    await detail.getByText("Descrição sintética do navegador", { exact: true }).waitFor();
    await detail.getByText(/Natureza sintetica C.*Tentativa: sim/).waitFor();
    await oper.keyboard.press("Escape");
    await manual.getByRole("button", { name: "Inativar ocorrência", exact: true }).click();
    const retire = oper.getByRole("dialog", { name: "Inativar ocorrência" });
    await retire.getByText("Naturezas vinculadas", { exact: true }).waitFor();
    await retire.getByLabel("Justificativa").fill("Inativação sintética");
    const confirm = retire.getByRole("button", { name: "Confirmar inativação", exact: true });
    assert.equal(await confirm.isDisabled(), true);
    await retire.getByRole("textbox", { name: /Digite o identificador/ }).fill(id);
    await retire.screenshot({ path: `${output}/inativacao-${width}.png` });
    await confirm.click();
    await manualPanel.getByText("Nenhum registro corresponde aos filtros.", { exact: true }).waitFor();
    assert.equal(writes.length, 2);
    assert.deepEqual(errors, []);
    await oper.context().close();
  }
  const analyst = await open(2, 1366);
  await analyst.goto(origin + "/ocorrencias?manual=" + fixture.restricted, { waitUntil: "networkidle" });
  const allowedDetail = analyst.getByRole("dialog", { name: "Detalhes do cadastro manual" });
  await allowedDetail.getByText(fixture.restricted, { exact: true }).waitFor();
  await analyst.keyboard.press("Escape");
  const readonlyRow = analyst.getByRole("row").filter({ hasText: fixture.restricted });
  await readonlyRow.getByRole("button", { name: /Ver detalhes/ }).waitFor();
  assert.equal(await readonlyRow.getByRole("button").count(), 1);
  await analyst.getByRole("button", { name: "Arquivos importados", exact: true }).click();
  await analyst.getByText("A consulta aos arquivos está disponível para Administrador e Operador.").waitFor();
  assert.equal(await analyst.getByRole("button", { name: /Excluir arquivo|Comprovantes de exclusão/ }).count(), 0);
  await assertNoWrites(analyst);
  for (const path of ["/dashboard", "/mapa-criminal"]) {
    const [response] = await Promise.all([
      analyst.waitForResponse(result => new URL(result.url()).pathname === "/api/v1/analytics/persistente"),
      analyst.goto(origin + path),
    ]);
    assert.equal(response.status(), 200);
    const { data } = await response.json();
    assert.equal(data.total, 0);
    assert.equal(data.regions.length, 37);
  }
  await analyst.context().close();

  const importPage = await open(0, 1366);
  const cookie = (await importPage.context().cookies(origin)).find(item => item.name === "sentinela-local-session");
  assert(cookie);
  await importPage.context().close();
  const preview = spawn(process.execPath, ["scripts/check-pcdf-v2-browser.mjs"], {
    env: { ...process.env, SENTINELA_TEST_URL: origin, SENTINELA_TEST_LOCAL_COOKIE: cookie.value }, stdio: "inherit",
  });
  await new Promise((resolve, reject) => {
    preview.once("error", reject);
    preview.once("exit", code => code === 0 ? resolve() : reject(Error("Qualificação da prévia PCDF v2 falhou.")));
  });
  console.log("Edge desktop 1440 px e mobile 390 px. Revisão PCDF, cancelamento, exclusão física, comprovante e perfis aprovados.");
}
