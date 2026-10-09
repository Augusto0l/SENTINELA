interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  variation?: number;
  accent?: "primary" | "success" | "warning" | "danger";
  icon?: string;
}

const accentColor = {
  primary: "#2563eb",
  success: "#22c55e",
  warning: "#f97316",
  danger: "#ef4444",
};

export default function KpiCard({ label, value, sub, variation, accent = "primary", icon }: KpiCardProps) {
  const color = accentColor[accent];
  const isPositive = variation !== undefined && variation > 0;
  const isNegative = variation !== undefined && variation < 0;

  return (
    <div
      style={{
        background: "#111d2e",
        border: "1px solid #1e3a5f",
        borderTop: `2px solid ${color}`,
        borderRadius: 8,
        padding: "16px 18px",
        flex: 1,
        minWidth: 160,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {icon && <span style={{ fontSize: 14, opacity: 0.6 }}>{icon}</span>}
        <span style={{ fontSize: 10, fontWeight: 600, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em", lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "#64748b" }}>{sub}</div>
      )}
      {variation !== undefined && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginTop: 4,
            fontSize: 12,
            fontWeight: 600,
            color: isPositive ? "#22c55e" : isNegative ? "#ef4444" : "#64748b",
          }}
        >
          {isPositive && <span>▲</span>}
          {isNegative && <span>▼</span>}
          <span>{variation > 0 ? "+" : ""}{variation.toFixed(1)}%</span>
          <span style={{ fontWeight: 400, color: "#475569" }}>vs período anterior</span>
        </div>
      )}
    </div>
  );
}
