import "server-only"
import { localSelected } from "@/lib/auth/local-provider"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { publicSupabaseConfig } from "@/lib/supabase/config"

export default async function createServerSupabaseClient({ writable = false }: { writable?: boolean } = {}) {
  if (localSelected()) return null
  const config = publicSupabaseConfig()
  if (!config) return null
  const store = await cookies()
  return createServerClient(config.url, config.key, {
    cookieOptions: { sameSite: "lax", secure: process.env.NODE_ENV === "production" },
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try { for (const { name, value, options } of values) store.set(name, value, options) }
        catch (error) {
          if (writable) throw error
          // Server Components cannot write cookies. Proxy refreshes them before rendering.
          // Route Handlers can write and must return the resulting session cookies.
        }
      },
    },
    global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }) },
  })
}
