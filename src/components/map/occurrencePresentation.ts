import type { RaGeoJSON } from "@/data/geoLoader"
import { validateTerritory } from "@/data/territorial-validation"
import type { RAData } from "@/components/map/raMapData"

export function spatialRaName(geometry: RaGeoJSON | undefined, point: { latitude: number; longitude: number },
  regions: readonly Pick<RAData, "code" | "displayName">[] | undefined) {
  if (!geometry) return undefined
  const result = validateTerritory(geometry, point.latitude, point.longitude)
  if (result.status === "boundary_ambiguous" || result.matches.length !== 1) return undefined
  return regions?.find(region => region.code === result.matches[0])?.displayName
}
