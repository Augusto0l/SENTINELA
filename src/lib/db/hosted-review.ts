import "server-only"
import { z } from "zod"
import { hostedReviewQuery, pcdfDecision, pcdfIssue, pcdfReviewPage } from "@/contracts/pcdf-workspace"
import { getOperationalPrincipal } from "@/lib/auth/operational-server"
import { hasPermission } from "@/lib/auth/policy"
import { hostedOperationalMode } from "@/lib/db/pcdf-direct-mode"
import { withHostedOperationalDatabase } from "@/lib/db/hosted-import-db"
import { JsonLimitExceeded, readBoundedJson } from "@/lib/http/read-json"

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Host" }
const reply = (status: number, message: string) => Response.json({ success: false, error: { status, message } }, { status, headers })

export async function hostedReview(request: Request, id?: string) {
  const mode = hostedOperationalMode()
  const write = id !== undefined
  if (!mode || request.headers.get("host") !== new URL(mode.origin).host
    || write && (!mode.write || request.headers.get("origin") !== mode.origin))
    return reply(403, "Revisão indisponível nesta origem ou sem liberação de escrita.")
  const principal = await getOperationalPrincipal()
  if (!principal) return reply(401, "Sessão institucional necessária.")
  if (principal.source !== "supabase" || !hasPermission(principal.role, write ? "corrigir" : "consultar_central"))
    return reply(403, "Operação indisponível para este perfil.")
  const params = new URL(request.url).searchParams
  try {
    let data
    if (write) {
      if (params.size || !z.uuid().safeParse(id).success) return reply(400, "Identificador ou parâmetros inválidos.")
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
        return reply(415, "Envie a decisão em JSON.")
      let payload: unknown
      try { payload = await readBoundedJson(request, 8192) }
      catch (error) { return reply(error instanceof JsonLimitExceeded ? 413 : 400, "Conteúdo da decisão inválido.") }
      const decision = pcdfDecision.safeParse(payload)
      if (!decision.success) return reply(422, "Confira o valor, a versão e a justificativa.")
      const { versaoEsperada, decisao, justificativa } = decision.data
      data = await withHostedOperationalDatabase(principal, false, async client => {
        const { rows: [row] } = await client.query("SELECT sentinela_revisao.decidir($1,$2,$3,$4,$5) AS data",
          [id, versaoEsperada, decisao, decisao === "resolvida" ? decision.data.valor : null, justificativa])
        return pcdfIssue.parse(row?.data)
      }, 8000)
    } else {
      const filter = hostedReviewQuery.safeParse(Object.fromEntries(params))
      if (!filter.success || new Set(params.keys()).size !== params.size)
        return reply(400, "Filtros de revisão inválidos.")
      const { tipo, prioridade, status, origem, q, ordem, pagina, limite = 25 } = filter.data
      data = await withHostedOperationalDatabase(principal, true, async client => {
        const { rows: [{ data: page }] } = await client.query(
          "SELECT sentinela_revisao.fila($1,$2,$3,$4,$5,$6,$7,$8) AS data",
          [tipo, prioridade, status, origem, q, ordem, pagina, limite])
        return pcdfReviewPage.parse(page)
      }, 8000)
    }
    return Response.json({ success: true, scope: "importacao-supabase", data }, { headers })
  } catch (error) {
    switch ((error as { code?: string })?.code) {
      case "42501": return reply(403, "Revisão não autorizada.")
      case "P0002": return reply(404, "Pendência não encontrada.")
      case "22023": return reply(422, "Valor ou decisão indisponível para esta pendência.")
      case "40001": case "55P03": return reply(409, "A pendência mudou. Reabra os detalhes antes de decidir.")
      default: return reply(503, "Central de Revisão indisponível.")
    }
  }
}
