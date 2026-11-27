// Pure validation; the pool and all credential consumers are server-only.
export class DatabaseUnavailable extends Error {
  constructor() { super("Banco de leitura indisponível.") }
}

export const persistentReaders = {
  Administrador: "sprint4_homolog_admin_read",
  Operador: "sprint4_homolog_operator_read",
  Analista: "sprint4_homolog_analyst_read",
} as const

export const persistentWriters = {
  Administrador: { login: "s4_hom_admin_write", subject: "80400000-0000-4000-8000-000000000001" },
  Operador: { login: "s4_hom_operator_write", subject: "80400000-0000-4000-8000-000000000002" },
} as const

export function persistentCrudEnabled(env = process.env) {
  return env.NODE_ENV === "development" && env.SENTINELA_AUTH_PROVIDER === "local"
    && env.SENTINELA_LOCAL_BIND === "127.0.0.1" && env.SENTINELA_PERSISTENT_HOMOLOGATION === "1"
    && env.SENTINELA_PERSISTENT_CRUD === "1" && !env.VERCEL && !env.VERCEL_ENV
}

export function persistentPcdfEnabled(env = process.env) {
  return persistentCrudEnabled(env) && env.SENTINELA_PERSISTENT_PCDF === "1"
}

export function persistentPcdfCompletionEnabled(env = process.env) {
  return persistentPcdfEnabled(env) && env.SENTINELA_PERSISTENT_PCDF_COMPLETION === "1"
}

export const persistentDestination = {
  host: "127.0.0.1",
  port: 55473,
  database: "sentinela_sprint4_homologacao",
  cluster: "sentinela-sprint4-homologacao",
  system: "7709847064550752852",
  version: "170011",
  postgis: "3.6.2",
} as const

export function persistentReadConfig(role: keyof typeof persistentReaders, env = process.env) {
  if (env.SENTINELA_PERSISTENT_HOMOLOGATION !== "1" || env.NODE_ENV !== "development"
    || env.SENTINELA_AUTH_PROVIDER !== "local" || env.SENTINELA_LOCAL_BIND !== persistentDestination.host
    || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(env.SENTINELA_APP_ORIGIN ?? "")
    || env.VERCEL || env.VERCEL_ENV || env.SENTINELA_SANDBOX_WRITE === "1"
    || env.SENTINELA_LOCAL_READER_URL || env.SENTINELA_DATABASE_URL
    || env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY) {
    throw new DatabaseUnavailable()
  }
  const user = persistentReaders[role]
  const password = env[`SENTINELA_PERSISTENT_PASSWORD_${user}`]
  if (!user || !password || !/^[a-f0-9]{64}$/.test(password)) throw new DatabaseUnavailable()
  const { host, port, database } = persistentDestination
  return { host, port, database, user, password }
}

export function assertPersistentIdentity(identity: Record<string, unknown> | undefined, user: string, readonly = "on") {
  const { host, port, database, cluster, system, version, postgis } = persistentDestination
  if (!identity || identity.host !== host || identity.port !== port || identity.db !== database
    || identity.listen !== host || identity.cluster !== cluster || identity.system !== system
    || identity.version !== version || identity.postgis !== postgis || identity.login !== user || identity.role !== user
    || identity.elevated !== false || identity.member !== false || identity.owner !== false
    || identity.rls !== 19 || identity.readonly !== readonly || identity.writable !== false) {
    throw new DatabaseUnavailable()
  }
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
