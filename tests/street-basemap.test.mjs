import assert from "node:assert/strict";
import test from "node:test";
import "../scripts/contracts-runtime.mjs";

const { MAP_VIEWBOX, projectLonLat, RA_BY_CODE } = await import("../src/components/map/raMapData.ts");
const { streetTileLayout, MAX_STREET_SCALE, STREET_MAX_TILE_ZOOM } = await import("../src/components/map/streetTiles.ts");
const { focusMapFrame, moveMapFrame, parseMapFrame } = await import("../src/components/map/streetViewport.ts");

test("a base de ruas cobre o enquadramento inteiro em desktop e mobile com poucos tiles", () => {
  for (const [width, height, maxTiles] of [[1144, 614, 40], [366, 370, 20]]) {
    const { tiles, overlap } = streetTileLayout(MAP_VIEWBOX, width, height);
    const [, , viewWidth, viewHeight] = MAP_VIEWBOX.split(" ").map(Number);
    const scale = Math.min(width / viewWidth, height / viewHeight);
    assert.equal(overlap * scale, 1);
    const marginX = (width / scale - viewWidth) / 2;
    const marginY = (height / scale - viewHeight) / 2;
    assert(tiles.length > 0 && tiles.length <= maxTiles);
    assert(Math.min(...tiles.map(tile => tile.x)) <= -marginX);
    assert(Math.min(...tiles.map(tile => tile.y)) <= -marginY);
    assert(Math.max(...tiles.map(tile => tile.x + tile.width)) >= viewWidth + marginX);
    assert(Math.max(...tiles.map(tile => tile.y + tile.height)) >= viewHeight + marginY);
  }
  assert.deepEqual(streetTileLayout(MAP_VIEWBOX, 0, 0), { tiles: [], overlap: 0 });
});

test("o zoom preserva a posição sob o cursor e sob o centro da pinça", () => {
  const fit = parseMapFrame(MAP_VIEWBOX);
  const project = (frame, viewport, position) => {
    const scale = Math.min(viewport.width / frame.width, viewport.height / frame.height);
    return {
      x: frame.x + (position.x - (viewport.width - frame.width * scale) / 2) / scale,
      y: frame.y + (position.y - (viewport.height - frame.height * scale) / 2) / scale,
    };
  };
  for (const viewport of [{ width: 1144, height: 614 }, { width: 366, height: 370 }]) {
    const from = { x: viewport.width * .65, y: viewport.height * .6 };
    for (const to of [from, { x: from.x + 18, y: from.y - 11 }]) {
      const zoomed = moveMapFrame(fit, fit, viewport, from, to, 2);
      const original = project(fit, viewport, from);
      const moved = project(zoomed, viewport, to);
      assert(Math.hypot(original.x - moved.x, original.y - moved.y) < 1e-9);
    }
    assert.deepEqual(moveMapFrame(fit, fit, viewport, from, { x: 0, y: 0 }), fit);
  }
});

test("o arraste mantém o nível de zoom, com limites e restauração do enquadramento", () => {
  const fit = parseMapFrame(RA_BY_CODE["RA-I"].viewBox);
  const viewport = { width: 1144, height: 614 };
  const center = { x: 572, y: 307 };
  const zoomed = moveMapFrame(fit, fit, viewport, center, center, 2 ** 20);
  assert(Math.abs(Math.min(viewport.width / zoomed.width, viewport.height / zoomed.height) - MAX_STREET_SCALE) < 1e-9);
  const panned = moveMapFrame(zoomed, fit, viewport, center, { x: 552, y: 275 });
  assert.equal(panned.width, zoomed.width);
  assert(panned.x > zoomed.x && panned.y > zoomed.y);
  assert.deepEqual(moveMapFrame(panned, fit, viewport, center, center, 2 ** -20), fit);
});

