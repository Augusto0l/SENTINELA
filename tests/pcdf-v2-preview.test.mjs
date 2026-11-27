import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectPcdfCsv, selectPcdfV2Files, validatePcdfV2 } from "../src/data/pcdfV2.ts";
import { csvName, fixture } from "./fixtures/pcdf-v2-package.mjs";

test("reconhece cabeçalhos v1 e v2 ordenados, sem inferir versão pelo tamanho", async () => {
  const legacyParser = readFileSync(new URL("../database/local/pcdf-sandbox/pipeline.py", import.meta.url), "utf8");
  const legacyHeader = [...legacyParser.match(/HEADERS = \(([\s\S]*?)\)/)[1].matchAll(/"([a-z_]+)"/g)].map(match => match[1]);
  assert.equal(legacyHeader.length, 34);
  assert.equal((await detectPcdfCsv(new File(["\uFEFF" + legacyHeader.join(";") + "\r\n"], csvName))).version, "1.0");
  const { csv } = fixture();
  assert.equal((await detectPcdfCsv(csv)).version, "2.0");
  const reversed = fixture(config => config.columns.reverse());
  assert.equal((await detectPcdfCsv(reversed.csv)).version, null);
  assert.equal((await detectPcdfCsv(new File(["data;hora;natureza\r\n"], "geral.csv"))).version, null);
});

test("reconcilia relações de natureza, preserva texto, precisão e metadados", async () => {
  const { csv, attachments } = fixture(config => config.provenance.reverse());
  const result = await validatePcdfV2(csv, attachments);
  assert.equal(result.records.length, 2);
  assert.equal(result.occurrences, 1);
  assert.equal(result.multiNature, 1);
  assert.equal(result.natures, 2);
  assert.equal(result.quarantine, 0);
  assert.deepEqual(result.coordinates, { referencia_pendente: 2 });
  assert.equal(result.utmWithoutGeo, 0);
  const first = result.records[0];
  const value = name => first.cells[result.headers.indexOf(name)];
  assert.equal(value("numero_registro"), "0007");
  assert.equal(value("quadra_endereco_original"), 'Área; "aspas"\nLínea, final');
  assert.equal(value("latitude_geo_original"), "-15.123456789012345");
  assert.equal(value("latitude_utm_original"), "NULL");
  assert.deepEqual(first.origin, { data_inicio_fato_original: "13/01/2021 09:04:59", aba_origem: "NATUREZAS", versao_tratamento: "pcdf-v2-teste" });
  assert.ok(first.issues.some(([field, state]) => field === "coordenada_status" && state === "referencia_pendente"));
});

test("seleção agrupada preserva a identidade dos arquivos e limita a seleção a uma competência", async () => {
  const { csv, attachments } = fixture();
  const selected = selectPcdfV2Files([...attachments, csv]);
  assert.equal(selected.csv, csv);
  assert.deepEqual(selected.attachments, attachments);
  assert.equal((await validatePcdfV2(selected.csv, selected.attachments)).month, "2021-01");
  assert.throws(() => selectPcdfV2Files([...attachments]), /única competência/);
  assert.throws(() => selectPcdfV2Files([csv, new File([""], "pcdf_naturezas_2021-02.csv")]), /única competência/);
  assert.throws(() => selectPcdfV2Files([csv, new File([""], "manifesto-integral.json")]), /mesma competência/);
  assert.throws(() => selectPcdfV2Files([csv, attachments[0], attachments[0]]), /nomes repetidos/);
});

test("rejeita pacote parcial, checksum adulterado e conteúdo com o mesmo nome", async () => {
  const { csv, attachments } = fixture();
  await assert.rejects(validatePcdfV2(csv, []), /incompleto/);
  const tampered = new File([(await csv.text()).replace("NATUREZA A", "NATUREZA X")], csvName);
  await assert.rejects(validatePcdfV2(tampered, attachments), /SHA-256/);
  const badSum = new File(["0".repeat(64) + "  manifesto.json\n"], "sha256sums.txt");
  await assert.rejects(validatePcdfV2(csv, attachments.map(file => file.name === badSum.name ? badSum : file)), /incompleta/);
  await assert.rejects(validatePcdfV2(csv, [...attachments, attachments[0]]), /repetidos/);
  for (const name of ["pendencias_temporais.jsonl", "validacao.md"]) {
    await assert.rejects(validatePcdfV2(csv, attachments.filter(file => file.name !== name)), /incompleto/);
  }
  const { csv: complete, attachments: parts } = fixture(config => { config.report = "relatório"; });
  await assert.rejects(validatePcdfV2(complete, parts.map(file => file.name === "validacao.md"
    ? new File(["relatóriX"], file.name) : file)), /SHA-256.*validacao.md/);
});

