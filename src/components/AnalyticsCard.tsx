import { LineChart, Line, Tooltip } from "recharts";

interface AnalyticsCardProps {
  label: string;
  value: string;
  sub?: string;
  variation?: number;
  sparkData?: number[];
  color?: string;
}

export default function AnalyticsCard({ label, value, sub, variation, sparkData, color = "#2563eb" }: AnalyticsCardProps) {
  const isPositive = variation !== undefined && variation > 0;
  const chartData = sparkData?.map((v, i) => ({ i, v })) ?? [];

  return (
    <div style={{ background: "#111d2e", border: "1px solid #1e3a5f", borderRadius: 8, padding: "14px 16px", marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", lineHeight: 1 }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{sub}</div>}
          {variation !== undefined && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 12, fontWeight: 600, color: isPositive ? "#22c55e" : "#ef4444" }}>
              {isPositive ? "▲" : "▼"}
              {variation > 0 ? "+" : ""}{variation.toFixed(1)}%
            </div>
          )}
        </div>
        {chartData.length > 0 && (
          <LineChart width={80} height={40} data={chartData} style={{ flexShrink: 0 }}>
            <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Tooltip contentStyle={{ display: "none" }} itemStyle={{ display: "none" }} />
          </LineChart>
        )}
      </div>
    </div>
  );
}
