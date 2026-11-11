// Pure validation; the pool and all credential consumers are server-only.
export class DatabaseUnavailable extends Error {
  constructor() { super("Banco de leitura indisponível.") }
}
export function operationalConfig(env: NodeJS.ProcessEnv = process.env) {
  try {
    if (env.NODE_ENV !== "development" || env.SENTINELA_AUTH_PROVIDER !== "local" || env.SENTINELA_LOCAL_BIND !== "127.0.0.1") throw Error()
    const raw = env.SENTINELA_LOCAL_READER_URL
    if (!raw || !/^postgres(?:ql)?:\/\/sentinela_local_reader:[^@/?#\s]+@127\.0\.0\.1:5432\/sentinela_dev_operacional$/.test(raw)) throw Error()
    const u = new URL(raw)
    // Do not pass a connectionString to pg: reject options, service and host overrides.
    if (!["postgres:", "postgresql:"].includes(u.protocol) || u.hostname !== "127.0.0.1" || u.port !== "5432"
      || u.pathname !== "/sentinela_dev_operacional" || decodeURIComponent(u.username) !== "sentinela_local_reader"
      || !u.password || u.search || u.hash || raw !== raw.trim()) throw Error()
    const password = decodeURIComponent(u.password)
    if (/[\r\n\0]/.test(password)) throw Error()
    return { host: "127.0.0.1", port: 5432, database: "sentinela_dev_operacional", user: "sentinela_local_reader", password }
  } catch { throw new DatabaseUnavailable() }
}
