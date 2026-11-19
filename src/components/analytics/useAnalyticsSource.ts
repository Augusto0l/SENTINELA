"use client"
import { useEffect, useMemo, useState } from "react"
import { usePersistentAnalytics, type AnalyticSelection } from "@/components/analytics/usePersistentAnalytics"
import { loadOfficialRegions, projectOfficialRegions } from "@/components/map/officialRegions"
import { projectLonLat, type RAData } from "@/components/map/raMapData"
import { queryDemoAnalytics, summarizeDemo, demoPeriodLabel } from "@/data/demoAnalytics"
import { RA_LIST } from "@/data/mockData"
import { MOCK_OCCURRENCES } from "@/data/mockOccurrences"
import type { PersistentAnalyticsData } from "@/contracts/persistent-analytics"

const empty = summarizeDemo([])
const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
const bucketMap = (values: { key: string; count: number }[]) => Object.fromEntries(values.map(({ key, count }) => [key, count]))

function summaryOf(data: PersistentAnalyticsData | null, ra: string) {
  if (!data) return empty
  return {
    total: data.total, byRa: bucketMap(ra ? data.byRa.filter(item => item.key === ra) : data.byRa),
    byNature: bucketMap(data.byNature), timeline: data.timeline.map(({ key, count }) => ({ month: key, count })),
    peakDay: data.weekday === null ? "—" : weekdays[data.weekday],
    peakHour: data.hour === null ? "—" : `${String(data.hour).padStart(2, "0")}h`,
    topNature: data.byNature[0]?.key ?? "—",
  }
}

function drawPoints(points: PersistentAnalyticsData["points"], names: Record<string, string>) {
  return points.map(({ latitude, longitude, raCode }, index) => ({
    id: String(index), raCode, raName: names[raCode] ?? raCode, natureza: "Ocorrência com localização validada",
    data: "", horario: "", local: "", latitude, longitude, ...projectLonLat(longitude, latitude),
  }))
}

export function useAnalyticsSource(persistent: boolean, filters: AnalyticSelection) {
  const { data, catalog, pending, error, retry } = usePersistentAnalytics(persistent, filters)
  const [regions, setRegions] = useState<RAData[]>()
  const [geometryError, setGeometryError] = useState(false)
  useEffect(() => {
    if (!persistent) return
    const controller = new AbortController()
    loadOfficialRegions(AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]))
      .then(geo => { if (!controller.signal.aborted) setRegions(projectOfficialRegions(geo)) })
      .catch(() => { if (!controller.signal.aborted) setGeometryError(true) })
    return () => controller.abort()
  }, [persistent])
  const demo = useMemo(() => persistent ? null : queryDemoAnalytics(MOCK_OCCURRENCES, filters), [persistent, filters])
  const catalogRegions = catalog?.regions
  const officialRegions = useMemo(() => {
    if (!regions) return undefined
    const names = new Map(catalogRegions?.map(region => [region.code, region.name]))
    return regions.map(region => ({ ...region, displayName: names.get(region.code) ?? region.displayName }))
  }, [regions, catalogRegions])
  const names = useMemo(() => Object.fromEntries(officialRegions?.map(region => [region.code, region.displayName]) ?? []), [officialRegions])
  const points = useMemo(() => drawPoints(data?.points ?? [], names), [data?.points, names])
  const reference = useMemo(() => drawPoints(data?.heatReference ?? [], names), [data?.heatReference, names])
  return {
    summary: demo?.summary ?? summaryOf(data, filters.ra),
    categoryCounts: data?.byCategory ?? [],
    mapSummary: demo?.mapSummary ?? { total: data?.mapTotal ?? 0, byRa: bucketMap(data?.byRa ?? []) },
    mapRecords: demo?.mapRecords ?? points,
    heatReference: persistent ? reference : MOCK_OCCURRENCES,
    heatUnavailable: Boolean(data?.heatUnavailable), pointsTruncated: Boolean(data?.pointsTruncated),
    regionOptions: persistent ? officialRegions?.map(region => ({ codigo: region.code, nomeDisplay: region.displayName })) ?? [] : RA_LIST,
    catalogOptions: persistent ? { natures: catalog?.natures ?? [], categories: catalog?.categories ?? [] } : undefined,
    officialRegions, geometryError, pending, error, retry,
    periodLabel: persistent ? (filters.period === "custom" ? demoPeriodLabel(filters) : "Todo o período") : demoPeriodLabel(filters),
  }
}
