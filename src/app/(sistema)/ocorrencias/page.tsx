import Screen from "@/features/OccurrencesEntry";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";
import { isolatedWriteMode } from "@/lib/db/isolated-write-mode";
import { readIsolatedOccurrences } from "@/lib/db/isolated-occurrence-read";
import IsolatedList from "@/features/occurrences/IsolatedList";
import { hasPermission } from "@/lib/auth/policy";
import { persistentCrudEnabled } from "@/lib/db/config";
import { readPersistentWorkspace } from "@/lib/db/persistent-crud";

export default async function Page() {
  const principal = await requirePrincipal("analisar");
  if (principal.source === "local" && persistentCrudEnabled()) {
    const rows = await readPersistentWorkspace(principal).catch(() => null);
    return <IsolatedList persistent rows={rows ?? []} unavailable={!rows} write={hasPermission(principal.role, "editar")} />;
  }
  if (principal.source === "local" && isolatedWriteMode()) {
    const rows = await readIsolatedOccurrences().catch(() => null);
    return <IsolatedList rows={rows ?? []} unavailable={!rows} write={hasPermission(principal.role, "editar")} />;
  }
  return <Screen />;
}
