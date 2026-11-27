"use client"

import { useEffect, useRef, useState } from "react"
import { completeCep, lookupCep, type AddressLocation, type PostalAddress } from "@/data/addressLocation"

export function canSearchLocation(query: string) {
  return Boolean(completeCep(query)) || (query.trim().length >= 3 && /\p{L}/u.test(query))
}

export default function useManualLocationSearch(
  onPostal: (code: string, address: PostalAddress) => void,
  onPoint: (result: AddressLocation, replaceAddress: boolean) => void,
) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [results, setResults] = useState<AddressLocation[]>([])
  const [surface, setSurface] = useState<"map" | "postal">("map")
  const request = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => {
    clearTimeout(timer.current)
    request.current?.abort()
  }, [])

  function cancel() {
    clearTimeout(timer.current)
    request.current?.abort()
    setResults([])
    setBusy(false)
    setStatus("")
  }

  function choose(result: AddressLocation, replaceAddress = true) {
    setResults([])
    setStatus("")
    onPoint(result, replaceAddress && !result.approximate)
  }

  function search(query: string, target: "map" | "postal", debounce = false) {
    cancel()
    if (!canSearchLocation(query)) return
    setSurface(target)
    const controller = new AbortController()
    request.current = controller
    timer.current = setTimeout(async () => {
      setBusy(true)
      let postal: PostalAddress | null = null
      try {
        const code = completeCep(query)
        setStatus(code ? "Consultando CEP…" : "Pesquisando localização…")
        postal = code ? await lookupCep(code, controller.signal) : null
        if (controller.signal.aborted) return
        if (postal && code) {
          onPostal(code, postal)
          if (!postal.street && !postal.district) {
            setStatus("CEP encontrado com endereço incompleto. Informe o local exato ou ajuste o mapa.")
            return
          }
          setStatus("Buscando a localização do endereço postal…")
        }
        const options = {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(postal && code ? {
            q: postal.query, cep: code, street: postal.street, district: postal.district,
          } : { q: query.trim() }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(38000)]),
        }
        let response = await fetch("/api/ocorrencias/geocode", options)
        const retry = Number(response.headers.get("Retry-After"))
        if (response.status === 429 && retry > 0 && retry <= 2) {
          await new Promise(resolve => setTimeout(resolve, retry * 1000))
          if (controller.signal.aborted) return
          response = await fetch("/api/ocorrencias/geocode", options)
        }
        const data = await response.json()
        if (controller.signal.aborted) return
        if (!response.ok) throw Error(typeof data.error === "string" ? data.error : "Busca de endereço indisponível.")
        const postalLabel = postal?.label
        const matches: AddressLocation[] = postalLabel ? data.results.map((match: AddressLocation) => ({ ...match,
          label: completeCep(match.label) ? postalLabel : match.label, approximate: true })) : data.results
        if (matches.length === 1) {
          choose(matches[0], false)
        } else {
          setResults(matches)
          setStatus(matches.length ? "Mais de um resultado encontrado. Selecione o endereço e confira o ponto no mapa."
            : postal ? "CEP encontrado. Coordenadas indisponíveis para este endereço. Indique o local exato."
              : "Nenhum endereço encontrado no Distrito Federal.")
        }
      } catch (error) {
        if (controller.signal.aborted) return
        const reason = error instanceof Error && error.name === "Error" ? error.message : "Consulta de localização indisponível."
        setStatus(postal ? `CEP encontrado. ${reason}` : reason)
      } finally {
        if (!controller.signal.aborted) setBusy(false)
      }
    }, debounce ? 650 : 0)
  }

  return { busy, status, results, surface, search, choose, cancel }
}
