import "server-only"
import { Client } from "pg"
import { z } from "zod"
import { type Principal, hasPermission } from "@/lib/auth/policy"
import { canReadOperational, type OperationalPrincipal } from "@/lib/auth/operational-access"
import {
  localOccurrenceSummary, localOccurrenceList, importedOccurrenceDetail, consolidatedOccurrenceDetail,
  type LocalOccurrencesQuery,
} from "@/contracts/local-occurrences"
import { directHash } from "@/contracts/pcdf-direct"
import { DatabaseUnavailable } from "@/lib/db/config"
import { cloneDatabasePort, directDatabase, directDatabasePort, directPcdfMode, hostedImportMode, hostedOperationalMode, integratedImportMode } from "@/lib/db/pcdf-direct-mode"
import { occurrenceManagementMode, operationalOccurrenceManagementMode } from "@/lib/db/occurrence-management-mode"
import { manualActor, manualOperationalMode, manualOperationalReady, operationalActor, operationalImportReady } from "@/lib/db/operational-import-review"
import { withHostedOperationalDatabase } from "@/lib/db/hosted-import-db"

const logins = {
  Administrador: "sentinela_local_admin",
  Operador: "sentinela_local_operator",
  Analista: "sentinela_local_analyst",
} as const

export function occurrenceReadMode(env = process.env) {
  const management = occurrenceManagementMode(env)
  if (management) return management
  const operational = integratedImportMode(env)
  if (operational?.port === directDatabasePort || operational?.port === cloneDatabasePort) return operational
  const fixture = directPcdfMode(env)
  if (fixture?.origin === "http://127.0.0.1:3318" && env.SENTINELA_HTTP_VALIDATION_ID
    && env.SENTINELA_OCCURRENCES_QUALIFICATION === "1") return { ...fixture, port: 55486 }
  return null
}

const identitySchema = z.strictObject({
  system: z.string(), uuid: z.string(), started: z.string().regex(/^\d{10}$/),
  readonly: z.enum(["on", "off"]), db: z.literal(directDatabase), host: z.literal("127.0.0.1"),
  port: z.number().int(), login: z.string(), postgis: z.literal("3.6.2"), version: z.literal("170011"),
})
export class LocalOccurrenceForbidden extends Error {}
export class LocalOccurrenceReadOnly extends DatabaseUnavailable {}

export function withOperationalDatabase<T>(principal: OperationalPrincipal, readOnly: boolean,
  run: (client: Client) => Promise<T>, operational = false, statementTimeout = 8000,
  scope: "operational" | "manual-create" = "operational") {
  return hostedOperationalMode()
    ? withHostedOperationalDatabase(principal, readOnly, run, statementTimeout, scope)
    : withLocalOccurrenceDatabase(principal, readOnly, run, operational, statementTimeout)
}

