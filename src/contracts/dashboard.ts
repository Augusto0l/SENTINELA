import { z } from "zod"
import { dateSchema } from "@/contracts/common"

export const dashboardFilters = z.strictObject({
  ra: z.array(z.string().regex(/^[A-Z0-9-]{1,30}$/)).max(37).default([]),
  nature: z.union([z.uuid(), z.literal("")]).default(""),
  category: z.string().max(240).default(""),
  hour: z.enum(["", "0-6", "6-12", "12-18", "18-24"]).default(""),
  startDate: z.union([dateSchema, z.literal("")]).default(""),
  endDate: z.union([dateSchema, z.literal("")]).default(""),
}).refine(({ startDate, endDate }) => (!startDate && !endDate) || Boolean(startDate && endDate && startDate <= endDate))

export type DashboardFilters = z.output<typeof dashboardFilters>
export const defaultDashboardFilters: DashboardFilters = { ra: [], nature: "", category: "", hour: "", startDate: "", endDate: "" }

export type DateRange = { start: string; end: string }
export type MonthCoverage = { key: string; status: "not_imported" | "complete" | "partial"; through: string }
type Choice = { id: string; name: string }
export type ComparisonRow = { key: string; count: number; previous: number }

export type DashboardData = {
  total: number
  regions: Choice[]
  natures: Choice[]
  categories: Choice[]
  days: { key: string; count: number }[]
  cells: { day: number; hour: number; count: number }[]
  byRa: ComparisonRow[]
  byNature: (ComparisonRow & { links: number })[]
  byNatureShift: { nature: string; shift: number; count: number }[]
  attemptStatus: { completed: number; attempted: number; unreported: number } | null
  byRaNature: { ra: string; nature: string; count: number }[]
  dailyRegions: string[]
  byRaDay: { day: string; counts: Record<string, number> }[]
  period: DateRange | null
  previous: DateRange | null
  coverage: DateRange[]
  spatialAvailable: boolean
}

export function dashboardHref(filters: DashboardFilters) {
  const params = new URLSearchParams()
  for (const code of filters.ra) params.append("ra", code)
  for (const key of ["startDate", "endDate", "nature", "category", "hour"] as const) {
    if (filters[key]) params.set(key, filters[key])
  }
  return params.size ? `/dashboard?${params}` : "/dashboard"
}
