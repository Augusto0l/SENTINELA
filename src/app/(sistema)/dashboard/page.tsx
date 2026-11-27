import { headers } from "next/headers"
import { dashboardFilters, defaultDashboardFilters } from "@/contracts/dashboard"
import Dashboard from "@/features/Dashboard"
import { canReadOperational, operationalHostAllowed } from "@/lib/auth/operational-access"
import { requirePagePrincipal } from "@/lib/auth/page-access"
import { readDashboard } from "@/lib/db/dashboard"

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function Page({ searchParams }: DashboardPageProps) {
  const principal = await requirePagePrincipal("analisar")
  if (!canReadOperational(principal) || !operationalHostAllowed((await headers()).get("host"))) {
    return <Dashboard filters={defaultDashboardFilters} message="Indicadores operacionais indisponíveis nesta sessão." />
  }
  const { ra, ...params } = await searchParams
  const parsed = dashboardFilters.safeParse({ ...params, ra: typeof ra === "string" ? [ra] : ra })
  if (!parsed.success) {
    return <Dashboard filters={defaultDashboardFilters} message="Os filtros do endereço são inválidos." recovery="clear" />
  }

  const data = await readDashboard(principal, parsed.data).catch(() => null)
  return <Dashboard filters={parsed.data} data={data ?? undefined}
    message={data ? undefined : "Não foi possível consultar os indicadores operacionais."} recovery="retry" />
}
