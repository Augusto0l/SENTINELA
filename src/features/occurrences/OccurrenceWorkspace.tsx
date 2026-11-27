"use client"

import Link from "next/link"
import { useCallback, useState, type FormEvent, type ReactNode } from "react"
import Button from "@/components/ui/button"
import Header from "@/components/Header"
import NavigationIcon, { type NavigationIconName } from "@/components/NavigationIcon"
import Dialog, { DialogClose, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Fields, ImportDialog, Metrics, Pager, formatCount, formatMonth } from "@/features/import/ImportUi"
import { fieldCategory, pcdfFieldGroups } from "@/features/import/PcdfRecords"
import ReadError from "@/features/occurrences/ReadError"
import useRead from "@/features/occurrences/use-read"
import { readConsolidatedOccurrence, readLocalConsultation, readManagement } from "@/features/occurrences/client"
import { occurrenceMapPosition, type OccurrenceMapPosition } from "@/features/occurrences/map-link"
import { managedOccurrence } from "@/contracts/occurrence-management"
import { manualMeans } from "@/contracts/manual-occurrences"
import {
  type LocalOccurrenceRow, type LocalOccurrencesListQuery, type LocalOccurrenceSummary,
  type OccurrenceArea, importedOccurrenceDetail,
  importedStates, localOccurrenceList, localOccurrenceSummary, localOccurrencesQuery,
} from "@/contracts/local-occurrences"
import styles from "./OccurrenceWorkspace.module.css"
import { AssociationHistory, ImportedFiles, OccurrenceAction } from "@/features/occurrences/OccurrenceManagement"

const areaLabels = { importados: "Registros importados", consolidadas: "Ocorrências consolidadas", manuais: "Cadastro manual" } as const
const stateNames = {
  recebida: "Recebida", apta: "Apta", bloqueada: "Bloqueada", consolidada: "Consolidada", reenviada: "Reenviada",
  em_revisao: "Em revisão",
} as const
const issueStates = { aberta: "Aberta", em_analise: "Em análise", resolvida: "Resolvida", encerrada_sem_solucao: "Encerrada sem solução" }
const issuePriorities = { alta: "alta", media: "média", baixa: "baixa" }
const empty = { identificacao: "", ra: "", natureza: "", competencia: "", situacao: "", dataInicial: "", dataFinal: "" }
const civilDate = (value: string | null) => value ? value.split("-").reverse().join("/") : "—"
const count = (value: number | null | undefined) => value == null ? "—" : formatCount(value)
const sortDefault = { ordenar: "data", direcao: "desc" } as const

function SummaryItem({ icon, label, children }: { icon: NavigationIconName; label: string; children: ReactNode }) {
  return <div className={styles.summaryItem}>
    <NavigationIcon name={icon} size={21} />
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
}

function DetailSection({ title, count, open, children }: { title: string; count?: number; open?: boolean; children: ReactNode }) {
  return <details className={styles.associationSection} open={open}>
    <summary>
      <NavigationIcon name="chevron" size={13} />
      {title}
      {count !== undefined && <span>({formatCount(count)})</span>}
    </summary>
    {children}
  </details>
}

function ImportedDetail({ row, manage, onClose }: { row: LocalOccurrenceRow; manage: boolean; onClose: () => void }) {
  const [retry, setRetry] = useState(0)
  const read = useCallback((signal: AbortSignal) =>
    readLocalConsultation({ view: "detalhe", area: "importados", id: row.id }, importedOccurrenceDetail, signal), [row.id])
  const state = useRead(row.id + ":" + retry, read)
  const readHistory = useCallback((signal: AbortSignal) => manage
    ? readManagement({ view: "importados", id: row.id }, managedOccurrence, signal) : Promise.resolve(undefined), [manage, row.id])
  const history = useRead(row.id + ":" + retry, readHistory)
  const record = state.data
  return <Dialog className={styles.associationDialog} onClose={onClose}>
    <header className={styles.associationHeader}>
      <span className={styles.associationIcon}><NavigationIcon name="records" size={28} /></span>
      <div>
        <DialogTitle className={styles.associationTitle}>Detalhes da associação importada</DialogTitle>
        <DialogDescription className={styles.associationDescription}>
          Dados da ocorrência recebida da PCDF em origem e staging.
        </DialogDescription>
      </div>
      <DialogClose className={styles.associationClose} aria-label="Fechar detalhes">
        <NavigationIcon name="close" />
      </DialogClose>
    </header>
    <div className={styles.associationBody} aria-busy={state.loading}>
      {state.loading && <p role="status">Carregando detalhes…</p>}
      {state.error && <ReadError error={state.error} retry={() => setRetry(n => n + 1)} />}
      {record && <>
        <ImportedAssociation row={row} record={record} />
        {history.data && <AssociationHistory data={history.data} />}
        {manage && history.error && <ReadError error={history.error} retry={() => setRetry(n => n + 1)} />}
      </>}
    </div>
  </Dialog>
}

