import "server-only"
import { headers } from "next/headers"
import { getLocalPrincipal } from "@/lib/auth/local-server"
import { operationalHostAllowed, type OperationalPrincipal } from "@/lib/auth/operational-access"
import { getHostedImportPrincipal } from "@/lib/db/hosted-import-db"
import { hostedOperationalMode, institutionalDatabaseMode } from "@/lib/db/pcdf-direct-mode"

export async function getOperationalPrincipal(): Promise<OperationalPrincipal | null> {
  if (!institutionalDatabaseMode()) return getLocalPrincipal()
  if (!operationalHostAllowed((await headers()).get("host"))) return null
  if (hostedOperationalMode()) return getHostedImportPrincipal()
  const { getAccess } = await import("@/lib/auth/server")
  const access = await getAccess()
  return access.status === "allowed" && access.principal.source === "supabase" ? access.principal : null
}
