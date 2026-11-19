export const ROLES = ["Administrador", "Operador", "Analista"] as const
export type Role = typeof ROLES[number]
export type Permission = "analisar" | "consultar_central" | "cadastrar" | "editar" | "inativar" | "importar" | "administrar" | "corrigir"
export const PERMISSION_MATRIX: Readonly<Record<Role, readonly Permission[]>> = {
  Administrador: ["analisar", "consultar_central", "cadastrar", "editar", "inativar", "importar", "administrar", "corrigir"],
  Operador: ["analisar", "consultar_central", "cadastrar", "editar", "inativar", "importar"],
  Analista: ["analisar", "consultar_central"],
}
export const NAVIGATION_ROUTES: Readonly<Record<string, string>> = {
  dashboard: "/dashboard", "crime-map": "/mapa-criminal", occurrences: "/ocorrencias",
  review: "/central-revisao",
  new: "/ocorrencias/nova", import: "/importar", users: "/usuarios", settings: "/configuracoes",
}
export interface Principal {
  source: "local" | "supabase" | "preview"
  id: string
  authUserId: string
  name: string
  role: Role
}

export function hasPermission(role: Role, permission: Permission): boolean {
  if (!ROLES.includes(role)) return false
  return PERMISSION_MATRIX[role].includes(permission)
}

export function routePermission(pathname: string): Permission {
  if (["/usuarios", "/configuracoes"].some(path => pathname === path || pathname.startsWith(path + "/"))) return "administrar"
  if (pathname === "/importar" || pathname.startsWith("/importar/")) return "importar"
  if (pathname === "/ocorrencias/nova" || pathname.startsWith("/ocorrencias/nova/")) return "cadastrar"
  if (pathname === "/central-revisao" || pathname.startsWith("/central-revisao/")) return "consultar_central"
  return "analisar"
}

export function isProtectedPath(pathname: string): boolean {
  return ["/dashboard", "/mapa-criminal", "/ocorrencias", "/importar", "/usuarios", "/configuracoes", "/central-revisao", "/api/ocorrencias", "/api/v1/ocorrencias", "/api/v1/catalogos", "/api/v1/analytics", "/api/v1/importacoes", "/api/v1/central-revisao"]
    .some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

// Business-data scope is deliberately not approved in this stage. Role alone is insufficient.
export function businessDataEnabled(): boolean { return false }

export function canVisit(role: Role, pathname: string): boolean {
  return hasPermission(role, routePermission(pathname))
}
// Functional permission never activates database writes or unimplemented workflows.
export function actionAccess(role: Role, permission: Permission): { allowed: boolean; enabled: boolean; mode: "denied" | "demo" | "read-only" | "unavailable"; reason: string } {
  if (!hasPermission(role, permission)) return { allowed: false, enabled: false, mode: "denied", reason: "Seu perfil não permite esta ação." }
  if (permission === "analisar") return { allowed: true, enabled: true, mode: "read-only", reason: "Consulta somente de leitura, conforme o escopo autorizado." }
  if (permission === "cadastrar" || permission === "importar") return { allowed: true, enabled: true, mode: "demo", reason: "Somente simulação; nenhum dado será gravado no banco." }
  return { allowed: true, enabled: false, mode: "unavailable", reason: "Funcionalidade ainda indisponível; nenhuma alteração persistente está habilitada." }
}
