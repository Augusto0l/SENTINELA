import { GET as geocode } from "@/lib/geocoding/handler"
import { getAccess } from "@/lib/auth/server"
import { canReadOperational, operationalHostAllowed } from "@/lib/auth/operational-access"
import { businessDataEnabled, hasPermission } from "@/lib/auth/policy"
import { searchLocations } from "@/lib/geocoding/handler"
import { ipedfEndpoint } from "@/lib/geocoding/ipedf"
import { JsonLimitExceeded, readBoundedJson } from "@/lib/http/read-json"
import { z } from "zod"

export const runtime = "nodejs"
export async function GET(request: Request) {
  const access = await getAccess()
  const status = access.status === "unauthenticated" ? 401 : access.status === "unavailable" ? 503 : access.status === "unlinked" ? 403 : 200
  if (status !== 200) return Response.json({ error: "Acesso autenticado necessário." }, { status, headers: { "Cache-Control": "no-store" } })
  if (access.status !== "allowed" || access.principal.source === "local" || !hasPermission(access.principal.role, "cadastrar") || !businessDataEnabled()) {
    return Response.json({ error: "Geocodificação bloqueada até aprovação do escopo e do tratamento de endereços." }, { status: 403, headers: { "Cache-Control": "no-store" } })
  }
  return geocode(request)
}

const localSearch = z.strictObject({
  q: z.string().trim().min(3).max(240), cep: z.string().regex(/^\d{8}$/).optional(),
  street: z.string().max(160).optional(), district: z.string().max(160).optional(),
})

export async function POST(request: Request) {
  const errorResponse = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } })
  const access = await getAccess()
  if (access.status === "unauthenticated") return errorResponse(401, "Sessão necessária.")
  if (access.status === "unavailable") return errorResponse(503, "Sessão indisponível.")
  if (access.status !== "allowed" || !canReadOperational(access.principal) || !hasPermission(access.principal.role, "cadastrar")
    || (access.principal.source === "supabase" && !operationalHostAllowed(request.headers.get("host")))
    || request.headers.get("origin") !== process.env.SENTINELA_APP_ORIGIN)
    return errorResponse(403, "Busca não autorizada.")
  let provider: URL
  try {
    provider = new URL(process.env.SENTINELA_MANUAL_GEOCODER_URL ?? "")
    if (/(?:^|\.)openstreetmap\.org\.?$/i.test(provider.hostname) || provider.hostname === "photon.komoot.io"
      || (provider.hostname === "geocode.ipe.df.gov.br" && provider.href !== ipedfEndpoint)
      || provider.username || provider.password || provider.hash || provider.search
      || (provider.protocol !== "https:" && !(provider.protocol === "http:" && provider.hostname === "127.0.0.1"))) throw Error()
  } catch {
    return errorResponse(503, "Busca de endereço indisponível. Use o mapa ou informe as coordenadas.")
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return errorResponse(415, "Envie a busca como JSON.")
  let input: unknown
  try { input = await readBoundedJson(request, 4096) } catch (error) {
    if (error instanceof JsonLimitExceeded) return errorResponse(413, "Busca muito longa.")
    return errorResponse(400, "Busca ilegível.")
  }
  const result = localSearch.safeParse(input)
  if (!result.success) return errorResponse(400, "Informe endereço ou CEP válido.")
  const params = new URLSearchParams(Object.entries(result.data).filter((item): item is [string, string] => item[1] !== undefined))
  const response = await searchLocations(params, provider.toString(), { signal: request.signal, verifyTerritory: true })
  response.headers.set("Cache-Control", "private, no-store")
  return response
}
