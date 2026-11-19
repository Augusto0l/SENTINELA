import { useState } from "react";
import Header from "../components/Header";
import MapaDF, { type MapMode } from "../components/map/MapaDF";
import DonutChart from "../components/DonutChart";
import { useDemoToast } from "../components/DemoProvider";
import { emptyDemoFilters } from "@/data/demoAnalytics";
import { useAnalyticsSource } from "@/components/analytics/useAnalyticsSource";
import type { AnalyticSelection } from "@/components/analytics/usePersistentAnalytics";
import AnalyticFilters from "@/components/analytics/AnalyticFilters";
import PeriodTrend from "@/components/analytics/PeriodTrend";
import analyticsStyles from "@/components/analytics/Analytics.module.css";

interface DashboardProps {
  onNavigateToCrimeMap: (raCode?: string, filters?: AnalyticSelection) => void;
  persistent?: boolean;
}

export default function Dashboard({ onNavigateToCrimeMap, persistent = false }: DashboardProps) {
  const notify = useDemoToast();
  const [mapMode, setMapMode] = useState<MapMode>("heat");
  const [filters, setFilters] = useState<AnalyticSelection>(emptyDemoFilters);
  const source = useAnalyticsSource(persistent, filters);
  const { mapRecords, mapSummary, summary, regionOptions } = source;

  const total = summary.total;
  const ranking = regionOptions.map(ra => ({ ...ra, occurrence_count: summary.byRa[ra.codigo] ?? 0 })).filter(ra => ra.occurrence_count > 0).sort((a, b) => b.occurrence_count - a.occurrence_count);
  const topRA = ranking[0];
  const sparkData = summary.timeline.map(item => item.count);

  const natureMap = summary.byNature;
  const topNature = Object.entries(natureMap).sort((a, b) => b[1] - a[1])[0];
  const donutData = Object.entries(natureMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  const topFiveRAs = ranking.slice(0, 5);
  const rankingMax = topFiveRAs[0]?.occurrence_count ?? 1;

  const updatedLabel = `${persistent ? "Leitura PostgreSQL" : "Base fictícia"} · ${source.periodLabel}`;

  const MODE_LABELS: Record<MapMode, string> = {
    heat: "Mapa de calor",
    points: "Pontos",
    clusters: "Clusters",
    satellite: "Satélite",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <Header title="Dashboard" subtitle="Visão Geral do DF" />

      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Page title row */}
        <div className="page-heading" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--theme-f1f5f9)", margin: 0, letterSpacing: "-0.02em" }}>
              Visão Geral do DF
            </h1>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "3px 0 0" }}>
              Uma visão ampla das ocorrências por Região Administrativa do Distrito Federal.
            </p>
          </div>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontStyle: "italic" }}>{updatedLabel}</span>
        </div>

        <AnalyticFilters filters={filters} onChange={setFilters} regions={regionOptions} catalog={source.catalogOptions} />
        {source.pending && <p role="status">Consultando indicadores…</p>}
        {source.error && <p role="alert">{source.error} <button type="button" onClick={source.retry}>Tentar novamente</button></p>}
        {!source.pending && !source.error && <>
        {total === 0 && <p role="status" className={analyticsStyles.empty}>Nenhuma ocorrência no intervalo e nos filtros aplicados. Ajuste o período ou limpe os filtros.</p>}

        {/* KPI Cards */}
        <div className="kpi-grid" style={{ display: "grid", gap: 10 }}>
          {/* Ocorrências no período */}
          <div style={kpiCard}>
            <div style={kpiLabel}>OCORRÊNCIAS NO PERÍODO</div>
            <div data-testid="analytics-total" data-count={total} style={{ fontSize: 28, fontWeight: 800, color: "var(--theme-f1f5f9)", lineHeight: 1, margin: "6px 0 4px" }}>
              {total.toLocaleString("pt-BR")}
            </div>
            <div style={kpiSub}>Ocorrências únicas no recorte aplicado</div>
            <div style={{ marginTop: 8, height: 28 }}>
              <SparklineInline data={sparkData} color="#2563eb" />
            </div>
          </div>

          {/* RA com maior incidência */}
          <div style={kpiCard}>
            <div style={kpiLabel}>RA COM MAIOR INCIDÊNCIA</div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 6 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--theme-f1f5f9)", lineHeight: 1.2 }}>
                {topRA?.nomeDisplay ?? "—"}
              </div>
              <span style={{ fontSize: 20, opacity: 0.5 }}>🛡</span>
            </div>
            <div style={{ ...kpiSub, marginTop: 4 }}>
              {(topRA?.occurrence_count ?? 0).toLocaleString("pt-BR")} ocorrências ({(total ? ((topRA?.occurrence_count ?? 0) / total) * 100 : 0).toFixed(1)}% do total)
            </div>
          </div>

          {/* RAs representadas no recorte */}
          <div style={kpiCard}>
            <div style={kpiLabel}>RAS COM OCORRÊNCIAS</div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 6 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--theme-22c55e)", lineHeight: 1.2 }}>
                {ranking.length}
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--theme-22c55e)", marginTop: 2 }}>
              {regionOptions.length} áreas no catálogo {persistent ? "cartográfico" : "demonstrativo"}
            </div>
            <div style={kpiSub}>Contagem de áreas com registros no recorte</div>
          </div>

          {/* Dia e hora de pico no recorte */}
          <div style={kpiCard}>
            <div style={kpiLabel}>DIA CRÍTICO</div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 6 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--theme-60a5fa)", lineHeight: 1.2 }}>
                {summary.peakDay}
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--theme-60a5fa)", marginTop: 2 }}>
              {summary.peakHour}
            </div>
            <div style={kpiSub}>Dia e hora com mais registros no recorte</div>
          </div>

          {/* Natureza em destaque */}
          <div style={kpiCard}>
            <div style={kpiLabel}>NATUREZA EM DESTAQUE</div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 6 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--theme-f97316)", lineHeight: 1.2 }}>
                {topNature?.[0] ?? "—"}
              </div>
              <span style={{ fontSize: 18, opacity: 0.5 }}>🍩</span>
            </div>
            <div style={kpiSub}>
              {(topNature?.[1] ?? 0).toLocaleString("pt-BR")} ocorrências ({(total ? ((topNature?.[1] ?? 0) / total) * 100 : 0).toFixed(1)}%)
            </div>
          </div>
        </div>

        {/* Map + Right panel */}
        <div className="map-panels" style={{ display: "flex", gap: 14, flex: 1, minHeight: 460 }}>
          {/* Map card */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div style={{
              flex: 1,
              background: "#07111f",
              border: "1px solid var(--theme-1a3050)",
              borderRadius: 12,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
            }}>
              {/* Map header */}
              <div style={{
                padding: "11px 16px",
                borderBottom: "1px solid var(--theme-1a3050)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap", gap: 10,
                flexShrink: 0,
                background: "var(--theme-map-control)",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--theme-f1f5f9)" }}>
                    Ocorrências por Região Administrativa
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 1 }}>
                    {persistent ? "Distribuição das ocorrências visíveis no recorte" : "Distribuição da base fictícia no recorte aplicado"}
                  </div>
                </div>
                {/* Segmented mode selector */}
                <div style={{
                  display: "flex", alignItems: "center",
                  background: "var(--theme-map-control)", border: "1px solid var(--theme-1e3a5f)",
                  borderRadius: 7, padding: 3, gap: 2,
                  flexWrap: "wrap", maxWidth: "100%",
                }}>
                  {(["heat", "points", "clusters", "satellite"] as MapMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMapMode(m)}
                      aria-pressed={mapMode === m}
                      style={{
                        background: mapMode === m ? "#2563eb" : "transparent",
                        border: "none", borderRadius: 5,
                        color: mapMode === m ? "#fff" : "var(--theme-64748b)",
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
                {persistent && !source.officialRegions ? <p role="status">{source.geometryError ? "Limites oficiais indisponíveis." : "Carregando limites oficiais…"}</p> : <MapaDF
                  occurrencesByRa={mapSummary.byRa}
                  selectedRaCode={filters.ra || null}
                  showPoints={false}
                  mapMode={mapMode}
                  mockOccurrences={mapRecords}
                  heatReferenceOccurrences={source.heatReference}
                  officialRegions={source.officialRegions}
                  heatUnavailable={source.heatUnavailable}
                  onSelectRa={(raCode) => onNavigateToCrimeMap(raCode, filters)}
                />}
                {source.heatUnavailable && mapMode === "heat" && <p className={analyticsStyles.mapNotice} role="status">Calor indisponível: a base de referência excede o limite de pontos.</p>}
                {source.pointsTruncated && (mapMode === "points" || mapMode === "clusters") && <p className={analyticsStyles.mapNotice} role="status">Camada parcial. Restrinja os filtros para ver todos os pontos.</p>}

                {/* The satellite layer has working Leaflet controls of its own. */}
                <div hidden={mapMode === "satellite"} style={{
                  position: "absolute", right: 12, bottom: 64,
                  display: mapMode === "satellite" ? "none" : "flex", flexDirection: "column", gap: 3,
                }}>
                  {[
                    { title: "Resetar visão", svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
                    { title: "Zoom in",  svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg> },
                    { title: "Zoom out", svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg> },
                    { title: "Localização", svg: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg> },
                  ].map(({ title, svg }) => (
                    <button key={title} title={`${title} (demonstração)`} aria-label={`${title} (demonstração)`} onClick={() => notify("Controle ilustrativo; zoom e localização serão implementados em etapa posterior.")} style={{
                      width: 30, height: 30, borderRadius: 6,
                      background: "var(--theme-map-control)", backdropFilter: "blur(4px)",
                      border: "1px solid var(--theme-1e3a5f)", color: "var(--color-text-muted)",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "border-color .15s, color .15s",
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#2563eb"; e.currentTarget.style.color = "var(--theme-60a5fa)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--theme-1e3a5f)"; e.currentTarget.style.color = "var(--theme-64748b)"; }}
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
                  display: mapMode === "satellite" ? "none" : "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  pointerEvents: "none",
                }}>
                  <div style={{ fontSize: 9, color: "var(--color-text-muted)", marginBottom: 2 }}>20 km</div>
                  <div style={{ width: 60, height: 2, background: "var(--theme-475569)", borderRadius: 1 }} />
                </div>
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div className="map-side-panel" style={{ width: 268, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Análises do Período
            </div>

            {/* Ranking */}
            <div style={panel}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={panelLabel}>Ranking das RAs por ocorrências</div>
                <button onClick={() => onNavigateToCrimeMap(undefined, { ...filters, ra: "" })} style={{ background: "none", border: "none", fontSize: 11, color: "var(--theme-60a5fa)", cursor: "pointer" }}>Ver todas</button>
              </div>
              {topFiveRAs.map((ra, i) => {
                const pct = (ra.occurrence_count / rankingMax) * 100;
                const barColor = i === 0 ? "#ef4444" : i === 1 ? "#f97316" : i === 2 ? "#f97316" : "#2563eb";
                return (
                  <div key={ra.codigo} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)", width: 14, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "var(--theme-94a3b8)", marginBottom: 2 }}>{ra.nomeDisplay}</div>
                      <div style={{ height: 3, background: "var(--theme-0d1626)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 2 }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                      {ra.occurrence_count.toLocaleString("pt-BR")}
                    </span>
                  </div>
                );
              })}
              <div style={{ borderTop: "1px solid var(--theme-1e3a5f)", paddingTop: 8, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Total geral</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--theme-f1f5f9)", fontVariantNumeric: "tabular-nums" }}>
                  {total.toLocaleString("pt-BR")}
                </span>
              </div>
            </div>

            {/* Donut chart */}
            <div style={panel}>
              <div style={panelLabel}>Natureza criminal mais frequente</div>
              <DonutChart data={donutData} size={150} />
              <p style={kpiSub}>{persistent ? "Ocorrências distintas por descrição; uma ocorrência pode aparecer em várias naturezas." : "Vínculos por natureza; uma ocorrência pode ter várias naturezas."}</p>
            </div>

            {persistent && !source.pending && !source.error && <div style={panel}>
              <div style={panelLabel}>Ocorrências por categoria</div>
              {source.categoryCounts.length > 0 ? <ul>
                {source.categoryCounts.map(item => <li key={item.key}>{item.key} · {item.count.toLocaleString("pt-BR")}</li>)}
              </ul> : <p style={kpiSub}>Nenhuma categoria homologada no recorte.</p>}
            </div>}

            {/* Variation */}
            <div style={{ ...panel, padding: "12px 14px" }}>
              <div style={panelLabel}>Evolução temporal do recorte</div>
              <PeriodTrend timeline={summary.timeline} showVariation={persistent} />
            </div>

            {/* Info */}
            <div style={{ ...panel, background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.18)" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ fontSize: 14, color: "#2563eb", flexShrink: 0, marginTop: 1 }}>💡</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--theme-60a5fa)", marginBottom: 4 }}>Como interpretar o mapa?</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.6 }}>
                    Cores mais quentes indicam maior concentração de ocorrências. Clique em uma RA para ver detalhes e tendências.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div></>}
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
    const x = data.length === 1 ? w / 2 : (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
    </svg>
  );
}

const kpiCard: React.CSSProperties = {
  background: "var(--theme-0d1a2d)",
  border: "1px solid var(--theme-1e3a5f)",
  borderRadius: 10,
  padding: "14px 16px",
};

const kpiLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--color-text-muted)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const kpiSub: React.CSSProperties = {
  fontSize: 11,
  color: "var(--color-text-muted)",
  marginTop: 3,
  lineHeight: 1.4,
};

const panel: React.CSSProperties = {
  background: "var(--theme-0d1a2d)",
  border: "1px solid var(--theme-1e3a5f)",
  borderRadius: 8,
  padding: "12px 14px",
};

const panelLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--color-text-muted)",
  marginBottom: 8,
};
