import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { RaGeoJSON } from "../../data/geoLoader";
import { getRAByGeoNome, type RAData } from "../../data/mockData";

interface RALayerProps {
  geoJSON: RaGeoJSON | null;
  raStats: RAData[];
  selectedRA: string | null; // nomeDisplay value
  onSelectRA: (nomeDisplay: string) => void;
}

function getColor(count: number, min: number, max: number): string {
  if (max === min) return "#1e3a5f";
  const t = (count - min) / (max - min);
  if (t < 0.2) return "#1e3a5f";
  if (t < 0.4) return "#1d4ed8";
  if (t < 0.55) return "#0891b2";
  if (t < 0.7) return "#ca8a04";
  if (t < 0.85) return "#ea580c";
  return "#dc2626";
}

export default function RALayer({ geoJSON, raStats, selectedRA, onSelectRA }: RALayerProps) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);

  const counts = raStats.map((r) => r.occurrence_count);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);

  useEffect(() => {
    if (!geoJSON) return;

    if (layerRef.current) {
      layerRef.current.remove();
    }

    const layer = L.geoJSON(geoJSON as GeoJSON.FeatureCollection, {
      style: (feature) => {
        if (!feature) return {};
        const geoNome: string = feature.properties?.ra_nome ?? "";
        const ra = getRAByGeoNome(geoNome);
        const count = ra?.occurrence_count ?? 0;
        const isSelected = selectedRA && ra && ra.nomeDisplay === selectedRA;
        const isOther = selectedRA && ra && ra.nomeDisplay !== selectedRA;

        return {
          fillColor: getColor(count, minCount, maxCount),
          fillOpacity: isOther ? 0.12 : isSelected ? 0.88 : 0.68,
          color: isSelected ? "#93c5fd" : "#1e3a5f",
          weight: isSelected ? 2.5 : 0.7,
          opacity: isOther ? 0.3 : 1,
        };
      },
      onEachFeature: (feature, lyr) => {
        const geoNome: string = feature.properties?.ra_nome ?? "";
        const ra = getRAByGeoNome(geoNome);
        const displayName = ra?.nomeDisplay ?? geoNome;

        const tooltipEl = document.createElement("div");
        tooltipEl.className = "sentinela-tooltip";

        lyr.bindTooltip(tooltipEl, {
          sticky: true,
          direction: "top",
          offset: [0, -4],
          opacity: 1,
          className: "",
        });

        lyr.on("mouseover", (e) => {
          (e.target as L.Path).setStyle({
            fillOpacity: 0.92,
            weight: 2,
            color: "#93c5fd",
          });

          tooltipEl.innerHTML = `
            <div style="font-weight:700;font-size:13px;color:#f1f5f9;margin-bottom:4px">${displayName}</div>
            ${ra ? `
              <div style="font-size:11px;color:#94a3b8">Total: <b style="color:#f1f5f9">${ra.occurrence_count.toLocaleString("pt-BR")}</b></div>
              <div style="font-size:11px;color:${ra.variation > 0 ? "#22c55e" : "#ef4444"}">${ra.variation > 0 ? "▲" : "▼"} ${Math.abs(ra.variation).toFixed(1)}% vs período anterior</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:2px">Principal: <b style="color:#f1f5f9">${ra.most_common_crime}</b></div>
            ` : `<div style="font-size:11px;color:#475569">Sem dados estatísticos</div>`}
          `;
        });

        lyr.on("mouseout", (e) => {
          const isSelected = selectedRA && ra && ra.nomeDisplay === selectedRA;
          const isOther = selectedRA && ra && ra.nomeDisplay !== selectedRA;
          (e.target as L.Path).setStyle({
            fillOpacity: isOther ? 0.12 : isSelected ? 0.88 : 0.68,
            weight: isSelected ? 2.5 : 0.7,
            color: isSelected ? "#93c5fd" : "#1e3a5f",
          });
        });

        lyr.on("click", () => {
          if (ra) onSelectRA(ra.nomeDisplay);
        });
      },
    });

    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      layer.remove();
    };
  }, [geoJSON, raStats, selectedRA, map, minCount, maxCount]);

  // Fly to selected RA bounds
  useEffect(() => {
    if (!geoJSON || !layerRef.current) return;

    if (!selectedRA) {
      // Reset to full DF view
      try {
        const bounds = layerRef.current.getBounds();
        if (bounds.isValid()) {
          map.flyToBounds(bounds, { padding: [24, 24], duration: 0.8 });
        }
      } catch {
        map.setView([-15.78, -47.93], 10);
      }
      return;
    }

    // Fly to selected RA
    layerRef.current.eachLayer((lyr) => {
      const gl = lyr as L.GeoJSON & { feature?: GeoJSON.Feature };
      if (!gl.feature) return;
      const geoNome: string = gl.feature.properties?.ra_nome ?? "";
      const ra = getRAByGeoNome(geoNome);
      if (ra && ra.nomeDisplay === selectedRA) {
        const bounds = (lyr as L.Polygon).getBounds();
        if (bounds.isValid()) {
          map.flyToBounds(bounds, { padding: [40, 40], duration: 0.8, maxZoom: 13 });
        }
      }
    });
  }, [selectedRA, geoJSON, map]);

  return null;
}
