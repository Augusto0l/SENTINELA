import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { MapOccurrence } from "@/components/map/MapaDF"
import { readConsolidatedOccurrence, type ConsolidatedOccurrence } from "@/features/occurrences/client"
import type { RaGeoJSON } from "@/data/geoLoader"
import type { RAData } from "@/components/map/raMapData"
import { spatialRaName } from "@/components/map/occurrencePresentation"
import styles from "@/components/map/AnalyticMap.module.css"

export type MarkerHover = { point: MapOccurrence; clientX: number; clientY: number }
export type MapOccurrenceInteraction = {
  onHover: (marker: MarkerHover | null) => void
  onOpen: (point: MapOccurrence) => void
}

export default function MapOccurrenceTooltip({ id, point, anchor, geometry, regions }: {
  id: string
  point: MapOccurrence
  anchor: { x: number; y: number; width: number; height: number }
  geometry?: RaGeoJSON
  regions?: readonly Pick<RAData, "code" | "displayName">[]
}) {
  const tooltip = useRef<HTMLDivElement>(null)
  const [result, setResult] = useState<ConsolidatedOccurrence | null>()

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      readConsolidatedOccurrence(id, "consolidadas", controller.signal)
        .then(record => { if (!controller.signal.aborted) setResult(record) })
        .catch(() => { if (!controller.signal.aborted) setResult(null) })
    }, 150)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [id])

  useLayoutEffect(() => {
    const element = tooltip.current
    if (!element) return
    const width = element.offsetWidth, height = element.offsetHeight
    const y = anchor.y + height + 20 <= anchor.height ? anchor.y + 12 : anchor.y - height - 12
    element.style.left = `${Math.max(8, Math.min(anchor.x + 12, anchor.width - width - 8))}px`
    element.style.top = `${Math.max(8, Math.min(y, anchor.height - height - 8))}px`
  }, [anchor, result, geometry, regions])

  const spatialRa = point.raCode ? point.raName : spatialRaName(geometry, point, regions)
  const unverified = point.publicationStatus === "pcdf_crs_unverified" ||
    (result?.fonte === "PCDF" && result.origem === "importacao" && result.localizacaoStatus !== "validada")
  return <div ref={tooltip} className={styles.occurrenceTooltip} role="tooltip">
    {unverified && <p>Ponto PCDF publicado. CRS de origem sem comprovação formal.</p>}
    {result === undefined ? "Consultando ocorrência…" : result === null ? "Detalhes da ocorrência indisponíveis." : <>
      <strong>Natureza criminal</strong>
      {result.naturezas.length ? <ul>{result.naturezas.map(({ nome }, index) => <li key={index}>{nome}</li>)}</ul>
        : <p>Natureza não informada.</p>}
      <dl>
        {result.data && <div><dt>Data</dt><dd>{result.data.split("-").reverse().join("/")}</dd></div>}
        {result.hora && <div><dt>Horário</dt><dd>{result.hora}</dd></div>}
        {spatialRa && <div><dt>RA pela posição do ponto</dt><dd>{spatialRa}</dd></div>}
        <div><dt>Vínculo territorial</dt><dd>{result.ra ?? point.territorialRaName ?? "Não informado"}</dd></div>
      </dl>
    </>}
  </div>
}
