"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { geoJSON, type Path as LeafletPath, type LatLngBounds } from "leaflet"
import { GeoJSON, MapContainer, Polygon, ScaleControl, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet"
import type { RaGeoJSON } from "@/data/geoLoader"
import { RA_BY_CODE } from "@/components/map/raMapData"
import { SATELLITE_ATTRIBUTION, SATELLITE_TILES, satelliteFeatures, satelliteMaskRings } from "@/components/map/satelliteData"
import styles from "@/components/map/SatelliteMap.module.css"
import { TILE_REFERRER_POLICY } from "@/lib/maps/tile-policy"
import { loadOfficialRegions } from "@/components/map/officialRegions"

interface Props {
  selectedRaCode?: string | null
  onSelectRa?: (code: string) => void
  occurrencesByRa: Record<string, number>
  official?: boolean
  countsUnavailable?: boolean
}

function MapFraming({ bounds }: { bounds: LatLngBounds }) {
  const map = useMap()
  const fit = () => map.fitBounds(bounds, { padding: [20, 20], maxZoom: 13, animate: false })
  useEffect(() => {
    map.setMaxBounds(bounds.pad(1))
    map.fitBounds(bounds, { padding: [20, 20], maxZoom: 13, animate: false })
  }, [map, bounds])
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return <div className={`leaflet-bottom leaflet-right ${styles.resetControl}`} style={{ bottom: 126, pointerEvents: "none" }}>
    <div className="leaflet-control"><button type="button" className={styles.reset} aria-label="Restaurar enquadramento do satélite" title="Restaurar enquadramento" onClick={fit}>⌂</button></div>
  </div>
}

function SatelliteTiles({ attempt, onStatus }: { attempt: number; onStatus: (status: "loading" | "ready" | "error") => void }) {
  const failed = useRef(false)
  return <TileLayer key={attempt} url={SATELLITE_TILES} attribution={SATELLITE_ATTRIBUTION}
    referrerPolicy={TILE_REFERRER_POLICY}
    maxNativeZoom={14} maxZoom={16} minZoom={8} noWrap updateWhenIdle keepBuffer={1} opacity={1}
    eventHandlers={{
      loading: () => { failed.current = false; onStatus("loading") },
      tileerror: () => { failed.current = true; onStatus("error") },
      load: () => onStatus(failed.current ? "error" : "ready"),
    }} />
}

function SatelliteContent({ geo, selectedRaCode, onSelectRa, occurrencesByRa, official, countsUnavailable }: Props & { geo: RaGeoJSON }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [attempt, setAttempt] = useState(0)
  const features = useMemo(() => satelliteFeatures(geo, selectedRaCode), [geo, selectedRaCode])
  const bounds = useMemo(() => geoJSON({ type: "FeatureCollection", features } as GeoJSON.GeoJsonObject).getBounds(), [features])
  const mask = useMemo(() => satelliteMaskRings(geo.features), [geo])
  useEffect(() => {
    if (status !== "loading") return
    const timer = setTimeout(() => setStatus("error"), 15000)
    return () => clearTimeout(timer)
  }, [status, attempt])
  useEffect(() => {
    const offline = () => setStatus("error")
    window.addEventListener("offline", offline)
    return () => window.removeEventListener("offline", offline)
  }, [])

  return <div className={styles.container} data-testid="satellite-map" data-imagery-status={status}>
    <MapContainer className={styles.map} center={[-15.78, -47.93]} zoom={9} minZoom={8} maxZoom={16}
      zoomSnap={0.25} zoomControl={false} attributionControl={false} scrollWheelZoom={false} maxBounds={bounds.pad(1)} maxBoundsViscosity={0.8}>
      <SatelliteTiles attempt={attempt} onStatus={setStatus} />
      <Polygon positions={mask} pathOptions={{ stroke: false, fillColor: "#07111f", fillOpacity: 0.9, fillRule: "evenodd" }} interactive={false} />
      {features.map((feature) => {
        const code = feature.properties.ra_codigo
        const name = RA_BY_CODE[code]?.displayName ?? feature.properties.ra_nome
        const count = countsUnavailable ? null : occurrencesByRa[code] ?? 0
        return <GeoJSON key={`${code}:${count}:${selectedRaCode ?? "all"}`} data={feature as GeoJSON.GeoJsonObject}
          style={{ color: selectedRaCode === code ? "#ffffff" : "#b9d8ff", weight: selectedRaCode === code ? 2.5 : 1.2, fillColor: "#60a5fa", fillOpacity: selectedRaCode === code ? 0.08 : 0.015 }}
          onEachFeature={(_, layer) => {
            const path = layer as LeafletPath
            layer.on({
              mouseover: () => path.setStyle({ weight: 2.5, color: "#ffffff", fillOpacity: 0.12 }),
              mouseout: () => path.setStyle({ weight: selectedRaCode === code ? 2.5 : 1.2, color: selectedRaCode === code ? "#ffffff" : "#b9d8ff", fillOpacity: selectedRaCode === code ? 0.08 : 0.015 }),
              click: () => onSelectRa?.(code),
            })
            // Leaflet manages the SVG element and its event cleanup with the layer.
            layer.on("add", () => {
              const element = path.getElement()
              if (!(element instanceof SVGElement)) return
              element.setAttribute("role", "button")
              element.setAttribute("tabindex", onSelectRa ? "0" : "-1")
              element.setAttribute("aria-label", `${name}: ${count === null ? "dados indisponíveis" : `${count} ocorrências${official ? "" : " demonstrativas"}`}`)
              element.setAttribute("aria-pressed", String(selectedRaCode === code))
              element.setAttribute("data-ra-code", code)
              const keydown = (event: KeyboardEvent) => {
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectRa?.(code) }
              }
              element.addEventListener("keydown", keydown)
              layer.once("remove", () => element.removeEventListener("keydown", keydown))
            })
          }}>
          <Tooltip sticky><strong className={styles.tooltipName}>{name}</strong><span className={styles.tooltipCode}>{code}</span><br />
            {count === null ? "Dados indisponíveis" : `${count.toLocaleString("pt-BR")} ocorrências`}
          </Tooltip>
        </GeoJSON>
      })}
      <MapFraming bounds={bounds} />
      <ZoomControl position="bottomright" />
      <ScaleControl position="bottomleft" imperial={false} />
    </MapContainer>
    <div className={`leaflet-control-attribution ${styles.credits}`} dangerouslySetInnerHTML={{ __html: SATELLITE_ATTRIBUTION }} />
    <div className={styles.imageryNote}>Imagens 2024 · {countsUnavailable ? "limites oficiais" : `ocorrências ${official ? "persistidas" : "demonstrativas"}`}</div>
    {status !== "ready" && <div className={styles.status} role="status">
      <p>{status === "loading" ? "Carregando imagens de satélite…" : "Imagens de satélite indisponíveis. Verifique a conexão ou selecione Calor, Pontos ou Clusters."}</p>
      {status === "error" && <button type="button" className={styles.retry} onClick={() => { setStatus("loading"); setAttempt((value) => value + 1) }}>Tentar novamente</button>}
    </div>}
  </div>
}

export default function SatelliteMap(props: Props) {
  const [geo, setGeo] = useState<RaGeoJSON | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10000)])
    const source = props.official ? loadOfficialRegions(signal) : fetch("/data/ras-df.geojson", { signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Geometria indisponível")
        const data = await response.json() as RaGeoJSON
        if (!data.features?.length) throw new Error("Geometria inválida")
        return data
      })
    source.then(data => { if (!controller.signal.aborted) setGeo(data) })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [props.official])
  if (!geo) return <div className={styles.fallback} role="status">{error ? "Limites geográficos indisponíveis. Selecione Calor, Pontos ou Clusters para continuar." : "Carregando limites do Distrito Federal…"}</div>
  return <SatelliteContent geo={geo} {...props} />
}
