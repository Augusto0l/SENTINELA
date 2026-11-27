"use client"

import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { DashboardData } from "@/contracts/dashboard"
import { heatColor, number, percent } from "@/features/dashboard/Charts"
import { regionalDailySeries } from "@/features/dashboard/statistics"
import styles from "@/features/dashboard/Insights.module.css"

type RegionTotal = { id: string; name: string; count: number }
const lineColors = ["#16c8f4", "#5edcb0", "#f4bc4d", "#b590ff", "#fd88aa"]
const tick = { fill: "var(--dash-muted)", fontSize: 11 }
const tooltipStyle = { background: "var(--dash-tooltip)", borderColor: "var(--dash-border)", borderRadius: 8, color: "var(--dash-text)" }
const dateLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
const fullDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })

export function RegionalEvolution({ data, selectedCount }: { data: DashboardData; selectedCount: number }) {
  const series = useMemo(() => regionalDailySeries(data), [data])
  const names = new Map(data.regions.map(region => [region.id, region.name]))
  const dates = series.length === 1 ? [series[0].time - 86400000, series[0].time + 86400000] : undefined
  const lines = data.dailyRegions.map((ra, index) => ({ ra, name: names.get(ra) ?? ra, color: lineColors[index] }))
  if (!lines.length || !series.some(row => Object.values(row.counts).some(value => value !== null))) {
    return <p className={styles.note}>Sem ocorrências com data e atribuição espacial no recorte.</p>
  }

  return <div className={styles.body}>
    {selectedCount > 5 && <p className={styles.summary}>Exibindo as 5 RAs de maior volume entre {selectedCount} selecionadas.</p>}
    <div className={styles.linePlot}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} title="Evolução diária de ocorrências únicas por RA" accessibilityLayer
          margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--dash-grid)" />
          <XAxis dataKey="time" type="number" scale="utc" domain={dates ?? ["dataMin", "dataMax"]} ticks={dates ? [series[0].time] : undefined}
            tick={tick} tickLine={false} minTickGap={22} tickFormatter={value => dateLabel.format(value)} />
          <YAxis tick={tick} allowDecimals={false} axisLine={false} tickLine={false} width={41} tickFormatter={number} />
          <Tooltip contentStyle={{ ...tooltipStyle, maxWidth: "min(250px, 72vw)" }} labelFormatter={value => fullDate.format(Number(value))}
            itemStyle={{ color: "var(--dash-text)", whiteSpace: "normal" }} formatter={value => number(Number(value))} />
          {lines.map(line => <Line key={line.ra} dataKey={`counts.${line.ra}`} name={line.name} stroke={line.color}
            type="linear" strokeWidth={2} connectNulls={false} dot={series.length === 1 ? { r: 4 } : false}
            activeDot={{ r: 4 }} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
    <ul className={styles.legend} aria-label="Regiões na evolução">
      {lines.map(line => <li key={line.ra}><i style={{ background: line.color }} aria-hidden="true" />{line.name}</li>)}
    </ul>
  </div>
}

export function RegionalNatureRanking({ regions, counts }: { regions: RegionTotal[]; counts: DashboardData["byRaNature"] }) {
  const [requested, setRequested] = useState("")
  const region = regions.find(item => item.id === requested) ?? regions[0]
  const ranking = counts.filter(row => row.ra === region?.id)
    .sort((a, b) => b.count - a.count || a.nature.localeCompare(b.nature, "pt-BR")).slice(0, 5)
  if (!region) return <p className={styles.note}>Sem ocorrências com atribuição espacial no recorte.</p>
  return <div className={styles.body}>
    <label className={styles.regionSelect}>RA do ranking
      <select value={region.id} onChange={event => setRequested(event.target.value)}>
        {regions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    <p className={styles.summary}>{number(region.count)} ocorrências únicas na RA · atribuição espacial provisória</p>
    {ranking.length ? <ol className={styles.shiftList}>
      {ranking.map(row => <li key={row.nature}>
        <div className={styles.rowLabel}><span>{row.nature}</span><strong>{number(row.count)} · {percent(row.count / region.count)}</strong></div>
        <div className={styles.track} aria-hidden="true"><div className={styles.rankBar} style={{ width: `${100 * row.count / ranking[0].count}%` }} /></div>
      </li>)}
    </ol> : <p className={styles.summary}>Sem naturezas no recorte desta RA.</p>}
  </div>
}

const pageSize = 5

export function RegionalComparison({ regions, filtered }: { regions: RegionTotal[]; filtered: boolean }) {
  const [page, setPage] = useState(0)
  const pageCount = Math.ceil(regions.length / pageSize)
  const shownPage = Math.max(0, Math.min(page, pageCount - 1))
  const shown = regions.slice(shownPage * pageSize, (shownPage + 1) * pageSize)
    .map((row, index) => ({ ...row, column: shownPage * pageSize + index + 1 }))
  const total = regions.reduce((sum, row) => sum + row.count, 0)
  const maxCount = Math.max(1, ...regions.map(row => row.count))
  if (!shown.length) return <p className={styles.note}>Sem ocorrências com atribuição espacial no recorte.</p>
  return <div className={styles.body}>
    <p className={styles.summary}>
      {regions.length === 1 ? `${regions[0].name} · ` : filtered ? `${regions.length} RAs selecionadas · ` : "RAs com atribuição espacial · "}
      {number(total)} ocorrências únicas
    </p>
    <div className={styles.comparisonPlot}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={shown} title="Comparação de ocorrências únicas por RA" accessibilityLayer margin={{ top: 18, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--dash-grid)" />
          <XAxis dataKey="column" tick={tick} tickLine={false} />
          <YAxis tick={tick} allowDecimals={false} axisLine={false} tickLine={false} width={42} domain={[0, maxCount]} tickFormatter={number} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "var(--dash-text)" }}
            labelFormatter={column => shown.find(row => row.column === Number(column))?.name ?? ""}
            formatter={value => total ? `${number(Number(value))} · ${percent(Number(value) / total)}` : number(Number(value))} />
          <Bar dataKey="count" name="Ocorrências únicas" maxBarSize={64} fill="#168dea" radius={[5, 5, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="count" position="top" formatter={value => number(Number(value))} fill="var(--dash-text)" fontSize={11} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    <ol start={shownPage * pageSize + 1} className={styles.regionList}>
      {shown.map(row => <li key={row.id}><span>{row.name}</span><strong>{number(row.count)}{total > 0 && ` · ${percent(row.count / total)}`}</strong></li>)}
    </ol>
    {pageCount > 1 && <div className={styles.pagination}>
      <button type="button" disabled={shownPage === 0} onClick={() => setPage(shownPage - 1)}>RAs anteriores</button>
      <span aria-live="polite">{shownPage + 1}/{pageCount}</span>
      <button type="button" disabled={shownPage === pageCount - 1} onClick={() => setPage(shownPage + 1)}>Próximas RAs</button>
    </div>}
  </div>
}

export function RegionalNatureMatrix({ regions, counts }: { regions: RegionTotal[]; counts: DashboardData["byRaNature"] }) {
  const [active, setActive] = useState<{ ra: string; nature: string } | null>(null)
  const totals = new Map<string, number>()
  const cells = new Map<string, Map<string, number>>()
  for (const { ra, nature, count } of counts) {
    totals.set(nature, (totals.get(nature) ?? 0) + count)
    const row = cells.get(ra) ?? new Map<string, number>()
    row.set(nature, count)
    cells.set(ra, row)
  }
  const natures = [...totals].sort(([a, aCount], [b, bCount]) => bCount - aCount || a.localeCompare(b, "pt-BR"))
    .slice(0, 5).map(([name]) => name)
  if (!regions.length || !natures.length) return <p className={styles.note}>Sem naturezas com atribuição espacial no recorte.</p>
  const cellCount = (ra: string, nature: string) => cells.get(ra)?.get(nature) ?? 0
  const maximum = Math.max(...regions.flatMap(region => natures.map(nature => cellCount(region.id, nature))))
  const described = active && regions.find(row => row.id === active.ra)
  return <div className={styles.body}>
    <div className={styles.matrixScroll} role="region" aria-label="Matriz de ocorrências por RA e natureza">
      <table className={styles.matrix}>
        <caption className="sr-only">Ocorrências distintas por RA e natureza original da PCDF</caption>
        <thead><tr><th scope="col">RA</th>{natures.map(nature => <th key={nature} scope="col">{nature}</th>)}</tr></thead>
        <tbody>{regions.map(region => <tr key={region.id}>
          <th scope="row">{region.name}</th>
          {natures.map(nature => {
            const count = cellCount(region.id, nature)
            const show = () => setActive({ ra: region.id, nature })
            const color = count === 0 ? undefined : count / maximum >= .30 ? "#071628" : "#f1f6fd"
            return <td key={nature}><button type="button" style={{ background: heatColor(count, maximum), color }}
              aria-label={`${region.name} · ${nature} · ${number(count)} ocorrências`}
              onPointerEnter={show} onPointerLeave={event => {
                if (event.currentTarget !== document.activeElement) setActive(null)
              }} onClick={show} onFocus={show} onBlur={() => setActive(null)}>{number(count)}</button></td>
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <p className={styles.chartDetail} role="tooltip">{active && described && natures.includes(active.nature)
      ? `${described.name} · ${active.nature} · ${number(cellCount(described.id, active.nature))} ocorrências`
      : `Ocorrências por célula · de 0 a ${number(maximum)}`}</p>
  </div>
}
