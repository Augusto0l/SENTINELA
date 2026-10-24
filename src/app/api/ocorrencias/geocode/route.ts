import {
  completeCep,
  parseLocations,
  parsePostalLocations,
  postalSearches,
  type AddressLocation,
} from "@/data/addressLocation"

export const runtime = "nodejs"
interface CachedLocations {
  expires: number
  results: AddressLocation[]
}
const cache = new Map<string, CachedLocations>()
let nextRequestAt = 0
let busy = false

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const query = params.get("q")?.trim().replace(/\s+/g, " ") ?? ""
  if (query.length < 5 || query.length > 240 || !/\p{L}/u.test(query))
    return Response.json(
      { error: "Informe um endereço completo com até 240 caracteres." },
      { status: 400 },
    )

  const isPostal = params.has("cep")
  const street = params.get("street")?.trim().replace(/\s+/g, " ") ?? ""
  const district = params.get("district")?.trim().replace(/\s+/g, " ") ?? ""
  if (
    isPostal &&
    (!completeCep(params.get("cep") ?? "") ||
      street.length > 160 ||
      district.length > 160)
  )
    return Response.json({ error: "Dados postais inválidos." }, { status: 400 })

  const searches = isPostal
    ? postalSearches(query, street, district)
    : [{ query, reference: "" }]

  const key = JSON.stringify([
    isPostal,
    query,
    street,
    district,
  ]).toLocaleLowerCase("pt-BR")
  const saved = cache.get(key)
  if (saved && saved.expires > Date.now())
    return Response.json({ results: saved.results })
  // Shared by all callers in this local Node process, including different tabs.
  if (busy || Date.now() < nextRequestAt)
    return Response.json(
      { error: "Aguarde um instante antes de buscar novamente." },
      {
        status: 429,
        headers: { "Retry-After": "2" },
      },
    )
  busy = true
  try {
    let results: AddressLocation[] = []
    for (const search of searches) {
      const wait = nextRequestAt - Date.now()
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      nextRequestAt = Date.now() + 1100
      // Server-only setting permits switching provider without changing the frontend.
      const url = new URL(
        process.env.SENTINELA_GEOCODER_URL ??
          "https://nominatim.openstreetmap.org/search",
      )
      url.search = new URLSearchParams({
        q: search.query,
        format: "jsonv2",
        addressdetails: "1",
        countrycodes: "br",
        viewbox: "-48.3,-15.4,-47.3,-16.2",
        bounded: "1",
        limit: "5",
        "accept-language": "pt-BR",
      }).toString()
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "SENTINELA-Academic-Demo/1.0 (+https://github.com/CAMPUSCEUB/Sentinela)",
        },
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      })
      if (!response.ok) throw new Error("Geocodificador indisponível")
      const payload: unknown = await response.json()
      results = isPostal
        ? parsePostalLocations(payload, search.reference)
        : parseLocations(payload)
      if (results.length) break
    }
    if (cache.size >= 200) cache.delete(cache.keys().next().value!)
    cache.set(key, { results, expires: Date.now() + 24 * 60 * 60 * 1000 })
    return Response.json({ results })
  } catch {
    return Response.json(
      {
        error:
          "Serviço de localização indisponível. Tente novamente ou ajuste as coordenadas manualmente.",
      },
      { status: 503 },
    )
  } finally {
    busy = false
  }
}
