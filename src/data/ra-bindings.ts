import { z } from "zod"
import type { RaGeoJSON } from "@/data/geoLoader"
import { CARTOGRAPHY_SHA256, validateTerritory, territorialResult, type TerritorialResult } from "@/data/territorial-validation"
export const IDE_SOURCE = "https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/LIMITES/FeatureServer/1"
export const BINDING_VERSION = "ide-df-bindings-2026-11-13-v1"
export const raBindingSchema = z.strictObject({
  version: z.string().min(1), sourceId: z.url(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  scope: z.enum(["operational", "sandbox"]), extractedOn: z.iso.date(), validFrom: z.iso.date().nullable(), validTo: z.iso.date().nullable(), temporalBasis: z.enum(["extraction-only", "documented-validity"]),
  entries: z.array(z.strictObject({ raId: z.uuid(), catalogName: z.string().min(1), code: z.string().min(1), sourceName: z.string().min(1), sourceObjectId: z.string().min(1),
    status: z.enum(["approved", "pending", "unmapped", "conflict"]), evidence: z.string().min(1) })),
}).superRefine((value, context) => {
  if (new Set(value.entries.map(e => e.raId.toLowerCase())).size !== value.entries.length || new Set(value.entries.map(e => e.code)).size !== value.entries.length)
    context.addIssue({ code: "custom", message: "UUID ou código duplicado nesta versão." })
  if (value.temporalBasis === "extraction-only" && (value.validFrom !== null || value.validTo !== null)) context.addIssue({ code: "custom", message: "Extração não comprova vigência legal." })
  if (value.temporalBasis === "documented-validity" && (!value.validFrom || (value.validTo && value.validTo <= value.validFrom))) context.addIssue({ code: "custom", message: "Vigência inválida." })
})
export type RaBindings = z.infer<typeof raBindingSchema>
export function validateBoundTerritory(geo: RaGeoJSON | null, latitude: unknown, longitude: unknown, raId: unknown,
  input: unknown, scope: RaBindings["scope"] = "operational", version = BINDING_VERSION): TerritorialResult {
  const territorial = validateTerritory(geo, latitude, longitude)
  if (["invalid_coordinate", "cartography_unavailable", "outside_df", "boundary_ambiguous"].includes(territorial.status)) return territorial
  const parsed = raBindingSchema.safeParse(input)
  if (!z.uuid().safeParse(raId).success || !parsed.success) return territorialResult("reference_pending", territorial.matches)
  const mapping = parsed.data
  if (mapping.scope !== scope || mapping.version !== version || mapping.sourceId !== IDE_SOURCE || mapping.sourceHash !== CARTOGRAPHY_SHA256) return territorialResult("reference_pending", territorial.matches)
  const row = mapping.entries.find(e => e.raId.toLowerCase() === String(raId).toLowerCase())
  if (!row || row.status !== "approved") return territorialResult("reference_pending", territorial.matches)
  const feature = geo?.features.find(f => f.properties.ra_codigo === row.code)
  if (!feature || String(feature.properties.objectid) !== row.sourceObjectId) return { ...territorialResult("reference_pending", territorial.matches), message: "Código ou identificador da fonte desconhecido nesta cartografia; referência pendente." }
  return validateTerritory(geo, latitude, longitude, row.code)
}
