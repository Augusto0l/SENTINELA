"use client"

import { useId, useRef, useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { hourLabel, weekdayLabels, weekdays, type Granularity } from "@/features/dashboard/statistics"
import styles from "@/features/Dashboard.module.css"

export const number = (value: number) => value.toLocaleString("pt-BR")
export const percent = (value: number, signed = false) => value.toLocaleString("pt-BR", {
  style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: signed ? "exceptZero" : "auto",
})
const tick = { fill: "var(--dash-muted)", fontSize: 11 }
const tooltip = { background: "var(--dash-tooltip)", border: "1px solid var(--dash-border)", borderRadius: 8, color: "var(--dash-text)" }
const countTooltip = (value: unknown) => number(Number(value))
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
const longFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })
const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "2-digit", year: "numeric", timeZone: "UTC" })

export function EvolutionChart({ data, granularity }: { data: { time: number; count: number | null }[]; granularity: Granularity }) {
  const gradient = useId()
  const fmt = granularity === "monthly" ? monthFormat : dateFormat
  const singleTime = data.length === 1 ? data[0].time : undefined
  const day = 86400000
  return <div className={styles.evolutionChart}>
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} accessibilityLayer title="Evolução das ocorrências" margin={{ top: 12, right: 18, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0089f7" stopOpacity={0.57} />
            <stop offset="100%" stopColor="#0089f7" stopOpacity={0.08} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--dash-grid)" />
        <XAxis dataKey="time" type="number" scale="utc" domain={singleTime === undefined ? ["dataMin", "dataMax"] : [singleTime - day, singleTime + day]}
          ticks={singleTime === undefined ? undefined : [singleTime]} minTickGap={28}
          tick={tick} tickLine={false} axisLine={{ stroke: "var(--dash-border)" }} tickFormatter={value => fmt.format(value)} />
        <YAxis allowDecimals={false} width={46} tick={tick} tickLine={false} axisLine={false} tickFormatter={number} />
        <Tooltip contentStyle={tooltip} itemStyle={{ color: "var(--dash-text)" }} formatter={countTooltip}
          labelFormatter={value => {
            const date = (granularity === "monthly" ? monthFormat : longFormat).format(Number(value))
            return granularity === "weekly" ? `Semana de ${date}` : date
          }} cursor={{ stroke: "var(--dash-cyan)", strokeDasharray: "4 3" }} />
        <Area dataKey="count" name="Ocorrências" type="monotone" stroke="var(--dash-cyan)" strokeWidth={2.4} connectNulls={false}
          fill={`url(#${gradient})`} dot={data.length <= 45 ? { r: data.length === 1 ? 5 : 2.8, fill: "#e7f8ff", stroke: "#09b7fb" } : false}
          activeDot={{ r: 5, fill: "#008cf2", stroke: "#e7f8ff" }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  </div>
}

export function CountBars({ data, title }: { data: { label: string; count: number }[]; title: string }) {
  const gradient = useId()
  const maximum = Math.max(...data.map(row => row.count))
  return <div className={styles.barChart}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} title={title} accessibilityLayer margin={{ top: 18, right: 7, bottom: 0, left: 0 }} barCategoryGap="14%">
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop stopColor="#0898f5" /><stop offset="100%" stopColor="#07558f" /></linearGradient>
          <linearGradient id={gradient + "-peak"} x1="0" x2="0" y1="0" y2="1"><stop stopColor="#04cbe8" /><stop offset="100%" stopColor="#0862ed" /></linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--dash-grid)" />
        <XAxis dataKey="label" interval={0} tick={{ ...tick, fontSize: 10 }} tickLine={false} axisLine={{ stroke: "var(--dash-border)" }} />
        <YAxis allowDecimals={false} width={38} tick={tick} tickLine={false} axisLine={false} tickFormatter={number} />
        <Tooltip contentStyle={tooltip} itemStyle={{ color: "var(--dash-text)" }} formatter={countTooltip} cursor={{ fill: "#0a99f214" }} />
        <Bar dataKey="count" name="Ocorrências" radius={[5, 5, 0, 0]} isAnimationActive={false}>
          {data.map(row => <Cell key={row.label} fill={`url(#${gradient}${row.count === maximum ? "-peak" : ""})`} />)}
          <LabelList position="top" dataKey="count" formatter={value => number(Number(value))} fill="var(--dash-text)" fontSize={10} fontWeight={650} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
}

