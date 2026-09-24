import { useEffect, useRef, useState, useCallback } from "react";
import { geoMercator, geoPath } from "d3-geo";
import type { RaGeoJSON } from "../../data/geoLoader";
import { getRAByGeoNome, type RAData, type Occurrence } from "../../data/mockData";

export type MapMode = "heatmap" | "points" | "clusters";

interface TooltipState {
  x: number;
  y: number;
  nome: string;
  count?: number;
  variation?: number;
  crime?: string;
}

interface PopupState {
  x: number;
  y: number;
  occ: Occurrence;
}

interface DFMapProps {
  geoJSON: RaGeoJSON | null;
  raStats: RAData[];
  selectedRA: string | null; // nomeDisplay
  onSelectRA: (nome: string) => void;
  mapMode?: MapMode;
  occurrences?: Occurrence[];
  showAllRAs?: boolean; // dashboard forces all-RA view
}

// ---- colour scale ---------------------------------------------------------
function getColor(count: number, min: number, max: number, dimmed = false): string {
  const alpha = dimmed ? 0.12 : 0.72;
  if (max === min) return `rgba(30,58,95,${alpha})`;
  const t = (count - min) / (max - min);
  if (t < 0.20) return `rgba(30,58,95,${alpha})`;
  if (t < 0.40) return `rgba(29,78,216,${alpha})`;
  if (t < 0.55) return `rgba(8,145,178,${alpha})`;
  if (t < 0.70) return `rgba(202,138,4,${alpha})`;
  if (t < 0.85) return `rgba(234,88,12,${alpha})`;
  return `rgba(220,38,38,${alpha})`;
}

// ---- simple grid cluster --------------------------------------------------
function clusterPoints(
  pts: { x: number; y: number; occ: Occurrence }[],
  cell: number,
): { x: number; y: number; count: number }[] {
  const grid = new Map<string, { sx: number; sy: number; n: number }>();
  for (const p of pts) {
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    const key = `${cx},${cy}`;
    const g = grid.get(key) ?? { sx: 0, sy: 0, n: 0 };
    g.sx += p.x; g.sy += p.y; g.n++;
    grid.set(key, g);
  }
  return Array.from(grid.values()).map(g => ({ x: g.sx / g.n, y: g.sy / g.n, count: g.n }));
}

