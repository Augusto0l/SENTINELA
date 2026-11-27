import test from "node:test"
import assert from "node:assert/strict"
import { closestPointSymbol, indexPointSymbols, pointAppearance, pointScene, pointSymbolRecords } from "../src/components/map/pointSymbols.ts"

const record = (id, x, y) => ({ id, occurrenceId: id, x, y })
const ids = scene => scene.symbols.flatMap(pointSymbolRecords).map(point => point.id).sort()

test("the viewport preserves coincident UUIDs and includes records centered on its edge", () => {
  const points = [record("a", 4, 6), record("b", 4, 6), record("c", 10, 10), record("outside", 11, 6)]
  const scene = pointScene(indexPointSymbols(points), { left: 0, top: 0, right: 10, bottom: 10 }, 1)
  assert.equal(scene.count, 3)
  assert.equal(scene.symbols.length, 2)
  assert.equal(scene.grouped, 1)
  assert.deepEqual(ids(scene), ["a", "b", "c"])
  assert.deepEqual(pointSymbolRecords(closestPointSymbol(scene.symbols, 4, 6, 1)).map(point => point.id), ["a", "b"])
  assert.equal(closestPointSymbol(scene.symbols, 0, 0, 2), undefined)
})

test("dense grouping accounts for every visible UUID without including records outside the viewport", () => {
  const points = Array.from({ length: 100000 }, (_, index) => record(String(index), index % 400, Math.floor(index / 400)))
  const bounds = { left: 101, right: 280, top: 31, bottom: 221 }
  const expected = points.filter(point => point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom)
  const index = indexPointSymbols(points)
  const scene = pointScene(index, bounds, 1)
  assert.equal(scene.count, expected.length)
  assert(scene.grouped > 0 && scene.symbols.length < scene.count)
  assert.deepEqual(ids(scene), expected.map(point => point.id).sort())
  assert.equal(pointScene(index, bounds, 8).count, scene.count)
})

test("zoom grows radius and opacity within bounded levels", () => {
  const full = pointAppearance(1)
  const closer = pointAppearance(2)
  assert(closer.radius > full.radius && closer.opacity > full.opacity)
  assert.deepEqual(pointAppearance(100), pointAppearance(8))
})
