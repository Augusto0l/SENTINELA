import { GET as geocode } from "@/lib/geocoding/handler"
import { getAccess } from "@/lib/auth/server"
import { businessDataEnabled, hasPermission } from "@/lib/auth/policy"

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
