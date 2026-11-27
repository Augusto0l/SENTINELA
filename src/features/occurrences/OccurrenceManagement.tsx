"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { z } from "zod"
import Button from "@/components/ui/button"
import { Fields, ImportDialog, Pager, formatCount, formatMonth } from "@/features/import/ImportUi"
import ImportHistory, { ImportedFilesHeading, useImportHistory } from "@/features/import/ImportHistory"
import ImportedFileActions from "@/features/import/ImportedFileActions"
import files from "@/features/import/ImportedFiles.module.css"
import {
  filesQuery, importedReviewDraft, importManagementAvailability, lotPurgeAssessment, lotPurgeHistory, lotStates, managedLotDetail, managedLots, managedOccurrence,
  managementPath, managementReceipt, managementWrite, manualPublicationBlocks, purgeAuthorizationReceipt,
  type ManagedLot, type ManagedOccurrence, type ManagementWrite,
} from "@/contracts/occurrence-management"
import { localOccurrenceList, type OccurrenceArea } from "@/contracts/local-occurrences"
import { successSchema } from "@/contracts/common"
import ReadError from "@/features/occurrences/ReadError"
import { readLocalConsultation, readManagement } from "@/features/occurrences/client"
import useRead from "@/features/occurrences/use-read"
import styles from "./OccurrenceWorkspace.module.css"
import ManualCreate from "./ManualCreate"

const labels = {
  concluida: "Concluída", com_pendencias: "Com pendências", inativada: "Inativada", falhou: "Falhou",
  em_processamento: "Em processamento", cancelada: "Cancelada",
}
const historyLabels: Record<string, string> = {
  tentativa_pcdf: "Tentativa PCDF", staging_pcdf: "Recepção PCDF v1", staging_pcdf_v2: "Recepção PCDF v2",
  reenvio_pcdf: "Reenvio PCDF", reenvio_pcdf_v2: "Reenvio PCDF v2", staging_geral: "Recepção CSV/XLSX",
  reenvio_geral: "Reenvio CSV/XLSX", inativar_lote: "Lote inativado",
  inativar_associacao: "Associação inativada", corrigir_associacao: "Correção administrativa da associação",
}
const defaultQuery = { view: "arquivos", pagina: 1 } as const
const timeOf = (date: string) => new Date(date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
const quantity = (value: number | null) => value === null ? "—" : formatCount(value)
const changes = ["data", "horario", "natureza", "local"] as const
const changeNames = { data: "Data do fato", horario: "Horário do fato", natureza: "Natureza para revisão", local: "Local para revisão" } as const
const writeResponse = successSchema(managementReceipt)
const authorizationResponse = successSchema(purgeAuthorizationReceipt)
const operationalWriteNotice = "Gravação bloqueada nesta instalação. A autorização do destino, as funções de gestão e a autoria institucional precisam ser validadas."
type ReviewLot = Pick<ManagedLot, "id" | "arquivo" | "competencia">

function lotFields(lot: ManagedLot) {
  return [
    { label: "Arquivo", value: lot.arquivo }, { label: "Identificador do lote", value: lot.id },
    { label: "Competência", value: formatMonth(lot.competencia) },
    { label: "Contrato", value: lot.contrato === "geral-v1" ? "Importação geral v1" : "PCDF " + lot.contrato },
    { label: "Formato", value: lot.formato }, { label: "Situação", value: labels[lot.situacao] },
    { label: "Data da importação (DF)", value: timeOf(lot.data) }, { label: "Responsável", value: lot.responsavel },
    { label: "Execução", value: lot.execucao },
    { label: lot.contrato === "geral-v1" ? "Registros recebidos" : "Associações recebidas", value: quantity(lot.recebidos) },
    { label: "Ocorrências candidatas", value: quantity(lot.candidatas) }, { label: "Pendências", value: quantity(lot.pendencias) },
  ]
}

function useMutation(onSaved: (payload: ManagementWrite) => void) {
  const saving = useRef(false)
  const [state, setState] = useState({ busy: false, error: "" })
  const save = async (payload: ManagementWrite) => {
    if (saving.current) return
    saving.current = true
    setState({ busy: true, error: "" })
    try {
      const response = await fetch(managementPath, {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      })
      const result = await response.json()
      const receipt = (payload.acao === "autorizar_exclusao" ? authorizationResponse : writeResponse).safeParse(result)
      if (!response.ok || !receipt.success || !receipt.data.meta.execution.persisted || receipt.data.data.id !== payload.id)
        throw new Error(typeof result?.error?.message === "string" ? result.error.message : "Não foi possível confirmar a alteração.")
      if (payload.acao === "autorizar_exclusao" && (!("revisao" in receipt.data.data) || receipt.data.data.revisao !== payload.revisao))
        throw new Error("A revisão retornada não coincide com a autorização solicitada.")
      onSaved(payload)
      setState({ busy: false, error: "" })
    } catch (error) {
      setState({ busy: false, error: error instanceof Error ? error.message : "Alteração sem confirmação. Confira o histórico." })
    } finally { saving.current = false }
  }
  return { ...state, save, saving }
}

function Confirmation({ expected, busy, error, onConfirm, onCancel }: {
  expected: string; busy: boolean; error: string; onConfirm?: (reason: string, confirmation: string) => void
  onCancel?: () => void
}) {
  const [confirmation, setConfirmation] = useState("")
  const [reason, setReason] = useState("")
  const [accepted, setAccepted] = useState(false)
  const valid = !!onConfirm && !busy && !!reason.trim() && confirmation.trim() === expected && (!onCancel || accepted)
  return <form onSubmit={event => { event.preventDefault(); if (valid) onConfirm?.(reason.trim(), confirmation.trim()) }}>
    <fieldset disabled={busy} className={styles.managementForm}>
      <label>Justificativa<textarea required maxLength={500} rows={3} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <label>{expected === "EXCLUIR" ? "Digite " : "Digite o identificador "}<code>{expected}</code><input required value={confirmation} autoComplete="off"
        onChange={event => setConfirmation(event.target.value)} /></label>
      {onCancel && <label className={styles.definitiveCheck}>
        <input type="checkbox" required checked={accepted} onChange={event => setAccepted(event.target.checked)} />
        Confirmo a exclusão permanente dos dados deste lote.
      </label>}
      <div className={files.filterActions}>
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancelar</Button>}
        <Button variant="outline" className={onCancel ? styles.definitiveButton : undefined} type="submit" disabled={!valid}>
          {busy ? "Confirmando…" : onCancel ? "Excluir definitivamente" : "Confirmar inativação"}
        </Button>
      </div>
    </fieldset>
    {error && <p className={styles.validation} role="alert">{error}</p>}
  </form>
}

function LotDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [retry, setRetry] = useState(0)
  const read = useCallback((signal: AbortSignal) => readManagement({ view: "arquivo", id }, managedLotDetail, signal), [id])
  const { data, error, loading } = useRead(id, read, retry)
  return <ImportDialog title="Detalhes da importação" onClose={onClose}>
    {loading && <p role="status">Carregando lote…</p>}
    {error && <ReadError error={error} retry={() => setRetry(count => count + 1)} />}
    {data && <>
      <Fields items={lotFields(data)} />
      <section className={styles.detailGroup}>
        <h3>Associações e vínculos ativos</h3>
        <Fields items={[
          { label: "Origens compartilhadas com outros registros ativos", value: quantity(data.compartilhadas) },
          { label: "Lotes ativos relacionados", value: quantity(data.lotesRelacionados) },
          { label: "Registros ativos", value: quantity(data.recebidosAfetados) },
          { label: "Chaves candidatas nos registros ativos", value: data.contrato === "geral-v1" ? "—" : quantity(data.candidatasAfetadas) },
          { label: "Vínculos com ocorrências consolidadas", value: quantity(data.vinculosConsolidados) },
        ]} />
      </section>
        <section className={styles.detailGroup}><h3>Proveniência e integridade</h3>
          <Fields items={[
            { label: "Fonte", value: data.fonte }, { label: "Tamanho em bytes", value: quantity(data.bytes) },
            { label: "SHA-256 do arquivo", value: data.sha256 }, { label: "SHA-256 do XML", value: data.shaXml },
            { label: "SHA-256 do manifesto", value: data.manifesto }, { label: "Digest do pacote", value: data.pacote?.digest },
            { label: "Associações novas na origem", value: quantity(data.novas) },
            { label: "Associações com origem reutilizada", value: quantity(data.reutilizadas) },
          ]} />
          {data.pacote && <ul>{data.pacote.artefatos.map(name => <li key={name}>{name}</li>)}</ul>}
        </section>
        <section className={styles.detailGroup}><h3>Histórico da operação</h3>
          {data.tentativas.map(item => <p key={item.id}>Execução {item.numero} · {item.situacao} · {timeOf(item.data)}</p>)}
          {data.historico.length ? <ul>{data.historico.map((item, index) => <li key={index}>
            {historyLabels[item.acao] ?? item.acao} · {timeOf(item.data)}{item.responsavel && " · " + item.responsavel}<br />{item.justificativa}
          </li>)}</ul> : <p>Sem eventos disponíveis para este lote.</p>}
        </section>
    </>}
  </ImportDialog>
}

const purgeBlockLabels = {
  consolidacao: "Ocorrências com vínculo impeditivo de consolidação",
  execucao_ativa: "Execuções ainda em andamento",
  origem_sem_lote: "Linhas de origem sem titularidade identificada",
  historico_compartilhado: "Vínculos com histórico de outros registros",
  dependencia_desconhecida: "Dependências do banco que exigem revisão",
  lote_protegido: "Lote protegido contra exclusão operacional",
}

