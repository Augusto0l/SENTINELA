import "server-only"
import { join } from "node:path"
import { Client } from "pg"
import { attestManifest } from "../../../database/local/write-sandbox/service.ts"
import { isolatedWriteMode } from "./isolated-write-mode"

export interface IsolatedOccurrence {
  id: string
  versao: string
  ativo: boolean
  elegivel: boolean
  local: string | null
  endereco: string | null
  bairro: string | null
  data: string | null
  horario: string | null
  ra: string | null
  latitude: number | null
  longitude: number | null
  naturezas: { naturezaId: string; crimeTentado: boolean | null }[]
}

export async function readIsolatedOccurrences(): Promise<IsolatedOccurrence[]> {
  const mode = isolatedWriteMode()
  const password = process.env.SENTINELA_SANDBOX_ANALYST_PASSWORD
  if (!mode || !password) throw Error("Leitura isolada indisponível.")
  const manifest = await attestManifest({ manifest: join(mode.root, "manifest.json"), expectedUUID: mode.id,
    credentials: { Administrador: { user: "", password: "" }, Operador: { user: "", password: "" } } })
  const client = new Client({ host: "127.0.0.1", port: 55432, database: "sentinela_rls_sandbox", user: "sentinela_sbx_analyst",
    password, ssl: false, connectionTimeoutMillis: 3000, statement_timeout: 5000, query_timeout: 7000 })
  try {
    await client.connect()
    await client.query("BEGIN READ ONLY")
    const {rows: [identity]} = await client.query(`SELECT current_database() db,session_user login,
      host(inet_server_addr()) host,inet_server_port() port,current_setting('sentinela.sandbox_uuid',true) uuid,
      (SELECT system_identifier::text FROM pg_control_system()) system
      FROM pg_roles WHERE rolname=current_user AND NOT rolsuper AND NOT rolbypassrls`)
    if (identity?.db !== "sentinela_rls_sandbox" || identity.login !== "sentinela_sbx_analyst"
      || identity.host !== "127.0.0.1" || identity.port !== 55432 || identity.uuid !== mode.id || identity.system !== manifest.system_id) {
      throw Error("Destino de leitura recusado.")
    }
    const { rows } = await client.query<{ data: IsolatedOccurrence }>("SELECT sentinela_write_lab.list_workspace() AS data")
    await client.query("COMMIT")
    return rows.map(row => row.data)
  } finally {
    await client.end().catch(() => {})
  }
}
