// Preparation only: no SQL adapter, route handler or production permission.
import { z } from "zod"
import {
  plannedOccurrenceUpdateSchema,
  plannedOccurrenceInactivationSchema,
} from "../../../src/contracts/planned-occurrence-writes.ts"

// Coordinates cannot be erased through regular editing. References, eligibility
// and the combined record still require transactional SQL validation.
export const sandboxUpdateSchema = plannedOccurrenceUpdateSchema.superRefine((value, ctx) => {
  if (value.alteracoes.coordenadas === null) {
    ctx.addIssue({ code: "custom", path: ["alteracoes", "coordenadas"], message: "Coordenadas não podem ser removidas." })
  }
  const links = value.alteracoes.naturezas
  if (links && new Set(links.map(link => `${link.naturezaId.toLowerCase()}:${link.crimeTentado}`)).size !== links.length) {
    ctx.addIssue({ code: "custom", path: ["alteracoes", "naturezas"], message: "Vínculo duplicado." })
  }
})
export const sandboxEditCommandSchema = z.strictObject({
  id: z.uuid(), payload: sandboxUpdateSchema,
})
export const sandboxInactivationCommandSchema = z.strictObject({
  id: z.uuid(), payload: plannedOccurrenceInactivationSchema,
})

export function sandboxMutationRoleAllowed(role: unknown): boolean {
  return role === "Administrador" || role === "Operador"
}
