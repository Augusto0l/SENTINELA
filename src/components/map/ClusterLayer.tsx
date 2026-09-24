import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import type { Occurrence } from "../../data/mockData";

interface ClusterLayerProps {
  occurrences: Occurrence[];
}

export default function ClusterLayer({ occurrences }: ClusterLayerProps) {
  const map = useMap();
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current);
    }

    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      iconCreateFunction: (c) => {
        const n = c.getChildCount();
        const size = n > 100 ? 40 : n > 40 ? 34 : 28;
        const color = n > 100 ? "#ef4444" : n > 40 ? "#f97316" : "#2563eb";
        return L.divIcon({
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:${n > 99 ? 11 : 12}px;font-weight:700;color:#fff;font-family:'Inter',sans-serif;border:2px solid rgba(255,255,255,0.2)">${n}</div>`,
          className: "",
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
      },
    });

    occurrences.forEach((occ) => {
      const marker = L.marker([occ.lat, occ.lng]);
      marker.bindPopup(`
        <div style="min-width:160px;font-family:'Inter',sans-serif">
          <div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:6px">${occ.natureza}</div>
          <div style="font-size:12px;color:#94a3b8;margin-bottom:2px">📅 ${occ.data} — ${occ.horario}</div>
          <div style="font-size:12px;color:#94a3b8;margin-bottom:2px">📍 ${occ.ra_nome}</div>
          <div style="font-size:11px;color:#475569;margin-top:6px">Ocorrência ${occ.id}</div>
        </div>
      `);
      cluster.addLayer(marker);
    });

    cluster.addTo(map);
    clusterRef.current = cluster;

    return () => {
      map.removeLayer(cluster);
    };
  }, [occurrences, map]);

  return null;
}
