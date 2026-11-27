import { completeCep, withinFormArea, type AddressLocation } from "@/data/addressLocation"

export const ipedfEndpoint = "https://geocode.ipe.df.gov.br/api/"

export function ipedfAddressQuery(query: string) {
  // Accept geographic terms only. Do not pass IPEDF's search operators, personal identifiers or unit details.
  if (!/^[\p{L}\p{M}\p{N} .,/ºª°'-]+$/u.test(query)
    || /(?:\d[.()\s/-]*){9,}|\b(?:and|or|cpf|cnpj|rg|telefone|celular|whatsapp|vitima|vítima|suspeito|apartamento|apto|apt|boletim)\b/i.test(query)) return null
  return query.replace(/(?:[,\s-]+(?:brasil|distrito federal|bras[ií]lia|df))+\s*$/i, "")
    .replace(/[,/]+/g, " ").replace(/\s+/g, " ").trim()
}

export function parseIpedfLocations(payload: unknown, postalCode: string | null): AddressLocation[] {
  if (!payload || typeof payload !== "object" || !("type" in payload) || payload.type !== "FeatureCollection"
    || !("features" in payload) || !Array.isArray(payload.features)) throw Error("Resposta geográfica inválida")
  const seen = new Set<string>()
  const results: AddressLocation[] = []
  for (const row of payload.features.slice(0, 5)) {
    const coordinates = row?.geometry?.coordinates
    const label = typeof row?.properties?.nome === "string" ? row.properties.nome.trim() : ""
    if (row?.type !== "Feature" || row.geometry?.type !== "Point" || !Array.isArray(coordinates)
      || coordinates.length !== 2 || !label || label.length > 400 || (postalCode && completeCep(label) !== postalCode)) continue
    const [longitude, latitude] = coordinates
    if (typeof latitude !== "number" || typeof longitude !== "number" || !withinFormArea(latitude, longitude)) continue
    const id = `${longitude},${latitude}`
    if (seen.has(id)) continue
    seen.add(id)
    results.push({ id, label, latitude, longitude, approximate: true, source: "IPEDF" })
  }
  return results
}
