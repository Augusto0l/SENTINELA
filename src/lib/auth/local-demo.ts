// Opt-in preview only. Never grants an Auth identity or API/data access.
export function localDemoEnabled(host: string | null, env = process.env): boolean {
  if (env.NODE_ENV !== "development" || env.SENTINELA_LOCAL_DEMO !== "1") return false
  if (env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return false
  if (!host) return false
  try {
    const url = new URL(`http://${host}`)
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.host === host
  } catch { return false }
}
