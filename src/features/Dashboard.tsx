import { useState } from "react";
import Header from "../components/Header";
import MapaDF, { type MapMode } from "../components/map/MapaDF";
import DonutChart from "../components/DonutChart";
import AnalyticsCard from "../components/AnalyticsCard";
import { RA_LIST } from "../data/mockData";
import { MOCK_OCCURRENCES } from "../data/mockOccurrences";

interface DashboardProps {
  onNavigateToCrimeMap: (raCode?: string) => void;
}

const OCCURRENCES_BY_RA: Record<string, number> = Object.fromEntries(
  RA_LIST.map((ra) => [ra.codigo, ra.occurrence_count])
);

const sparkData = [60, 72, 65, 80, 78, 95, 88, 100, 92, 108, 112, 124];

export default function Dashboard({ onNavigateToCrimeMap }: DashboardProps) {
  const [mapMode, setMapMode] = useState<MapMode>("heat");

  const total = RA_LIST.reduce((s, r) => s + r.occurrence_count, 0);
  const topRA = [...RA_LIST].sort((a, b) => b.occurrence_count - a.occurrence_count)[0];
  const maxGrowth = [...RA_LIST].sort((a, b) => b.variation - a.variation)[0];
  const maxDrop = [...RA_LIST].sort((a, b) => a.variation - b.variation)[0];

  const natureMap: Record<string, number> = {};
  RA_LIST.forEach((ra) => {
    Object.entries(ra.crimes_by_nature).forEach(([k, v]) => {
      natureMap[k] = (natureMap[k] ?? 0) + v;
    });
  });
  const topNature = Object.entries(natureMap).sort((a, b) => b[1] - a[1])[0];
  const donutData = Object.entries(natureMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));

  const topFiveRAs = [...RA_LIST].sort((a, b) => b.occurrence_count - a.occurrence_count).slice(0, 5);
  const rankingMax = topFiveRAs[0]?.occurrence_count ?? 1;

  const now = new Date();
  const updatedLabel = `Atualizado em ${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

  const MODE_LABELS: Record<MapMode, string> = {
    heat: "Mapa de calor",
    points: "Pontos",
    clusters: "Clusters",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <Header title="Dashboard" subtitle="Visão Geral do DF" />

      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Page title row */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", margin: 0, letterSpacing: "-0.02em" }}>
              Visão Geral do DF
            </h1>
            <p style={{ fontSize: 13, color: "#64748b", margin: "3px 0 0" }}>
              Uma visão ampla das ocorrências por Região Administrativa do Distrito Federal.
            </p>
          </div>
          <span style={{ fontSize: 11, color: "#334155", fontStyle: "italic" }}>{updatedLabel}</span>
        </div>

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
          {/* Ocorrências no período */}
          <div style={kpiCard}>
            <div style={kpiLabel}>OCORRÊNCIAS NO PERÍODO</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9", lineHeight: 1, margin: "6px 0 4px" }}>
              {total.toLocaleString("pt-BR")}
            </div>
            <div style={kpiSub}>Total em todas as RAs</div>
            <div style={{ marginTop: 8, height: 28 }}>
              <SparklineInline data={sparkData} color="#2563eb" />
            </div>
          </div>

          {/* RA com maior incidência */}
          <div style={kpiCard}>
            <div style={kpiLabel}>RA COM MAIOR INCIDÊNCIA</div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 6 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", lineHeight: 1.2 }}>
                {topRA.nomeDisplay}
              </div>
              <span style={{ fontSize: 20, opacity: 0.5 }}>🛡</span>
            </div>
            <div style={{ ...kpiSub, marginTop: 4 }}>
              {topRA.occurrence_count.toLocaleString("pt-BR")} ocorrências ({((topRA.occurrence_count / total) * 100).toFixed(1)}% do total)
            </div>
          </div>

          {/* Maior crescimento */}
          <div style={kpiCard}>
            <div style={kpiLabel}>MAIOR CRESCIMENTO</div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 6 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#22c55e", lineHeight: 1.2 }}>
                {maxGrowth.nomeDisplay}
              </div>
              <span style={{ fontSize: 18, color: "#22c55e" }}>↗</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#22c55e", marginTop: 2 }}>
              +{maxGrowth.variation.toFixed(1)}%
            </div>
            <div style={kpiSub}>em relação ao período anterior</div>
          </div>

          {/* Maior redução */}
          <div style={kpiCard}>
            <div style={kpiLabel}>MAIOR REDUÇÃO</div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 6 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#60a5fa", lineHeight: 1.2 }}>
                {maxDrop.nomeDisplay}
              </div>
              <span style={{ fontSize: 18, color: "#60a5fa" }}>↘</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#60a5fa", marginTop: 2 }}>
              {maxDrop.variation.toFixed(1)}%
            </div>
            <div style={kpiSub}>em relação ao período anterior</div>
          </div>

          {/* Natureza em destaque */}
          <div style={kpiCard}>
            <div style={kpiLabel}>NATUREZA EM DESTAQUE</div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 6 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#f97316", lineHeight: 1.2 }}>
                {topNature?.[0] ?? "—"}
              </div>
              <span style={{ fontSize: 18, opacity: 0.5 }}>🍩</span>
            </div>
            <div style={kpiSub}>
              {topNature?.[1]?.toLocaleString("pt-BR")} ocorrências ({((topNature?.[1] / total) * 100).toFixed(1)}%)
            </div>
          </div>
        </div>

        {/* Map + Right panel */}
        <div style={{ display: "flex", gap: 14, flex: 1, minHeight: 460 }}>
          {/* Map card */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div style={{
              flex: 1,
              background: "#07111f",
              border: "1px solid #1a3050",
              borderRadius: 12,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
            }}>
              {/* Map header */}
              <div style={{
                padding: "11px 16px",
                borderBottom: "1px solid #1a3050",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
                background: "rgba(7,17,31,0.6)",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>
                    Ocorrências por Região Administrativa
                  </div>
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 1 }}>
                    Distribuição espacial das ocorrências no período selecionado
                  </div>
                </div>
                {/* Segmented mode selector */}
                <div style={{
                  display: "flex", alignItems: "center",
                  background: "#060e1a", border: "1px solid #1e3a5f",
                  borderRadius: 7, padding: 3, gap: 2,
                }}>
                  {(["heat", "points", "clusters"] as MapMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMapMode(m)}
                      style={{
                        background: mapMode === m ? "#2563eb" : "transparent",
                        border: "none", borderRadius: 5,
                        color: mapMode === m ? "#fff" : "#64748b",
                        fontSize: 11, fontWeight: mapMode === m ? 700 : 400,
                        padding: "5px 11px", cursor: "pointer",
                        transition: "background .15s, color .15s",
                        whiteSpace: "nowrap",
                        boxShadow: mapMode === m ? "0 1px 6px rgba(37,99,235,0.4)" : "none",
                      }}
                    >
                      {MODE_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Map */}
              <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                <MapaDF
                  occurrencesByRa={OCCURRENCES_BY_RA}
                  showPoints={false}
                  mapMode={mapMode}
                  mockOccurrences={MOCK_OCCURRENCES}
                  onSelectRa={(raCode) => onNavigateToCrimeMap(raCode)}
                />

                {/* Map controls */}
                <div style={{
                  position: "absolute", right: 12, bottom: 64,
                  display: "flex", flexDirection: "column", gap: 3,
                }}>
                  {[
                    { title: "Resetar visão", svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
                    { title: "Zoom in",  svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg> },
                    { title: "Zoom out", svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg> },
                    { title: "Localização", svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg> },
                  ].map(({ title, svg }) => (
                    <button key={title} title={title} style={{
                      width: 30, height: 30, borderRadius: 6,
                      background: "rgba(7,17,31,0.82)", backdropFilter: "blur(4px)",
                      border: "1px solid #1e3a5f", color: "#64748b",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "border-color .15s, color .15s",
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#2563eb"; e.currentTarget.style.color = "#60a5fa"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e3a5f"; e.currentTarget.style.color = "#64748b"; }}
                    >
                      {svg}
                    </button>
                  ))}
                </div>

                {/* Scale bar */}
                <div style={{
                  position: "absolute",
                  bottom: 14,
                  right: 14,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  pointerEvents: "none",
                }}>
                  <div style={{ fontSize: 9, color: "#475569", marginBottom: 2 }}>20 km</div>
                  <div style={{ width: 60, height: 2, background: "#475569", borderRadius: 1 }} />
                </div>
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div style={{ width: 268, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Análises do Período
            </div>

            {/* Ranking */}
            <div style={panel}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={panelLabel}>Ranking das RAs por ocorrências</div>
                <span style={{ fontSize: 11, color: "#2563eb", cursor: "pointer" }}>Ver todas</span>
              </div>
              {topFiveRAs.map((ra, i) => {
                const pct = (ra.occurrence_count / rankingMax) * 100;
                const barColor = i === 0 ? "#ef4444" : i === 1 ? "#f97316" : i === 2 ? "#f97316" : "#2563eb";
                return (
                  <div key={ra.codigo} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                    <span style={{ fontSize: 11, color: "#475569", width: 14, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 2 }}>{ra.nomeDisplay}</div>
                      <div style={{ height: 3, background: "#0d1626", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 2 }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: "#64748b", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                      {ra.occurrence_count.toLocaleString("pt-BR")}
                    </span>
                  </div>
                );
              })}
              <div style={{ borderTop: "1px solid #1e3a5f", paddingTop: 8, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "#475569" }}>Total geral</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9", fontVariantNumeric: "tabular-nums" }}>
                  {total.toLocaleString("pt-BR")}
                </span>
              </div>
            </div>

            {/* Donut chart */}
            <div style={panel}>
              <div style={panelLabel}>Natureza criminal mais frequente</div>
              <DonutChart data={donutData} size={150} />
            </div>

            {/* Variation */}
            <div style={{ ...panel, padding: "12px 14px" }}>
              <div style={panelLabel}>Variação geral do período</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#f97316", marginTop: 6 }}>+8,4%</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>em relação ao período anterior</div>
              <div style={{ fontSize: 11, color: "#334155", marginTop: 1 }}>Período anterior: {(total * 0.922).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} ocorrências</div>
              <div style={{ marginTop: 8, height: 32 }}>
                <SparklineInline data={sparkData} color="#60a5fa" />
              </div>
            </div>

            {/* Info */}
            <div style={{ ...panel, background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.18)" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ fontSize: 14, color: "#2563eb", flexShrink: 0, marginTop: 1 }}>💡</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#60a5fa", marginBottom: 4 }}>Como interpretar o mapa?</div>
                  <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.6 }}>
                    Cores mais quentes indicam maior concentração de ocorrências. Clique em uma RA para ver detalhes e tendências.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SparklineInline({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const h = 28;
  const w = 100;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min)) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
    </svg>
  );
}

const kpiCard: React.CSSProperties = {
  background: "#0d1a2d",
  border: "1px solid #1e3a5f",
  borderRadius: 10,
  padding: "14px 16px",
};

const kpiLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#475569",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const kpiSub: React.CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  marginTop: 3,
  lineHeight: 1.4,
};

const panel: React.CSSProperties = {
  background: "#0d1a2d",
  border: "1px solid #1e3a5f",
  borderRadius: 8,
  padding: "12px 14px",
};

const panelLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#64748b",
  marginBottom: 8,
};
