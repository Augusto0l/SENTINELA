import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  completeCep,
  parseLocations,
  parsePostalLocations,
  postalSearches,
  type AddressLocation,
} from "@/data/addressLocation"
import type { RaGeoJSON } from "@/data/geoLoader"
import { CARTOGRAPHY_PATH, structurallyValidCartography, validateTerritory } from "@/data/territorial-validation"
import { ipedfAddressQuery, ipedfEndpoint, parseIpedfLocations } from "@/lib/geocoding/ipedf"

export const runtime = "nodejs"
interface CachedLocations {
  expires: number
  results: AddressLocation[]
}
const cache = new Map<string, CachedLocations>()
let nextRequestAt = 0
let busy = false
let boundaries: Promise<RaGeoJSON> | undefined

function officialBoundaries() {
  return boundaries ??= readFile(join(process.cwd(), "public", CARTOGRAPHY_PATH), "utf8").then(data => {
    const geo: RaGeoJSON = JSON.parse(data)
    if (!structurallyValidCartography(geo)) throw Error("Limites territoriais inválidos")
    return geo
  }).catch(error => { boundaries = undefined; throw error })
}

function limited() {
  return Response.json({ error: "Aguarde um instante antes de buscar novamente." },
    { status: 429, headers: { "Retry-After": String(Math.max(2, Math.ceil((nextRequestAt - Date.now()) / 1000))) } })
}

export async function GET(request: Request) {
  return searchLocations(new URL(request.url).searchParams,
    process.env.SENTINELA_GEOCODER_URL ?? "https://nominatim.openstreetmap.org/search")
}

export async function searchLocations(params: URLSearchParams, endpoint: string,
  options: { signal?: AbortSignal; verifyTerritory?: boolean } = {}) {
  const query = params.get("q")?.trim().replace(/\s+/g, " ") ?? ""
  const official = endpoint === ipedfEndpoint
  const isPostal = params.has("cep")
  if (query.length < (options.verifyTerritory ? 3 : 5) || query.length > 240 || (!isPostal && !/\p{L}/u.test(query)))
    return Response.json(
      { error: "Informe um endereço completo com até 240 caracteres." },
      { status: 400 },
    )

  const postalCode = completeCep(params.get("cep") ?? "")
  const street = params.get("street")?.trim().replace(/\s+/g, " ") ?? ""
  const district = params.get("district")?.trim().replace(/\s+/g, " ") ?? ""
  if (
    isPostal &&
    (!postalCode ||
      street.length > 160 ||
      district.length > 160)
  )
    return Response.json({ error: "Dados postais inválidos." }, { status: 400 })

  const geographicQuery = official ? postalCode ?? ipedfAddressQuery(query) : query
  if (!geographicQuery || geographicQuery.length < 3)
    return Response.json({ error: "Informe somente o logradouro, setor ou CEP. Remova informações pessoais e complementos privados." }, { status: 400 })
  const searches = official ? [{ query: geographicQuery, reference: "" }] : isPostal
    ? postalSearches(query, street, district)
    : [{ query, reference: "" }]

  const key = JSON.stringify([
    endpoint,
    isPostal,
    geographicQuery,
    official ? "" : street,
    official ? "" : district,
  ]).toLocaleLowerCase("pt-BR")
  // IPEDF publishes integration guidance without a cache policy. Keep its responses out of the cache.
  const saved = official || options.verifyTerritory ? undefined : cache.get(key)
  if (saved && saved.expires > Date.now())
    return Response.json({ results: saved.results })
  // Shared by all callers in this local Node process, including different tabs.
  if (busy || Date.now() < nextRequestAt) return limited()
  busy = true
  const deadline = AbortSignal.timeout(options.verifyTerritory ? 8000 : 38000)
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline
  try {
    let results: AddressLocation[] = []
    for (const search of searches) {
      const wait = nextRequestAt - Date.now()
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      signal.throwIfAborted()
      nextRequestAt = Date.now() + 1100
      // Server-only setting permits switching provider without changing the frontend.
      const url = new URL(endpoint)
      url.search = new URLSearchParams(official ? { localidade: search.query, limite: "5" } : {
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
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        redirect: "error",
        cache: "no-store",
      })
      if (response.status === 429) {
        const retry = response.headers.get("Retry-After") ?? ""
        const millis = /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()
        nextRequestAt = Date.now() + (Number.isFinite(millis) ? Math.max(2000, millis) : 2000)
        return limited()
      }
      if (!response.ok) throw new Error("Geocodificador indisponível")
      const payload: unknown = await response.json()
      results = official ? parseIpedfLocations(payload, postalCode) : isPostal
        ? parsePostalLocations(payload, search.reference)
        : parseLocations(payload)
      if (results.length) break
    }
    if (options.verifyTerritory && results.length) {
      const geo = await officialBoundaries()
      results = results.filter(({ latitude, longitude }) => validateTerritory(geo, latitude, longitude).matches.length > 0)
    }
    if (!options.verifyTerritory && !official) {
      if (cache.size >= 200) cache.delete(cache.keys().next().value!)
      cache.set(key, { results, expires: Date.now() + 24 * 60 * 60 * 1000 })
    }
    return Response.json({ results })
  } catch (error) {
    if (deadline.aborted || (error instanceof Error && error.name === "TimeoutError"))
      return Response.json({ error: "A pesquisa de localização demorou demais. Tente novamente ou ajuste o mapa." }, { status: 504 })
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
