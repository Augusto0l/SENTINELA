import {
  occurrenceSchema as formSchema,
  type OccurrenceFormValues,
} from "@/data/occurrenceForm"
import {
  occurrenceCreateSchema,
  analyticsFilterSchema,
  type ApiOccurrence,
} from "@/contracts/occurrences"
import { type DemoFilters, emptyDemoFilters } from "@/data/demoAnalytics"

/** Form validation remains authoritative for the current UI and its demonstrative DF bounds. */
export function fromOccurrenceForm(input: OccurrenceFormValues) {
  const value = formSchema.parse(input)
  return occurrenceCreateSchema.parse({
    data: value.data.split("/").reverse().join("-"),
    horario: value.horario,
    raCode: value.raCode,
    local: value.local,
    naturezas: [value.natureza],
    coordenadas: {
      latitude: Number(value.latitude),
      longitude: Number(value.longitude),
    },
  })
}
export function fromDemoFilters(input: DemoFilters) {
  return analyticsFilterSchema.parse({
    period: input.period,
    ...(input.period === "custom"
      ? { startDate: input.startDate, endDate: input.endDate }
      : {}),
    ...(input.ra ? { ra: input.ra } : {}),
    ...(input.nature ? { nature: input.nature } : {}),
    ...(input.hour ? { hour: input.hour } : {}),
  })
}
export function toDemoFilters(input: unknown): DemoFilters {
  return { ...emptyDemoFilters(), ...analyticsFilterSchema.parse(input) }
}
/** Does not arbitrarily elect a main nature; the old form cannot represent several links. */
export function toOccurrenceForm(record: ApiOccurrence): OccurrenceFormValues {
  if (record.naturezas.length !== 1 || record.coordenadas === null)
    throw new Error(
      "Formulário atual não representa múltiplas naturezas ou coordenadas pendentes sem perda de informação.",
    )
  return formSchema.parse({
    natureza: record.naturezas[0],
    data: record.data.split("-").reverse().join("/"),
    horario: record.horario,
    raCode: record.raCode,
    local: record.local,
    latitude: String(record.coordenadas.latitude),
    longitude: String(record.coordenadas.longitude),
  })
}
