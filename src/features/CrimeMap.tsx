import { useState } from "react";
import Header from "../components/Header";
import MapaDF, { type MapMode } from "../components/map/MapaDF";
import DonutChart from "../components/DonutChart";
import AnalyticsCard from "../components/AnalyticsCard";
import { RA_LIST } from "@/data/mockData";
import { emptyDemoFilters } from "@/data/demoAnalytics";
import { useAnalyticsSource } from "@/components/analytics/useAnalyticsSource";
import type { AnalyticSelection } from "@/components/analytics/usePersistentAnalytics";
import AnalyticFilters from "@/components/analytics/AnalyticFilters";
import analyticsStyles from "@/components/analytics/Analytics.module.css";

interface CrimeMapProps {
  initialRaCode?: string;
  initialFilters?: AnalyticSelection;
  persistent?: boolean;
}

export default function CrimeMap({ initialRaCode, initialFilters, persistent = false }: CrimeMapProps) {
  const [filters, setFilters] = useState<AnalyticSelection>(() => {
    const ra = initialRaCode ?? initialFilters?.ra ?? "";
    const initial = { ...emptyDemoFilters(), ...initialFilters }
    return { ...initial, period: persistent && initial.period !== "custom" ? "all" : initial.period,
      ra: persistent || RA_LIST.some(item => item.codigo === ra) ? ra : "" };
  });
  const selectedRaCode = filters.ra || null;
  const [mapMode, setMapMode] = useState<MapMode>("heat");
  const source = useAnalyticsSource(persistent, filters);
  const { mapRecords: mapOccurrences, mapSummary, summary } = source;
  const metadata = selectedRaCode ? source.regionOptions.find((ra) => ra.codigo === selectedRaCode) : null;
  const raInfo = metadata ? { ...metadata, occurrence_count: summary.total, crimes_by_nature: summary.byNature, most_common_crime: summary.topNature, peak_hour: summary.peakHour, peak_day: summary.peakDay } : null;
  const donutData = Object.entries(summary.byNature).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));

  const handleSelectRa = (raCode: string) => {
    setFilters(previous => ({ ...previous, ra: raCode }));
  };

  const handleBack = () => {
    setFilters(previous => ({ ...previous, ra: "" }));
  };

  return (
    <div className={analyticsStyles.mapRoot}>
      <Header title="Mapa Criminal" subtitle="Análise geográfica detalhada" />

      <div className={analyticsStyles.mapFilters}>
        <AnalyticFilters filters={filters} onChange={setFilters} regions={source.regionOptions} catalog={source.catalogOptions} />
        {source.pending && <p role="status">Consultando indicadores…</p>}
        {source.error && <p role="alert">{source.error} <button type="button" onClick={source.retry}>Tentar novamente</button></p>}
        {!source.pending && !source.error && <>
        {summary.total === 0 && <p role="status" className={analyticsStyles.empty}>Nenhuma ocorrência no intervalo e nos filtros aplicados. Ajuste o período ou limpe os filtros.</p>}
        <p data-testid="analytics-total" data-count={summary.total} style={{ color: "var(--color-text-muted)", fontSize: 12, margin: "8px 0" }}>{summary.total.toLocaleString("pt-BR")} ocorrências únicas no recorte aplicado</p>
        </>}
      </div>
      {!source.pending && !source.error && <>

      {/* Breadcrumb */}
      {selectedRaCode && raInfo && (
        <div
          style={{
            background: "var(--theme-0d1626)",
            borderBottom: "1px solid var(--theme-1e3a5f)",
            padding: "8px 24px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Distrito Federal</span>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>›</span>
          <span style={{ fontSize: 12, color: "var(--theme-93c5fd)", fontWeight: 600 }}>{raInfo.nomeDisplay}</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleBack}
            style={{
              background: "transparent",
              border: "1px solid var(--theme-1e3a5f)",
              borderRadius: 5,
              color: "var(--theme-60a5fa)",
              fontSize: 11,
              padding: "4px 10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            ← Voltar para visão do DF
          </button>
        </div>
      )}

      <div className={`map-panels crime-panels ${analyticsStyles.mapPanels}`} style={{ flex: 1, display: "flex", overflow: "auto" }}>
        {/* Map area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "12px 0 12px 16px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10, paddingRight: 16, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--theme-f1f5f9)", margin: 0, letterSpacing: "-0.02em" }}>
                {raInfo ? raInfo.nomeDisplay : "Mapa Criminal"}
              </h1>
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "3px 0 0" }}>
                {raInfo
                  ? `Distribuição espacial das ocorrências em ${raInfo.nomeDisplay}`
                  : "Explore a distribuição espacial das ocorrências e identifique padrões por região."}
              </p>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: "100%" }}>
              {(["heat", "points", "clusters", "satellite"] as MapMode[]).map((m) => (
                <button key={m} onClick={() => setMapMode(m)} aria-pressed={mapMode === m} style={{
                  background: mapMode === m ? "#2563eb" : "transparent",
                  border: mapMode === m ? "none" : "1px solid var(--theme-1e3a5f)",
                  borderRadius: 5, color: mapMode === m ? "#fff" : "var(--theme-64748b)",
                  fontSize: 11, fontWeight: mapMode === m ? 600 : 400,
                  padding: "4px 10px", cursor: "pointer",
                }}>
                  {m === "heat" ? "Calor" : m === "points" ? "Pontos" : m === "satellite" ? "Satélite" : "Clusters"}
                </button>
              ))}
            </div>
          </div>

          <div style={{
            flex: 1,
            minHeight: 0,
            background: "var(--theme-111d2e)",
            border: "1px solid var(--theme-1e3a5f)",
            borderRadius: 8,
            overflow: "hidden",
            position: "relative",
            marginRight: 16,
          }}>
            {persistent && !source.officialRegions ? <p role="status">{source.geometryError ? "Limites oficiais indisponíveis." : "Carregando limites oficiais…"}</p> : <MapaDF
              selectedRaCode={selectedRaCode}
              onSelectRa={handleSelectRa}
              occurrencesByRa={mapSummary.byRa}
              showPoints={false}
              mapMode={mapMode}
              mockOccurrences={mapOccurrences}
              heatReferenceOccurrences={source.heatReference}
              officialRegions={source.officialRegions}
              heatUnavailable={source.heatUnavailable}
            />}
            {source.heatUnavailable && mapMode === "heat" && <p className={analyticsStyles.mapNotice} role="status">Calor indisponível: a base de referência excede o limite de pontos.</p>}
            {source.pointsTruncated && (mapMode === "points" || mapMode === "clusters") && <p className={analyticsStyles.mapNotice} role="status">Camada parcial. Restrinja os filtros para ver todos os pontos.</p>}
          </div>
        </div>

        {/* Side panel */}
        <div className="map-side-panel" style={{ width: 270, flexShrink: 0, overflowY: "auto", padding: "12px 16px 12px 0", display: "flex", flexDirection: "column", gap: 10 }}>
          {raInfo && (
            <div style={{ background: "var(--theme-111d2e)", border: "1px solid var(--theme-1e3a5f)", borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
                Resumo — {raInfo.nomeDisplay}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 2 }}>Total</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "var(--theme-f1f5f9)" }}>{raInfo.occurrence_count.toLocaleString("pt-BR")}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 2 }}>Parcela do recorte do DF</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--theme-93c5fd)" }}>
                    {((summary.total / (mapSummary.total || 1)) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              <div style={{ borderTop: "1px solid var(--theme-1e3a5f)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>Principal natureza</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--theme-f1f5f9)" }}>{raInfo.most_common_crime}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                    {(((raInfo.crimes_by_nature[raInfo.most_common_crime] ?? 0) / (raInfo.occurrence_count || 1)) * 100).toFixed(1)}% do total
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>Horário de maior incidência</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--theme-f1f5f9)" }}>{raInfo.peak_hour}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>Dia da semana crítico</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--theme-f1f5f9)" }}>{raInfo.peak_day}</div>
                </div>
              </div>
            </div>
          )}

          <AnalyticsCard
            label="Ocorrências no recorte"
            value={summary.total.toLocaleString("pt-BR")}
            sub="Série mensal calculada com os mesmos filtros"
            sparkData={summary.timeline.map(item => item.count)}
          />

          <div style={{ background: "var(--theme-111d2e)", border: "1px solid var(--theme-1e3a5f)", borderRadius: 8, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase" }}>
              Indicadores rápidos
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Horário crítico</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--theme-f97316)" }}>{summary.peakHour}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Dia crítico</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--theme-f97316)" }}>{summary.peakDay}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>RAs com registros</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--theme-93c5fd)" }}>{Object.keys(summary.byRa).length}</span>
              </div>
            </div>
          </div>

          <div style={{ background: "var(--theme-111d2e)", border: "1px solid var(--theme-1e3a5f)", borderRadius: 8, padding: "14px 16px" }}>
            <DonutChart data={donutData} title="Naturezas em destaque" size={150} />
            <p style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{persistent ? "Ocorrências distintas por descrição; uma ocorrência pode aparecer em várias naturezas." : "Vínculos por natureza; uma ocorrência pode ter várias naturezas."}</p>
          </div>

          <div style={{ background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: "#2563eb", fontWeight: 600, marginBottom: 6 }}>Sobre este mapa</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.6 }}>
              {selectedRaCode
                ? `Visualizando ocorrências concentradas em ${raInfo?.nomeDisplay ?? selectedRaCode}. Clique em "Voltar para visão do DF" para ver o mapa completo.`
                : "Clique em qualquer Região Administrativa no mapa para ver dados detalhados e filtrar as ocorrências por área."}
            </div>
          </div>

          <div style={{ fontSize: 10, color: "var(--color-text-muted)", textAlign: "center", fontStyle: "italic", paddingBottom: 4 }}>
            {persistent ? "Leitura PostgreSQL" : "Base fictícia"} · {source.periodLabel}
          </div>
        </div>
      </div></>}
    </div>
  );
}
