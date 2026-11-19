import { getLocalPrincipal } from "@/lib/auth/local-server"
import { readOperational } from "@/lib/db/pool"
import { analyticsSql } from "@/lib/db/analytics-query"
import { analyticsGET } from "@/lib/db/analytics-http"
import { isolatedPcdfMode } from "@/lib/db/isolated-write-mode"
import { pcdfWorkspace } from "@/lib/db/pcdf-workspace"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(request: Request) {
  if (isolatedPcdfMode()) return pcdfWorkspace(request, "analytics")
  return analyticsGET(request, getLocalPrincipal, (principal, filters) => readOperational(principal, async client => {
    const { rows } = await client.query(analyticsSql(filters))
    return rows[0]?.data
  }))
}
