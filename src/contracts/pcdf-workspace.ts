import { z } from "zod"

export const pcdfImportPath = "/api/v1/importacoes/pcdf"
export const pcdfReviewPath = "/api/v1/central-revisao"
export const pcdfIssueTypes = ["identificacao", "datas_horarios", "classificacao", "endereco_ra",
  "coordenadas", "informacoes_policiais", "proveniencia"] as const
export const pcdfPriorities = ["alta", "media", "baixa"] as const
export const pcdfDecisions = ["resolvida", "encerrada_sem_solucao"] as const
export const pcdfMonth = z.string().regex(/^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$/)
const count = z.number().int().nonnegative()
const version = z.string().regex(/^[1-9][0-9]{0,17}$/)
const reason = z.string().trim().min(1).max(500)
const nullableText = z.string().nullable()
export const pcdfReviewFilters = z.strictObject({
  tipo: z.enum(pcdfIssueTypes).optional(),
  prioridade: z.enum(pcdfPriorities).optional(),
  status: z.enum(["aberta", ...pcdfDecisions]).optional(),
})
export const pcdfReviewOrders = ["prioridade", "recentes", "antigas"] as const
export const pcdfReviewPageQuery = pcdfReviewFilters.extend({
  q: z.string().trim().min(1).max(120).optional(),
  ordem: z.enum(pcdfReviewOrders).default("prioridade"),
  pagina: z.string().regex(/^[1-9]\d{0,4}$/).transform(Number).pipe(z.number().max(10000)),
  limite: z.string().regex(/^[1-9]\d?$/).transform(Number).pipe(z.number().max(50)).optional(),
})
export const reviewOrigins = ["pcdf", "geral", "manual", "outra"] as const
export const hostedReviewQuery = pcdfReviewPageQuery.extend({
  status: z.enum(["aberta", "em_analise", ...pcdfDecisions]).optional(),
  origem: z.enum(reviewOrigins).optional(),
})
export const pcdfDecision = z.discriminatedUnion("decisao", [
  z.strictObject({ decisao: z.literal("resolvida"), versaoEsperada: version, justificativa: reason,
    valor: z.string().trim().min(1).max(240) }),
  z.strictObject({ decisao: z.literal("encerrada_sem_solucao"), versaoEsperada: version, justificativa: reason }),
])
export const pcdfIssue = z.strictObject({
  id: z.uuid(), type: z.enum(pcdfIssueTypes), priority: z.enum(pcdfPriorities), field: z.string(),
  reason: z.string(), status: z.enum(["aberta", "em_analise", ...pcdfDecisions]), version, original: nullableText,
  normalized: nullableText, canResolve: z.boolean(), occurrenceId: z.uuid().nullable(), lotId: z.uuid().optional(),
  origin: z.enum(reviewOrigins).optional(), ordinal: z.number().int().positive().optional(),
  history: z.strictObject({ author: z.uuid(), reason, at: z.iso.datetime({ offset: true }),
    before: nullableText, after: nullableText }).nullable(),
})
export const pcdfReviewPage = z.strictObject({
  items: z.array(pcdfIssue).max(50), page: z.number().int().min(1).max(10000),
  pageSize: z.number().int().min(1).max(50), hasMore: z.boolean(),
  counts: z.strictObject({ active: count, resolved: count, closed: count }).optional(),
})
export const pcdfLot = z.strictObject({
  lot: z.uuid(), run: z.uuid(), month: pcdfMonth, rows: count, issues: count, consolidated: count,
})
export const pcdfUpload = z.discriminatedUnion("replay", [
  z.strictObject({ replay: z.literal(true), lot: z.uuid(), run: z.uuid() }),
  z.strictObject({ replay: z.literal(false), lot: z.uuid(), run: z.uuid(), records: count, issues: count, candidates: count }),
])
export const pcdfPromotion = z.strictObject({
  run: z.uuid(), rows: count, consolidated: count, pending: count, occurrencesCreated: count, associationsCreated: count,
})
export const pcdfResponse = <T extends z.ZodType>(data: T, persistent = false) => z.strictObject({
  success: z.literal(true), scope: persistent
    ? z.enum(["sandbox-synthetic-only", "homologacao-persistente-sintetica"]) : z.literal("sandbox-synthetic-only"), data,
})
