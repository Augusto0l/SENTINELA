import { z } from "zod"
import { coordinateSchema, countSchema, dateSchema, successSchema } from "@/contracts/common"

export const PERSISTENT_ANALYTICS_PATH = "/api/v1/analytics/persistente"
const code = z.string().regex(/^[A-Z0-9-]{1,30}$/)
export const persistentAnalyticsQuery = z.strictObject({
  scope: z.literal("pcdf").optional(),
  startDate: dateSchema.optional(), endDate: dateSchema.optional(), ra: code.optional(),
  nature: z.uuid().optional(), category: z.string().min(1).max(240).regex(/\S/).optional(), hour: z.enum(["0-6", "6-12", "12-18", "18-24"]).optional(),
}).refine(query => !query.startDate || !query.endDate || query.startDate <= query.endDate)
export type PersistentAnalyticsQuery = z.infer<typeof persistentAnalyticsQuery>
export function parseAnalyticsSearch(params: URLSearchParams) {
  if (new Set(params.keys()).size !== params.size) throw new Error("Parâmetro repetido.")
  return persistentAnalyticsQuery.parse(Object.fromEntries(params))
}

const option = z.strictObject({ id: z.uuid(), name: z.string().min(1) })
const bucket = z.strictObject({ key: z.string(), count: countSchema })
const monthlyCoverage = z.strictObject({ key: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  status: z.enum(["not_imported", "complete", "partial"]), through: dateSchema })
const point = coordinateSchema.extend({ raCode: code.nullable() })
export const pointPublicationStatus = z.enum(["validated", "pcdf_crs_unverified"])
export type PointPublicationStatus = z.infer<typeof pointPublicationStatus>
export const analyticPointSchema = point.extend({
  id: z.uuid().optional(),
  territorialRaCode: code.nullable().optional(),
  publicationStatus: pointPublicationStatus.optional(),
})
// Published map points aggregated into 0.002° cells for the heat layer; weight = occurrences in the cell.
const heatCell = point.extend({ weight: z.number().int().positive() })
export const ANALYTICS_POINT_LIMIT = 10000
// Heat cells are 0.002° (below one heat-grid step and far below the kernel blur), each weighted by its occurrences.
export const ANALYTICS_HEAT_CELL_LIMIT = 40000
export const persistentAnalyticsData = z.strictObject({
  total: countSchema, mapTotal: countSchema,
  byRa: z.array(bucket), byNature: z.array(bucket), timeline: z.array(bucket),
  mappedByRa: z.array(bucket).optional(),
  natureLinks: z.array(bucket).optional(),
  monthCoverage: z.array(monthlyCoverage).optional(),
  byCategory: z.array(bucket).optional(),
  weekday: z.number().int().min(0).max(6).nullable(), hour: z.number().int().min(0).max(23).nullable(),
  regions: z.array(z.strictObject({ code, name: z.string().min(1) })),
  natures: z.array(option), categories: z.array(option.extend({ id: z.string().min(1).max(240) })),
  points: z.array(analyticPointSchema).max(ANALYTICS_POINT_LIMIT),
  heatReference: z.array(z.union([heatCell, point])).max(ANALYTICS_HEAT_CELL_LIMIT),
  heat: z.array(heatCell).max(ANALYTICS_HEAT_CELL_LIMIT).optional(),
  pointsTruncated: z.boolean(), heatUnavailable: z.boolean(),
  eligiblePoints: countSchema.optional(),
  unverifiedPcdfPoints: countSchema.optional(),
}).refine(value => value.total <= value.mapTotal && value.timeline.reduce((n,b) => n+b.count,0) <= value.total &&
  value.byRa.reduce((n,b) => n+b.count,0) <= value.mapTotal &&
  (value.eligiblePoints === undefined || (value.eligiblePoints >= value.points.length &&
    (value.unverifiedPcdfPoints ?? 0) <= value.eligiblePoints)) &&
  (!value.heatUnavailable || (value.heatReference.length === 0 && !value.heat?.length)))
export const persistentAnalyticsResponse = successSchema(persistentAnalyticsData)
export type PersistentAnalyticsData = z.infer<typeof persistentAnalyticsData>
