// Experimental service only. Never imported by src/app or the operational pool.
import { readFile, realpath } from "node:fs/promises"
import { join, resolve } from "node:path"
import { Pool } from "pg"
import { z } from "zod"
import { coordinateSchema } from "../../../src/contracts/common.ts"
import { plannedOccurrenceCreateSchema } from "../../../src/contracts/planned-occurrence-writes.ts"
import { hasPermission, type Role } from "../../../src/lib/auth/policy.ts"
import { sandboxEditCommandSchema, sandboxInactivationCommandSchema, sandboxMutationRoleAllowed } from "./mutation-contracts.ts"

export const sandboxCreateSchema = plannedOccurrenceCreateSchema.extend({ coordenadas: coordinateSchema })
  .refine(value => new Set(value.naturezas.map(n => n.naturezaId.toLowerCase() + ":" + n.crimeTentado)).size === value.naturezas.length, "Vínculo duplicado.")
const resultSchema = z.strictObject({
  id: z.uuid(), versao: z.literal("1"), auditId: z.uuid(),
  atorSintetico: z.enum(["sentinela_sbx_admin", "sentinela_sbx_operator"]),
  localizacaoStatus: z.literal("referencia_pendente"), consolidacaoStatus: z.literal("em_revisao"),
  naturezas: sandboxCreateSchema.shape.naturezas,
})
const mutationResultSchema = z.strictObject({
  id: z.uuid(), versao: z.string().regex(/^[1-9]\d*$/), auditId: z.uuid(),
  atorSintetico: z.enum(["sentinela_sbx_admin", "sentinela_sbx_operator"]), operacao: z.enum(["edit", "inactivate"]), ativo: z.boolean(),
})
export class SandboxError extends Error {
  status: number
  sqlState?: string
  constructor(status: number) { super("Operação experimental recusada ou indisponível."); this.status = status }
}
export interface SyntheticSession { kind: "sandbox-synthetic-only"; role: Role; subject?: string }
interface Address { address: string; district: string }
export interface LabConfig {
  manifest: string; expectedUUID: string
  credentials: Record<"Administrador" | "Operador", { user: string; password: string }>
}
export async function attestManifest(config: LabConfig) {
  try {
  if (process.env.NODE_ENV !== "development" || process.env.SENTINELA_SANDBOX_WRITE !== "1") throw new SandboxError(403)
  const m = JSON.parse(await readFile(config.manifest, "utf8"))
  if (!z.uuid().safeParse(config.expectedUUID).success || m.uuid !== config.expectedUUID
    || m.purpose !== "sentinela-write-sandbox-v1" || m.phase !== "INSTALLED"
    || m.host !== "127.0.0.1" || m.port !== 55432 || m.database !== "sentinela_rls_sandbox"
    || !/^\d+$/.test(m.system_id ?? "") || !Number.isInteger(m.pid) || !Number.isInteger(m.start_epoch)) throw new SandboxError(403)
  const root = join(process.env.USERPROFILE ?? "", ".sentinela-local", "rls-sandboxes", "rls-sandbox-" + config.expectedUUID)
  if (!process.env.USERPROFILE || resolve(config.manifest) !== join(root, "manifest.json")
    || resolve(m.root) !== root || resolve(m.data) !== join(root, "data")
    || await realpath(root) !== root || await realpath(m.data) !== m.data) throw new SandboxError(403)
  const marker = JSON.parse(await readFile(join(m.data, "sentinela-sandbox.json"), "utf8"))
  const pid = (await readFile(join(m.data, "postmaster.pid"), "utf8")).split(/\r?\n/)
  if (marker.uuid !== m.uuid || marker.system_id !== m.system_id || marker.data !== m.data
    || Number(pid[0]) !== m.pid || resolve(pid[1]) !== resolve(m.data) || Number(pid[3]) !== 55432) throw new SandboxError(403)
  return m
  } catch (error) {
    if (error instanceof SandboxError) throw error
    throw new SandboxError(403)
  }
}

