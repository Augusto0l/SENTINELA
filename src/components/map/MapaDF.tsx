import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import MapClusterLayer from "@/components/map/MapClusterLayer";
import SatelliteBoundary from "@/components/map/SatelliteBoundary";
import StreetBasemap, { StreetAttribution } from "@/components/map/StreetBasemap";
import {
  MAP_VIEWBOX,
  MAP_WIDTH,
  MAP_HEIGHT,
  RAS,
  RA_BY_CODE,
  GEO_BOUNDS,
  projectLonLat,
  type RAData,
} from "./raMapData";
import type { MockOccurrence } from "../../data/mockOccurrences";
import { createDensityField, DASHBOARD_HEAT, HEAT_GRADIENT, memoizePointTest, projectHeatRecords } from "@/components/map/heatmapDensity";
import { renderDensityHeatmap, renderProjectedHeatmap } from "@/components/map/heatmapCanvas";
import { clusterCell, frameDetail, pointRadius } from "@/components/map/mapSymbols";
import { officialRaLines } from "@/components/map/raTooltip";
import { useStreetNavigation } from "@/components/map/useStreetNavigation";
import type { ManualMapPoint } from "@/lib/db/manual-map";
import type { MapOccurrenceInteraction } from "@/components/map/MapOccurrenceTooltip";
import styles from "@/components/map/AnalyticMap.module.css";

export type MapMode = "heat" | "points" | "clusters" | "satellite";
export type MapOccurrence = MockOccurrence & { occurrenceId?: string };

const MapOccurrenceDetail = dynamic(() => import("@/features/occurrences/OccurrenceWorkspace")
  .then(module => module.ConsolidatedDetail), { ssr: false });

const SatelliteMap = dynamic(() => import("@/components/map/SatelliteMap"), {
  ssr: false,
  loading: () => <p role="status" style={{ padding: 24, color: "var(--theme-94a3b8)", fontSize: 12 }}>Carregando visualização de satélite…</p>,
});

type OccurrencePoint = {
  id: string | number;
  latitude: number;
  longitude: number;
  raCode?: string;
  nature?: string;
};

type Props = {
  selectedRaCode?: string | null;
  onSelectRa?: (raCode: string) => void;
  onClickPoint?: (svgX: number, svgY: number, lat: number, lon: number) => void;
  pinX?: number | null;
  pinY?: number | null;
  occurrencesByRa?: Record<string, number>;
  /**
   * Statistical occurrences per RA, kept apart from the published map points in occurrencesByRa.
   * Omit it while no occurrence of the cut has a validated territorial link: a zero would read as "no crimes".
   */
  statisticsByRa?: Record<string, number>;
  occurrencePoints?: OccurrencePoint[];
  showPoints?: boolean;
  mapMode?: MapMode;
  mockOccurrences?: MapOccurrence[];
  heatReferenceOccurrences?: readonly MapOccurrence[];
  officialRegions?: RAData[];
  heatUnavailable?: boolean;
  countsUnavailable?: boolean;
  dashboardZoom?: number;
  streetBasemap?: boolean;
  satelliteOccurrences?: { visible: boolean; onChange: (visible: boolean) => void };
  occurrenceInteraction?: MapOccurrenceInteraction;
  manualPoints?: readonly ManualMapPoint[];
  focusedOccurrence?: string;
};

