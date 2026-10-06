import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { Occurrence } from "../../data/mockData";

interface PointLayerProps {
  occurrences: Occurrence[];
}

const crimeColor: Record<string, string> = {
  Furto: "#2563eb",
  Roubo: "#f97316",
  "Lesão Corporal": "#eab308",
  Ameaça: "#8b5cf6",
  Homicídio: "#ef4444",
  Tráfico: "#ec4899",
  Estelionato: "#06b6d4",
  Vandalismo: "#64748b",
};

function makeIcon(natureza: string): L.DivIcon {
  const color = crimeColor[natureza] ?? "#64748b";
  return L.divIcon({
    className: "",
    html: `<div style="width:8px;height:8px;border-radius:50%;background:${color};border:1.5px solid rgba(255,255,255,0.3);box-shadow:0 0 4px ${color}88"></div>`,
    iconSize: [8, 8],
    iconAnchor: [4, 4],
  });
}

export default function PointLayer({ occurrences }: PointLayerProps) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (groupRef.current) {
      map.removeLayer(groupRef.current);
    }

    const group = L.layerGroup();

    occurrences.slice(0, 500).forEach((occ) => {
      const marker = L.marker([occ.lat, occ.lng], { icon: makeIcon(occ.natureza) });
      marker.bindPopup(`
        <div style="min-width:160px;font-family:'Inter',sans-serif">
          <div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:6px">${occ.natureza}</div>
          <div style="font-size:12px;color:#94a3b8;margin-bottom:2px">📅 ${occ.data} — ${occ.horario}</div>
          <div style="font-size:12px;color:#94a3b8;margin-bottom:2px">📍 ${occ.ra_nome}</div>
          <div style="font-size:11px;color:#475569;margin-top:6px">Ocorrência ${occ.id}</div>
          <div style="font-size:9px;color:#334155;margin-top:4px;font-style:italic">Dado demonstrativo</div>
        </div>
      `);
      group.addLayer(marker);
    });

    group.addTo(map);
    groupRef.current = group;

    return () => {
      map.removeLayer(group);
    };
  }, [occurrences, map]);

  return null;
}