function ImportedAssociation({ row, record }: { row: LocalOccurrenceRow; record: ReturnType<typeof importedOccurrenceDetail.parse> }) {
  const [identification, dates, nature, location, ...otherGroups] = pcdfFieldGroups
  const fields = (names: readonly string[]) => names.filter(name => Object.prototype.hasOwnProperty.call(record.campos, name))
    .map(name => ({ label: name, value: record.campos[name] }))
  const policeFields = fields(identification[1])
  const dateFields = fields(dates[1])
  const natureFields = fields([...nature[1], ...location[1]])
  const other = fields(Object.keys(record.campos).filter(name => !fieldCategory.has(name)))
  const rawGroups = [...otherGroups.map(([title, names]) => ({ title, items: fields(names) })),
    { title: "Outros campos", items: other }].filter(group => group.items.length)
  const total = record.pendencias.length
  return <>
    <dl className={styles.associationSummary} aria-label="Resumo da associação">
      <SummaryItem label="Identificação" icon="hash">
        <strong>{row.identificacao || "Registro " + formatCount(record.ordinal)}</strong>
        {row.identificacao && <small>Registro {formatCount(record.ordinal)}</small>}
      </SummaryItem>
      <SummaryItem label="Competência" icon="calendar">{formatMonth(record.competencia)}</SummaryItem>
      <SummaryItem label="Situação" icon="layers">
        <span className={styles.state} data-state={record.situacao}>{stateNames[record.situacao]}</span>
        <small>{formatCount(total)} {total === 1 ? "pendência" : "pendências"}</small>
      </SummaryItem>
      <SummaryItem label="Lote" icon="layers"><span className={styles.associationId}>{record.lote}</span></SummaryItem>
      <SummaryItem label="Execução" icon="settings"><span className={styles.associationId}>{record.execucao}</span></SummaryItem>
    </dl>
    <div className={styles.associationColumns}>
      <section className={styles.associationPanel} aria-labelledby="association-issues">
        <div className={styles.associationPanelHeading}>
          <span className={styles.associationIcon}><NavigationIcon name="alert" size={19} /></span>
          <div><h3 id="association-issues">Pendências registradas ({formatCount(total)})</h3>
            <p>Inconsistências encontradas nesta associação importada.</p></div>
        </div>
        {total ? <ul className={styles.associationIssues}>{record.pendencias.map(issue =>
          <li key={issue.campo + ":" + issue.regra}>
            <span className={styles.issueIcon}><NavigationIcon name="alert" size={20} /></span>
            <div><strong>{issue.campo}</strong>
              <small>{issueStates[issue.situacao]} · Prioridade {issuePriorities[issue.prioridade]}</small>
              <p>{issue.motivo.replace(/_/g, " ")}</p>
            </div>
          </li>)}</ul> : <p className={styles.associationEmpty}>Nenhuma pendência registrada para esta linha.</p>}
      </section>
      <section className={styles.associationPanel} aria-labelledby="association-fields">
        <div className={styles.associationPanelHeading}>
          <span className={styles.associationIcon}><NavigationIcon name="records" size={19} /></span>
          <div><h3 id="association-fields">{Object.keys(record.campos).length} campos do arquivo recebido</h3>
            <p>Dados técnicos da importação, proveniência e identificadores.</p></div>
        </div>
        <DetailSection title="Proveniência" open>
          <Fields items={[
            { label: "Arquivo", value: record.arquivo },
            { label: "Linha de origem", value: <span className={styles.associationId}>{record.origemId}</span> },
            { label: "Linha de staging", value: <span className={styles.associationId}>{record.stagingId}</span> },
            { label: "Registro no CSV", value: formatCount(record.ordinal) },
            { label: "Lote", value: <span className={styles.associationId}>{record.lote}</span> },
            { label: "Execução", value: <span className={styles.associationId}>{record.execucao}</span> },
          ]} />
        </DetailSection>
        <DetailSection title={identification[0]} count={policeFields.length} open><Fields items={policeFields} /></DetailSection>
        <DetailSection title="Natureza e local" count={natureFields.length}><Fields items={natureFields} /></DetailSection>
        <DetailSection title={dates[0]} count={dateFields.length}><Fields items={dateFields} /></DetailSection>
        <DetailSection title="Demais campos recebidos" count={rawGroups.reduce((sum, group) => sum + group.items.length, 0)}>
          {rawGroups.map(group => <div className={styles.associationSubgroup} key={group.title}>
            <h4>{group.title}</h4><Fields items={group.items} />
          </div>)}
        </DetailSection>
      </section>
    </div>
  </>
}

