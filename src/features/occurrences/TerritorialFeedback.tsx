"use client"
import { useEffect, useState } from "react"
import type { RaGeoJSON } from "@/data/geoLoader"
import { CARTOGRAPHY_PATH, CARTOGRAPHY_SHA256, validateTerritory, territorialResult, type TerritorialResult } from "@/data/territorial-validation"
import { validateBoundTerritory } from "@/data/ra-bindings"

export default function TerritorialFeedback({ latitude, longitude, regionId, synthetic = false, onResult }: { latitude: string; longitude: string; regionId: string; synthetic?: boolean; onResult?: (result: TerritorialResult) => void }) {
  const [geo, setGeo] = useState<RaGeoJSON | null>(null)
  const [loading, setLoading] = useState(true)
  const [mapping, setMapping] = useState<unknown>(null)
  useEffect(() => {
    const abort = new AbortController()
    fetch(`/data/cartography/ra-bindings${synthetic ? "-synthetic" : ""}.json`, { signal: abort.signal }).then(r => { if (!r.ok) throw Error(); return r.json() }).then(m => { if (!abort.signal.aborted) setMapping(m) }).catch(() => {})
    return () => abort.abort()
  }, [synthetic])
  useEffect(() => {
    const abort = new AbortController()
    fetch(CARTOGRAPHY_PATH, { signal: abort.signal }).then(async r => {
      if (!r.ok) throw Error()
      const bytes = await r.arrayBuffer()
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("")
      if (digest !== CARTOGRAPHY_SHA256) throw Error()
      return JSON.parse(new TextDecoder().decode(bytes)) as RaGeoJSON
    }).then(g => { if (!abort.signal.aborted) setGeo(g) }).catch(() => { if (!abort.signal.aborted) setGeo(null) }).finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [])
  const result = !latitude.trim() || !longitude.trim() ? territorialResult("invalid_coordinate") : mapping
    ? validateBoundTerritory(geo, Number(latitude), Number(longitude), regionId, mapping, synthetic ? "sandbox" : "operational")
    : validateTerritory(geo, Number(latitude), Number(longitude))
  const signature = JSON.stringify(result)
  useEffect(() => { onResult?.(JSON.parse(signature) as TerritorialResult) }, [signature, onResult])
  return <aside aria-label="Validação territorial" aria-live="polite"><strong>Validação territorial · IDE/DF</strong>
    <p>{loading ? "Carregando cartografia integral…" : result.message}</p>
    {!loading && result.matches.length > 0 && <p>Geometrias encontradas: {result.matches.join(", ")}. {synthetic ? "Vínculo de ensaio sintético; não homologa UUID operacional." : "Vínculo do catálogo real depende de evidência registrada; não se presume equivalência pelo nome."}</p>}
    <p>Feedback de localização; nenhuma coordenada ou RA é preenchida automaticamente. A prévia continua sem persistência e sem aprovação territorial.</p>
  </aside>
}
