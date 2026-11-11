import { CONTRACT_VERSION, catalogVersion, contractError } from "@/contracts/common"
import { persistentIdSchema, parsePersistentQuery } from "@/contracts/persistent-occurrences"
import { localAllowed } from "@/lib/auth/local-provider"
import { hasPermission, type Principal } from "@/lib/auth/policy"
import { DatabaseUnavailable } from "@/lib/db/config"
import type { queryOccurrences } from "@/lib/db/occurrences"

export const isLocalReadEndpoint = (path: string, method: string) => method === "GET" && /^\/api\/v1\/ocorrencias(?:\/[^/]+)?$/.test(path)
export function apiError(code: Parameters<typeof contractError>[0], message: string) {
  const body = contractError(code, message)
  return Response.json(body, { status: body.error.status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie, Host" } })
}
export async function occurrenceGET(request: Request, id: string | undefined, dependencies: {
  principal: () => Promise<Principal | null>, query: typeof queryOccurrences,
}) {
  try {
    if (!localAllowed(request.headers.get("host"))) return apiError("FORBIDDEN", "Provedor local indisponível.")
    const principal = await dependencies.principal()
    if (!principal) return apiError("UNAUTHORIZED", "Sessão necessária.")
    if (principal.source !== "local" || !hasPermission(principal.role, "analisar")) return apiError("FORBIDDEN", "Consulta não autorizada.")
    let query
    try {
      if (id !== undefined) persistentIdSchema.parse(id)
      query = parsePersistentQuery(new URL(request.url).searchParams)
      if (id !== undefined && new URL(request.url).search) throw Error()
    } catch { return apiError("BAD_REQUEST", "Identificador ou parâmetros inválidos.") }
    const result = await dependencies.query(principal, query, id)
    if (id && !result.items.length) return apiError("NOT_FOUND", "Ocorrência não encontrada.")
    return Response.json({ success: true, data: id ? result.items[0] : result,
      meta: { contractVersion: CONTRACT_VERSION, catalogVersion, execution: { mode: "operacional", persisted: true } } },
    { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie, Host" } })
  } catch (error) {
    return error instanceof DatabaseUnavailable ? apiError("SERVICE_UNAVAILABLE", "Banco de leitura indisponível.") : apiError("INTERNAL_ERROR", "Não foi possível concluir a consulta.")
  }
}
