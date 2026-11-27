"use client";
import { useId } from "react";
import { AreaChart, Area, CartesianGrid, LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import styles from "@/components/analytics/Analytics.module.css";
import dashboardStyles from "@/components/analytics/DashboardCharts.module.css";

const formatMonth = (month: string | number) => String(month).split("-").reverse().join("/");
const tooltipStyle = { background: "var(--theme-111d2e)", borderColor: "var(--theme-1e3a5f)", color: "var(--theme-f1f5f9)" };
const axisTick = { fill: "var(--theme-94a3b8)", fontSize: 10 };
const monthIndex = (month: string) => { const [year, number] = month.split("-").map(Number); return year * 12 + number - 1; };

function includeMonthlyGaps(timeline: { month: string; count: number }[]) {
  const counts = new Map(timeline.map(row => [monthIndex(row.month), row]));
  const first = monthIndex(timeline[0].month);
  const last = monthIndex(timeline.at(-1)!.month);
  return Array.from({ length: last - first + 1 }, (_, offset) => {
    const index = first + offset;
    const month = `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
    return counts.get(index) ?? { month, count: null };
  });
}

export default function PeriodTrend({ timeline, showVariation = false, dashboard = false }: { timeline: { month: string; count: number }[]; showVariation?: boolean; dashboard?: boolean }) {
  const gradientId = useId();
  if (!timeline.length) return <p className={styles.empty}>Sem ocorrências para exibir a evolução temporal.</p>;
  const latest = timeline.at(-1)!, previous = timeline.at(-2);
  const series = dashboard ? includeMonthlyGaps(timeline) : timeline;
  const variation = previous && previous.count > 0 && monthIndex(latest.month) - monthIndex(previous.month) === 1
    ? (latest.count - previous.count) / previous.count : null;
  return <div>
    <div className={dashboard ? dashboardStyles.trendDashboard : styles.trend} aria-hidden={dashboard ? undefined : true}>
      <ResponsiveContainer width="100%" height="100%">
        {dashboard ? <AreaChart data={series} accessibilityLayer title="Série mensal de ocorrências" margin={{ top: 10, right: 14, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#188bff" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#188bff" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--theme-1e3a5f)" strokeOpacity={0.65} />
          <XAxis dataKey="month" tickFormatter={formatMonth} tick={axisTick} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis allowDecimals={false} width={44} tick={axisTick} axisLine={false} tickLine={false} tickFormatter={value => Number(value).toLocaleString("pt-BR")} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={value => formatMonth(String(value))}
            formatter={value => Number(value).toLocaleString("pt-BR")}
            cursor={{ stroke: "#248aff", strokeOpacity: 0.55 }}
          />
          <Area
            dataKey="count"
            name="Ocorrências"
            connectNulls={false}
            stroke="#2c96ff"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={{ r: 3, fill: "#52aaff", strokeWidth: 0 }}
            activeDot={{ r: 5, stroke: "#e8f4ff", strokeWidth: 1 }}
            isAnimationActive={false}
          />
        </AreaChart> : <LineChart data={timeline} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
          <XAxis dataKey="month" tickFormatter={formatMonth} tick={axisTick} />
          <YAxis allowDecimals={false} tick={axisTick} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line dataKey="count" name="Ocorrências" stroke="#2563eb" strokeWidth={2} isAnimationActive={false} />
        </LineChart>}
      </ResponsiveContainer>
    </div>
    {showVariation && <p className={styles.applied}>{variation === null ? "Sem base mensal comparável."
      : `${variation.toLocaleString("pt-BR", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" })} entre os dois últimos meses consecutivos do recorte.`}</p>}
    <details className={styles.series}><summary>Série mensal em tabela</summary><table className="compact-table"><caption>Ocorrências por mês no recorte aplicado</caption><thead><tr><th scope="col">Mês</th><th scope="col">Ocorrências</th></tr></thead><tbody>{series.map(item => <tr key={item.month}><th scope="row">{formatMonth(item.month)}</th><td>{item.count ?? "Sem dados"}</td></tr>)}</tbody></table></details>
  </div>;
}
