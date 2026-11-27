"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import NavigationIcon from "@/components/NavigationIcon"
import Button from "@/components/ui/button"
import { withinFormArea, type AddressLocation } from "@/data/addressLocation"
import type { RaGeoJSON } from "@/data/geoLoader"
import { canSearchLocation } from "./use-manual-location-search"
import styles from "./ManualCreate.module.css"

const LocationPicker = dynamic(() => import("@/components/occurrences/LocationPicker"), { ssr: false })
const dfViewport = { latitude: -15.79, longitude: -47.89 }

export default function ManualLocation({ geo, position, selectedRegion, region, locationMessage, confirmed,
  confirmationPending, cep, addressLabel, approximate, source, query, onQuery, onSearch, onPoint, onConfirm,
  results, status, busy, onResult, searchSelection }: {
  geo: RaGeoJSON | null
  position: { latitude: number; longitude: number } | null
  selectedRegion?: string
  region?: string
  locationMessage: string
  confirmed: boolean
  confirmationPending: boolean
  cep?: string
  addressLabel?: string
  approximate?: boolean
  source?: AddressLocation["source"]
  query: string
  onQuery: (query: string) => void
  onSearch: () => void
  onPoint: (latitude: number, longitude: number) => void
  onConfirm: () => void
  results: AddressLocation[]
  status: string
  busy: boolean
  onResult: (result: AddressLocation) => void
  searchSelection: number
}) {
  const [reset, setReset] = useState(0)
  const mapPosition = position && withinFormArea(position.latitude, position.longitude) ? position : null

  return <section className={styles.location} aria-label="Localização da ocorrência">
    <div className={styles.map}>
      <LocationPicker {...(mapPosition ?? dfViewport)} hasPosition={!!mapPosition}
        territory={geo} selectedRegion={selectedRegion} resetView={reset} searchSelection={searchSelection}
        publicZoomLimit={12} focusZoom={13} cooperativeTouch
        onChange={onPoint} />
    </div>
    <div className={styles.searchOverlay}>
      <div className={styles.searchRow}>
        <div role="search" className={styles.searchBar}>
          <Button type="button" variant="ghost" size="icon" onClick={onSearch} aria-label="Buscar localização" disabled={busy || !canSearchLocation(query)}>
            <NavigationIcon name="search" />
          </Button>
          <input type="search" aria-label="Buscar endereço ou CEP" placeholder="Buscar endereço ou CEP"
            title="Pesquise somente o logradouro, setor ou CEP, sem informações pessoais."
            maxLength={240} value={query} onChange={event => onQuery(event.target.value)} onKeyDown={event => {
              if (event.key !== "Enter") return
              event.preventDefault()
              if (!busy && canSearchLocation(query)) onSearch()
            }} />
        </div>
        <Button type="button" size="icon" variant="outline" onClick={() => setReset(n => n + 1)} aria-label="Centralizar mapa">
          <NavigationIcon name="locate" />
        </Button>
      </div>
      {(status || results.length > 0) && <div className={styles.searchResults}>
        <p role="status">{status}</p>
        {results.length > 0 && <ul aria-label="Resultados da localização">{results.map(result => <li key={result.id}>
          <button type="button" onClick={() => onResult(result)}>{result.label}</button>
        </li>)}</ul>}
      </div>}
    </div>
    <div className={styles.positionCard} role="status" aria-live="polite">
      <h2><NavigationIcon name="pin" />{confirmed && region ? "Localização identificada" : "Localização no mapa"}</h2>
      {addressLabel && <p>{addressLabel}</p>}
      {position ? <>
        <dl>
          {cep && <div><dt>CEP encontrado</dt><dd>{cep}</dd></div>}
          <div><dt>RA identificada</dt><dd>{region ?? "Pendente"}</dd></div>
          <div><dt>Latitude</dt><dd>{position.latitude}</dd></div>
          <div><dt>Longitude</dt><dd>{position.longitude}</dd></div>
          {source && <div><dt>Referência</dt><dd>{source} · aproximada</dd></div>}
        </dl>
        <p>{locationMessage}</p>
        {confirmed && approximate && <p>Referência aproximada confirmada pelo usuário.</p>}
        {confirmationPending && <p>{approximate ? "Localização aproximada. Ajuste ou confirme o ponto." : "Ponto pendente de confirmação."}</p>}
        {confirmationPending && <Button type="button" size="sm" onClick={onConfirm}>Confirmar ponto no mapa</Button>}
      </> : <p>Marque o ponto no mapa ou informe as coordenadas.</p>}
    </div>
  </section>
}
