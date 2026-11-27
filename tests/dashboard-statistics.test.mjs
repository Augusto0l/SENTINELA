import assert from "node:assert/strict"
import test from "node:test"
import { coverageRanges, intervalCoverage, previousPeriod, regionalDailySeries, timeSeries, timeStatistics } from "../src/features/dashboard/statistics.ts"

test("Dashboard exige cobertura contínua nos dois intervalos de mesma duração", () => {
  const coverage = coverageRanges([
    { key: "2021-04", status: "complete", through: "2021-04-30" },
    { key: "2021-01", status: "complete", through: "2021-01-31" },
    { key: "2021-02", status: "partial", through: "2021-02-12" },
    { key: "2021-03", status: "not_imported", through: "2021-03-31" },
  ])
  assert.deepEqual(coverage, [
    { start: "2021-01-01", end: "2021-02-12" },
    { start: "2021-04-01", end: "2021-04-30" },
  ])
  assert.deepEqual(previousPeriod({ start: "2021-02-01", end: "2021-02-12" }, coverage), {
    start: "2021-01-20", end: "2021-01-31",
  })
  assert.equal(previousPeriod({ start: "2021-02-01", end: "2021-02-13" }, coverage), null)
  assert.equal(previousPeriod({ start: "2021-04-01", end: "2021-04-15" }, coverage), null)
  assert.equal(intervalCoverage({ start: "2021-03-01", end: "2021-03-31" }, coverage), "unknown")
  assert.equal(intervalCoverage({ start: "2021-02-12", end: "2021-02-15" }, coverage), "partial")
})

test("Séries do Dashboard distinguem zero observado de um mês sem cobertura", () => {
  const result = {
    days: [{ key: "2021-01-31", count: 7 }, { key: "2021-03-01", count: 8 }],
    period: { start: "2021-01-30", end: "2021-03-01" },
    coverage: [{ start: "2021-01-30", end: "2021-01-31" }, { start: "2021-03-01", end: "2021-03-01" }],
  }
  const list = (granularity) => timeSeries(result, granularity).map(({ time, count }) => [new Date(time).toISOString().slice(0, 10), count])
  assert.deepEqual(list("daily"), [["2021-01-30", 0], ["2021-01-31", 7], ["2021-02-01", null], ["2021-03-01", 8]])
  assert.deepEqual(list("weekly"), [["2021-01-25", 7], ["2021-02-01", null], ["2021-03-01", 8]])
  assert.deepEqual(list("monthly"), [["2021-01-01", 7], ["2021-02-01", null], ["2021-03-01", 8]])
})

test("Grupos de horário contabilizam as fronteiras dos períodos sem duplicar registros", () => {
  const { byDay, byHour, byPeriod, heat, knownTime } = timeStatistics({
    days: [{ key: "2021-01-03", count: 19 }],
    cells: [
      { day: 6, hour: 0, count: 2 }, { day: 6, hour: 6, count: 3 },
      { day: 6, hour: 12, count: 5 }, { day: 6, hour: 18, count: 7 },
    ],
  })
  assert.equal(byDay[6].count, 19)
  assert.deepEqual(byHour.map(row => row.count), [2, 0, 3, 0, 5, 0, 7, 0])
  assert.deepEqual(byPeriod.map(row => row.count), [3, 5, 7, 2])
  assert.equal(heat[6][18], 7)
  assert.equal(knownTime, 17)
})

test("Evolução por RA preserva os zeros cobertos e as lacunas sem confirmação", () => {
  const result = regionalDailySeries({
    period: { start: "2021-01-01", end: "2021-01-04" },
    coverage: [{ start: "2021-01-01", end: "2021-01-02" }],
    days: [{ key: "2021-01-01", count: 12 }, { key: "2021-01-04", count: 7 }],
    dailyRegions: ["RA-I", "RA-II"],
    byRaDay: [
      { day: "2021-01-01", counts: { "RA-I": 4 } },
      { day: "2021-01-04", counts: { "RA-II": 3 } },
    ],
  })
  assert.deepEqual(result.map(({ counts }) => counts), [
    { "RA-I": 4, "RA-II": 0 },
    { "RA-I": 0, "RA-II": 0 },
    { "RA-I": null, "RA-II": null },
    { "RA-I": null, "RA-II": 3 },
  ])
})
