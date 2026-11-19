import { CARTOGRAPHY_SHA256 } from "@/data/territorial-validation"
import type { RaGeoJSON } from "@/data/geoLoader"
import { projectLonLat, RA_BY_CODE, type RAData } from "@/components/map/raMapData"

export const OFFICIAL_GEOJSON_PATH = "/data/cartography/ras-ide-2026-11-13.geojson"

export async function loadOfficialRegions(signal: AbortSignal): Promise<RaGeoJSON> {
  const response = await fetch(OFFICIAL_GEOJSON_PATH, { signal })
  if (!response.ok) throw new Error("Limites oficiais indisponíveis.")
  const bytes = await response.arrayBuffer()
  const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map(value => value.toString(16).padStart(2, "0")).join("")
  if (sha !== CARTOGRAPHY_SHA256) throw new Error("Versão cartográfica inesperada.")
  return JSON.parse(new TextDecoder().decode(bytes)) as RaGeoJSON
}

export function projectOfficialRegions(geo: RaGeoJSON): RAData[] {
  return geo.features.map(({ properties, geometry }) => {
    const code = properties.ra_codigo
    const legacy = RA_BY_CODE[code]
    const rings = geometry.type === "Polygon" ? geometry.coordinates as number[][][]
      : (geometry.coordinates as number[][][][]).flat()
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const path = rings.map(ring => ring.map(([lon, lat], index) => {
      const { x, y } = projectLonLat(lon, lat)
      minX = Math.min(minX, x); minY = Math.min(minY, y)
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
      return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`
    }).join("") + "Z").join("")
    const width = maxX - minX, height = maxY - minY
    return {
      id: code, code, number: legacy?.number ?? 0, sourceName: properties.ra_nome,
      displayName: legacy?.displayName ?? properties.ra_nome, areaKm2: properties.ra_areakm2 ?? 0,
      geometryType: geometry.type, path, bounds: { x: minX, y: minY, width, height },
      viewBox: `${minX - 12} ${minY - 12} ${width + 24} ${height + 24}`,
      labelPoint: legacy?.labelPoint ?? { x: minX + width / 2, y: minY + height / 2 },
    }
  })
}
