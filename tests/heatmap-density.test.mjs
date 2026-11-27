import test from "node:test";
import assert from "node:assert/strict";
import { createDensityField, DASHBOARD_HEAT, densityColor, HEAT_COLORS, HEAT_RADIUS, HEAT_MAX_OPACITY, memoizePointTest, sampleDensity, projectHeatRecords } from "../src/components/map/heatmapDensity.ts";

test("teste geométrico memoizado devolve exatamente as mesmas respostas e não repete coordenadas", () => {
  const calls = [];
  const inside = (x, y) => { calls.push([x, y]); return x * x + y * y < 2500 && !(x > 10 && x < 20); };
  const cached = memoizePointTest(inside);
  // (15, 0) fica fora e (0, 15) dentro: x e y não podem ser confundidos na chave.
  const coordinates = [[0, 0], [15, 0], [0, 15], [49.9, 0], [50, 0], [0, 0], [15, 0], [0, 15], [3.25, -7.5]];
  for (const [x, y] of coordinates) assert.equal(cached(x, y), inside(x, y));
  assert.equal(cached(15, 0), false);
  assert.equal(cached(0, 15), true);
  calls.length = 0;
  for (const [x, y] of coordinates) cached(x, y);
  assert.equal(calls.length, 0, "coordenadas repetidas reutilizam a resposta");
  assert.equal(memoizePointTest(() => false)(0, 0), false, "outra geometria não herda respostas");
});

test("calor e referência com teste memoizado são idênticos aos do teste direto", () => {
  const records = Array.from({ length: 400 }, (_, index) => ({ latitude: (index * 37) % 97, longitude: (index * 53) % 151 }));
  const project = (longitude, latitude) => ({ x: longitude, y: latitude });
  const contains = (x, y) => (x - 70) ** 2 / 3600 + (y - 45) ** 2 / 1600 < 1;
  const cached = memoizePointTest(contains);
  const direct = projectHeatRecords(records, project, contains);
  const reference = createDensityField(direct, 160, 100, contains);
  // Mesmas coordenadas avaliadas duas vezes pelo mesmo teste memoizado (campo de referência e campo de calor).
  for (let pass = 0; pass < 2; pass++) {
    const points = projectHeatRecords(records, project, cached);
    const field = createDensityField(points, 160, 100, cached);
    assert.deepEqual(points, direct);
    assert.equal(field.peak, reference.peak);
    assert.deepEqual([...field.values], [...reference.values]);
  }
});

test("calor usa longitude/latitude válidas; não substitui coordenadas ausentes por x/y ou centroides", () => {
  const records = [{ latitude: 20, longitude: 30, x: 99, y: 99 }, { latitude: NaN, longitude: 30, x: 99, y: 99 }, { latitude: 91, longitude: 30 }, { latitude: 20, longitude: Infinity }, { latitude: 20, longitude: 181 }, { latitude: 20, longitude: 50 }];
  assert.deepEqual(projectHeatRecords(records, (longitude, latitude) => ({ x: longitude, y: latitude }), x => x < 40), [{ x: 30, y: 20 }]);
});

test("calor no Dashboard respeita o raio, o sigma e a opacidade definidos para a tela", () => {
  const point = [{ x: 40, y: 40 }];
  const dashboard = createDensityField(point, 100, 100, undefined, DASHBOARD_HEAT);
  const standard = createDensityField(point, 100, 100);
  assert.equal(sampleDensity(dashboard, 46, 40), Math.fround(Math.exp(-0.5)), "sigma de 6 unidades");
  assert.equal(sampleDensity(dashboard, 58, 40), 0, "truncamento a 18 unidades");
  assert.ok(sampleDensity(standard, 58, 40) > 0);
  assert.equal(densityColor(dashboard.peak, dashboard.peak, DASHBOARD_HEAT.maxOpacity)[3], Math.round(255 * 0.76));
});

test("concentração aumenta com registros próximos e não cria calor entre pontos afastados", () => {
  const sparse = createDensityField([{ x: 40, y: 40 }, { x: 120, y: 40 }], 160, 80);
  const dense = createDensityField([{ x: 40, y: 40 }, { x: 40, y: 40 }], 160, 80);
  assert.equal(sampleDensity(sparse, 40, 40), 1);
  assert.equal(sampleDensity(dense, 40, 40), 2);
  assert.equal(sampleDensity(sparse, 80, 40), 0);
  assert.equal(sampleDensity(dense, 40 + HEAT_RADIUS + 2, 40), 0);
  assert.ok(sampleDensity(dense, 46, 40) < sampleDensity(dense, 40, 40));
});

