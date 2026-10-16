import test from "node:test";
import assert from "node:assert/strict";
import { filterDemo, summarizeDemo } from "../src/data/demoAnalytics.ts";

const records = [
  { raCode: "RA-I", natureza: "Furto", data: "25/08/2026", horario: "00:00" },
  { raCode: "RA-I", natureza: "Roubo", data: "19/08/2026", horario: "06:00" },
  { raCode: "RA-II", natureza: "Furto", data: "18/08/2026", horario: "23:59" },
  { raCode: "RA-II", natureza: "Furto", data: "01/01/2026", horario: "18:00" },
];

test("últimos sete dias usa referência fixa e inclui limites", () => {
  assert.equal(filterDemo(records, { period: "7d" }).length, 2);
  assert.equal(filterDemo(records, { period: "today" }).length, 1);
});
test("combinação de RA, natureza e horário não inclui outros registros", () => {
  const selected = filterDemo(records, { ra: "RA-II", nature: "Furto", hour: "18-24" });
  assert.equal(selected.length, 2);
  assert.equal(filterDemo(records, { nature: "Roubo", hour: "0-6" }).length, 0);
  assert.equal(filterDemo(records, { hour: "6-12" }).length, 1);
});
test("agregações conservam a contagem da base visualizada", () => {
  const summary = summarizeDemo(records);
  assert.equal(summary.total, 4);
  assert.equal(Object.values(summary.byRa).reduce((a, b) => a + b, 0), summary.total);
  assert.equal(Object.values(summary.byNature).reduce((a, b) => a + b, 0), summary.total);
  assert.equal(summary.topNature, "Furto");
});
test("resultado vazio não apresenta indicador inválido", () => {
  const summary = summarizeDemo(filterDemo(records, { ra: "inexistente" }));
  assert.equal(summary.total, 0);
  assert.equal(summary.peakHour, "—");
  assert.deepEqual(summary.byNature, {});
});
