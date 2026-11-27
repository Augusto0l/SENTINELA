import Screen from "@/features/OccurrencesEntry";
import { requirePagePrincipal as requirePrincipal } from "@/lib/auth/page-access";
import { isolatedWriteMode } from "@/lib/db/isolated-write-mode";
import { readIsolatedOccurrences } from "@/lib/db/isolated-occurrence-read";
import IsolatedList from "@/features/occurrences/IsolatedList";
import { hasPermission } from "@/lib/auth/policy";
import { persistentCrudEnabled } from "@/lib/db/config";
import { readPersistentWorkspace } from "@/lib/db/persistent-crud";
import OccurrenceWorkspace from "@/features/occurrences/OccurrenceWorkspace";
import { occurrenceReadMode } from "@/lib/db/local-occurrences";
import { occurrenceManagementMode } from "@/lib/db/occurrence-management-mode";
import { manualOperationalMode } from "@/lib/db/operational-import-review";
import { expectsIntegratedImport, hostedOperationalMode, integratedImportMode } from "@/lib/db/pcdf-direct-mode";
import { z } from "zod";

export default async function Page({ searchParams }: { searchParams: Promise<{
  manual?: string | string[]; lote?: string | string[]; ocorrencia?: string | string[]
}> }) {
  const principal = await requirePrincipal("analisar");
  const hosted = hostedOperationalMode();
  if (canReadOperational(principal) && (hosted || occurrenceReadMode() || (expectsIntegratedImport() && !integratedImportMode()))) {
    const query = await searchParams
    return <OccurrenceWorkspace canReadStaging={hasPermission(principal.role, "importar")}
      management={!!occurrenceManagementMode()} admin={hasPermission(principal.role, "administrar")}
      manualOperational={!occurrenceManagementMode() && !!manualOperationalMode() && (!hosted || hosted.write) && principal.source === "supabase"}
      canManageManual={hasPermission(principal.role, "editar") && hasPermission(principal.role, "inativar")}
      manualId={z.uuid().safeParse(query.manual).data} fileId={z.uuid().safeParse(query.lote).data}
      consolidatedId={z.uuid().safeParse(query.ocorrencia).data} />;
  }
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
import { canReadOperational } from "@/lib/auth/operational-access";
