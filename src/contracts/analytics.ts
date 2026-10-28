import { z } from "zod"
import {
  coordinateSchema,
  countSchema,
  idSchema,
  natureSchema,
  raSchema,
  successSchema,
} from "@/contracts/common"
import {
  analyticsFilterSchema,
  filterFields,
  natureListSchema,
  validPeriod,
  type ApiOccurrence,
  type AnalyticsFilters,
} from "@/contracts/occurrences"
import { queryDemoAnalytics, type DemoRecord } from "@/data/demoAnalytics"

export const timelineItemSchema = z.strictObject({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  count: countSchema,
})
export const summarySchema = z
  .strictObject({
    total: countSchema,
    byRa: z.partialRecord(raSchema, countSchema),
    byNature: z.partialRecord(natureSchema, countSchema),
    timeline: z.array(timelineItemSchema),
    peakHour: z.string().regex(/^(?:[01]\d|2[0-3])h$|^—$/),
    peakDay: z.enum([
      "Domingo",
      "Segunda",
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
      "—",
    ]),
    topNature: z.union([natureSchema, z.literal("—")]),
  })
  .superRefine((summary, ctx) => {
    const sum = (values: Partial<Record<string, number>>) =>
      Object.values(values).reduce<number>(
        (total, value) => total + (value ?? 0),
        0,
      )
    if (
      sum(summary.byRa) !== summary.total ||
      summary.timeline.reduce((total, item) => total + item.count, 0) !==
        summary.total
    )
      ctx.addIssue({
        code: "custom",
        message: "RA e série mensal devem conservar o total de ocorrências.",
      })
    if (
      Object.values(summary.byNature).some(
        (value) => (value ?? 0) > summary.total,
      ) ||
      sum(summary.byNature) < summary.total
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Vínculos de natureza não podem perder ocorrências nem repetir o mesmo vínculo.",
      })
    if (
      summary.timeline.some(
        (item, index) =>
          index > 0 && item.month <= summary.timeline[index - 1].month,
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["timeline"],
        message: "Meses únicos em ordem cronológica.",
      })
  })
export const analyticsDataSchema = z
  .strictObject({
    filters: analyticsFilterSchema,
    summary: summarySchema,
    mapSummary: summarySchema,
    units: z.strictObject({
      total: z.literal("ocorrencias_unicas"),
      byNature: z.literal("vinculos_de_natureza"),
    }),
  })
  .refine(
    (value) =>
      value.summary.total ===
      (value.filters.ra
        ? (value.mapSummary.byRa[value.filters.ra] ?? 0)
        : value.mapSummary.total),
    "Resumo regional deve corresponder à RA no recorte do mapa.",
  )
export const analyticsResponseSchema = successSchema(analyticsDataSchema)
export const mapModeSchema = z.enum(["points", "heat", "clusters"])
export const mapQuerySchema = z
  .strictObject({ ...filterFields, mode: mapModeSchema.optional() })
  .refine(validPeriod, "Período inválido.")
export const mapPointSchema = coordinateSchema.extend({
  id: idSchema,
  raCode: raSchema,
  naturezas: natureListSchema,
})
export const mapDataSchema = z
  .strictObject({
    filters: analyticsFilterSchema,
    mode: mapModeSchema,
    points: z.array(mapPointSchema),
    totalOccurrences: countSchema,
    pendingLocation: countSchema,
    countsByRa: z.partialRecord(raSchema, countSchema),
    heatReference: z
      .strictObject({
        scope: z.literal("base_integral"),
        totalLocated: countSchema,
        points: z.array(coordinateSchema),
      })
      .describe(
        "Referência geográfica integral do conjunto já autorizado; reutilizar ao filtrar, sem renormalizar a intensidade. Não concede acesso fora do escopo do chamador.",
      ),
    crs: z.literal("EPSG:4326"),
  })
  .superRefine((value, ctx) => {
    if (
      value.points.length + value.pendingLocation !== value.totalOccurrences ||
      new Set(value.points.map((point) => point.id)).size !==
        value.points.length ||
      value.heatReference.totalLocated !== value.heatReference.points.length ||
      value.heatReference.totalLocated < value.points.length
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Pontos únicos, pendências e referência devem conservar o recorte.",
      })
    const territorialTotal = value.filters.ra
      ? (value.countsByRa[value.filters.ra] ?? 0)
      : Object.values(value.countsByRa).reduce<number>(
          (sum, count) => sum + (count ?? 0),
          0,
        )
    if (
      territorialTotal !== value.totalOccurrences ||
      value.points.some(
        (point) => value.filters.ra && point.raCode !== value.filters.ra,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Camada geográfica e contagens territoriais incompatíveis.",
      })
  })
export const mapResponseSchema = successSchema(mapDataSchema)

/** Explicit adapter only; never imports Canvas, mutates mocks or connects screens to an API. */
export function toDemoRecord(record: ApiOccurrence): DemoRecord {
  return {
    raCode: record.raCode,
    natureza: record.naturezas[0],
    naturezas: record.naturezas,
    data: record.data.split("-").reverse().join("/"),
    horario: record.horario,
  }
}
export function buildDemoAnalytics(
  records: readonly ApiOccurrence[],
  input: AnalyticsFilters,
) {
  const filters = analyticsFilterSchema.parse(input)
  if (new Set(records.map((record) => record.id)).size !== records.length)
    throw new Error("A entrada analítica exige IDs canônicos únicos.")
  const active = records.filter((record) => record.ativo)
  const result = queryDemoAnalytics(
    active.map((record) => ({ ...toDemoRecord(record), source: record })),
    filters,
  )
  return analyticsDataSchema.parse({
    filters,
    summary: result.summary,
    mapSummary: result.mapSummary,
    units: { total: "ocorrencias_unicas", byNature: "vinculos_de_natureza" },
  })
}
export function buildDemoMap(
  records: readonly ApiOccurrence[],
  input: AnalyticsFilters,
  mode: "points" | "heat" | "clusters",
) {
  const filters = analyticsFilterSchema.parse(input)
  if (new Set(records.map((record) => record.id)).size !== records.length)
    throw new Error("A entrada geográfica exige IDs canônicos únicos.")
  const active = records.filter((record) => record.ativo)
  const result = queryDemoAnalytics(
    active.map((record) => ({ ...toDemoRecord(record), source: record })),
    filters,
  )
  const points = result.records.flatMap(({ source: record }) =>
    record.coordenadas
      ? [
          {
            id: record.id,
            raCode: record.raCode,
            naturezas: record.naturezas,
            ...record.coordenadas,
          },
        ]
      : [],
  )
  return mapDataSchema.parse({
    filters,
    mode,
    points,
    totalOccurrences: result.summary.total,
    pendingLocation: result.summary.total - points.length,
    countsByRa: result.mapSummary.byRa,
    heatReference: {
      scope: "base_integral",
      totalLocated: active.filter((record) => record.coordenadas !== null)
        .length,
      points: active.flatMap((record) =>
        record.coordenadas ? [record.coordenadas] : [],
      ),
    },
    crs: "EPSG:4326",
  })
}
export type AnalyticsData = z.infer<typeof analyticsDataSchema>
export type MapData = z.infer<typeof mapDataSchema>
export type AnalyticsResponse = z.infer<typeof analyticsResponseSchema>
export type MapResponse = z.infer<typeof mapResponseSchema>
export type MapQuery = z.infer<typeof mapQuerySchema>
