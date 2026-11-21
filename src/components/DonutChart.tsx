import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { DONUT_COLORS } from "@/data/mockData";
import styles from "@/components/analytics/DashboardCharts.module.css";

interface DonutChartProps {
  data: { name: string; value: number }[];
  title?: string;
  size?: number;
  dashboard?: boolean;
}

const dashboardColors = ["#248aff", "#2ad4a1", "#f2a536", "#9374fc", "#567295"];
const associationShare = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

const CustomTooltip = ({ active, payload, associationTotal }: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { percent: number } }[];
  associationTotal?: number;
}) => {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const dashboard = associationTotal !== undefined;
  const countLabel = dashboard ? (item.value === 1 ? "associação" : "associações") : "ocorrências";
  const shareLabel = dashboard
    ? associationTotal ? `${associationShare.format(item.value / associationTotal)} das associações` : "—"
    : `${(item.payload.percent * 100).toFixed(1)}%`;
  return (
    <div style={{ background: "var(--theme-111d2e)", border: "1px solid var(--theme-1e3a5f)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--theme-f1f5f9)" }}>
      <div style={{ fontWeight: 600 }}>{item.name}</div>
      <div style={{ color: "var(--theme-94a3b8)" }}>{item.value.toLocaleString("pt-BR")} {countLabel}</div>
      <div style={{ color: "var(--theme-94a3b8)" }}>{shareLabel}</div>
    </div>
  );
};

export default function DonutChart({ data, title, size = 180, dashboard = false }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const items = dashboard && data.length > 5
    ? [...data.slice(0, 4), { name: "Demais naturezas", value: data.slice(4).reduce((sum, item) => sum + item.value, 0) }]
    : data;
  const colors = dashboard ? dashboardColors : DONUT_COLORS;
  const chart = <PieChart width={dashboard ? undefined : size} height={dashboard ? undefined : size}>
    <Pie
      data={items}
      cx={dashboard ? "50%" : size / 2}
      cy={dashboard ? "50%" : size / 2}
      innerRadius={dashboard ? "64%" : size * 0.29}
      outerRadius={dashboard ? "94%" : size * 0.40}
      paddingAngle={2}
      dataKey="value"
      stroke="none"
      isAnimationActive={dashboard ? false : undefined}
    >
      {items.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
    </Pie>
    <Tooltip content={<CustomTooltip associationTotal={dashboard ? total : undefined} />} />
  </PieChart>;

  if (dashboard) return (
    <div>
      <div className={styles.donut}>
        <div className={styles.donutPlot} style={{ maxWidth: size }}>
          <ResponsiveContainer width="100%" aspect={1}>{chart}</ResponsiveContainer>
          <div className={styles.donutCenter}>
            <strong>{total.toLocaleString("pt-BR")}</strong>
            <span>associações</span>
          </div>
        </div>
        <ul className={styles.donutLegend} aria-label="Participação nas associações por natureza">
          {items.map((item, i) => (
            <li key={i}>
              <span className={styles.donutSwatch} style={{ background: colors[i % colors.length] }} aria-hidden="true" />
              <span className={styles.donutName} title={item.name}>{item.name}</span>
              <span className={styles.donutShare}>{total ? associationShare.format(item.value / total) : "—"}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className={styles.chartNote}>Percentuais sobre as associações. Uma ocorrência pode ter mais de uma natureza.</p>
    </div>
  );

  return (
    <div>
      {title && (
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase" }}>
          {title}
        </div>
      )}
      <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}>
        {chart}
        {/* Center text */}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--theme-f1f5f9)", lineHeight: 1 }}>
            {total.toLocaleString("pt-BR")}
          </div>
          <div style={{ fontSize: 9, color: "var(--theme-94a3b8)", marginTop: 2 }}>categorias exibidas</div>
        </div>
      </div>
      {/* Legend */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
        {data.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "var(--theme-94a3b8)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.name}
            </span>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontVariantNumeric: "tabular-nums" }}>
              {((item.value / (total || 1)) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
