import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

await import("../scripts/contracts-runtime.mjs");
const { loadOfficialRegions, projectOfficialRegions, OFFICIAL_GEOJSON_PATH } = await import("../src/components/map/officialRegions.ts");
const bytes = readFileSync(new URL(`../public${OFFICIAL_GEOJSON_PATH}`, import.meta.url));

test("cartografia oficial só é reutilizada depois de verificada pelo SHA-256", async () => {
  const realFetch = globalThis.fetch;
  const requests = [];
  let body = Buffer.from(bytes.toString("utf8").replace("CEILÂNDIA", "CEILANDIA"));
  globalThis.fetch = async (url, init) => {
    requests.push({ url, signal: init?.signal });
    return new Response(body);
  };
  try {
    // Versão adulterada: rejeitada e não guardada.
    await assert.rejects(loadOfficialRegions(new AbortController().signal), /Versão cartográfica inesperada/);
    await assert.rejects(loadOfficialRegions(new AbortController().signal), /Versão cartográfica inesperada/);
    assert.equal(requests.length, 2);

    body = bytes;
    const controller = new AbortController();
    const first = await loadOfficialRegions(controller.signal);
    assert.equal(requests.length, 3);
    assert.equal(requests[2].signal, controller.signal, "cada chamada mantém o próprio cancelamento");
    assert.equal(first.features.length, 37);

    const second = await loadOfficialRegions(new AbortController().signal);
    assert.equal(second, first, "versão verificada é reutilizada");
    assert.equal(requests.length, 3, "sem novo download, hash ou leitura");

    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(loadOfficialRegions(aborted.signal), { name: "AbortError" });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("projeção das 37 RAs é reaproveitada para o mesmo GeoJSON e idêntica à projeção nova", () => {
  const geo = JSON.parse(bytes.toString("utf8"));
  const regions = projectOfficialRegions(geo);
  assert.equal(projectOfficialRegions(geo), regions, "mesmo objeto, mesma projeção");
  const independent = projectOfficialRegions(JSON.parse(bytes.toString("utf8")));
  assert.notEqual(independent, regions, "outro GeoJSON não herda a projeção");
  assert.deepEqual(independent, regions);
  assert.equal(regions.length, 37);
});