// resolveSession is a trusted server/test adapter, never supplied by an HTTP client.
// This does NOT replace local authentication or claim human SQL identity.
export function createSandboxRegistrar(config: LabConfig, resolveSession: (token: string | undefined) => Promise<SyntheticSession | null>) {
  const pools = new Map<string, Pool>()
  const execute = async (token: string | undefined, input: unknown, key: unknown, mode: "create" | "edit" | "inactivate", address?: Address) => {
      const session = await resolveSession(token)
      if (!session) throw new SandboxError(401)
      if (session.kind !== "sandbox-synthetic-only" || !hasPermission(session.role, "cadastrar")) throw new SandboxError(403)
      if (mode !== "create" && !sandboxMutationRoleAllowed(session.role)) throw new SandboxError(403)
      const payload = mode === "create" ? sandboxCreateSchema.safeParse(input)
        : mode === "edit" ? sandboxEditCommandSchema.safeParse(input) : sandboxInactivationCommandSchema.safeParse(input)
      const requestId = z.uuid().safeParse(key)
      if (!payload.success || (mode === "create" && !requestId.success)) throw new SandboxError(422)
      const m = await attestManifest(config)
      if (mode !== "create" && m.mutation_revision !== 2) throw new SandboxError(403)
      const role = session.role as "Administrador" | "Operador"
      const credential = config.credentials[role]
      const expectedRole = role === "Administrador" ? "sentinela_sbx_admin" : "sentinela_sbx_operator"
      if (!credential || credential.user !== expectedRole || !credential.password) throw new SandboxError(403)
      let pool = pools.get(expectedRole)
      if (!pool) {
        pool = new Pool({ host: "127.0.0.1", port: 55432, database: "sentinela_rls_sandbox",
          user: expectedRole, password: credential.password, ssl: false, max: 3,
          connectionTimeoutMillis: 3000, statement_timeout: 5000, query_timeout: 7000,
          lock_timeout: 2000, idle_in_transaction_session_timeout: 10000,
          application_name: "sentinela-write-sandbox-only" })
        pool.on("error", () => { /* Never log native connection errors. */ })
        pools.set(expectedRole, pool)
      }
      const client = await pool.connect().catch(() => { throw new SandboxError(503) })
      let discard = false
      try {
        await client.query("BEGIN")
        const { rows } = await client.query(`SELECT current_database() AS db,session_user AS login,current_user AS role,
          host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('server_version_num') AS version,
          (SELECT system_identifier::text FROM pg_control_system()) AS system_id,current_setting('sentinela.sandbox_uuid',true) AS uuid,
          extract(epoch FROM pg_postmaster_start_time())::bigint::text AS started,
          r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolinherit AS elevated,
          EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) AS member,
          EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid) AS owner
          FROM pg_roles r WHERE rolname=current_user`)
        const i = rows[0]
        if (!i || i.db !== m.database || i.login !== expectedRole || i.role !== expectedRole || i.host !== "127.0.0.1"
          || i.port !== 55432 || i.version !== "170011" || i.uuid !== m.uuid || i.system_id !== m.system_id
          || Math.abs(Number(i.started) - m.start_epoch) > 2 || i.elevated || i.member || i.owner) throw new SandboxError(403)
        const mutation = mode !== "create" ? (mode === "edit" ? sandboxEditCommandSchema : sandboxInactivationCommandSchema).parse(input) : null
        const result = mutation
          ? await client.query("SELECT sentinela_write_lab.mutate($1::uuid,$2::jsonb,$3::text) AS result", [mutation.id,
              JSON.stringify(mode === "edit" && session.subject && address
                ? { ...mutation.payload, alteracoes: { ...("alteracoes" in mutation.payload ? mutation.payload.alteracoes : {}),
                    endereco: address.address, bairroOuSetor: address.district } }
                : mutation.payload), mode])
          : await client.query("SELECT sentinela_write_lab.cadastrar($1::jsonb,$2::uuid) AS result", [JSON.stringify(payload.data), requestId.data])
        const data = mode === "create" ? resultSchema.parse(result.rows[0]?.result) : mutationResultSchema.parse(result.rows[0]?.result)
        if (data.atorSintetico !== expectedRole) throw new SandboxError(403)
        if (mode !== "create" && (data as z.infer<typeof mutationResultSchema>).operacao !== mode) throw new SandboxError(503)
        if (session.subject) await client.query(
          "SELECT sentinela_write_lab.record_version($1::uuid,$2::uuid,$3::bigint,$4::uuid,$5::text,$6::text,$7::text)",
          [session.subject, data.id, data.versao, data.auditId, mode, address?.address ?? null, address?.district ?? null],
        )
        await client.query("COMMIT")
        return { success: true as const, scope: "sandbox-synthetic-only" as const, persisted: true as const, data }
      } catch (error) {
        discard = true
        await client.query("ROLLBACK").catch(() => {})
        if (error instanceof SandboxError) throw error
        const code = (error as {code?: string}).code
        const failure = new SandboxError(["23505", "40001"].includes(code ?? "") ? 409 : code === "P0002" ? 404 : code === "42501" ? 403 : code?.startsWith("22") || ["23503", "23514"].includes(code ?? "") ? 422 : 503)
        if (/^[0-9A-Z]{5}$/.test(code ?? "")) failure.sqlState = code
        throw failure
      } finally { client.release(discard) }
    }
  return {
    register: (token: string | undefined, input: unknown, key: unknown, address?: Address) => execute(token, input, key, "create", address),
    edit: (token: string | undefined, input: unknown, address?: Address) => execute(token, input, undefined, "edit", address),
    inactivate: (token: string | undefined, input: unknown) => execute(token, input, undefined, "inactivate"),
    async close() { await Promise.all([...pools.values()].map(pool => pool.end())); pools.clear() },
  }
}
