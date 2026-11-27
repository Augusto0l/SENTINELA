import { z } from "zod"

export const classificacaoPath = "/api/v1/classificacao"
const count = z.number().int().nonnegative()
const versao = z.string().regex(/^pcdf-classificacao-v2\.[0-9]{1,3}$/)
const justificativa = z.string().trim().min(10).max(500)

export const classificacaoAplicacao = z.union([
  z.strictObject({ aplicada: z.literal(false), motivo: z.literal("sem_versao_ativa") }),
  z.strictObject({ aplicada: z.literal(true), versao, mapeadas: count, conflitantes: count, semCorrespondencia: count,
    desconhecidas: count, pendenciasResolvidas: count, pendenciasCriadas: count }),
])

export const classificacaoSituacao = z.strictObject({
  versaoAtiva: versao.nullable(),
  proposta: z.strictObject({ categorias: count, regras: count }),
  versoes: z.array(z.strictObject({ versao, vigenciaInicio: z.iso.date(), vigenciaFim: z.iso.date().nullable(),
    homologadaEm: z.string(), responsavel: z.string(), homologadas: count, naoClassificaveis: count })),
  associacoes: z.record(z.enum(["pendente", "mapeada", "conflitante", "sem_correspondencia"]), count).nullable(),
  pendenciasClassificacaoAbertas: count,
})

export const classificacaoComando = z.discriminatedUnion("acao", [
  z.strictObject({ acao: z.literal("homologar"), versao,
    regras: z.array(z.string().regex(/^PCDF-N-[0-9]{2}:(true|false)$/)).min(1).max(43),
    evidencia: z.string().trim().min(10).max(2000), vigenciaInicio: z.iso.date(), vigenciaFim: z.iso.date().optional() }),
  z.strictObject({ acao: z.literal("ativar"), versao }),
  z.strictObject({ acao: z.literal("aplicar"), lote: z.uuid(), justificativa }),
  z.strictObject({ acao: z.literal("reverter"), lote: z.uuid(), versao, justificativa }),
])

export type ClassificacaoComando = z.infer<typeof classificacaoComando>
export type ClassificacaoSituacao = z.infer<typeof classificacaoSituacao>
