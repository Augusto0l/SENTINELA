"use client"

import { useCallback, useEffect, useState } from "react"

import Header from "@/components/Header"

import Button from "@/components/ui/button"
import Link from "next/link"
import SimulationWorkspace from "@/features/occurrences/SimulationWorkspace"

import {
  emptyFilters,
  listUrl,
  natureLabels,
  paginationWindow,
  queryFromFilters,
  readList,
  type Filters,
} from "@/features/occurrences/client"

import type { PersistentQuery } from "@/contracts/persistent-occurrences"

import useRead from "@/features/occurrences/use-read"

import ReadError from "@/features/occurrences/ReadError"

import PersistentDetails from "@/features/occurrences/PersistentDetails"
import CatalogSelect from "@/features/occurrences/CatalogSelect"
import { useOperations } from "@/components/OperationalProvider"
import { actionAccess } from "@/lib/auth/policy"

import styles from "@/features/Occurrences.module.css"

const initial = queryFromFilters(emptyFilters())

const headings: {
  field: PersistentQuery["sortBy"]
  label: string
}[] = [
  { field: "identificacao", label: "Identificação" },
  { field: "data", label: "Data" },
  { field: "horario", label: "Horário" },
  { field: "ra", label: "Região Administrativa" },
  { field: "local", label: "Local" },
]

