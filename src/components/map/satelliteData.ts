import type { RaFeature, RaGeoJSON } from "@/data/geoLoader"
import { GEO_BOUNDS, RA_BY_CODE } from "@/components/map/raMapData"
import type { MapOccurrence } from "@/components/map/MapaDF"

// Public non-commercial WMTS endpoint. See docs/relatorio-mapa-satelite.md.
export const SATELLITE_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"
export const SATELLITE_NATIVE_ZOOM = 14
export const SATELLITE_DETAIL_ZOOM = SATELLITE_NATIVE_ZOOM + 1
export const SATELLITE_ATTRIBUTION = '<a href="https://cloudless.eox.at/">EOxCloudless</a> by <a href="https://eox.at/">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2024) · <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a>'

export function satelliteTilesOptions(highDensity: boolean) {
  // On HiDPI screens, fit more native tiles in the same extent without asking EOX for z15.
  return highDensity
    ? { tileSize: 128, zoomOffset: 1, maxNativeZoom: SATELLITE_NATIVE_ZOOM - 1 }
    : { tileSize: 256, zoomOffset: 0, maxNativeZoom: SATELLITE_NATIVE_ZOOM }
}

export function satelliteMapPoints(points: readonly MapOccurrence[]) {
  const seen = new Set<string>()
  return points.filter(({ id, occurrenceId, latitude, longitude }) => {
    const key = occurrenceId ?? id
    if (seen.has(key) || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false
    seen.add(key)
    return true
  })
}

export function satelliteFeatures(geo: RaGeoJSON, selectedRaCode?: string | null) {
  const selected = geo.features.filter((feature) => feature.properties.ra_codigo === selectedRaCode)
  return selected.length ? selected : geo.features
}

export function satelliteLabelPosition(code: string): [number, number] | null {
  const ra = RA_BY_CODE[code]
  if (!ra) return null
  // Invert only the existing label anchor projection, never the polygon geometry.
  return [
    GEO_BOUNDS.maxLat - (ra.labelPoint.y - GEO_BOUNDS.padding) / GEO_BOUNDS.scale,
    GEO_BOUNDS.minLon + (ra.labelPoint.x - GEO_BOUNDS.padding) / (GEO_BOUNDS.cosLat * GEO_BOUNDS.scale),
  ]
}

export function satelliteMaskRings(features: RaFeature[]): [number, number][][] {
  const rings: [number, number][][] = [[[-85, -180], [-85, 180], [85, 180], [85, -180]]]
  for (const feature of features) {
    const polygons = feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates as number[][][]]
      : feature.geometry.coordinates as number[][][][]
    for (const polygon of polygons) for (const ring of polygon)
      rings.push(ring.map(([longitude, latitude]) => [latitude, longitude]))
  }
  return rings
}

export function visibleSatelliteLabels(anchors: { code: string; x: number; y: number; count: number }[], width: number, height: number) {
  const visible = new Set<string>()
  const placed: { x: number; y: number }[] = []
  for (const anchor of [...anchors].sort((a, b) => b.count - a.count)) {
    if (anchor.x < 19 || anchor.x > width - 19 || anchor.y < 0 || anchor.y > height - 20) continue
    if (placed.some((other) => Math.abs(other.x - anchor.x) < 42 && Math.abs(other.y - anchor.y) < 24)) continue
    placed.push(anchor)
    visible.add(anchor.code)
  }
  return visible
}
