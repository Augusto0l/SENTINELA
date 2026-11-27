import "server-only"
import { createHash } from "node:crypto"
import type { Client } from "pg"
import { generalHistory } from "@/contracts/general-import"
import { localOccurrenceList } from "@/contracts/local-occurrences"
import { importedReviewDraft, incompletePurgePreview } from "@/contracts/occurrence-management"
import { directHistory } from "@/contracts/pcdf-direct"
import { cloneDatabasePort, directDatabasePort, hostedOperationalMode, integratedImportMode, integratedSupabaseMode, institutionalDatabaseMode } from "@/lib/db/pcdf-direct-mode"
import type { OperationalPrincipal } from "@/lib/auth/operational-access"
import { operationalOccurrenceManagementMode } from "@/lib/db/occurrence-management-mode"
import { publicSupabaseConfig } from "@/lib/supabase/config"

function supabaseAccount(principal: OperationalPrincipal) {
  if (principal.source !== "supabase" || !institutionalDatabaseMode()) return null
  const config = publicSupabaseConfig()
  if (!config) return null
  return createHash("sha256").update(JSON.stringify(["sentinela-supabase", config.url, principal.authUserId])).digest("hex")
}

export function operationalActor(principal: OperationalPrincipal) {
  if (principal.role !== "Administrador") return null
  if (principal.source === "local") return principal.localSubject && principal.localAccountId
    ? { subject: principal.localSubject, account: principal.localAccountId } : null
  // Capability must still match a locally approved actor, fingerprint and release.
  const account = supabaseAccount(principal)
  return account ? { subject: principal.id, account } : null
}

// Manual occurrences accept Administrador and Operador. PostgreSQL recomputes the fingerprint
// from the linked auth identity and the released Supabase project before any write.
export function manualActor(principal: OperationalPrincipal) {
  if (principal.role !== "Administrador" && principal.role !== "Operador") return null
  const account = supabaseAccount(principal)
  return account ? { subject: principal.id, account } : null
}

export function manualOperationalMode() {
  return hostedOperationalMode() ?? (integratedSupabaseMode() ? operationalOccurrenceManagementMode() : null)
}

export async function manualOperationalReady(client: Client, actor: NonNullable<ReturnType<typeof manualActor>>) {
  const { rows: [functions] } = await client.query(`SELECT
    coalesce(has_function_privilege(to_regprocedure('sentinela_ocorrencias_manual.cadastrar_completo(jsonb,uuid,text,uuid)'), 'EXECUTE'), false)
    AND coalesce(has_function_privilege(to_regprocedure('sentinela_ocorrencias_manual.autor(uuid,text)'), 'EXECUTE'), false) AS installed`)
  if (functions?.installed !== true) return false
  const { rows: [author] } = await client.query("SELECT sentinela_ocorrencias_manual.autor($1,$2) IS NOT NULL AS ready",
    [actor.subject, actor.account])
  return author?.ready === true
}

export async function operationalImportReady(client: Client, actor: NonNullable<ReturnType<typeof operationalActor>>) {
  const { rows: [functions] } = await client.query(`SELECT
    coalesce(has_function_privilege(to_regprocedure('sentinela_gestao_autorizacao.capacidade(uuid,text)'), 'EXECUTE'), false)
    AND coalesce(has_function_privilege(to_regprocedure('sentinela_gestao.mutar(jsonb,text,uuid)'), 'EXECUTE'), false)
    AND coalesce(has_function_privilege(to_regprocedure('sentinela_exclusao.excluir(jsonb,text,uuid)'), 'EXECUTE'), false)
    AND coalesce(has_function_privilege(to_regprocedure('sentinela_exclusao.previa(uuid,uuid,text)'), 'EXECUTE'), false) AS installed`)
  if (functions?.installed !== true) return false
  const { rows: [release] } = await client.query(
    "SELECT sentinela_gestao_autorizacao.capacidade($1,$2) AS available", [actor.subject, actor.account],
  )
  return release?.available === true
}

