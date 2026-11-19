import { z } from "zod"
import { successSchema } from "@/contracts/common"

export const CATALOG_PATHS = {
  regioes: "/api/v1/catalogos/regioes-administrativas",
  naturezas: "/api/v1/catalogos/naturezas-criminais",
} as const
export type CatalogKind = keyof typeof CATALOG_PATHS
export const natureCatalogQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(120).refine(value => !value.includes("\0")).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
})
export type NatureCatalogQuery = z.infer<typeof natureCatalogQuerySchema>

export function parseCatalogQuery(kind: CatalogKind, params: URLSearchParams): NatureCatalogQuery {
  const entries = [...params]
  if ((kind === "regioes" && entries.length) || new Set(params.keys()).size !== entries.length) {
    throw new Error("Parâmetros de catálogo inválidos.")
  }
  return natureCatalogQuerySchema.parse(Object.fromEntries(entries))
}
export const regionCatalogItemSchema = z.strictObject({ id: z.uuid(), nome: z.string().min(1) })
export const natureCatalogItemSchema = z.strictObject({ id: z.uuid(), descricao: z.string().min(1) })
const uniqueIds = (items: {id: string}[]) => new Set(items.map(item => item.id)).size === items.length
export const regionCatalogDataSchema = z.strictObject({ items: z.array(regionCatalogItemSchema).refine(uniqueIds, "UUID duplicado.") })
export const natureCatalogDataSchema = z.strictObject({ items: z.array(natureCatalogItemSchema).refine(uniqueIds, "UUID duplicado.") })
export const regionCatalogResponseSchema = successSchema(regionCatalogDataSchema)
export const natureCatalogResponseSchema = successSchema(natureCatalogDataSchema)
export const catalogDataSchemas = { regioes: regionCatalogDataSchema, naturezas: natureCatalogDataSchema }
export const catalogResponseSchemas = { regioes: regionCatalogResponseSchema, naturezas: natureCatalogResponseSchema }
export type CatalogData = z.infer<typeof regionCatalogDataSchema> | z.infer<typeof natureCatalogDataSchema>
