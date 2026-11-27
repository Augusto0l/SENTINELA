"use client"

import { useEffect, useState, type KeyboardEvent } from "react"
import type { ManualCatalog } from "@/contracts/manual-occurrences"
import styles from "./ManualCreate.module.css"

type Option = ManualCatalog["naturezas"][number]
const normalized = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").trim()
const display = (option: Option) => option.descricao

export default function ManualNaturePicker({ inputId, label, options, value, error, onChange }: {
  inputId: string
  label: string
  options: Option[]
  value: string
  error?: string
  onChange: (id: string) => void
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const selected = options.find(option => option.id === value)
  const search = normalized(query)
  const matches = search ? options.filter(option => normalized(display(option)).includes(search)) : options
  const active = open ? matches[highlight] : undefined
  const listId = inputId + "-list"
  const optionId = (option: Option) => inputId + "-" + option.id
  const activeId = active ? optionId(active) : undefined
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" })
  }, [activeId])

  function select(option: Option) {
    onChange(option.id)
    setQuery("")
    setOpen(false)
  }

  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      setOpen(true)
      setHighlight(index => {
        if (!matches.length) return -1
        if (event.key === "ArrowUp") return index <= 0 ? matches.length - 1 : index - 1
        return (index + 1) % matches.length
      })
    } else if (event.key === "Enter" && open) {
      event.preventDefault()
      if (active) select(active)
      else if (matches.length === 1) select(matches[0])
    }
  }

  return <label htmlFor={inputId} className={error ? `${styles.naturePicker} ${styles.invalidLabel}` : styles.naturePicker}>Natureza *
    <input id={inputId} role="combobox" aria-label={label} aria-autocomplete="list" autoComplete="off"
      aria-controls={open ? listId : undefined} aria-expanded={open}
      aria-activedescendant={activeId} aria-describedby={error ? `${inputId}-erro manual-nature-status` : "manual-nature-status"}
      aria-invalid={Boolean(error)} required disabled={!options.length}
      placeholder="Busque no catálogo" value={selected ? display(selected) : query}
      onFocus={() => { setHighlight(-1); if (!error) setOpen(true) }}
      onClick={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={keyboard}
      onChange={event => {
        onChange("")
        setQuery(event.target.value)
        setHighlight(-1)
        setOpen(true)
      }} />
    {error && <small id={`${inputId}-erro`} className={styles.error}>{error}</small>}
    {open && <ul id={listId} role="listbox" aria-label={`Opções de ${label.toLowerCase()}`} className={styles.natureOptions}>
      {matches.length ? matches.map(option => <li key={option.id} id={optionId(option)} role="option"
        aria-selected={active?.id === option.id || (!active && selected?.id === option.id)}
        onMouseDown={event => event.preventDefault()} onClick={event => {
          event.preventDefault()
          select(option)
        }}>{display(option)}</li>)
        : <li role="presentation">Nenhuma natureza encontrada.</li>}
    </ul>}
  </label>
}
