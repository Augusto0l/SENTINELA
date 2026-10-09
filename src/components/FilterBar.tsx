import { RA_LIST, CRIME_NATURES, PERIODS, HOURS, WEEKDAYS } from "../data/mockData";

interface Filters {
  period: string;
  region: string;
  nature: string;
  hour: string;
  weekday?: string;
}

interface FilterBarProps {
  filters: Filters;
  onChange: (f: Filters) => void;
  showWeekday?: boolean;
}

const selectStyle: React.CSSProperties = {
  background: "#111d2e",
  border: "1px solid #1e3a5f",
  borderRadius: 6,
  color: "#94a3b8",
  fontSize: 12,
  padding: "6px 10px",
  cursor: "pointer",
  outline: "none",
  minWidth: 130,
};

export default function FilterBar({ filters, onChange, showWeekday }: FilterBarProps) {
  const set = (k: keyof Filters, v: string) => onChange({ ...filters, [k]: v });

  return (
    <div
      style={{
        background: "#0d1626",
        borderBottom: "1px solid #1e3a5f",
        padding: "10px 24px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 11, color: "#475569", fontWeight: 600, letterSpacing: "0.06em", marginRight: 4 }}>FILTROS</span>

      <select style={selectStyle} value={filters.period} onChange={(e) => set("period", e.target.value)}>
        {PERIODS.map((p) => (
          <option key={p.value} value={p.value} style={{ background: "#111d2e" }}>
            {p.label}
          </option>
        ))}
      </select>

      <select style={selectStyle} value={filters.region} onChange={(e) => set("region", e.target.value)}>
        <option value="" style={{ background: "#111d2e" }}>Todas as regiões</option>
        {RA_LIST.map((ra) => (
          <option key={ra.codigo} value={ra.nomeDisplay} style={{ background: "#111d2e" }}>
            {ra.nomeCompleto}
          </option>
        ))}
      </select>

      <select style={selectStyle} value={filters.nature} onChange={(e) => set("nature", e.target.value)}>
        <option value="" style={{ background: "#111d2e" }}>Todas as naturezas</option>
        {CRIME_NATURES.map((n) => (
          <option key={n} value={n} style={{ background: "#111d2e" }}>{n}</option>
        ))}
      </select>

      <select style={selectStyle} value={filters.hour} onChange={(e) => set("hour", e.target.value)}>
        {HOURS.map((h) => (
          <option key={h.value} value={h.value} style={{ background: "#111d2e" }}>{h.label}</option>
        ))}
      </select>

      {showWeekday && (
        <select style={selectStyle} value={filters.weekday ?? ""} onChange={(e) => set("weekday", e.target.value)}>
          {WEEKDAYS.map((d) => (
            <option key={d.value} value={d.value} style={{ background: "#111d2e" }}>{d.label}</option>
          ))}
        </select>
      )}

      <div style={{ flex: 1 }} />

      <button
        onClick={() =>
          onChange({
            period: "1m",
            region: "",
            nature: "",
            hour: "",
            weekday: "",
          })
        }
        style={{
          background: "transparent",
          border: "1px solid #1e3a5f",
          borderRadius: 6,
          color: "#64748b",
          fontSize: 12,
          padding: "6px 12px",
          cursor: "pointer",
        }}
      >
        Limpar filtros
      </button>

      <button
        style={{
          background: "#2563eb",
          border: "none",
          borderRadius: 6,
          color: "#fff",
          fontSize: 12,
          fontWeight: 600,
          padding: "6px 14px",
          cursor: "pointer",
        }}
      >
        Aplicar filtros
      </button>
    </div>
  );
}
