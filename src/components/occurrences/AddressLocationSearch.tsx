"use client"
import { useEffect, useRef, useState } from "react"
import Button from "@/components/ui/button"
import {
  completeCep,
  postalAddressFrom,
  type PostalAddress,
  looksLikeCep,
  locationRa,
  type AddressLocation,
} from "@/data/addressLocation"
import type { RaGeoJSON } from "@/data/geoLoader"
import { RA_LIST } from "@/data/mockData"
import styles from "@/components/occurrences/NewOccurrenceLocation.module.css"

const postalCache = new Map<string, PostalAddress>()
async function lookupCep(
  cep: string,
  signal: AbortSignal,
): Promise<PostalAddress> {
  const cached = postalCache.get(cep)
  if (cached) return cached
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
  })
  if (!response.ok)
    throw new Error("Consulta de CEP indisponível. Tente novamente.")
  const data = await response.json()
  const result = postalAddressFrom(data)
  if (postalCache.size >= 100)
    postalCache.delete(postalCache.keys().next().value!)
  postalCache.set(cep, result)
  return result
}

export default function AddressLocationSearch({
  address,
  searchByCep = false,
  raCode,
  latitude,
  longitude,
  onSelect,
  onPostalAddress,
}: {
  address: string
  searchByCep?: boolean
  raCode: string
  latitude: string
  longitude: string
  onSelect: (latitude: number, longitude: number) => void
  onPostalAddress?: (address: string) => void
}) {
  const [message, setMessage] = useState("")
  const [postal, setPostal] = useState<PostalAddress | null>(null)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<AddressLocation[]>([])
  const [resultAddress, setResultAddress] = useState("")
  const latest = useRef({ address, raCode, latitude, longitude })
  const request = useRef<AbortController | null>(null)
  const baseline = useRef({ address, latitude, longitude })
  const geo = useRef<Promise<RaGeoJSON | null> | null>(null)
  useEffect(() => {
    latest.current = { address, raCode, latitude, longitude }
  }, [address, raCode, latitude, longitude])
  useEffect(() => {
    const controller = new AbortController()
    geo.current = fetch("/data/ras-df.geojson", {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
    }).then(async (response) => {
      if (!response.ok) return null
      const data = await response.json() as RaGeoJSON
      return data?.features?.length ? data : null
    }).catch(() => null)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    request.current?.abort()
    request.current = controller
    // Only ViaCEP is queried after typing; geocoding requires the button.
    const timer = setTimeout(async () => {
      if (controller.signal.aborted) return
      setResults([])
      setPostal(null)
      setBusy(false)
      setMessage("")
      const cep = completeCep(address)
      if (!cep) {
        if (address.trim() && (searchByCep || looksLikeCep(address))) {
          setMessage(/^\d{1,7}$/.test(address.replace(/-/g, "").trim())
            ? "CEP incompleto. Informe os oito dígitos para consultar."
            : "CEP inválido. Use oito dígitos, no formato 00000-000 ou 00000000.")
        }
        return
      }
      setBusy(true)
      setMessage("Consultando CEP…")
      try {
        const found = await lookupCep(cep, controller.signal)
        if (controller.signal.aborted) return
        setPostal(found)
        onPostalAddress?.(found.label)
        setMessage(
          "CEP consultado. Use Buscar localização para obter uma referência aproximada da rua ou região; confirme e refine o ponto no mapa.",
        )
      } catch (error) {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error && error.name === "Error"
              ? error.message
              : "Não foi possível consultar o CEP. Verifique a conexão; as coordenadas anteriores foram mantidas.",
          )
      } finally {
        if (!controller.signal.aborted) setBusy(false)
      }
    }, 700)
    return () => {
      clearTimeout(timer)
      controller.abort()
      request.current?.abort()
    }
  }, [address, searchByCep, onPostalAddress])

  function stillCurrent() {
    const value = latest.current
    return (
      value.address === baseline.current.address &&
      value.latitude === baseline.current.latitude &&
      value.longitude === baseline.current.longitude
    )
  }

  async function select(result: AddressLocation) {
    const activeRequest = request.current
    const boundaries = await geo.current
    if (activeRequest?.signal.aborted || request.current !== activeRequest) return
    if (!stillCurrent()) {
      setResults([])
      setMessage(
        "Endereço ou coordenadas alterados. Faça uma nova busca; seu ajuste manual foi preservado.",
      )
      return
    }
    const selectedRa = RA_LIST.find((ra) => ra.codigo === latest.current.raCode)
    const foundRa = boundaries
      ? locationRa(boundaries, result.latitude, result.longitude)
      : undefined
    const raMessage = !foundRa
      ? " Não foi possível confirmar a RA nos limites disponíveis; confira a região informada."
      : selectedRa && foundRa.properties.ra_nome !== selectedRa.nome
        ? ` Atenção: o ponto está em ${foundRa.properties.ra_nome}, diferente da RA selecionada (${selectedRa.nomeDisplay}). A RA não foi alterada.`
        : ` RA nos limites disponíveis: ${foundRa.properties.ra_nome}.`
    onSelect(result.latitude, result.longitude)
    setResults([])
    setMessage(
      `${
        result.approximate
          ? "Localização aproximada"
          : "Ponto de endereço encontrado"
      }: ${result.label}. Confira e ajuste o marcador.${raMessage}`,
    )
  }

  async function search() {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    baseline.current = { address, latitude, longitude }
    setResults([])
    setBusy(true)
    setMessage("Buscando localização…")
    try {
      const cep = completeCep(address)
      if ((searchByCep || looksLikeCep(address)) && !cep)
        throw new Error("Informe um CEP válido com oito dígitos.")
      if (address.trim().length < 5)
        throw new Error("Informe um endereço completo ou CEP de oito dígitos.")
      const postalAddress = cep ? await lookupCep(cep, controller.signal) : null
      if (controller.signal.aborted || !stillCurrent()) return
      if (postalAddress) {
        setPostal(postalAddress)
        onPostalAddress?.(postalAddress.label)
      }
      const query = postalAddress?.query ?? address.trim()
      const params = new URLSearchParams({ q: query })
      if (cep && postalAddress) {
        params.set("cep", cep)
        params.set("street", postalAddress.street)
        params.set("district", postalAddress.district)
      }
      const response = await fetch(
        `/api/ocorrencias/geocode?${params}`,
        {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(cep ? 35000 : 12000),
          ]),
        },
      )
      const data = await response.json()
      if (controller.signal.aborted) return
      if (!stillCurrent()) {
        setMessage(
          "As coordenadas foram ajustadas durante a busca. Seu ajuste manual foi preservado.",
        )
        return
      }
      if (!response.ok)
        throw new Error(data.error ?? "Serviço de localização indisponível.")
      const matches: AddressLocation[] = data.results.map(
        (result: AddressLocation) => ({
          ...result,
          approximate: Boolean(cep) || result.approximate,
        }),
      )
      if (!matches.length) {
        setMessage(
          postalAddress
            ? "Endereço postal encontrado, mas a localização geográfica não pôde ser determinada com confiança no DF. O mapa e as coordenadas anteriores foram mantidos. Informe mais detalhes ou ajuste o marcador manualmente."
            : "Localização não encontrada na área demonstrativa do DF. O mapa e as coordenadas anteriores foram mantidos.",
        )
      } else if (matches.length === 1 && !matches[0].approximate) {
        await select(matches[0])
      } else {
        setResultAddress(address)
        setResults(matches)
        setMessage(
          "Selecione o resultado correto. Referências aproximadas de rua, região ou CEP precisam de ajuste manual; nenhuma coordenada foi alterada ainda.",
        )
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          error instanceof Error && error.name === "Error"
            ? error.message
            : "Não foi possível buscar a localização. Verifique a conexão ou tente novamente. As coordenadas anteriores foram mantidas.",
        )
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <div className={`address-location-search ${styles.search}`} aria-busy={busy}>
      <h2 className={styles.title}>Localizar no mapa</h2>
      <Button
        type="button"
        className={styles.searchButton}
        disabled={busy || !address.trim()}
        onClick={() => void search()}
      >
        Buscar localização
      </Button>
      <p>
        Buscando por {searchByCep ? "CEP" : "Endereço"} · use o último campo editado.
        Digite um endereço completo e busque pelo botão. O campo CEP é
        consultado automaticamente no ViaCEP. A busca envia o endereço aos
        serviços externos; use somente dados de demonstração.
      </p>
      <div className={styles.result}>
        {postal && <p><strong>Endereço postal:</strong> {postal.label}</p>}
        <p role="status" aria-live="polite">
          {message || "O endereço encontrado e os resultados da busca aparecerão aqui."}
        </p>
      </div>
      {results.length > 0 && address === resultAddress && (
        <ul aria-label="Resultados de localização">
          {results.map((result) => (
            <li key={result.id}>
              <Button
                type="button"
                variant="outline"
                onClick={() => void select(result)}
              >
                {result.label} —{" "}
                {result.approximate
                  ? "Referência aproximada"
                  : "Ponto de endereço"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p>
        Busca: ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap
        </a>{" "}
        /{" "}
        <a
          href="https://operations.osmfoundation.org/policies/nominatim/"
          target="_blank"
          rel="noreferrer"
        >
          Nominatim
        </a>
        . Consulta postal:{" "}
        <a href="https://viacep.com.br/" target="_blank" rel="noreferrer">
          ViaCEP
        </a>
        .
      </p>
    </div>
  )
}
