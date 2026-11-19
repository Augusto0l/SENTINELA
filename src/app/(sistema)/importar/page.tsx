import Screen from "@/features/ImportarDados";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";
import { isolatedPcdfMode } from "@/lib/db/isolated-write-mode";
import PersistentPcdf from "@/features/import/PersistentPcdf";
import { persistentPcdfCompletionEnabled, persistentPcdfEnabled } from "@/lib/db/config";

export default async function Page() {
  const principal = await requirePrincipal("importar");
  const persistent = persistentPcdfEnabled();
  return (isolatedPcdfMode() || persistent) && principal.source === "local"
    ? <PersistentPcdf persistent={persistent} xlsxEnabled={persistentPcdfCompletionEnabled()} /> : <Screen />;
}
