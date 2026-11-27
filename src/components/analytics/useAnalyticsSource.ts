"use client"
import { useEffect, useMemo, useState } from "react"
import { usePersistentAnalytics, type AnalyticSelection } from "@/components/analytics/usePersistentAnalytics"
import { loadOfficialRegions, projectOfficialRegions } from "@/components/map/officialRegions"
import { projectLonLat, type RAData } from "@/components/map/raMapData"
import { queryDemoAnalytics, summarizeDemo, demoPeriodLabel } from "@/data/demoAnalytics"
import { RA_LIST } from "@/data/mockData"
import { MOCK_OCCURRENCES } from "@/data/mockOccurrences"
import type { PersistentAnalyticsData } from "@/contracts/persistent-analytics"
import type { MapOccurrence } from "@/components/map/MapaDF"
import type { RaGeoJSON } from "@/data/geoLoader"
import { dashboardPeriod } from "./dashboard-period"

const empty = summarizeDemo([])
const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
const bucketMap = (values: { key: string; count: number }[]) => Object.fromEntries(values.map(({ key, count }) => [key, count]))

function formatMonthlyVariation(data: PersistentAnalyticsData | null, filters: AnalyticSelection) {
  const previous = data?.timeline.at(-2)
  const latest = data?.timeline.at(-1)
  if (!previous || !latest || previous.count === 0) return null
  if (data?.monthCoverage?.some(item => (item.key === previous.key || item.key === latest.key) && item.status !== "complete"))
    return null

  const monthIndex = (key: string) => {
    const [year, month] = key.split("-").map(Number)
    return year * 12 + month
  }
  if (monthIndex(latest.key) - monthIndex(previous.key) !== 1) return null
  if (filters.period === "custom") {
    const [year, month] = latest.key.split("-").map(Number)
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    if (filters.startDate > `${previous.key}-01` || filters.endDate < `${latest.key}-${lastDay}`) return null
  }

  return ((latest.count - previous.count) / previous.count).toLocaleString("pt-BR", {
    style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero",
  })
}

function coverageNotice(data: PersistentAnalyticsData | null, filters: AnalyticSelection) {
  const coverage = data?.monthCoverage?.filter(({ key }) => filters.period !== "custom"
    || (key >= filters.startDate.slice(0, 7) && key <= filters.endDate.slice(0, 7)))
  if (!coverage?.length) return undefined
  const pending = coverage.filter(item => item.status === "not_imported").length
  const partial = coverage.find(item => item.status === "partial")
  if (partial) return `Dados parciais até ${partial.through.split("-").reverse().join("/")}`
  if (pending === coverage.length) return pending === 1 ? "Competência ainda sem importação" : "Competências ainda sem importação"
  if (filters.period === "custom" && pending) return `${pending} competências ainda sem importação`
  if (data?.total === 0) return "Sem ocorrências nas competências importadas"
  return undefined
}

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

type DrawablePoint = PersistentAnalyticsData["points"][number] & { weight?: number }
function drawPoints(points: readonly DrawablePoint[], names: Record<string, string>): MapOccurrence[] {
  return points.map(({ latitude, longitude, raCode, id, territorialRaCode, publicationStatus, weight }, index) => ({
    ...(weight ? { weight } : {}),
    id: id ?? String(index), occurrenceId: id, raCode: raCode ?? "", raName: raCode ? (names[raCode] ?? raCode) : "RA espacial não informada",
    territorialRaName: territorialRaCode ? (names[territorialRaCode] ?? territorialRaCode) : undefined,
    publicationStatus,
    natureza: publicationStatus === "pcdf_crs_unverified" ? "Ponto PCDF publicado" : "Ocorrência localizada",
    data: "", horario: "", local: "", latitude, longitude, ...projectLonLat(longitude, latitude),
  }))
}