export async function withLocalOccurrenceDatabase<T>(principal: Principal, readOnly: boolean, run: (client: Client) => Promise<T>,
  operational = false, statementTimeout = 8000) {
  const mode = readOnly ? occurrenceReadMode() : operational ? operationalOccurrenceManagementMode() : occurrenceManagementMode()
  if (!mode) throw new DatabaseUnavailable()
  if (!canReadOperational(principal) || (!readOnly && !operational && principal.source !== "local")
    || !hasPermission(principal.role, readOnly ? "analisar" : "cadastrar")) throw new LocalOccurrenceForbidden()
  const user = logins[principal.role]
  const credential = directHash.safeParse(process.env["SENTINELA_PCDF_LOCAL_PASSWORD_" + user])
  if (!credential.success) throw new DatabaseUnavailable()
  const client = new Client({
    host: "127.0.0.1", port: mode.port, database: directDatabase, user, password: credential.data,
    ssl: false, connectionTimeoutMillis: 3000, statement_timeout: statementTimeout, query_timeout: statementTimeout + 2000, lock_timeout: 1000,
    idle_in_transaction_session_timeout: 10000, options: "-c row_security=on" + (readOnly ? " -c default_transaction_read_only=on" : ""),
    application_name: readOnly ? "sentinela-ocorrencias-leitura" : "sentinela-ocorrencias-gestao",
  })
  client.on("error", () => { /* Never surface PostgreSQL diagnostics. */ })
  try {
    await client.connect()
    await client.query(readOnly ? "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN")
    const { rows: [attestation] } = await client.query("SELECT sentinela_ocorrencias_local.identidade() AS data")
    const identity = identitySchema.parse(attestation?.data)
    if (identity.uuid !== mode.id || identity.system !== mode.system || identity.login !== user
      || identity.port !== mode.port
      || Math.abs(Number(identity.started) - Number(mode.epoch)) > 2) throw new DatabaseUnavailable()
    if (!readOnly && identity.readonly === "on") throw new LocalOccurrenceReadOnly()
    if (readOnly && identity.readonly !== "on") throw new DatabaseUnavailable()
    const result = await run(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    await client.end().catch(() => {})
  }
}

export async function queryLocalOccurrences(principal: OperationalPrincipal, query: LocalOccurrencesQuery) {
  if ((query.view === "importados" || (query.view === "detalhe" && query.area === "importados"))
    && !hasPermission(principal.role, "importar")) throw new LocalOccurrenceForbidden()
  const synthetic = occurrenceManagementMode()
  const hosted = hostedOperationalMode()
  const actor = query.view === "importados" && (hosted || operationalOccurrenceManagementMode()) ? operationalActor(principal) : null
  const manualAuthor = !synthetic && (query.view === "manuais" || query.view === "consolidadas") && manualOperationalMode()
    && (!hosted || hosted.write) && hasPermission(principal.role, "editar") ? manualActor(principal) : null
  if (query.view === "importados" && query.lote && !synthetic && !actor) throw new LocalOccurrenceForbidden()
  try {
    return await withOperationalDatabase(principal, true, async client => {
      if (query.view === "resumo") {
        const { rows: [row] } = await client.query("SELECT sentinela_ocorrencias_local.resumo() AS data")
        return localOccurrenceSummary.parse(row?.data)
      }
      if (query.view === "detalhe") {
        const { rows: [row] } = query.area === "manuais"
          ? await client.query("SELECT sentinela_ocorrencias_manual.detalhe($1) AS data", [query.id])
          : await client.query("SELECT sentinela_ocorrencias_local.detalhe($1,$2) AS data", [query.area, query.id])
        const schema = query.area === "importados" ? importedOccurrenceDetail : consolidatedOccurrenceDetail
        return row?.data === null ? null : schema.parse(row?.data)
      }
      const operational = actor && await operationalImportReady(client, actor)
      if (query.view === "importados" && query.lote && !synthetic && !operational) throw new LocalOccurrenceForbidden()
      const { view, pagina, ordenar, direcao, ...filters } = query
      const { rows: [row] } = view === "manuais"
        ? await client.query("SELECT sentinela_ocorrencias_manual.lista($1,$2,$3,$4) AS data", [filters, pagina, ordenar, direcao])
        : await client.query("SELECT sentinela_ocorrencias_local.lista($1,$2,$3,$4,$5) AS data", [view, filters, pagina, ordenar, direcao])
      const list = localOccurrenceList.parse(row?.data)
      const lot = query.view === "importados" ? query.lote?.toLowerCase() : undefined
      if (lot && list.itens.some(item => item.lote !== lot))
        throw new DatabaseUnavailable()
      if (manualAuthor && list.itens.length && await manualOperationalReady(client, manualAuthor)) {
        const { rows: [managed] } = await client.query("SELECT sentinela_ocorrencias_manual.acoes($1) AS data", [list])
        return localOccurrenceList.parse(managed?.data)
      }
      const canManage = view === "manuais" ? hasPermission(principal.role, "editar") : hasPermission(principal.role, "administrar")
      if (canManage && (synthetic || (operational && lot && (!hosted || hostedImportMode()?.write))) && list.itens.length) {
        const { rows: [capability] } = await client.query("SELECT to_regprocedure('sentinela_gestao.acoes(text,jsonb)') IS NOT NULL AS available")
        if (capability.available) {
          const { rows: [managed] } = await client.query("SELECT sentinela_gestao.acoes($1,$2) AS data", [view, list])
          return localOccurrenceList.parse(managed?.data)
        }
      }
      return list
    })
  } catch (error) {
    if (error instanceof LocalOccurrenceForbidden || (error && typeof error === "object" && "code" in error && error.code === "42501")) throw new LocalOccurrenceForbidden()
    throw new DatabaseUnavailable()
  }
}
