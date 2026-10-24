import { z } from "zod"
import { CRIME_NATURES, RA_LIST } from "@/data/mockData"

export function validBrazilianDate(value: string) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false
  const [day, month, year] = value.split("/").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    year >= 1900 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}
export const occurrenceSchema = z.object({
  natureza: z
    .string()
    .refine(
      (value) => CRIME_NATURES.some((nature) => nature === value),
      "Selecione uma natureza do catálogo demonstrativo.",
    ),
  data: z
    .string()
    .refine(validBrazilianDate, "Informe uma data válida em DD/MM/AAAA."),
  horario: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Informe um horário válido em HH:mm."),
  raCode: z
    .string()
    .refine(
      (value) => RA_LIST.some((ra) => ra.codigo === value),
      "Selecione uma região do catálogo demonstrativo.",
    ),
  local: z
    .string()
    .trim()
    .min(5, "Informe um endereço com pelo menos cinco caracteres.")
    .max(240, "Use até 240 caracteres."),
  latitude: z
    .string()
    .refine(
      (value) =>
        value.trim() !== "" &&
        Number.isFinite(Number(value)) &&
        Number(value) >= -16.2 &&
        Number(value) <= -15.4,
      "Latitude fora da área demonstrativa do DF (-16.2 a -15.4).",
    ),
  longitude: z
    .string()
    .refine(
      (value) =>
        value.trim() !== "" &&
        Number.isFinite(Number(value)) &&
        Number(value) >= -48.3 &&
        Number(value) <= -47.3,
      "Longitude fora da área demonstrativa do DF (-48.3 a -47.3).",
    ),
})
export type OccurrenceFormValues = z.infer<typeof occurrenceSchema>
export function simulateGeocoding(address: string, raCode: string) {
  const ra = RA_LIST.find((item) => item.codigo === raCode)
  if (!ra || address.trim().length < 5 || !/[\p{L}]/u.test(address)) return null
  // Synthetic reference point only: no address lookup, precision or official boundary claim.
  return {
    latitude: (ra.bounds[0][0] + ra.bounds[1][0]) / 2,
    longitude: (ra.bounds[0][1] + ra.bounds[1][1]) / 2,
  }
}
