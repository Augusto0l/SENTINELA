// Compatibility adapter: authorization rules live in the shared policy.
import { ROLES, hasPermission, canVisit as visit, type Role } from "@/lib/auth/policy"
export const DEMO_ROLES = ROLES
export type DemoRole = Role
export const canWrite = (role: Role) => hasPermission(role, "cadastrar")
export const canInactivate = (role: Role) => hasPermission(role, "inativar")
export const canVisit = visit
