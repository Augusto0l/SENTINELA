import { CONTRACT_VERSION, catalogVersion } from "@/contracts/common"
import { parseCatalogQuery, type CatalogKind } from "@/contracts/persistent-catalogs"
import { localAllowed } from "@/lib/auth/local-provider"
import { hasPermission, type Principal } from "@/lib/auth/policy"
import { DatabaseUnavailable } from "@/lib/db/config"
import { apiError } from "@/lib/db/http"
import type { queryCatalog } from "@/lib/db/catalogs"

export async function catalogGET(request: Request, kind: CatalogKind, dependencies: {
  principal: () => Promise<Principal | null>
  query: typeof queryCatalog
}) {
  try {
    if (!localAllowed(request.headers.get("host"))) return apiError("FORBIDDEN", "Provedor local indisponível.")
    const principal = await dependencies.principal()
    if (!principal) return apiError("UNAUTHORIZED", "Sessão necessária.")
    if (principal.source !== "local" || !hasPermission(principal.role, "analisar")) return apiError("FORBIDDEN", "Consulta não autorizada.")
    let query
    try { query = parseCatalogQuery(kind, new URL(request.url).searchParams) }
    catch { return apiError("BAD_REQUEST", "Parâmetros de catálogo inválidos.") }
    const data = await dependencies.query(principal, kind, query)
    return Response.json({ success: true, data,
      meta: { contractVersion: CONTRACT_VERSION, catalogVersion, execution: { mode: "operacional", persisted: true } } },
      { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie, Host" } })
  } catch (error) {
    return error instanceof DatabaseUnavailable ? apiError("SERVICE_UNAVAILABLE", "Catálogo indisponível.") : apiError("INTERNAL_ERROR", "Não foi possível consultar o catálogo.")
  }
}