function LotPurge({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const [retry, setRetry] = useState(0)
  const read = useCallback((signal: AbortSignal) => readManagement({ view: "previa_exclusao", id }, lotPurgeAssessment, signal), [id])
  const { data, error, loading } = useRead(id + ":" + retry, read)
  const reload = () => setRetry(count => count + 1)
  const mutation = useMutation(payload => { if (payload.acao === "autorizar_exclusao") reload(); else onSaved() })
  const exception = data && !("escopo" in data) ? data.excecao : null
  const expires = exception?.validade
  useEffect(() => {
    if (!expires) return
    const timer = window.setTimeout(() => setRetry(count => count + 1), Math.max(0, Date.parse(expires) - Date.now()))
    return () => window.clearTimeout(timer)
  }, [expires])
  const close = () => { if (!mutation.saving.current) onClose() }
  return <ImportDialog title="Excluir definitivamente esta importação?" onClose={close}>
    {loading && <p role="status">Calculando impacto da exclusão…</p>}
    {error && <ReadError error={error} retry={reload} />}
    {data && ("escopo" in data ? <>
      <Fields items={[
        { label: "Arquivo", value: data.arquivo }, { label: "Identificador do lote", value: data.id },
        ...(data.competencia ? [{ label: "Competência", value: formatMonth(data.competencia) }] : []),
        { label: data.contrato === "geral-v1" ? "Registros persistidos" : "Associações registradas na importação", value: quantity(data.associacoes) },
        { label: data.contrato === "geral-v1" ? "Ocorrências de validação na importação" : "Pendências registradas na importação",
          value: quantity(data.pendenciasRegistradas) },
      ]} />
      <section className={styles.detailGroup}>
        <h3>Dependências a verificar</h3>
        <p>O catálogo informa as tabelas que referenciam registros da importação. O plano definitivo precisa verificar os vínculos deste lote e separar os registros exclusivos dos compartilhados.</p>
        <ul>{data.dependencias.map(name => <li key={name}>{name}</li>)}</ul>
      </section>
      <p role="status">{operationalWriteNotice}</p>
      <Confirmation expected={data.id} busy={false} error="" onCancel={close} />
    </> : <>
      <Fields items={[
        { label: "Arquivo", value: data.arquivo }, { label: "Identificador do lote", value: id },
        { label: "Competência", value: formatMonth(data.competencia) },
        ...(data.dataImportacao ? [{ label: "Data da importação (DF)", value: timeOf(data.dataImportacao) }] : []),
        { label: "Revisão do plano", value: <code className={styles.associationId}>{data.revisao}</code> },
        ...(exception ? [
          { label: "Backup", value: exception.backup === "verificado" ? "Backup restaurado com integridade verificada" : "Backup indisponível" },
          { label: "Autorização especial", value: expires ? "Válida até " + timeOf(expires) + " (DF)" : "Pendente" },
        ] : []),
        { label: "Lotes no plano", value: quantity(data.quantidades.lotes) },
        { label: "Execuções no plano", value: quantity(data.quantidades.execucoes) },
        { label: data.contrato === "geral-v1" ? "Registros no plano" : "Associações do lote no plano", value: quantity(data.quantidades.staging) },
        { label: "Origens exclusivas no plano", value: quantity(data.quantidades.origens) },
        { label: "Extrações exclusivas no plano", value: quantity(data.quantidades.extracoes) },
        { label: "Ocorrências candidatas afetadas", value: quantity(data.candidatas) },
        { label: "Pendências no plano", value: quantity(data.quantidades.pendencias) },
        { label: "Correções no plano", value: quantity(data.quantidades.correcoes) },
        { label: "Eventos de auditoria no plano", value: quantity(data.quantidades.auditorias) },
        { label: "Recibos de importação no plano", value: quantity(data.quantidades.recibos) },
        { label: "Registros de origem compartilhados preservados", value: quantity(data.compartilhadas) },
        ...(data.quantidades.artefatos ? [{ label: "Artefatos a excluir da custódia no banco", value: quantity(data.quantidades.artefatos) }] : []),
      ]} />
      {Boolean(data.dependencias?.length) && <details className={styles.detailGroup}>
        <summary>Tabelas referenciadoras verificadas</summary>
        <ul>{data.dependencias?.map(name => <li key={name}>{name}</li>)}</ul>
      </details>}
      {!data.bloqueios.length && <p>A confirmação remove os dados exclusivos do lote e registra o responsável, a justificativa, o momento e as quantidades no comprovante administrativo.</p>}
      {data.bloqueios.length > 0 ? <section className={styles.detailGroup} role="status">
        <h3>Vínculos que exigem revisão</h3>
        <ul>{data.bloqueios.map(item => <li key={item.tipo}>
          {purgeBlockLabels[item.tipo]} ({quantity(item.quantidade)})
          <div className={styles.associationId}>{item.ids.join(" · ")}</div>
        </li>)}</ul>
        {exception?.elegivel && data.bloqueios.length === 1 && data.bloqueios[0].tipo === "lote_protegido" && <>
          <p>A autorização vincula o lote a esta revisão por até 15 minutos.</p>
          <Button type="button" disabled={mutation.busy || !!error || exception.backup !== "verificado"}
            onClick={() => void mutation.save({ acao: "autorizar_exclusao", id, confirmacao: id, revisao: data.revisao })}>
            {mutation.busy ? "Autorizando…" : "Autorizar exclusão deste lote"}
          </Button>
        </>}
        {exception && !exception.elegivel && data.bloqueios.every(block => block.tipo === "lote_protegido") &&
          <p>Esta revisão ou este vínculo institucional está fora da autorização especial qualificada.</p>}
      </section> : <>
        {data.autorizada === false && <p role="status">Esta revisão da prévia ainda precisa de aprovação do lote e comprovação de recuperação.</p>}
        <Confirmation key={data.revisao + (expires ?? "")} expected={exception ? "EXCLUIR" : id}
          busy={mutation.busy} error={mutation.error} onCancel={close}
          onConfirm={error || data.autorizada === false || (exception && (!expires || exception.backup !== "verificado"))
            ? undefined : (justificativa, confirmation) => void mutation.save({
              acao: "excluir_lote", id, revisao: data.revisao, justificativa, confirmacao: id, definitiva: true,
              ...(exception && confirmation === "EXCLUIR" && { palavra: confirmation }),
          })} />
      </>}
      {data.bloqueios.length > 0 && mutation.error && <p role="alert">{mutation.error}</p>}
      {!mutation.busy &&
        <Button size="sm" variant="outline" onClick={reload}>Reconsultar impacto</Button>}
    </>)}
  </ImportDialog>
}

function PurgeHistory({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const load = useCallback((signal: AbortSignal) =>
    readManagement({ view: "exclusoes", pagina: page }, lotPurgeHistory, signal), [page])
  const { data, error, loading } = useRead(String(page), load, retry)
  return <ImportDialog title="Comprovantes de exclusão" onClose={onClose}>
    {loading && <p role="status">Consultando comprovantes…</p>}
    {error && <ReadError error={error} retry={() => setRetry(count => count + 1)} />}
    {data && (data.total ? <>
      {data.itens.map(item => <section key={item.id} className={styles.detailGroup}>
        <h3>Lote <span className={styles.associationId}>{item.lote}</span></h3>
        <Fields items={[
          { label: "Momento (DF)", value: timeOf(item.momento) }, { label: "Responsável (identificador)", value: item.responsavel },
          { label: "Justificativa", value: item.justificativa }, { label: "Registros de staging excluídos", value: quantity(item.quantidades.staging) },
          { label: "Pendências excluídas", value: quantity(item.quantidades.pendencias) },
          { label: "Artefatos excluídos da custódia", value: quantity(item.quantidades.artefatos) },
          ...(item.revisao_autorizada ? [{ label: "Revisão autorizada", value: <code className={styles.associationId}>{item.revisao_autorizada}</code> }] : []),
          ...(item.backup_restaurado ? [{ label: "SHA-256 do backup", value: <code className={styles.associationId}>{item.backup_restaurado}</code> }] : []),
        ]} />
      </section>)}
      <Pager page={data.pagina} total={data.total} onChange={setPage} label="Paginação de comprovantes" />
    </> : <p>Nenhuma exclusão registrada.</p>)}
  </ImportDialog>
}
function LotRecords({ lot, cycle, onClose, onChanged, operational = false, hosted = false }: {
  lot: ReviewLot; cycle: number; onClose: () => void; onChanged: () => void; operational?: boolean; hosted?: boolean
}) {
  const [search, setSearch] = useState({ pagina: 1, busca: "" })
  const [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState<string>()
  const managementRead = operational || hosted
  const read = useCallback((signal: AbortSignal) => {
    const filters = { pagina: search.pagina, ...(search.busca && { busca: search.busca }) }
    return managementRead
      ? readManagement({ view: "registros_lote", id: lot.id, ...filters }, localOccurrenceList, signal)
      : readLocalConsultation({ view: "importados", lote: lot.id, ordenar: "identificacao", direcao: "asc", ...filters },
        localOccurrenceList, signal)
  }, [lot.id, managementRead, search])
  const { data, loading, error } = useRead(lot.id + JSON.stringify(search), read, cycle + retry)

  return <>
    <ImportDialog title="Editar registros" onClose={onClose}>
      <Fields items={[
        { label: "Arquivo", value: lot.arquivo }, { label: "Lote", value: lot.id },
        { label: "Competência", value: formatMonth(lot.competencia) },
      ]} />
      <form className={styles.managementForm} onSubmit={event => {
        event.preventDefault()
        setSearch({ pagina: 1, busca: String(new FormData(event.currentTarget).get("busca")).trim() })
      }} onReset={() => setSearch({ pagina: 1, busca: "" })}>
        <label>Buscar associação<input type="search" name="busca" maxLength={240}
          placeholder={managementRead ? "Número ou ID" : "Número, natureza, RA, local ou ID"} /></label>
        <div className={files.filterActions}>
          <Button size="sm" type="submit">Buscar</Button>
          <Button size="sm" type="reset" variant="outline">Limpar</Button>
        </div>
      </form>
      {loading && <p role="status">Consultando associações do lote…</p>}
      {error && <ReadError error={error} retry={() => setRetry(value => value + 1)} />}
      {data && <>
        <p className={files.results} role="status">{formatCount(data.total)} {data.total === 1 ? "associação encontrada" : "associações encontradas"}</p>
        {data.itens.length > 0 && <ul className={files.lotRecords}>
          {data.itens.map(row => <li key={row.id}>
            <div><strong>{row.identificacao ?? row.id}</strong>
              {row.ordinal && <small>Registro {formatCount(row.ordinal)}</small>}
              <p>{[row.natureza, row.ra, row.local].filter(Boolean).join(" · ")}</p>
            </div>
            {!error && (managementRead || row.acoes?.editar) ? <Button size="sm" variant="outline" onClick={event => {
              event.currentTarget.focus({ preventScroll: true })
              setSelected(row.id)
            }}>Editar</Button> : <small>Revisão indisponível para esta associação.</small>}
          </li>)}
        </ul>}
        <Pager page={data.pagina} total={data.total} onChange={pagina => setSearch(current => ({ ...current, pagina }))} label="Paginação das associações do lote" />
      </>}
    </ImportDialog>
    {selected && (operational
      ? <OperationalReview id={selected} lot={lot.id} onClose={() => setSelected(undefined)} />
      : <OccurrenceAction area="importados" id={selected} lot={lot.id} edit onClose={() => setSelected(undefined)}
        onSaved={() => { setSelected(undefined); onChanged() }} />)}
  </>
}

const editBlockLabels = {
  contrato: "A revisão administrativa está disponível para associações PCDF.",
  situacao: "A situação atual do lote impede a edição.",
  sem_associacoes: "O lote não tem associações recebidas.",
}

export function ImportedFiles({ active, canRead, admin, cycle, onChanged, onRetry, fileId, importHistory, hosted = false }: {
  active: boolean; canRead: boolean; admin: boolean; cycle: number; onChanged: (message?: string) => void;
  onRetry: () => void; fileId?: string; importHistory?: ReturnType<typeof useImportHistory>; hosted?: boolean
}) {
  const [query, setQuery] = useState<z.infer<typeof filesQuery>>(defaultQuery)
  const [error, setError] = useState("")
  const [action, setAction] = useState<{ kind: "details" | "remove"; id: string } | { kind: "edit"; lot: ReviewLot } | undefined>(
    () => fileId ? { kind: "details", id: fileId } : undefined,
  )
  const [showPurges, setShowPurges] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const available = active && canRead
  const loadAvailability = useCallback((signal: AbortSignal) => available
    ? readManagement({ view: "disponibilidade" }, importManagementAvailability, signal) : Promise.resolve(undefined), [available])
  const availability = useRead(available + ":" + refresh, loadAvailability)
  const management = !availability.error && !!availability.data?.catalogoGestao
  const writable = management && availability.data?.escrita === "disponivel"
  const operational = !availability.error && availability.data?.consultaOperacional === true
  const read = useCallback((signal: AbortSignal) => available && management
    ? readManagement(query, managedLots, signal) : Promise.resolve(undefined), [available, management, query])
  const state = useRead(JSON.stringify(query) + ":" + refresh + ":" + (available && management), read, cycle)
  const fallbackHistory = useImportHistory(!importHistory && available && !availability.loading && !management, true, cycle)
  const history = importHistory ?? fallbackHistory
  const reload = () => setRefresh(count => count + 1)
  const notice = availability.error ? "Falha ao consultar a disponibilidade da gestão. Atualize o histórico para tentar novamente."
    : operational ? "Você pode consultar associações e abrir a prévia. " + operationalWriteNotice
    : availability.data?.escrita === "banco_sem_escrita" ? "O PostgreSQL de homologação está sem autorização para gravar nesta instalação."
      : "A instalação atual autoriza consultas. Edição e exclusão exigem uma sessão no ambiente sintético de homologação."
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = Object.fromEntries([...new FormData(event.currentTarget)].filter(([, value]) => String(value).trim()))
    const parsed = filesQuery.safeParse({ ...defaultQuery, ...form })
    if (!parsed.success) return setError("Confira a competência e o intervalo de datas.")
    setError("")
    setQuery(parsed.data)
  }
  return <section id="consulta-arquivos" className={styles.tabPanel} hidden={!active} aria-label="Arquivos importados">
    {!canRead ? <div className={files.card}><p role="status" className={files.feedback}>A consulta aos arquivos está disponível para Administrador e Operador.</p></div>
      : availability.loading ? <div className={files.card}><p role="status">Verificando disponibilidade da gestão…</p></div>
      : !management ? <>
        {!admin && <p className={files.feedback} role="status">{availability.error ? notice : "Edição e exclusão exigem o perfil Administrador."}</p>}
        <ImportHistory inOccurrences managementNotice={admin ? notice : undefined} current={history.current}
          onReview={operational ? lot => setAction({ kind: "edit", lot }) : undefined}
          onPurgePreview={operational ? id => setAction({ kind: "remove", id }) : undefined}
          reload={() => { reload(); history.reload() }} />
        {active && operational && action?.kind === "edit" && <LotRecords key={action.lot.id} operational lot={action.lot}
          cycle={cycle} onClose={() => setAction(undefined)} onChanged={onChanged} />}
        {active && operational && action?.kind === "remove" && <LotPurge key={action.id} id={action.id}
          onClose={() => setAction(undefined)} onSaved={() => { setAction(undefined); onChanged() }} />}
      </>
        : <>
          <div className={files.card}>
            <ImportedFilesHeading reload={reload} />
            {!writable && <p className={files.feedback} role="status">Edição e exclusão exigem o perfil Administrador.</p>}
            {writable && <div className={files.filterActions}><Button size="sm" variant="outline"
              onClick={() => setShowPurges(true)}>Comprovantes de exclusão</Button></div>}
            <form onSubmit={apply} onReset={() => { setQuery(defaultQuery); setError("") }}>
              <div className={files.lotFilters}>
                <label>Buscar por arquivo ou lote<input type="search" name="busca" maxLength={240} /></label>
                <label>Competência<input type="month" name="competencia" /></label>
                <label>Situação<select name="situacao"><option value="">Todas</option>
                  {lotStates.map(state => <option key={state} value={state}>{labels[state]}</option>)}
                </select></label>
                <label>Data inicial da importação<input type="date" name="dataInicial" /></label>
                <label>Data final da importação<input type="date" name="dataFinal" /></label>
              </div>
              <div className={files.filterActions}><Button type="submit" size="sm">Aplicar filtros</Button>
                <Button type="reset" size="sm" variant="outline">Limpar filtros</Button></div>
              {error && <p className={files.feedback} role="alert">{error}</p>}
            </form>
            {state.loading && <p className={files.feedback} role="status">Carregando histórico de importações…</p>}
            {state.error && <div className={files.feedback}><ReadError error={state.error} retry={onRetry} /></div>}
            {state.data && <p className={files.results} role="status">
              {formatCount(state.data.total)} {state.data.total === 1 ? "lote encontrado" : "lotes encontrados"}
            </p>}
            {state.data?.itens.length ? <>
              <div className={files.table} tabIndex={0} role="region" aria-label="Lotes de importação">
                <table role="table"><thead><tr><th scope="col">Arquivo</th><th scope="col">Tipo</th><th scope="col">Data de envio</th>
                  <th scope="col" className={files.numeric}>Recebidos</th><th scope="col" className={files.numeric}>Candidatas</th>
                  <th scope="col" className={files.numeric}>Pendências</th><th scope="col">Situação</th><th scope="col">Ações</th></tr></thead>
                <tbody>{state.data.itens.map(lot => <tr key={lot.id}>
                  <th scope="row">{lot.arquivo}<small>{formatMonth(lot.competencia)}</small><small>{lot.id}</small></th>
                  <td data-label="Tipo">{lot.contrato === "geral-v1" ? lot.formato ?? "Importação geral" : "PCDF " + lot.contrato}</td>
                  <td data-label="Data de envio"><time dateTime={lot.data}>{timeOf(lot.data)}</time>
                    {lot.responsavel && <small>{lot.responsavel}</small>}</td>
                  <td data-label="Recebidos" className={files.numeric}>{quantity(lot.recebidos)}</td>
                  <td data-label="Candidatas" className={files.numeric}>{quantity(lot.candidatas)}</td>
                  <td data-label="Pendências" className={files.numeric}>{quantity(lot.pendencias)}</td>
                  <td data-label="Situação"><span className={files.badge} data-status={lot.situacao}>{labels[lot.situacao]}</span></td>
                  <td data-label="Ações"><ImportedFileActions name={lot.arquivo}
                    onDetails={() => setAction({ kind: "details", id: lot.id })}
                    edit={!writable ? undefined : state.error || !lot.acoes ? "Não foi possível confirmar a disponibilidade do lote."
                      : lot.acoes.edicao === "disponivel" ? () => setAction({ kind: "edit", lot }) : editBlockLabels[lot.acoes.edicao]}
                    remove={!writable ? undefined : state.error || !lot.acoes ? "Não foi possível confirmar a disponibilidade do lote."
                      : lot.acoes.bloqueiosExclusao.length ? lot.acoes.bloqueiosExclusao.map(block =>
                        purgeBlockLabels[block.tipo] + " (" + block.quantidade + ")").join(" · ")
                        : () => setAction({ kind: "remove", id: lot.id })} /></td>
                </tr>)}</tbody></table>
              </div>
              <Pager page={state.data.pagina} total={state.data.total} onChange={pagina => setQuery(previous => ({ ...previous, pagina }))} label="Paginação de arquivos" />
            </> : state.data && !state.error && <p className={files.feedback}>
              {Object.keys(query).length > 2 ? "Nenhum lote corresponde aos filtros." : "Nenhum lote registrado."}
            </p>}
          </div>
          {active && writable && action?.kind === "edit" && <LotRecords key={action.lot.id} lot={action.lot} hosted={hosted}
            cycle={cycle} onClose={() => setAction(undefined)} onChanged={onChanged} />}
          {active && action?.kind === "details" && <LotDetail key={action.id} id={action.id} onClose={() => setAction(undefined)} />}
          {active && writable && action?.kind === "remove" && <LotPurge key={action.id} id={action.id} onClose={() => setAction(undefined)}
            onSaved={() => { setAction(undefined); onChanged("Arquivo excluído definitivamente. O comprovante foi registrado.") }} />}
          {active && writable && showPurges && <PurgeHistory onClose={() => setShowPurges(false)} />}
        </>}
  </section>
}

function ReviewForm({ data, mutation, lot, blocked = false }: {
  data: Pick<ManagedOccurrence, "id" | "data" | "horario" | "natureza" | "local"> & { revisao?: string | null }
  mutation: ReturnType<typeof useMutation>; lot?: string; blocked?: boolean
}) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (blocked) return
    const form = new FormData(event.currentTarget)
    const rawTime = String(form.get("horario"))
    const horario = rawTime.length === 5 ? rawTime + ":00" : rawTime
    const justificativa = String(form.get("justificativa")).trim()
    const alteracoes = Object.fromEntries(changes.flatMap(field => {
      const value = field === "horario" ? horario : String(form.get(field)).trim()
      if (value === (data[field] ?? "")) return []
      return [[field, value || null]]
    }))
    const command = managementWrite.safeParse({
      acao: "corrigir_associacao", id: data.id, revisao: data.revisao, justificativa, alteracoes, ...(lot && { lote: lot }),
    })
    if (!command.success) {
      const issues = Object.fromEntries(command.error.issues.map(issue => {
        const field = String(issue.path.at(-1))
        return [field, field === "justificativa" ? "Informe a justificativa."
          : field === "alteracoes" ? "Altere pelo menos um campo." : "Confira o valor informado."]
      }))
      setErrors(issues)
      const first = Object.keys(issues)[0]
      requestAnimationFrame(() => document.getElementById("review-" + first)?.focus())
      return
    }
    setErrors({})
    void mutation.save(command.data)
  }
  return <form onSubmit={submit} noValidate><fieldset className={styles.managementForm} disabled={mutation.busy}>
    {changes.map(field => <label key={field}>{changeNames[field]}
      <input id={"review-" + field} name={field}
        type={field === "data" ? "date" : field === "horario" ? "time" : "text"}
        step={field === "horario" ? "1" : undefined} maxLength={240} defaultValue={data[field] ?? ""}
        aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? "review-error-" + field : undefined} />
      {errors[field] && <small id={"review-error-" + field} className={styles.validation}>{errors[field]}</small>}
    </label>)}
    <label>Justificativa<textarea id="review-justificativa" name="justificativa" required rows={3} maxLength={500}
      aria-invalid={Boolean(errors.justificativa)} aria-describedby={errors.justificativa ? "review-error-justificativa" : undefined} />
      {errors.justificativa && <small id="review-error-justificativa" className={styles.validation}>{errors.justificativa}</small>}
    </label>
    {errors.alteracoes && <p id="review-alteracoes" className={styles.validation} tabIndex={-1} role="alert">{errors.alteracoes}</p>}
    <Button type="submit" disabled={blocked || mutation.busy}>{mutation.busy ? "Salvando…" : "Salvar alterações"}</Button>
  </fieldset>
    {mutation.error && <p role="alert">{mutation.error}</p>}
  </form>
}

