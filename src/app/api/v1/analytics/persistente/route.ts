import { getOperationalPrincipal } from "@/lib/auth/operational-server"
import { readLocal } from "@/lib/db/persistent-read"
import { DatabaseUnavailable } from "@/lib/db/config"
import { occurrenceReadMode, withOperationalDatabase } from "@/lib/db/local-occurrences"
import { analyticsSql } from "@/lib/db/analytics-query"
import { analyticsGET } from "@/lib/db/analytics-http"
import { isolatedPcdfMode } from "@/lib/db/isolated-write-mode"
import { pcdfWorkspace } from "@/lib/db/pcdf-workspace"
import { directDatabasePort, hostedOperationalMode } from "@/lib/db/pcdf-direct-mode"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(request: Request) {
  if (isolatedPcdfMode()) return pcdfWorkspace(request, "analytics")
  return analyticsGET(request, getOperationalPrincipal, async (principal, filters) => {
    const mode = occurrenceReadMode()
    const hosted = hostedOperationalMode()
    if (mode || hosted) {
      try {
        return await withOperationalDatabase(principal, true, async client => {
          const [{ installed, confirmedMap }] = (await client.query(`SELECT coalesce(has_function_privilege(
            to_regprocedure('sentinela_pcdf_historico.coverage()'),'EXECUTE'),false) AS installed,
            coalesce(has_table_privilege(to_regclass('sentinela_ocorrencias_analytics.pontos_confirmados'),'SELECT'),false) AS "confirmedMap"`)).rows
          if (installed) {
            // Full-series aggregates share the same association scan and favor an in-memory hash join.
            await client.query("SET LOCAL work_mem='48MB'; SET LOCAL enable_nestloop=off")
          }
          const { rows } = await client.query(analyticsSql(filters, "integrated", confirmedMap))
          const data = !confirmedMap && (hosted || mode?.port === directDatabasePort) && rows[0]?.data
            ? { ...rows[0].data, points: [], heatReference: [], mappedByRa: [], pointsTruncated: false, heatUnavailable: false }
            : rows[0]?.data
          if (!installed || !data) return data
          const { rows: [coverage] } = await client.query("SELECT sentinela_pcdf_historico.coverage() AS data")
          return { ...data, monthCoverage: coverage.data ?? [] }
        }, false, 25000)
      } catch {
        throw new DatabaseUnavailable()
      }
    }
    if (filters.scope === "pcdf") throw new DatabaseUnavailable()
    return readLocal(principal, async client => {
      const { rows } = await client.query(analyticsSql(filters))
      return rows[0]?.data
    })
  })
}