function colorFor(value: number, min: number, max: number) {
  if (max <= min) return "#2563eb";
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const stops = [
    [37, 99, 235],
    [6, 182, 212],
    [250, 204, 21],
    [249, 115, 22],
    [239, 68, 68],
  ];
  const scaled = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = stops[i];
  const b = stops[i + 1];
  const c = a.map((v, idx) => Math.round(v + (b[idx] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function svgToLatLon(svgX: number, svgY: number) {
  const lon = (svgX - GEO_BOUNDS.padding) / (GEO_BOUNDS.cosLat * GEO_BOUNDS.scale) + GEO_BOUNDS.minLon;
  const lat = GEO_BOUNDS.maxLat - (svgY - GEO_BOUNDS.padding) / GEO_BOUNDS.scale;
  return { lat, lon };
}

export default function MapaDF({
  selectedRaCode,
  onSelectRa,
  onClickPoint,
  pinX,
  pinY,
  occurrencesByRa = {},
  statisticsByRa,
  occurrencePoints = [],
  showPoints = true,
  mapMode = "heat",
  mockOccurrences = [],
  heatReferenceOccurrences = mockOccurrences,
  officialRegions,
  heatUnavailable = false,
  countsUnavailable = false,
  dashboardZoom,
  streetBasemap = false,
  satelliteOccurrences,
  occurrenceInteraction,
  manualPoints,
  focusedOccurrence,
}: Props) {
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number; width: number } | null>(null);
  const [hoveredOcc, setHoveredOcc] = useState<MockOccurrence | null>(null);
  const [openedPoint, setOpenedPoint] = useState<MapOccurrence>();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const heatCanvasRef = useRef<HTMLCanvasElement>(null);
  const heatClipId = useId();
  const [symbolScale, setSymbolScale] = useState(1);

  const regions = officialRegions ?? RAS;
  const selectedRA = selectedRaCode ? (officialRegions ? regions.find(region => region.code === selectedRaCode) : RA_BY_CODE[selectedRaCode]) : undefined;
  const visibleRAs = selectedRA ? [selectedRA] : regions;
  const fittedViewBox = selectedRA ? selectedRA.viewBox : MAP_VIEWBOX;
  const [x, y, width, height] = fittedViewBox.split(" ").map(Number);
  const zoom = dashboardZoom ?? 1;
  const viewBox = zoom === 1 ? fittedViewBox
    : [x + width * (1 - 1 / zoom) / 2, y + height * (1 - 1 / zoom) / 2, width / zoom, height / zoom].join(" ");
  const dashboard = dashboardZoom !== undefined;
  const detail = frameDetail(fittedViewBox);
  const heatStyle = dashboard ? DASHBOARD_HEAT : undefined;
  // The location picker also uses this component; preserve its existing appearance.
  const heatmapActive = mapMode === "heat" && !onClickPoint && !heatUnavailable && !countsUnavailable;
  const analyticMap = !onClickPoint;
  const [viewX, viewY, viewWidth, viewHeight] = viewBox.split(" ").map(Number);
  const onOccurrenceHover = occurrenceInteraction?.onHover;
  const onOccurrenceOpen = occurrenceInteraction?.onOpen;
  const openOccurrence = useCallback((point: MapOccurrence) => {
    if (onOccurrenceOpen) onOccurrenceOpen(point);
    else setOpenedPoint(point);
  }, [onOccurrenceOpen]);
  const clearHover = useCallback(() => {
    setHoveredCode(null);
    setHoveredOcc(null);
    setTooltipPos(null);
    onOccurrenceHover?.(null);
  }, [onOccurrenceHover]);
  const navigation = useStreetNavigation(svgRef, streetBasemap && mapMode !== "satellite", fittedViewBox, clearHover);
  const symbolLength = (value: number) => `calc(${value}px * var(--street-fit-ratio, 1))`;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || (!dashboard && mapMode !== "points" && mapMode !== "clusters")) return;
    const update = () => {
      const matrix = streetBasemap ? null : svg.getScreenCTM();
      const scale = streetBasemap ? Math.min(svg.clientWidth / width, svg.clientHeight / height)
        : matrix ? Math.hypot(matrix.a, matrix.b) : 1;
      if (Number.isFinite(scale) && scale > 0) setSymbolScale(scale);
    };
    const frame = requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(svg);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [dashboard, mapMode, viewBox, streetBasemap, width, height]);

  const values = regions.map((ra) => occurrencesByRa[ra.code] ?? 0);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  const visibleOccs = useMemo(() => {
    if (!selectedRaCode) return mockOccurrences;
    return mockOccurrences.filter((o) => o.raCode === selectedRaCode);
  }, [mockOccurrences, selectedRaCode]);
  const canOpenPoint = mapMode === "points" || (mapMode === "satellite" && satelliteOccurrences?.visible);
  const activePoint = canOpenPoint && openedPoint
    ? visibleOccs.find(point => point.occurrenceId === openedPoint.occurrenceId) : undefined;
  if (openedPoint && !activePoint) setOpenedPoint(undefined);

  // The point-in-region test depends only on the official geometry. Keeping it per `regions` (not per mode)
  // lets the reference field, the heat field, filter changes and returns to "heat" share exact answers.
  const heatGeometry = useMemo(() => {
    if (typeof document === "undefined") return null;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return null;
    let boundary: Path2D | undefined;
    return {
      contains: memoizePointTest((x, y) => {
        if (!boundary) {
          boundary = new Path2D();
          for (const ra of regions) boundary.addPath(new Path2D(ra.path));
        }
        return context.isPointInPath(boundary, x, y, "evenodd");
      }),
    };
  }, [regions]);
  const heatDomain = heatmapActive ? heatGeometry : null;

  const referenceField = useMemo(() => {
    if (!heatDomain) return null;
    const points = projectHeatRecords(heatReferenceOccurrences, projectLonLat, heatDomain.contains);
    return createDensityField(points, MAP_WIDTH, MAP_HEIGHT, heatDomain.contains, heatStyle);
  }, [heatDomain, heatReferenceOccurrences, heatStyle]);

  const heatPoints = useMemo(() => heatDomain ? projectHeatRecords(visibleOccs, projectLonLat, heatDomain.contains) : [], [visibleOccs, heatDomain]);
  const heatField = useMemo(() => heatDomain ? createDensityField(heatPoints, MAP_WIDTH, MAP_HEIGHT, heatDomain.contains, heatStyle) : null, [heatPoints, heatDomain, heatStyle]);
  const streetHeatActive = streetBasemap && heatmapActive;
  const useFullHeatClip = streetHeatActive && !selectedRA;
  const fullHeatClip = useMemo(() => useFullHeatClip ? regions.map(ra => ra.path).join(" ") : "", [useFullHeatClip, regions]);
  const streetHeatClip = streetHeatActive ? selectedRA?.path ?? fullHeatClip : "";

  // Draw heatmap whenever relevant things change
  useEffect(() => {
    const canvas = heatCanvasRef.current;
    if (!canvas) return;
    if (!heatmapActive || !heatField || !referenceField) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const boundary = new Path2D();
    for (const ra of selectedRA ? [selectedRA] : regions) boundary.addPath(new Path2D(ra.path));
    if (streetBasemap) {
      renderProjectedHeatmap(canvas, MAP_WIDTH, MAP_HEIGHT, heatField, referenceField.peak, boundary);
      return;
    }
    const draw = () => {
      if (!svgRef.current) return;
      renderDensityHeatmap(canvas, svgRef.current, heatField, referenceField.peak, boundary, heatStyle?.maxOpacity);
    };
    draw();
    const observer = new ResizeObserver(draw);
    if (svgRef.current) observer.observe(svgRef.current);
    return () => observer.disconnect();
  }, [heatmapActive, heatField, referenceField, viewBox, selectedRA, regions, heatStyle, streetBasemap]);

  const updateTooltipPosition = (e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top, width: rect.width });
    }
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (streetBasemap && (svgRef.current?.dataset.navigating === "true" || (!hoveredCode && !hoveredOcc))) return;
    updateTooltipPosition(e);
  };

  const activeHoveredOcc = hoveredOcc && visibleOccs.includes(hoveredOcc) ? hoveredOcc : null;
  // Persistent maps use the official names and separate statistical occurrences from published map points.
  const tooltipRA = hoveredCode ? (regions.find(ra => ra.code === hoveredCode) ?? RA_BY_CODE[hoveredCode]) : null;
  const raLines = (code: string) => countsUnavailable ? null : officialRegions
    ? officialRaLines(statisticsByRa ? statisticsByRa[code] ?? 0 : undefined, occurrencesByRa[code] ?? 0)
    : occurrencesByRa[code] === undefined ? null : [`${occurrencesByRa[code].toLocaleString("pt-BR")} ocorrências`];
  const tooltipLines = hoveredCode != null ? raLines(hoveredCode) : null;

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onClickPoint || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const [vx, vy, vw, vh] = viewBox.split(" ").map(Number);
    const svgX = vx + ((e.clientX - rect.left) / rect.width) * vw;
    const svgY = vy + ((e.clientY - rect.top) / rect.height) * vh;
    const { lat, lon } = svgToLatLon(svgX, svgY);
    onClickPoint(svgX, svgY, lat, lon);
  };

  const occurrenceDetail = activePoint?.occurrenceId && (
    <MapOccurrenceDetail id={activePoint.occurrenceId} area="consolidadas" mapPosition={activePoint}
      onClose={() => setOpenedPoint(undefined)} />
  );

  if (mapMode === "satellite") return <>
    <SatelliteBoundary>
      <SatelliteMap selectedRaCode={selectedRaCode} onSelectRa={onSelectRa} occurrencesByRa={occurrencesByRa} statisticsByRa={statisticsByRa}
        regionNames={officialRegions && Object.fromEntries(officialRegions.map(ra => [ra.code, ra.displayName]))}
        official={Boolean(officialRegions)} countsUnavailable={countsUnavailable}
        occurrenceLayer={satelliteOccurrences && { ...satelliteOccurrences, points: visibleOccs, onSelect: openOccurrence, onHover: onOccurrenceHover }} />
    </SatelliteBoundary>
    {occurrenceDetail}
  </>;

  return (
    <div
      ref={containerRef}
      className={analyticMap ? `${styles.map}${dashboard ? ` ${styles.dashboardMap}` : ""}` : undefined}
      style={{ width: "100%", height: "100%", minHeight: 0, position: "relative" }}
      onMouseMove={handleMouseMove}
    >
      <svg
        ref={svgRef}
        viewBox={viewBox}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        className={streetBasemap ? styles.streetNavigation : undefined}
        style={{ display: "block", background: analyticMap ? "var(--heatmap-bg)" : "#07111f",
          cursor: onClickPoint ? "crosshair" : streetBasemap ? undefined : "default" }}
        onClick={handleSvgClick}
      >
        {streetBasemap && <StreetBasemap fittedViewBox={fittedViewBox} />}

        {/* RA polygons */}
        <g>
          {visibleRAs.map((ra) => {
            const count = occurrencesByRa[ra.code] ?? 0;
            const hovered = hoveredCode === ra.code;
            return (
              <path
                key={ra.code}
                role="button"
                tabIndex={onSelectRa ? 0 : undefined}
                aria-label={`${ra.displayName}: ${countsUnavailable ? "dados indisponíveis" : officialRegions
                  ? (raLines(ra.code) ?? []).join("; ") : `${count} ocorrências demonstrativas`}`}
                aria-pressed={selectedRaCode === ra.code}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectRa?.(ra.code);
                  }
                }}
                id={ra.id}
                d={ra.path}
                fill={analyticMap ? "var(--heatmap-ra-fill)" : selectedRA ? "#1d4ed8" : colorFor(count, minValue, maxValue)}
                fillOpacity={analyticMap ? 1 : hovered ? 0.95 : mapMode === "heat" ? 0.42 : 0.82}
                className={streetBasemap ? styles.streetRegion : undefined}
                fillRule="evenodd"
                stroke={analyticMap ? (hovered ? "var(--heatmap-border-hover)" : "var(--heatmap-border)") : hovered ? "#ffffff" : "#60a5fa"}
                strokeWidth={hovered ? 2.6 : 0.9}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: "pointer", transition: "fill-opacity .15s, stroke .15s" }}
                onMouseEnter={event => {
                  if (svgRef.current?.dataset.navigating === "true") return;
                  setHoveredCode(ra.code);
                  if (streetBasemap) updateTooltipPosition(event);
                }}
                onMouseLeave={() => { setHoveredCode(null); setTooltipPos(null); }}
                onClick={() => onSelectRa?.(ra.code)}
              />
            );
          })}
        </g>

        {/* Heat belongs below geographic boundaries and labels, in the same SVG transform. */}
        {heatmapActive && (
          <>
            {streetBasemap && <defs><clipPath id={heatClipId}><path d={streetHeatClip} clipRule="evenodd" /></clipPath></defs>}
            <foreignObject x={streetBasemap ? 0 : viewX} y={streetBasemap ? 0 : viewY}
              width={streetBasemap ? MAP_WIDTH : viewWidth} height={streetBasemap ? MAP_HEIGHT : viewHeight}
              clipPath={streetBasemap ? `url(#${heatClipId})` : undefined} pointerEvents="none">
              <canvas ref={heatCanvasRef} data-testid="crime-heatmap" data-point-count={heatPoints.length} data-reference-peak={referenceField?.peak ?? 0} width={MAP_WIDTH} height={MAP_HEIGHT} style={{ display: "block", width: "100%", height: "100%", pointerEvents: "none" }} />
            </foreignObject>
            <g pointerEvents="none" fill="none">
              {visibleRAs.map(ra => <path key={`border-${ra.code}`} d={ra.path} stroke={hoveredCode === ra.code ? "var(--heatmap-border-hover)" : "var(--heatmap-border)"} strokeWidth={hoveredCode === ra.code ? 2.6 : 0.9} vectorEffect="non-scaling-stroke" />)}
            </g>
          </>
        )}

        {/* RA labels when showing all RAs */}
        {!selectedRA && (analyticMap ? mapMode === "heat" : mapMode !== "points") && (
          <g pointerEvents="none" data-testid="ra-count-labels">
            {regions.map((ra) => {
              const count = occurrencesByRa[ra.code];
              if (!count) return null;
              const badgeW = 38;
              const badgeH = 13;
              return (
                <g key={`label-${ra.code}`}>
                  {/* Name */}
                  {!heatmapActive && (
                  <text
                    x={ra.labelPoint.x}
                    y={ra.labelPoint.y - 8}
                    textAnchor="middle"
                    fontSize={8.5}
                    fill={heatmapActive ? "var(--heatmap-label)" : "rgba(241,245,249,0.88)"}
                    fontFamily="system-ui,sans-serif"
                    fontWeight="700"
                    style={{ textShadow: heatmapActive ? "var(--heatmap-label-shadow)" : "0 1px 3px rgba(0,0,0,0.8)" }}
                  >
                    {ra.displayName}
                  </text>
                  )}
                  {/* Count badge background */}
                  <rect
                    x={ra.labelPoint.x - badgeW / 2}
                    y={ra.labelPoint.y}
                    width={badgeW}
                    height={badgeH}
                    rx={4}
                    fill={heatmapActive ? "var(--heatmap-badge)" : "rgba(0,0,0,0.65)"}
                    stroke="rgba(96,165,250,0.25)"
                    strokeWidth={0.6}
                    style={streetBasemap ? {
                      x: `calc(${ra.labelPoint.x}px - ${symbolLength(badgeW / 2)})`,
                      width: symbolLength(badgeW), height: symbolLength(badgeH), rx: symbolLength(4),
                    } : undefined}
                  />
                  {/* Count text */}
                  <text
                    x={ra.labelPoint.x}
                    y={ra.labelPoint.y + 9.5}
                    textAnchor="middle"
                    fontSize={8}
                    fill={heatmapActive ? "var(--heatmap-count)" : "#93c5fd"}
                    style={streetBasemap ? {
                      fontSize: symbolLength(8),
                      transform: `translateY(calc(${symbolLength(9.5)} - 9.5px))`,
                    } : undefined}
                    fontFamily="system-ui,sans-serif"
                    fontWeight="700"
                  >
                    {count.toLocaleString("pt-BR")}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* Points mode */}
        {mapMode === "points" && (
          <g data-testid="occurrence-points">
            {visibleOccs.map((p) => (
              <g key={p.id} role={p.occurrenceId ? "button" : undefined} tabIndex={p.occurrenceId ? 0 : undefined}
                aria-label={p.occurrenceId ? `Detalhes da ocorrência em ${p.raName}` : undefined}
                onClick={p.occurrenceId ? () => openOccurrence(p) : undefined}
                onKeyDown={p.occurrenceId ? event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openOccurrence(p);
                  }
                } : undefined}
                onMouseEnter={onOccurrenceHover && p.occurrenceId ? event => {
                  if (svgRef.current?.dataset.navigating === "true") return;
                  setHoveredOcc(p);
                  onOccurrenceHover({ point: p, clientX: event.clientX, clientY: event.clientY });
                } : undefined}
                onMouseLeave={onOccurrenceHover ? () => { setHoveredOcc(null); onOccurrenceHover(null); } : undefined}>
                {p.occurrenceId && <circle cx={p.x} cy={p.y} r={12 / symbolScale} fill="transparent"
                  style={{ cursor: "pointer", r: streetBasemap ? symbolLength(12 / symbolScale) : undefined }} />}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={pointRadius(symbolScale, detail)}
                  fill="#ef4444"
                  opacity={0.95}
                  stroke="#fecaca"
                  strokeOpacity={0.65}
                  strokeWidth={0.6}
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: "pointer", r: streetBasemap ? symbolLength(pointRadius(symbolScale, detail)) : undefined }}
                  onMouseEnter={!onOccurrenceHover ? (e) => {
                    if (svgRef.current?.dataset.navigating === "true") return;
                    setHoveredOcc(p);
                    updateTooltipPosition(e);
                  } : undefined}
                  onMouseLeave={!onOccurrenceHover ? () => { setHoveredOcc(null); setTooltipPos(null); } : undefined}
                />
              </g>
            ))}
          </g>
        )}

        {/* Clusters mode */}
        {mapMode === "clusters" && (
          <MapClusterLayer points={visibleOccs} cellSize={clusterCell(detail * navigation.clusterDetail)}
            symbolScale={symbolScale} detail={detail} scaleLength={streetBasemap ? symbolLength : undefined} />
        )}

        {/* Location pin */}
        {pinX != null && pinY != null && (
          <g pointerEvents="none">
            <circle cx={pinX} cy={pinY} r={14} fill="rgba(37,99,235,0.2)" />
            <circle cx={pinX} cy={pinY} r={7} fill="#2563eb" />
            <circle cx={pinX} cy={pinY} r={3} fill="#fff" />
          </g>
        )}

        {manualPoints?.filter(point => !selectedRA || point.raCode === selectedRA.code).map(point => {
          const { x, y } = projectLonLat(point.longitude, point.latitude);
          const review = point.status === "em_revisao";
          const label = review ? "Ocorrência manual em revisão" : "Ocorrência manual consolidada";
          const isFocused = point.id === focusedOccurrence;
          return <a key={point.id} href={`/ocorrencias?${review ? "manual" : "ocorrencia"}=${point.id}`} aria-label={label}>
            <circle cx={x} cy={y} r={isFocused ? 8 : 5} fill={review ? "#fbbf24" : "#60a5fa"}
              stroke={isFocused ? "#fff" : "#422006"} strokeWidth={2} vectorEffect="non-scaling-stroke"
              data-testid="manual-map-marker" data-occurrence={point.id}>
              <title>{label}</title>
            </circle>
          </a>;
        })}

        {/* Legacy occurrencePoints */}
        {showPoints && occurrencePoints.length > 0 && mapMode !== "points" && mapMode !== "clusters" && (
          <g pointerEvents="none">
            {occurrencePoints
              .filter((p) => !selectedRaCode || p.raCode === selectedRaCode)
              .map((p) => {
                const { x, y } = projectLonLat(p.longitude, p.latitude);
                return (
                  <g key={p.id}>
                    <circle cx={x} cy={y} r={5} fill="#f97316" opacity={0.16} />
                    <circle cx={x} cy={y} r={1.7} fill="#fb923c" opacity={0.95} />
                  </g>
                );
              })}
          </g>
        )}
      </svg>

      {streetBasemap && <>
        <StreetAttribution />
        <div className={styles.streetControls} role="group" aria-label="Navegação no mapa">
          <button type="button" aria-label="Aproximar mapa" title="Aproximar mapa" onClick={() => navigation.zoom(1.6)}>+</button>
          <button type="button" aria-label="Afastar mapa" title="Afastar mapa" onClick={() => navigation.zoom(1 / 1.6)}>−</button>
          <button type="button" aria-label="Restaurar enquadramento do mapa" title="Restaurar enquadramento do mapa" onClick={navigation.reset}>⌂</button>
        </div>
      </>}

      {/* Legend */}
      {!selectedRA && analyticMap && (
        <div className={styles.legend} style={{ position: "absolute", bottom: dashboard ? 12 : 14, left: dashboard ? undefined : 16, right: dashboard ? 12 : undefined, pointerEvents: "none", borderRadius: 7, padding: "8px 10px", fontSize: 10 }}>
          {mapMode === "heat" ? <>
            {dashboard && <div>Densidade de ocorrências</div>}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 24, fontSize: 9, marginBottom: 5 }}><span>Menor densidade</span><span>Maior densidade</span></div>
            <div style={{ width: 168, maxWidth: "100%", height: 7, borderRadius: 4, background: HEAT_GRADIENT }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 8 }}><span>Baixa</span><span>Média</span><span>Alta</span></div>
          </> : <>
            <span className={`${styles.legendSymbol} ${mapMode === "points" ? styles.pointSymbol : styles.clusterSymbol}`} />
            {mapMode === "points" ? "Ocorrência individual" : "Quantidade de ocorrências agrupadas"}
          </>}
        </div>
      )}
      {dashboard && <MapScale pixelsPerKm={symbolScale * GEO_BOUNDS.scale / 111.32} />}
      {!selectedRA && !analyticMap && (
        <div style={{
          position: "absolute", bottom: 14, left: 16, pointerEvents: "none",
          background: "var(--theme-map-control)", backdropFilter: "blur(6px)",
          border: "1px solid rgba(30,58,95,0.6)", borderRadius: 7, padding: "7px 10px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 9, color: "var(--color-text-muted)", letterSpacing: "0.02em" }}>{heatmapActive ? "Menor densidade" : "Menor incidência"}</span>
            <span style={{ fontSize: 9, color: "var(--color-text-muted)", letterSpacing: "0.02em" }}>{heatmapActive ? "Maior densidade" : "Maior incidência"}</span>
          </div>
          <div style={{
            width: 168, height: 7, borderRadius: 4,
            background: heatmapActive ? HEAT_GRADIENT : "linear-gradient(to right, #2563eb, #06b6d4, #facc15, #f97316, #ef4444)",
            boxShadow: "0 0 8px rgba(239,68,68,0.3)",
          }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            {["Baixa", "Média", "Alta"].map((l) => (
              <span key={l} style={{ fontSize: 8, color: "var(--color-text-muted)" }}>{l}</span>
            ))}
          </div>
        </div>
      )}

      {/* RA hover tooltip */}
      {hoveredCode && tooltipRA && tooltipPos && !activeHoveredOcc && (
        <div
          style={{
            position: "absolute",
            left: Math.max(8, Math.min(tooltipPos.x + 14, tooltipPos.width - 180)),
            top: Math.max(tooltipPos.y - 10, 8),
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--theme-0b1829)",
            border: "1px solid var(--theme-263a55)",
            color: "var(--theme-f1f5f9)",
            pointerEvents: "none",
            zIndex: 10,
            minWidth: 160,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--theme-f1f5f9)", marginBottom: 2 }}>
            {tooltipRA.displayName}
          </div>
          <div style={{ fontSize: 11, color: "var(--theme-60a5fa)", marginBottom: 6, fontWeight: 600 }}>
            {tooltipRA.code}
          </div>
          {tooltipLines ? tooltipLines.map(line => <div key={line} style={{ fontSize: 12, color: "var(--theme-94a3b8)" }}>{line}</div>)
            : <div style={{ fontSize: 12, color: "var(--theme-475569)" }}>Dados não disponíveis</div>}
        </div>
      )}

      {/* Occurrence point tooltip */}
      {!onOccurrenceHover && activeHoveredOcc && tooltipPos && (
        <div
          style={{
            position: "absolute",
            left: Math.max(8, Math.min(tooltipPos.x + 14, tooltipPos.width - 200)),
            top: Math.max(tooltipPos.y - 10, 8),
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--theme-0b1829)",
            border: "1px solid var(--theme-263a55)",
            color: "var(--theme-f1f5f9)",
            pointerEvents: "none",
            zIndex: 10,
            minWidth: 180,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--theme-fb923c)", marginBottom: 4 }}>
            {activeHoveredOcc.natureza}
          </div>
          <div style={{ fontSize: 12, color: "var(--theme-94a3b8)", marginBottom: 2 }}>{activeHoveredOcc.raName}</div>
          {!officialRegions && <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 2 }}>
            {activeHoveredOcc.data} — {activeHoveredOcc.horario}
          </div>}
          {!officialRegions && <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontFamily: "monospace" }}>{activeHoveredOcc.id}</div>}
        </div>
      )}
      {occurrenceDetail}
    </div>
  );
}

function MapScale({ pixelsPerKm }: { pixelsPerKm: number }) {
  const distance = [20, 10, 5, 2, 1].find(km => km * pixelsPerKm <= 104);
  if (!distance) return null;
  return <div className={styles.dashboardScale} style={{ width: distance * pixelsPerKm }}>{distance} km</div>;
}
