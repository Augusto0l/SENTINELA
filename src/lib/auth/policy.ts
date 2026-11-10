export const ROLES = ["Administrador", "Operador", "Analista"] as const
export type Role = typeof ROLES[number]
export type Permission = "analisar" | "consultar_central" | "cadastrar" | "importar" | "administrar" | "corrigir"
export interface Principal {
  id: string
  authUserId: string
  name: string
  role: Role
}

export function hasPermission(role: Role, permission: Permission): boolean {
  if (!ROLES.includes(role)) return false
  if (permission === "analisar" || permission === "consultar_central") return true
  if (permission === "cadastrar" || permission === "importar") return role !== "Analista"
  if (permission === "administrar" || permission === "corrigir") return role === "Administrador"
  return false
}

export function routePermission(pathname: string): Permission {
  if (pathname === "/usuarios" || pathname.startsWith("/usuarios/")) return "administrar"
  if (pathname === "/importar" || pathname.startsWith("/importar/")) return "importar"
  if (pathname === "/ocorrencias/nova" || pathname.startsWith("/ocorrencias/nova/")) return "cadastrar"
  if (pathname === "/central-revisao" || pathname.startsWith("/central-revisao/")) return "consultar_central"
  return "analisar"
}

export function isProtectedPath(pathname: string): boolean {
  return ["/dashboard", "/mapa-criminal", "/ocorrencias", "/importar", "/usuarios", "/configuracoes", "/central-revisao", "/api/ocorrencias"]
    .some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

// Business-data scope is deliberately not approved in this stage. Role alone is insufficient.
export function businessDataEnabled(): boolean { return false }
