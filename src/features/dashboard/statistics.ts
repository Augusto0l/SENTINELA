import type { DashboardData, DateRange, MonthCoverage } from "@/contracts/dashboard"

const oneDay = 86400000
const timestamp = (date: string) => Date.parse(`${date}T00:00:00Z`)
const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10)
export const shiftDay = (date: string, days: number) => isoDay(timestamp(date) + days * oneDay)

export function coverageRanges(months: MonthCoverage[]) {
  const ranges: DateRange[] = []
  for (const month of [...months].sort((a, b) => a.key.localeCompare(b.key))) {
    if (month.status === "not_imported") continue
    const start = `${month.key}-01`
    const last = ranges.at(-1)
    if (last && shiftDay(last.end, 1) === start) last.end = month.through
    else ranges.push({ start, end: month.through })
  }
  return ranges
}

export function intervalCoverage(period: DateRange, coverage: DateRange[]) {
  if (coverage.some(({ start, end }) => start <= period.start && end >= period.end)) return "complete"
  return coverage.some(({ start, end }) => start <= period.end && end >= period.start) ? "partial" : "unknown"
}

export function previousPeriod(period: DateRange, coverage: DateRange[]): DateRange | null {
  const duration = (timestamp(period.end) - timestamp(period.start)) / oneDay + 1
  const firstCovered = coverage[0]
  const previousStart = timestamp(period.start) - duration * oneDay
  if (!firstCovered || previousStart < timestamp(firstCovered.start)) return null
  const previous = { start: isoDay(previousStart), end: shiftDay(period.start, -1) }
  return coverage.some(({ start, end }) => start <= previous.start && end >= period.end) ? previous : null
}

export const weekdays = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"]
export const weekdayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
export const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}h`
const weekDay = (time: number) => (new Date(time).getUTCDay() + 6) % 7
export const dayPeriods = [
  { label: "Manhã", icon: "sun", tone: "cyan", hours: "06h–12h", shift: 1 },
  { label: "Tarde", icon: "sun", tone: "green", hours: "12h–18h", shift: 2 },
  { label: "Noite", icon: "moon", tone: "purple", hours: "18h–24h", shift: 3 },
  { label: "Madrugada", icon: "sunrise", tone: "amber", hours: "00h–06h", shift: 0 },
] as const

export function timeStatistics({ days, cells }: DashboardData) {
  const byDay = weekdayLabels.map(label => ({ label, count: 0 }))
  const byHour = Array.from({ length: 8 }, (_, i) => ({ label: `${hourLabel(i * 3).slice(0, 2)}–${hourLabel(i * 3 + 3)}`, count: 0 }))
  const byPeriod = dayPeriods.map(period => ({ ...period, count: 0 }))
  const heat = weekdays.map(() => Array<number>(24).fill(0))
  for (const { key, count } of days) byDay[weekDay(timestamp(key))].count += count
  for (const { day, hour, count } of cells) {
    heat[day][hour] = count
    byHour[Math.floor(hour / 3)].count += count
    byPeriod[(Math.floor(hour / 6) + 3) % 4].count += count
  }
  const knownTime = byHour.reduce((sum, row) => sum + row.count, 0)
  return { byDay, byHour, byPeriod, heat, knownTime }
}

export type Granularity = "daily" | "weekly" | "monthly"
export function timeSeries({ days, period, coverage }: DashboardData, granularity: Granularity) {
  if (!period) return []
  const values = new Map(days.map(({ key, count }) => [key, count]))
  const bins = new Map<string, number>()
  for (const { start, end } of coverage) {
    for (let time = Math.max(timestamp(start), timestamp(period.start)); time <= Math.min(timestamp(end), timestamp(period.end)); time += oneDay) {
      const key = isoDay(time)
      if (!values.has(key)) values.set(key, 0)
    }
  }
  const bucket = (day: string) => granularity === "monthly" ? `${day.slice(0, 7)}-01`
    : granularity === "weekly" ? shiftDay(day, -weekDay(timestamp(day))) : day
  for (const [date, count] of values) {
    const key = bucket(date)
    bins.set(key, (bins.get(key) ?? 0) + count)
  }
  const nextBucket = (day: string) => granularity === "monthly"
    ? isoDay(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 1))
    : shiftDay(day, granularity === "weekly" ? 7 : 1)
  const series: { time: number; count: number | null }[] = []
  const dates = [...bins.keys()].sort()
  for (const [index, date] of dates.entries()) {
    const previous = dates[index - 1]
    if (previous && nextBucket(previous) < date) series.push({ time: timestamp(nextBucket(previous)), count: null })
    series.push({ time: timestamp(date), count: bins.get(date) ?? 0 })
  }
  return series
}

export function regionalDailySeries(data: DashboardData) {
  const recorded = new Map(data.byRaDay.map(({ day, counts }) => [day, counts]))
  return timeSeries(data, "daily").map(({ time }) => {
    const day = isoDay(time)
    const covered = data.coverage.some(({ start, end }) => start <= day && day <= end)
    return {
      time,
      counts: Object.fromEntries(data.dailyRegions.map(ra => [ra, recorded.get(day)?.[ra] ?? (covered ? 0 : null)])),
    }
  })
}
