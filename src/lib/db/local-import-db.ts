import "server-only";
import { Client } from "pg";
import { directHash } from "@/contracts/pcdf-direct";
import { directDatabase, directDatabasePort, directPcdfMode } from "@/lib/db/pcdf-direct-mode";

const roles = {
  Administrador: { login: "sentinela_local_admin", actor: "7d5a25df-d61a-43ae-9f09-7be430855aad" },
  Operador: { login: "sentinela_local_operator", actor: "6ca6f86c-56da-4af8-8249-3291fb263c52" },
};

export class LocalImportDbError extends Error {
  constructor(readonly status: 403 | 503) { super("PostgreSQL local de importação indisponível."); }
}

export function localImportConnection(role: keyof typeof roles) {
  const { login, actor } = roles[role];
  const password = process.env["SENTINELA_PCDF_LOCAL_PASSWORD_" + login];
  if (!directHash.safeParse(password).success) throw new LocalImportDbError(503);
  const client = new Client({ host: "127.0.0.1", port: directDatabasePort, database: directDatabase,
    user: login, password, ssl: false, connectionTimeoutMillis: 3000, statement_timeout: 60000, query_timeout: 65000 });
  return { client, login, actor };
}

export async function attestLocalImportDatabase(client: Client, user: string, mode: NonNullable<ReturnType<typeof directPcdfMode>>, role: string) {
  try { await client.connect(); } catch { throw new LocalImportDbError(503); }
  const { rows: [identity] } = await client.query<{ role: string }>(
    "SELECT sentinela_pcdf_local.preflight() AS role FROM pg_roles r " +
    "WHERE r.rolname=current_user AND current_user=$1 AND session_user=$1 " +
    "AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolinherit) " +
    "AND NOT EXISTS (SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) " +
    "AND NOT EXISTS (SELECT FROM pg_class WHERE relowner=r.oid) " +
    "AND current_database()=$2 AND host(inet_server_addr())='127.0.0.1' AND inet_server_port()=$3 " +
    "AND current_setting('server_version_num')='170011' AND current_setting('sentinela.sandbox_uuid',true)=$4 " +
    "AND (SELECT system_identifier::text FROM pg_control_system())=$5 " +
    "AND abs(extract(epoch FROM pg_postmaster_start_time())::bigint-$6::bigint)<=2",
    [user, directDatabase, directDatabasePort, mode.id, mode.system, mode.epoch],
  );
  if (identity?.role !== role) throw new LocalImportDbError(403);
}
