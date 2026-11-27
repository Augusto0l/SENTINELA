"use client"

import { useState } from "react"
import NavigationIcon from "@/components/NavigationIcon"
import Button from "@/components/ui/button"
import Dialog from "@/components/ui/dialog"
import { dashboardFilters, defaultDashboardFilters, type DashboardData, type DashboardFilters, type DateRange } from "@/contracts/dashboard"
import styles from "@/features/Dashboard.module.css"

export const formatDate = (iso: string) => iso.split("-").reverse().join("/")
export const formatRange = ({ start, end }: DateRange) => start === end ? formatDate(start) : `${formatDate(start)} a ${formatDate(end)}`

const searchKey = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim()
const hourOptions = [["0-6", "00h–06h"], ["6-12", "06h–12h"], ["12-18", "12h–18h"], ["18-24", "18h–24h"]] as const

export default function Filters({ applied, data, pending, onChange }: {
  applied: DashboardFilters
  data?: DashboardData
  pending: boolean
  onChange: (filters: DashboardFilters) => void
}) {
  const [open, setOpen] = useState<"period" | "filters" | null>(null)
  const [draft, setDraft] = useState(applied)
  const [custom, setCustom] = useState(Boolean(applied.startDate))
  const [search, setSearch] = useState("")
  const [error, setError] = useState("")
  const regions = data?.regions ?? []
  const shown = regions.filter(region => searchKey(region.name).includes(searchKey(search)))
  const active = [applied.ra.length, applied.nature, applied.category, applied.hour].filter(Boolean).length
  const openPanel = (panel: typeof open) => {
    setDraft(applied)
    setCustom(Boolean(applied.startDate))
    setSearch("")
    setError("")
    setOpen(panel)
  }
  const toggleRa = (code: string) => setDraft(value => ({ ...value, ra: value.ra.includes(code)
    ? value.ra.filter(id => id !== code) : [...value.ra, code] }))
  const periodLabel = applied.startDate ? formatRange({ start: applied.startDate, end: applied.endDate }) : "Todo o período"

  return <div className={styles.controls}>
    <button type="button" className={styles.control} aria-haspopup="dialog" disabled={!data} aria-disabled={pending}
      onClick={() => { if (!pending) openPanel("period") }}>
      <NavigationIcon name="calendar" /><span>Período · {periodLabel}</span>
      <span className={styles.down}><NavigationIcon name="chevron" size={13} /></span>
    </button>
    <button type="button" className={styles.control} aria-haspopup="dialog" disabled={!data} aria-disabled={pending}
      onClick={() => { if (!pending) openPanel("filters") }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 4h18l-7 8v7l-4 2v-9z" /></svg>
      <span>Filtros{active > 0 && <span className={styles.filterCount}> {active}</span>}</span>
    </button>
    {open && <Dialog className={styles.dialog} title={open === "period" ? "Período de análise" : "Filtros do Dashboard"} onClose={() => setOpen(null)}>
      <div className={styles.dialogHeading}>
        <h2>{open === "period" ? "Período de análise" : "Filtros do Dashboard"}</h2>
        <button type="button" className={styles.close} aria-label="Fechar" onClick={() => setOpen(null)}><NavigationIcon name="close" /></button>
      </div>
      <form className={styles.filterForm} noValidate onSubmit={event => {
        event.preventDefault()
        const next = open === "period" && !custom ? { ...draft, startDate: "", endDate: "" } : draft
        const parsed = dashboardFilters.safeParse(next)
        if (!parsed.success || (open === "period" && custom && !next.startDate)) {
          setError("Informe datas válidas. A data final deve ser igual ou posterior à inicial.")
          return
        }
        onChange(parsed.data)
        setOpen(null)
      }}>
        {open === "period" ? <>
          <label className={styles.field}>Intervalo
            <select value={custom ? "custom" : "all"} onChange={event => { setCustom(event.target.value === "custom"); setError("") }}>
              <option value="all">Todo o período disponível</option><option value="custom">Intervalo personalizado</option>
            </select>
          </label>
          {custom && <div className={styles.fieldGrid}>
            <label className={styles.field}>Data inicial
              <input type="date" min="1900-01-01" max="9999-12-31" required value={draft.startDate} aria-invalid={Boolean(error)}
                onChange={event => { setDraft({ ...draft, startDate: event.target.value }); setError("") }} />
            </label>
            <label className={styles.field}>Data final
              <input type="date" min="1900-01-01" max="9999-12-31" required value={draft.endDate} aria-invalid={Boolean(error)}
                onChange={event => { setDraft({ ...draft, endDate: event.target.value }); setError("") }} />
            </label>
          </div>}
        </> : <>
          <fieldset className={styles.regionFilter}>
            <legend>Regiões Administrativas</legend>
            <label className={styles.field}><span className="sr-only">Pesquisar RAs</span>
              <input type="search" placeholder="Pesquisar RAs" value={search} onChange={event => setSearch(event.target.value)} />
            </label>
            <div className={styles.selectionActions}>
              <Button type="button" variant="outline" size="sm" disabled={!regions.length || draft.ra.length === regions.length}
                onClick={() => setDraft({ ...draft, ra: regions.map(region => region.id) })}>Selecionar todas</Button>
              <Button type="button" variant="outline" size="sm" disabled={!draft.ra.length}
                onClick={() => setDraft({ ...draft, ra: [] })}>Limpar seleção</Button>
            </div>
            <p className={styles.hint} aria-live="polite">{draft.ra.length
              ? `${draft.ra.length} de ${regions.length} RAs selecionadas · atribuição espacial provisória`
              : "Todo o DF, incluindo ocorrências sem atribuição espacial."}</p>
            <div className={styles.regionList}>
              {shown.map(region => <label key={region.id}>
                <input type="checkbox" checked={draft.ra.includes(region.id)} onChange={() => toggleRa(region.id)} />
                <span>{region.name}</span>
              </label>)}
              {!shown.length && <p className={styles.hint}>Nenhuma RA encontrada.</p>}
            </div>
          </fieldset>
          <label className={styles.field}>Natureza criminal
            <select value={draft.nature} onChange={event => setDraft({ ...draft, nature: event.target.value })}>
              <option value="">Todas as naturezas</option>
              {data?.natures.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>Categoria de origem
              <select value={draft.category} disabled={!data?.categories.length} onChange={event => setDraft({ ...draft, category: event.target.value })}>
                <option value="">{data?.categories.length ? "Todas as categorias" : "Sem categorias de origem"}</option>
                {data?.categories.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </label>
            <label className={styles.field}>Faixa de horário
              <select value={draft.hour} onChange={event => {
                const hour = hourOptions.find(([value]) => value === event.target.value)?.[0] ?? ""
                setDraft({ ...draft, hour })
              }}>
                <option value="">Todos os horários</option>
                {hourOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
        </>}
        {error && <p className={styles.formError} role="alert">{error}</p>}
        <div className={styles.dialogActions}>
          {open === "filters" && <Button type="button" variant="outline" onClick={() => setDraft({
            ...defaultDashboardFilters, startDate: applied.startDate, endDate: applied.endDate,
          })}>Limpar filtros</Button>}
          <Button type="submit">{open === "period" ? "Aplicar período" : "Aplicar filtros"}</Button>
        </div>
      </form>
    </Dialog>}
  </div>
}
