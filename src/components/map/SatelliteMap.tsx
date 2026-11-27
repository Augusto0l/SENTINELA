"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Browser, geoJSON, type Path as LeafletPath, type LatLngBounds } from "leaflet"
import { GeoJSON, MapContainer, Polygon, ScaleControl, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet"
import type { RaGeoJSON } from "@/data/geoLoader"
import { RA_BY_CODE } from "@/components/map/raMapData"
import { SATELLITE_ATTRIBUTION, SATELLITE_DETAIL_ZOOM, SATELLITE_TILES, satelliteFeatures, satelliteMaskRings, satelliteTilesOptions } from "@/components/map/satelliteData"
import SatelliteOccurrences from "@/components/map/SatelliteOccurrences"
import type { MapOccurrence } from "@/components/map/MapaDF"
import type { MarkerHover } from "@/components/map/MapOccurrenceTooltip"
import styles from "@/components/map/SatelliteMap.module.css"
import { TILE_REFERRER_POLICY } from "@/lib/maps/tile-policy"
import { loadOfficialRegions } from "@/components/map/officialRegions"
import { officialRaLines } from "@/components/map/raTooltip"

interface Props {
  selectedRaCode?: string | null
  onSelectRa?: (code: string) => void
  occurrencesByRa: Record<string, number>
  statisticsByRa?: Record<string, number>
  /** Official names from the persistent catalogue, keyed by RA code. */
  regionNames?: Record<string, string>
  official?: boolean
  countsUnavailable?: boolean
  occurrenceLayer?: {
    visible: boolean
    onChange: (visible: boolean) => void
    points: readonly MapOccurrence[]
    onSelect: (point: MapOccurrence) => void
    onHover?: (marker: MarkerHover | null) => void
  }
}

function MapFraming({ bounds, navigationBounds }: { bounds: LatLngBounds; navigationBounds?: LatLngBounds }) {
  const map = useMap()
  const fit = () => map.fitBounds(bounds, { padding: [20, 20], maxZoom: 13, animate: false })
  useEffect(() => {
    map.setMaxBounds(navigationBounds ?? bounds.pad(1))
    map.fitBounds(bounds, { padding: [20, 20], maxZoom: 13, animate: false })
  }, [map, bounds, navigationBounds])
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return <div className={`leaflet-bottom leaflet-right ${styles.resetControl}`} style={{ bottom: 126, pointerEvents: "none" }}>
    <div className="leaflet-control"><button type="button" className={styles.reset} aria-label="Restaurar enquadramento do satélite" title="Restaurar enquadramento" onClick={fit}>⌂</button></div>
  </div>
}

type ImageryStatus = "loading" | "ready" | "error"

function SatelliteTiles({ attempt, enhanced, onStatus }: { attempt: number; enhanced: boolean; onStatus: (status: ImageryStatus) => void }) {
  const failed = useRef(false)
  return <TileLayer key={attempt} url={SATELLITE_TILES} attribution={SATELLITE_ATTRIBUTION}
    referrerPolicy={TILE_REFERRER_POLICY}
    {...satelliteTilesOptions(enhanced && Browser.retina)}
    maxZoom={enhanced ? SATELLITE_DETAIL_ZOOM : 16} minZoom={8} noWrap
    updateWhenIdle={!enhanced} keepBuffer={enhanced ? 2 : 1} opacity={1}
    eventHandlers={{
      loading: () => { failed.current = false; onStatus("loading") },
      tileerror: () => { failed.current = true; onStatus("error") },
      load: () => onStatus(failed.current ? "error" : "ready"),
    }} />
}

function SatelliteContent({ geo, selectedRaCode, onSelectRa, occurrencesByRa, statisticsByRa, regionNames, official, countsUnavailable, occurrenceLayer }: Props & { geo: RaGeoJSON }) {
  const [status, setStatus] = useState<ImageryStatus>("loading")
  const [imageryReady, setImageryReady] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const enhanced = occurrenceLayer !== undefined
  const handleImagery = useCallback((next: ImageryStatus) => {
    setStatus(next)
    if (enhanced && next === "ready") setImageryReady(true)
  }, [enhanced])
  const features = useMemo(() => satelliteFeatures(geo, selectedRaCode), [geo, selectedRaCode])
  const bounds = useMemo(() => geoJSON({ type: "FeatureCollection", features } as GeoJSON.GeoJsonObject).getBounds(), [features])
  const navigationBounds = useMemo(() => enhanced ? geoJSON(geo as GeoJSON.GeoJsonObject).getBounds().pad(1.5) : undefined, [geo, enhanced])
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

  return <div className={enhanced ? `${styles.container} ${styles.enhanced}` : styles.container} data-testid="satellite-map" data-imagery-status={status}>
    <MapContainer className={styles.map} center={[-15.78, -47.93]} zoom={9} minZoom={8} maxZoom={enhanced ? SATELLITE_DETAIL_ZOOM : 16}
      zoomSnap={0.25} zoomControl={false} attributionControl={false}
      scrollWheelZoom={enhanced}
      {...(enhanced ? { touchZoom: true, wheelPxPerZoomLevel: 110, bounceAtZoomLimits: false } : {})}
      maxBounds={navigationBounds ?? bounds.pad(1)} maxBoundsViscosity={0.8}>
      <SatelliteTiles attempt={attempt} enhanced={enhanced} onStatus={handleImagery} />
      <Polygon positions={mask} pathOptions={{ stroke: false, fillColor: "#07111f", fillOpacity: 0.9, fillRule: "evenodd" }} interactive={false} />
      {features.map((feature) => {
        const code = feature.properties.ra_codigo
        const name = regionNames?.[code] ?? RA_BY_CODE[code]?.displayName ?? feature.properties.ra_nome
        const count = countsUnavailable ? null : occurrencesByRa[code] ?? 0
        const lines = count === null ? null : official
          ? officialRaLines(statisticsByRa ? statisticsByRa[code] ?? 0 : undefined, count)
          : [`${count.toLocaleString("pt-BR")} ocorrências`]
        return <GeoJSON key={`${code}:${lines?.join("|")}:${name}:${selectedRaCode ?? "all"}`} data={feature as GeoJSON.GeoJsonObject}
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
              element.setAttribute("aria-label", `${name}: ${lines === null ? "dados indisponíveis" : official ? lines.join("; ") : `${count} ocorrências demonstrativas`}`)
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
            {lines === null ? "Dados indisponíveis" : lines.map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}
          </Tooltip>
        </GeoJSON>
      })}
      {occurrenceLayer?.visible && <SatelliteOccurrences points={occurrenceLayer.points}
        onSelect={occurrenceLayer.onSelect} onHover={occurrenceLayer.onHover} />}
      <MapFraming bounds={bounds} navigationBounds={navigationBounds} />
      <ZoomControl position="bottomright" />
      <ScaleControl position="bottomleft" imperial={false} />
    </MapContainer>
    <div className={`leaflet-control-attribution ${styles.credits}`} dangerouslySetInnerHTML={{ __html: SATELLITE_ATTRIBUTION }} />
    <div className={styles.imageryNote}>Imagens 2024 · {countsUnavailable ? "limites oficiais" : `ocorrências ${official ? "persistidas" : "demonstrativas"}`}</div>
    {occurrenceLayer && <label className={styles.occurrenceSwitch}>
      <input type="checkbox" checked={occurrenceLayer.visible} onChange={event => occurrenceLayer.onChange(event.target.checked)} />
      Mostrar ocorrências
    </label>}
    {status !== "ready" && (!enhanced || !imageryReady || status === "error") && <div className={styles.status} role="status">
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
