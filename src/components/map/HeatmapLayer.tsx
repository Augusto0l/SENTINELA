import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

interface HeatPoint {
  lat: number;
  lng: number;
  intensity?: number;
}

interface HeatmapLayerProps {
  points: HeatPoint[];
}

// leaflet.heat augments L namespace at runtime
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createHeatLayer = (L as any).heatLayer as (
  pts: [number, number, number?][],
  opts?: Record<string, unknown>
) => L.Layer;

export default function HeatmapLayer({ points }: HeatmapLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (!points.length) return;

    const container = map.getContainer();

    const addLayer = () => {
      // Guard: only add when container has real dimensions
      if (container.offsetWidth === 0 || container.offsetHeight === 0) return;

      if (layerRef.current) {
        try { map.removeLayer(layerRef.current); } catch { /* already removed */ }
      }

      const heatPoints: [number, number, number?][] = points.map((p) => [
        p.lat,
        p.lng,
        p.intensity ?? 0.6,
      ]);

      try {
        const heat = createHeatLayer(heatPoints, {
          radius: 22,
          blur: 18,
          maxZoom: 15,
          minOpacity: 0.35,
          gradient: {
            0.0: "#0000ff",
            0.3: "#00ffff",
            0.5: "#00ff00",
            0.65: "#ffff00",
            0.8: "#ff7700",
            1.0: "#ff0000",
          },
        });
        heat.addTo(map);
        layerRef.current = heat;
      } catch (e) {
        console.warn("HeatmapLayer: failed to create heat layer", e);
      }
    };

    // Defer one frame so the map container is sized
    const raf = requestAnimationFrame(() => {
      if (map.getSize().x > 0 && map.getSize().y > 0) {
        addLayer();
      } else {
        map.once("resize", addLayer);
        map.invalidateSize();
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      map.off("resize", addLayer);
      if (layerRef.current) {
        try { map.removeLayer(layerRef.current); } catch { /* already removed */ }
        layerRef.current = null;
      }
    };
  }, [points, map]);

  return null;
}