function OperationalReview({ id, lot, onClose }: { id: string; lot: string; onClose: () => void }) {
  const [retry, setRetry] = useState(0)
  const read = useCallback((signal: AbortSignal) =>
    readManagement({ view: "rascunho_importado", id, lote: lot }, importedReviewDraft, signal), [id, lot])
  const { data, loading, error } = useRead(id + ":" + lot, read, retry)
  const mutation = useMutation(onClose)
  return <ImportDialog title="Corrigir associação" onClose={onClose}>
    {loading && <p role="status">Consultando associação…</p>}
    {error && <ReadError error={error} retry={() => setRetry(count => count + 1)} />}
    {data && <>
      <Fields items={[{ label: "Registro", value: data.identificacao }, { label: "Identificador", value: id }]} />
      <p role="status">{operationalWriteNotice}</p>
      <ReviewForm data={data} mutation={mutation} lot={lot} blocked />
    </>}
  </ImportDialog>
}

export function AssociationHistory({ data }: { data: ManagedOccurrence }) {
  return <section className={styles.detailGroup}>
    <h3>Histórico da revisão administrativa</h3>
    {data.historico?.length ? <ol>{data.historico.map(event => <li key={event.id}>
      <p><strong>{historyLabels[event.acao]}</strong> · {timeOf(event.data)} (DF) · {event.responsavel} · conta {event.conta.slice(0, 12)}</p>
      <p>{event.justificativa}</p>
      {event.depois && <Fields items={changes.filter(field => event.antes[field] !== event.depois?.[field]).map(field => ({
        label: changeNames[field], value: <><span>Anterior: {event.antes[field] ?? "Vazio"}</span><br />
          <span>Corrigido: {event.depois?.[field] ?? "Vazio"}</span></>,
      }))} />}
    </li>)}</ol> : <p>Nenhuma revisão administrativa registrada para esta associação.</p>}
  </section>
}

