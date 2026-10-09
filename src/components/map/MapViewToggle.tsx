import type { MapMode } from "./DFMap";
export type { MapMode };

interface MapViewToggleProps {
  mode: MapMode;
  onChange: (m: MapMode) => void;
}

const options: { key: MapMode; label: string; icon: string }[] = [
  { key: "heatmap", label: "Mapa de calor", icon: "◉" },
  { key: "points", label: "Pontos", icon: "•" },
  { key: "clusters", label: "Clusters", icon: "⊙" },
];

export default function MapViewToggle({ mode, onChange }: MapViewToggleProps) {
  return (
    <div style={{
      display: "flex",
      background: "rgba(13,22,38,0.92)",
      border: "1px solid #1e3a5f",
      borderRadius: 7,
      overflow: "hidden",
    }}>
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          style={{
            background: mode === opt.key ? "#2563eb" : "transparent",
            border: "none",
            borderRight: opt.key !== "clusters" ? "1px solid #1e3a5f" : "none",
            color: mode === opt.key ? "#fff" : "#64748b",
            fontSize: 12,
            fontWeight: mode === opt.key ? 600 : 400,
            padding: "7px 14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontFamily: "Inter, sans-serif",
            transition: "all 0.15s",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: 14 }}>{opt.icon}</span>
          {opt.label}
        </button>
      ))}
    </div>
  );
}
