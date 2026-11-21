import { useState } from "react";
import Header from "@/components/Header";
import MapaDF, { type MapMode } from "@/components/map/MapaDF";
import NavigationIcon from "@/components/NavigationIcon";
import DonutChart from "@/components/DonutChart";
import Button from "@/components/ui/button";
import Skeleton from "@/components/ui/skeleton";
import { emptyDemoFilters } from "@/data/demoAnalytics";
import { useAnalyticsSource } from "@/components/analytics/useAnalyticsSource";
import type { AnalyticSelection } from "@/components/analytics/usePersistentAnalytics";
import AnalyticFilters from "@/components/analytics/AnalyticFilters";
import PeriodTrend from "@/components/analytics/PeriodTrend";
import styles from "@/features/Dashboard.module.css";

type DashboardProps = {
  onNavigateToCrimeMap: (raCode?: string, filters?: AnalyticSelection) => void;
  persistent?: boolean;
};

const layers = { heat: "Mapa de calor", points: "Pontos", clusters: "Clusters" } as const;
const symbols = {
  occurrences: "M8 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3 M8 2h8v5H8z M7 12h10 M7 17h7",
  regions: "m12 2 3 6 7 1-5 5 1 7-6-3.5L6 21l1-7-5-5 7-1 3-6z",
  critical: "M10 4 2 18a2 2 0 0 0 2 3h16a2 2 0 0 0 2-3L14 4a2.3 2.3 0 0 0-4 0z M12 9v4 M12 17h.01",
  variation: "M3 16h4v5H3z M10 11h4v10h-4z M17 4h4v17h-4z",
  ranking: "M18 9a6 6 0 1 1-12 0 6 6 0 1 1 12 0z M8 14l-3 8 4-2 3 2 3-2 4 2-3-8 M12 7v4 M10 9h4",
  layers: "m12 3 10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5",
  trend: "M3 3v17h18 M6 15l5-6 4 3 6-7 M17 5h4v4",
  satellite: "m5 4 15 15 M7 7l4-4 3 3-4 4 M14 14l4-4 3 3-4 4 M11 13l-5 5 M3 18a3 3 0 0 0 3 3",
  reset: "M12 2v4 M12 18v4 M2 12h4 M18 12h4 M19 12a7 7 0 1 1-14 0 7 7 0 1 1 14 0z M14 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0z",
} as const;

function DashboardIcon({ name }: { name: keyof typeof symbols }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={symbols[name]} /></svg>;
}

