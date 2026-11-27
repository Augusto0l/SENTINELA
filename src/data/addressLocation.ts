import type { RaFeature, RaGeoJSON } from "@/data/geoLoader"
import { validateTerritory } from "@/data/territorial-validation"

export interface AddressLocation {
  id: string
  label: string
  latitude: number
  longitude: number
  approximate: boolean
  street?: string
  district?: string
  source?: "IPEDF"
}

export interface PostalAddress {
  query: string
  label: string
  street: string
  district: string
}

const postalCache = new Map<string, PostalAddress>()
export async function lookupCep(cep: string, signal: AbortSignal): Promise<PostalAddress> {
  const cached = postalCache.get(cep)
  if (cached) return cached
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
  })
  if (!response.ok) throw new Error("Consulta de CEP indisponível. Tente novamente.")
  const result = postalAddressFrom(await response.json())
  if (postalCache.size >= 100) postalCache.delete(postalCache.keys().next().value!)
  postalCache.set(cep, result)
  return result
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
  const field = (name: string) => addressText(payload[name])
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

function addressText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
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
    const road = addressText(address.road)
    const number = addressText(address.house_number)
    const street = road && [road, number].filter(Boolean).join(", ")
    const district = ["neighbourhood", "suburb", "city_district"].map(key => addressText(address[key])).find(Boolean)
    return [
      {
        id: String(row.place_id),
        label: row.display_name,
        latitude,
        longitude,
        ...(street && { street: street.slice(0, 240) }),
        ...(district && { district: district.slice(0, 100) }),
        approximate:
          !address.house_number ||
          !["house", "building"].includes(String(row.addresstype)),
      },
    ]
  })
}

export function locationRa(
  geo: RaGeoJSON,
  latitude: number,
  longitude: number,
): RaFeature | undefined {
  const result = validateTerritory(geo, latitude, longitude)
  if (result.status !== "reference_pending" || result.matches.length !== 1) return undefined
  return geo.features.find(feature => feature.properties.ra_codigo === result.matches[0])
}
