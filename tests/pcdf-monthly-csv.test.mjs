import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { completeHistoricalStatus, directCsvPreview, historicalMonthCount, historicalStatus } from "../src/contracts/pcdf-direct.ts";
import { PcdfV2Error, pcdfV2Headers } from "../src/data/pcdfV2.ts";
import { preparePcdfCsvDelivery } from "../src/lib/db/pcdf-v2-delivery.ts";
import { fixture } from "./fixtures/pcdf-v2-package.mjs";

test("o histórico hospedado aceita inventário parcial com aprovação bloqueada", () => {
  const items = [{ month: "2021-01", sha256: "a".repeat(64), bytes: 100, records: 1, candidates: 1,
    through: "2021-01-31", complete: true, state: "missing", lot: null, unique: null, links: null,
    review: null, issues: null }];
  assert.equal(historicalStatus.safeParse({ items, canApprove: false }).success, true);
  assert.equal(historicalStatus.safeParse({ items, canApprove: true }).success, false);
  assert.equal(completeHistoricalStatus.safeParse({ items, canApprove: false }).success, false);
  assert.equal(historicalStatus.safeParse({ items: [], canApprove: false }).success, true);
  const fullInventory = Array.from({ length: historicalMonthCount }, (_, index) => ({ ...items[0],
    month: new Date(Date.UTC(2021, index, 1)).toISOString().slice(0, 7) }));
  assert.equal(historicalStatus.safeParse({ items: fullInventory, canApprove: true }).success, true);
});

test("o CSV avulso mantém os 26 valores, a identidade declarada e múltiplas naturezas", async () => {
  const { csv } = fixture();
  const { preview, content, batch } = await preparePcdfCsvDelivery(csv);
  assert.equal(directCsvPreview.safeParse(preview).success, true);
  assert.equal(preview.sha256, createHash("sha256").update(Buffer.from(content)).digest("hex"));
  assert.deepEqual(preview.headers, pcdfV2Headers);
  assert.deepEqual(preview.standalone, { invalid: 0, pending: 2, valid: 0, candidates: 1, duplicates: 0, errors: [] });
  assert.equal(preview.manifestSha, null);
  assert.equal(batch.rows[0].raw.numero_registro, "0007");
  assert.equal(batch.rows[0].raw.local, batch.rows[0].raw.quadra_endereco_original);
  assert.ok(batch.rows.every(row => row.diagnostics.some(issue => issue.field === "coordenada_status" && issue.rule === "referencia_pendente")));
  assert.ok(batch.rows.every(row => !("data_inicio_fato_original" in row.raw) && !("ra_codigo" in row.raw)));
});

test("recusa cabeçalho incompleto, coluna extra, nome de coluna divergente, BOM e UTF-8 inválido", async () => {
  for (const change of [
    ({ columns }) => columns.pop(),
    ({ columns }) => columns.push("extra"),
    ({ columns }) => { columns[0] = "ano"; },
    data => { data.mutateCsv = csv => "\uFEFF" + csv; },
  ]) {
    await assert.rejects(preparePcdfCsvDelivery(fixture(change).csv), PcdfV2Error);
  }
  const { csv } = fixture();
  await assert.rejects(preparePcdfCsvDelivery(new File([Uint8Array.of(0xff)], csv.name)), /UTF-8/);
});

test("aponta competência, calendário, hora, estado geográfico e origem duplicada por associação", async () => {
  const { csv } = fixture(({ rows }) => {
    rows[0].data = "2021-02-31";
    rows[0].horario = "26:00:00";
    rows[0].coordenada_status = "ausente";
    rows[1].linha_origem_id = rows[0].linha_origem_id;
  });
  const { preview } = await preparePcdfCsvDelivery(csv);
  assert.equal(preview.standalone.invalid, 2);
  assert.equal(preview.standalone.duplicates, 1);
  assert.deepEqual(preview.standalone.errors.map(error => [error.row, error.field]), [
    [1, "data"], [1, "horario"], [1, "coordenada_status"], [2, "linha_origem_id"],
  ]);
});

test("registra valores ausentes e rótulos de catálogo desconhecidos como pendências", async () => {
  const { csv } = fixture(({ rows }) => {
    rows[0].horario = "";
    rows[0].ra_original = "RA 01_BRASÍLIA";
    rows[0].local = rows[0].quadra_endereco_original = "";
  });
  const { preview, batch } = await preparePcdfCsvDelivery(csv);
  assert.equal(preview.standalone.invalid, 0);
  assert.equal(batch.rows[0].raw.local, "");
  assert.deepEqual(preview.records[0].issues.filter(([field]) =>
    ["horario", "local", "ra_original", "natureza_original", "natureza_padronizada_pcdf"].includes(field)), [
    ["horario", "horario_pendente"], ["local", "endereco_pendente"],
    ["natureza_original", "natureza_fora_do_catalogo"],
    ["ra_original", "ra_pendente_de_correspondencia"],
  ]);
});

