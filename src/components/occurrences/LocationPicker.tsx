"use client"
import { useEffect, useState } from "react"
import { divIcon } from "leaflet"
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet"

interface Props {
  latitude: number
  longitude: number
  onChange: (latitude: number, longitude: number) => void
}
const icon = divIcon({
  className: "occurrence-pin",
  html: "<span aria-hidden='true'>●</span>",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})
function LocationEvents({ latitude, longitude, onChange }: Props) {
  const [tileError, setTileError] = useState(false)
  const map = useMap()
  useMapEvents({
    click: (event) => onChange(event.latlng.lat, event.latlng.lng),
  })
  useEffect(() => {
    map.panTo([latitude, longitude], { animate: false })
  }, [map, latitude, longitude])
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return (
    <>
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        eventHandlers={{ tileerror: () => setTileError(true) }}
      />
      <Marker
        position={[latitude, longitude]}
        icon={icon}
        draggable
        title="Localização demonstrativa: arraste para ajustar"
        eventHandlers={{
          dragend: (event) => {
            const point = event.target.getLatLng()
            onChange(point.lat, point.lng)
          },
        }}
      />
      {tileError && (
        <div className="map-tile-warning" role="status">
          Mapa externo indisponível. Use os campos de coordenadas.
        </div>
      )}
    </>
  )
}
export default function LocationPicker(props: Props) {
  return (
    <div
      role="region"
      aria-label="Mapa de ajuste da localização"
      style={{ height: 300, position: "relative" }}
    >
      <MapContainer
        center={[props.latitude, props.longitude]}
        zoom={13}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <LocationEvents {...props} />
      </MapContainer>
    </div>
  )
}
