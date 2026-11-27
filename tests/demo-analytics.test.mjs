import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { filterDemo, summarizeDemo, demoCivilDate, validateDemoPeriod, demoPeriodLabel, emptyDemoFilters, queryDemoAnalytics, crimeMapHref, demoFiltersFromSearch } from "../src/data/demoAnalytics.ts";

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

const custom = (startDate, endDate, other = {}) => ({ ...emptyDemoFilters(), period: "custom", startDate, endDate, ...other });

test("intervalo personalizado inclui primeiro e último dia, da meia-noite às 23:59", () => {
  const data = [
    { ...records[0], id: "anterior", data: "18/08/2026", horario: "23:59" },
    { ...records[0], id: "inicio", data: "19/08/2026", horario: "00:00" },
    { ...records[0], id: "fim", data: "25/08/2026", horario: "23:59" },
    { ...records[0], id: "posterior", data: "26/08/2026", horario: "00:00" },
  ];
  assert.deepEqual(filterDemo(data, custom("2026-08-19", "2026-08-25")).map(item => item.id), ["inicio", "fim"]);
  assert.deepEqual(filterDemo(data, custom("2026-08-25", "2026-08-25")).map(item => item.id), ["fim"]);
  assert.equal(validateDemoPeriod(custom("2026-08-19", "2026-08-25")), null);
});

test("intervalos invertidos, incompletos e datas impossíveis são recusados sem ampliar o recorte", () => {
  for (const filters of [custom("2026-08-25", "2026-08-19"), custom("", "2026-08-25"), custom("2026-02-30", "2026-08-25"), custom("2025-02-29", "2026-08-25"), custom("2026-08-01", "25/08/2026"), custom("0001-01-01", "2026-08-25"), { period: "inventado" }]) {
    assert.equal(typeof validateDemoPeriod(filters), "string");
    assert.deepEqual(filterDemo(records, filters), []);
  }
  assert.notEqual(demoCivilDate("2024-02-29"), null);
  assert.equal(demoCivilDate("2026-08-25T00:00:00Z"), null);
  assert.equal(demoCivilDate("2026-13-01"), null);
});

test("customização não é limitada artificialmente à referência dos atalhos", () => {
  const future = [{ ...records[0], data: "26/08/2026" }];
  const selection = queryDemoAnalytics(future, custom("2026-08-26", "2026-08-26", { ra: "RA-I" }));
  assert.equal(selection.summary.total, 1);
  assert.equal(selection.mapSummary.total, 1);
  assert.equal(filterDemo(future, { period: "all" }).length, 0);
});

test("intervalo sem registros produz agregações vazias e indicadores seguros", () => {
  const { records: visible, summary } = queryDemoAnalytics(records, custom("2027-01-01", "2027-01-31"));
  assert.deepEqual(visible, []);
  assert.equal(summary.total, 0);
  assert.equal(summary.topNature, "—");
  assert.equal(summary.peakDay, "—");
  assert.deepEqual(summary.timeline, []);
  assert.deepEqual(summary.byRa, {});
});

test("período combina com RA, natureza e horário sem modificar os registros", () => {
  const snapshot = structuredClone(records);
  const filters = custom("2026-08-18", "2026-08-25", { ra: "RA-II", nature: "Furto", hour: "18-24" });
  const result = queryDemoAnalytics(records, filters);
  assert.equal(result.summary.total, 1);
  assert.equal(result.records[0], records[2]);
  assert.equal(result.mapSummary.total, 1);
  assert.deepEqual(records, snapshot);
});

test("resumo, série mensal e contagens territoriais conservam o total filtrado", () => {
  const result = queryDemoAnalytics(records, custom("2026-01-01", "2026-08-25"));
  assert.equal(result.summary, result.mapSummary);
  for (const counts of [result.summary.byRa, result.summary.byNature]) assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), result.records.length);
  assert.equal(result.summary.timeline.reduce((sum, item) => sum + item.count, 0), result.summary.total);
  assert.deepEqual(result.summary.timeline, [{ month: "2026-01", count: 1 }, { month: "2026-08", count: 3 }]);
  const regional = queryDemoAnalytics(records, custom("2026-01-01", "2026-08-25", { ra: "RA-I" }));
  assert.equal(regional.summary.total, regional.mapSummary.byRa["RA-I"]);
});

test("limpeza restaura toda a base e os atalhos mantêm os limites existentes", () => {
  const original = filterDemo(records, emptyDemoFilters());
  assert.equal(filterDemo(records, custom("2027-01-01", "2027-01-02")).length, 0);
  assert.deepEqual(filterDemo(records, emptyDemoFilters()), original);
  for (const period of ["today", "7d", "1m", "3m", "6m", "12m"]) {
    assert.equal(validateDemoPeriod({ period }), null);
    assert.ok(filterDemo(records, { period }).length > 0);
  }
  assert.equal(demoPeriodLabel(custom("2026-08-19", "2026-08-25")), "19/08/2026 a 25/08/2026");
});

test("navegação ao mapa preserva critérios e não envia datas de um rascunho", () => {
  const filters = custom("2026-08-19", "2026-08-25", { ra: "RA-I", nature: "Lesão Corporal", hour: "18-24" });
  const url = new URL(crimeMapHref(filters), "https://sentinela.invalid");
  assert.deepEqual(demoFiltersFromSearch(url.searchParams), filters);
  assert.equal(crimeMapHref(emptyDemoFilters()), "/mapa-criminal");
});

test("múltiplas naturezas não multiplicam ocorrências nem a série temporal", () => {
  const multi = [{ ...records[0], naturezas: ["Furto", "Ameaça", "Furto"] }];
  const { summary } = queryDemoAnalytics(multi, custom("2026-08-25", "2026-08-25", { nature: "Ameaça" }));
  assert.equal(summary.total, 1);
  assert.deepEqual(summary.byNature, { Furto: 1, Ameaça: 1 });
  assert.equal(summary.timeline[0].count, 1);
});

test("datas civis e limites são invariantes ao fuso do processo", () => {
  const moduleUrl = new URL("../src/data/demoAnalytics.ts", import.meta.url).href;
  const program = `import { filterDemo, summarizeDemo } from ${JSON.stringify(moduleUrl)}; const rows = ${JSON.stringify(records)}; const chosen = filterDemo(rows, ${JSON.stringify(custom("2026-08-19", "2026-08-25"))}); process.stdout.write(JSON.stringify(summarizeDemo(chosen)));`;
  const outputs = ["UTC", "America/Sao_Paulo", "America/New_York", "Pacific/Kiritimati"].map(TZ => execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", program], { env: { ...process.env, TZ }, encoding: "utf8" }));
  assert.ok(outputs.every(output => output === outputs[0]));
});

test("datas inválidas das ocorrências não são normalizadas para outro dia", () => {
  const bad = [{ ...records[0], data: "31/02/2026" }, { ...records[0], data: "2026-08-25" }];
  assert.deepEqual(filterDemo(bad, emptyDemoFilters()), []);
});
