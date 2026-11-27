import "server-only"
import type { Principal } from "@/lib/auth/policy"
import { hasPermission } from "@/lib/auth/policy"
import { DatabaseUnavailable } from "@/lib/db/config"
import { readLocal } from "@/lib/db/persistent-read"
import { catalogSql } from "@/lib/db/catalog-query"
import { catalogDataSchemas, type CatalogKind, type NatureCatalogQuery } from "@/contracts/persistent-catalogs"

export function queryCatalog(principal: Principal, kind: CatalogKind, query?: NatureCatalogQuery) {
  if (principal.source !== "local" || !hasPermission(principal.role, "analisar")) throw new DatabaseUnavailable()
  return readLocal(principal, async client => {
    const result = await client.query(catalogSql(kind, query))
    return catalogDataSchemas[kind].parse({ items: result.rows })
  })
}
