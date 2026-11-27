import type { MapOccurrence } from "@/components/map/MapaDF";

type IndividualSymbol = { x: number; y: number; count: number; records: MapOccurrence[] };
export type PointSymbol = IndividualSymbol | { x: number; y: number; count: number; children: IndividualSymbol[] };
export type PointBounds = { left: number; top: number; right: number; bottom: number };
export type PointScene = { symbols: PointSymbol[]; count: number; grouped: number };

type DensityCell = PointBounds & { x: number; symbol: PointSymbol };
type PointIndex = { positions: IndividualSymbol[]; density: Map<number, DensityCell[]> };
const MAX_INDIVIDUAL_SYMBOLS = 4000;
const GROUP_CELL_PIXELS = 24;

export function indexPointSymbols(points: readonly MapOccurrence[]) {
  const byPosition = new Map<string, IndividualSymbol>();
  for (const point of points) {
    const key = `${point.x}:${point.y}`;
    const existing = byPosition.get(key);
    if (existing) {
      existing.records.push(point);
      existing.count += 1;
    } else {
      byPosition.set(key, { x: point.x, y: point.y, count: 1, records: [point] });
    }
  }
  return { positions: [...byPosition.values()].sort((a, b) => a.x - b.x), density: new Map<number, DensityCell[]>() };
}

function firstAtOrAfter(index: readonly { x: number }[], x: number) {
  let start = 0;
  let end = index.length;
  while (start < end) {
    const middle = (start + end) >>> 1;
    if (index[middle].x < x) start = middle + 1;
    else end = middle;
  }
  return start;
}

export function pointScene(index: PointIndex, bounds: PointBounds, scale: number): PointScene {
  const positions = index.positions;
  const visible: IndividualSymbol[] = [];
  let count = 0;
  let grouped = 0;
  for (let i = firstAtOrAfter(positions, bounds.left); i < positions.length && positions[i].x <= bounds.right; i += 1) {
    const symbol = positions[i];
    if (symbol.y < bounds.top || symbol.y > bounds.bottom) continue;
    visible.push(symbol);
    if (visible.length > MAX_INDIVIDUAL_SYMBOLS) return denseScene(index, bounds, scale);
    count += symbol.count;
    if (symbol.count > 1) grouped += 1;
  }
  return { symbols: visible, count, grouped };
}

function combine(children: IndividualSymbol[]): PointSymbol {
  if (children.length === 1) return children[0];
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const child of children) {
    sumX += child.x * child.count;
    sumY += child.y * child.count;
    count += child.count;
  }
  return { x: sumX / count, y: sumY / count, count, children };
}

function densityGrid(index: PointIndex, size: number) {
  const cached = index.density.get(size);
  if (cached) return cached;
  const groups = new Map<string, IndividualSymbol[]>();
  for (const position of index.positions) {
    const key = `${Math.floor(position.x / size)}:${Math.floor(position.y / size)}`;
    const group = groups.get(key);
    if (group) group.push(position);
    else groups.set(key, [position]);
  }
  const cells = [...groups.values()].map(positions => {
    const left = Math.floor(positions[0].x / size) * size;
    const top = Math.floor(positions[0].y / size) * size;
    return { x: left, left, top, right: left + size, bottom: top + size, symbol: combine(positions) };
  }).sort((a, b) => a.x - b.x);
  const oldest = index.density.keys().next();
  if (index.density.size === 3 && !oldest.done) index.density.delete(oldest.value);
  index.density.set(size, cells);
  return cells;
}

function denseScene(index: PointIndex, bounds: PointBounds, scale: number): PointScene {
  const size = 2 ** Math.ceil(Math.log2(GROUP_CELL_PIXELS / scale));
  const cells = densityGrid(index, size);
  const symbols: PointSymbol[] = [];
  let count = 0;
  let grouped = 0;
  for (let i = firstAtOrAfter(cells, bounds.left - size); i < cells.length && cells[i].left <= bounds.right; i += 1) {
    const cell = cells[i];
    if (cell.bottom < bounds.top || cell.top > bounds.bottom || cell.right < bounds.left) continue;
    let symbol = cell.symbol;
    // Only border cells need to inspect their members. Cached interior cells keep pan costs bounded.
    if (cell.left < bounds.left || cell.right > bounds.right || cell.top < bounds.top || cell.bottom > bounds.bottom) {
      const members = ("children" in symbol ? symbol.children : [symbol]).filter(point =>
        point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom);
      if (!members.length) continue;
      symbol = combine(members);
    }
    symbols.push(symbol);
    count += symbol.count;
    if (symbol.count > 1) grouped += 1;
  }
  return { symbols, count, grouped };
}

export function pointSymbolRecords(symbol: PointSymbol) {
  return "records" in symbol ? symbol.records : symbol.children.flatMap(child => child.records);
}

export function closestPointSymbol(symbols: readonly PointSymbol[], x: number, y: number, radius: number) {
  let distance = radius ** 2;
  let closest: PointSymbol | undefined;
  for (const symbol of symbols) {
    const squared = (x - symbol.x) ** 2 + (y - symbol.y) ** 2;
    if (squared > distance) continue;
    distance = squared;
    closest = symbol;
  }
  return closest;
}

export function pointAppearance(zoom: number) {
  const detail = Math.max(0, Math.min(3, Math.log2(zoom)));
  return { radius: 1.45 + 0.52 * detail, opacity: 0.76 + 0.06 * detail };
}
