import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { fixture } from "../tests/fixtures/pcdf-v2-package.mjs";

const base = new URL(process.env.SENTINELA_TEST_URL ?? "http://127.0.0.1:3000");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
const localCookie = process.env.SENTINELA_TEST_LOCAL_COOKIE;
if (localCookie) {
  assert.equal(base.origin, "http://127.0.0.1:3318");
  assert.match(localCookie, /^[a-f0-9]{64}$/);
}
const output = process.env.SENTINELA_SPRINT4_EVIDENCE
  ? join(process.env.SENTINELA_SPRINT4_EVIDENCE, "pcdf-v2") : "tmp/pcdf-v2-import-evidence";
await mkdir(output, { recursive: true });

const { csv, attachments } = fixture(({ rows, provenance, manifest }) => {
  const count = 14;
  const initialRows = rows.slice(), initialProvenance = provenance.slice();
  for (let i = 1; i < count; i++) {
    const number = String(7 + i).padStart(4, "0");
    for (const [position, original] of initialRows.entries()) {
      const line = rows.length + 2;
      const id = createHash("sha256").update(JSON.stringify(["pcdf-linha-v1", manifest.fonte.sha256, "NATUREZAS", line])).digest("hex");
      rows.push({ ...original, numero_registro: number, linha_xml: String(line), linha_origem_id: id,
        ocorrencia_chave: JSON.stringify(["PCDF", original.ano_registro, original.unidade_registro, number]) });
      provenance.push({ ...initialProvenance[position], linha_xml: line, linha_origem_id: id });
    }
  }
  const total = rows.length;
  Object.assign(manifest.reconciliacao, {
    associacoes_csv_v2: total, associacoes_xml: total, ids_distintos: total, originais_reconciliados: total * 18,
    chaves_candidatas_distintas: count, chaves_por_quantidade_de_associacoes: { 2: count },
    naturezas_originais: { "NATUREZA A": count, "NATUREZA B": count }, naturezas_padronizadas: { GRUPO: total },
    crime_tentado: { NÃO: total }, flagrante: { SIM: total }, classificacao_status: { pendente: total },
    coordenada_status: { referencia_pendente: total },
    coordenada_status_v1_para_v2: { "invalida -> referencia_pendente": total },
    pares_coordenadas: { GEO: { referencia_pendente: total }, UTM: { ausente: total } },
  });
});
const payload = file => file.arrayBuffer().then(bytes => ({ name: file.name, mimeType: "application/octet-stream", buffer: Buffer.from(bytes) }));
const parts = await Promise.all([csv, ...attachments].map(payload));
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const width of [1366, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    if (localCookie) await page.context().addCookies([{ name: "sentinela-local-session", value: localCookie, url: base.origin }]);
    const errors = [], writes = [];
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(120000);
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      if (!["GET", "HEAD"].includes(request.method())) writes.push(request.method() + " " + new URL(request.url()).pathname);
    });
    await page.route(/^https?:/, route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
    await page.goto(new URL("/importar", base).href, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: localCookie ? "Importação PCDF" : "Importar ocorrências", exact: true }).waitFor();
    const selectPackage = page.getByRole("button", { name: "Selecionar pacote PCDF v2" });
    const validate = page.getByRole("button", { name: "Validar pacote v2", exact: true });
    const review = page.getByRole("button", { name: "Revisar registros", exact: true });
    const replacePart = page.getByLabel("Adicionar ou substituir anexos");
    const incomplete = parts.filter(part => part.name !== "pendencias_temporais.jsonl");
    if (width === 1366 && !localCookie) {
      const transfer = await page.evaluateHandle(files => {
        const data = new DataTransfer();
        for (const { name, bytes } of files) data.items.add(new File([new Uint8Array(bytes)], name));
        return data;
      }, incomplete.map(({ name, buffer }) => ({ name, bytes: [...buffer] })));
      await page.getByRole("heading", { name: "Arraste um arquivo ou pacote mensal" }).dispatchEvent("drop", { dataTransfer: transfer });
      await transfer.dispose();
    } else {
      await page.getByLabel("Pacote mensal PCDF v2", { exact: true }).setInputFiles(incomplete);
    }
    await page.getByText(/Pacote incompleto.*pendencias_temporais\.jsonl/).waitFor();
    assert.equal(await validate.isDisabled(), true);
    await replacePart.setInputFiles(parts.find(part => part.name === "pendencias_temporais.jsonl"));
    await validate.click();
    await page.getByText(/Integridade do pacote e correspondência da proveniência conferidas/).waitFor();
    assert.match(await page.locator("dl").first().innerText(), /Associações de natureza\s+28.*Ocorrências candidatas distintas\s+14/s);
    await page.getByText("Pendências de localização e quarentena temporal", { exact: true }).click();
    await page.getByText("Referência geográfica pendente", { exact: true }).waitFor();
    await page.getByText(/Confirmação indisponível/).waitFor();
    await page.screenshot({ path: `${output}/validacao-${width}.png` });

    await review.click();
    await page.getByRole("region", { name: "Prévia PCDF", exact: true }).waitFor();
    await page.getByRole("button", { name: "Detalhes do registro 1", exact: true }).click();
    const detail = page.getByRole("dialog");
    for (const value of ["0007", "13/01/2021 09:04:59", "-15.123456789012345", "NULL", "linha_origem_id"]) {
      await detail.getByText(value, { exact: true }).waitFor();
    }
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Ver todos os campos", exact: true }).click();
    const full = page.getByRole("region", { name: "Prévia PCDF · todos os campos" });
    assert.equal(await full.getByRole("columnheader").count(), 27);
    assert.ok(await full.evaluate(element => element.scrollWidth > element.clientWidth));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole("button", { name: "Voltar à prévia resumida" }).click();
    await page.getByRole("button", { name: "Próxima", exact: true }).click();
    await page.getByRole("button", { name: "Detalhes do registro 26", exact: true }).waitFor();
    await page.screenshot({ path: `${output}/previa-${width}.png` });

    await page.getByRole("button", { name: "Voltar à validação" }).click();
    const manifest = parts.find(part => part.name === "manifesto.json");
    await replacePart.setInputFiles({ ...manifest, buffer: Buffer.concat([manifest.buffer, Buffer.from(" ")]) });
    if (!localCookie) assert.equal(await page.getByRole("button", { name: /Etapa 3/ }).isDisabled(), true);
    await validate.click();
    await page.getByRole("alert").filter({ hasText: /SHA-256 de manifesto\.json/ }).waitFor();
    assert.equal(await review.count(), 0);
    await page.getByRole("button", { name: "Remover seleção" }).click();
    if (localCookie) await page.getByLabel("Pacote mensal PCDF v2", { exact: true }).setInputFiles(parts);
    else {
      const [chooser] = await Promise.all([page.waitForEvent("filechooser"), selectPackage.click()]);
      await chooser.setFiles(parts);
    }
    await validate.click();
    await page.getByText(/Integridade do pacote e correspondência da proveniência conferidas/).waitFor();
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    console.log(`${width}px · pacote parcial reparado, manifesto adulterado recusado, pacote completo, prévia e paginação conferidos sem requisição de escrita`);
    await page.close();
  }
} finally {
  await browser.close();
}
