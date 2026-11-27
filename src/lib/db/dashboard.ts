import "server-only"
import { z } from "zod"
import type { DashboardData, DashboardFilters, DateRange, MonthCoverage } from "@/contracts/dashboard"
import { coverageRanges, previousPeriod } from "@/features/dashboard/statistics"
import type { Principal } from "@/lib/auth/policy"
import { DatabaseUnavailable } from "@/lib/db/config"
import { occurrenceReadMode, withOperationalDatabase } from "@/lib/db/local-occurrences"
import { directDatabasePort, hostedOperationalMode } from "@/lib/db/pcdf-direct-mode"
import { dashboardPopulation, dashboardSql } from "@/lib/db/dashboard-query"

const monthCoverage = z.array(z.object({
  key: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  status: z.enum(["not_imported", "partial", "complete"]),
  through: z.iso.date(),
}))

export async function readDashboard(principal: Principal, filters: DashboardFilters): Promise<DashboardData> {
  if (!hostedOperationalMode() && occurrenceReadMode()?.port !== directDatabasePort) throw new DatabaseUnavailable()
  return withOperationalDatabase(principal, true, async client => {
    const { rows: [capabilities] } = await client.query<{ spatial: boolean; coverage: boolean }>(`SELECT
      coalesce(has_table_privilege(to_regclass('sentinela_ocorrencias_analytics.pontos_confirmados'),'SELECT'),false) AS spatial,
      coalesce(has_function_privilege(to_regprocedure('sentinela_pcdf_historico.coverage()'),'EXECUTE'),false) AS coverage`)
    let months: MonthCoverage[] = []
    if (capabilities.coverage) {
      const { rows: [result] } = await client.query("SELECT sentinela_pcdf_historico.coverage() AS data")
      months = monthCoverage.parse(result.data ?? [])
    }
    const coverage = coverageRanges(months)
    let period: DateRange | null = filters.startDate ? { start: filters.startDate, end: filters.endDate } : null
    if (!period) {
      const { rows: [bounds] } = await client.query<{ start: string | null; end: string | null }>(`SELECT
        to_char(min(data_fato),'YYYY-MM-DD') AS start,to_char(max(data_fato),'YYYY-MM-DD') AS end
        FROM sentinela_ocorrencias_analytics.ocorrencias o WHERE ${dashboardPopulation}`)
      const start = [coverage[0]?.start, bounds.start].filter(Boolean).sort()[0]
      const end = [coverage.at(-1)?.end, bounds.end].filter(Boolean).sort().at(-1)
      period = start && end ? { start, end } : null
    }
    const previous = period ? previousPeriod(period, coverage) : null
    await client.query("SET LOCAL work_mem='48MB'; SET LOCAL enable_nestloop=off")
    const { rows: [row] } = await client.query<{ data: Omit<DashboardData, "period" | "previous" | "coverage" | "spatialAvailable"> }>(
      dashboardSql(filters, previous, capabilities.spatial),
    )
    return { ...row.data, period, previous, coverage, spatialAvailable: capabilities.spatial }
  }, false, 25000)
}