export default function Occurrences({ isolated = false }: { isolated?: boolean }) {
  const { role } = useOperations()
  const [draft, setDraft] = useState<Filters>(emptyFilters)

  const [query, setQuery] = useState(initial)

  const [validation, setValidation] = useState("")

  const [attempt, setAttempt] = useState(0)

  const [selected, setSelected] = useState<string | null>(null)

  const url = listUrl(query)

  const load = useCallback(
    (signal: AbortSignal) => readList(query, signal),
    [query],
  )

  const state = useRead(url + ":" + attempt, load)

  const data = state.data

  const pagination = data?.pagination

  useEffect(() => {
    if (
      pagination &&
      pagination.total > 0 &&
      query.page > pagination.totalPages
    )
      setQuery((q) => ({ ...q, page: pagination.totalPages }))
  }, [pagination, query.page])

  function apply(event: React.FormEvent) {
    event.preventDefault()

    try {
      const next = queryFromFilters(draft, 1, query.sortBy, query.direction)

      setValidation("")

      if (listUrl(next) !== url) setQuery(next)
    } catch {
      setValidation(
        "Revise os identificadores e as datas. A data inicial deve ser anterior ou igual à final.",
      )
    }
  }

  function clear() {
    setDraft(emptyFilters())
    setValidation("")
    setQuery((q) => ({ ...initial, sortBy: q.sortBy, direction: q.direction }))
  }

  function sort(field: PersistentQuery["sortBy"]) {
    setQuery((q) => ({
      ...q,
      page: 1,
      sortBy: field,
      direction: q.sortBy === field && q.direction === "asc" ? "desc" : "asc",
    }))
  }

  function input(
    field: keyof Filters,
    label: string,
    type = "text",
    placeholder?: string,
  ) {
    return (
      <label>
        {label}
        <input
          type={type}
          value={draft[field]}
          placeholder={placeholder}
          onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
        />
      </label>
    )
  }

  const filtered = Object.keys(query).some(
    (k) => !["page", "pageSize", "sortBy", "direction"].includes(k),
  )

  const pages = pagination?.totalPages ?? 0

  return (
    <div className={styles.screen}>
      <Header
        title="Ocorrências"
        subtitle="Consulta persistente"
        dataMode="read-only"
      />
      <div className={styles.content}>
        <div className={styles.heading}>
          <div>
            <h1>Ocorrências</h1>
            <p>
              {data
                ? `${pagination?.total.toLocaleString("pt-BR")} ocorrências encontradas`
                : "Consulta à base local"}{" "}
              · dados sintéticos de desenvolvimento
            </p>
          </div>
          {actionAccess(role, "cadastrar").enabled && <Button asChild><Link href="/ocorrencias/nova">{isolated ? "Gerenciar ocorrências sintéticas" : "Novo cadastro demonstrativo"}</Link></Button>}
        </div>
        <form
          className={styles.filters}
          onSubmit={apply}
          aria-label="Filtros de ocorrências"
        >
          {input(
            "identificacao",
            "Buscar identificação",
            "search",
            "UUID, ano, unidade ou número",
          )}
          {input("local", "Buscar localização", "search", "Trecho do local")}
          <CatalogSelect kind="regioes" value={draft.raId} onChange={value => setDraft(d => ({ ...d, raId: value }))} />
          <CatalogSelect kind="naturezas" value={draft.naturezaId} onChange={value => setDraft(d => ({ ...d, naturezaId: value }))} />
          {input("startDate", "Data inicial", "date")}
          {input("endDate", "Data final", "date")}
          <div className={styles.actions}>
            <Button type="submit">Aplicar filtros</Button>
            <Button type="button" variant="outline" onClick={clear}>
              Limpar filtros
            </Button>
          </div>
        </form>
        <p className={styles.note}>
          RA e natureza exibem somente catálogos persistentes visíveis; os filtros usam seus UUIDs reais. Natureza original não equivale à categoria padronizada.
          Consulta somente de leitura; cadastro, edição, inativação e consulta
          de inativas não estão disponíveis.
        </p>
        {validation && <p role="alert">{validation}</p>}
        <section
          className={styles.panel}
          aria-label="Resultados de ocorrências"
          aria-busy={state.loading}
        >
          {state.loading && (
            <p role="status" className={styles.message}>
              {query.page === 1 && !filtered
                ? "Carregando ocorrências…"
                : "Atualizando consulta…"}
            </p>
          )}
          {state.error && (
            <div className={styles.message}>
              <ReadError
                error={state.error}
                retry={() => setAttempt((v) => v + 1)}
              />
            </div>
          )}
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  {headings.map((h) => (
                    <th
                      key={h.field}
                      scope="col"
                      aria-sort={
                        query.sortBy === h.field
                          ? query.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        onClick={() => sort(h.field)}
                        title={
                          h.field === "identificacao"
                            ? "Ordena pelo número do registro; desempate por UUID"
                            : undefined
                        }
                        aria-label={`Ordenar por ${h.label} em ordem ${
                          query.sortBy === h.field && query.direction === "asc"
                            ? "decrescente"
                            : "crescente"
                        }`}
                      >
                        {h.label}{" "}
                        <span aria-hidden="true">
                          {query.sortBy === h.field
                            ? query.direction === "asc"
                              ? "↑"
                              : "↓"
                            : "↕"}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th scope="col" title="Ordenação por natureza não disponível">
                    Naturezas
                  </th>
                  <th scope="col">Estado e ações</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <button
                        type="button"
                        className={styles.id}
                        aria-label={`Ver detalhes de ${o.id}`}
                        onClick={() => setSelected(o.id)}
                      >
                        {o.id}
                      </button>
                      <small>
                        {[o.anoRegistro, o.unidadeRegistro, o.numeroRegistro]
                          .filter(Boolean)
                          .join(" / ") || "Identificação não informada"}
                      </small>
                    </td>
                    <td>{o.data ?? "Não informada"}</td>
                    <td>{o.horario ?? "Não informado"}</td>
                    <td>{o.ra?.nome ?? "Não informada"}</td>
                    <td className={styles.local}>
                      {o.local ?? "Não informado"}
                    </td>
                    <td>
                      {o.naturezas.length ? (
                        <ul>
                          {natureLabels(o).map((label, i) => (
                            <li key={o.naturezas[i].id}>{label}</li>
                          ))}
                        </ul>
                      ) : (
                        "Não disponíveis"
                      )}
                    </td>
                    <td>
                      {o.ativo ? "Ativa" : "Inativa"}
                      <div className={styles.actions}>
                        <button
                          type="button"
                          disabled
                          title={actionAccess(role, "editar").reason}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          disabled
                          title={actionAccess(role, "inativar").reason}
                        >
                          Inativar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && !data.items.length && (
            <p role="status" className={styles.message}>
              {filtered
                ? "Nenhuma ocorrência corresponde aos filtros aplicados."
                : "Nenhuma ocorrência disponível na base local."}
            </p>
          )}
          <nav
            className={styles.pagination}
            aria-label="Paginação de ocorrências"
          >
            <span>
              {pagination
                ? `Página ${
                    pages === 0 ? 0 : query.page
                  } de ${pages} · ${pagination.total.toLocaleString("pt-BR")} registros`
                : "25 registros por página"}
            </span>
            <div className={styles.actions}>
              <Button
                variant="outline"
                aria-label="Primeira página"
                disabled={!data || query.page <= 1 || pages === 0}
                onClick={() => setQuery((q) => ({ ...q, page: 1 }))}
              >
                «
              </Button>
              <Button
                variant="outline"
                aria-label="Página anterior"
                disabled={!data || query.page <= 1 || pages === 0}
                onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}
              >
                ‹
              </Button>
              {paginationWindow(query.page, pages).map((n) => (
                <Button
                  key={n}
                  variant={n === query.page ? "default" : "outline"}
                  aria-label={`Página ${n}`}
                  aria-current={n === query.page ? "page" : undefined}
                  onClick={() => setQuery((q) => ({ ...q, page: n }))}
                >
                  {n}
                </Button>
              ))}
              <Button
                variant="outline"
                aria-label="Próxima página"
                disabled={!data || query.page >= pages}
                onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}
              >
                ›
              </Button>
              <Button
                variant="outline"
                aria-label="Última página"
                disabled={!data || query.page >= pages}
                onClick={() => setQuery((q) => ({ ...q, page: pages }))}
              >
                »
              </Button>
            </div>
          </nav>
        </section>
      </div>
      <details className={styles.simulationEntry}><summary>Homologar fluxos demonstrativos (separados da consulta)</summary><SimulationWorkspace /></details>
      {selected && (
        <PersistentDetails id={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
