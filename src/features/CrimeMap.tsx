import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import MapaDF, { type MapMode, type MapOccurrence } from "@/components/map/MapaDF";
import MapOccurrenceTooltip, { type MarkerHover } from "@/components/map/MapOccurrenceTooltip";
import { spatialRaName } from "@/components/map/occurrencePresentation";
import { occurrenceHrefFromMap } from "@/features/occurrences/map-link";
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

type MapHistoryView = { filters: AnalyticSelection; mode: MapMode; showSatelliteOccurrences: boolean };

export default function CrimeMap({ initialRaCode, initialFilters, persistent = false }: CrimeMapProps) {
  const router = useRouter();
  const viewport = useRef<HTMLDivElement>(null);
  const [historyView] = useState<MapHistoryView | undefined>(() => window.history.state?.sentinelaCrimeMap);
  const [hover, setHover] = useState<{
    id: string; point: MapOccurrence; anchor: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const [filters, setFilters] = useState<AnalyticSelection>(() => {
    if (historyView) return historyView.filters;
    const ra = initialRaCode ?? initialFilters?.ra ?? "";
    const initial = { ...emptyDemoFilters(), ...initialFilters }
    return { ...initial, period: persistent && initial.period !== "custom" ? "all" : initial.period,
      ra: persistent || RA_LIST.some(item => item.codigo === ra) ? ra : "" };
  });
  const selectedRaCode = filters.ra || null;
  const [mapMode, setMapMode] = useState<MapMode>(historyView?.mode ?? "heat");
  const [showSatelliteOccurrences, setShowSatelliteOccurrences] = useState(historyView?.showSatelliteOccurrences ?? false);
  const source = useAnalyticsSource(persistent, filters);
  const { mapRecords: mapOccurrences, mapSummary, summary, officialGeometry, officialRegions } = source;
  const raInfo = selectedRaCode ? source.regionOptions.find((ra) => ra.codigo === selectedRaCode) : null;
  // With an RA selected, statistics count validated territorial links; map points count spatial location.
  const raPoints = persistent && selectedRaCode ? mapSummary.byRa[selectedRaCode] ?? 0 : null;

  const handleOccurrenceHover = useCallback((marker: MarkerHover | null) => {
    const id = marker?.point.occurrenceId;
    if (!id || !marker || !viewport.current) { setHover(null); return; }
    const { left, top, width, height } = viewport.current.getBoundingClientRect();
    setHover({ id, point: marker.point, anchor: { x: marker.clientX - left, y: marker.clientY - top, width, height } });
  }, []);

  const handleOccurrenceOpen = useCallback((point: MapOccurrence) => {
    if (!point.occurrenceId) return;
    const href = occurrenceHrefFromMap(point.occurrenceId, {
      latitude: point.latitude, longitude: point.longitude,
      raName: point.raCode ? point.raName : spatialRaName(officialGeometry, point, officialRegions),
    });
    if (!href) return;
    setHover(null);
    const view: MapHistoryView = { filters, mode: mapMode, showSatelliteOccurrences };
    window.history.replaceState({ ...window.history.state, sentinelaCrimeMap: view }, "");
    router.push(href);
  }, [filters, mapMode, officialGeometry, officialRegions, router, showSatelliteOccurrences]);

  const handleSelectRa = (raCode: string) => {
    setHover(null);
    setFilters(previous => ({ ...previous, ra: raCode }));
  };

  const handleBack = () => {
    setHover(null);
    setFilters(previous => ({ ...previous, ra: "" }));
  };

  return (
    <div className={analyticsStyles.mapRoot} onScrollCapture={() => setHover(null)}>
      <Header title="Mapa Criminal" subtitle="Análise geográfica detalhada" />

      <div className={analyticsStyles.mapFilters}>
        <AnalyticFilters filters={filters} onChange={next => { setHover(null); setFilters(next); }} regions={source.regionOptions} catalog={source.catalogOptions} />
        {source.pending && <p role="status">Consultando indicadores…</p>}
        {source.error && <p role="alert">{source.error} <button type="button" onClick={source.retry}>Tentar novamente</button></p>}
        {!source.pending && !source.error && <>
        {summary.total === 0 && mapOccurrences.length === 0 && <p role="status" className={analyticsStyles.empty}>Nenhuma ocorrência no intervalo e nos filtros aplicados. Ajuste o período ou limpe os filtros.</p>}
        <p data-testid="analytics-total" data-count={summary.total} className={analyticsStyles.mapTotal}>{raPoints === null
          ? `${summary.total.toLocaleString("pt-BR")} ocorrências únicas no recorte aplicado`
          : <>{summary.total.toLocaleString("pt-BR")} {summary.total === 1 ? "ocorrência única" : "ocorrências únicas"} com vínculo territorial validado na RA · <span data-testid="analytics-ra-points" data-count={raPoints}>{raPoints.toLocaleString("pt-BR")} {raPoints === 1 ? "ponto localizado" : "pontos localizados"} espacialmente na RA</span></>}</p>
        {mapMode === "points" && <p className={analyticsStyles.mapTotal} data-testid="analytics-eligible-points" data-count={source.eligiblePoints ?? undefined}>
          {source.eligiblePoints === null ? "Total de pontos elegíveis indisponível" : `${source.eligiblePoints.toLocaleString("pt-BR")} pontos geograficamente elegíveis no recorte`}
        </p>}
        {mapMode === "points" && source.unverifiedPcdfPoints > 0 && <p className={analyticsStyles.mapTotal}>
          {source.unverifiedPcdfPoints.toLocaleString("pt-BR")} pontos PCDF publicados no recorte com CRS de origem sem comprovação formal.
        </p>}
        </>}
      </div>
      {/* Official cartography loads separately; it stays visible while indicators are pending. */}
      {!source.error && <>

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

      <section className={analyticsStyles.mapContent} aria-labelledby="crime-map-title">
          <div className={analyticsStyles.mapHeading}>
            <div>
              <h1 id="crime-map-title" style={{ fontSize: 20, fontWeight: 800, color: "var(--theme-f1f5f9)", margin: 0, letterSpacing: "-0.02em" }}>
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
                <button key={m} onClick={() => { setHover(null); setMapMode(m); }} aria-pressed={mapMode === m} style={{
                  background: mapMode === m ? "#2563eb" : "transparent",
                  border: mapMode === m ? "none" : "1px solid var(--theme-1e3a5f)",
                  borderRadius: 5, color: mapMode === m ? "#fff" : "var(--color-text-muted)",
                  fontSize: 11, fontWeight: mapMode === m ? 600 : 400,
                  padding: "4px 10px", cursor: "pointer",
                }}>
                  {m === "heat" ? "Calor" : m === "points" ? "Pontos" : m === "satellite" ? "Satélite" : "Clusters"}
                </button>
              ))}
            </div>
          </div>

          <div ref={viewport} className={analyticsStyles.mapViewport}>
            {persistent && !source.officialRegions ? <p role="status">{source.geometryError ? "Limites oficiais indisponíveis." : "Carregando limites oficiais…"}</p> : <MapaDF
              selectedRaCode={selectedRaCode}
              onSelectRa={handleSelectRa}
              occurrencesByRa={mapSummary.byRa}
              statisticsByRa={persistent && Object.keys(summary.byRa).length ? summary.byRa : undefined}
              showPoints={false}
              streetBasemap
              satelliteOccurrences={{ visible: showSatelliteOccurrences, onChange: setShowSatelliteOccurrences }}
              occurrenceInteraction={{ onHover: handleOccurrenceHover, onOpen: handleOccurrenceOpen }}
              mapMode={mapMode}
              mockOccurrences={mapOccurrences}
              heatReferenceOccurrences={source.heatReference}
              officialRegions={source.officialRegions}
              heatUnavailable={source.heatUnavailable}
              countsUnavailable={source.pending}
            />}
            {source.pending && source.officialRegions && <p className={analyticsStyles.mapNotice} role="status">Carregando ocorrências…</p>}
            {source.heatUnavailable && mapMode === "heat" && <p className={analyticsStyles.mapNotice} role="status">Calor indisponível: a base de referência excede o limite de pontos.</p>}
            {source.pointsTruncated && (mapMode === "points" || mapMode === "clusters" || (mapMode === "satellite" && showSatelliteOccurrences)) &&
              <p className={analyticsStyles.mapNotice} role="status">Cobertura parcial. A camada recebeu {mapOccurrences.length.toLocaleString("pt-BR")} pontos no limite da consulta. Restrinja os filtros para ver todos os pontos do novo recorte.</p>}
            {persistent && source.officialRegions && !source.pending && mapMode !== "satellite" && (mapMode !== "heat" || !source.heatUnavailable) && mapOccurrences.length === 0 &&
              <p className={analyticsStyles.mapNotice} role="status">Nenhum ponto elegível para exibição no recorte.</p>}
            {hover && <MapOccurrenceTooltip key={hover.id} {...hover} geometry={officialGeometry} regions={officialRegions} />}
          </div>
          <footer className={analyticsStyles.mapCaption}>
            <p>{selectedRaCode
              ? 'Use "Voltar para visão do DF" para ver o mapa completo.'
              : "Selecione uma Região Administrativa no mapa para filtrar as ocorrências por área."}</p>
            <p>{persistent ? "Leitura PostgreSQL" : "Base fictícia"} · {source.periodLabel}</p>
          </footer>
      </section>
      {raInfo && !source.pending && (
        <section className={analyticsStyles.mapRegionSummary} aria-labelledby="crime-map-ra-summary">
          <h2 id="crime-map-ra-summary">Resumo — {raInfo.nomeDisplay}</h2>
          <dl>
            <div>
              <dt>{raPoints === null ? "Total" : "Vínculo territorial validado"}</dt>
              <dd>{summary.total.toLocaleString("pt-BR")}</dd>
            </div>
            <div>
              <dt>{raPoints === null ? "Parcela do recorte do DF" : "Pontos localizados na RA"}</dt>
              <dd>{raPoints === null ? `${((summary.total / (mapSummary.total || 1)) * 100).toFixed(1)}%` : raPoints.toLocaleString("pt-BR")}</dd>
            </div>
            <div>
              <dt>Principal natureza</dt>
              <dd>{summary.topNature}</dd>
              <dd>{(((summary.byNature[summary.topNature] ?? 0) / (summary.total || 1)) * 100).toFixed(1)}% do total</dd>
            </div>
            <div>
              <dt>Horário de maior incidência</dt>
              <dd>{summary.peakHour}</dd>
            </div>
            <div>
              <dt>Dia da semana crítico</dt>
              <dd>{summary.peakDay}</dd>
            </div>
          </dl>
        </section>
      )}</>}
    </div>
  );
}
