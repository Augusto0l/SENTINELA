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
