import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MAP_VIEWBOX,
  MAP_WIDTH,
  MAP_HEIGHT,
  RAS,
  RA_BY_CODE,
  GEO_BOUNDS,
  projectLonLat,
} from "./raMapData";
import type { MockOccurrence } from "../../data/mockOccurrences";

export type MapMode = "heat" | "points" | "clusters";

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
  occurrencePoints?: OccurrencePoint[];
  showPoints?: boolean;
  mapMode?: MapMode;
  mockOccurrences?: MockOccurrence[];
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

function buildClusters(points: MockOccurrence[], cellSize: number) {
  const cells: Record<string, { x: number; y: number; count: number }> = {};
  for (const p of points) {
    const cx = Math.floor(p.x / cellSize);
    const cy = Math.floor(p.y / cellSize);
    const key = `${cx},${cy}`;
    if (!cells[key]) cells[key] = { x: 0, y: 0, count: 0 };
    cells[key].x += p.x;
    cells[key].y += p.y;
    cells[key].count++;
  }
  return Object.values(cells).map((c) => ({
    x: c.x / c.count,
    y: c.y / c.count,
    count: c.count,
  }));
}

// Heatmap canvas renderer
function renderHeatmap(
  canvas: HTMLCanvasElement,
  svgEl: SVGSVGElement | null,
  points: MockOccurrence[],
  viewBox: string
) {
  const ctx = canvas.getContext("2d");
  if (!ctx || !svgEl) return;

  const [vx, vy, vw, vh] = viewBox.split(" ").map(Number);
  const cw = canvas.width;
  const ch = canvas.height;
  const scaleX = cw / vw;
  const scaleY = ch / vh;
  const offX = -vx * scaleX;
  const offY = -vy * scaleY;

  ctx.clearRect(0, 0, cw, ch);

  const r = Math.max(28, Math.min(72, (cw / vw) * 52));

  // First pass — wide cool-color bloom
  for (const p of points) {
    const cx = p.x * scaleX + offX;
    const cy = p.y * scaleY + offY;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.4);
    g.addColorStop(0,   "rgba(250,204,21,0.08)");
    g.addColorStop(0.5, "rgba(37,99,235,0.04)");
    g.addColorStop(1,   "rgba(37,99,235,0)");
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  // Second pass — hot core
  for (const p of points) {
    const cx = p.x * scaleX + offX;
    const cy = p.y * scaleY + offY;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0,    "rgba(239,68,68,0.52)");
    grad.addColorStop(0.25, "rgba(249,115,22,0.32)");
    grad.addColorStop(0.55, "rgba(250,204,21,0.16)");
    grad.addColorStop(0.8,  "rgba(37,99,235,0.06)");
    grad.addColorStop(1,    "rgba(37,99,235,0)");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }
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
  occurrencePoints = [],
  showPoints = true,
  mapMode = "heat",
  mockOccurrences = [],
}: Props) {
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredOcc, setHoveredOcc] = useState<MockOccurrence | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const heatCanvasRef = useRef<HTMLCanvasElement>(null);

  const selectedRA = selectedRaCode ? RA_BY_CODE[selectedRaCode] : undefined;
  const visibleRAs = selectedRA ? [selectedRA] : RAS;
  const viewBox = selectedRA ? selectedRA.viewBox : MAP_VIEWBOX;

  const values = RAS.map((ra) => occurrencesByRa[ra.code] ?? 0);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  const visibleOccs = useMemo(() => {
    if (!selectedRaCode) return mockOccurrences;
    return mockOccurrences.filter((o) => o.raCode === selectedRaCode);
  }, [mockOccurrences, selectedRaCode]);

  const clusters = useMemo(
    () => (mapMode === "clusters" ? buildClusters(visibleOccs, 80) : []),
    [visibleOccs, mapMode]
  );

  // Draw heatmap whenever relevant things change
  useEffect(() => {
    const canvas = heatCanvasRef.current;
    if (!canvas) return;
    if (mapMode !== "heat" || visibleOccs.length === 0) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    canvas.width = MAP_WIDTH;
    canvas.height = MAP_HEIGHT;
    renderHeatmap(canvas, svgRef.current, visibleOccs, viewBox);
  }, [mapMode, visibleOccs, viewBox]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const tooltipRA = hoveredCode ? RA_BY_CODE[hoveredCode] : null;
  const tooltipCount =
    hoveredCode != null ? (occurrencesByRa[hoveredCode] ?? null) : null;

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onClickPoint || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const [vx, vy, vw, vh] = viewBox.split(" ").map(Number);
    const svgX = vx + ((e.clientX - rect.left) / rect.width) * vw;
    const svgY = vy + ((e.clientY - rect.top) / rect.height) * vh;
    const { lat, lon } = svgToLatLon(svgX, svgY);
    onClickPoint(svgX, svgY, lat, lon);
  };

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: 420, position: "relative" }}
      onMouseMove={handleMouseMove}
    >
      <svg
        ref={svgRef}
        viewBox={viewBox}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", background: "#07111f", cursor: onClickPoint ? "crosshair" : "default" }}
        onClick={handleSvgClick}
      >
        {/* RA polygons */}
        <g>
          {visibleRAs.map((ra) => {
            const count = occurrencesByRa[ra.code] ?? 0;
            const hovered = hoveredCode === ra.code;
            return (
              <path
                key={ra.code}
                id={ra.id}
                d={ra.path}
                fill={selectedRA ? "#1d4ed8" : colorFor(count, minValue, maxValue)}
                fillOpacity={hovered ? 0.95 : mapMode === "heat" ? 0.42 : 0.82}
                fillRule="evenodd"
                stroke={hovered ? "#ffffff" : "#60a5fa"}
                strokeWidth={hovered ? 2.6 : 0.9}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: "pointer", transition: "fill-opacity .15s, stroke .15s" }}
                onMouseEnter={() => setHoveredCode(ra.code)}
                onMouseLeave={() => { setHoveredCode(null); setTooltipPos(null); }}
                onClick={() => onSelectRa?.(ra.code)}
              />
            );
          })}
        </g>

        {/* RA labels when showing all RAs */}
        {!selectedRA && mapMode !== "points" && (
          <g pointerEvents="none">
            {RAS.map((ra) => {
              const count = occurrencesByRa[ra.code];
              if (!count) return null;
              const badgeW = 38;
              const badgeH = 13;
              return (
                <g key={`label-${ra.code}`}>
                  {/* Name */}
                  <text
                    x={ra.labelPoint.x}
                    y={ra.labelPoint.y - 8}
                    textAnchor="middle"
                    fontSize={8.5}
                    fill="rgba(241,245,249,0.88)"
                    fontFamily="system-ui,sans-serif"
                    fontWeight="700"
                    style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
                  >
                    {ra.displayName}
                  </text>
                  {/* Count badge background */}
                  <rect
                    x={ra.labelPoint.x - badgeW / 2}
                    y={ra.labelPoint.y}
                    width={badgeW}
                    height={badgeH}
                    rx={4}
                    fill="rgba(0,0,0,0.65)"
                    stroke="rgba(96,165,250,0.25)"
                    strokeWidth={0.6}
                  />
                  {/* Count text */}
                  <text
                    x={ra.labelPoint.x}
                    y={ra.labelPoint.y + 9.5}
                    textAnchor="middle"
                    fontSize={8}
                    fill="#93c5fd"
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
          <g>
            {visibleOccs.map((p) => (
              <g key={p.id}>
                {/* outer glow */}
                <circle cx={p.x} cy={p.y} r={7} fill="#f97316" opacity={0.07} pointerEvents="none" />
                <circle cx={p.x} cy={p.y} r={4.5} fill="#fbbf24" opacity={0.16} pointerEvents="none" />
                {/* core dot */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={2.2}
                  fill="#fb923c"
                  opacity={0.92}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => {
                    setHoveredOcc(p);
                    if (containerRef.current) {
                      const rect = containerRef.current.getBoundingClientRect();
                      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                    }
                  }}
                  onMouseLeave={() => { setHoveredOcc(null); setTooltipPos(null); }}
                />
                {/* bright center spark */}
                <circle cx={p.x} cy={p.y} r={0.9} fill="#fef08a" opacity={0.85} pointerEvents="none" />
              </g>
            ))}
          </g>
        )}

        {/* Clusters mode */}
        {mapMode === "clusters" && (
          <g pointerEvents="none">
            {clusters.map((c, i) => {
              const r = Math.max(14, Math.min(32, 10 + Math.sqrt(c.count) * 2.5));
              return (
                <g key={i}>
                  <circle cx={c.x} cy={c.y} r={r + 4} fill="rgba(37,99,235,0.15)" />
                  <circle cx={c.x} cy={c.y} r={r} fill="rgba(37,99,235,0.75)" />
                  <text
                    x={c.x}
                    y={c.y + 4}
                    textAnchor="middle"
                    fontSize={Math.max(8, Math.min(12, r * 0.8))}
                    fill="#fff"
                    fontFamily="sans-serif"
                    fontWeight="700"
                  >
                    {c.count}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* Location pin */}
        {pinX != null && pinY != null && (
          <g pointerEvents="none">
            <circle cx={pinX} cy={pinY} r={14} fill="rgba(37,99,235,0.2)" />
            <circle cx={pinX} cy={pinY} r={7} fill="#2563eb" />
            <circle cx={pinX} cy={pinY} r={3} fill="#fff" />
          </g>
        )}

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

      {/* Heatmap canvas overlay */}
      <canvas
        ref={heatCanvasRef}
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          opacity: mapMode === "heat" ? 1 : 0,
          transition: "opacity .3s",
          mixBlendMode: "screen",
        }}
      />

      {/* Legend */}
      {!selectedRA && (
        <div style={{
          position: "absolute", bottom: 14, left: 16, pointerEvents: "none",
          background: "rgba(7,17,31,0.75)", backdropFilter: "blur(6px)",
          border: "1px solid rgba(30,58,95,0.6)", borderRadius: 7, padding: "7px 10px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 9, color: "#475569", letterSpacing: "0.02em" }}>Menor incidência</span>
            <span style={{ fontSize: 9, color: "#475569", letterSpacing: "0.02em" }}>Maior incidência</span>
          </div>
          <div style={{
            width: 168, height: 7, borderRadius: 4,
            background: "linear-gradient(to right, #2563eb, #06b6d4, #facc15, #f97316, #ef4444)",
            boxShadow: "0 0 8px rgba(239,68,68,0.3)",
          }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            {["Baixa", "Média", "Alta"].map((l) => (
              <span key={l} style={{ fontSize: 8, color: "#334155" }}>{l}</span>
            ))}
          </div>
        </div>
      )}

      {/* RA hover tooltip */}
      {hoveredCode && tooltipRA && tooltipPos && !hoveredOcc && (
        <div
          style={{
            position: "absolute",
            left: Math.min(tooltipPos.x + 14, (containerRef.current?.clientWidth ?? 300) - 180),
            top: Math.max(tooltipPos.y - 10, 8),
            padding: "10px 14px",
            borderRadius: 8,
            background: "#0b1829",
            border: "1px solid #263a55",
            color: "#f1f5f9",
            pointerEvents: "none",
            zIndex: 10,
            minWidth: 160,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", marginBottom: 2 }}>
            {tooltipRA.displayName}
          </div>
          <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 6, fontWeight: 600 }}>
            {tooltipRA.code}
          </div>
          <div style={{ fontSize: 12, color: tooltipCount !== null ? "#94a3b8" : "#475569" }}>
            {tooltipCount !== null
              ? `${tooltipCount.toLocaleString("pt-BR")} ocorrências`
              : "Dados não disponíveis"}
          </div>
        </div>
      )}

      {/* Occurrence point tooltip */}
      {hoveredOcc && tooltipPos && (
        <div
          style={{
            position: "absolute",
            left: Math.min(tooltipPos.x + 14, (containerRef.current?.clientWidth ?? 300) - 200),
            top: Math.max(tooltipPos.y - 10, 8),
            padding: "10px 14px",
            borderRadius: 8,
            background: "#0b1829",
            border: "1px solid #263a55",
            color: "#f1f5f9",
            pointerEvents: "none",
            zIndex: 10,
            minWidth: 180,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fb923c", marginBottom: 4 }}>
            {hoveredOcc.natureza}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 2 }}>{hoveredOcc.raName}</div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>
            {hoveredOcc.data} — {hoveredOcc.horario}
          </div>
          <div style={{ fontSize: 10, color: "#334155", fontFamily: "monospace" }}>{hoveredOcc.id}</div>
        </div>
      )}
    </div>
  );
}
