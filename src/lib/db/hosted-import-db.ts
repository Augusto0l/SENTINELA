import "server-only"
import { createHash } from "node:crypto"
import { Client } from "pg"
import { z } from "zod"
import createServerSupabaseClient from "@/lib/supabase/server"
import { publicSupabaseConfig } from "@/lib/supabase/config"
import authGateway from "@/lib/auth/gateway"
import { resolveAccess } from "@/lib/auth/core"
import { LocalImportDbError } from "@/lib/db/local-import-db"
import type { OperationalPrincipal } from "@/lib/auth/operational-access"
import { hostedOperationalMode } from "@/lib/db/pcdf-direct-mode"
import { headers } from "next/headers"

const logins = {
  Administrador: "sentinela_local_admin",
  Operador: "sentinela_local_operator",
  Analista: "sentinela_local_analyst",
} as const
const unavailable = () => new LocalImportDbError("PostgreSQL hospedado de importação indisponível.")

export async function getHostedImportPrincipal() {
  const auth = await createServerSupabaseClient()
  if (!auth) return null
  const access = await resolveAccess(authGateway(auth))
  if (access.status !== "allowed" || access.principal.source !== "supabase") return null
  const { data, error } = await auth.auth.getClaims()
  const session = z.uuid().safeParse(data?.claims.session_id)
  if (error || !session.success || data?.claims.sub !== access.principal.authUserId) return null
  return { ...access.principal, session: session.data }
}

export type HostedImportPrincipal = NonNullable<Awaited<ReturnType<typeof getHostedImportPrincipal>>>

export function hostedImportActor(principal: Pick<HostedImportPrincipal, "id" | "authUserId">) {
  const project = publicSupabaseConfig()
  if (!project) throw unavailable()
  return { subject: principal.id,
    account: createHash("sha256").update(JSON.stringify(["sentinela-supabase", project.url, principal.authUserId])).digest("hex") }
}

export function hostedImportConnection(principal: HostedImportPrincipal, statementTimeout = 60000, operational = false) {
  if (principal.role === "Analista" && !operational) throw unavailable()
  const login = logins[principal.role]
  const project = publicSupabaseConfig()
  const installation = z.uuid().safeParse(process.env.SENTINELA_SUPABASE_IMPORT_INSTALLATION)
  const ca = process.env.SENTINELA_SUPABASE_IMPORT_CA
  try {
    if (!project || !installation.success || !ca) throw unavailable()
    const ref = /^([a-z0-9]+)\.supabase\.co$/.exec(new URL(project.url).hostname)?.[1]
    const raw = process.env[`SENTINELA_SUPABASE_IMPORT_URL_${login}`]
    const url = new URL(raw ?? "")
    const direct = url.hostname === `db.${ref}.supabase.co`
    const sessionPooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)
    const user = decodeURIComponent(url.username)
    const password = decodeURIComponent(url.password)
    if (!ref || (!direct && !sessionPooler) || url.protocol !== "postgresql:" || url.port !== "5432"
      || url.pathname !== "/postgres" || url.search || url.hash || raw !== raw?.trim()
      || user !== (direct ? login : `${login}.${ref}`) || !password || /[\x00-\x1f\x7f]/.test(password))
      throw unavailable()
    const client = new Client({ host: url.hostname, port: 5432, database: "postgres", user, password,
      ssl: { ca, rejectUnauthorized: true, servername: url.hostname }, connectionTimeoutMillis: 5000,
      query_timeout: statementTimeout + 5000 })
    const { account } = hostedImportActor(principal)
    return { client, login, actor: principal.id, account, installation: installation.data, statementTimeout }
  } catch { throw unavailable() }
}

export async function withHostedImportDatabase<T>(principal: HostedImportPrincipal, readOnly: boolean,
  callback: (client: Client) => Promise<T>, statementTimeout?: number) {
  const connection = hostedImportConnection(principal, statementTimeout)
  const { client } = connection
  try {
    if (!await attestHostedImportDatabase(connection, principal, readOnly))
      throw Object.assign(new Error("Sessão de importação recusada."), { code: "42501" })
    return await callback(client)
  } finally {
    await client.end().catch(() => {})
  }
}

export async function withHostedOperationalDatabase<T>(principal: OperationalPrincipal, readOnly: boolean,
  callback: (client: Client) => Promise<T>, statementTimeout: number) {
  const mode = hostedOperationalMode()
  if (!mode || principal.source !== "supabase" || (!readOnly && (!mode.write || principal.role === "Analista"))
    || (await headers()).get("host") !== new URL(mode.origin).host)
    throw Object.assign(new Error("Operação institucional não autorizada."), { code: "42501" })
  const verified = principal.session ? { ...principal, session: principal.session } : await getHostedImportPrincipal()
  if (!verified || verified.id !== principal.id || verified.authUserId !== principal.authUserId || verified.role !== principal.role)
    throw Object.assign(new Error("Sessão institucional não autorizada."), { code: "42501" })
  const connection = hostedImportConnection(verified, statementTimeout, true)
  const { client } = connection
  client.on("error", () => {})
  try {
    if (!await attestHostedImportDatabase(connection, verified, readOnly, true))
      throw Object.assign(new Error("Sessão institucional não autorizada."), { code: "42501" })
    await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN READ WRITE")
    try {
      const result = await callback(client)
      await client.query("COMMIT")
      return result
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      throw error
    }
  } finally {
    await client.end().catch(() => {})
  }
}

export async function attestHostedImportDatabase(connection: ReturnType<typeof hostedImportConnection>,
  principal: HostedImportPrincipal, readOnly: boolean, operational = false) {
  const { client, login, installation, statementTimeout } = connection
  try {
    await client.connect()
    if (readOnly) await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
    await client.query(`SELECT set_config('statement_timeout',$1,false),
      set_config('row_security','on',false), set_config('lock_timeout','1000',false),
      set_config('idle_in_transaction_session_timeout','10000',false),
      set_config('sentinela.import_session',$2,false)`, [String(statementTimeout), principal.session])
    const actor = operational ? "ator_operacional" : "ator_importacao"
    const { rows: [row] } = await client.query(`SELECT sentinela_ambiente.${actor}()=$1::uuid AS authorized
      FROM pg_roles r WHERE r.rolname = current_user AND current_user=$2 AND session_user=$2
        AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolinherit)
        AND NOT EXISTS (SELECT FROM pg_auth_members m WHERE m.member=r.oid)
        AND NOT EXISTS (SELECT FROM pg_class WHERE relowner=r.oid)
        AND sentinela_ambiente.vinculado() AND sentinela_ambiente.instalacao()=$3::uuid`,
    [principal.id, login, installation])
    if (row?.authorized === true) return true
    return false
  } catch { throw unavailable() }
}
