"use client"
import { useEffect, useRef, useState, type ComponentProps } from "react"
import { divIcon } from "leaflet"
import styles from "@/components/occurrences/NewOccurrenceLocation.module.css"
import { TILE_REFERRER_POLICY } from "@/lib/maps/tile-policy"
import type { RaGeoJSON } from "@/data/geoLoader"
import {
  MapContainer,
  GeoJSON,
  Marker,
  ScaleControl,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet"

interface Props {
  expanded?: boolean
  searchSelection?: number
  hasPosition?: boolean
  territory?: RaGeoJSON | null
  selectedRegion?: string
  resetView?: number
  publicZoomLimit?: number
  focusZoom?: number
  cooperativeTouch?: boolean
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
function LocationEvents({ latitude, longitude, onChange, searchSelection = 0, hasPosition = true, territory,
  selectedRegion, resetView = 0, publicZoomLimit, focusZoom = 16, cooperativeTouch = false }: Props) {
  const [tileError, setTileError] = useState(false)
  const map = useMap()
  const lastSelection = useRef(0)
  const lastReset = useRef(0)
  useMapEvents({
    click: (event) => onChange(event.latlng.lat, event.latlng.lng),
  })
  useEffect(() => {
    if (resetView !== lastReset.current) {
      lastReset.current = resetView
      map.setView([latitude, longitude], hasPosition ? focusZoom : 11, { animate: false })
    } else if (searchSelection !== lastSelection.current) {
      lastSelection.current = searchSelection
      map.setView([latitude, longitude], focusZoom, { animate: false })
    } else if (hasPosition) {
      map.panTo([latitude, longitude], { animate: false })
    }
  }, [map, latitude, longitude, searchSelection, hasPosition, resetView, focusZoom])
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  useEffect(() => {
    if (!cooperativeTouch) return
    const touch = window.matchMedia("(pointer: coarse)")
    const syncDragging = () => {
      if (touch.matches) map.dragging.disable()
      else map.dragging.enable()
    }
    syncDragging()
    touch.addEventListener("change", syncDragging)
    return () => touch.removeEventListener("change", syncDragging)
  }, [map, cooperativeTouch])
  return (
    <>
      <TileLayer
        referrerPolicy={TILE_REFERRER_POLICY}
        updateWhenIdle
        keepBuffer={1}
        maxNativeZoom={publicZoomLimit}
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        eventHandlers={{ tileerror: () => setTileError(true) }}
      />
      {territory && <GeoJSON data={territory as ComponentProps<typeof GeoJSON>["data"]} interactive={false} attribution="Limites: IDE/DF"
        style={feature => feature?.properties?.ra_codigo === selectedRegion
          ? { color: "#60a5fa", fillColor: "#3b82f6", weight: 3, fillOpacity: 0.19 }
          : { color: "#55759b", weight: 1, fillOpacity: 0.08 }} />}
      {territory && <ScaleControl imperial={false} />}
      {hasPosition && <Marker
        position={[latitude, longitude]}
        icon={icon}
        draggable
        title="Localização selecionada. Arraste para ajustar."
        eventHandlers={{
          dragend: (event) => {
            const point = event.target.getLatLng()
            onChange(point.lat, point.lng)
          },
        }}
      />}
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
      className={props.expanded ? `occurrence-location-map ${styles.map}` : undefined}
      style={{ height: props.expanded ? undefined : 300, position: "relative", width: "100%", flexShrink: 0 }}
    >
      <MapContainer
        center={[props.latitude, props.longitude]}
        zoom={props.hasPosition === false ? 11 : 13}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <LocationEvents {...props} />
      </MapContainer>
    </div>
  )
}
