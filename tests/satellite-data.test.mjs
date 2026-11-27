import { registerHooks } from "node:module"
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context)
    return nextResolve(specifier, context)
  },
})
const {
  satelliteFeatures, satelliteLabelPosition, satelliteMapPoints, satelliteMaskRings,
  satelliteTilesOptions, visibleSatelliteLabels, SATELLITE_TILES, SATELLITE_NATIVE_ZOOM, SATELLITE_DETAIL_ZOOM,
} = await import("../src/components/map/satelliteData.ts")
const { RAS, projectLonLat } = await import("../src/components/map/raMapData.ts")
const geo = JSON.parse(readFileSync(new URL("../public/data/ras-df.geojson", import.meta.url), "utf8"))

test("satélite preserva as geometrias e os identificadores locais ao selecionar RAs", () => {
  const original = JSON.stringify(geo)
  assert.equal(satelliteFeatures(geo).length, 37)
  assert.equal(satelliteFeatures(geo, "RA-I")[0], geo.features.find((feature) => feature.properties.ra_codigo === "RA-I"))
  assert.equal(satelliteFeatures(geo, "inexistente"), geo.features)
  satelliteMaskRings(geo.features)
  assert.equal(JSON.stringify(geo), original)
  for (const feature of geo.features) assert.ok(RAS.some((ra) => ra.code === feature.properties.ra_codigo))
})

test("âncoras dos quantitativos mantêm a posição geográfica do mapa atual", () => {
  for (const ra of RAS) {
    const [lat, lon] = satelliteLabelPosition(ra.code)
    const point = projectLonLat(lon, lat)
    assert.ok(Math.abs(point.x - ra.labelPoint.x) < 1e-8)
    assert.ok(Math.abs(point.y - ra.labelPoint.y) < 1e-8)
  }
  assert.equal(satelliteLabelPosition("inexistente"), null)
})

test("máscara respeita Polygon, MultiPolygon, anéis interiores e ordem latitude/longitude do Leaflet", () => {
  const ring = [[-48, -16], [-47, -16], [-47, -15], [-48, -16]]
  const hole = [[-47.8, -15.8], [-47.7, -15.8], [-47.8, -15.7], [-47.8, -15.8]]
  const features = [{ geometry: { type: "Polygon", coordinates: [ring, hole] } }, { geometry: { type: "MultiPolygon", coordinates: [[ring]] } }]
  const mask = satelliteMaskRings(features)
  assert.equal(mask.length, 4)
  assert.deepEqual(mask[1], ring.map(([lon, lat]) => [lat, lon]))
  assert.deepEqual(mask[2], hole.map(([lon, lat]) => [lat, lon]))
  assert.deepEqual(mask[3], mask[1])
  assert.match(SATELLITE_TILES, /^https:\/\/.+s2cloudless-2024_3857.+\{z\}\/\{y\}\/\{x\}\.jpg$/)
})

test("rótulos sobrepostos são omitidos visualmente sem somar ou alterar quantitativos", () => {
  const anchors = [
    { code: "a", x: 50, y: 50, count: 3 },
    { code: "b", x: 60, y: 60, count: 8 },
    { code: "c", x: 150, y: 50, count: 2 },
    { code: "fora", x: -30, y: 50, count: 100 },
  ]
  const original = JSON.stringify(anchors)
  assert.deepEqual([...visibleSatelliteLabels(anchors, 200, 150)], ["b", "c"])
  assert.equal(JSON.stringify(anchors), original)
  const separated = anchors.map((anchor) => ({ ...anchor, x: anchor.x * 2 }))
  assert.ok(visibleSatelliteLabels(separated, 400, 150).has("c"))
})

test("satélite usa mais tiles em HiDPI e respeita o último nível nativo da EOX", () => {
  const standard = satelliteTilesOptions(false)
  const highDensity = satelliteTilesOptions(true)
  assert.equal(standard.tileSize, highDensity.tileSize * 2)
  for (const options of [standard, highDensity])
    assert.equal(options.maxNativeZoom + options.zoomOffset, SATELLITE_NATIVE_ZOOM)
  assert.equal(SATELLITE_DETAIL_ZOOM, SATELLITE_NATIVE_ZOOM + 1)
})

test("satélite usa as coordenadas publicadas e agrega apenas duplicatas do mesmo identificador", () => {
  const first = { id: "row-1", occurrenceId: "pcdf-1", latitude: -15.7998, longitude: -47.8645 }
  const otherAtSamePosition = { ...first, id: "row-3", occurrenceId: "pcdf-2" }
  const demo = { id: "demo-1", latitude: -15.83, longitude: -47.95 }
  const input = [
    first, { ...first, id: "row-2", natureza: "outra" },
    otherAtSamePosition, demo, { ...demo }, { ...demo, id: "inválido", longitude: NaN },
  ]
  const result = satelliteMapPoints(input)
  assert.deepEqual(result, [first, otherAtSamePosition, demo])
  assert.equal(result[0], first)
})