export function ConsolidatedDetail({ id, area, onClose, mapPosition, fromMap = false }: {
  id: string; area: "consolidadas" | "manuais"; onClose: () => void;
  mapPosition?: OccurrenceMapPosition; fromMap?: boolean;
}) {
  const [retry, setRetry] = useState(0)
  const [linkedPosition] = useState(() => fromMap ? occurrenceMapPosition(id) : undefined)
  const position = mapPosition ?? linkedPosition
  const read = useCallback((signal: AbortSignal) =>
    readConsolidatedOccurrence(id, area, signal), [area, id])
  const state = useRead(id + ":" + retry, read)
  const record = state.data
  const unverifiedPcdf = fromMap && record?.fonte === "PCDF" && record.origem === "importacao" && record.localizacaoStatus !== "validada"
  return <ImportDialog title={area === "manuais" ? "Detalhes do cadastro manual" : "Detalhes da ocorrência consolidada"} onClose={onClose}>
    {state.loading && <p role="status">Carregando detalhes…</p>}
    {state.error && <ReadError error={state.error} retry={() => setRetry(n => n + 1)} />}
    {record && <>
      <Fields items={[
        { label: "Identificação", value: record.identificacao ?? record.id }, { label: "Fonte", value: record.fonte },
        { label: "Data", value: civilDate(record.data) }, { label: "Horário", value: record.hora },
        { label: "Região Administrativa", value: record.ra ?? (position?.raName ? `${position.raName} (pela posição do ponto no mapa)` : null) },
        { label: "Local", value: record.local },
        // PCDF points are published by decision while their source CRS remains unproven; only validated locations say so.
        { label: "Situação da localização", value: position && record.localizacaoStatus !== "validada"
          ? "Publicada no mapa; CRS de origem sem comprovação formal"
          : unverifiedPcdf ? "CRS de origem sem comprovação formal" : position ? "Localização validada" : record.localizacaoStatus },
        ...(record.localizacaoConfirmada === undefined ? [] : [{ label: "Ponto confirmado", value: record.localizacaoConfirmada ? "Sim" : "Não" }]),
        { label: "Unidade de apuração", value: record.unidadeApuracao },
        { label: "Latitude", value: position?.latitude ?? record.latitude }, { label: "Longitude", value: position?.longitude ?? record.longitude },
        ...(record.situacao ? [{ label: "Situação", value: stateNames[record.situacao] }] : []),
      ]} />
      {record.endereco && <section className={styles.detailGroup}><h3>Endereço do fato</h3>
        <Fields items={[
          { label: "Endereço", value: record.endereco.endereco },
          { label: "Bairro / Setor", value: record.endereco.bairroOuSetor },
          { label: "CEP", value: record.endereco.cep },
          { label: "Número", value: record.endereco.numero },
          { label: "Complemento", value: record.endereco.complemento },
          { label: "Referência", value: record.endereco.referencia },
        ]} />
      </section>}
      <section className={styles.detailGroup}><h3>Naturezas vinculadas</h3>
        {record.naturezas.length ? <ul>{record.naturezas.map((item, index) =>
          <li key={index}>{item.nome}
            {area === "manuais" && (item.crimeTentado === null ? " · Tentativa não informada" : item.crimeTentado ? " · Tentativa: sim" : " · Tentativa: não")}
          </li>)}</ul>
          : <p>Nenhuma natureza vinculada.</p>}
      </section>
      {record.dadosCrime && <section className={styles.detailGroup}><h3>Dados do crime</h3>
        <Fields items={[
          { label: "Descrição do fato", value: record.dadosCrime.descricao },
          { label: "Meio empregado", value: record.dadosCrime.meio && manualMeans[record.dadosCrime.meio] },
          { label: "Quantidade de vítimas", value: record.dadosCrime.vitimas },
          { label: "Quantidade de autores", value: record.dadosCrime.autores },
          { label: "Observações adicionais", value: record.dadosCrime.observacoes },
        ]} />
      </section>}
    </>}
  </ImportDialog>
}

