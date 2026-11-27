import { CONTRACT_VERSION, catalogVersion } from "@/contracts/common"
import { parseAnalyticsSearch, persistentAnalyticsResponse, type PersistentAnalyticsQuery } from "@/contracts/persistent-analytics"
import { canReadOperational, operationalHostAllowed } from "@/lib/auth/operational-access"
import { hasPermission, type Principal } from "@/lib/auth/policy"
import { apiError } from "@/lib/db/http"
import { DatabaseUnavailable } from "@/lib/db/config"

export async function analyticsGET(request: Request, principal: () => Promise<Principal | null>,
  query: (principal: Principal, filters: PersistentAnalyticsQuery) => Promise<unknown>) {
  try {
    if (!operationalHostAllowed(request.headers.get("host"))) return apiError("FORBIDDEN", "Consulta indisponível neste ambiente.")
    const user = await principal()
    if (!user) return apiError("UNAUTHORIZED", "Sessão necessária.")
    if (!canReadOperational(user) || !hasPermission(user.role, "analisar")) return apiError("FORBIDDEN", "Consulta não autorizada.")
    let filters
    try { filters = parseAnalyticsSearch(new URL(request.url).searchParams) }
    catch { return apiError("BAD_REQUEST", "Filtros analíticos inválidos.") }
    const response = persistentAnalyticsResponse.parse({ success: true, data: await query(user, filters),
      meta: { contractVersion: CONTRACT_VERSION, catalogVersion, execution: { mode: "operacional", persisted: true } } })
    return Response.json(response, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Host" } })
  } catch (error) {
    return error instanceof DatabaseUnavailable ? apiError("SERVICE_UNAVAILABLE", "Banco de leitura indisponível.")
      : apiError("INTERNAL_ERROR", "Não foi possível consultar os indicadores.")
  }
}
