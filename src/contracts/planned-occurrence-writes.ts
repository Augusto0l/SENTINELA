// Proposal only: no handler, UI action or SQL authorization consumes these schemas.
import { z } from "zod"
import { coordinateSchema, dateSchema, successSchema } from "@/contracts/common"
import { persistentOccurrenceSchema } from "@/contracts/persistent-occurrences"

export const plannedWriteHeadersSchema = z.strictObject({ "Idempotency-Key": z.uuid() })
export const plannedVersionSchema = z.string().regex(/^[1-9]\d{0,18}$/)
  .refine(value => value.length < 19 || value <= "9223372036854775807", "Versão fora do domínio bigint.")
const originalNature = z.strictObject({ naturezaId: z.uuid(), crimeTentado: z.boolean().nullable() })
export const plannedNatureLinksSchema = z.array(originalNature).min(1).max(100)
  .refine(items => new Set(items.map(item => item.naturezaId + ":" + item.crimeTentado)).size === items.length,
    "Não repetir natureza e condição de tentativa.")
const editableFields = {
  data: dateSchema,
  horario: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/),
  raId: z.uuid(),
  local: z.string().trim().min(5).max(240),
  coordenadas: coordinateSchema.nullable(),
  naturezas: plannedNatureLinksSchema,
}
export const plannedOccurrenceCreateSchema = z.strictObject({
  ...editableFields,
  coordenadas: editableFields.coordenadas.optional(),
}).describe("PROPOSTA: cadastro manual; existência, escopo, cartografia e classificação exigem validação SQL futura.")
const changes = z.strictObject(editableFields).partial()
  .refine(value => Object.values(value).some(v => v !== undefined), "Informe alteração efetiva.")
export const plannedOccurrenceUpdateSchema = z.strictObject({
  versaoEsperada: plannedVersionSchema,
  justificativa: z.string().trim().min(1).max(500),
  alteracoes: changes,
}).describe("PROPOSTA: versão obrigatória, validação do estado combinado e histórico transacional; não autoriza correção pela edição regular.")
export const plannedOccurrenceInactivationSchema = z.strictObject({
  versaoEsperada: plannedVersionSchema,
  motivo: z.string().trim().min(1).max(500),
})
export const plannedManualResponseSchema = successSchema(persistentOccurrenceSchema.extend({ origem: z.literal("manual"), identidadeStatus: z.literal("manual") }))
export const plannedWriteResponseSchema = successSchema(persistentOccurrenceSchema)
export const plannedInactivationResponseSchema = successSchema(persistentOccurrenceSchema.extend({ ativo: z.literal(false) }))
export type PlannedOccurrenceCreate = z.infer<typeof plannedOccurrenceCreateSchema>
export type PlannedOccurrenceUpdate = z.infer<typeof plannedOccurrenceUpdateSchema>
export type PlannedOccurrenceInactivation = z.infer<typeof plannedOccurrenceInactivationSchema>
export type PlannedWriteHeaders = z.infer<typeof plannedWriteHeadersSchema>
export type PlannedManualResponse = z.infer<typeof plannedManualResponseSchema>
export type PlannedWriteResponse = z.infer<typeof plannedWriteResponseSchema>
export type PlannedInactivationResponse = z.infer<typeof plannedInactivationResponseSchema>
