import { notFound } from "next/navigation"
import { requirePagePrincipal } from "@/lib/auth/page-access"
import { hasPermission } from "@/lib/auth/policy"
import { generalImportMode, isolatedPcdfMode } from "@/lib/db/isolated-write-mode"
import { generalReviewPath } from "@/contracts/general-import"
import PcdfReview from "@/features/import/PcdfReview"
import { persistentPcdfCompletionEnabled, persistentPcdfEnabled } from "@/lib/db/config"

export default async function Page({ searchParams }: { searchParams: Promise<{ origem?: string }> }) {
  const principal = await requirePagePrincipal("consultar_central")
  const general = Boolean(generalImportMode()) && principal.source === "local"
  const pcdf = Boolean(isolatedPcdfMode() || persistentPcdfEnabled()) && principal.source === "local"
  if (general && (!pcdf || (await searchParams).origem !== "pcdf")) {
    return <PcdfReview key="geral" canCorrect={hasPermission(principal.role, "corrigir")} paginated endpoint={generalReviewPath}
      alternate={pcdf ? { href: "/central-revisao?origem=pcdf", label: "Ver pendências PCDF sintéticas" } : undefined} />
  }
  if (!pcdf) notFound()
  return <PcdfReview key="pcdf" canCorrect={hasPermission(principal.role, "corrigir")} paginated={persistentPcdfCompletionEnabled()}
    alternate={general ? { href: "/central-revisao", label: "Ver pendências da importação geral" } : undefined} />
}
