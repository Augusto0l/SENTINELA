/** Visual density of fictitious records; does not change counts or geographic data. */
export const HEAT_RADIUS = 24; // Existing SVG projection units, independent of viewport/zoom.
export const HEAT_SIGMA = 8; // Gaussian smoothing; truncated at three standard deviations.
export const HEAT_GRID_STEP = 2;
export const HEAT_MAX_OPACITY = 0.88;
export const HEAT_OPACITY_EXPONENT = 0.6; // Improve visibility without changing the linear color scale.
export const HEAT_COLORS = [[37, 99, 235], [34, 197, 94], [250, 204, 21], [249, 115, 22], [239, 68, 68]] as const;
export const HEAT_GRADIENT = "linear-gradient(to right, #2563eb, #22c55e, #facc15, #f97316, #ef4444)";
export const DASHBOARD_HEAT = { radius: 18, sigma: 6, maxOpacity: 0.76 } as const;

export type HeatPoint = { x: number; y: number };
type GeographicRecord = { latitude: number; longitude: number };
export type DensityField = { values: Float32Array; columns: number; rows: number; step: number; peak: number };

/**
 * Remembers each answer of a deterministic point test, keyed by the exact coordinates.
 * The test still runs once per distinct (x, y); repeated coordinates reuse that same answer,
 * so the result is identical to calling `test` directly. Create a new one whenever the geometry changes.
 */
export function memoizePointTest(test: (x: number, y: number) => boolean): (x: number, y: number) => boolean {
  const answers = new Map<number, Map<number, boolean>>();
  return (x, y) => {
    let column = answers.get(x);
    if (!column) answers.set(x, column = new Map());
    let inside = column.get(y);
    if (inside === undefined) column.set(y, inside = test(x, y));
    return inside;
  };
}

export function projectHeatRecords(
  records: readonly GeographicRecord[],
  project: (longitude: number, latitude: number) => HeatPoint,
  contains: (x: number, y: number) => boolean,
): HeatPoint[] {
  return records.flatMap(record => {
    const { latitude, longitude } = record;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
    const point = project(longitude, latitude);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !contains(point.x, point.y)) return [];
    return [point];
  });
}

export function createDensityField(points: readonly HeatPoint[], width: number, height: number, contains: (x: number, y: number) => boolean = () => true, { radius = HEAT_RADIUS, sigma = HEAT_SIGMA } = {}): DensityField {
  const step = HEAT_GRID_STEP;
  const columns = Math.ceil(width / step) + 1;
  const rows = Math.ceil(height / step) + 1;
  const values = new Float32Array(columns * rows);
  const radiusSquared = radius ** 2;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const left = Math.max(0, Math.ceil((point.x - radius) / step));
    const right = Math.min(columns - 1, Math.floor((point.x + radius) / step));
    const top = Math.max(0, Math.ceil((point.y - radius) / step));
    const bottom = Math.min(rows - 1, Math.floor((point.y + radius) / step));
    for (let row = top; row <= bottom; row++) {
      for (let column = left; column <= right; column++) {
        const distanceSquared = (column * step - point.x) ** 2 + (row * step - point.y) ** 2;
        if (distanceSquared < radiusSquared) {
          // Every record contributes equally. Only overlapping kernels increase density.
          values[row * columns + column] += Math.exp(-distanceSquared / (2 * sigma ** 2));
        }
      }
    }
  }
  let peak = 0;
  for (let index = 0; index < values.length; index++) {
    if (values[index] > peak && contains((index % columns) * step, Math.floor(index / columns) * step)) peak = values[index];
  }
  return { values, columns, rows, step, peak };
}

export function sampleDensity(field: DensityField, x: number, y: number): number {
  const column = x / field.step;
  const row = y / field.step;
  if (column < 0 || row < 0 || column > field.columns - 1 || row > field.rows - 1) return 0;
  const left = Math.floor(column);
  const top = Math.floor(row);
  const right = Math.min(field.columns - 1, left + 1);
  const bottom = Math.min(field.rows - 1, top + 1);
  const fx = column - left;
  const fy = row - top;
  const a = field.values[top * field.columns + left] * (1 - fx) + field.values[top * field.columns + right] * fx;
  const b = field.values[bottom * field.columns + left] * (1 - fx) + field.values[bottom * field.columns + right] * fx;
  return a * (1 - fy) + b * fy;
}

export function densityColor(density: number, referencePeak: number, maxOpacity = HEAT_MAX_OPACITY): [number, number, number, number] {
  const intensity = referencePeak > 0 ? Math.max(0, Math.min(1, density / referencePeak)) : 0;
  const position = intensity * (HEAT_COLORS.length - 1);
  const stop = Math.min(HEAT_COLORS.length - 2, Math.floor(position));
  const fraction = position - stop;
  const start = HEAT_COLORS[stop];
  const end = HEAT_COLORS[stop + 1];
  return [
    Math.round(start[0] + (end[0] - start[0]) * fraction),
    Math.round(start[1] + (end[1] - start[1]) * fraction),
    Math.round(start[2] + (end[2] - start[2]) * fraction),
    Math.round(255 * maxOpacity * intensity ** HEAT_OPACITY_EXPONENT),
  ];
}
