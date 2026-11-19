import { notFound } from "next/navigation"
import { requirePagePrincipal } from "@/lib/auth/page-access"
import { hasPermission } from "@/lib/auth/policy"
import { isolatedPcdfMode } from "@/lib/db/isolated-write-mode"
import PcdfReview from "@/features/import/PcdfReview"
import { persistentPcdfCompletionEnabled, persistentPcdfEnabled } from "@/lib/db/config"

export default async function Page() {
  const principal = await requirePagePrincipal("consultar_central")
  if ((!isolatedPcdfMode() && !persistentPcdfEnabled()) || principal.source !== "local") notFound()
  return <PcdfReview canCorrect={hasPermission(principal.role, "corrigir")} paginated={persistentPcdfCompletionEnabled()} />
}