// ---- heatmap canvas -------------------------------------------------------
function drawHeatmap(
  canvas: HTMLCanvasElement,
  pts: { x: number; y: number }[],
  w: number,
  h: number,
) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  const r = 34;
  for (const p of pts) {
    const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    gr.addColorStop(0.0, "rgba(255,  0,  0, 0.18)");
    gr.addColorStop(0.3, "rgba(255,165,  0, 0.10)");
    gr.addColorStop(0.6, "rgba(  0,255,  0, 0.05)");
    gr.addColorStop(1.0, "rgba(  0,  0,255, 0.00)");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- main component -------------------------------------------------------
export default function DFMap({
  geoJSON,
  raStats,
  selectedRA,
  onSelectRA,
  mapMode = "heatmap",
  occurrences = [],
  showAllRAs = false,
}: DFMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e && e.contentRect.width > 0 && e.contentRect.height > 0) {
        setSize({ width: e.contentRect.width, height: e.contentRect.height });
      }
    });
    ro.observe(el);
    // initial read
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) setSize({ width: r.width, height: r.height });
    return () => ro.disconnect();
  }, []);

  const { width, height } = size;
  const PAD = 28;

  // Compute projection -------------------------------------------------------
  const buildProjection = useCallback(
    (target: GeoJSON.FeatureCollection | GeoJSON.Feature) => {
      try {
        return geoMercator().fitExtent(
          [[PAD, PAD], [width - PAD, height - PAD]],
          target,
        );
      } catch {
        return null;
      }
    },
    [width, height],
  );

  const fullCollection = geoJSON as unknown as GeoJSON.FeatureCollection | null;

  // When a RA is selected (and not forced full-view), zoom to it
  const selectedFeature =
    !showAllRAs && selectedRA && geoJSON
      ? (geoJSON.features.find((f) => {
          const ra = getRAByGeoNome(f.properties.ra_nome ?? "");
          return ra?.nomeDisplay === selectedRA;
        }) as unknown as GeoJSON.Feature | undefined)
      : undefined;

  const projection = selectedFeature
    ? buildProjection(selectedFeature)
    : fullCollection
    ? buildProjection(fullCollection)
    : null;

  const pathGen = projection ? geoPath(projection) : null;

  const counts = raStats.map((r) => r.occurrence_count);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);

  // Project occurrences to SVG space ------------------------------------------
  const projectedOccs =
    projection && occurrences.length
      ? occurrences
          .map((occ) => {
            const pt = projection([occ.lng, occ.lat]);
            return pt ? { x: pt[0], y: pt[1], occ } : null;
          })
          .filter(
            (p): p is { x: number; y: number; occ: Occurrence } =>
              p !== null && p.x > 0 && p.y > 0 && p.x < width && p.y < height,
          )
      : [];

  // Heatmap canvas -----------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (mapMode !== "heatmap" || !projectedOccs.length) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    drawHeatmap(canvas, projectedOccs, width, height);
  });

  const clusters =
    mapMode === "clusters" && projectedOccs.length
      ? clusterPoints(projectedOccs, 40)
      : [];

  // Log confirmation (dev only) -----------------------------------------------
  useEffect(() => {
    if (geoJSON) {
      console.log(`[DFMap] GeoJSON carregado — ${geoJSON.features.length} features`);
    }
  }, [geoJSON]);

  // --------------------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#0a1628" }}
      onClick={() => setPopup(null)}
    >
      {!geoJSON && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center",
          justifyContent: "center", color: "#475569", fontSize: 13,
        }}>
          Carregando geometrias…
        </div>
      )}

      {geoJSON && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ position: "absolute", inset: 0, display: "block" }}
        >
          {/* RA polygons */}
          {pathGen &&
            geoJSON.features.map((feature, i) => {
              const geoNome: string = feature.properties?.ra_nome ?? "";
              const ra = getRAByGeoNome(geoNome);
              const nomeDisplay = ra?.nomeDisplay ?? geoNome;
              const count = ra?.occurrence_count ?? 0;

              const isSelected = !!selectedRA && ra?.nomeDisplay === selectedRA;
              const isOther = !!selectedRA && !showAllRAs && ra?.nomeDisplay !== selectedRA;
              const isHovered = hovered === nomeDisplay;

              const d = pathGen(feature as unknown as GeoJSON.Feature);
              if (!d) return null;

              let fill: string;
              if (isHovered) fill = "rgba(59,130,246,0.88)";
              else if (isSelected) fill = getColor(count, minCount, maxCount, false).replace(/[\d.]+\)$/, "0.88)");
              else fill = getColor(count, minCount, maxCount, isOther);

              const stroke = isSelected || isHovered ? "#93c5fd" : "#1e3a5f";
              const strokeWidth = isSelected ? 2.5 : isHovered ? 1.8 : 0.7;

              return (
                <path
                  key={i}
                  d={d}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                  style={{ cursor: "pointer", transition: "fill 0.12s, stroke 0.12s" }}
                  onMouseEnter={(e) => {
                    setHovered(nomeDisplay);
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (rect) {
                      setTooltip({
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
                        nome: nomeDisplay,
                        count: ra?.occurrence_count,
                        variation: ra?.variation,
                        crime: ra?.most_common_crime,
                      });
                    }
                  }}
                  onMouseMove={(e) => {
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (rect) {
                      setTooltip((prev) =>
                        prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : null,
                      );
                    }
                  }}
                  onMouseLeave={() => {
                    setHovered(null);
                    setTooltip(null);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (ra) onSelectRA(ra.nomeDisplay);
                  }}
                />
              );
            })}

          {/* Individual points */}
          {mapMode === "points" &&
            projectedOccs.slice(0, 800).map(({ x, y, occ }, i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={3.5}
                fill="#3b82f6"
                fillOpacity={0.75}
                stroke="rgba(255,255,255,0.25)"
                strokeWidth={0.6}
                style={{ cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (rect) setPopup({ x: x, y: y, occ });
                }}
              />
            ))}

          {/* Clusters */}
          {mapMode === "clusters" &&
            clusters.map(({ x, y, count }, i) => {
              const r = Math.max(13, Math.min(30, 9 + Math.sqrt(count) * 2.2));
              const color = count > 100 ? "#ef4444" : count > 40 ? "#f97316" : "#2563eb";
              return (
                <g key={i} style={{ cursor: "pointer" }}>
                  <circle cx={x} cy={y} r={r + 4} fill={color} fillOpacity={0.18} />
                  <circle cx={x} cy={y} r={r} fill={color} fillOpacity={0.72} />
                  <text
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#fff"
                    fontSize={r < 18 ? 9 : 11}
                    fontWeight="700"
                    fontFamily="Inter, sans-serif"
                    style={{ pointerEvents: "none" }}
                  >
                    {count}
                  </text>
                </g>
              );
            })}
        </svg>
      )}

      {/* Heatmap canvas overlay */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          display: mapMode === "heatmap" ? "block" : "none",
        }}
      />

      {/* RA tooltip */}
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: Math.min(tooltip.x + 14, width - 200),
            top: Math.max(tooltip.y - 16, 4),
            background: "#111d2e",
            border: "1px solid #1e3a5f",
            borderRadius: 8,
            padding: "10px 14px",
            color: "#f1f5f9",
            pointerEvents: "none",
            zIndex: 50,
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{tooltip.nome}</div>
          {tooltip.count != null && (
            <>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                Total:{" "}
                <b style={{ color: "#f1f5f9" }}>{tooltip.count.toLocaleString("pt-BR")}</b>
              </div>
              {tooltip.variation != null && (
                <div style={{ fontSize: 11, color: tooltip.variation > 0 ? "#22c55e" : "#ef4444" }}>
                  {tooltip.variation > 0 ? "▲" : "▼"} {Math.abs(tooltip.variation).toFixed(1)}% vs período anterior
                </div>
              )}
              {tooltip.crime && (
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                  Principal:{" "}
                  <b style={{ color: "#f1f5f9" }}>{tooltip.crime}</b>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Point popup */}
      {popup && (
        <div
          style={{
            position: "absolute",
            left: Math.min(popup.x + 10, width - 200),
            top: Math.max(popup.y - 100, 4),
            background: "#111d2e",
            border: "1px solid #1e3a5f",
            borderRadius: 8,
            padding: "12px 14px",
            color: "#f1f5f9",
            zIndex: 60,
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
            minWidth: 170,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{popup.occ.natureza}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 2 }}>
            📅 {popup.occ.data} — {popup.occ.horario}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 2 }}>
            📍 {popup.occ.ra_nome}
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>
            Ocorrência {popup.occ.id}
          </div>
          <div style={{ fontSize: 9, color: "#334155", marginTop: 4, fontStyle: "italic" }}>
            Dado demonstrativo
          </div>
          <button
            onClick={() => setPopup(null)}
            style={{
              position: "absolute", top: 6, right: 8,
              background: "none", border: "none", color: "#64748b",
              cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Legend: choropleth */}
      {mapMode !== "heatmap" && (
        <div style={{
          position: "absolute", bottom: 12, left: 12, zIndex: 10,
          background: "rgba(13,22,38,0.92)", border: "1px solid #1e3a5f",
          borderRadius: 6, padding: "10px 14px", minWidth: 200,
        }}>
          <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase" }}>
            Ocorrências por RA
          </div>
          <div style={{ height: 10, borderRadius: 5, background: "linear-gradient(to right, #1e3a5f, #1d4ed8, #0891b2, #ca8a04, #ea580c, #dc2626)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 10, color: "#64748b" }}>← {minCount.toLocaleString("pt-BR")}</span>
            <span style={{ fontSize: 10, color: "#64748b" }}>{maxCount.toLocaleString("pt-BR")} →</span>
          </div>
        </div>
      )}

      {/* Legend: heatmap */}
      {mapMode === "heatmap" && (
        <div style={{
          position: "absolute", bottom: 12, left: 12, zIndex: 10,
          background: "rgba(13,22,38,0.92)", border: "1px solid #1e3a5f",
          borderRadius: 6, padding: "10px 14px", minWidth: 180,
        }}>
          <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase" }}>
            Densidade de ocorrências
          </div>
          <div style={{ height: 10, borderRadius: 5, background: "linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff7700, #ff0000)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 10, color: "#64748b" }}>Baixa</span>
            <span style={{ fontSize: 10, color: "#64748b" }}>Alta</span>
          </div>
        </div>
      )}

      {/* Demo badge */}
      <div style={{
        position: "absolute", bottom: 12, right: 12, zIndex: 10,
        fontSize: 9, color: "#334155", fontStyle: "italic",
      }}>
        Geometrias: IDE-DF oficial · Estatísticas: dados demonstrativos
      </div>
    </div>
  );
}
