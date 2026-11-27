import { z } from "zod"
import { countSchema, dateSchema, successSchema } from "@/contracts/common"
import { directMonth } from "@/contracts/pcdf-direct"
import { storedManualCrimeDetails } from "@/contracts/manual-occurrences"

export const localOccurrencesPath = "/api/v1/ocorrencias/consulta"
export const localOccurrencesPageSize = 25
export const importedStates = ["recebida", "apta", "bloqueada", "consolidada", "reenviada"] as const
export const occurrenceAreas = ["importados", "consolidadas", "manuais"] as const
export type OccurrenceArea = (typeof occurrenceAreas)[number]

const filter = z.string().min(1).max(16384)
const listQuery = {
  identificacao: z.string().trim().min(1).max(240).optional(),
  dataInicial: dateSchema.optional(),
  dataFinal: dateSchema.optional(),
  pagina: z.coerce.number<string>().int().min(1).max(1000000).default(1),
  direcao: z.enum(["asc", "desc"]).default("desc"),
}
export const localOccurrencesQuery = z.discriminatedUnion("view", [
  z.strictObject({ view: z.literal("resumo") }),
  z.strictObject({ view: z.literal("detalhe"), area: z.enum(occurrenceAreas), id: z.uuid() }),
  z.strictObject({
    view: z.literal("importados"), ...listQuery,
    ordenar: z.enum(["data", "identificacao", "ra", "competencia"]).default("data"),
    competencia: directMonth.optional(), ra: filter.optional(), natureza: filter.optional(),
    situacao: z.enum(importedStates).optional(), lote: z.uuid().optional(), busca: listQuery.identificacao,
  }),
  z.strictObject({
    view: z.literal("consolidadas"), ...listQuery,
    ordenar: z.enum(["data", "identificacao", "ra"]).default("data"),
    raId: z.uuid().optional(), naturezaId: z.uuid().optional(),
    // Homologated SENTINELA category name (migration 0015); offered only when the summary lists categories.
    categoria: z.string().trim().min(1).max(160).optional(),
  }),
  z.strictObject({
    view: z.literal("manuais"), ...listQuery,
    ordenar: z.enum(["data", "identificacao", "ra"]).default("data"),
  }),
]).refine(query => query.view !== "importados" || !query.busca || !!query.lote, "A busca exige um lote.")
  .refine(query => !("dataInicial" in query) || !query.dataInicial || !query.dataFinal
  || query.dataInicial <= query.dataFinal, "Período inválido.")
export type LocalOccurrencesQuery = z.infer<typeof localOccurrencesQuery>
export type LocalOccurrencesListQuery = Extract<LocalOccurrencesQuery, { view: OccurrenceArea }>

export function parseLocalOccurrencesQuery(search: URLSearchParams) {
  if (search.size !== new Set(search.keys()).size) throw Error("Parâmetro repetido.")
  const page = search.get("pagina")
  if (page !== null && !/^[1-9]\d*$/.test(page)) throw Error("Página inválida.")
  return localOccurrencesQuery.parse(Object.fromEntries(search))
}

const option = z.strictObject({ id: z.uuid(), label: z.string() })
const nullableText = z.string().nullable()
export const localOccurrenceSummary = z.strictObject({
  canImport: z.boolean(), recebidas: countSchema.nullable(), consolidadas: countSchema,
  pendencias: countSchema.nullable(), competencias: z.array(directMonth).nullable(),
  rasImportadas: z.array(z.string()), naturezasImportadas: z.array(z.string()),
  rasConsolidadas: z.array(option), naturezasConsolidadas: z.array(option),
  categoriasConsolidadas: z.array(z.string()).optional(),
})
export const localOccurrenceRow = z.strictObject({
  id: z.uuid(), origem_id: z.uuid().nullable(), identificacao: nullableText,
  data: z.iso.date().nullable(), hora: nullableText, natureza: nullableText, padronizada: nullableText,
  ra: nullableText, local: nullableText, situacao: z.enum([...importedStates, "em_revisao"]), lote: z.uuid().nullable(),
  arquivo: nullableText, competencia: directMonth.nullable(), execucao: z.uuid().nullable(),
  ordinal: z.number().int().positive().nullable(), pendencias: countSchema.nullable(),
  acoes: z.strictObject({ editar: z.boolean(), inativar: z.boolean(), consolidar: z.boolean().optional() }).optional(),
})
export const localOccurrenceList = z.strictObject({
  pagina: z.number().int().positive(), total: countSchema,
  itens: z.array(localOccurrenceRow).max(localOccurrencesPageSize),
})
export const importedOccurrenceDetail = z.strictObject({
  origemId: z.uuid(), stagingId: z.uuid(), lote: z.uuid(), execucao: z.uuid(), arquivo: z.string(),
  competencia: directMonth, ordinal: z.number().int().positive(), situacao: z.enum(importedStates),
  campos: z.record(z.string(), z.string()).refine(value => [26, 34].includes(Object.keys(value).length)),
  pendencias: z.array(z.strictObject({
    campo: z.string(), regra: z.string(), motivo: z.string(), prioridade: z.enum(["alta", "media", "baixa"]),
    situacao: z.enum(["aberta", "em_analise", "resolvida", "encerrada_sem_solucao"]),
  })),
})
export const consolidatedOccurrenceDetail = z.strictObject({
  id: z.uuid(), identificacao: nullableText, fonte: z.string(), origem: z.enum(["manual", "importacao"]),
  data: z.iso.date().nullable(), hora: nullableText, ra: nullableText, local: nullableText,
  localizacaoStatus: z.string(), latitude: z.number().nullable(), longitude: z.number().nullable(),
  unidadeApuracao: nullableText,
  situacao: z.literal("em_revisao").optional(),
  endereco: z.strictObject({
    cep: z.string().optional(), endereco: z.string(), bairroOuSetor: z.string(),
    numero: z.string().optional(), complemento: z.string().optional(), referencia: z.string().optional(),
  }).optional(),
  dadosCrime: storedManualCrimeDetails.optional(),
  localizacaoConfirmada: z.boolean().optional(),
  naturezas: z.array(z.strictObject({ nome: z.string(), classificacao: z.string(), crimeTentado: z.boolean().nullable(),
    // Homologated SENTINELA category (migration 0015); absent before it and null while unclassified.
    categoria: z.string().nullable().optional() })),
})
export const localOccurrenceResponse = successSchema(z.union([
  localOccurrenceSummary, localOccurrenceList, importedOccurrenceDetail, consolidatedOccurrenceDetail,
]))

export type LocalOccurrenceSummary = z.infer<typeof localOccurrenceSummary>
export type LocalOccurrenceList = z.infer<typeof localOccurrenceList>
export type LocalOccurrenceRow = z.infer<typeof localOccurrenceRow>
