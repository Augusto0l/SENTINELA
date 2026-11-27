import "server-only"
import { hasPermission, type Principal } from "@/lib/auth/policy"
import { DatabaseUnavailable } from "@/lib/db/config"
import { readLocal } from "@/lib/db/persistent-read"
import { occurrenceSql } from "@/lib/db/occurrence-query"
import { persistentListDataSchema, type PersistentQuery } from "@/contracts/persistent-occurrences"

export function queryOccurrences(principal: Principal, query: PersistentQuery, id?: string) {
  if (principal.source !== "local" || !hasPermission(principal.role, "analisar")) throw new DatabaseUnavailable()
  return readLocal(principal, async client => {
    const result = await client.query(occurrenceSql(query, id))
    const total = Number(result.rows[0].total)
    return persistentListDataSchema.parse({ items: result.rows[0].items,
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } })
  })
}
