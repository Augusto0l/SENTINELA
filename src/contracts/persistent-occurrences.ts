import { z } from "zod"
import { dateSchema, successSchema } from "@/contracts/common"

export const persistentIdSchema = z.uuid()
export const persistentQuerySchema = z.strictObject({
  raId: persistentIdSchema.optional(),
  naturezaId: persistentIdSchema.optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  identificacao: z.string().trim().min(1).max(240).optional(),
  local: z.string().trim().min(1).max(240).optional(),
  page: z.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  sortBy: z.enum(["data", "horario", "identificacao", "local", "ra"]).default("data"),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).refine(v => !v.startDate || !v.endDate || v.startDate <= v.endDate, "Período inválido.")

export function parsePersistentQuery(search: URLSearchParams) {
  const input: Record<string, unknown> = {}
  for (const [key, value] of search) {
    if (Object.prototype.hasOwnProperty.call(input, key)) throw new Error("Parâmetro repetido")
    input[key] = ["page", "pageSize"].includes(key) && /^\d+$/.test(value) ? Number(value) : value
  }
  return persistentQuerySchema.parse(input)
}
const category = z.strictObject({ id: persistentIdSchema, codigo: z.string().nullable(), nome: z.string() })
export const persistentOccurrenceSchema = z.strictObject({
  id: persistentIdSchema,
  origem: z.enum(["manual", "importacao"]),
  fonte: z.string(),
  anoRegistro: z.string().nullable(), unidadeRegistro: z.string().nullable(), numeroRegistro: z.string().nullable(),
  identidadeStatus: z.enum(["candidata", "homologada", "manual"]),
  data: z.iso.date().nullable(), horario: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).nullable(),
  local: z.string().nullable(), latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable(),
  localizacaoStatus: z.enum(["ausente", "incompleta", "invalida", "referencia_pendente", "divergente", "validada"]),
  consolidacaoStatus: z.enum(["em_revisao", "consolidada", "bloqueada"]),
  ativo: z.boolean(), versao: z.string().regex(/^\d+$/),
  criadoEm: z.iso.datetime({ offset: true }), atualizadoEm: z.iso.datetime({ offset: true }),
  ra: z.strictObject({ id: persistentIdSchema, codigo: z.string(), nome: z.string() }).nullable(),
  naturezas: z.array(z.strictObject({
    id: persistentIdSchema, crimeTentado: z.boolean().nullable(), classificacaoStatus: z.string(),
    natureza: z.strictObject({ id: persistentIdSchema, descricao: z.string(), categoriaOriginal: z.string().nullable() }).nullable(),
    categoria: category.nullable(),
  })),
})
export const persistentPaginationSchema = z.strictObject({
  page: z.number().int().positive(), pageSize: z.number().int().min(1).max(100),
  total: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), totalPages: z.number().int().nonnegative(),
})
export const persistentListDataSchema = z.strictObject({ items: z.array(persistentOccurrenceSchema), pagination: persistentPaginationSchema })
export const persistentListResponseSchema = successSchema(persistentListDataSchema)
export const persistentDetailResponseSchema = successSchema(persistentOccurrenceSchema)
export type PersistentQuery = z.infer<typeof persistentQuerySchema>
