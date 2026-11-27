"use client"

import { useId, useMemo, type ReactNode } from "react"
import NavigationIcon from "@/components/NavigationIcon"
import type { ComparisonRow, DashboardData } from "@/contracts/dashboard"
import { CountBars, EvolutionChart, HeatMatrix, number, percent } from "@/features/dashboard/Charts"
import { formatRange } from "@/features/dashboard/Filters"
import { AttemptChart, NatureShiftChart } from "@/features/dashboard/PatternCharts"
import { RegionalComparison, RegionalEvolution, RegionalNatureMatrix, RegionalNatureRanking } from "@/features/dashboard/TerritoryCharts"
import { hourLabel, timeSeries, timeStatistics, weekdays, type Granularity } from "@/features/dashboard/statistics"
import styles from "@/features/Dashboard.module.css"
import insights from "@/features/dashboard/Insights.module.css"

const paths = {
  chart: "M3 14h4v7H3z M10 9h4v12h-4z M17 3h4v18h-4z",
  trend: "M3 4v16h18 M6 15l5-6 4 3 6-7 M17 5h4v4",
  clock: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z M12 6v6l4 3",
  bolt: "m13 2-9 12h7l-1 8 10-12h-7z",
  trophy: "M7 3h10v7a5 5 0 0 1-10 0z M7 5H2v3a5 5 0 0 0 5 5 M17 5h5v3a5 5 0 0 1-5 5 M12 15v5 M7 21h10",
  sunrise: "M3 17h18 M2 21h20 M7 17a5 5 0 0 1 10 0 M12 4v3 M4 9l2 2 M20 9l-2 2",
  left: "m11 6-6 6 6 6 M5 12h14",
  right: "m13 6 6 6-6 6 M5 12h14",
}

export function DashboardIcon({ name, size = 24 }: { name: keyof typeof paths; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

function Panel({ title, icon, info, actions, children }: { title: string; icon: ReactNode; info?: string; actions?: ReactNode; children: ReactNode }) {
  const id = useId()
  return <section className={styles.panel} aria-labelledby={id}>
    <header className={styles.panelHeader}>
      {icon}<h2 id={id}>{title}</h2>
      {info && <span className={styles.info}>
        <button type="button" aria-label={`Sobre ${title.toLocaleLowerCase("pt-BR")}`} aria-describedby={`${id}-info`}>i</button>
        <span id={`${id}-info`} role="tooltip">{info}</span>
      </span>}
      {actions}
    </header>
    {children}
  </section>
}

function Metric({ label, value, hint, icon, tone, total }: { label: string; value: string; hint?: string; icon: ReactNode; tone: string; total?: number }) {
  return <div className={styles.metric} data-tone={tone}>
    {icon}
    <div>
      <div className={styles.metricLabel}>{label}</div>
      <strong className={styles.metricValue} data-testid={total === undefined ? undefined : "analytics-total"} data-count={total}>{value}</strong>
      {hint && <p>{hint}</p>}
    </div>
  </div>
}

function Empty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>
}

const variation = (row: ComparisonRow) => (row.count - row.previous) / row.previous
const byVolume = (rows: ComparisonRow[]) => rows.filter(row => row.count > 0).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "pt-BR"))
const byGrowth = (rows: ComparisonRow[]) => rows.filter(row => row.previous > 0 && row.count > row.previous)
  .sort((a, b) => variation(b) - variation(a) || b.count - a.count || a.key.localeCompare(b.key, "pt-BR"))
const noComparison = "Sem período anterior comparável no recorte selecionado."
const occurrenceLabel = (count: number) => `${number(count)} ${count === 1 ? "ocorrência" : "ocorrências"}`

function peak(rows: { label: string; count: number }[]) {
  const maximum = Math.max(...rows.map(row => row.count))
  if (!maximum) return null
  const leaders = rows.filter(row => row.count === maximum)
  return { ...leaders[0], tied: leaders.length > 1 }
}

const granularities = [["daily", "Diária"], ["weekly", "Semanal"], ["monthly", "Mensal"]] as const

