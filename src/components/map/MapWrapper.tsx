import { MapContainer, TileLayer, ZoomControl, ScaleControl } from "react-leaflet";
import type { ReactNode } from "react";

interface MapWrapperProps {
  children?: ReactNode;
  style?: React.CSSProperties;
}

export default function MapWrapper({ children, style }: MapWrapperProps) {
  return (
    <div style={{ position: "relative", flex: 1, overflow: "hidden", borderRadius: 8, ...style }}>
      <MapContainer
        center={[-15.78, -47.93]}
        zoom={10}
        zoomControl={false}
        style={{ height: "100%", width: "100%", background: "#0a1628" }}
        maxZoom={16}
        minZoom={8}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          subdomains="abcd"
          maxZoom={20}
        />
        <ZoomControl position="bottomright" />
        <ScaleControl position="bottomleft" imperial={false} />
        {children}
      </MapContainer>
    </div>
  );
}
