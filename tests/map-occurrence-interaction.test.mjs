import test from "node:test";
import assert from "node:assert/strict";
import "../scripts/contracts-runtime.mjs";

const { occurrenceHrefFromMap, occurrenceMapPosition } = await import("../src/features/occurrences/map-link.ts");
const { spatialRaName } = await import("../src/components/map/occurrencePresentation.ts");
const { readConsolidatedOccurrence } = await import("../src/features/occurrences/client.ts");
const { catalogVersion, CONTRACT_VERSION } = await import("../src/contracts/common.ts");

test("o link preserva a identidade do marcador sem colocar coordenadas na URL", () => {
  const a = "a0000000-0000-4000-8000-000000000001";
  const b = "a0000000-0000-4000-8000-000000000002";
  const position = { latitude: -15.8, longitude: -47.9, raName: "Plano Piloto" };
  assert.equal(occurrenceHrefFromMap(a.toUpperCase(), position), `/ocorrencias?ocorrencia=${a}`);
  assert.deepEqual(occurrenceMapPosition(a), position);
  assert.equal(occurrenceMapPosition(b), undefined);
  assert.equal(occurrenceHrefFromMap(b, position), `/ocorrencias?ocorrencia=${b}`);
  assert.equal(occurrenceMapPosition(a), undefined);
  assert.equal(occurrenceHrefFromMap("javascript:alert(1)", position), undefined);
});

test("a RA espacial é inferida dos polígonos e fica indefinida em uma divisa", () => {
  const feature = (code, x) => ({
    type: "Feature",
    properties: { ra_codigo: code },
    geometry: { type: "Polygon", coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] },
  });
  const geometry = { type: "FeatureCollection", features: [feature("RA-01", 0), feature("RA-02", 1)] };
  const regions = [{ code: "RA-01", displayName: "Primeira" }, { code: "RA-02", displayName: "Segunda" }];
  assert.equal(spatialRaName(geometry, { latitude: .5, longitude: 1.5, raCode: "RA-01" }, regions), "Segunda");
  assert.equal(spatialRaName(geometry, { latitude: .5, longitude: 1 }, regions), undefined);
  assert.equal(spatialRaName(undefined, { latitude: .5, longitude: 1.5 }, regions), undefined);
});

test("a consulta por UUID recusa um detalhe de outro registro", async t => {
  const requested = "a0000000-0000-4000-8000-000000000001";
  const returned = "a0000000-0000-4000-8000-000000000002";
  t.mock.method(globalThis, "fetch", async (input, options) => {
    assert.equal(new URL(input, "http://localhost:3000").searchParams.get("id"), requested);
    assert.equal(options.credentials, "same-origin");
    return Response.json({
      success: true,
      meta: { catalogVersion, contractVersion: CONTRACT_VERSION, execution: { mode: "operacional", persisted: true } },
      data: {
        id: returned, identificacao: null, fonte: "PCDF", origem: "importacao", data: null, hora: null,
        ra: null, local: null, localizacaoStatus: "pendente", latitude: null, longitude: null,
        unidadeApuracao: null, naturezas: [],
      },
    });
  });
  await assert.rejects(readConsolidatedOccurrence(requested, "consolidadas", new AbortController().signal),
    /Resposta inesperada do serviço de leitura/);
});
