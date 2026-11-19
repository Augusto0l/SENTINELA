import "server-only"
import type { Client } from "pg"
import type { Principal } from "@/lib/auth/policy"
import { assertPersistentIdentity, DatabaseUnavailable, persistentReadConfig } from "@/lib/db/config"
import { readOperational } from "@/lib/db/pool"

export const persistentIdentitySql = `SELECT current_database() AS db, session_user AS login, current_user AS role,
      host(inet_server_addr()) AS host, inet_server_port() AS port, current_setting('server_version_num') AS version,
      current_setting('listen_addresses') AS listen, current_setting('cluster_name') AS cluster,
      sentinela_homologacao.system_identifier() AS system, current_setting('transaction_read_only') AS readonly,
      (SELECT extversion FROM pg_extension WHERE extname='postgis' AND extnamespace='extensions'::regnamespace) AS postgis,
      r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolinherit AS elevated,
      EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) AS member,
      EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid) AS owner,
      (SELECT count(*)::int FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r'
        AND relrowsecurity AND relforcerowsecurity) AS rls,
      EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r'
        AND (has_table_privilege(oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
          OR has_any_column_privilege(oid,'INSERT,UPDATE,REFERENCES'))) AS writable
      FROM pg_roles r WHERE rolname=current_user`

export async function readLocal<T>(principal: Principal, read: (client: Pick<Client, "query">) => Promise<T>): Promise<T> {
  if (process.env.SENTINELA_PERSISTENT_HOMOLOGATION !== "1") return readOperational(principal, read)
  if (principal.source !== "local") throw new DatabaseUnavailable()
  const config = persistentReadConfig(principal.role)
  const { Client } = await import("pg")
  const client = new Client({ ...config, ssl: false, connectionTimeoutMillis: 3000, statement_timeout: 5000,
    query_timeout: 7000, lock_timeout: 1000, idle_in_transaction_session_timeout: 10000,
    application_name: "sentinela-homologacao-read", options: "-c default_transaction_read_only=on", client_encoding: "UTF8" })
  client.on("error", () => { /* Never expose connection errors or credentials. */ })
  try {
    await client.connect()
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const { rows: [identity] } = await client.query(persistentIdentitySql)
    assertPersistentIdentity(identity, config.user)
    const result = await read(client)
    await client.query("COMMIT")
    return result
  } catch {
    throw new DatabaseUnavailable()
  } finally {
    // Closing this dedicated session also rolls back an incomplete transaction.
    await client.end().catch(() => {})
  }
}