test("filtrar registros reduz a intensidade sem renormalizar cada subconjunto para vermelho", () => {
  const full = createDensityField([{ x: 40, y: 40 }, { x: 40, y: 40 }, { x: 44, y: 40 }], 100, 100);
  const filtered = createDensityField([{ x: 40, y: 40 }], 100, 100);
  const fullColor = densityColor(sampleDensity(full, 40, 40), full.peak);
  const filteredColor = densityColor(sampleDensity(filtered, 40, 40), full.peak);
  assert.ok(filteredColor[3] < fullColor[3]);
  assert.notDeepEqual(filteredColor.slice(0, 3), HEAT_COLORS.at(-1));
  assert.deepEqual(densityColor(0, full.peak), [...HEAT_COLORS[0], 0]);
});

test("cores contínuas seguem azul, verde, amarelo, laranja e vermelho com opacidade limitada", () => {
  for (let stop = 0; stop < HEAT_COLORS.length; stop++) {
    assert.deepEqual(densityColor(stop / 4, 1).slice(0, 3), [...HEAT_COLORS[stop]]);
  }
  assert.ok(densityColor(1, 1)[3] < 255);
  assert.deepEqual(densityColor(1, 0), [...HEAT_COLORS[0], 0]);
});

test("campo vazio é transparente e o pico de referência respeita a máscara geográfica", () => {
  const field = createDensityField([], 100, 100);
  assert.equal(field.peak, 0);
  assert.equal(sampleDensity(field, 50, 50), 0);
  const masked = createDensityField([{ x: 20, y: 20 }, { x: 20, y: 20 }, { x: 80, y: 80 }], 100, 100, (x, y) => x > 50 && y > 50);
  assert.equal(masked.peak, 1);
});

test("ocorrência isolada fica visível sem receber a cor de um hotspot", () => {
  const reference = createDensityField(Array.from({ length: 6 }, () => ({ x: 40, y: 40 })), 100, 100);
  const isolated = createDensityField([{ x: 40, y: 40 }], 100, 100);
  const color = densityColor(sampleDensity(isolated, 40, 40), reference.peak);
  assert.ok(color[3] > 0.76 * 255 / 6, "Mais visível que a opacidade linear anterior");
  assert.ok(color[3] < 255 * HEAT_MAX_OPACITY / 2, "Um ponto isolado não deve saturar");
  assert.notDeepEqual(color.slice(0, 3), [...HEAT_COLORS.at(-1)]);
  assert.ok(color[2] > color[0], "Baixa densidade permanece no segmento azul/verde");
  assert.equal(sampleDensity(reference, 40, 40), 6, "Cada registro mantém peso unitário");
});

test("símbolos de Pontos e Clusters mantêm o tamanho aprovado no DF e não crescem ao focar uma RA", async () => {
  await import("../scripts/contracts-runtime.mjs");
  const { CLUSTER_CELL, clusterCell, clusterSymbol, frameDetail, pointRadius } = await import("../src/components/map/mapSymbols.ts");
  const { MAP_VIEWBOX } = await import("../src/components/map/raMapData.ts");
  // Visão completa do DF: valores idênticos aos aprovados anteriormente.
  assert.equal(frameDetail(MAP_VIEWBOX), 1);
  assert.equal(clusterCell(1), CLUSTER_CELL);
  assert.equal(pointRadius(0.67, 1), Math.max(2.4, 1.2 / 0.67));
  for (const count of [1, 9, 150]) {
    const before = Math.max(Math.max(12, Math.min(27, 8 + Math.sqrt(count) * 2.4)), (6 + Math.sqrt(count) * 0.35) / 0.67);
    assert.equal(clusterSymbol(count, 0.67, 1).radius, before);
  }
  // Cruzeiro, a menor RA oficial (viewBox com cerca de 44 unidades), em um mapa de 800 px.
  const detail = frameDetail("100 100 44.11 30");
  const scale = 800 / 44.11;
  assert.ok(Math.abs(pointRadius(scale, detail) * scale - pointRadius(800 / 1200, 1) * 800 / 1200) < 0.01, "ponto com o mesmo raio na tela");
  assert.ok(clusterCell(detail) < 44.11, "a célula de agrupamento cabe na RA");
  const cluster = clusterSymbol(150, scale, detail);
  assert.ok(cluster.radius * scale < 40 && cluster.fontSize * scale <= 13, "cluster legível sem cobrir a RA");
});

test("tooltip de RA separa ocorrências estatísticas de pontos publicados no mapa", async () => {
  const { officialRaLines } = await import("../src/components/map/raTooltip.ts");
  assert.deepEqual(officialRaLines(1514, 0), ["1.514 ocorrências", "Sem pontos georreferenciados"]);
  assert.deepEqual(officialRaLines(1, 1), ["1 ocorrência", "1 ponto no mapa"]);
  assert.deepEqual(officialRaLines(undefined, 0), ["Sem pontos georreferenciados"]);
  assert.ok(!officialRaLines(0, 0).includes("0 ocorrências no mapa"));
});
