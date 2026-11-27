import { GEO_BOUNDS, projectLonLat } from "@/components/map/raMapData";

export const STREET_TILE_SIZE = 256;
const MIN_ZOOM = 10;
export const STREET_MAX_TILE_ZOOM = 20;
const DEGREES = 180 / Math.PI;
const WORLD_WIDTH = 360 * GEO_BOUNDS.cosLat * GEO_BOUNDS.scale;
// At this SVG scale a z20 tile occupies its nominal 256 CSS pixels.
export const MAX_STREET_SCALE = STREET_TILE_SIZE * 2 ** STREET_MAX_TILE_ZOOM / WORLD_WIDTH;

function mercatorRow(latitude: number, tilesPerAxis: number) {
  return (1 - Math.asinh(Math.tan(latitude / DEGREES)) / Math.PI) * tilesPerAxis / 2;
}

function latitudeAtRow(row: number, tilesPerAxis: number) {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * row / tilesPerAxis))) * DEGREES;
}

export function streetTileLayout(viewBox: string, pixelWidth: number, pixelHeight: number, padding = 0) {
  if (pixelWidth <= 0 || pixelHeight <= 0) return { tiles: [], overlap: 0 };
  const [x, y, width, height] = viewBox.split(" ").map(Number);
  const scale = Math.min(pixelWidth / width, pixelHeight / height);
  const zoom = Math.min(STREET_MAX_TILE_ZOOM, Math.max(MIN_ZOOM, Math.ceil(Math.log2(WORLD_WIDTH * scale / STREET_TILE_SIZE))));
  const tilesPerAxis = 2 ** zoom;

  // The root SVG centers its viewBox. Include the visible margins on wide and tall screens.
  const marginX = ((pixelWidth / 2 + padding) / scale) - width / 2;
  const marginY = ((pixelHeight / 2 + padding) / scale) - height / 2;
  const left = x - marginX;
  const right = x + width + marginX;
  const top = y - marginY;
  const bottom = y + height + marginY;
  const tileWidth = WORLD_WIDTH / tilesPerAxis;
  const worldLeft = projectLonLat(-180, 0).x;
  const latitudeAtY = (mapY: number) => GEO_BOUNDS.maxLat - (mapY - GEO_BOUNDS.padding) / GEO_BOUNDS.scale;
  const firstColumn = Math.floor((left - worldLeft) / tileWidth);
  const columnLimit = Math.ceil((right - worldLeft) / tileWidth);
  const tiles = [];

  for (let row = Math.floor(mercatorRow(latitudeAtY(top), tilesPerAxis));
    row < Math.ceil(mercatorRow(latitudeAtY(bottom), tilesPerAxis)); row++) {
    // Fit each raster row to its latitude bounds in the existing SVG projection.
    const tileTop = projectLonLat(0, latitudeAtRow(row, tilesPerAxis)).y;
    const tileBottom = projectLonLat(0, latitudeAtRow(row + 1, tilesPerAxis)).y;
    for (let column = firstColumn; column < columnLimit; column++) {
      tiles.push({
        id: `${zoom}/${column}/${row}`,
        x: worldLeft + column * tileWidth,
        y: tileTop,
        width: tileWidth,
        height: tileBottom - tileTop,
      });
    }
  }
  // A screen pixel of overlap covers rasterization seams between adjacent SVG images.
  return { tiles, overlap: 1 / scale };
}
