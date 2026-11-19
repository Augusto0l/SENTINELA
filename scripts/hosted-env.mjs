// Hosted builds must never carry development accounts or maintenance credentials.
export function assertHostedEnvironment(env = process.env) {
  if (env.VERCEL !== "1" && !["preview", "production"].includes(env.VERCEL_ENV)) return
  const localOnly = [
    "SENTINELA_LOCAL_BIND", "SENTINELA_LOCAL_ACCOUNTS_FILE", "SENTINELA_LOCAL_READER_URL",
    "SENTINELA_PERSISTENT_HOMOLOGATION", "SENTINELA_PERSISTENT_PASSWORD_sprint4_homolog_admin_read",
    "SENTINELA_PERSISTENT_PASSWORD_sprint4_homolog_operator_read", "SENTINELA_PERSISTENT_PASSWORD_sprint4_homolog_analyst_read",
    "SENTINELA_PERSISTENT_CRUD", "SENTINELA_PERSISTENT_PASSWORD_s4_hom_admin_write", "SENTINELA_PERSISTENT_PASSWORD_s4_hom_operator_write",
    "SENTINELA_PERSISTENT_PCDF", "SENTINELA_PERSISTENT_PCDF_COMPLETION",
    "SENTINELA_SANDBOX_WRITE", "SENTINELA_SANDBOX_WRITE_ID", "SENTINELA_SANDBOX_PCDF", "SENTINELA_SANDBOX_ADMIN_PASSWORD", "SENTINELA_SANDBOX_OPERATOR_PASSWORD", "SENTINELA_SANDBOX_ANALYST_PASSWORD",
    "SENTINELA_DATABASE_URL", "SENTINELA_DATABASE_SSLROOTCERT",
    "SENTINELA_RA_MAINTENANCE_PASSWORD", "SENTINELA_LOCAL_BACKUP_PASSWORD",
    "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "PGPASSWORD", "PGPASSFILE",
  ]
  const invalid = localOnly.filter(name => Boolean(env[name]))
  if (env.SENTINELA_AUTH_PROVIDER === "local") invalid.push("SENTINELA_AUTH_PROVIDER")
  if (env.SENTINELA_LOCAL_DEMO === "1") invalid.push("SENTINELA_LOCAL_DEMO")
  if (invalid.length) throw new Error(`Configuração incompatível com hospedagem: ${invalid.join(", ")}.`)
}