export function Overview({ data, temporal, granularity, setGranularity }: {
  data: DashboardData; temporal: ReturnType<typeof timeStatistics>; granularity: Granularity; setGranularity: (value: Granularity) => void
}) {
  const trend = useMemo(() => timeSeries(data, granularity), [data, granularity])
  const nature = byVolume(data.byNature).slice(0, 5)
  const mainNature = nature[0]
  const day = peak(temporal.byDay)
  const hour = peak(temporal.byHour)
  const metricHint = (row: { count: number; tied?: boolean } | null) => row
    ? `${occurrenceLabel(row.count)} · ${percent(row.count / data.total)}${row.tied ? " · empate" : ""}` : undefined
  return <>
    <div className={styles.metrics}>
      <Metric label="Ocorrências únicas" value={number(data.total)} hint="Registros consolidados da PCDF" total={data.total} icon={<NavigationIcon name="records" size={28} />} tone="cyan" />
      <Metric label="Natureza mais frequente" value={mainNature?.key ?? "—"} hint={metricHint(mainNature ?? null)} icon={<NavigationIcon name="locate" size={28} />} tone="blue" />
      <Metric label="Dia crítico" value={day ? day.label : "—"} hint={metricHint(day)} icon={<NavigationIcon name="calendar" size={28} />} tone="green" />
      <Metric label="Faixa horária crítica" value={hour?.label ?? "—"} hint={metricHint(hour)} icon={<DashboardIcon name="clock" size={28} />} tone="amber" />
    </div>
    <Panel title="Evolução das ocorrências" icon={<DashboardIcon name="trend" />} info="A série soma ocorrências únicas. As semanas começam na segunda-feira e os pontos respeitam as datas do recorte."
      actions={<div className={styles.segment} role="group" aria-label="Granularidade da evolução">
        {granularities.map(([key, label]) => <button key={key} type="button" aria-pressed={key === granularity} onClick={() => setGranularity(key)}>{label}</button>)}
      </div>}>
      {data.days.length ? <EvolutionChart data={trend} granularity={granularity} /> : <Empty>Sem ocorrências com data no recorte.</Empty>}
    </Panel>
    <div className={styles.overviewGrid}>
      <Panel title="Top 5 naturezas" icon={<DashboardIcon name="trophy" />} info="Cada ocorrência conta uma vez por natureza. Uma ocorrência pode ter mais de uma natureza.">
        {nature.length ? <div className={styles.natureRanking}>
          <ol>{nature.map((row, index) => <li key={row.key}>
            <span className={styles.rank}>{index + 1}</span><span>{row.key}</span><strong>{number(row.count)}</strong>
          </li>)}</ol>
          <p>{number(data.byNature.reduce((sum, row) => sum + row.links, 0))} vínculos de natureza no recorte</p>
        </div> : <Empty>Sem naturezas no recorte.</Empty>}
      </Panel>
      <Panel title="Ocorrências por dia da semana" icon={<NavigationIcon name="calendar" size={24} />}>
        {day ? <CountBars data={temporal.byDay} title="Ocorrências por dia da semana" /> : <Empty>Sem ocorrências com data no recorte.</Empty>}
      </Panel>
      <Panel title="Ocorrências por faixa de horário" icon={<DashboardIcon name="clock" />}>
        {hour ? <CountBars data={temporal.byHour} title="Ocorrências por faixa de horário" /> : <Empty>Sem ocorrências com horário no recorte.</Empty>}
      </Panel>
    </div>
  </>
}

function Change({ row }: { row: ComparisonRow }) {
  if (!row.previous) return <span className={styles.muted}>Sem base</span>
  const delta = variation(row)
  return <span className={styles.change} data-direction={Math.sign(delta)}>{percent(delta, true)}</span>
}

function Readings({ title, icon, items }: { title: string; icon: ReactNode; items: string[] }) {
  return <Panel title={title} icon={icon}>{items.length ? <ul className={styles.readings}>
    {items.map(item => <li key={item}>{item}</li>)}
  </ul> : <Empty>Sem ocorrências para esta leitura.</Empty>}</Panel>
}

