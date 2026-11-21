import Screen from "@/features/ImportarDados";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";
import { generalImportMode, isolatedPcdfMode } from "@/lib/db/isolated-write-mode";
import ImportWorkflow from "@/features/import/ImportWorkflow";
import PersistentPcdf from "@/features/import/PersistentPcdf";
import { persistentPcdfCompletionEnabled, persistentPcdfEnabled } from "@/lib/db/config";

export default async function Page({ searchParams }: { searchParams: Promise<{ origem?: string }> }) {
  const principal = await requirePrincipal("importar");
  const persistent = persistentPcdfEnabled();
  const general = Boolean(generalImportMode()) && principal.source === "local";
  const syntheticPcdf = Boolean(isolatedPcdfMode() || persistent) && principal.source === "local";
  if (general && (!syntheticPcdf || (await searchParams).origem !== "pcdf"))
    return <ImportWorkflow persistent syntheticPcdf={syntheticPcdf} />;
  return syntheticPcdf
    ? <PersistentPcdf persistent={persistent} xlsxEnabled={persistentPcdfCompletionEnabled()} generalAvailable={general} /> : <Screen />;
}
