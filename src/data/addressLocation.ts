import type { RaFeature, RaGeoJSON } from "@/data/geoLoader"

export interface AddressLocation {
  id: string
  label: string
  latitude: number
  longitude: number
  approximate: boolean
}

export function completeCep(value: string): string | null {
  const text = value.trim()
  return /^\d{5}-?\d{3}$/.test(text) ? text.replace("-", "") : null
}

export function looksLikeCep(value: string) {
  return /^[\d\s-]+$/.test(value.trim())
}

// Use the same coordinate envelope as the existing form; it is not an RA boundary.
export function withinFormArea(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -16.2 &&
    latitude <= -15.4 &&
    longitude >= -48.3 &&
    longitude <= -47.3
  )
}

export function parseLocations(payload: unknown): AddressLocation[] {
  if (!Array.isArray(payload))
    throw new Error("Resposta inválida do serviço de localização.")
  return payload.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    const latitude = typeof row.lat === "string" ? Number(row.lat) : NaN
    const longitude = typeof row.lon === "string" ? Number(row.lon) : NaN
    const address = row.address as Record<string, unknown> | undefined
    if (
      !withinFormArea(latitude, longitude) ||
      typeof row.display_name !== "string" ||
      address?.country_code !== "br" ||
      address?.state !== "Distrito Federal"
    )
      return []
    return [
      {
        id: String(row.place_id),
        label: row.display_name,
        latitude,
        longitude,
        approximate:
          !address.house_number ||
          !["house", "building"].includes(String(row.addresstype)),
      },
    ]
  })
}

function inRing(longitude: number, latitude: number, ring: number[][]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i],
      [previousX, previousY] = ring[j]
    if (
      y > latitude !== previousY > latitude &&
      longitude < ((previousX - x) * (latitude - y)) / (previousY - y) + x
    )
      inside = !inside
  }
  return inside
}

export function locationRa(
  geo: RaGeoJSON,
  latitude: number,
  longitude: number,
): RaFeature | undefined {
  return geo.features.find((feature) => {
    const polygons =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates as number[][][]]
        : feature.geometry.coordinates as number[][][][]
    return polygons.some(
      ([outer, ...holes]) =>
        outer &&
        inRing(longitude, latitude, outer) &&
        !holes.some((hole) => inRing(longitude, latitude, hole)),
    )
  })
}