test("mantém marcadores de ausência no CSV e grava a pendência geográfica sem duplicatas informativas", async () => {
  const { csv } = fixture(({ rows }) => {
    rows[0].latitude_geo_original = "";
    rows[0].longitude_geo_original = "NULL";
    rows[0].coordenada_status = "ausente";
    rows[1].latitude_geo_original = "91";
    rows[1].coordenada_status = "invalida";
    rows[1].longitude_utm_original = "eixo-inválido";
  });
  const { preview, batch } = await preparePcdfCsvDelivery(csv);
  assert.equal(preview.standalone.invalid, 0);
  assert(preview.records[0].issues.some(([field, rule]) => field === "longitude_geo_original" && rule === "nulo_declarado"));
  assert.equal(batch.rows[0].raw.longitude_geo_original, "NULL");
  assert.equal(batch.rows[0].raw.longitude_utm_original, " ");
  assert.deepEqual(batch.rows.map(row => row.diagnostics.filter(d => d.kind === "coordenadas")
    .map(d => [d.field, d.rule, d.effect])), [
    [["coordenada_status", "ausente", "bloqueia_dimensao"]],
    [["latitude_geo_original", "fora_do_dominio", "bloqueia_dimensao"],
      ["longitude_utm_original", "formato_invalido", "bloqueia_dimensao"],
      ["coordenada_status", "invalida", "bloqueia_dimensao"]],
  ]);
});

test("reconhece a grafia exata da PCDF e mantém categoria e tentativa independentes", async () => {
  const original = "POSSE OU PORTE ILEGAL DE ARMA DE FOGO DE  USO RESTRITO (L.10826/03)";
  const { csv } = fixture(({ rows }) => {
    rows[0].natureza_original = original;
    rows[0].natureza_padronizada_pcdf = "";
    rows[0].classificacao_status = "";
    rows[1].natureza_original = original.replace("DE  USO", "DE USO");
  });
  const { preview, batch } = await preparePcdfCsvDelivery(csv);
  assert.equal(preview.standalone.invalid, 0);
  assert.equal(batch.rows[0].raw.natureza_original, original);
  assert.equal(batch.rows[0].raw.crime_tentado, "NÃO");
  assert.equal(batch.rows[0].raw.natureza_padronizada_pcdf, "");
  assert(!batch.rows[0].diagnostics.some(issue => issue.kind === "classificacao"));
  assert(batch.rows[0].diagnostics.some(issue => issue.kind === "coordenadas"));
  assert(batch.rows[1].diagnostics.some(issue => issue.rule === "natureza_fora_do_catalogo" && issue.effect === "bloqueia_consolidacao"));
});

test("revisão independente recebe opcionais inválidos e conserva o bloqueio de identidade e os originais", async () => {
  const { csv } = fixture(({ rows }) => {
    rows[0].data = "2021-02-31";
    rows[0].horario = "24:00:00";
    rows[0].natureza_original = "";
    rows[0].longitude_utm_original = "inválida";
    rows[1].latitude_geo_original = "NULL";
    rows[1].longitude_geo_original = "";
    rows[1].ocorrencia_chave = '["PCDF","2021","OUTRA UNIDADE","0007"]';
  });
  const { preview, batch } = await preparePcdfCsvDelivery(csv, true);
  assert.equal(preview.standalone.invalid, 0);
  assert.equal(batch.candidates, 1);
  assert.equal(batch.rows[0].raw.data, "2021-02-31");
  assert.equal(batch.rows[0].raw.natureza_original, "");
  const effect = (row, rule) => batch.rows[row].diagnostics.find(d => d.rule === rule)?.effect;
  assert.equal(effect(0, "natureza_ausente"), "nao_bloqueante");
  assert.equal(effect(0, "formato_invalido"), "nao_bloqueante");
  assert.equal(effect(0, "horario_invalido"), "bloqueia_dimensao");
  assert.equal(effect(0, "geo_referencia_pendente"), "bloqueia_dimensao");
  assert.equal(effect(1, "geo_ausente"), "bloqueia_dimensao");
  assert.equal(effect(1, "chave_divergente"), "bloqueia_consolidacao");
  const invalidSource = fixture(({ rows }) => { rows[0].fonte = "OUTRA"; });
  assert.equal((await preparePcdfCsvDelivery(invalidSource.csv, true)).preview.standalone.invalid, 1);
});
