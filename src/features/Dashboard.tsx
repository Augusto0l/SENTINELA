"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Header from "@/components/Header"
import Button from "@/components/ui/button"
import { dashboardHref, defaultDashboardFilters, type DashboardData, type DashboardFilters } from "@/contracts/dashboard"
import Filters, { formatRange } from "@/features/dashboard/Filters"
import { DashboardIcon, Overview, Patterns, Territory } from "@/features/dashboard/Views"
import { intervalCoverage, timeStatistics, type Granularity } from "@/features/dashboard/statistics"
import styles from "@/features/Dashboard.module.css"

const titles = ["Visão Geral Criminal", "Padrões e Perfil dos Crimes", "Análise Territorial por RA"] as const

export default function Dashboard({ filters, data, message, recovery }: {
  filters: DashboardFilters
  data?: DashboardData
  message?: string
  recovery?: "retry" | "clear"
}) {
  const router = useRouter()
  const [view, setView] = useState(0)
  const [granularity, setGranularity] = useState<Granularity>("daily")
  const [pending, startTransition] = useTransition()
  const scroll = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const temporal = useMemo(() => data && timeStatistics(data), [data])
  const coverage = data?.period && intervalCoverage(data.period, data.coverage)
  const scope = filters.ra.length === 1 ? data?.regions.find(region => region.id === filters.ra[0])?.name ?? "1 RA selecionada"
    : filters.ra.length > 1 ? `${filters.ra.length} RAs selecionadas` : "Distrito Federal"
  const changeFilters = (next: DashboardFilters) => startTransition(() => router.replace(dashboardHref(next), { scroll: false }))
  const move = (step: number) => {
    setView(view + step)
    scroll.current?.scrollTo({ top: 0 })
    title.current?.focus({ preventScroll: true })
  }
  const noCoverage = Boolean(data && (coverage === "unknown" || !data.period) && !data.total)
  const noSpatial = Boolean(data && filters.ra.length && !data.spatialAvailable)
  const notice = noSpatial ? "A atribuição espacial está indisponível no banco de leitura."
    : noCoverage ? "Sem dados disponíveis para o período selecionado."
    : coverage === "partial" ? "Cobertura parcial. Os indicadores refletem os registros disponíveis no intervalo."
    : data?.total === 0 ? "Nenhuma ocorrência atende aos filtros no período."
    : coverage === "unknown" ? "Cobertura do intervalo sem confirmação. Os indicadores refletem os registros disponíveis." : null

  return <div className={styles.dashboard}>
    <Header title="Dashboard" />
    <div ref={scroll} className={styles.scroll}>
      <div className={styles.workspace}>
        <div className={styles.heading}>
          <div className={styles.headingTitle}>
            <DashboardIcon name="chart" size={34} />
            <div>
              <h1 tabIndex={-1} ref={title}>{titles[view]}</h1>
              <p>{scope}{data?.period && <> · {formatRange(data.period)}</>}</p>
            </div>
          </div>
          <Filters applied={filters} data={data} pending={pending} onChange={changeFilters} />
        </div>
        {data && (view === 2 || filters.ra.length > 0) &&
          <p className={styles.spatialNotice}>As RAs dos pontos publicados da PCDF têm atribuição espacial provisória, sem validação territorial oficial.</p>}
        {pending && <p role="status" className={styles.loading}>Atualizando indicadores…</p>}
        {message && <div className={styles.notice} role="status">
          <p>{message}</p>
          {recovery && <Button type="button" variant="outline" size="sm" disabled={pending}
            onClick={() => recovery === "clear" ? changeFilters(defaultDashboardFilters) : startTransition(() => router.refresh())}>
            {recovery === "clear" ? "Limpar filtros" : "Tentar novamente"}
          </Button>}
        </div>}
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        {data && temporal && !noCoverage && !noSpatial && <div className={styles.views} aria-busy={pending}>
          {view === 0 && <Overview data={data} temporal={temporal} granularity={granularity} setGranularity={setGranularity} />}
          {view === 1 && <Patterns data={data} temporal={temporal} />}
          {view === 2 && <Territory data={data} selected={filters.ra} />}
        </div>}
      </div>
    </div>
    <nav className={styles.pager} aria-label="Visualizações do Dashboard">
      {view > 0 && <button type="button" aria-label="Visualização anterior" onClick={() => move(-1)}><DashboardIcon name="left" /></button>}
      <span aria-live="polite" aria-label={`Visualização ${view + 1} de ${titles.length}`}>{view + 1}/{titles.length}</span>
      {view < titles.length - 1 && <button type="button" aria-label="Próxima visualização" onClick={() => move(1)}><DashboardIcon name="right" /></button>}
    </nav>
  </div>
}
