import { localAllowed } from "@/lib/auth/local-provider"
import type { Principal } from "@/lib/auth/policy"
import { hostedOperationalMode, institutionalDatabaseMode } from "@/lib/db/pcdf-direct-mode"

export type OperationalPrincipal = Principal & { localSubject?: string; localAccountId?: string; session?: string }

export function canReadOperational(principal: Principal) {
  if (hostedOperationalMode()) return principal.source === "supabase"
  return principal.source === "local" || (principal.source === "supabase" && Boolean(institutionalDatabaseMode()))
}

export function operationalHostAllowed(host: string | null) {
  const mode = institutionalDatabaseMode()
  return mode ? host === new URL(mode.origin).host : localAllowed(host)
}
