export const DEMO_ROLES = ["Administrador", "Operador", "Analista"] as const
export type DemoRole = typeof DEMO_ROLES[number]
export function canWrite(role: DemoRole) {
  return role !== "Analista"
}
export function canInactivate(role: DemoRole) {
  return role === "Administrador"
}
export function canVisit(role: DemoRole, path: string) {
  if (path === "/usuarios" || path.startsWith("/usuarios/"))
    return role === "Administrador"
  if (
    path === "/importar" ||
    path.startsWith("/importar/") ||
    path.startsWith("/ocorrencias/nova")
  )
    return canWrite(role)
  return true
}
