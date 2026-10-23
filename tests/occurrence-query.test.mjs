import test from "node:test";
import assert from "node:assert/strict";
import { queryOccurrences, emptyOccurrenceFilters, normalizeSearch } from "../src/data/occurrenceQuery.ts";

const records = [
  { id: "DEMO-003", raCode: "RA-I", raName: "Brasília", natureza: "Furto", data: "31/12/2025", horario: "23:59", local: "Área   Central", latitude: -15, longitude: -47, x: 0, y: 0 },
  { id: "DEMO-002", raCode: "RA-II", raName: "Gama", natureza: "Roubo", data: "01/01/2026", horario: "06:30", local: "Praça Sul", latitude: -15, longitude: -47, x: 0, y: 0 },
  { id: "DEMO-001", raCode: "RA-I", raName: "Brasília", natureza: "Furto", data: "02/02/2026", horario: "00:01", local: "Área Central", latitude: -15, longitude: -47, x: 0, y: 0 },
];
const ids = (result) => result.records.map(r => r.id);
const query = (filters = {}, sort = null, page = 1, size = 25) => queryOccurrences(records, { ...emptyOccurrenceFilters(), ...filters }, sort, page, size);

test("busca parcial por ID, RA, código, natureza e local normaliza caixa, acentos e espaços", () => {
  assert.equal(normalizeSearch("  ÁREA   Central "), "area central");
  for (const search of ["DEMO-001", "  braSILia ", "RA-I", "FURTO", "  area   CENTRAL  "]) assert.ok(ids(query({ search })).includes("DEMO-001"));
  assert.deepEqual(ids(query({ search: "praca" })), ["DEMO-002"]);
  assert.equal(query({ search: "   " }).total, 3);
});
test("combina filtros e limpeza restaura a base sem alterar sua ordem", () => {
  assert.deepEqual(ids(query({ search: "central", ra: "RA-I", nature: "Furto" })), ["DEMO-003", "DEMO-001"]);
  assert.equal(query({ ra: "RA-I", nature: "Roubo" }).total, 0);
  assert.deepEqual(ids(queryOccurrences(records, emptyOccurrenceFilters(), null)), records.map(r => r.id));
});
test("ordena datas e horários cronologicamente nas duas direções", () => {
  assert.deepEqual(ids(query({}, { column: "data", direction: "asc" })), ["DEMO-003", "DEMO-002", "DEMO-001"]);
  assert.deepEqual(ids(query({}, { column: "data", direction: "desc" })), ["DEMO-001", "DEMO-002", "DEMO-003"]);
  assert.deepEqual(ids(query({}, { column: "horario", direction: "asc" })), ["DEMO-001", "DEMO-002", "DEMO-003"]);
  assert.deepEqual(ids(query({}, { column: "horario", direction: "desc" })), ["DEMO-003", "DEMO-002", "DEMO-001"]);
});
test("ordena textos e desempata por identificador sem mutar a entrada", () => {
  const frozen = Object.freeze(records.map(r => Object.freeze({ ...r })));
  for (const column of ["natureza", "raName", "local"]) {
    const pair = [frozen[0], frozen[2]];
    for (const direction of ["asc", "desc"]) assert.deepEqual(ids(queryOccurrences(pair, emptyOccurrenceFilters(), { column, direction })), ["DEMO-001", "DEMO-003"]);
  }
  assert.deepEqual(ids(query({}, { column: "id", direction: "desc" })), ["DEMO-003", "DEMO-002", "DEMO-001"]);
  assert.deepEqual(ids(query({}, { column: "raName", direction: "asc" })), ["DEMO-001", "DEMO-003", "DEMO-002"]);
  assert.deepEqual(ids(query({}, { column: "raName", direction: "desc" })), ["DEMO-002", "DEMO-001", "DEMO-003"]);
  queryOccurrences(frozen, emptyOccurrenceFilters(), { column: "id", direction: "asc" });
  assert.deepEqual(frozen, records);
});
test("pagina depois de filtrar e ordenar; limita páginas e trata resultado vazio", () => {
  assert.deepEqual(ids(query({ nature: "Furto" }, { column: "id", direction: "asc" }, 2, 1)), ["DEMO-003"]);
  assert.equal(query({}, null, 99, 2).page, 2);
  assert.equal(query({}, null, -1).page, 1);
  const empty = query({ search: "inexistente" }, null, 9);
  assert.deepEqual(empty, { total: 0, totalPages: 1, page: 1, records: [] });
  assert.throws(() => query({}, null, 1, 0), RangeError);
});
