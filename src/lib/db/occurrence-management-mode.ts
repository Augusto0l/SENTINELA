import { directPcdfMode, integratedImportMode } from "@/lib/db/pcdf-direct-mode"

export function occurrenceManagementMode(env = process.env) {
  const mode = directPcdfMode(env)
  return env.SENTINELA_OCCURRENCE_MANAGEMENT === "1" && mode?.port === 55488 ? mode : null
}

export function operationalOccurrenceManagementMode(env = process.env) {
  const mode = integratedImportMode(env)
  return env.SENTINELA_OPERATIONAL_IMPORT_MANAGEMENT === "1" && env.SENTINELA_PCDF_SYNTHETIC !== "1" ? mode : null
}