test("o limite da câmera exibe tiles z20 na escala nativa no DF e na RA, em desktop e mobile", () => {
  assert.equal(STREET_MAX_TILE_ZOOM, 20);
  for (const viewBox of [MAP_VIEWBOX, RA_BY_CODE["RA-I"].viewBox]) {
    const fit = parseMapFrame(viewBox);
    for (const viewport of [{ width: 1144, height: 614 }, { width: 366, height: 370 }]) {
      const anchor = { x: viewport.width * .61, y: viewport.height * .46 };
      const zoomed = moveMapFrame(fit, fit, viewport, anchor, anchor, 2 ** 20);
      assert.deepEqual(moveMapFrame(zoomed, fit, viewport, anchor, anchor, 2), zoomed);
      const frame = [zoomed.x, zoomed.y, zoomed.width, zoomed.height].join(" ");
      const { tiles } = streetTileLayout(frame, viewport.width, viewport.height, 32);
      assert(tiles.length > 0 && tiles.length <= 40);
      assert(tiles.every(tile => tile.id.startsWith("20/")));
      const scale = Math.min(viewport.width / zoomed.width, viewport.height / zoomed.height);
      assert(Math.abs(tiles[0].width * scale - 256) < 1e-8);
    }
  }
});

test("redimensionar o mapa no zoom máximo não amplia os tiles acima da escala nativa", () => {
  const fit = parseMapFrame(MAP_VIEWBOX);
  const mobile = { width: 366, height: 370 };
  const desktop = { width: 1144, height: 614 };
  const mobileCenter = { x: mobile.width / 2, y: mobile.height / 2 };
  const desktopCenter = { x: desktop.width / 2, y: desktop.height / 2 };
  const zoomed = moveMapFrame(fit, fit, mobile, mobileCenter, mobileCenter, 2 ** 20);
  const resized = moveMapFrame(zoomed, fit, desktop, desktopCenter, desktopCenter);
  assert(resized.width > zoomed.width);
  assert(Math.abs(Math.min(desktop.width / resized.width, desktop.height / resized.height) - MAX_STREET_SCALE) < 1e-9);
  assert(Math.abs(resized.x + resized.width / 2 - zoomed.x - zoomed.width / 2) < 1e-9);
  assert(Math.abs(resized.y + resized.height / 2 - zoomed.y - zoomed.height / 2) < 1e-9);
});

test("a base acompanha o foco da RA e alinha referências à projeção dos overlays", () => {
  const latitude = -15.7998, longitude = -47.8645;
  const reference = projectLonLat(longitude, latitude);
  const raFrame = RA_BY_CODE["RA-I"].viewBox;
  const { tiles: dfTiles } = streetTileLayout(MAP_VIEWBOX, 1144, 614);
  const { tiles: raTiles } = streetTileLayout(raFrame, 1144, 614);
  assert(Number(raTiles[0].id.split("/")[0]) > Number(dfTiles[0].id.split("/")[0]));

  for (const [tiles, viewBox] of [[dfTiles, MAP_VIEWBOX], [raTiles, raFrame]]) {
    const [, , width, height] = viewBox.split(" ").map(Number);
    const scale = Math.min(1144 / width, 614 / height);
    const zoom = Number(tiles[0].id.split("/")[0]);
    const axis = 2 ** zoom;
    const column = (longitude + 180) * axis / 360;
    const row = (1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) * axis / 2;
    const tile = tiles.find(item => item.id === `${zoom}/${Math.floor(column)}/${Math.floor(row)}`);
    assert(tile);
    const imageX = tile.x + (column % 1) * tile.width;
    const imageY = tile.y + (row % 1) * tile.height;
    assert(Math.abs(reference.x - imageX) * scale < 1);
    assert(Math.abs(reference.y - imageY) * scale < 1);
  }
});

test("a ocorrencia selecionada centraliza perto da borda ao abrir, ampliar e redimensionar", () => {
  const fit = parseMapFrame(RA_BY_CODE["RA-I"].viewBox);
  const selected = { x: fit.x + fit.width * .99, y: fit.y + fit.height * .03 };
  const center = frame => ({ x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 });
  const assertCentered = frame => {
    const p = center(frame);
    assert(Math.hypot(p.x - selected.x, p.y - selected.y) < 1e-8);
  };
  const desktop = { width: 1144, height: 614 };
  const mobile = { width: 366, height: 370 };
  const desktopCenter = { x: 572, y: 307 };
  const mobileCenter = { x: 183, y: 185 };
  const initial = focusMapFrame(fit, desktop, selected);
  assert(initial.width < fit.width);
  assertCentered(initial);
  const zoomed = moveMapFrame(initial, fit, desktop, desktopCenter, desktopCenter, 1.6, selected);
  assert(zoomed.width < initial.width);
  assertCentered(zoomed);
  assertCentered(moveMapFrame(zoomed, fit, mobile, mobileCenter, mobileCenter, 1, selected));
  assertCentered(focusMapFrame(fit, mobile, selected));
});
