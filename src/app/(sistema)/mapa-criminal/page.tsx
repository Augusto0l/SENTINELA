import CrimeMapEntry from "@/features/CrimeMapEntry";
import { demoFiltersFromSearch } from "@/data/demoAnalytics";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";

export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requirePrincipal("analisar");
  const params = await searchParams;
  const filters = demoFiltersFromSearch({ get: name => typeof params[name] === "string" ? params[name] : null });
  const persistent = principal.source === "supabase" || canReadOperational(principal);
  return <CrimeMapEntry persistent={persistent} initialFilters={{ ...filters,
    category: persistent && typeof params.category === "string" ? params.category : undefined }} />;
}
import { canReadOperational } from "@/lib/auth/operational-access";