export function useAnalyticsSource(persistent: boolean, filters: AnalyticSelection, dashboard = false) {
  const { data, catalog, pending, error, retry } = usePersistentAnalytics(persistent, filters, dashboard)
  const [cartography, setCartography] = useState<{ geometry: RaGeoJSON; regions: RAData[] }>()
  const regions = cartography?.regions
  const [geometryError, setGeometryError] = useState(false)
  useEffect(() => {
    if (!persistent) return
    const controller = new AbortController()
    loadOfficialRegions(AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]))
      .then(geometry => { if (!controller.signal.aborted) setCartography({ geometry, regions: projectOfficialRegions(geometry) }) })
      .catch(() => { if (!controller.signal.aborted) setGeometryError(true) })
    return () => controller.abort()
  }, [persistent])
  const demo = useMemo(() => persistent ? null : queryDemoAnalytics(MOCK_OCCURRENCES, filters), [persistent, filters])
  const catalogRegions = catalog?.regions
  // Every response brings a new catalog object; rebuild the regions only when an institutional name changes,
  // so the static cartography (and the map caches keyed by it) survives filter changes.
  const catalogNames = JSON.stringify(catalogRegions?.map(region => [region.code, region.name]) ?? [])
  const officialRegions = useMemo(() => {
    if (!regions) return undefined
    const names = new Map(JSON.parse(catalogNames) as [string, string][])
    return regions.map(region => ({ ...region, displayName: names.get(region.code) ?? region.displayName }))
  }, [regions, catalogNames])
  const names = useMemo(() => Object.fromEntries(officialRegions?.map(region => [region.code, region.displayName]) ?? []), [officialRegions])
  const points = useMemo(() => drawPoints(data?.points ?? [], names), [data?.points, names])
  const reference = useMemo(() => drawPoints(data?.heatReference ?? [], names), [data?.heatReference, names])
  const unverifiedPcdfPoints = useMemo(() => data?.unverifiedPcdfPoints ??
    points.filter(point => point.publicationStatus === "pcdf_crs_unverified").length, [data?.unverifiedPcdfPoints, points])
  const heatCells = data?.heat
  const heat = useMemo(() => heatCells ? drawPoints(heatCells, names) : undefined, [heatCells, names])
  const period = dashboard && data ? dashboardPeriod(data, filters) : null
  const timeline = period?.timeline ?? data?.timeline
  const month = timeline?.length === 1 ? timeline[0].key : undefined
  const recordedMonth = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? new Intl.DateTimeFormat("pt-BR", {
    month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`)) : null
  return {
    summary: demo?.summary ?? summaryOf(data && period ? { ...data, timeline: period.timeline } : data, filters.ra),
    natureLinks: data?.natureLinks,
    monthlyVariation: period ? period.variation : formatMonthlyVariation(data, filters),
    coverageNotice: period ? period.notice : coverageNotice(data, filters),
    periodUncovered: period?.uncovered ?? false,
    recordedMonth,
    categoryCounts: data?.byCategory ?? [],
    mapSummary: demo?.mapSummary ?? { total: data?.mapTotal ?? 0, byRa: bucketMap(data?.mappedByRa ?? data?.byRa ?? []) },
    mapRecords: demo?.mapRecords ?? points,
    eligiblePoints: demo?.mapRecords.length ?? data?.eligiblePoints ?? (data?.pointsTruncated ? null : points.length),
    unverifiedPcdfPoints,
    heatReference: persistent ? reference : MOCK_OCCURRENCES,
    heatRecords: persistent ? heat : undefined,
    heatUnavailable: Boolean(data?.heatUnavailable), pointsTruncated: Boolean(data?.pointsTruncated),
    regionOptions: persistent
      ? officialRegions?.map(region => ({ codigo: region.code, nomeDisplay: region.displayName }))
        ?? catalogRegions?.map(region => ({ codigo: region.code, nomeDisplay: region.name })) ?? []
      : RA_LIST,
    catalogOptions: persistent ? { natures: catalog?.natures ?? [], categories: catalog?.categories ?? [] } : undefined,
    officialRegions, officialGeometry: cartography?.geometry, geometryError, pending, error, retry,
    periodLabel: persistent && filters.period !== "custom"
      ? (recordedMonth ? `Dados de ${recordedMonth}` : "Todo o período disponível")
      : demoPeriodLabel(filters),
  }
}
