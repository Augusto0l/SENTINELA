import type { RaFeature, RaGeoJSON } from "@/data/geoLoader"

export interface AddressLocation {
  id: string
  label: string
  latitude: number
  longitude: number
  approximate: boolean
}

export interface PostalAddress {
  query: string
  label: string
  street: string
  district: string
}

export function postalAddressFrom(
  payload: Record<string, unknown>,
): PostalAddress {
  if (payload.erro)
    throw new Error(
      "CEP não encontrado. As coordenadas anteriores foram mantidas.",
    )
  if (payload.uf !== "DF")
    throw new Error(
      "O CEP informado não pertence ao Distrito Federal. As coordenadas foram mantidas.",
    )
  const field = (name: string) =>
    typeof payload[name] === "string"
      ? payload[name].trim().replace(/\s+/g, " ")
      : ""
  const street = field("logradouro")
  const district = field("bairro")
  const city = field("localidade")
  return {
    street,
    district,
    label: [street, district, city, "DF", field("cep")]
      .filter(Boolean)
      .join(", "),
    query: [street || district, city, "Distrito Federal", "Brasil"]
      .filter(Boolean)
      .join(", "),
  }
}

function normalizedReference(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

export function postalSearches(
  query: string,
  street: string,
  district: string,
) {
  // Keep the postal street intact: dropping quadra numbers can find unrelated places.
  const searches = street ? [{ query, reference: street }] : []
  if (street && district)
    searches.push({
      query: `${street}, ${district}, Distrito Federal, Brasil`,
      reference: street,
    })
  if (district)
    searches.push({
      query: `${district}, Distrito Federal, Brasil`,
      reference: district,
    })
  return searches.filter(
    (item, index) =>
      searches.findIndex((other) => other.query === item.query) === index,
  )
}

export function parsePostalLocations(
  payload: unknown,
  reference: string,
): AddressLocation[] {
  const locations = parseLocations(payload)
  // Nominatim can silently discard unmatched terms. Require the actual street/region
  // in a returned name/address field rather than accepting any point within the DF.
  const matchingIds = new Set(
    (payload as Record<string, unknown>[])
      .filter((row) => {
        if (!row || typeof row !== "object") return false
        const address =
          row.address && typeof row.address === "object"
            ? Object.values(row.address)
            : []
        const normalize = (value: string) =>
          normalizedReference(value).replace(/^quadra /, "")
        return [row.name, ...address].some(
          (value) =>
            typeof value === "string" &&
            normalize(value) === normalize(reference),
        )
      })
      .map((row) => String(row.place_id)),
  )
  return locations
    .filter((location) => matchingIds.has(location.id))
    .map((location) => ({ ...location, approximate: true }))
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