export function Patterns({ data, temporal }: { data: DashboardData; temporal: ReturnType<typeof timeStatistics> }) {
  const natureRanking = byVolume(data.byNature).slice(0, 5)
  const growth = byGrowth(data.byNature).slice(0, 5)
  const most = peak(temporal.byPeriod)
  const hottest = [...data.cells].sort((a, b) => b.count - a.count || a.day - b.day || a.hour - b.hour)
  const first = hottest[0]
  const weekend = temporal.byDay[5].count + temporal.byDay[6].count
  const readings = [
    most ? `${most.label} ${most.tied ? "está entre os períodos com maior volume e reúne" : "concentra"} ${percent(most.count / temporal.knownTime)} dos registros com horário.` : "",
    first ? `${weekdays[first.day]} às ${hourLabel(first.hour)} ${hottest[1]?.count === first.count ? "está entre os horários de maior intensidade, com" : "registrou o maior volume da matriz, com"} ${occurrenceLabel(first.count)}.` : "",
    weekend > 0 ? `Sábados e domingos somam ${occurrenceLabel(weekend)} no recorte.` : "",
    data.total > temporal.knownTime ? `${occurrenceLabel(data.total - temporal.knownTime)} sem data e horário utilizáveis em conjunto.` : "",
  ].filter(Boolean)
  return <>
    <div className={styles.patternGrid}>
      <div className={styles.column}>
        <Panel title="Distribuição por período do dia" icon={<DashboardIcon name="clock" />} info="Percentuais entre ocorrências com data e horário disponíveis. Cada período reúne seis horas.">
          {temporal.knownTime ? <div className={styles.dayPeriods}>
            {temporal.byPeriod.map(item => <div key={item.label} data-tone={item.tone} className={styles.dayPeriod} title={item.hours}>
              {item.icon === "sunrise" ? <DashboardIcon name="sunrise" size={29} /> : <NavigationIcon name={item.icon} size={29} />}
              <span>{item.label}</span><strong>{percent(item.count / temporal.knownTime)}</strong>
              <span className={styles.muted}>{number(item.count)} <span className="sr-only">ocorrências</span></span>
            </div>)}
          </div> : <Empty>Sem ocorrências com horário no recorte.</Empty>}
        </Panel>
        <Readings title="Leituras rápidas" icon={<DashboardIcon name="bolt" />} items={readings} />
      </div>
      <Panel title="Naturezas criminais por período do dia" icon={<DashboardIcon name="chart" />}
        info="Cada barra soma ocorrências distintas daquela natureza com horário. Uma ocorrência pode aparecer em mais de uma natureza.">
        <NatureShiftChart ranked={natureRanking} counts={data.byNatureShift} />
      </Panel>
    </div>
    <Panel title="Dia × horário" icon={<NavigationIcon name="dashboard" size={24} />} info="Cada célula soma ocorrências daquele dia da semana e da hora indicada.">
      {temporal.knownTime ? <HeatMatrix heat={temporal.heat} /> : <Empty>Sem ocorrências com data e horário no recorte.</Empty>}
    </Panel>
    <div className={`${styles.patternGrid} ${insights.fit}`}>
      <Panel title="Consumados × Tentados" icon={<NavigationIcon name="layers" size={24} />}
        info="A situação vem do campo crime tentado de cada vínculo de natureza registrado pela PCDF. Os percentuais usam o total de vínculos do recorte.">
        <AttemptChart counts={data.attemptStatus} />
      </Panel>
      <Panel title="Naturezas em crescimento" icon={<DashboardIcon name="chart" />} info="Compara intervalos consecutivos com o mesmo número de dias cobertos. A variação exige ocorrências no intervalo anterior.">
        {!data.previous ? <Empty>{noComparison}</Empty> : growth.length ? <div className={styles.tableScroll}>
          <p className={styles.tableContext}>Período anterior · {formatRange(data.previous)}</p>
          <table className={styles.table}>
            <thead><tr><th scope="col" className={styles.tableRank} aria-label="Posição">#</th><th scope="col">Natureza</th><th scope="col">Atual</th><th scope="col">Anterior</th><th scope="col">Variação</th></tr></thead>
            <tbody>{growth.map((row, index) => <tr key={row.key}>
              <td className={styles.tableRank}><span className={styles.rank}>{index + 1}</span></td><th scope="row">{row.key}</th>
              <td>{number(row.count)}</td><td>{number(row.previous)}</td><td><Change row={row} /></td>
            </tr>)}</tbody>
          </table>
        </div> : <Empty>Nenhuma natureza aumentou com base percentual comparável.</Empty>}
      </Panel>
    </div>
  </>
}

