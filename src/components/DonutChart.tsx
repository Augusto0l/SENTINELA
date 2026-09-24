import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { DONUT_COLORS } from "../data/mockData";

interface DonutChartProps {
  data: { name: string; value: number }[];
  title?: string;
  size?: number;
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { percent: number } }[] }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div style={{ background: "#111d2e", border: "1px solid #1e3a5f", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#f1f5f9" }}>
      <div style={{ fontWeight: 600 }}>{item.name}</div>
      <div style={{ color: "#94a3b8" }}>{item.value.toLocaleString("pt-BR")} ocorrências</div>
      <div style={{ color: "#94a3b8" }}>{(item.payload.percent * 100).toFixed(1)}%</div>
    </div>
  );
};

export default function DonutChart({ data, title, size = 180 }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div>
      {title && (
        <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase" }}>
          {title}
        </div>
      )}
      <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}>
        <PieChart width={size} height={size}>
          <Pie
            data={data}
            cx={size / 2}
            cy={size / 2}
            innerRadius={size * 0.29}
            outerRadius={size * 0.40}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
        {/* Center text */}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9", lineHeight: 1 }}>
            {total.toLocaleString("pt-BR")}
          </div>
          <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>total</div>
        </div>
      </div>
      {/* Legend */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
        {data.slice(0, 5).map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "#94a3b8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.name}
            </span>
            <span style={{ fontSize: 11, color: "#64748b", fontVariantNumeric: "tabular-nums" }}>
              {((item.value / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
