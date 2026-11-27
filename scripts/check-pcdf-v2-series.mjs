import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { TextDecoder } from "node:util";
import { detectPcdfCsv, pcdfV2Attachments, pcdfV2Headers, selectPcdfV2Files, validatePcdfV2 } from "../src/data/pcdfV2.ts";
import { preparePcdfCsvDelivery } from "../src/lib/db/pcdf-v2-delivery.ts";

const root = process.argv[2];
assert.ok(root, "Informe a pasta da série PCDF v2 integral como argumento.");
const utf8 = new TextDecoder("utf-8", { fatal: true });
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const bytesFor = path => readFile(join(root, path));
const sums = new Map();
for (const line of utf8.decode(await bytesFor("sha256sums.txt")).trimEnd().split(/\r?\n/)) {
  const match = /^([a-f0-9]{64}) {2}(\S+)$/.exec(line);
  assert.ok(match && !sums.has(match[2]), "O índice integral contém entradas inválidas ou repetidas.");
  sums.set(match[2], match[1]);
}

async function verifiedBytes(path) {
  const bytes = await bytesFor(path);
  assert.ok(sums.get(path) === sha256(bytes), `Hash integral divergente em ${path}.`);
  sums.delete(path);
  return bytes;
}

function csvLine(cells) {
  return cells.map(cell => /[;"\r\n]/.test(cell) ? '"' + cell.replaceAll('"', '""') + '"' : cell).join(";") + "\r\n";
}

const index = JSON.parse(utf8.decode(await verifiedBytes("manifesto-integral.json")));
const withoutMonth = utf8.decode(await verifiedBytes("pendencias_sem_competencia.jsonl"));
assert.equal(withoutMonth ? withoutMonth.trimEnd().split("\n").length : 0, index.quarentena_sem_competencia);
const months = Array.from({ length: 68 }, (_, i) => `${2021 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, "0")}`);
assert.deepEqual(Object.keys(index.competencias).sort(), months);
assert.deepEqual(index.layout, { colunas: pcdfV2Headers, versao: "2.0" });
const candidates = new Set(), natures = new Set(), ids = new Set();
const coordinates = {};
let associations = 0, originals = 0, utmWithoutGeo = 0, quarantine = 0, repeatedNature = 0, missingCandidate = 0;

for (const month of months) {
  const expected = index.competencias[month];
  const filename = `pcdf_naturezas_${month}.csv`;
  assert.equal(expected.arquivo, `${month}/${filename}`);
  const [csvBytes, ...parts] = await Promise.all([filename, ...pcdfV2Attachments].map(name => verifiedBytes(`${month}/${name}`)));
  const { csv, attachments } = selectPcdfV2Files([
    ...pcdfV2Attachments.map((name, i) => new File([parts[i]], name)),
    new File([csvBytes], filename),
  ]);
  const manifestBytes = parts[pcdfV2Attachments.indexOf("manifesto.json")];
  const manifest = JSON.parse(utf8.decode(manifestBytes));
  assert.equal(csv.size, expected.bytes);
  assert.equal(sha256(csvBytes), expected.sha256);
  assert.equal(sha256(manifestBytes), expected.sha256_manifesto);
  assert.equal(manifest.fonte.sha256, index.fonte.sha256);
  assert.equal(manifest.fonte.aba, index.fonte.aba);
  assert.equal(manifest.versao_tratamento, index.versao_tratamento);
  assert.equal(manifest.versao_proveniencia, index.versao_proveniencia);
  assert.equal((await detectPcdfCsv(csv)).version, "2.0");

  const preview = await validatePcdfV2(csv, attachments);
  const { preview: standalone } = await preparePcdfCsvDelivery(csv);
  assert.equal(standalone.standalone.invalid, 0);
  assert.equal(standalone.records.length, preview.records.length);
  for (const records of [preview.records, standalone.records]) {
    assert(!records.some(row => row.issues.some(([field, rule]) =>
      ["classificacao_status", "natureza_padronizada_pcdf", "natureza_sentinela_codigo", "versao_mapeamento"].includes(field)
      || ["natureza_ausente", "natureza_fora_do_catalogo"].includes(rule))), `Pendência inesperada de natureza em ${month}`);
  }
  assert.equal(preview.month, month);
  assert.equal(preview.headers.length, 26);
  assert.equal(preview.records.length, expected.associacoes);
  assert.equal(preview.occurrences, expected.chaves_candidatas);
  assert.equal(preview.natures, expected.naturezas_originais);
  assert.equal(preview.quarantine, expected.quarentena);

  const headerPositions = new Map(preview.headers.map((name, i) => [name, i]));
  const provenanceBytes = parts[pcdfV2Attachments.indexOf("proveniencia.jsonl")];
  const civilLiterals = new Map(utf8.decode(provenanceBytes).trimEnd().split("\n").map(line => {
    const item = JSON.parse(line);
    return [item.linha_origem_id, item.data_inicio_fato_original];
  }));
  const roundtrip = createHash("sha256").update(csvLine(preview.headers));
  for (const { cells, origin } of preview.records) {
    const id = cells[headerPositions.get("linha_origem_id")];
    assert.ok(!ids.has(id), `Identificador de origem repetido entre competências em ${month}.`);
    assert.ok(civilLiterals.get(id) === origin.data_inicio_fato_original, `Literal de proveniência divergente em ${month}.`);
    ids.add(id);
    const candidate = cells[headerPositions.get("ocorrencia_chave")];
    if (candidate) candidates.add(candidate);
    natures.add(cells[headerPositions.get("natureza_original")]);
    roundtrip.update(csvLine(cells));
  }
  assert.equal(roundtrip.digest("hex"), expected.sha256, `A prévia alterou o conteúdo do CSV de ${month}.`);
  for (const [status, count] of Object.entries(preview.coordinates)) coordinates[status] = (coordinates[status] ?? 0) + count;
  associations += preview.records.length;
  originals += manifest.reconciliacao.originais_reconciliados;
  utmWithoutGeo += preview.utmWithoutGeo;
  quarantine += preview.quarantine;
  repeatedNature += preview.repeatedNature;
  missingCandidate += preview.missingCandidate;
  console.log(`${month} · ${preview.records.length} associações · ${preview.occurrences} candidatas · ${preview.natures} naturezas · 6 artefatos conferidos`);
}

assert.equal(sums.size, 0, "O índice integral contém artefatos não conferidos.");
assert.equal(associations, index.associacoes_exportadas);
assert.equal(ids.size, associations);
assert.equal(candidates.size, index.chaves_candidatas_distintas);
assert.equal(natures.size, index.naturezas_originais_distintas);
assert.equal(originals, index.originais_reconciliados);
assert.deepEqual(coordinates, index.coordenada_status);
assert.equal(utmWithoutGeo, index.candidatos_utm_sem_geo);
assert.equal(quarantine, index.quarentena_ano_fato);
console.log(JSON.stringify({
  months: months.length, artifacts: months.length * 6 + 2, associations, candidates: candidates.size,
  natures: natures.size, originals, coordinates, utmWithoutGeo, quarantine, repeatedNature, missingCandidate,
}));
