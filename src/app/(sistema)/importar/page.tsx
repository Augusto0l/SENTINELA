import Screen from "@/features/ImportarDados";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";
import { isolatedPcdfMode } from "@/lib/db/isolated-write-mode";
import PersistentPcdf from "@/features/import/PersistentPcdf";

export default async function Page() {
  const principal = await requirePrincipal("importar");
  return isolatedPcdfMode() && principal.source === "local" ? <PersistentPcdf /> : <Screen />;
}