export function Territory({ data, selected }: { data: DashboardData; selected: string[] }) {
  const names = new Map(data.regions.map(({ id, name }) => [id, name]))
  const rows = new Map(data.byRa.map(row => [row.key, row]))
  const regionName = (code: string) => names.get(code) ?? code
  const ranked = byVolume(data.byRa)
  const top = ranked.slice(0, 10)
  const leads = top[0]
  const second = top[1]
  const highest = byGrowth(data.byRa)[0]
  const topFive = top.slice(0, 5).reduce((sum, row) => sum + row.count, 0)
  const topTen = top.reduce((sum, row) => sum + row.count, 0)
  const attributed = ranked.reduce((sum, row) => sum + row.count, 0)
  const rankedRegions = ranked.map(({ key, count }) => ({ id: key, name: regionName(key), count }))
  const selectedRows = data.regions.filter(region => selected.includes(region.id))
    .map(({ id, name }) => ({ id, name, count: rows.get(id)?.count ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"))
  const availableRegions = selected.length ? selectedRows : rankedRegions
  const readings = [
    leads ? `${regionName(leads.key)} ${second?.count === leads.count ? "está entre as RAs com mais registros" : "lidera o volume territorial"} com ${occurrenceLabel(leads.count)}.` : "",
    attributed ? `${occurrenceLabel(attributed)} têm atribuição espacial no recorte, equivalentes a ${percent(attributed / data.total)} do total.` : "",
    top.length > 1 ? `As ${top.length} RAs do ranking somam ${occurrenceLabel(topTen)}.` : "",
    data.previous && highest ? `${regionName(highest.key)} registrou alta de ${percent(variation(highest), true)} no comparativo.` : "",
  ].filter(Boolean)
  return <>
    <div className={styles.metrics}>
      <Metric label="RA líder" value={leads ? regionName(leads.key) : "—"} hint={leads && occurrenceLabel(leads.count)} icon={<NavigationIcon name="pin" size={28} />} tone="cyan" />
      <Metric label="2ª maior" value={second ? regionName(second.key) : "—"} hint={second && occurrenceLabel(second.count)} icon={<DashboardIcon name="trophy" size={28} />} tone="blue" />
      <Metric label="Maior alta" value={data.previous && highest ? regionName(highest.key) : "—"} hint={data.previous
        ? highest ? `${percent(variation(highest), true)} de variação` : "Sem alta com base comparável" : "Sem período comparável"} icon={<DashboardIcon name="trend" size={28} />} tone="green" />
      <Metric label="Top 5 RAs" value={attributed ? percent(topFive / data.total) : "—"} hint="Do total de ocorrências no recorte" icon={<NavigationIcon name="layers" size={28} />} tone="amber" />
    </div>
    <div className={styles.territoryGrid}>
      <Panel title="Top 10 Regiões Administrativas" icon={<DashboardIcon name="trophy" />} info="Ranking baseado na atribuição espacial provisória dos pontos publicados da PCDF.">
        {leads ? <ol className={styles.areaRanking}>{top.map((row, index) => <li key={row.key}>
          <span className={styles.rank}>{index + 1}</span><span>{regionName(row.key)}</span>
          <span className={styles.areaBar}><span style={{ width: `${(row.count / leads.count) * 100}%` }} aria-hidden="true" /></span>
          <strong>{number(row.count)}</strong>
        </li>)}</ol> : <Empty>Sem atribuições espaciais no recorte.</Empty>}
      </Panel>
      <Panel title="Evolução das ocorrências por RA" icon={<DashboardIcon name="trend" />}
        info="Ocorrências únicas por dia e RA de atribuição provisória. As lacunas indicam dias sem cobertura confirmada.">
        <RegionalEvolution data={data} selectedCount={selectedRows.length} />
      </Panel>
    </div>
    <div className={`${styles.territoryGrid} ${insights.fit}`}>
      <Panel title="Naturezas mais frequentes por RA" icon={<DashboardIcon name="trophy" />}
        info="A participação usa o total de ocorrências únicas da RA. Um mesmo registro pode ter várias naturezas.">
        <RegionalNatureRanking regions={availableRegions} counts={data.byRaNature} />
      </Panel>
      <Panel title="Comparativo entre RAs" icon={<NavigationIcon name="pin" size={24} />}
        info="A participação usa o total das RAs do comparativo. A paginação mantém esse total e permite consultar todas as regiões do conjunto.">
        <RegionalComparison regions={availableRegions} filtered={selected.length > 0} />
        {selectedRows.length > 0 && <details className={insights.comparisonDetail}>
          <summary>Ver tabela das RAs selecionadas</summary>
          <div className={styles.selectedTable} tabIndex={selectedRows.length > 7 ? 0 : undefined} role="region" aria-label="Ocorrências das regiões selecionadas">
            <table className={styles.table}>
              <thead><tr><th scope="col">RA</th><th scope="col">Ocorrências únicas</th><th scope="col">% do recorte</th></tr></thead>
              <tbody>{selectedRows.map(row => <tr key={row.id}>
                <th scope="row">{row.name}</th><td>{number(row.count)}</td><td>{data.total ? percent(row.count / data.total) : "—"}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </details>}
      </Panel>
    </div>
    <Panel title="Matriz RA × Natureza" icon={<NavigationIcon name="dashboard" size={24} />}
      info="Ocorrências distintas por natureza em cada RA. As cinco naturezas são classificadas pelo volume em todo o recorte territorial.">
      <RegionalNatureMatrix regions={rankedRegions.slice(0, 10)} counts={data.byRaNature} />
    </Panel>
    <Readings title="Leituras territoriais" icon={<NavigationIcon name="map" size={24} />} items={readings} />
  </>
}
