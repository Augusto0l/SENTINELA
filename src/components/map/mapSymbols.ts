import { MAP_WIDTH } from "@/components/map/raMapData";

/** SVG-unit sizes approved for the full DF frame. */
export const CLUSTER_CELL = 80;

/**
 * Share of the full DF frame covered by the fitted view: 1 for the DF, below 1 when one RA is framed.
 * Symbol sizes defined in SVG units scale with it, so a focused RA keeps the screen size of the DF view.
 */
export function frameDetail(fittedViewBox: string) {
  const width = Number(fittedViewBox.split(" ")[2]);
  return Number.isFinite(width) && width > 0 ? Math.min(1, width / MAP_WIDTH) : 1;
}

export function pointRadius(symbolScale: number, detail: number) {
  return Math.max(2.4 * detail, 1.2 / symbolScale);
}

export function clusterCell(detail: number) {
  return CLUSTER_CELL * detail;
}

export function clusterSymbol(count: number, symbolScale: number, detail: number) {
  const baseRadius = Math.max(12, Math.min(27, 8 + Math.sqrt(count) * 2.4)) * detail;
  // Screen minima keep the counts readable without moving cluster centers.
  const radius = Math.max(baseRadius, (6 + Math.sqrt(count) * 0.35) / symbolScale);
  const fontSize = Math.max((radius < 18 * detail ? 11 : 12) * detail, 9 / symbolScale);
  return { radius, fontSize };
}
