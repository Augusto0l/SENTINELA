import { z } from "zod"
import { coordinateSchema, countSchema } from "@/contracts/common"
import { analyticPointSchema } from "@/contracts/persistent-analytics"

const envelope = z.strictObject({
  west: z.number().min(-180).max(180), east: z.number().min(-180).max(180),
  south: z.number().min(-85).max(85), north: z.number().min(-85).max(85),
})

export const pointViewport = envelope.extend({ zoom: z.number().int().min(0).max(22) })
  .refine(value => value.west < value.east && value.south < value.north)
export type PointViewport = z.infer<typeof pointViewport>
export const VIEWPORT_POINT_LIMIT = 5000

export const pointViewportResult = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("points"), representedOccurrences: countSchema,
    points: z.array(analyticPointSchema.required({ id: true })).max(VIEWPORT_POINT_LIMIT) }),
  z.strictObject({ kind: z.literal("groups"), representedOccurrences: countSchema,
    groups: z.array(coordinateSchema.extend({ count: z.number().int().positive(), bounds: envelope })).max(4225) }),
]).refine(result => result.representedOccurrences === (result.kind === "points" ? result.points.length :
  result.groups.reduce((represented, group) => represented + group.count, 0)))
