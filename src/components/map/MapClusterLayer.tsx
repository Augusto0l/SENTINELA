import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildClusters, clusterViewport } from "@/components/map/mapClusters";
import { clusterSymbol } from "@/components/map/mapSymbols";
import type { MapFrame, ScreenPoint } from "@/components/map/streetViewport";

export default function MapClusterLayer({ points, cellSize, symbolScale, detail, scaleLength }: {
  points: readonly ScreenPoint[];
  cellSize: number;
  symbolScale: number;
  detail: number;
  scaleLength?: (value: number) => string;
}) {
  const layer = useRef<SVGGElement>(null);
  const [viewport, setViewport] = useState<MapFrame>();
  const cropToViewport = Boolean(scaleLength);

  useLayoutEffect(() => {
    const svg = layer.current?.ownerSVGElement;
    if (!cropToViewport || !svg) return;
    const update = () => {
      const { width, height } = svg.getBoundingClientRect();
      const frame = svg.viewBox.baseVal;
      if (width <= 0 || height <= 0 || frame.width <= 0 || frame.height <= 0) return;
      const next = clusterViewport(frame, { width, height });
      setViewport(previous => previous && previous.x === next.x && previous.y === next.y &&
        previous.width === next.width && previous.height === next.height ? previous : next);
    };
    const resize = new ResizeObserver(update);
    const navigation = new MutationObserver(update);
    resize.observe(svg);
    navigation.observe(svg, { attributes: true, attributeFilter: ["viewBox"] });
    update();
    return () => { resize.disconnect(); navigation.disconnect(); };
  }, [cropToViewport]);

  const clusters = useMemo(() => cropToViewport && !viewport ? [] : buildClusters(points, cellSize, cropToViewport ? viewport : undefined),
    [points, cellSize, cropToViewport, viewport]);

  return (
    <g ref={layer} pointerEvents="none" data-testid="occurrence-clusters">
      {clusters.map(({ key, x, y, count }) => {
        const { radius, fontSize } = clusterSymbol(count, symbolScale, detail);
        return (
          <g key={key}>
            <circle cx={x} cy={y} r={radius} fill="#2563eb" fillOpacity={0.94} stroke="#b4d1ff" strokeWidth={1.1} vectorEffect="non-scaling-stroke"
              style={scaleLength ? { r: scaleLength(radius) } : undefined} />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontSize}
              style={scaleLength ? { fontSize: scaleLength(fontSize) } : undefined}
              fill="#fff"
              fontFamily="sans-serif"
              fontWeight="700"
            >
              {count}
            </text>
          </g>
        );
      })}
    </g>
  );
}
