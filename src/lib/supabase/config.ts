// Only public project configuration. Never import an administrative key here.
export function publicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key || !key.startsWith("sb_publishable_")) return null
  try {
    const parsed = new URL(url)
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") return null
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))) return null
    return { url: parsed.origin, key }
  } catch { return null }
}
