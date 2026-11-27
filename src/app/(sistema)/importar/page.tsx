import Screen from "@/features/ImportarDados";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";
import { canReadOperational } from "@/lib/auth/operational-access";
import { generalImportMode, isolatedPcdfMode } from "@/lib/db/isolated-write-mode";
import ImportWorkflow from "@/features/import/ImportWorkflow";
import PersistentPcdf from "@/features/import/PersistentPcdf";
import DirectPcdf from "@/features/import/DirectPcdf";
import { directPcdfMode, expectsIntegratedImport, hostedImportMode, integratedImportMode } from "@/lib/db/pcdf-direct-mode";
import { localImportStartupMessage } from "@/contracts/pcdf-direct";
import { persistentPcdfCompletionEnabled, persistentPcdfEnabled } from "@/lib/db/config";

export default async function Page({ searchParams }: { searchParams: Promise<{ origem?: string }> }) {
  const principal = await requirePrincipal("importar");
  const hosted = hostedImportMode();
  if (hosted && principal.source === "supabase")
    return <ImportWorkflow persistent combinedPcdf hosted blockAllWrites={!hosted.write}
      writeBlocked={hosted.write ? undefined : "A gravação de importações está desativada neste ambiente."} />;
  const integrated = integratedImportMode();
  if (canReadOperational(principal) && (integrated || expectsIntegratedImport()))
    return <ImportWorkflow persistent combinedPcdf configurationError={integrated ? undefined : localImportStartupMessage}
      writeBlocked={principal.source === "supabase" ? "A gravação de importações exige autorização institucional no PostgreSQL." : undefined} />;
  if (directPcdfMode() && principal.source === "local") return <DirectPcdf />;
  const persistent = persistentPcdfEnabled();
  const general = Boolean(generalImportMode()) && principal.source === "local";
  const syntheticPcdf = Boolean(isolatedPcdfMode() || persistent) && principal.source === "local";
  const origin = (await searchParams).origem;
  if (general && (!syntheticPcdf || origin !== "pcdf"))
    return <ImportWorkflow persistent syntheticPcdf={syntheticPcdf} />;
  if (syntheticPcdf && origin === "pcdf-v2") return <Screen />;
  return syntheticPcdf
    ? <PersistentPcdf persistent={persistent} xlsxEnabled={persistentPcdfCompletionEnabled()} generalAvailable={general} /> : <Screen />;
}
