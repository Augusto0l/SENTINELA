import test from "node:test";
import assert from "node:assert/strict";
import { createDensityField, densityColor, HEAT_COLORS, HEAT_RADIUS, sampleDensity, projectHeatRecords } from "../src/components/map/heatmapDensity.ts";

test("calor usa longitude/latitude válidas; não substitui coordenadas ausentes por x/y ou centroides", () => {
  const records = [{ latitude: 20, longitude: 30, x: 99, y: 99 }, { latitude: NaN, longitude: 30, x: 99, y: 99 }, { latitude: 91, longitude: 30 }, { latitude: 20, longitude: Infinity }, { latitude: 20, longitude: 181 }, { latitude: 20, longitude: 50 }];
  assert.deepEqual(projectHeatRecords(records, (longitude, latitude) => ({ x: longitude, y: latitude }), x => x < 40), [{ x: 30, y: 20 }]);
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
