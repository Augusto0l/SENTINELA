interface MapLegendProps {
  mode: "choropleth" | "heatmap";
  min: number;
  max: number;
}

export default function MapLegend({ mode, min, max }: MapLegendProps) {
  if (mode === "heatmap") {
    return (
      <div
        style={{
          background: "rgba(13,22,38,0.92)",
          border: "1px solid #1e3a5f",
          borderRadius: 6,
          padding: "10px 14px",
          minWidth: 180,
        }}
      >
        <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>
          Densidade de Ocorrências
        </div>
        <div
          style={{
            height: 10,
            borderRadius: 5,
            background: "linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff7700, #ff0000)",
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: "#64748b" }}>Baixa</span>
          <span style={{ fontSize: 10, color: "#64748b" }}>Alta</span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "rgba(13,22,38,0.92)",
        border: "1px solid #1e3a5f",
        borderRadius: 6,
        padding: "10px 14px",
        minWidth: 200,
      }}
    >
      <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" }}>
        Ocorrências por RA
      </div>
      <div
        style={{
          height: 10,
          borderRadius: 5,
          background: "linear-gradient(to right, #1e3a5f, #2563eb, #22d3ee, #eab308, #f97316, #ef4444)",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 10, color: "#64748b" }}>← {min.toLocaleString("pt-BR")}</span>
        <span style={{ fontSize: 10, color: "#64748b" }}>{max.toLocaleString("pt-BR")} →</span>
      </div>
    </div>
  );
}
