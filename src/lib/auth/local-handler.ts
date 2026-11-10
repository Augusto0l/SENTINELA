import "server-only"
import { LOCAL_COOKIE, LOCAL_TTL, localAllowed, localLogin, localLogout } from "@/lib/auth/local-provider"

export async function localPost(action: string, request: Request) {
  const origin = process.env.SENTINELA_APP_ORIGIN
  const baseHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }
  // Next normalizes the internal request URL to localhost even for a 127.0.0.1 listener.
  // Match the actual Host and Origin against the configured loopback origin instead.
  if (!localAllowed(request.headers.get("host")) || request.headers.get("origin") !== origin) {
    return new Response(null, { status: 403, headers: baseHeaders })
  }
  if (action !== "login" && action !== "logout") return new Response(null, { status: 403, headers: baseHeaders })
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return new Response(null, { status: 415, headers: baseHeaders })
  if (Number(request.headers.get("content-length") ?? 0) > 8192) return new Response(null, { status: 413, headers: baseHeaders })
  try {
    const body = await request.text()
    if (Buffer.byteLength(body) > 8192) return new Response(null, { status: 413, headers: baseHeaders })
    const previous = request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(`${LOCAL_COOKIE}=`))?.slice(LOCAL_COOKIE.length + 1)
    const fields = new URLSearchParams(body)
    const token = action === "login" ? await localLogin(fields.get("email") ?? "", fields.get("password") ?? "", request.headers.get("host")) : null
    if (action === "logout" || token) await localLogout(previous)
    const path = action === "logout" ? "/login?estado=saiu" : token ? "/dashboard" : "/login?erro=credenciais"
    const response = new Response(null, { status: 303, headers: { ...baseHeaders, Location: `${origin}${path}` } })
    if (action === "logout" || token) response.headers.set("Set-Cookie", `${LOCAL_COOKIE}=${token ?? ""}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? LOCAL_TTL : 0}`)
    return response
  } catch {
    return new Response(null, { status: 503, headers: baseHeaders })
  }
}
