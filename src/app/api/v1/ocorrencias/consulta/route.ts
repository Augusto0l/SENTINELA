import { operationalHostAllowed } from "@/lib/auth/operational-access"
import { getOperationalPrincipal } from "@/lib/auth/operational-server"
import { catalogVersion, CONTRACT_VERSION } from "@/contracts/common"
import { parseLocalOccurrencesQuery } from "@/contracts/local-occurrences"
import { apiError } from "@/lib/db/http"
import { DatabaseUnavailable } from "@/lib/db/config"
import { LocalOccurrenceForbidden, occurrenceReadMode, queryLocalOccurrences } from "@/lib/db/local-occurrences"
import { expectsIntegratedImport, hostedOperationalMode } from "@/lib/db/pcdf-direct-mode"
import { localImportStartupMessage } from "@/contracts/pcdf-direct"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const mode = hostedOperationalMode() ?? occurrenceReadMode()
  if (!operationalHostAllowed(request.headers.get("host")) || (!mode && !expectsIntegratedImport()))
    return apiError("FORBIDDEN", "Consulta indisponível neste ambiente.")
  const principal = await getOperationalPrincipal()
  if (!principal) return apiError("UNAUTHORIZED", "Sessão necessária.")
  if (!mode) return apiError("SERVICE_UNAVAILABLE", localImportStartupMessage)
  let query
  try {
    query = parseLocalOccurrencesQuery(new URL(request.url).searchParams)
  } catch {
    return apiError("BAD_REQUEST", "Filtros ou identificador inválidos.")
  }
  try {
    const data = await queryLocalOccurrences(principal, query)
    if (data === null) return apiError("NOT_FOUND", "Registro não encontrado para esta consulta.")
    return Response.json({ success: true, data,
      meta: { contractVersion: CONTRACT_VERSION, catalogVersion, execution: { mode: "operacional", persisted: true } } },
    { headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Host" } })
  } catch (error) {
    if (error instanceof LocalOccurrenceForbidden) return apiError("FORBIDDEN", "Consulta não autorizada para este perfil.")
    if (error instanceof DatabaseUnavailable) return apiError("SERVICE_UNAVAILABLE", "PostgreSQL de leitura indisponível.")
    return apiError("INTERNAL_ERROR", "Falha ao concluir a consulta.")
  }
}
