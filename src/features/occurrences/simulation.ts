// Pure UI simulation. No fetch, storage, database or experimental SQL imports.
import { plannedOccurrenceCreateSchema, plannedOccurrenceUpdateSchema, plannedOccurrenceInactivationSchema, type PlannedOccurrenceCreate } from "@/contracts/planned-occurrence-writes"
import { hasPermission, type Role } from "@/lib/auth/policy"
import type { ReadOccurrence } from "@/features/occurrences/client"
import syntheticBindings from "../../../public/data/cartography/ra-bindings-synthetic.json" with { type: "json" }

export type SimulationOperation = "create" | "edit" | "inactivate"
export type SimulationScenario = "normal" | "conflict" | "unavailable" | "denied"
export interface SimulationRecord {
  id: string; versao: string; ativo: boolean; origem: "manual" | "importacao"
  consolidacaoStatus: "consolidada" | "em_revisao" | "bloqueada"
  values: PlannedOccurrenceCreate
}
export interface SimulationCatalogs { regions: { id: string; nome: string }[]; natures: { id: string; descricao: string }[] }
export type SimulationResult = { persisted: false; message: string } & (
  { success: true; preview: SimulationRecord } | { success: false; code: number; errors: Record<string, string> }
)
export function simulationAllowed(role: Role, operation: SimulationOperation) {
  const permissions = { create: "cadastrar", edit: "editar", inactivate: "inativar" } as const
  return hasPermission(role, permissions[operation])
}
export function simulationEligible(record: SimulationRecord) {
  return record.ativo && record.origem === "manual" && record.consolidacaoStatus === "consolidada"
}
export function fromReadOccurrence(record: ReadOccurrence): SimulationRecord {
  return { id: record.id, versao: record.versao, ativo: record.ativo, origem: record.origem, consolidacaoStatus: record.consolidacaoStatus,
    values: { data: record.data ?? "", horario: record.horario ?? "", raId: record.ra?.id ?? "", local: record.local ?? "",
      coordenadas: record.latitude !== null && record.longitude !== null ? { latitude: record.latitude, longitude: record.longitude } : null,
      naturezas: record.naturezas.map(n => ({ naturezaId: n.natureza?.id ?? "", crimeTentado: n.crimeTentado })) } }
}
export function simulateOccurrence(role: Role, operation: SimulationOperation, input: unknown, catalogs: SimulationCatalogs,
  record?: SimulationRecord, scenario: SimulationScenario = "normal"): SimulationResult {
  const fail = (code: number, message: string, errors: Record<string, string> = {}): SimulationResult => ({ success: false, persisted: false, code, message, errors })
  if (!simulationAllowed(role, operation)) return fail(403, "Seu perfil não permite esta simulação.")
  const schema = operation === "create" ? plannedOccurrenceCreateSchema : operation === "edit" ? plannedOccurrenceUpdateSchema : plannedOccurrenceInactivationSchema
  const parsed = schema.safeParse(input)
  if (!parsed.success) return fail(422, "Revise os campos indicados.", Object.fromEntries(parsed.error.issues.map(i => [i.path.join("."), i.message])))
  if (operation !== "create") {
    if (!record) return fail(404, "Selecione uma ocorrência.")
    if (!simulationEligible(record)) return fail(422, "Registro inativo, importado ou em revisão: operação regular indisponível.")
    const version = (parsed.data as { versaoEsperada: string }).versaoEsperada
    if (version !== record.versao || scenario === "conflict") return fail(409, "Conflito de versão simulado. Cancele e consulte novamente; nada foi alterado.")
  }
  if (scenario === "denied") return fail(403, "Acesso negado simulado. Nenhum dado foi alterado.")
  if (scenario === "unavailable") return fail(503, "Indisponibilidade simulada. Tente novamente; nenhum dado foi gravado.")
  const values = operation === "create" ? plannedOccurrenceCreateSchema.parse(parsed.data)
    : operation === "edit" ? { ...record!.values, ...plannedOccurrenceUpdateSchema.parse(parsed.data).alteracoes } : record!.values
  if (operation !== "inactivate") {
    const full = plannedOccurrenceCreateSchema.safeParse(values)
    if (!full.success) return fail(422, "O registro combinado possui campos pendentes. Revise o formulário.")
    if (!catalogs.regions.length || !catalogs.natures.length) return fail(422, "Catálogo vazio ou indisponível. Escolha dados válidos ou selecione explicitamente o cenário sintético.")
    if (!catalogs.regions.some(r => r.id === values.raId)) return fail(422, "Selecione uma região disponível.", { raId: "Região indisponível no catálogo selecionado." })
    if (values.naturezas.some(n => !catalogs.natures.some(c => c.id === n.naturezaId))) return fail(422, "Selecione naturezas disponíveis.", { naturezas: "Natureza indisponível no catálogo selecionado." })
    if (new Set(values.naturezas.map(n => n.naturezaId.toLowerCase() + ":" + n.crimeTentado)).size !== values.naturezas.length) return fail(422, "Não repetir natureza e tentativa.", { naturezas: "Associação duplicada." })
  }
  return { success: true, persisted: false, message: "Simulação concluída. Nenhum dado foi gravado no banco; a consulta real permanece inalterada. A prévia não representa aprovação territorial.",
    preview: { id: record?.id ?? crypto.randomUUID(), versao: operation === "create" ? "1" : String(BigInt(record!.versao) + 1n),
      ativo: operation !== "inactivate", origem: record?.origem ?? "manual", consolidacaoStatus: record?.consolidacaoStatus ?? "em_revisao", values: structuredClone(values) } }
}

// Explicitly selected synthetic scenario, never a fallback for an empty GET.
export const SYNTHETIC_CATALOGS: SimulationCatalogs = {
  regions: syntheticBindings.entries.map(e => ({ id: e.raId, nome: `${e.sourceName} · UUID SINTÉTICO` })),
  natures: [1, 2].map(i => ({ id: `31000000-0000-4000-8000-00000000000${i}`, descricao: `Natureza SINTÉTICA ${i}` })),
}
export function syntheticRecord(state: "regular" | "review" | "inactive" = "regular"): SimulationRecord {
  return { id: "51000000-0000-4000-8000-000000000001", versao: "1", ativo: state !== "inactive", origem: "manual",
    consolidacaoStatus: state === "review" ? "em_revisao" : "consolidada",
    values: { data: "2026-11-12", horario: "12:00:00", raId: SYNTHETIC_CATALOGS.regions[0].id, local: "Endereço exclusivamente SINTÉTICO", coordenadas: { latitude: -15.79, longitude: -47.88 }, naturezas: [{ naturezaId: SYNTHETIC_CATALOGS.natures[0].id, crimeTentado: null }] } }
}
