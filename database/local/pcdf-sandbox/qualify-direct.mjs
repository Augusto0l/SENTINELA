import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { Client } from "pg";
import { freePort, httpValidation } from "../../../scripts/http-validation-output.mjs";

const input = [];
for await (const chunk of process.stdin) input.push(chunk);
const { root, analyst } = JSON.parse(Buffer.concat(input).toString("utf8"));
const port = 3318;
const origin = "http://127.0.0.1:" + port;
const route = "/api/v1/importacoes/pcdf/direta";
const password = randomBytes(32).toString("hex");
const roles = ["Administrador", "Operador", "Analista"];
const accounts = roles.map((role, index) => {
  const salt = randomBytes(16).toString("hex");
  return { role, salt, email: "pcdf-qualification-" + index + "@example.test",
    hash: scryptSync(password, Buffer.from(salt, "hex"), 64).toString("hex") };
});
const accountsFile = join(root, "next-accounts.json");
const manifest = await readFile(join(root, "fixture-manifest.json"));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const name = month => "pcdf_naturezas_" + month + ".csv";
const bytes = month => readFile(join(root, name(month)));
const checks = [];
let stage = "preflight";
let lifecycle, browser;

async function login(index) {
  const response = await fetch(origin + "/auth/login", {
    method: "POST", redirect: "manual", headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: accounts[index].email, password }),
  });
  assert.equal(response.status, 303);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.match(cookie ?? "", /^sentinela-local-session=[a-f0-9]{64}$/);
  return cookie;
}

function get(cookie, path = route) {
  return fetch(origin + path, { redirect: "manual", headers: cookie ? { cookie } : {}, signal: AbortSignal.timeout(70000) });
}

function post(cookie, month, csv, { step = "confirmar", producer, digest = sha(csv), site = origin, filename = name(month) } = {}) {
  const body = new FormData();
  body.set("csv", new Blob([csv]), filename);
  if (producer) body.set("manifesto", new Blob([producer]), "manifesto.json");
  if (step === "confirmar") {
    body.set("sha256", digest);
    if (producer) body.set("manifestSha", sha(producer));
  }
  return fetch(origin + route + "?etapa=" + step, {
    method: "POST", headers: { origin: site, ...(cookie && { cookie }) }, body,
    signal: AbortSignal.timeout(85000),
  });
}

async function data(response, status) {
  const result = await response.json();
  const actual = typeof response.status === "function" ? response.status() : response.status;
  assert.equal(actual, status, JSON.stringify(result.error ?? {}));
  assert.equal(result.success, status < 400);
  return status < 400 ? result.data : result.error;
}

async function verifyDbPermissions() {
  for (const user of ["sentinela_local_admin", "sentinela_local_operator", "sentinela_local_analyst"]) {
    const client = new Client({ host: "127.0.0.1", port: 55484, database: "sentinela_pcdf_local", user,
      password: user.endsWith("_analyst") ? analyst : process.env["SENTINELA_PCDF_LOCAL_PASSWORD_" + user],
      connectionTimeoutMillis: 3000 });
    try {
      await client.connect();
      await assert.rejects(client.query("SELECT * FROM sentinela.linhas_origem LIMIT 1"), { code: "42501" });
      await assert.rejects(client.query("INSERT INTO sentinela.ocorrencias DEFAULT VALUES"), { code: "42501" });
      if (user.endsWith("_analyst")) {
        await assert.rejects(client.query("SELECT sentinela_pcdf_local.history()"), { code: "42501" });
        await assert.rejects(client.query("SELECT sentinela_pcdf_local.receive(NULL,NULL,NULL,NULL)"), { code: "42501" });
      }
    } finally { await client.end(); }
  }
}

