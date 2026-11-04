"use client"
import { createBrowserClient } from "@supabase/ssr"
import { publicSupabaseConfig } from "@/lib/supabase/config"

export default function createBrowserSupabaseClient() {
  const config = publicSupabaseConfig()
  if (!config) throw new Error("Autenticação não configurada.")
  return createBrowserClient(config.url, config.key, {
    cookieOptions: { sameSite: "lax", secure: location.protocol === "https:" },
  })
}