const heatStops = ["#154977", "#0879af", "#22c8a4", "#b6e551", "#ffd449", "#ff5c66"]
export function heatColor(value: number, maximum: number) {
  if (value === 0) return "var(--dash-empty-cell)"
  const position = (value / maximum) * (heatStops.length - 1)
  const index = Math.min(Math.floor(position), heatStops.length - 2)
  return `color-mix(in srgb, ${heatStops[index + 1]} ${(position - index) * 100}%, ${heatStops[index]})`
}

export function HeatMatrix({ heat }: { heat: number[][] }) {
  const cells = useRef<(HTMLButtonElement | null)[]>([])
  const [tabIndex, setTabIndex] = useState(0)
  const [active, setActive] = useState<number | null>(null)
  const maximum = Math.max(...heat.flat())
  const hours = Array.from({ length: 24 }, (_, hour) => hourLabel(hour))
  const selectedDay = active === null ? null : Math.floor(active / 24)
  const selectedHour = active === null ? null : active % 24
  return <div className={styles.heatLayout}>
    <div className={styles.heatScroll} role="region" aria-label="Matriz Dia × Horário, navegável pelas setas do teclado">
      <table className={styles.heatTable}>
        <caption className="sr-only">Ocorrências por dia da semana e hora do fato</caption>
        <thead><tr><td />{hours.map(hour => <th key={hour} scope="col">{hour}</th>)}</tr></thead>
        <tbody>{heat.map((row, day) => <tr key={weekdays[day]}>
          <th scope="row" aria-label={weekdays[day]}>{weekdayLabels[day]}</th>
          {row.map((count, hour) => {
            const index = day * 24 + hour
            return <td key={hour}>
              <button type="button" aria-label={`${weekdays[day]}, ${hours[hour]}, ${number(count)} ocorrências`}
                ref={element => { cells.current[index] = element }}
                tabIndex={index === tabIndex ? 0 : -1} style={{ background: heatColor(count, maximum) }}
                onFocus={() => { setTabIndex(index); setActive(index) }} onBlur={() => setActive(null)}
                onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)}
                onClick={() => setActive(index)}
                onKeyDown={event => {
                  const nextRow = event.key === "ArrowUp" ? day - 1 : event.key === "ArrowDown" ? day + 1 : day
                  const nextHour = event.key === "ArrowLeft" ? hour - 1 : event.key === "ArrowRight" ? hour + 1 : hour
                  if (nextRow === day && nextHour === hour) return
                  event.preventDefault()
                  if (nextRow >= 0 && nextRow < 7 && nextHour >= 0 && nextHour < 24) cells.current[nextRow * 24 + nextHour]?.focus()
                }} />
            </td>
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <div className={styles.heatAside}>
      <div className={styles.heatLegend}>
        <span>Nº de ocorrências</span>
        <div aria-hidden="true" style={{ background: `linear-gradient(90deg, var(--dash-empty-cell), ${heatStops.join(",")})` }} />
        <div className={styles.legendValues}><span>0</span><span>{number(maximum)}</span></div>
      </div>
      <p className={styles.heatDetail} aria-live="polite">{selectedDay === null || selectedHour === null ? "Explore as células para ver os valores."
        : <><strong>{weekdays[selectedDay]}, {hours[selectedHour]}</strong><br />{number(heat[selectedDay][selectedHour])} ocorrências</>}</p>
    </div>
  </div>
}
