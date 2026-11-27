import { z } from "zod"
import { coordinateSchema, dateSchema, successSchema } from "@/contracts/common"
import { plannedNatureLinksSchema } from "@/contracts/planned-occurrence-writes"

export const manualOccurrencesPath = "/api/v1/ocorrencias/manuais"
export const manualCatalogSearchSchema = z.string().trim().min(1).max(120)
export const manualMeans = {
  "arma-de-fogo": "Arma de fogo", "arma-branca": "Arma branca", "forca-fisica": "Força física",
  veiculo: "Veículo", outro: "Outro",
} as const
export const manualQuantityMaximum = 999999
const manualQuantity = z.int().min(0).max(manualQuantityMaximum)
export const manualCrimeDetails = z.strictObject({
  descricao: z.string().trim().min(1).max(3000),
  meio: z.enum(Object.keys(manualMeans) as (keyof typeof manualMeans)[]),
  vitimas: manualQuantity,
  autores: manualQuantity,
  observacoes: z.string().trim().min(1).max(1500).optional(),
})
export const storedManualCrimeDetails = manualCrimeDetails.partial()
const manualLocationFields = z.strictObject({
  data: dateSchema,
  horario: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/),
  cep: z.string().regex(/^\d{8}$/),
  endereco: z.string().trim().min(1).max(240),
  bairroOuSetor: z.string().trim().min(1).max(100),
  numero: z.string().trim().min(1).max(24).optional(),
  complemento: z.string().trim().min(1).max(120).optional(),
  referencia: z.string().trim().min(1).max(240).optional(),
  raId: z.uuid(),
  coordenadas: coordinateSchema,
  localizacaoConfirmada: z.literal(true),
})
const manualFields = manualLocationFields.extend({ naturezas: plannedNatureLinksSchema })
export const manualOccurrenceSchema = manualFields.extend({ dadosCrime: manualCrimeDetails })
export const manualEditFields = manualFields.partial({ cep: true }).extend({ dadosCrime: storedManualCrimeDetails })
export const manualEditDraft = manualEditFields.omit({ localizacaoConfirmada: true })

export const manualCatalogSchema = z.strictObject({
  regioes: z.array(z.strictObject({ id: z.uuid(), codigo: z.string(), nome: z.string(), numeroAdministrativo: z.int().positive() })),
  // `codigo` is an internal review identifier; a manual-use catalogue declares no issuer code.
  naturezas: z.array(z.strictObject({ id: z.uuid(), descricao: z.string(), codigo: z.string().nullable().optional(),
    codigoOficial: z.null().optional(), situacao: z.literal("uso-local-provisorio").optional() })),
})
export const manualReceiptSchema = z.strictObject({
  id: z.uuid(), origem: z.literal("manual"), situacao: z.literal("em_revisao"),
})
export const manualCatalogResponse = successSchema(manualCatalogSchema.extend({ cadastroDisponivel: z.boolean() }))
export const manualReceiptResponse = successSchema(manualReceiptSchema)
export type ManualOccurrence = z.infer<typeof manualOccurrenceSchema>
export type ManualCatalog = z.infer<typeof manualCatalogResponse>["data"]
export type ManualEditFields = z.infer<typeof manualEditFields>
export type ManualEditDraft = z.infer<typeof manualEditDraft>

export function nowInDf(now = new Date()) {
  const [data, horario] = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium",
  }).format(now).split(" ")
  return { data, horario }
}
