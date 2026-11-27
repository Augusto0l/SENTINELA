import { z } from "zod"
import { countSchema, dateSchema } from "@/contracts/common"
import { directMonth } from "@/contracts/pcdf-direct"
import { manualEditDraft, manualEditFields } from "@/contracts/manual-occurrences"

export const managementPath = "/api/v1/ocorrencias/gestao"
export const protectedJanuaryLot = "a88ac192-edef-4339-8381-106bbd1b391e"
export const managementWriteBlocked = "Gravação administrativa bloqueada. O destino e a identidade do responsável precisam de autorização específica."
export const lotStates = ["concluida", "com_pendencias", "inativada", "falhou", "em_processamento", "cancelada"] as const
const id = z.uuid()
const version = z.string().regex(/^[1-9]\d{0,17}$/)
const revision = z.string().regex(/^[a-f0-9]{64}$/)
const reason = z.string().trim().min(1).max(500)
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/)
export const filesQuery = z.strictObject({
  view: z.literal("arquivos"),
  busca: z.string().trim().min(1).max(240).optional(),
  competencia: directMonth.optional(),
  situacao: z.enum(lotStates).optional(),
  dataInicial: dateSchema.optional(),
  dataFinal: dateSchema.optional(),
  pagina: z.coerce.number<string | number>().int().min(1).max(1000000).default(1),
}).refine(query => !query.dataInicial || !query.dataFinal || query.dataInicial <= query.dataFinal)
export const managementRead = z.union([filesQuery, z.strictObject({
  view: z.enum(["arquivo", "importados", "manuais", "consolidadas", "previa_exclusao"]), id,
}), z.strictObject({ view: z.literal("exclusoes"), pagina: filesQuery.shape.pagina }),
z.strictObject({ view: z.literal("registros_lote"), id, pagina: filesQuery.shape.pagina, busca: filesQuery.shape.busca }),
z.strictObject({ view: z.literal("rascunho_importado"), id, lote: id }),
z.strictObject({ view: z.literal("disponibilidade") })])
export const importManagementAvailability = z.strictObject({
  catalogoGestao: z.boolean(),
  consultaOperacional: z.literal(true).optional(),
  escrita: z.enum(["disponivel", "ambiente_bloqueado", "sem_permissao", "banco_sem_escrita"]),
})
const target = { id, justificativa: reason }
const reviewFields = z.strictObject({
  data: dateSchema.optional(), horario: time.nullable().optional(),
  natureza: z.string().min(1).max(240).regex(/\S/).optional(), local: z.string().trim().max(240).nullable().optional(),
}).refine(changes => Object.keys(changes).length > 0)
export const managementWrite = z.discriminatedUnion("acao", [
  z.strictObject({ acao: z.literal("autorizar_exclusao"), id, revisao: revision, confirmacao: id }),
  z.strictObject({ acao: z.literal("excluir_lote"), ...target, confirmacao: id, definitiva: z.literal(true), revisao: revision,
    palavra: z.literal("EXCLUIR").optional() }),
  z.strictObject({ acao: z.literal("inativar_lote"), ...target, confirmacao: id, revisao: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.strictObject({ acao: z.literal("corrigir_associacao"), ...target, lote: id.optional(), revisao: z.string().regex(/^[a-f0-9]{64}$/), alteracoes: reviewFields }),
  z.strictObject({ acao: z.literal("inativar_associacao"), ...target, confirmacao: id, revisao: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.strictObject({ acao: z.literal("editar_manual"), ...target, versao: version, confirmacao: id, dados: manualEditFields }),
  z.strictObject({ acao: z.enum(["inativar_manual", "inativar_consolidada", "consolidar_manual"]), ...target, versao: version, confirmacao: id }),
])
export const manualPublicationBlocks = {
  identidade: "Identidade ou autoria do cadastro sem comprovação",
  natureza: "Natureza ausente ou fora do catálogo de uso manual",
  geometria: "Ponto sem geometria WGS84 válida dentro da RA informada",
  dados: "Data, endereço ou dados do crime incompletos",
  pendencias: "Há pendências de revisão abertas",
} as const
const counts = {
  recebidos: countSchema, candidatas: countSchema.nullable(), pendencias: countSchema,
  novas: countSchema.nullable(), reutilizadas: countSchema.nullable(),
}
const purgeBlockers = z.array(z.strictObject({
  tipo: z.enum(["consolidacao", "execucao_ativa", "origem_sem_lote", "historico_compartilhado", "dependencia_desconhecida", "lote_protegido"]),
  quantidade: countSchema, ids: z.array(z.string()).max(10),
}))
const lot = z.strictObject({
  id, arquivo: z.string(), competencia: directMonth, contrato: z.string(), formato: z.enum(["CSV", "XLSX"]).nullable(),
  data: z.iso.datetime({ offset: true }), responsavel: z.string().nullable(),
  situacao: z.enum(lotStates), execucao: id.nullable(), ...counts,
})
const catalogLot = lot.extend({ acoes: z.strictObject({
  edicao: z.enum(["disponivel", "contrato", "situacao", "sem_associacoes"]),
  bloqueiosExclusao: purgeBlockers,
}).optional() })
export const managedLots = z.strictObject({ pagina: countSchema, total: countSchema, itens: z.array(catalogLot) })
const nullableText = z.string().nullable()
const impact = {
  compartilhadas: countSchema, lotesRelacionados: countSchema, bloqueiaConsolidacao: z.boolean(),
  recebidosAfetados: countSchema, candidatasAfetadas: countSchema, pendenciasAfetadas: countSchema,
}
export const managedLotDetail = lot.extend({
  sha256: z.string(), bytes: countSchema, fonte: z.string(), shaXml: nullableText, manifesto: nullableText,
  pacote: z.object({ digest: z.string(), artefatos: z.array(z.string()) }).nullable(),
  tentativas: z.array(z.object({ id, numero: countSchema, situacao: z.string(), data: z.iso.datetime({ offset: true }) })),
  historico: z.array(z.object({ acao: z.string(), data: z.iso.datetime({ offset: true }), justificativa: z.string(), responsavel: nullableText })),
  revisao: z.string(), vinculosConsolidados: countSchema, ...impact,
})
const reviewSnapshot = z.strictObject({ data: dateSchema.nullable(), horario: nullableText, natureza: nullableText, local: nullableText })
export const importedReviewDraft = reviewSnapshot.extend({ id, lote: id, identificacao: z.string() })
export const managedOccurrence = z.strictObject({
  id, identificacao: z.string(), data: dateSchema.nullable(), horario: nullableText, local: nullableText, natureza: nullableText,
  vinculos: countSchema, revisao: nullableText, versao: nullableText, editavel: z.boolean(), vinculosConsolidados: countSchema.optional(), ...impact,
  manual: manualEditDraft.optional(),
  pendenciasPublicacao: z.array(z.enum(Object.keys(manualPublicationBlocks) as (keyof typeof manualPublicationBlocks)[])).optional(),
  historico: z.array(z.strictObject({
    id, acao: z.enum(["corrigir_associacao", "inativar_associacao"]),
    data: z.iso.datetime({ offset: true }), justificativa: z.string(), responsavel: z.string(), conta: z.string().regex(/^[a-f0-9]{64}$/),
    antes: reviewSnapshot, depois: reviewSnapshot.nullable(),
  })).optional(),
})
export const managementReceipt = z.object({ id, auditoria: id })
export const purgeAuthorizationReceipt = z.strictObject({ id, revisao: revision, validade: z.iso.datetime({ offset: true }) })
const purgeCounts = z.strictObject({
  lotes: countSchema, execucoes: countSchema, staging: countSchema, origens: countSchema,
  extracoes: countSchema, pendencias: countSchema, correcoes: countSchema, inativacoes: countSchema,
  recibos: countSchema, entregas: countSchema, aprovacoes: countSchema, auditorias: countSchema, artefatos: countSchema,
})
export const lotPurgePreview = z.strictObject({
  id, arquivo: z.string(), competencia: directMonth, contrato: z.string(), revisao: revision,
  candidatas: countSchema, compartilhadas: countSchema, quantidades: purgeCounts,
  bloqueios: purgeBlockers,
  autorizada: z.boolean().optional(),
  dataImportacao: z.iso.datetime({ offset: true }).optional(),
  dependencias: z.array(z.string()).optional(),
  excecao: z.strictObject({
    elegivel: z.boolean(),
    validade: z.iso.datetime({ offset: true }).nullable(),
    backup: z.enum(["verificado", "indisponivel"]).optional(),
  }).nullable().optional(),
})
export const incompletePurgePreview = z.strictObject({
  escopo: z.literal("consulta"),
  id, arquivo: z.string(), competencia: directMonth.nullable(), contrato: z.enum(["1.0", "2.0", "geral-v1"]),
  associacoes: countSchema, pendenciasRegistradas: countSchema.nullable(),
  dependencias: z.array(z.string()),
})
export const lotPurgeAssessment = z.union([lotPurgePreview, incompletePurgePreview])
export const lotPurgeHistory = z.strictObject({
  pagina: countSchema, total: countSchema, itens: z.array(z.strictObject({
    id, lote: id, responsavel: z.union([id, revision]), justificativa: reason, momento: z.iso.datetime({ offset: true }), quantidades: purgeCounts,
    revisao_autorizada: revision.nullable().optional(),
    backup_restaurado: revision.nullable().optional(),
  })).max(25),
})
export type ManagementWrite = z.infer<typeof managementWrite>
export type ManagedLot = z.infer<typeof catalogLot>
export type ManagedOccurrence = z.infer<typeof managedOccurrence>
