import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const catalog = JSON.parse(readFileSync(new URL("../docs/contratos/catalogos-v0.1.0.json", import.meta.url), "utf8"));
for (const key of ["regioes", "naturezas"]) {
  const items = catalog[key];
  assert.ok(Array.isArray(items) && items.length > 0, `${key}: catálogo vazio`);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length, `${key}: IDs repetidos`);
  for (const item of items) {
    assert.ok(item.id && item.nome && item.status_validacao);
    assert.equal(item.codigo_oficial, null, "Não atribuir código oficial sem homologação");
  }
}
assert.equal(catalog.regioes.length, 37);
assert.equal(catalog.naturezas.length, 8);
assert.equal(catalog.regioes.find((item) => item.id === "RA-S")?.tipo, "area_demonstrativa");
assert.match(catalog.versao, /^\d+\.\d+\.\d+$/);
assert.ok(catalog.fontes.length && catalog.pendencias.length);
for (const file of ["../components.json", "../package.json", "../tsconfig.json", "../.figma/make/site.json"]) {
  JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
}
console.log("JSONs válidos; catálogo v0.1.0: 37 áreas, 8 naturezas, IDs únicos e homologação pendente explícita.");
const pcdf = JSON.parse(readFileSync(new URL("../docs/catalogos/pcdf-inventario-v1.json", import.meta.url), "utf8"));
assert.equal(pcdf.status, "inventario-agregado-sem-homologacao");
assert.match(pcdf.source.reportSha256, /^[a-f0-9]{64}$/);
for (const [items, expected] of [[pcdf.originalNatures, 41], [pcdf.originalCategories, 19]]) {
  assert.equal(items.length, expected);
  assert.equal(new Set(items.map(item => item.label)).size, expected);
  assert.ok(items.every(item => item.label.trim() && Number.isSafeInteger(item.count) && item.count > 0));
  assert.equal(items.reduce((sum, item) => sum + item.count, 0), 369660);
}
assert.equal(new Set(pcdf.requestedCategories.map(item => item.name)).size, 20);
assert.equal(pcdf.requestedCategories.length, 20);
for (const example of pcdf.documentedExamples) {
  assert.ok(pcdf.originalCategories.some(item => item.label === example.pcdfCategory));
  const source = pcdf.originalNatures.find(item => item.label === example.original);
  assert.ok(source && pcdf.requestedCategories.some(item => item.name === example.requested && item.reportedCount === source.count));
}
console.log("Inventário agregado PCDF: 41 naturezas, 19 categorias de origem, 20 previstas e dois totais reconciliados de 369.660.");
const matrix = JSON.parse(readFileSync(new URL("../docs/catalogos/pcdf-correspondencias-v1.json", import.meta.url), "utf8"));
assert.equal(matrix.sha256Relatorio, pcdf.source.reportSha256);
assert.equal(matrix.regrasAprovadas, 0);
assert.deepEqual(matrix.linhas.map(row => row.natureza), pcdf.originalNatures.map(row => row.label));
assert.equal(new Set(matrix.linhas.map(row => row.id)).size, 41);
for (const row of matrix.linhas) {
  const source = pcdf.documentedExamples.find(example => example.original === row.natureza);
  assert.equal(row.status, source ? "documentada" : "pendente");
  assert.equal(row.categoriaPcdf, source?.pcdfCategory ?? null);
  assert.equal(row.categoriaSentinela, source?.requested ?? null);
  assert.equal(row.tentativa, null);
  assert.equal(Boolean(row.evidencia), Boolean(source));
  assert.ok(row.justificativa.trim());
}
console.log("Matriz PCDF: 2 relações documentadas, 39 pendentes e nenhuma regra de carga aprovada.");
const candidates = JSON.parse(readFileSync(new URL("../docs/catalogos/naturezas-manuais-candidatas-v1.json", import.meta.url), "utf8"));
assert.deepEqual(candidates.fonte, pcdf.source);
assert.deepEqual(candidates.registros.map(item => [item.idInterno, item.descricaoOriginal]),
  matrix.linhas.map(item => [item.id, item.natureza]));
assert.ok(candidates.registros.every(item => item.situacao === "pendente" && item.usoManual === false
  && item.codigoOriginal === null && typeof item.observadoEmJaneiro2021 === "boolean"));
assert.equal(candidates.registros.filter(item => item.observadoEmJaneiro2021).length, 34);
assert.equal(candidates.registros.filter(item => item.referenciaAnaliticaDocumentada).length, 2);
console.log("Cadastro manual: 41 candidatas preservadas, 34 observadas no lote de janeiro e zero homologadas.");
const { validateApiContracts } = await import("./validate-api-contracts.mjs");
console.log("Contratos e OpenAPI válidos:", await validateApiContracts());
