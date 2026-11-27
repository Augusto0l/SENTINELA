import "server-only"
import { z } from "zod"
import type { OperationalPrincipal } from "@/lib/auth/operational-access"
import { hostedOperationalMode } from "@/lib/db/pcdf-direct-mode"
import { withOperationalDatabase } from "@/lib/db/local-occurrences"

const manualMapPoint = z.strictObject({
  id: z.uuid(),
  raCode: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  status: z.enum(["em_revisao", "consolidada"]),
})
export type ManualMapPoint = z.infer<typeof manualMapPoint>

export function readManualMapPoints(principal: OperationalPrincipal, focus: string | null) {
  if (!hostedOperationalMode() || principal.source !== "supabase"
    || (principal.role !== "Administrador" && principal.role !== "Operador")) return Promise.resolve([])
  return withOperationalDatabase(principal, true, async client => {
    const { rows: [check] } = await client.query(`SELECT coalesce(has_function_privilege(
      to_regprocedure('sentinela_ocorrencias_manual.pontos_mapa(uuid)'), 'EXECUTE'), false) AS installed`)
    if (!check?.installed) return []
    const { rows: [row] } = await client.query("SELECT sentinela_ocorrencias_manual.pontos_mapa($1) AS data", [focus])
    return z.array(manualMapPoint).max(250).parse(row?.data)
  })
}