export default function Dashboard({ onNavigateToCrimeMap, persistent = false }: DashboardProps) {
  const [mapBase, setMapBase] = useState<"map" | "satellite">("map");
  const [layer, setLayer] = useState<keyof typeof layers>("heat");
  const [zoomLevel, setZoomLevel] = useState(0);
  const [filters, setFilters] = useState<AnalyticSelection>(emptyDemoFilters);
  const source = useAnalyticsSource(persistent, filters);
  const { mapRecords, mapSummary, summary, regionOptions } = source;

  const countsUnavailable = source.pending || Boolean(source.error);
  const total = countsUnavailable ? null : summary.total;
  const totalLabel = total?.toLocaleString("pt-BR") ?? "—";
  const stateMessage = source.pending ? "Carregando indicadores…" : source.error ? "Dados indisponíveis." : null;
  const mapMode: MapMode = mapBase === "satellite" ? "satellite" : layer;
  const missingGeometry = persistent && !source.officialRegions;
  const mapMessage = missingGeometry ? (source.geometryError ? "Limites oficiais indisponíveis." : "Carregando limites oficiais…")
    : source.pending ? "Carregando ocorrências…"
    : source.error ? "Dados de ocorrências indisponíveis."
    : total === 0 ? "Nenhuma ocorrência encontrada."
    : mapMode === "heat" && source.heatUnavailable ? "A base de referência excede o limite de pontos do calor."
    : (mapMode === "points" || mapMode === "clusters") && source.pointsTruncated ? "Camada parcial. Restrinja os filtros para ver todos os pontos." : null;

  const ranking = regionOptions
    .map(ra => ({ ...ra, count: summary.byRa[ra.codigo] ?? 0 }))
    .filter(ra => ra.count > 0)
    .sort((a, b) => b.count - a.count);
  const donutData = Object.entries(summary.byNature)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
  const regionCount = regionOptions.length || null;
  const kpis = [
    { name: "occurrences", label: "OCORRÊNCIAS", value: totalLabel, hint: "Ocorrências únicas no recorte" },
    { name: "regions", label: "RAs AFETADAS", value: `${countsUnavailable ? "—" : ranking.length} / ${regionCount ?? "—"}`, hint: persistent ? "No catálogo cartográfico" : "No catálogo demonstrativo" },
    { name: "critical", label: "DIA CRÍTICO", value: summary.peakDay === "—" ? "—" : summary.peakDay.slice(0, 3), hint: "Maior volume" },
    { name: "variation", label: "VARIAÇÃO", value: "—", hint: "Sem período comparável" },
  ] as const;

  return <div className={styles.dashboard}>
    <Header title="Dashboard" subtitle="Visão Geral do DF" />
    <div className={styles.scroll}>
      <div className={styles.layout}>
        <div className={styles.mapColumn}>
          <div className={styles.intro}>
            <div className={styles.titleRow}>
              <div>
                <h1>Visão Geral do DF</h1>
                <p>Ocorrências no território do Distrito Federal.</p>
              </div>
              <AnalyticFilters compact filters={filters} onChange={setFilters} regions={regionOptions} catalog={source.catalogOptions} />
            </div>
            {source.pending && <p className="sr-only" role="status">Consultando indicadores…</p>}
            {source.error && <div className={styles.error}>
              <p role="alert">{source.error}</p>
              <Button variant="outline" size="sm" onClick={source.retry}>Tentar novamente</Button>
            </div>}
            {total === 0 && <p role="status" className="sr-only">Nenhuma ocorrência encontrada no intervalo e nos filtros aplicados.</p>}
          </div>

          <section className={styles.mapCard} aria-labelledby="dashboard-map-title">
            <h2 id="dashboard-map-title" className="sr-only">Ocorrências por Região Administrativa</h2>
            <div className={styles.mapSurface}>
              {!missingGeometry && <MapaDF
                occurrencesByRa={mapSummary.byRa}
                selectedRaCode={filters.ra || null}
                showPoints={false}
                mapMode={mapMode}
                mockOccurrences={mapRecords}
                heatReferenceOccurrences={source.heatReference}
                officialRegions={source.officialRegions}
                heatUnavailable={source.heatUnavailable}
                countsUnavailable={countsUnavailable}
                dashboardZoom={1.25 ** zoomLevel}
                onSelectRa={raCode => onNavigateToCrimeMap(raCode, filters)}
              />}
            </div>

            {mapMessage && <p className={styles.mapStatus} role="status">{mapMessage}</p>}
            <div className={styles.mapControls}>
              <div className={styles.baseControls} role="group" aria-label="Mapa-base">
                <button type="button" aria-pressed={mapBase === "satellite"} onClick={() => setMapBase("satellite")}>
                  <DashboardIcon name="satellite" /> Satélite
                </button>
                <button type="button" aria-pressed={mapBase === "map"} onClick={() => setMapBase("map")}>
                  <NavigationIcon name="map" size={17} /> Mapa
                </button>
              </div>
              <details className={styles.layerControls} open>
                <summary><DashboardIcon name="layers" /> Camadas <span aria-hidden="true">⌄</span></summary>
                <div role="group" aria-label="Camada de ocorrências">
                  {(Object.keys(layers) as (keyof typeof layers)[]).map(mode => (
                    <button key={mode} type="button" aria-pressed={mapBase === "map" && layer === mode} onClick={() => { setLayer(mode); setMapBase("map"); }}>
                      <span aria-hidden="true" /> {layers[mode]}
                    </button>
                  ))}
                </div>
              </details>
            </div>

            {mapBase === "map" && !missingGeometry && <div className={styles.zoom} role="group" aria-label="Enquadramento do mapa">
              <button type="button" aria-label="Ampliar mapa" disabled={zoomLevel >= 4} onClick={() => setZoomLevel(value => value + 1)}>+</button>
              <button type="button" aria-label="Reduzir mapa" disabled={zoomLevel <= 0} onClick={() => setZoomLevel(value => value - 1)}>−</button>
              <button type="button" aria-label="Restaurar enquadramento do mapa" onClick={() => setZoomLevel(0)}><DashboardIcon name="reset" /></button>
            </div>}
            <details className={styles.mapHelp}>
              <summary>Como interpretar o mapa?</summary>
              <p>Cores mais quentes indicam maior concentração. Selecione uma região para abri-la no Mapa Criminal.</p>
            </details>
          </section>
        </div>

        <section className={styles.analysis} aria-label="Análises do Período">
          <div className={styles.kpis} aria-label="Indicadores principais" aria-busy={source.pending}>
            {kpis.map(kpi => <div key={kpi.name} className={styles.kpi} data-tone={kpi.name}>
              <DashboardIcon name={kpi.name} />
              <div className={styles.kpiLabel}>{kpi.label}</div>
              <div
                className={styles.kpiValue}
                data-testid={kpi.name === "occurrences" ? "analytics-total" : undefined}
                data-count={kpi.name === "occurrences" ? total ?? undefined : undefined}
                title={kpi.name === "critical" ? summary.peakDay : undefined}
              >
                {source.pending ? <Skeleton className={styles.valueSkeleton} /> : kpi.value}
              </div>
              <p>{kpi.hint}</p>
            </div>)}
          </div>

          <div className={styles.summaries}>
            <section className={styles.panel} aria-labelledby="dashboard-ranking-title">
              <div className={styles.panelHeader}>
                <DashboardIcon name="ranking" /><h2 id="dashboard-ranking-title">Top 5 RAs por ocorrências</h2>
              </div>
              {ranking.length > 0 ? <ol className={styles.ranking}>
                {ranking.slice(0, 5).map((ra, index) => <li key={ra.codigo}>
                  <button type="button" className={styles.rankRow} onClick={() => onNavigateToCrimeMap(ra.codigo, filters)}>
                    <span className={styles.position}>{index + 1}</span>
                    <span className={styles.regionName}>{ra.nomeDisplay}</span>
                    <strong>{ra.count.toLocaleString("pt-BR")}</strong>
                    <span className={styles.bar} aria-hidden="true"><span style={{ width: `${ra.count / ranking[0].count * 100}%` }} /></span>
                  </button>
                </li>)}
              </ol> : <p className={styles.panelState}>{stateMessage ?? "Nenhuma RA com ocorrências no recorte."}</p>}
              <button type="button" className={styles.allRegions} onClick={() => onNavigateToCrimeMap(undefined, { ...filters, ra: "" })}>Ver todas</button>
            </section>

            <section className={styles.panel} aria-labelledby="dashboard-natures-title">
              <div className={styles.panelHeader}>
                <DashboardIcon name="layers" /><h2 id="dashboard-natures-title">Ocorrências por natureza</h2>
              </div>
              <div className={styles.panelBody}>
                {donutData.length ? <DonutChart data={donutData} dashboard size={150} />
                  : <p className={styles.panelState}>{stateMessage ?? "Nenhuma natureza registrada no recorte."}</p>}
                {persistent && <details className={styles.categories}>
                  <summary>Ocorrências por categoria</summary>
                  {source.categoryCounts.length ? <ul>
                    {source.categoryCounts.map(({ key, count }) => <li key={key}>{key} · {count.toLocaleString("pt-BR")}</li>)}
                  </ul> : <p>{stateMessage ?? "Nenhuma categoria homologada no recorte."}</p>}
                </details>}
              </div>
            </section>
          </div>

          <section className={`${styles.panel} ${styles.trend}`} aria-labelledby="dashboard-trend-title">
            <div className={styles.panelHeader}>
              <DashboardIcon name="trend" /><h2 id="dashboard-trend-title">Evolução das ocorrências</h2>
              <span className={styles.granularity}>Mensal</span>
            </div>
            <div className={styles.panelBody}>
              {summary.timeline.length ? <PeriodTrend timeline={summary.timeline} dashboard />
                : <p className={styles.panelState}>{stateMessage ?? "Sem ocorrências para exibir a evolução temporal."}</p>}
            </div>
          </section>
        </section>
      </div>
    </div>
  </div>;
}
