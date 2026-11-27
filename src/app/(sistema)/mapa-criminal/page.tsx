import CrimeMapEntry from "@/features/CrimeMapEntry";
import { demoFiltersFromSearch } from "@/data/demoAnalytics";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";
import { canReadOperational } from "@/lib/auth/operational-access";
import { readManualMapPoints } from "@/lib/db/manual-map";
import { z } from "zod";

export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requirePrincipal("analisar");
  const params = await searchParams;
  const filters = demoFiltersFromSearch({ get: name => typeof params[name] === "string" ? params[name] : null });
  const persistent = principal.source === "supabase" || canReadOperational(principal);
  const focus = z.uuid().safeParse(params.ocorrencia).data?.toLowerCase();
  const manualPoints = await readManualMapPoints(principal, focus ?? null).catch(() => null);
  return <CrimeMapEntry persistent={persistent} manualPoints={manualPoints} focusedOccurrence={focus}
    initialFilters={{ ...filters, category: persistent && typeof params.category === "string" ? params.category : undefined }} />;
}