function Consultation({ area, active, summary, onRetry, cycle, summaryFailed, manualId, manage, onChanged }: {
  area: OccurrenceArea; active: boolean; summary?: LocalOccurrenceSummary; onRetry: () => void; cycle: number; summaryFailed: boolean;
  manualId?: string; manage: boolean; onChanged: () => void
}) {
  const imported = area === "importados"
  const manual = area === "manuais"
  const [draft, setDraft] = useState(manual && manualId ? { ...empty, identificacao: manualId } : empty)
  const [validation, setValidation] = useState("")
  const [query, setQuery] = useState<LocalOccurrencesListQuery>(() => ({
    view: area, pagina: 1, ...sortDefault, ...(manual && manualId && { identificacao: manualId }),
  }))
  const [selected, setSelected] = useState<LocalOccurrenceRow>()
  const [action, setAction] = useState<{ id: string; edit: boolean; publish?: boolean }>()
  const [openId, setOpenId] = useState(manual ? manualId : undefined)
  const allowed = !imported || summary?.canImport === true
  const key = JSON.stringify(query)
  const read = useCallback((signal: AbortSignal) => {
    return readLocalConsultation(query, localOccurrenceList, signal)
  }, [query])
  const enabled = !!summary && allowed && (!manual || active)
  const load = useCallback((signal: AbortSignal) => enabled ? read(signal) : Promise.resolve(undefined), [enabled, read])
  const { loading, data, error } = useRead(key + ":" + enabled, load, cycle)
  const editable = !!summary && allowed

  const change = (field: keyof typeof empty, value: string) => setDraft(current => ({ ...current, [field]: value }))
  function apply(event: FormEvent) {
    event.preventDefault()
    const { ra, natureza, competencia, situacao, ...common } = draft
    const filters = {
      ...common, ...(imported ? { ra, natureza, competencia, situacao } : manual ? {} : { raId: ra, naturezaId: natureza }),
    }
    const input = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ""))
    const result = localOccurrencesQuery.safeParse({ ...input, view: area, pagina: 1, ordenar: query.ordenar, direcao: query.direcao })
    if (!result.success || result.data.view === "resumo" || result.data.view === "detalhe")
      return setValidation("Revise a identificação e o intervalo de datas.")
    setValidation("")
    setQuery(result.data)
  }
  function clear() {
    setDraft(empty)
    setValidation("")
    setQuery({ view: area, pagina: 1, ...sortDefault })
  }
  function sort(field: "data" | "identificacao" | "ra") {
    setQuery(current => ({ ...current, pagina: 1, ordenar: field,
      direcao: current.ordenar === field && current.direcao === "asc" ? "desc" : "asc" }))
  }
  const ariaSort = (field: string) => query.ordenar === field
    ? (query.direcao === "asc" ? "ascending" : "descending") : undefined
  const options = {
    ra: imported ? (summary?.rasImportadas ?? []).map(label => ({ id: label, label })) : (summary?.rasConsolidadas ?? []),
    natureza: imported ? (summary?.naturezasImportadas ?? []).map(label => ({ id: label, label })) : (summary?.naturezasConsolidadas ?? []),
  }
  const hasFilters = Object.keys(query).some(key => !["view", "pagina", "ordenar", "direcao"].includes(key))
  return <section id={"consulta-" + area} aria-labelledby={"consulta-title-" + area} hidden={!active} className={styles.tabPanel}>
    {summary && !allowed ? <div className={styles.panel} role="status">
      <h2 id={"consulta-title-" + area}>{areaLabels[area]}</h2>
      <p>A consulta ao staging está disponível para Administrador e Operador.</p>
    </div> : <>
      <form className={styles.panel} onSubmit={apply}>
        <h2>Filtros da consulta</h2>
        <fieldset disabled={!editable} className={styles.filterSet}>
          <div className={styles.filterGrid}>
            <label>Buscar por identificação<input type="search" maxLength={240} placeholder="Número, unidade ou ID"
              value={draft.identificacao} onChange={event => change("identificacao", event.target.value)} /></label>
            {!manual && <><label>Região Administrativa<select value={draft.ra} onChange={event => change("ra", event.target.value)}>
              <option value="">Todas as regiões</option>
              {options.ra.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select></label>
            <label>Natureza criminal<select value={draft.natureza} onChange={event => change("natureza", event.target.value)}>
              <option value="">Todas as naturezas</option>
              {options.natureza.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select></label></>}
            {imported && <label>Competência<select value={draft.competencia} onChange={event => change("competencia", event.target.value)}>
              <option value="">Todas as competências</option>
              {summary?.competencias?.map(month => <option key={month} value={month}>{formatMonth(month)}</option>)}
            </select></label>}
          </div>
          <details className={styles.advanced}>
            <summary>Filtros avançados</summary>
            <div className={styles.filterGrid}>
              <label>Data inicial<input type="date" value={draft.dataInicial} onChange={event => change("dataInicial", event.target.value)} /></label>
              <label>Data final<input type="date" value={draft.dataFinal} onChange={event => change("dataFinal", event.target.value)} /></label>
              {imported && <label>Situação do registro<select value={draft.situacao} onChange={event => change("situacao", event.target.value)}>
                <option value="">Todas as situações</option>
                {importedStates.map(state => <option key={state} value={state}>{stateNames[state]}</option>)}
              </select></label>}
            </div>
          </details>
          {validation && <p className={styles.validation} role="alert">{validation}</p>}
          <div className={styles.actions}>
            <Button type="submit" size="sm">Aplicar filtros</Button>
            <Button size="sm" variant="outline" onClick={clear}>Limpar filtros</Button>
          </div>
        </fieldset>
      </form>

      <section className={styles.panel} aria-labelledby={"consulta-title-" + area} aria-busy={editable && loading}>
        <div className={styles.panelHeading}>
          <div><h2 id={"consulta-title-" + area}>{areaLabels[area]}</h2>
            <p>{imported ? "Associações recebidas da PCDF em origem e staging, sujeitas a revisão e homologação."
              : manual ? "Ocorrências de cadastro manual em revisão." : "Ocorrências ativas com consolidação registrada no PostgreSQL."}</p>
          </div>
          {data && <span className={styles.total} aria-live="polite">{formatCount(data.total)} {imported
            ? (data.total === 1 ? "associação" : "associações") : (data.total === 1 ? "ocorrência" : "ocorrências")}</span>}
        </div>
        {editable && loading && <p className={styles.empty} role="status">Carregando registros…</p>}
        {error && !summaryFailed && <ReadError error={error} retry={onRetry} />}
        {data?.itens.length ? <>
          <div className={styles.tableScroll} role="region" aria-label={"Tabela · " + areaLabels[area]} tabIndex={0}>
            <table>
              <thead><tr>
                <th scope="col" aria-sort={ariaSort("identificacao")}><button type="button" onClick={() => sort("identificacao")}>Identificação</button></th>
                <th className={styles.desktopColumn} scope="col" aria-sort={ariaSort("data")}><button type="button" onClick={() => sort("data")}>Data e hora</button></th>
                <th scope="col">Natureza</th>
                <th className={styles.desktopColumn} scope="col" aria-sort={ariaSort("ra")}><button type="button" onClick={() => sort("ra")}>RA e local</button></th>
                {imported && <th className={styles.desktopColumn} scope="col">Competência</th>}
                <th className={styles.desktopColumn} scope="col">Situação</th>
                <th scope="col">Ações</th>
              </tr></thead>
              <tbody>{data.itens.map(row => <tr key={row.id}>
                <th scope="row">{row.identificacao || (row.ordinal ? "Registro " + formatCount(row.ordinal) : row.id)}
                  {row.ordinal && row.identificacao && <small>Registro {formatCount(row.ordinal)}</small>}</th>
                <td className={styles.desktopColumn}>{civilDate(row.data)}{row.hora && <small>{row.hora}</small>}</td>
                <td>{row.natureza ?? "—"}{row.padronizada && row.padronizada !== row.natureza && <small>{row.padronizada}</small>}</td>
                <td className={styles.desktopColumn}>{row.ra ?? "—"}{row.local && <small>{row.local}</small>}</td>
                {imported && <td className={styles.desktopColumn}>{row.competencia ? formatMonth(row.competencia) : "—"}</td>}
                <td className={styles.desktopColumn}>
                  <span className={styles.state} data-state={row.situacao}>{stateNames[row.situacao]}</span>
                  {row.pendencias !== null && <small>{formatCount(row.pendencias)} pendências</small>}
                </td>
                <td><div className={styles.rowActions}><button type="button" className={styles.detailButton} onClick={event => {
                  event.currentTarget.focus({ preventScroll: true })
                  setSelected(row)
                }}
                  aria-label={"Ver detalhes · " + (row.ordinal ? "registro " + row.ordinal : row.identificacao || row.id)}>Ver detalhes</button>
                  {manage && row.acoes?.editar && <button type="button" className={styles.detailButton}
                    onClick={() => setAction({ id: row.id, edit: true })}>{imported ? "Corrigir associação" : "Editar ocorrência"}</button>}
                  {manage && row.acoes?.inativar && <button type="button" className={styles.detailButton}
                    onClick={() => setAction({ id: row.id, edit: false })}>{imported ? "Inativar associação" : "Inativar ocorrência"}</button>}
                  {manage && row.acoes?.consolidar && <button type="button" className={styles.detailButton}
                    onClick={() => setAction({ id: row.id, edit: false, publish: true })}>Validar e publicar</button>}
                </div></td>
              </tr>)}</tbody>
            </table>
          </div>
          <Pager page={data.pagina} total={data.total} onChange={pagina => setQuery(current => ({ ...current, pagina }))}
            label={"Paginação · " + areaLabels[area]} />
        </> : data && <p className={styles.empty}>{hasFilters ? "Nenhum registro corresponde aos filtros."
          : imported ? "Nenhuma associação PCDF recebida neste ambiente." : manual ? "Nenhuma ocorrência cadastrada manualmente."
            : "Nenhuma ocorrência consolidada neste ambiente. As associações em staging estão na aba Registros importados."}</p>}
      </section>
    </>}
    {selected && active && (imported
      ? <ImportedDetail key={selected.id} row={selected} manage={manage && !!selected.acoes} onClose={() => setSelected(undefined)} />
      : <ConsolidatedDetail key={selected.id} id={selected.id} area={area} onClose={() => setSelected(undefined)} />)}
    {manual && active && openId && <ConsolidatedDetail id={openId} area="manuais" onClose={() => setOpenId(undefined)} />}
    {active && manage && action && <OccurrenceAction area={area} {...action} onClose={() => setAction(undefined)}
      onSaved={() => { setAction(undefined); onChanged() }} />}
  </section>
}

export default function OccurrenceWorkspace({ canReadStaging, manualId, fileId, consolidatedId, management, admin, canManageManual, manualOperational = false }: {
  canReadStaging: boolean; manualId?: string; fileId?: string; management: boolean; admin: boolean; canManageManual: boolean
  manualOperational?: boolean; consolidatedId?: string
}) {
  const [area, setArea] = useState<OccurrenceArea | "arquivos">(consolidatedId ? "consolidadas"
    : fileId && canReadStaging ? "arquivos" : manualId ? "manuais" : canReadStaging ? "importados" : "consolidadas")
  const [dismissedId, setDismissedId] = useState<string>()
  const [cycle, setCycle] = useState(0)
  const [saved, setSaved] = useState(false)
  const loadSummary = useCallback((signal: AbortSignal) =>
    readLocalConsultation({ view: "resumo" }, localOccurrenceSummary, signal), [])
  const summary = useRead("resumo", loadSummary, cycle)
  const busy = summary.loading
  const connected = !!summary.data && !summary.error
  const retry = () => setCycle(attempt => attempt + 1)
  const onChanged = () => { setSaved(true); retry() }
  return <div className={styles.screen}>
    <Header title="Ocorrências" dataMode="occurrence-read" />
    <div className={styles.content}>
      <header className={styles.hero}>
        <div className={styles.heroLead}><span className={styles.heroIcon}><NavigationIcon name="records" size={25} /></span>
          <div><h1>Ocorrências</h1><p>{management ? "Ambiente sintético de qualificação."
            : "Consulte os registros recebidos da PCDF e as ocorrências consolidadas no ambiente local."}</p>
            {!management && admin && <p>A gestão de arquivos segue as autorizações do PostgreSQL.</p>}
          </div>
        </div>
        <div className={styles.heroActions}>
          <span className={styles.connection} role="status" data-connected={connected}>
            <span aria-hidden="true" />
            {busy ? "Verificando PostgreSQL" : connected ? "PostgreSQL conectado" : summary.error?.status === 403
              ? "Acesso restrito" : summary.error?.status === 401 ? "Sessão necessária" : "Leitura indisponível"}
          </span>
          {canReadStaging && <Button asChild variant="outline" size="sm"><Link href="/importar">Abrir importação</Link></Button>}
        </div>
      </header>

      <Metrics items={[
        { label: management ? "Associações PCDF ativas em staging" : "Associações recebidas", value: count(summary.data?.recebidas) },
        { label: "Ocorrências consolidadas", value: count(summary.data?.consolidadas) },
        { label: "Pendências registradas", value: count(summary.data?.pendencias) },
        { label: "Competências importadas", value: count(summary.data?.competencias?.length) },
      ]} />
      {saved && <p role="status">Alteração registrada com auditoria.</p>}
      {summary.error && <div className={styles.panel}><ReadError error={summary.error} retry={retry} /></div>}
      <nav className={styles.switcher} aria-label="Modo de consulta">
        {(Object.keys(areaLabels) as OccurrenceArea[]).map(item => <button key={item} type="button"
          aria-controls={"consulta-" + item} aria-pressed={area === item} onClick={() => { setArea(item); setSaved(false) }}>{areaLabels[item]}</button>)}
        <button type="button" aria-controls="consulta-arquivos" aria-pressed={area === "arquivos"}
          onClick={() => { setArea("arquivos"); setSaved(false) }}>Arquivos importados</button>
      </nav>
      {(Object.keys(areaLabels) as OccurrenceArea[]).map(item => <Consultation key={item} area={item} active={area === item}
        summary={summary.data} onRetry={retry} cycle={cycle} summaryFailed={!!summary.error} manualId={manualId}
        manage={(management && (item === "manuais" ? canManageManual : admin))
          || (manualOperational && item !== "importados" && (item === "manuais" ? canManageManual : admin))} onChanged={onChanged} />)}
      <ImportedFiles active={area === "arquivos"} canRead={canReadStaging} admin={admin}
        cycle={cycle} onChanged={onChanged} onRetry={retry} fileId={fileId} />
    </div>
    {consolidatedId && dismissedId !== consolidatedId && <ConsolidatedDetail key={consolidatedId}
      id={consolidatedId} area="consolidadas" fromMap onClose={() => setDismissedId(consolidatedId)} />}
  </div>
}