test("valida semanticamente datas, horários, identificadores, chaves e coordenadas após conferir hashes", async () => {
  const cases = [
    [({ rows }) => { rows[0].data = "01-13-21"; }, /Associação 1 · data/],
    [({ rows }) => { rows[0].horario = "09:04:00"; }, /Associação 1 · horario/],
    [({ rows }) => { rows[0].linha_xml = "3"; }, /Associação 1 · linha_xml/],
    [({ rows }) => { rows[1].linha_origem_id = rows[0].linha_origem_id; }, /Associação 2 · linha_origem_id/],
    [({ rows, provenance }) => { rows[0].linha_origem_id = provenance[0].linha_origem_id = "0".repeat(64); }, /SHA-256 recalculado/],
    [({ rows }) => { rows[0].ocorrencia_chave = ""; }, /Associação 1 · ocorrencia_chave/],
    [({ rows }) => { rows[0].coordenada_status = "ausente"; }, /Associação 1 · coordenada_status/],
    [({ rows }) => { rows[0].latitude_geo_original = "-90.0000000000000001"; }, /Associação 1 · latitude_geo_original/],
    [({ provenance }) => { provenance[0].coordenada_status_v1 = "ausente"; }, /Estado histórico/],
    [({ provenance }) => { provenance[0].data_inicio_fato_original += "\0"; }, /texto incompatível/],
    [({ provenance }) => { provenance[0].data_inicio_fato_original += "\uD800"; }, /texto incompatível/],
    [({ manifest }) => { manifest.reconciliacao.naturezas_padronizadas.GRUPO = 1; }, /distribuição/],
    [config => { config.report = ""; }, /resumo da validação/],
    [({ provenance }) => { provenance[0].diagnosticos.ausente = ["ra_original", "ra_original"]; }, /Estrutura de proveniencia/],
    [({ manifest }) => { manifest.reconciliacao.chaves_por_quantidade_de_associacoes = { 1: 2 }; }, /distribuição/],
  ];
  for (const [change, error] of cases) {
    const { csv, attachments } = fixture(change);
    await assert.rejects(validatePcdfV2(csv, attachments), error);
  }
});

test("rejeita aspas malformadas, delimitadores e chaves JSON duplicadas", async () => {
  for (const [change, error] of [
    [config => { config.mutateCsv = text => text + '"pendência'; }, /aspas/],
    [config => { config.mutateCsv = text => text.replaceAll("\r\n", "\n"); }, /CRLF/],
    [config => { config.mutateCsv = text => text.replaceAll(";", ","); }, /cabeçalho/],
    [config => { config.makeProvenance = rows => rows.map(row => JSON.stringify(row) + "\n").join("").replace('{"linha_origem_id":', '{"linha_xml":2,"linha_origem_id":'); }, /chave JSON repetida/],
  ]) {
    const { csv, attachments } = fixture(change);
    await assert.rejects(validatePcdfV2(csv, attachments), error);
  }
});

test("distingue posições diferentes com a mesma natureza de uma identidade duplicada", async () => {
  const { csv, attachments } = fixture(({ rows, manifest }) => {
    rows[1].natureza_original = rows[0].natureza_original;
    Object.assign(manifest.reconciliacao, {
      naturezas_originais_distintas: 1, naturezas_originais: { "NATUREZA A": 2 }, repeticoes_chave_natureza: 1,
    });
  });
  const result = await validatePcdfV2(csv, attachments);
  assert.equal(result.records.length, 2);
  assert.equal(result.multiNature, 0);
  assert.equal(result.repeatedNature, 1);
  assert.ok(result.records[1].issues.some(([, rule]) => rule === "associacao_repetida_para_revisao"));
});

test("aceita coordenada inválida consistente como pendência de staging", async () => {
  const { csv, attachments } = fixture(({ rows, provenance, manifest }) => {
    rows[0].latitude_geo_original = "-90.0000000000000001";
    rows[0].coordenada_status = "invalida";
    provenance[0].coordenadas.GEO = {
      estado: "invalida", componentes: { latitude_geo_original: "fora_do_dominio", longitude_geo_original: "numerico" },
    };
    Object.assign(manifest.reconciliacao, {
      coordenada_status: { invalida: 1, referencia_pendente: 1 },
      coordenada_status_v1_para_v2: { "invalida -> invalida": 1, "invalida -> referencia_pendente": 1 },
      pares_coordenadas: { GEO: { invalida: 1, referencia_pendente: 1 }, UTM: { ausente: 2 } },
    });
  });
  const result = await validatePcdfV2(csv, attachments);
  assert.ok(result.records[0].issues.some(([field, rule]) => field === "latitude_geo_original" && rule === "fora_do_dominio"));
  assert.ok(result.records.every(row => row.issues.every(([field]) => field !== "classificacao_status")));
});

const pilot = process.env.SENTINELA_PCDF_V2_PILOTO;
test("janeiro real e hashes do pacote sem envio ou acesso ao banco", { skip: !pilot }, async () => {
  const input = name => new File([readFileSync(join(pilot, name))], name);
  const attachments = ["manifesto.json", "proveniencia.jsonl", "sha256sums.txt", "pendencias_temporais.jsonl", "validacao.md"].map(input);
  const result = await validatePcdfV2(input(csvName), attachments);
  assert.equal(result.records.length, 6393);
  assert.equal(result.occurrences, 6091);
  assert.equal(result.natures, 34);
  assert.equal(result.multiNature, 293);
  assert.equal(result.quarantine, 0);
  assert.equal(result.records.filter(row => row.issues.some(([, rule]) => rule === "revisao_utm_sem_geo")).length, 2);
});
