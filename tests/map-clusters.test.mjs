import assert from "node:assert/strict";
import test from "node:test";
import { buildClusters, clusterViewport } from "../src/components/map/mapClusters.ts";

const represented = clusters => clusters.reduce((total, cluster) => total + cluster.count, 0);

test("only members inside the viewport contribute to the cluster count and center", () => {
  const points = [
    { x: 14, y: 5 }, { x: 23, y: 5 }, { x: 26, y: 5 }, { x: 27, y: 5 },
    { x: 35, y: 5 }, { x: 36, y: 5 }, { x: 51, y: 5 },
  ];
  const viewport = { x: 26, y: 0, width: 14, height: 10 };
  assert.deepEqual(buildClusters(points, 20, viewport), [{ key: "1,0", x: 31, y: 5, count: 4 }]);
  assert.equal(represented(buildClusters(points, 20)), points.length);

  const left = { ...viewport, x: 0 };
  assert.deepEqual(buildClusters(points, 20, left), [{ key: "0,0", x: 14, y: 5, count: 1 }]);
  assert.deepEqual(buildClusters(points, 20, { ...viewport, x: 34 }), [{ key: "1,0", x: 35.5, y: 5, count: 2 }]);
  assert.deepEqual(buildClusters(points, 20, { ...viewport, x: 60 }), []);
});

test("counts each occurrence once across zoom levels and preserves different IDs at the same coordinates", () => {
  const points = [
    { id: "a", x: 3, y: 2, natures: ["one", "two"] },
    { id: "b", x: 3, y: 2, natures: ["one"] },
    { id: "c", x: 16, y: 4, natures: ["two"] },
    { id: "d", x: 35, y: 6, natures: ["three"] },
  ];
  const viewport = { x: 0, y: 0, width: 40, height: 10 };
  const overview = buildClusters(points, 40, viewport);
  const zoomed = buildClusters(points, 10, viewport);
  assert.deepEqual(overview.map(cluster => cluster.count), [4]);
  assert.deepEqual(zoomed.map(cluster => cluster.count), [2, 1, 1]);
  assert.deepEqual(zoomed[0], { key: "0,0", x: 3, y: 2, count: 2 });
  assert.equal(represented(zoomed), points.length);
});

test("the crop includes the visible SVG area beyond its centered viewBox on either axis", () => {
  const frame = { x: 10, y: 20, width: 100, height: 100 };
  const wide = clusterViewport(frame, { width: 400, height: 200 });
  const tall = clusterViewport(frame, { width: 200, height: 400 });
  assert.deepEqual(wide, { x: -40, y: 20, width: 200, height: 100 });
  assert.deepEqual(tall, { x: 10, y: -30, width: 100, height: 200 });
  const points = [{ x: -40, y: 120 }, { x: 160, y: 20 }, { x: 20, y: -30 }, { x: 110, y: 170 }, { x: 161, y: 20 }];
  assert.equal(represented(buildClusters(points, 40, wide)), 2);
  assert.equal(represented(buildClusters(points, 40, tall)), 2);
});