export function OccurrenceAction({ area, id, edit, publish = false, onClose, onSaved, lot }: {
  area: OccurrenceArea; id: string; edit: boolean; publish?: boolean; onClose: () => void; onSaved: () => void; lot?: string
}) {
  const manual = area === "manuais"
  const imported = area === "importados"
  const title = publish ? "Validar e publicar ocorrência" : edit ? imported ? "Corrigir associação" : "Editar ocorrência"
    : imported ? "Inativar associação" : "Inativar ocorrência"
  const read = useCallback((signal: AbortSignal) => readManagement({ view: area, id }, managedOccurrence, signal), [area, id])
  const [retry, setRetry] = useState(0)
  const { data, loading, error } = useRead(id, read, retry)
  const mutation = useMutation(onSaved)
  const version = data?.versao
  return <ImportDialog title={title} wide={manual && edit} onClose={() => { if (!mutation.saving.current) onClose() }}>
    {loading && <p role="status">Carregando registro e impacto…</p>}
    {error && <ReadError error={error} retry={() => setRetry(count => count + 1)} />}
    {data && <>
      <Fields items={[
        { label: "Registro", value: data.identificacao }, { label: "Identificador", value: id },
        ...(!edit ? [{ label: "Data do fato", value: data.data?.split("-").reverse().join("/") },
          { label: "Horário do fato", value: data.horario }, { label: "Local", value: data.local },
          ...(imported ? [{ label: "Natureza", value: data.natureza }] : [])] : []),
        { label: imported ? "Associações no grupo candidato" : "Naturezas vinculadas", value: quantity(data.vinculos) },
        ...(imported ? [{ label: "Lotes ativos relacionados", value: quantity(data.lotesRelacionados) }] : []),
      ]} />
      {publish ? data.pendenciasPublicacao?.length ? <>
        <p role="status">A publicação está bloqueada até a revisão destes pontos:</p>
        <ul>{data.pendenciasPublicacao.map(block => <li key={block}>{manualPublicationBlocks[block]}</li>)}</ul>
      </> : data.versao ? <>
        <p>A ocorrência passa a compor o Dashboard e o Mapa Criminal com o ponto WGS84 confirmado. A publicação é auditada
          e pode ser revertida por inativação.</p>
        <Confirmation expected={id} busy={mutation.busy} error={mutation.error} onConfirm={(justificativa, confirmacao) => {
          if (data.versao) void mutation.save({ acao: "consolidar_manual", id, versao: data.versao, confirmacao, justificativa })
        }} />
      </> : <p role="status">A versão do registro está indisponível.</p>
      : edit ? data.editavel ? <>
        {manual && data.manual && version ? <ManualCreate edit={{
          initial: data.manual, error: mutation.error, onCancel: onClose,
          onSave: (dados, justificativa) => mutation.save({ acao: "editar_manual", id, versao: version, confirmacao: id, dados, justificativa }),
        }} /> : imported ? <>
          <p>A correção entra no histórico desta associação. A consulta dos dados recebidos permanece disponível em Ver detalhes.</p>
          <ReviewForm data={data} mutation={mutation} lot={lot} />
          <AssociationHistory data={data} />
        </> : <p role="status">Os dados persistentes da edição estão indisponíveis.</p>}
      </> : <p role="status">A associação já tem vínculo de consolidação e precisa ser revisada por esse fluxo.</p>
        : data.bloqueiaConsolidacao ? <p role="status">A associação sustenta um vínculo consolidado exclusivo.</p>
          : <>
            <p>{imported ? "A inativação afeta somente a associação selecionada. Outras naturezas e lotes permanecem disponíveis."
              : "A ocorrência sai das consultas ativas. Suas naturezas e o histórico ficam preservados."}</p>
            <Confirmation expected={id} busy={mutation.busy} error={mutation.error} onConfirm={(justificativa, confirmacao) => {
              if (imported && data.revisao) void mutation.save({ acao: "inativar_associacao", id, revisao: data.revisao, confirmacao, justificativa })
              if (!imported && data.versao) void mutation.save({ acao: manual ? "inativar_manual" : "inativar_consolidada", id, versao: data.versao, confirmacao, justificativa })
            }} />
          </>}
    </>}
  </ImportDialog>
}
