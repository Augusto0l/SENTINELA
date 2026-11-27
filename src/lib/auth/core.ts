import { ROLES, type Principal } from "@/lib/auth/policy"
import { strongInstitutionalPassword } from "@/lib/auth/onboarding"

export interface AuthGateway {
  identity(): Promise<{ id: string; onboarding?: "provisioning" | "password" } | null>
  access(): Promise<unknown>
  login(email: string, password: string): Promise<boolean>
  logout(): Promise<boolean>
  recover(email: string, redirectTo: string): Promise<void>
  updatePassword(password: string): Promise<boolean>
  exchange(code: string): Promise<boolean>
  verify(tokenHash: string, type: "recovery" | "invite"): Promise<boolean>
}
export type AccessResult = { status: "allowed"; principal: Principal } | { status: "unauthenticated" | "unlinked" | "unavailable" | "first_password" }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function resolveAccess(gateway: AuthGateway): Promise<AccessResult> {
  try {
    const identity = await gateway.identity()
    if (!identity || !uuid.test(identity.id)) return { status: "unauthenticated" }
    if (identity.onboarding === "provisioning") return { status: "unlinked" }
    if (identity.onboarding === "password") return { status: "first_password" }
    const rows = await gateway.access()
    if (!Array.isArray(rows) || rows.length !== 1) return { status: "unlinked" }
    const row = rows[0]
    if (!row || !uuid.test(row.usuario_id) || row.auth_user_id !== identity.id || row.ativo !== true ||
        !ROLES.includes(row.perfil) || typeof row.nome_exibicao !== "string" || !row.nome_exibicao.trim()) {
      return { status: "unlinked" }
    }
    return { status: "allowed", principal: { source: "supabase", id: row.usuario_id, authUserId: identity.id, name: row.nome_exibicao, role: row.perfil } }
  } catch {
    return { status: "unavailable" }
  }
}

export type AuthAction = "login" | "logout" | "recuperar" | "senha"
const messages: Record<string, string> = {
  local_reinicio: "Para ativar o acesso local, encerre o servidor deste projeto e execute pnpm dev:next. A conexão deve ficar restrita ao loopback.",
  configuracao: "Autenticação indisponível neste ambiente. Contate a administração.",
  credenciais: "Não foi possível entrar. Verifique suas credenciais e tente novamente.",
  acesso: "Sua conta ainda não possui acesso ativo ao SENTINELA.",
  sessao: "A sessão é inválida ou expirou. Entre novamente.",
  senha: "Use uma senha de 12 a 72 caracteres e confirme o mesmo valor.",
  primeira_senha: "Use de 16 a 72 bytes, com letras maiúsculas, minúsculas, número e símbolo. Escolha uma senha diferente da inicial.",
  falha: "Não foi possível concluir a operação. Tente novamente.",
  link: "O link é inválido ou expirou. Solicite um novo link.",
}
export function authMessage(code: string | undefined): string | undefined { return code ? messages[code] : undefined }

export function trustedOrigin(origin: string | undefined): string | null {
  try {
    const url = new URL(origin ?? "")
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) return null
    return url.origin
  } catch { return null }
}

function redirect(origin: string, path: string): Response {
  return new Response(null, { status: 303, headers: { Location: `${origin}${path}`, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } })
}

export async function authPost(action: AuthAction, request: Request, origin: string, gateway: AuthGateway): Promise<Response> {
  // Compare with configured origin, not forwarded/Host headers. No caller-controlled redirects.
  if (trustedOrigin(origin) !== origin || new URL(request.url).origin !== origin || request.headers.get("origin") !== origin) {
    return Response.json({ error: "Origem não autorizada." }, { status: 403, headers: { "Cache-Control": "no-store" } })
  }
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
    return Response.json({ error: "Formato inválido." }, { status: 415 })
  }
  if (Number(request.headers.get("content-length") ?? 0) > 8192) return new Response(null, { status: 413 })
  try {
    const body = await request.text()
    if (new TextEncoder().encode(body).length > 8192) return new Response(null, { status: 413 })
    const fields = new URLSearchParams(body)
    if (action === "logout") {
      return redirect(origin, await gateway.logout() ? "/login?estado=saiu" : "/acesso-pendente?erro=falha")
    }
    if (action === "senha") {
      const identity = await gateway.identity()
      if (!identity) return redirect(origin, "/login?erro=sessao")
      if (identity.onboarding === "provisioning") return redirect(origin, "/acesso-pendente")
      const password = fields.get("password") ?? ""
      if (identity.onboarding === "password" && (!strongInstitutionalPassword(password) || password !== fields.get("confirmation")))
        return redirect(origin, "/atualizar-senha?erro=primeira_senha")
      if (password.length < 12 || password.length > 72 || new TextEncoder().encode(password).length > 72 || password !== fields.get("confirmation")) {
        return redirect(origin, "/atualizar-senha?erro=senha")
      }
      if (!(await gateway.updatePassword(password))) return redirect(origin, "/atualizar-senha?erro=falha")
      // Invalidate refresh sessions; don't promise immediate revocation of previously issued access JWTs.
      if (!(await gateway.logout())) return redirect(origin, "/acesso-pendente?erro=falha")
      return redirect(origin, "/login?estado=senha")
    }
    const email = (fields.get("email") ?? "").trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return redirect(origin, action === "recuperar" ? "/recuperar-senha?estado=enviado" : "/login?erro=credenciais")
    }
    if (action === "recuperar") {
      // Same response even for unknown users or provider failures: don't enumerate accounts.
      try { await gateway.recover(email, `${origin}/auth/confirm`) } catch { /* generic response below */ }
      return redirect(origin, "/recuperar-senha?estado=enviado")
    }
    const password = fields.get("password") ?? ""
    if (!password || password.length > 1024 || !(await gateway.login(email, password))) return redirect(origin, "/login?erro=credenciais")
    const access = await resolveAccess(gateway)
    if (access.status === "allowed") return redirect(origin, "/dashboard")
    if (access.status === "first_password") return redirect(origin, "/atualizar-senha")
    return redirect(origin, access.status === "unauthenticated" ? "/login?erro=sessao" : "/acesso-pendente")
  } catch {
    return redirect(origin, action === "recuperar" ? "/recuperar-senha?estado=enviado" : "/login?erro=falha")
  }
}

export async function confirmAuth(request: Request, origin: string, gateway: AuthGateway): Promise<Response> {
  const url = new URL(request.url)
  if (trustedOrigin(origin) !== origin || url.origin !== origin) return new Response(null, { status: 403 })
  try {
    const token = url.searchParams.get("token_hash")
    const type = url.searchParams.get("type")
    const code = url.searchParams.get("code")
    const valid = token && token.length <= 2048 && (type === "recovery" || type === "invite")
      ? await gateway.verify(token, type)
      : !token && code && code.length <= 2048 ? await gateway.exchange(code) : false
    return redirect(origin, valid ? "/atualizar-senha" : "/recuperar-senha?erro=link")
  } catch { return redirect(origin, "/recuperar-senha?erro=link") }
}
