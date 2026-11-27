import type { MapFrame, ScreenPoint, ViewportSize } from "@/components/map/streetViewport";

export function clusterViewport(frame: MapFrame, viewport: ViewportSize): MapFrame {
  // xMidYMid meet can show coordinates beyond the viewBox on its padded axis.
  const scale = Math.min(viewport.width / frame.width, viewport.height / frame.height);
  const width = viewport.width / scale;
  const height = viewport.height / scale;
  return { x: frame.x + (frame.width - width) / 2, y: frame.y + (frame.height - height) / 2, width, height };
}

export function buildClusters(points: readonly ScreenPoint[], cellSize: number, viewport?: MapFrame) {
  const cells = new Map<string, { x: number; y: number; count: number }>();
  const right = viewport ? viewport.x + viewport.width : Infinity;
  const bottom = viewport ? viewport.y + viewport.height : Infinity;
  for (const { x, y } of points) {
    if (viewport && (x < viewport.x || x > right || y < viewport.y || y > bottom)) continue;
    const key = `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
    const cell = cells.get(key);
    if (cell) {
      cell.x += x;
      cell.y += y;
      cell.count++;
    } else {
      cells.set(key, { x, y, count: 1 });
    }
  }
  return Array.from(cells, ([key, { x, y, count }]) => ({ key, x: x / count, y: y / count, count }));
}
