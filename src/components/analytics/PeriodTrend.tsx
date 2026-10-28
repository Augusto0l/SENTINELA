"use client";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import styles from "@/components/analytics/Analytics.module.css";

export default function PeriodTrend({ timeline }: { timeline: { month: string; count: number }[] }) {
  if (!timeline.length) return <p className={styles.empty}>Sem ocorrências para exibir a evolução temporal.</p>;
  return <div>
    <div className={styles.trend} aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><LineChart data={timeline} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
      <XAxis dataKey="month" tickFormatter={value => String(value).split("-").reverse().join("/")} tick={{ fill: "var(--theme-94a3b8)", fontSize: 10 }} />
      <YAxis allowDecimals={false} tick={{ fill: "var(--theme-94a3b8)", fontSize: 10 }} />
      <Tooltip contentStyle={{ background: "var(--theme-111d2e)", borderColor: "var(--theme-1e3a5f)", color: "var(--theme-f1f5f9)" }} />
      <Line dataKey="count" name="Ocorrências" stroke="#2563eb" strokeWidth={2} isAnimationActive={false} />
    </LineChart></ResponsiveContainer></div>
    <details className={styles.series}><summary>Série mensal em tabela</summary><table className="compact-table"><caption>Ocorrências por mês no recorte aplicado</caption><thead><tr><th scope="col">Mês</th><th scope="col">Ocorrências</th></tr></thead><tbody>{timeline.map(item => <tr key={item.month}><th scope="row">{item.month.split("-").reverse().join("/")}</th><td>{item.count}</td></tr>)}</tbody></table></details>
  </div>;
}
