import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { publicSupabaseConfig } from "@/lib/supabase/config"
import { isProtectedPath } from "@/lib/auth/policy"
import { localDemoEnabled } from "@/lib/auth/local-demo"

export async function proxy(request: NextRequest) {
  const config = publicSupabaseConfig()
  let response = NextResponse.next({ request })
  const refreshed = new Map<string, { value: string; options: CookieOptions }>()
  const noStore = (result: NextResponse) => {
    result.headers.set("Cache-Control", "private, no-store")
    result.headers.set("Pragma", "no-cache")
    result.headers.set("Expires", "0")
    result.headers.set("Referrer-Policy", "no-referrer")
    for (const [name, cookie] of refreshed) result.cookies.set(name, cookie.value, cookie.options)
    return result
  }
  let valid = false
  if (!request.nextUrl.pathname.startsWith("/api/") && localDemoEnabled(request.headers.get("host"))) {
    return noStore(response)
  }
  if (config) {
    const client = createServerClient(config.url, config.key, {
      cookieOptions: { sameSite: "lax", secure: request.nextUrl.protocol === "https:" },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          for (const { name, value, options } of values) {
            request.cookies.set(name, value)
            refreshed.set(name, { value, options })
          }
          response = NextResponse.next({ request })
        },
      },
    })
    try {
      const { data, error } = await client.auth.getClaims()
      valid = !error && typeof data?.claims.sub === "string"
    } catch { /* invalid/expired/unavailable: deny protected requests */ }
  }
  if (isProtectedPath(request.nextUrl.pathname) && !valid) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return noStore(NextResponse.json({ error: "Sessão necessária." }, { status: 401 }))
    }
    const login = new URL("/login", request.url)
    login.searchParams.set("erro", config ? "sessao" : "configuracao")
    return noStore(NextResponse.redirect(login))
  }
  return noStore(response)
}

export const config = {
  matcher: ["/dashboard/:path*", "/mapa-criminal/:path*", "/ocorrencias/:path*", "/importar/:path*", "/usuarios/:path*", "/configuracoes/:path*", "/central-revisao/:path*", "/api/ocorrencias/:path*", "/auth/:path*", "/atualizar-senha", "/acesso-pendente", "/acesso-negado"],
}
