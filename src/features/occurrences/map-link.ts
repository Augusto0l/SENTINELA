import { z } from "zod"

export type OccurrenceMapPosition = { latitude: number; longitude: number; raName?: string }
let latestSelection: { id: string; position: OccurrenceMapPosition } | undefined

export function occurrenceHrefFromMap(id: string, position: OccurrenceMapPosition) {
  const uuid = z.uuid().safeParse(id)
  if (!uuid.success) return undefined
  const normalized = uuid.data.toLowerCase()
  // Keep the published position out of the URL. Only the protected read can supply occurrence details.
  latestSelection = { id: normalized, position }
  return `/ocorrencias?${new URLSearchParams({ ocorrencia: normalized })}`
}

export function occurrenceMapPosition(id: string) {
  return latestSelection?.id === id.toLowerCase() ? latestSelection.position : undefined
}
