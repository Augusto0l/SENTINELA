import type { PersistentAnalyticsData } from "@/contracts/persistent-analytics"
import type { DemoFilters } from "@/data/demoAnalytics"

export function dashboardPeriod(data: PersistentAnalyticsData, filters: DemoFilters) {
  const coverage = data.monthCoverage?.filter(({ key }) => filters.period !== "custom"
    || (key >= filters.startDate.slice(0, 7) && key <= filters.endDate.slice(0, 7)))
  if (!coverage?.length) {
    const uncovered = Boolean(data.monthCoverage?.length && data.total === 0)
    return { timeline: data.timeline, variation: null, uncovered,
      notice: uncovered ? "Sem dados disponíveis no período" : undefined }
  }
  const imported = coverage.filter(month => month.status !== "not_imported")
  const covered = imported.filter(month => filters.period !== "custom" || filters.startDate <= month.through)
  const counts = new Map(data.timeline.map(({ key, count }) => [key, count]))
  // A zero is known only for a covered month whose dates overlap the query.
  for (const month of covered) {
    if (!counts.has(month.key)) counts.set(month.key, 0)
  }
  const timeline = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => ({ key, count }))
  const endingMonth = filters.period === "custom" ? coverage.at(-1) : imported.at(-1)
  const lastIndex = endingMonth ? coverage.indexOf(endingMonth) : -1
  const previous = lastIndex > 0 ? coverage[lastIndex - 1] : undefined
  const previousCount = previous ? counts.get(previous.key) : undefined
  const latestCount = endingMonth ? counts.get(endingMonth.key) : undefined
  const monthNumber = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7))
  const comparable = previous?.status === "complete" && endingMonth?.status === "complete"
    && monthNumber(endingMonth.key) - monthNumber(previous.key) === 1
    && (filters.period !== "custom" || (filters.startDate <= previous.key + "-01"
      && filters.endDate >= endingMonth.through && filters.endDate.startsWith(endingMonth.key)))
  const variation = comparable && previousCount && latestCount !== undefined
    ? ((latestCount - previousCount) / previousCount).toLocaleString("pt-BR",
      { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" })
    : null
  const pending = coverage.length - imported.length
  const partial = imported.filter(month => month.status === "partial").at(-1)
  const notice = !imported.length ? (pending === 1 ? "Competência ainda sem importação" : "Competências ainda sem importação")
    : partial ? `Dados parciais até ${partial.through.split("-").reverse().join("/")}`
    : filters.period === "custom" && pending ? `${pending} ${pending === 1 ? "competência ainda sem importação" : "competências ainda sem importação"}`
    : data.total === 0 ? "Sem ocorrências nas competências importadas" : undefined
  return { timeline, variation, notice, uncovered: !covered.length && data.total === 0 }
}
