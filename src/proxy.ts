import { localSelected, localAllowed, localSession, LOCAL_COOKIE } from "@/lib/auth/local-provider"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { publicSupabaseConfig } from "@/lib/supabase/config"
import { hasPermission, isProtectedPath, routePermission } from "@/lib/auth/policy"
import { localDemoEnabled } from "@/lib/auth/local-demo"
import { apiError, isLocalReadEndpoint } from "@/lib/db/http"
import { isolatedWriteMode, isIsolatedMutation, isolatedPcdfMode, isPcdfEndpoint, generalImportMode, isGeneralImportEndpoint } from "@/lib/db/isolated-write-mode"
import { persistentCrudEnabled, persistentPcdfEnabled } from "@/lib/db/config"
import { directPcdfMode, expectsIntegratedImport, integratedImportMode, isDirectPcdfEndpoint, isIntegratedGeneralEndpoint } from "@/lib/db/pcdf-direct-mode"
import { localImportStartupMessage } from "@/contracts/pcdf-direct"
import { manualOccurrencesPath } from "@/contracts/manual-occurrences"
import { managementPath, managementWriteBlocked } from "@/contracts/occurrence-management"
import { occurrenceManagementMode, operationalOccurrenceManagementMode } from "@/lib/db/occurrence-management-mode"
import { onboardingPhase } from "@/lib/auth/onboarding"

export async function proxy(request: NextRequest) {
  const config = publicSupabaseConfig()
  let response = NextResponse.next({ request })
  const refreshed = new Map<string, { value: string; options: CookieOptions }>()
  const noStore = (result: NextResponse) => {
    result.headers.set("Cache-Control", "private, no-store")
    result.headers.set("Pragma", "no-cache")
    result.headers.set("Expires", "0")
    // Native password updates need their same-origin POST to retain the Origin header.
    result.headers.set("Referrer-Policy", request.nextUrl.pathname === "/atualizar-senha" ? "same-origin" : "no-referrer")
    for (const [name, cookie] of refreshed) result.cookies.set(name, cookie.value, cookie.options)
    return result
  }
  if (localSelected()) {
    const principal = await localSession(request.cookies.get(LOCAL_COOKIE)?.value, request.headers.get("host"))
    if (request.nextUrl.pathname.startsWith("/api/")) {
      const { pathname } = request.nextUrl
      const { method } = request
      const managementWrite = pathname === managementPath && method === "POST"
      if (managementWrite && !occurrenceManagementMode()
        && !(operationalOccurrenceManagementMode() && principal?.role === "Administrador" && principal.localSubject))
        return apiError("FORBIDDEN", managementWriteBlocked)
      const manualCreate = pathname === manualOccurrencesPath && method === "POST" && Boolean(occurrenceManagementMode())
      const manualSearch = pathname === "/api/ocorrencias/geocode" && method === "POST"
        && (Boolean(directPcdfMode()) || expectsIntegratedImport())
      const isolatedMutation = (isolatedWriteMode() || persistentCrudEnabled()) && isIsolatedMutation(pathname, method)
      const pcdf = (isolatedPcdfMode() || persistentPcdfEnabled()) && isPcdfEndpoint(pathname, method)
      const generalEndpoint = isIntegratedGeneralEndpoint(pathname, method)
      const directEndpoint = isDirectPcdfEndpoint(pathname, method)
      const integrated = integratedImportMode()
      const general = (generalImportMode() && isGeneralImportEndpoint(pathname, method))
        || (integrated && generalEndpoint)
      const directPcdf = directPcdfMode() && directEndpoint
      const setupRequired = !integrated && (generalEndpoint || directEndpoint) && expectsIntegratedImport()
      if (!setupRequired && !isolatedMutation && !pcdf && !general && !directPcdf && !manualCreate && !managementWrite && !manualSearch && !isLocalReadEndpoint(pathname, method)) return noStore(NextResponse.json({ error: "Acesso local sem acesso remoto." }, { status: 403 }))
      if (!principal) return apiError("UNAUTHORIZED", "Sessão necessária.")
      if (setupRequired) {
        if (!hasPermission(principal.role, "importar")
          || (method === "POST" && request.headers.get("origin") !== process.env.SENTINELA_APP_ORIGIN)) {
          return apiError("FORBIDDEN", "Importação não autorizada.")
        }
        return apiError("SERVICE_UNAVAILABLE", localImportStartupMessage)
      }
      if (!hasPermission(principal.role, "analisar")) return apiError("FORBIDDEN", "Consulta não autorizada.")
      return noStore(response)
    }
    if (isProtectedPath(request.nextUrl.pathname) && !principal) return noStore(NextResponse.redirect(new URL("/login?erro=sessao", process.env.SENTINELA_APP_ORIGIN && localAllowed(request.headers.get("host")) ? process.env.SENTINELA_APP_ORIGIN : request.url)))
    if (principal && isProtectedPath(request.nextUrl.pathname) && !hasPermission(principal.role, routePermission(request.nextUrl.pathname))) {
      return noStore(NextResponse.redirect(new URL("/acesso-negado", process.env.SENTINELA_APP_ORIGIN)))
    }
    return noStore(response)
  }
  let valid = false
  let onboarding: ReturnType<typeof onboardingPhase>
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
      if (valid) onboarding = onboardingPhase(data?.claims.app_metadata)
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
  if (isProtectedPath(request.nextUrl.pathname) && onboarding) {
    const path = onboarding === "password" ? "/atualizar-senha" : "/acesso-pendente"
    if (request.nextUrl.pathname.startsWith("/api/"))
      return noStore(NextResponse.json({ error: "Conclua o primeiro acesso ao SENTINELA." }, { status: 403 }))
    return noStore(NextResponse.redirect(new URL(path, request.url)))
  }
  return noStore(response)
}

export const config = {
  matcher: ["/dashboard/:path*", "/mapa-criminal/:path*", "/ocorrencias/:path*", "/importar/:path*", "/usuarios/:path*", "/configuracoes/:path*", "/central-revisao/:path*", "/api/:path*", "/auth/:path*", "/atualizar-senha", "/acesso-pendente", "/acesso-negado"],
}
