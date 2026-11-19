import type { RaFeature, RaGeoJSON } from "@/data/geoLoader"
export const CARTOGRAPHY_PATH = "/data/cartography/ras-ide-2026-11-13.geojson"
export const CARTOGRAPHY_SHA256 = "fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553"
export const BOUNDARY_TOLERANCE = 1e-10 // Degrees, computational uncertainty, not geographic accuracy.
export type TerritorialStatus = "invalid_coordinate" | "consistent" | "outside_df" | "ra_mismatch" | "boundary_ambiguous" | "cartography_unavailable" | "reference_pending"
export interface TerritorialResult { status: TerritorialStatus; matches: string[]; message: string }
const messages: Record<TerritorialStatus, string> = {
  invalid_coordinate: "Informe latitude e longitude numéricas, finitas e completas.",
  consistent: "Ponto consistente com a RA na cartografia IDE/DF adotada; isso não grava nem aprova o registro.",
  outside_df: "Ponto fora do território representado pela cartografia adotada.",
  ra_mismatch: "Coordenadas divergentes da RA selecionada. Corrija os valores; eles foram preservados.",
  boundary_ambiguous: "Fronteira, sobreposição ou incerteza numérica. Nenhuma RA será atribuída automaticamente.",
  cartography_unavailable: "Cartografia indisponível ou inválida; validação territorial não concluída.",
  reference_pending: "Referência territorial pendente: falta correspondência homologada entre UUID do catálogo e código cartográfico.",
}
export function territorialResult(status: TerritorialStatus, matches: string[] = []): TerritorialResult { return { status, matches, message: messages[status] } }
export function polygons(feature: RaFeature): number[][][][] {
  return feature.geometry.type === "Polygon" ? [feature.geometry.coordinates as number[][][]] : feature.geometry.coordinates as number[][][][]
}
function ringValid(r: number[][]): boolean {
  return r.length >= 4 && r.every(p => p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)
    && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]
}
export function structurallyValidCartography(geo: RaGeoJSON): boolean {
  return geo?.type === "FeatureCollection" && Array.isArray(geo.features) && geo.features.length > 0
    && new Set(geo.features.map(f => f.properties?.ra_codigo)).size === geo.features.length
    && geo.features.every(f => f.type === "Feature" && typeof f.properties?.ra_codigo === "string" && Boolean(f.properties.ra_codigo)
      && ["Polygon", "MultiPolygon"].includes(f.geometry?.type) && polygons(f).length > 0 && polygons(f).every(p => p.length > 0 && p.every(ringValid)))
}
function ringRelation(x: number, y: number, ring: number[][]): "boundary" | "inside" | "outside" {
  let inside = false
  for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = ring[i - 1], [bx, by] = ring[i], dx = bx - ax, dy = by - ay
    const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= BOUNDARY_TOLERANCE) return "boundary"
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside
  }
  return inside ? "inside" : "outside"
}
export function validateTerritory(geo: RaGeoJSON | null, latitude: unknown, longitude: unknown, code?: string): TerritorialResult {
  if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return territorialResult("invalid_coordinate")
  if (!geo || !structurallyValidCartography(geo)) return territorialResult("cartography_unavailable")
  const matches: string[] = []; let boundary = false
  for (const feature of geo.features) {
    let contained = false
    for (const polygon of polygons(feature)) {
      const relations = polygon.map(r => ringRelation(longitude, latitude, r))
      if (relations.includes("boundary")) { boundary = true; contained = true }
      if (relations[0] === "inside" && relations.slice(1).every(r => r === "outside")) contained = true
    }
    if (contained) matches.push(feature.properties.ra_codigo)
  }
  matches.sort()
  if (boundary || matches.length > 1) return territorialResult("boundary_ambiguous", matches)
  if (!matches.length) return territorialResult("outside_df")
  if (!code || !geo.features.some(f => f.properties.ra_codigo === code)) return territorialResult("reference_pending", matches)
  return territorialResult(matches[0] === code ? "consistent" : "ra_mismatch", matches)
}
