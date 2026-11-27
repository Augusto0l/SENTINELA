import { apiError } from "@/lib/db/http"
import { ClassificacaoError, executarComando, lerSituacao } from "@/lib/db/classificacao"
import { hostedOperationalMode } from "@/lib/db/pcdf-direct-mode"
import { JsonLimitExceeded, readBoundedJson } from "@/lib/http/read-json"
import { ZodError } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Host" }
const codes = { 401: "UNAUTHORIZED", 403: "FORBIDDEN", 409: "CONFLICT", 422: "VALIDATION_ERROR", 503: "SERVICE_UNAVAILABLE" } as const

function failure(error: unknown) {
  if (error instanceof ClassificacaoError) return apiError(codes[error.status as keyof typeof codes] ?? "INTERNAL_ERROR", error.message)
  if (error instanceof ZodError || error instanceof JsonLimitExceeded || error instanceof SyntaxError)
    return apiError("VALIDATION_ERROR", "Comando de classificação inválido.")
  const code = (error as { code?: string } | null)?.code
  if (code === "42501") return apiError("FORBIDDEN", "Operação de classificação não autorizada.")
  if (code === "23505") return apiError("CONFLICT", "A versão informada já foi homologada.")
  if (code === "55P03") return apiError("CONFLICT", "Outra operação de classificação está em andamento neste lote. Tente novamente.")
  if (code === "22023" || code === "23503" || code === "23514") return apiError("VALIDATION_ERROR", "Versão, regra ou lote inválido.")
  return apiError("SERVICE_UNAVAILABLE", "PostgreSQL de classificação indisponível.")
}

function sameHost(request: Request) {
  const mode = hostedOperationalMode()
  return mode && request.headers.get("host") === new URL(mode.origin).host ? mode : null
}

export async function GET(request: Request) {
  if (!sameHost(request)) return apiError("FORBIDDEN", "Classificação indisponível nesta origem.")
  try {
    return Response.json({ success: true, data: await lerSituacao() }, { headers })
  } catch (error) { return failure(error) }
}

export async function POST(request: Request) {
  const mode = sameHost(request)
  if (!mode || request.headers.get("origin") !== mode.origin) return apiError("FORBIDDEN", "Classificação indisponível nesta origem.")
  if (!request.headers.get("content-type")?.startsWith("application/json")) return apiError("VALIDATION_ERROR", "Envie JSON.")
  try {
    const data = await executarComando(await readBoundedJson(request, 16384) as never)
    return Response.json({ success: true, data }, { headers })
  } catch (error) { return failure(error) }
}