try {
  await freePort(port);
  await writeFile(accountsFile, JSON.stringify({ accounts }), { flag: "wx" });
  const id = randomUUID();
  lifecycle = httpValidation(id, { port });
  await lifecycle.prepare();
  const child = lifecycle.start({ ...process.env, SENTINELA_LOCAL_ACCOUNTS_FILE: accountsFile,
    SENTINELA_HTTP_VALIDATION_ID: id }, "ignore");
  const deadline = Date.now() + 150000;
  let ready = false;
  while (child.exitCode === null && Date.now() < deadline) {
    const probe = await fetch(origin + "/login", { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (probe?.status === 200) { lifecycle.proveListener(); ready = true; break; }
    await delay(500);
  }
  assert(ready, "Next local não iniciou no prazo");

  stage = "auth_and_permissions";
  const [admin, operator, analystCookie] = await Promise.all([0, 1, 2].map(login));
  const january = "2021-01";
  const januaryBytes = await bytes(january);
  assert.equal(januaryBytes.length, 2948416);
  assert.equal((await get()).status, 401);
  assert.equal((await get(analystCookie)).status, 403);
  assert.equal((await post(analystCookie, january, januaryBytes, { step: "validar" })).status, 403);
  assert.equal((await post(analystCookie, january, januaryBytes)).status, 403);
  assert.equal(new URL((await get(analystCookie, "/importar")).headers.get("location"), origin).href, origin + "/acesso-negado");
  assert.equal((await post(operator, january, januaryBytes, { site: "http://127.0.0.1:6111" })).status, 403);
  await verifyDbPermissions();
  checks.push("sessao, tres perfis, same-origin, privilegios SQL");

  stage = "browser";
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(45000);
  await page.context().addCookies([{ name: admin.split("=")[0], value: admin.split("=")[1], url: origin }]);
  const historyLoaded = page.waitForResponse(r => r.url() === origin + route && r.request().method() === "GET");
  await page.goto(origin + "/importar", { waitUntil: "domcontentloaded" });
  await data(await historyLoaded, 200);
  await page.getByRole("heading", { name: "Importação PCDF", exact: true }).waitFor();
  stage = "browser_preview";
  await page.getByLabel("Arquivo CSV mensal").setInputFiles(join(root, name(january)));
  await page.getByText("Layout PCDF v1.0 reconhecido").waitFor();
  assert.match(await page.getByText("6.393 associações · 34 campos", { exact: false }).innerText(), /2.948.416 bytes/);
  assert.equal(await page.locator("thead th").count(), 36);
  assert.equal(await page.locator("tbody tr").count(), 25);
  assert.equal(await page.locator("tbody tr").first().locator("td").count(), 35);
  await page.getByText("Campos vazios e avisos da validação").click();
  assert.match(await page.getByText(/natureza_original · .* vazios/).innerText(), /1 vazios/);
  assert(await page.getByText(/identidade incompleta/).count() > 0);
  await page.getByRole("button", { name: "Próxima", exact: true }).click();
  assert.equal((await page.locator("tbody tr th").first().innerText()).trim(), "26");
  await page.getByRole("button", { name: "Anterior", exact: true }).click();
  assert.equal((await page.locator("tbody tr th").first().innerText()).trim(), "1");
  assert.deepEqual(await data(await get(admin), 200), []);
  await page.getByRole("button", { name: "Revisar confirmação" }).click();
  stage = "browser_commit";
  const importing = page.waitForResponse(r => r.url() === origin + route + "?etapa=confirmar" && r.request().method() === "POST",
    { timeout: 85000 });
  await page.getByRole("button", { name: "Confirmar importação", exact: true }).click();
  const first = await data(await importing, 201);
  assert.equal(first.records, 6393);
  await page.getByRole("heading", { name: "Gravação confirmada" }).waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Gravada em staging · 6.393 associações · Administrador").waitFor();
  checks.push("selecao, reconhecimento, 34 campos, paginacao, incompletos, confirmacao, historico apos recarregar");

  stage = "api_integrity";
  const february = "2026-02";
  const feb = await bytes(february);
  const preview = await data(await post(operator, february, feb, { step: "validar", producer: manifest }), 200);
  assert.equal(preview.records.length, 3);
  assert.equal(preview.manifestSha, sha(manifest));
  assert.equal(preview.records[0].cells.length, 34);
  assert.equal((await data(await post(operator, february, Buffer.concat([feb, Buffer.from("\r\n")]),
    { step: "validar", producer: manifest }), 422)).diagnostic, "csv_divergente_manifesto");
  const badManifest = JSON.parse(manifest);
  badManifest.fonte.sha256 = "0".repeat(64);
  badManifest.preflight.fonte.sha256 = "0".repeat(64);
  assert.equal((await data(await post(operator, february, feb, { step: "validar", producer: Buffer.from(JSON.stringify(badManifest)) }),
    422)).diagnostic, "proveniencia_linha_invalida");
  assert.equal((await data(await post(operator, february, Buffer.from("campo;outro\n"), { step: "validar" }), 422)).diagnostic,
    "cabecalho_invalido");
  await data(await post(operator, february, feb, { digest: "0".repeat(64) }), 409);
  assert.equal((await data(await post(operator, february, feb, { producer: manifest }), 201)).records, 3);
  const replay = await data(await post(operator, january, januaryBytes, { producer: manifest }), 200);
  assert.equal(replay.lot, first.lot);
  assert.equal(replay.run, first.run);
  assert.equal(replay.replay, true);
  checks.push("manifesto opcional, arquivo e proveniencia adulterados, digest da previa, operador, reenvio");

  stage = "concurrency_and_rollback";
  const march = "2026-03";
  const marchBytes = await bytes(march);
  const results = await Promise.all([admin, operator].map(cookie => post(cookie, march, marchBytes, { producer: manifest })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 201]);
  const [one, two] = await Promise.all(results.map(r => data(r, r.status)));
  assert.equal(one.lot, two.lot);
  assert.equal(one.run, two.run);
  const april = "2026-04";
  await data(await post(operator, april, await bytes(april), { producer: manifest }), 503);
  const history = await data(await get(operator), 200);
  assert.equal(history.length, 6);
  assert.equal(history.filter(x => x.status === "concluida").length, 3);
  assert.equal(history.filter(x => x.status === "reenvio").length, 2);
  assert.equal(history.filter(x => x.status === "falhou" && x.month === april && !x.lot).length, 1);
  assert.equal((await get(admin, "/api/v1/importacoes/pcdf")).status, 403);
  checks.push("concorrencia, rollback tardio, auditoria persistente, rota legada desligada");
  stage = "complete";
} catch (error) {
  console.log(JSON.stringify({ resultado: "REPROVADO", stage, checks, erro: error.message.slice(0, 400) }));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await lifecycle?.finish();
}
if (!process.exitCode) console.log(JSON.stringify({ resultado: "APROVADO", checks }));