export function operationalImportReviewMode() {
  const mode = integratedImportMode()
  return mode?.port === directDatabasePort || mode?.port === cloneDatabasePort ? mode : null
}

async function importedRows(client: Client, filters: Record<string, string>, page = 1) {
  const { rows: [row] } = await client.query(
    "SELECT sentinela_ocorrencias_local.lista('importados',$1,$2,'identificacao','asc') AS data", [filters, page],
  )
  return localOccurrenceList.parse(row?.data)
}

async function knownLot(client: Client, id: string) {
  const { rows: [row] } = await client.query("SELECT sentinela_pcdf_local.history() AS data")
  return directHistory.parse(row?.data).find(entry => entry.lot === id && !entry.inativada
    && (entry.status === "concluida" || entry.status === "reenvio"))
}

export class OperationalLotScopeUnavailable extends Error {}

export async function operationalLotRecords(client: Client, id: string, page: number, search?: string) {
  id = id.toLowerCase()
  const lot = await knownLot(client, id)
  if (!lot) return null
  const filters = { competencia: lot.month, lote: id }
  const baseline = await importedRows(client, filters)
  // Older deployments ignore the UUID filter. Confirm the complete count and ownership
  // before using their month filter, then verify the ownership of every returned row.
  if (baseline.total !== (lot.persisted ?? lot.records) || !baseline.itens.length
    || baseline.itens.some(item => item.lote !== id)) throw new OperationalLotScopeUnavailable()
  if (page === 1 && !search) return baseline
  const result = await importedRows(client, { ...filters, ...(search && { identificacao: search }) }, page)
  if (result.itens.some(item => item.lote !== id)) throw new OperationalLotScopeUnavailable()
  return result
}

export async function operationalReviewDraft(client: Client, id: string, lot: string) {
  id = id.toLowerCase()
  lot = lot.toLowerCase()
  if (!await knownLot(client, lot)) return null
  const result = await importedRows(client, { identificacao: id, lote: lot })
  const item = result.itens.find(row => row.id === id && row.lote === lot)
  if (!item) return null
  return importedReviewDraft.parse({
    id, lote: lot, identificacao: item.identificacao ?? id, data: item.data, horario: item.hora,
    natureza: item.natureza, local: item.local,
  })
}

export async function operationalPurgePreview(client: Client, id: string) {
  id = id.toLowerCase()
  const lot = await knownLot(client, id)
  let summary
  if (lot) {
    summary = { arquivo: lot.name, competencia: lot.month, contrato: lot.contract ?? "1.0",
      associacoes: lot.persisted ?? lot.records, pendenciasRegistradas: lot.issues ?? null }
  } else {
    const { rows: [row] } = await client.query("SELECT sentinela_import_local.history() AS data")
    const entry = generalHistory.parse(row?.data).find(item => item.receipt?.lot === id
      && item.status === "concluida" && !item.inativada)
    if (!entry?.receipt) return null
    summary = { arquivo: entry.name, competencia: null, contrato: "geral-v1",
      associacoes: entry.receipt.persisted, pendenciasRegistradas: entry.receipt.summary.issues }
  }
  // Report catalog relationships only. The installed reader cannot inspect the
  // references or determine which records would actually be removed.
  const { rows } = await client.query<{ name: string }>(`
    SELECT DISTINCT child_ns.nspname || '.' || child.relname AS name
    FROM pg_constraint fk
    JOIN pg_class target ON target.oid = fk.confrelid
    JOIN pg_namespace target_ns ON target_ns.oid = target.relnamespace
    JOIN pg_class child ON child.oid = fk.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    WHERE fk.contype = 'f' AND target_ns.nspname = 'sentinela'
      AND target.relname IN ('lotes_importacao','execucoes_importacao','linhas_staging','linhas_origem','pendencias_revisao')
    ORDER BY name`)
  return incompletePurgePreview.parse({
    escopo: "consulta", id, ...summary,
    dependencias: rows.map(row => row.name),
  })
}
