import "server-only"
import type { Principal } from "@/lib/auth/policy"
import { readOperational } from "@/lib/db/pool"
import { occurrenceSql } from "@/lib/db/occurrence-query"
import { persistentListDataSchema, type PersistentQuery } from "@/contracts/persistent-occurrences"

export function queryOccurrences(principal: Principal, query: PersistentQuery, id?: string) {
  return readOperational(principal, async client => {
    const result = await client.query(occurrenceSql(query, id))
    const total = Number(result.rows[0].total)
    return persistentListDataSchema.parse({ items: result.rows[0].items,
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } })
  })
}
