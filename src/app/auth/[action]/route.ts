import { localSelected } from "@/lib/auth/local-provider"
import { localPost } from "@/lib/auth/local-handler"
import { authPost, confirmAuth, trustedOrigin, type AuthAction } from "@/lib/auth/core"
import authGateway from "@/lib/auth/gateway"
import createServerSupabaseClient from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
const actions = new Set<AuthAction>(["login", "logout", "recuperar", "senha"])

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params
  if (!actions.has(action as AuthAction)) return new Response(null, { status: 404 })
  if (localSelected()) return localPost(action, request)
  const origin = trustedOrigin(process.env.SENTINELA_APP_ORIGIN)
  const client = await createServerSupabaseClient({ writable: true })
  if (!origin || !client) return Response.json({ error: "Autenticação indisponível neste ambiente." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  return authPost(action as AuthAction, request, origin, authGateway(client))
}

export async function GET(request: Request, context: { params: Promise<{ action: string }> }) {
  if (localSelected()) return new Response(null, { status: 403 })
  if ((await context.params).action !== "confirm") return new Response(null, { status: 405, headers: { Allow: "POST" } })
  const origin = trustedOrigin(process.env.SENTINELA_APP_ORIGIN)
  const client = await createServerSupabaseClient({ writable: true })
  if (!origin || !client) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } })
  return confirmAuth(request, origin, authGateway(client))
}
