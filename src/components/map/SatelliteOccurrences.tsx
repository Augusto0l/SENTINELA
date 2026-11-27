import { useEffect } from "react"
import { circleMarker, layerGroup } from "leaflet"
import { useMap } from "react-leaflet"
import type { MapOccurrence } from "@/components/map/MapaDF"
import type { MarkerHover } from "@/components/map/MapOccurrenceTooltip"
import { satelliteMapPoints } from "@/components/map/satelliteData"
import styles from "@/components/map/SatelliteMap.module.css"

export default function SatelliteOccurrences({ points, onSelect, onHover }: {
  points: readonly MapOccurrence[]
  onSelect: (point: MapOccurrence) => void
  onHover?: (marker: MarkerHover | null) => void
}) {
  const map = useMap()
  useEffect(() => {
    const pane = map.getPane("satellite-occurrences") ?? map.createPane("satellite-occurrences")
    pane.style.zIndex = "450"
    const radius = window.matchMedia("(pointer: coarse)").matches ? 4.5 : 3.5
    const clearHover = () => onHover?.(null)
    const layer = layerGroup(satelliteMapPoints(points).map(point => {
      const marker = circleMarker([point.latitude, point.longitude], {
        pane: "satellite-occurrences", className: styles.occurrenceMarker, radius, weight: 1,
        color: "#fecaca", fillColor: "#ef4444", fillOpacity: .92,
        interactive: Boolean(point.occurrenceId), bubblingMouseEvents: false,
      })
      if (!point.occurrenceId) return marker
      const open = () => onSelect(point)
      marker.on("click", open)
      if (onHover) {
        marker.on("mouseover", event => {
          const mouse = event.originalEvent
          if (mouse instanceof MouseEvent) onHover({ point, clientX: mouse.clientX, clientY: mouse.clientY })
        })
        marker.on("mouseout", clearHover)
      }
      marker.on("add", () => {
        const element = marker.getElement()
        if (!(element instanceof SVGElement)) return
        element.setAttribute("role", "button")
        element.setAttribute("tabindex", "0")
        element.setAttribute("aria-label", `Detalhes da ocorrência em ${point.raName}`)
        const keydown = (event: KeyboardEvent) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          event.stopPropagation()
          open()
        }
        element.addEventListener("keydown", keydown)
        marker.once("remove", () => element.removeEventListener("keydown", keydown))
      })
      return marker
    })).addTo(map)
    map.on("movestart zoomstart resize", clearHover)
    return () => { map.off("movestart zoomstart resize", clearHover); layer.remove(); clearHover() }
  }, [map, points, onSelect, onHover])
  return null
}
