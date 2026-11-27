import { z } from "zod"
import { catalogVersion, CONTRACT_VERSION } from "@/contracts/common"
import { manualCatalogSchema, manualCatalogSearchSchema, manualOccurrenceSchema, manualReceiptSchema, nowInDf } from "@/contracts/manual-occurrences"
import { hasPermission } from "@/lib/auth/policy"
import { getLocalPrincipal } from "@/lib/auth/local-server"
import { getOperationalPrincipal } from "@/lib/auth/operational-server"
import { hostedOperationalMode, institutionalDatabaseMode } from "@/lib/db/pcdf-direct-mode"
import { apiError } from "@/lib/db/http"
import { withOperationalDatabase } from "@/lib/db/local-occurrences"
import { occurrenceManagementMode } from "@/lib/db/occurrence-management-mode"
import { manualActor, manualOperationalMode, manualOperationalReady } from "@/lib/db/operational-import-review"
import { JsonLimitExceeded, readBoundedJson } from "@/lib/http/read-json"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function success(data: unknown, status = 200) {
  return Response.json({ success: true, data,
    meta: { contractVersion: CONTRACT_VERSION, catalogVersion, execution: { mode: "operacional", persisted: true } } },
  { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Host" } })
}

const unavailable = () => apiError("SERVICE_UNAVAILABLE",
  "Cadastro manual indisponível. Verifique a ativação do PostgreSQL e dos catálogos.")

export async function GET(request: Request) {
  const principal = await getOperationalPrincipal()
  if (!principal) return apiError("UNAUTHORIZED", "Sessão necessária.")
  if (!hasPermission(principal.role, "cadastrar")) return apiError("FORBIDDEN", "Cadastro não autorizado.")
  const parameters = [...new URL(request.url).searchParams]
  const term = parameters.length === 1 && parameters[0][0] === "q"
    ? manualCatalogSearchSchema.safeParse(parameters[0][1]) : undefined
  if (parameters.length && !term?.success) return apiError("BAD_REQUEST", "Parâmetro de busca inválido.")
  try {
    const data = await withOperationalDatabase(principal, true, async client => {
      const { rows: [row] } = await client.query(`SELECT sentinela_ocorrencias_manual.catalogo($1::text) AS data,
        coalesce(has_function_privilege(to_regprocedure('sentinela_ocorrencias_manual.cadastrar_completo(jsonb,uuid,text)'), 'EXECUTE'), false) AS ready`,
        [term?.data ?? null])
      const hosted = hostedOperationalMode()
      const actor = manualOperationalMode() && (!hosted || hosted.write) && manualActor(principal)
      const operational = actor ? await manualOperationalReady(client, actor) : false
      return { ...manualCatalogSchema.parse(row?.data), cadastroDisponivel: Boolean((occurrenceManagementMode() && row.ready) || operational) }
    })
    return success(data)
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined
    if (code === "42501") return apiError("FORBIDDEN", "Acesso aos catálogos não autorizado.")
    if (code === "3F000" || code === "42883")
      return apiError("SERVICE_UNAVAILABLE", "O catálogo de cadastro manual ainda não foi instalado no PostgreSQL.")
    return apiError("SERVICE_UNAVAILABLE", "Catálogos persistentes indisponíveis. Tente novamente.")
  }
}

export async function POST(request: Request) {
  // The operational database accepts only the institutional session; the synthetic cluster keeps local accounts.
  const operating = manualOperationalMode()
  if ((institutionalDatabaseMode() && !operating) || hostedOperationalMode()?.write === false)
    return apiError("FORBIDDEN", "Cadastro persistente exige autorização institucional no PostgreSQL.")
  const principal = operating ? await getOperationalPrincipal() : await getLocalPrincipal()
  if (!principal) return apiError("UNAUTHORIZED", "Sessão necessária.")
  if (!hasPermission(principal.role, "cadastrar")) return apiError("FORBIDDEN", "Cadastro não autorizado.")
  const actor = operating ? manualActor(principal) : null
  if (operating && !actor) return apiError("FORBIDDEN", "O cadastro exige autoria institucional vinculada à sessão.")
  const mode = operating ?? occurrenceManagementMode()
  if (!mode) return unavailable()
  if (request.headers.get("host") !== new URL(mode.origin).host || request.headers.get("origin") !== mode.origin)
    return apiError("FORBIDDEN", "Origem não autorizada.")
  if (new URL(request.url).search) return apiError("BAD_REQUEST", "Parâmetros não aceitos.")
  const key = z.uuid().safeParse(request.headers.get("Idempotency-Key"))
  if (!key.success) return apiError("BAD_REQUEST", "Chave de cadastro inválida.")
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return apiError("UNSUPPORTED_MEDIA_TYPE", "Envie os dados como JSON.")
  let input: unknown
  try { input = await readBoundedJson(request, 32768) } catch (error) {
    if (error instanceof JsonLimitExceeded) return apiError("PAYLOAD_TOO_LARGE", "Dados da ocorrência excedem o limite.")
    return apiError("BAD_REQUEST", "JSON inválido.")
  }
  const parsed = manualOccurrenceSchema.safeParse(input)
  if (!parsed.success) {
    const confirmationMissing = parsed.error.issues.some(issue => issue.path[0] === "localizacaoConfirmada")
    return apiError("VALIDATION_ERROR", confirmationMissing ? "Confirme o ponto exato da ocorrência no mapa."
      : "Revise os campos obrigatórios, as coordenadas e as naturezas.")
  }
  const { data, horario } = nowInDf()
  if (parsed.data.data + parsed.data.horario > data + horario)
    return apiError("VALIDATION_ERROR", "Data e horário do fato devem estar no passado ou no presente.")

  try {
    const receipt = await withOperationalDatabase(principal, false, async client => {
      const { rows: [row] } = actor
        ? await client.query("SELECT sentinela_ocorrencias_manual.cadastrar_completo($1,$2,$3,$4) AS data",
          [parsed.data, key.data, actor.account, actor.subject])
        : await client.query("SELECT sentinela_ocorrencias_manual.cadastrar_completo($1,$2,$3) AS data",
          [parsed.data, key.data, "localAccountId" in principal ? principal.localAccountId : undefined])
      return manualReceiptSchema.parse(row?.data)
    }, !!actor)
    return success(receipt, 201)
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined
    if (code === "23505") return apiError("CONFLICT", "A chave de cadastro já foi usada com dados diferentes.")
    if (code === "P0002") return apiError("VALIDATION_ERROR", "Confira o ponto, a RA e a disponibilidade do catálogo territorial.")
    if (code === "23503") return apiError("VALIDATION_ERROR", "Uma natureza selecionada está indisponível.")
    if (typeof code === "string" && code.startsWith("22")) return apiError("VALIDATION_ERROR", "Revise os dados da ocorrência.")
    if (code === "42501") return apiError("FORBIDDEN", "Cadastro não autorizado.")
    return unavailable()
  }
}
