import "server-only"
import { Pool } from "pg"
import { DatabaseUnavailable, operationalConfig } from "@/lib/db/config"
import type { Principal } from "@/lib/auth/policy"

const state = globalThis as typeof globalThis & { sentinelaReader?: { pool: Pool; password: string } }
export async function readOperational<T>(principal: Principal, read: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  if (principal.source !== "local") throw new DatabaseUnavailable()
  const config = operationalConfig()
  if (state.sentinelaReader && state.sentinelaReader.password !== config.password) {
    await state.sentinelaReader.pool.end()
    state.sentinelaReader = undefined
  }
  if (!state.sentinelaReader) {
    const pool = new Pool({ ...config, ssl: false, max: 3, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000,
      statement_timeout: 5000, query_timeout: 7000, lock_timeout: 1000, idle_in_transaction_session_timeout: 10000,
      application_name: "sentinela-local-read-api", options: "-c default_transaction_read_only=on", client_encoding: "UTF8" })
    pool.on("error", () => { /* Deliberately never log libpq errors or credentials. */ })
    state.sentinelaReader = { pool, password: config.password }
  }
  let client: import("pg").PoolClient
  try { client = await state.sentinelaReader.pool.connect() } catch { throw new DatabaseUnavailable() }
  let discard = false
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const { rows } = await client.query(`SELECT current_database() AS db, session_user AS login, current_user AS role,
      host(inet_server_addr()) AS host, inet_server_port() AS port, current_setting('server_version_num') AS version,
      r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolinherit AS elevated,
      EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) AS member,
      EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid) AS owner,
      (SELECT count(*)::int FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r' AND relrowsecurity AND relforcerowsecurity) AS rls
      FROM pg_roles r WHERE rolname=current_user`)
    const i = rows[0]
    if (!i || i.db !== config.database || i.login !== config.user || i.role !== config.user || i.host !== config.host || i.port !== config.port
      || i.version !== "170011" || i.elevated || i.member || i.owner || i.rls !== 19) throw new DatabaseUnavailable()
    const result = await read(client)
    await client.query("COMMIT")
    return result
  } catch {
    discard = true
    try { await client.query("ROLLBACK") } catch { /* connection discarded below */ }
    throw new DatabaseUnavailable()
  } finally { client.release(discard) }
}
