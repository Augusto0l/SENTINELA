import CrimeMapEntry from "@/features/CrimeMapEntry";
import { demoFiltersFromSearch } from "@/data/demoAnalytics";

export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = demoFiltersFromSearch({ get: name => typeof params[name] === "string" ? params[name] : null });
  return <CrimeMapEntry initialFilters={filters} />;
}
