import "server-only"
import { localSelected } from "@/lib/auth/local-provider"
import { getLocalPrincipal } from "@/lib/auth/local-server"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import createServerSupabaseClient from "@/lib/supabase/server"
import authGateway from "@/lib/auth/gateway"
import { resolveAccess } from "@/lib/auth/core"
import { hasPermission, type Permission } from "@/lib/auth/policy"

export async function getAccess() {
  await connection()
  if (localSelected()) {
    const principal = await getLocalPrincipal()
    return principal ? { status: "allowed", principal } as const : { status: "unauthenticated" } as const
  }
  const client = await createServerSupabaseClient()
  if (!client) return { status: "unavailable" } as const
  return resolveAccess(authGateway(client))
}

export async function requirePrincipal(permission?: Permission) {
  const access = await getAccess()
  if (access.status === "unauthenticated") redirect("/login?erro=sessao")
  if (access.status === "unavailable") redirect("/login?erro=configuracao")
  if (access.status === "unlinked") redirect("/acesso-pendente")
  if (access.status !== "allowed") redirect("/login?erro=sessao")
  if (permission && !hasPermission(access.principal.role, permission)) redirect("/acesso-negado")
  return access.principal
}

export async function requireIdentity() {
  if (localSelected()) redirect("/login?erro=configuracao")
  await connection()
  const client = await createServerSupabaseClient()
  if (!client) redirect("/login?erro=configuracao")
  try {
    const identity = await authGateway(client).identity()
    if (identity) return identity
  } catch { /* fail closed */ }
  redirect("/login?erro=sessao")
}
