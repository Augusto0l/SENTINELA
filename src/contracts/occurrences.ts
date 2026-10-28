import { z } from "zod"
import {
  coordinateSchema,
  dateSchema,
  idSchema,
  natureSchema,
  paginationSchema,
  raSchema,
  successSchema,
  timeSchema,
} from "@/contracts/common"
import { validateDemoPeriod } from "@/data/demoAnalytics"

export const natureListSchema = z
  .array(natureSchema)
  .min(1)
  .max(8)
  .refine(
    (values) => new Set(values).size === values.length,
    "Não repetir vínculos de natureza.",
  )
export const occurrenceCreateSchema = z
  .strictObject({
    data: dateSchema,
    horario: timeSchema,
    raCode: raSchema,
    naturezas: natureListSchema,
    local: z.string().trim().min(5).max(240),
    coordenadas: coordinateSchema.nullable().optional(),
  })
  .describe(
    "Cinco atributos obrigatórios. Coordenadas omitidas ou nulas representam pendência, não localização inventada.",
  )
export const occurrenceUpdateSchema = occurrenceCreateSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Informe pelo menos um campo para atualizar.",
  )
  .describe(
    "PATCH parcial: omitido preserva o valor; coordenadas null remove o par e cria pendência. Revalidar o registro combinado no servidor futuro.",
  )
export const occurrenceSchema = occurrenceCreateSchema
  .required({ coordenadas: true })
  .extend({
    id: idSchema,
    ativo: z.boolean(),
    origem: z.enum(["manual", "importacao"]),
    loteId: idSchema.nullable(),
    localizacao: z.enum(["valida", "pendente"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .refine(
    (value) =>
      (value.coordenadas === null) === (value.localizacao === "pendente"),
    "Estado de localização incompatível com coordenadas.",
  )
  .refine(
    (value) => (value.origem === "manual") === (value.loteId === null),
    "Origem e lote incompatíveis.",
  )
export const occurrenceIdSchema = z.strictObject({ id: idSchema })
export const inactivationSchema = z.strictObject({
  motivo: z.string().trim().min(1).max(500),
})

export const filterFields = {
  period: z
    .enum(["all", "today", "7d", "1m", "3m", "6m", "12m", "custom"])
    .optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  ra: raSchema.optional(),
  nature: natureSchema.optional(),
  hour: z.enum(["0-6", "6-12", "12-18", "18-24"]).optional(),
}
export function validPeriod(value: {
  period?: string
  startDate?: string
  endDate?: string
}) {
  if (
    value.period !== "custom" &&
    (value.startDate !== undefined || value.endDate !== undefined)
  )
    return false
  return validateDemoPeriod(value) === null
}
export const analyticsFilterSchema = z
  .strictObject(filterFields)
  .refine(
    validPeriod,
    "Período inválido; datas exigem period=custom e início <= fim.",
  )
export const occurrenceQuerySchema = z
  .strictObject({
    ...filterFields,
    search: z.string().trim().max(240).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(100).optional(),
    sortBy: z
      .enum(["id", "data", "horario", "natureza", "raName", "local"])
      .optional(),
    direction: z.enum(["asc", "desc"]).optional(),
    includeInactive: z.boolean().optional(),
  })
  .refine(validPeriod, "Período inválido.")
  .refine(
    (value) => Boolean(value.sortBy) === Boolean(value.direction),
    "Informe campo e direção de ordenação juntos.",
  )
/** Explicit HTTP decoding; never coerce 'false' to true or empty values to zero. */
export function parseOccurrenceQuery(search: URLSearchParams) {
  const values: Record<string, unknown> = {}
  for (const [key, value] of search) {
    if (key in values) throw new Error(`Parâmetro repetido: ${key}`)
    if (["page", "pageSize"].includes(key))
      values[key] = /^\d+$/.test(value) ? Number(value) : value
    else if (key === "includeInactive")
      values[key] = value === "true" ? true : value === "false" ? false : value
    else values[key] = value
  }
  return occurrenceQuerySchema.parse(values)
}
export const occurrenceResponseSchema = successSchema(occurrenceSchema)
export const occurrenceListSchema = successSchema(
  z.strictObject({
    items: z.array(occurrenceSchema),
    pagination: paginationSchema,
  }),
).refine(
  (value) =>
    value.data.items.length ===
      Math.min(
        value.data.pagination.pageSize,
        Math.max(
          0,
          value.data.pagination.total -
            (value.data.pagination.page - 1) * value.data.pagination.pageSize,
        ),
      ) &&
    new Set(value.data.items.map((item) => item.id)).size ===
      value.data.items.length,
  "Quantidade de itens incompatível com a paginação.",
)
export type OccurrenceCreate = z.infer<typeof occurrenceCreateSchema>
export type OccurrenceUpdate = z.infer<typeof occurrenceUpdateSchema>
export type ApiOccurrence = z.infer<typeof occurrenceSchema>
export type OccurrenceQuery = z.infer<typeof occurrenceQuerySchema>
export type AnalyticsFilters = z.infer<typeof analyticsFilterSchema>
export type OccurrenceResponse = z.infer<typeof occurrenceResponseSchema>
export type OccurrenceListResponse = z.infer<typeof occurrenceListSchema>
export type InactivationInput = z.infer<typeof inactivationSchema>
