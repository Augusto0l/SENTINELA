"use client"

import { useState } from "react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import type { DashboardData } from "@/contracts/dashboard"
import { number, percent } from "@/features/dashboard/Charts"
import { dayPeriods } from "@/features/dashboard/statistics"
import styles from "@/features/dashboard/Insights.module.css"

export function NatureShiftChart({ ranked, counts }: {
  ranked: { key: string; count: number }[]
  counts: DashboardData["byNatureShift"]
}) {
  const [active, setActive] = useState<{ nature: string; shift: number } | null>(null)
  const rows = ranked.map(({ key, count }) => {
    const parts = dayPeriods.map(period => ({
      ...period, count: counts.find(row => row.nature === key && row.shift === period.shift)?.count ?? 0,
    }))
    return { key, count, parts, known: parts.reduce((sum, part) => sum + part.count, 0) }
  })
  const maximum = Math.max(0, ...rows.map(row => row.known))
  const current = rows.find(row => row.key === active?.nature)
  const part = current?.parts.find(item => item.shift === active?.shift)
  if (!maximum) return <p className={styles.note}>Sem horários disponíveis nas naturezas do ranking.</p>

  return <div className={styles.body}>
    <ul className={styles.legend} aria-label="Turnos">
      {dayPeriods.map(period => <li key={period.shift}><i data-tone={period.tone} aria-hidden="true" />{period.label}</li>)}
    </ul>
    <ol className={styles.shiftList}>
      {rows.map(row => <li key={row.key}>
        <div className={styles.rowLabel}>
          <span>{row.key}</span>
          <strong title={row.known < row.count ? `${number(row.known)} de ${number(row.count)} com horário` : undefined}>{number(row.known)}</strong>
        </div>
        <div className={styles.track}>
          <div className={styles.stack} style={{ width: `${row.known / maximum * 100}%` }}>
            {row.parts.filter(item => item.count > 0).map(item => {
              const label = `${row.key} · ${item.label} · ${number(item.count)} ocorrências (${percent(item.count / row.known)})`
              const show = () => setActive({ nature: row.key, shift: item.shift })
              return <button type="button" key={item.shift} data-tone={item.tone} aria-label={label}
                style={{ flexGrow: item.count }} onPointerEnter={show} onPointerLeave={event => {
                  if (document.activeElement !== event.currentTarget) setActive(null)
                }} onClick={show} onFocus={show} onBlur={() => setActive(null)} />
            })}
          </div>
        </div>
        {row.known < row.count && <small className={styles.muted}>{number(row.count - row.known)} sem horário disponível</small>}
      </li>)}
    </ol>
    <p className={styles.chartDetail} role="tooltip">{current && part
      ? `${current.key} · ${part.label} · ${number(part.count)} ocorrências (${percent(part.count / current.known)})`
      : "Percentual de cada turno entre as ocorrências com horário da mesma natureza."}</p>
  </div>
}

export function AttemptChart({ counts }: { counts: DashboardData["attemptStatus"] }) {
  if (!counts) return <p className={styles.note}>A classificação de consumação e tentativa está indisponível na fonte analítica.</p>
  const rows = [
    { name: "Consumado", value: counts.completed, color: "#268cf5" },
    { name: "Tentado", value: counts.attempted, color: "#e8a517" },
    { name: "Não informado", value: counts.unreported, color: "#849cb6" },
  ].filter(row => row.name !== "Não informado" || row.value > 0)
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  if (!total) return <p className={styles.note}>Sem vínculos de natureza no recorte.</p>

  return <div className={styles.donut}>
    <div className={styles.donutPlot}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart title="Vínculos de natureza por situação" accessibilityLayer>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius="65%" outerRadius="93%" stroke="none" isAnimationActive={false}>
            {rows.map(row => <Cell key={row.name} fill={row.color} />)}
          </Pie>
          <Tooltip contentStyle={{ background: "var(--dash-tooltip)", borderColor: "var(--dash-border)", color: "var(--dash-text)", maxWidth: 130, fontSize: ".8rem" }}
            itemStyle={{ color: "var(--dash-text)", whiteSpace: "normal" }}
            formatter={value => `${number(Number(value))} vínculos (${percent(Number(value) / total)})`} />
        </PieChart>
      </ResponsiveContainer>
      <div className={styles.donutCenter} aria-hidden="true"><strong>{number(total)}</strong><span>vínculos</span></div>
    </div>
    <div>
      <p className={styles.summary}><strong>{number(total)}</strong> vínculos de natureza no recorte</p>
      <ul className={styles.donutLegend} aria-label="Quantidade e percentual dos vínculos por situação">
        {rows.map(row => <li key={row.name}>
          <span><i style={{ background: row.color }} aria-hidden="true" />{row.name}</span>
          <strong>{number(row.value)}</strong><span>{percent(row.value / total)}</span>
        </li>)}
      </ul>
    </div>
  </div>
}
