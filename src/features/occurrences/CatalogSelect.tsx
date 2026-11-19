"use client"
import { useCallback, useEffect, useId, useState } from "react"
import type { CatalogKind } from "@/contracts/persistent-catalogs"
import { readCatalog } from "@/features/occurrences/client"
import useRead from "@/features/occurrences/use-read"
import ReadError from "@/features/occurrences/ReadError"

export default function CatalogSelect({ kind, value, onChange }: {
  kind: CatalogKind
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()
  const [attempt, setAttempt] = useState(0)
  const load = useCallback((signal: AbortSignal) => readCatalog(kind, signal), [kind])
  const state = useRead(kind + ":" + attempt, load)
  const items = state.data?.items
  const region = kind === "regioes"
  const empty = !state.loading && !state.error && items?.length === 0
  useEffect(() => {
    if (items && value && !items.some(item => item.id === value)) onChange("")
  }, [items, value, onChange])
  const placeholder = state.loading ? "Carregando catálogo…" : state.error ? "Catálogo indisponível" : empty ? "Catálogo vazio" : region ? "Todas as regiões" : "Todas as naturezas"
  return <div>
    <label htmlFor={id}>{region ? "Região Administrativa" : "Natureza criminal original"}</label>
    <select id={id} aria-busy={state.loading} aria-describedby={id + "-status"} value={items?.some(item => item.id === value) ? value : ""}
      disabled={state.loading || Boolean(state.error) || empty} onChange={event => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {items?.map(item => <option key={item.id} value={item.id}>{"nome" in item ? item.nome : item.descricao}</option>)}
    </select>
    <div id={id + "-status"}>
      {state.loading && <small role="status">Carregando {region ? "regiões" : "naturezas"}…</small>}
      {empty && <small role="status">Nenhuma {region ? "região" : "natureza"} visível no catálogo persistente.</small>}
      {state.error && <ReadError error={state.error} retry={() => setAttempt(value => value + 1)} />}
    </div>
  </div>
}
