"use client"
import { useCallback, useId, useRef, useState } from "react"
import dynamic from "next/dynamic"
import Button from "@/components/ui/button"
import Dialog from "@/components/ui/dialog"
import { useOperations } from "@/components/OperationalProvider"
import { readCatalog } from "@/features/occurrences/client"
import useRead from "@/features/occurrences/use-read"
import { simulateOccurrence, simulationAllowed, simulationEligible, SYNTHETIC_CATALOGS, syntheticRecord,
  type SimulationRecord, type SimulationCatalogs, type SimulationOperation, type SimulationScenario } from "@/features/occurrences/simulation"
import type { PlannedOccurrenceCreate } from "@/contracts/planned-occurrence-writes"
import styles from "./SimulationWorkspace.module.css"
import TerritorialFeedback from "@/features/occurrences/TerritorialFeedback"
import type { TerritorialResult } from "@/data/territorial-validation"
const LocationPicker = dynamic(() => import("@/components/occurrences/LocationPicker"), { ssr: false, loading: () => <p>Carregando mapa…</p> })

function DraftForm({ initial, catalogs, busy, editing, errors, onSubmit, onCancel, synthetic }: {
  initial?: SimulationRecord; catalogs: SimulationCatalogs; busy: boolean; editing: boolean; errors: Record<string, string>
  onSubmit: (values: PlannedOccurrenceCreate, reason: string) => void; onCancel: () => void
  synthetic: boolean
}) {
  const v = initial?.values
  const prefix = useId()
  const [territory, setTerritory] = useState<TerritorialResult | null>(null)
  const [geoError, setGeoError] = useState("")
  const [draft, setDraft] = useState({ data: v?.data ?? "", horario: v?.horario ?? "", raId: v?.raId ?? "", local: v?.local ?? "",
    latitude: v?.coordenadas ? String(v.coordenadas.latitude) : "", longitude: v?.coordenadas ? String(v.coordenadas.longitude) : "" })
  const [links, setLinks] = useState(v?.naturezas.length ? v.naturezas : [{ naturezaId: "", crimeTentado: null as boolean | null }])
  const [reason, setReason] = useState("")
  const [cancel, setCancel] = useState(false)
  const [dirty, setDirty] = useState(false)
  const change = (key: keyof typeof draft, value: string) => { setGeoError(""); setDirty(true); setDraft(d => ({ ...d, [key]: value })) }
  const error = (key: string) => Object.entries(errors).find(([path]) => path === key || path.startsWith(key + ".") || path === "alteracoes." + key || path.startsWith("alteracoes." + key + "."))?.[1]
  return <form noValidate className={styles.form} onSubmit={event => {
    event.preventDefault(); if (busy) return
    if (territory && ["outside_df", "ra_mismatch", "boundary_ambiguous"].includes(territory.status)) { setGeoError(territory.message); return }
    onSubmit({ data: draft.data, horario: draft.horario.length === 5 ? draft.horario + ":00" : draft.horario,
      raId: draft.raId, local: draft.local, naturezas: links,
      ...(draft.latitude || draft.longitude ? { coordenadas: { latitude: draft.latitude.trim() ? Number(draft.latitude) : NaN, longitude: draft.longitude.trim() ? Number(draft.longitude) : NaN } } : {}) }, reason)
  }}>
    <fieldset disabled={busy} className={styles.grid}>
      <legend>{editing ? "Campos editáveis da prévia" : "Dados da ocorrência demonstrativa"}</legend>
      {([['data', 'Data', 'date'], ['horario', 'Horário', 'time'], ['local', 'Endereço, bairro ou setor do fato', 'text'], ['latitude', 'Latitude (opcional)', 'text'], ['longitude', 'Longitude (opcional)', 'text']] as const).map(([key, label, type]) => <label key={key} htmlFor={`${prefix}-${key}`}>
        {label}{!["latitude", "longitude"].includes(key) && " *"}
        <input id={`${prefix}-${key}`} aria-label={label + (!["latitude", "longitude"].includes(key) ? " *" : "")} type={type} step={type === "time" ? 1 : undefined} value={draft[key]} onChange={e => change(key, e.target.value)}
          aria-invalid={Boolean(error(key) || (["latitude", "longitude"].includes(key) && error("coordenadas")))} aria-describedby={error(key) ? `${prefix}-${key}-error` : undefined} />
        {error(key) && <small id={`${prefix}-${key}-error`} role="alert">{error(key)}</small>}
      </label>)}
      <label htmlFor={`${prefix}-ra`}>Região Administrativa *<select id={`${prefix}-ra`} aria-label="Região Administrativa *" value={draft.raId} onChange={e => change("raId", e.target.value)} aria-invalid={Boolean(error("raId"))}>
        <option value="">{catalogs.regions.length ? "Selecione uma região" : "Catálogo de regiões vazio ou indisponível"}</option>
        {catalogs.regions.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
      </select>{error("raId") && <small role="alert">{error("raId")}</small>}</label>
    </fieldset>
    <fieldset disabled={busy}><legend>Naturezas associadas *</legend>
      {links.map((link, index) => <div className={styles.link} key={index}>
        <label htmlFor={`${prefix}-nature-${index}`}>Natureza {index + 1}<select id={`${prefix}-nature-${index}`} aria-label={`Natureza ${index + 1}`} value={link.naturezaId} aria-invalid={Boolean(error("naturezas"))} onChange={e => { setDirty(true); setLinks(all => all.map((n, i) => i === index ? { ...n, naturezaId: e.target.value } : n)) }}>
          <option value="">{catalogs.natures.length ? "Selecione uma natureza" : "Catálogo de naturezas vazio ou indisponível"}</option>
          {catalogs.natures.map(n => <option key={n.id} value={n.id}>{n.descricao}</option>)}
        </select></label>
        <label htmlFor={`${prefix}-attempt-${index}`}>Tentativa<select id={`${prefix}-attempt-${index}`} value={link.crimeTentado === null ? "unknown" : String(link.crimeTentado)} onChange={e => { setDirty(true); setLinks(all => all.map((n, i) => i === index ? { ...n, crimeTentado: e.target.value === "unknown" ? null : e.target.value === "true" } : n)) }}>
          <option value="unknown">Não informada</option><option value="true">Tentado</option><option value="false">Consumado</option>
        </select></label>
        <Button variant="outline" disabled={links.length === 1} onClick={() => { setDirty(true); setLinks(all => all.filter((_, i) => i !== index)) }} aria-label={`Remover natureza ${index + 1}`}>Remover</Button>
      </div>)}
      <Button variant="outline" disabled={links.length >= 100} onClick={() => { setDirty(true); setLinks(all => [...all, { naturezaId: "", crimeTentado: null }]) }}>Adicionar natureza</Button>
      {error("naturezas") && <p role="alert">{error("naturezas")}</p>}
    </fieldset>
    {error("coordenadas") && <p role="alert">{error("coordenadas")}</p>}
    <TerritorialFeedback latitude={draft.latitude} longitude={draft.longitude} regionId={draft.raId} synthetic={synthetic} onResult={setTerritory} />
    {geoError && <p role="alert">{geoError}</p>}
    <details><summary>Ajustar localização no mapa (opcional)</summary>
      <p>O mapa não comprova a localização oficial no DF. Coordenadas sem persistência.</p>
      <LocationPicker latitude={Number(draft.latitude) || -15.79} longitude={Number(draft.longitude) || -47.88} onChange={(latitude, longitude) => {
        if (!busy) { change("latitude", latitude.toFixed(6)); change("longitude", longitude.toFixed(6)) }
      }} />
    </details>
    {editing && <label htmlFor={`${prefix}-reason`}>Justificativa da edição *<textarea id={`${prefix}-reason`} aria-label="Justificativa da edição *" maxLength={500} value={reason} disabled={busy} onChange={e => { setDirty(true); setReason(e.target.value) }} aria-invalid={Boolean(error("justificativa"))} />{error("justificativa") && <small role="alert">{error("justificativa")}</small>}</label>}
    <div className={styles.actions}><Button type="submit" disabled={busy || !catalogs.regions.length || !catalogs.natures.length}>{busy ? "Simulando…" : editing ? "Simular edição" : "Simular cadastro"}</Button>
      <Button variant="outline" disabled={busy} onClick={() => dirty ? setCancel(true) : onCancel()}>Cancelar</Button></div>
    {cancel && <Dialog title="Descartar preenchimento?" onClose={() => setCancel(false)}><h2>Descartar preenchimento?</h2><p>Nenhum dado foi gravado. Os valores deste formulário serão descartados.</p><Button onClick={onCancel}>Descartar</Button><Button variant="outline" onClick={() => setCancel(false)}>Continuar preenchendo</Button></Dialog>}
  </form>
}

export default function SimulationWorkspace({ initial, startCreate = false }: { initial?: SimulationRecord; startCreate?: boolean }) {
  const { role } = useOperations()
  const prefix = useId()
  const [synthetic, setSynthetic] = useState(false)
  const [record, setRecord] = useState(initial)
  const [mode, setMode] = useState<"view" | "create" | "edit">(startCreate ? "create" : "view")
  const [revision, setRevision] = useState(0)
  const [scenario, setScenario] = useState<SimulationScenario>("normal")
  const [message, setMessage] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const [inactivation, setInactivation] = useState(false)
  const [reason, setReason] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const load = useCallback(async (signal: AbortSignal) => {
    const [r, n] = await Promise.all([readCatalog("regioes", signal), readCatalog("naturezas", signal)])
    return { regions: r.items.map(item => ({ id: item.id, nome: "nome" in item ? item.nome : "" })), natures: n.items.map(item => ({ id: item.id, descricao: "descricao" in item ? item.descricao : "" })) }
  }, [])
  const [attempt, setAttempt] = useState(0)
  const read = useRead("simulation-catalogs:" + attempt, load)
  const catalogs = synthetic ? SYNTHETIC_CATALOGS : read.data ?? { regions: [], natures: [] }
  async function execute(operation: SimulationOperation, input: unknown) {
    if (locked.current) return
    locked.current = true; setBusy(true); setMessage(""); setErrors({})
    try {
      await new Promise(resolve => setTimeout(resolve, 200))
      const result = simulateOccurrence(role, operation, input, catalogs, operation === "create" ? undefined : record, scenario)
      setMessage(result.message)
      if (result.success) { setRecord(result.preview); setMode("view"); setInactivation(false); setRevision(n => n + 1) }
      else setErrors(result.errors)
    } finally { locked.current = false; setBusy(false) }
  }
  function cancel() { setMode("view"); setErrors({}); setMessage("Preenchimento cancelado. Nenhuma alteração foi aplicada."); setRevision(n => n + 1) }
  return <section className={styles.workspace} aria-label="Simulação de ocorrências">
    <h2>Área de simulação · sem gravação</h2>
    <p>Prévia separada da consulta real. Nenhuma operação desta área grava no PostgreSQL ou no sandbox. Valores são descartados ao sair ou recarregar.</p>
    {!initial && <div className={styles.actions}><Button variant="outline" disabled={busy} onClick={() => { setSynthetic(!synthetic); setRecord(undefined); setMode(startCreate ? "create" : "view"); setMessage(""); setErrors({}); setRevision(n => n + 1) }}>{synthetic ? "Usar catálogos persistentes (GET)" : "Usar cenário sintético explícito"}</Button>
      {synthetic && <label>Cenário do registro<select aria-label="Cenário do registro" disabled={busy} defaultValue="" onChange={e => {
        if (e.target.value) { setRecord(syntheticRecord(e.target.value as "regular" | "review" | "inactive")); setMode("view"); setMessage(""); setErrors({}); setRevision(n => n + 1) }
      }}><option value="">Selecione uma fixture sintética</option><option value="regular">Regular elegível</option><option value="review">Em revisão</option><option value="inactive">Inativa</option></select></label>}</div>}
    <p role="note">{synthetic ? "Origem: catálogos SINTÉTICOS selecionados explicitamente; IDs de ensaio." : "Origem dos catálogos: endpoints GET persistentes. Nenhum mock automático."}</p>
    {!synthetic && <div aria-live="polite">{read.loading ? "Carregando catálogos…" : read.error ? <><p role="alert">Catálogos indisponíveis. Nenhum dado sintético foi carregado automaticamente.</p><Button variant="outline" onClick={() => setAttempt(n => n + 1)}>Tentar catálogos novamente</Button></> : (!catalogs.regions.length || !catalogs.natures.length) ? "Catálogo persistente vazio. Cadastro e edição indisponíveis até selecionar referências válidas." : "Catálogos persistentes disponíveis."}</div>}
    {record && <div className={styles.identity}><strong>Identificação da prévia: {record.id}</strong><p>Versão esperada: {record.versao} · {record.ativo ? "Ativa" : "Inativa"} · {record.consolidacaoStatus} · origem {record.origem}</p><p>{record.values.local}</p><p>{initial ? "Cópia para simulação de um resultado GET. O registro original não será alterado." : "Registro demonstrativo isolado da lista persistente."}</p></div>}
    <label htmlFor={`${prefix}-outcome`}>Resultado de homologação<select id={`${prefix}-outcome`} aria-label="Resultado de homologação" disabled={busy} value={scenario} onChange={e => setScenario(e.target.value as SimulationScenario)}>
      <option value="normal">Fluxo normal demonstrativo</option><option value="conflict">Conflito de versão (edição/inativação)</option><option value="unavailable">Indisponibilidade simulada</option><option value="denied">Acesso negado simulado</option></select></label>
    <div aria-live="polite" role={Object.keys(errors).length ? "alert" : "status"}>{message}</div>
    {mode === "view" && <div className={styles.actions}>
      {simulationAllowed(role, "create") && !initial && <Button onClick={() => { setMode("create"); setMessage(""); setErrors({}) }}>Preencher novo cadastro</Button>}
      {record && <><Button disabled={!simulationAllowed(role, "edit") || !simulationEligible(record)} onClick={() => { setMode("edit"); setMessage(""); setErrors({}) }}>Editar prévia demonstrativa</Button>
        <Button variant="outline" disabled={!simulationAllowed(role, "inactivate") || !simulationEligible(record)} onClick={() => { setReason(""); setConfirmed(false); setMessage(""); setInactivation(true) }}>Inativar prévia demonstrativa</Button></>}
    </div>}
    {record && (!simulationEligible(record) || !simulationAllowed(role, "edit")) && <p>A prévia de edição e inativação exige um perfil autorizado e uma ocorrência manual, ativa e consolidada.</p>}
    {mode !== "view" && (simulationAllowed(role, mode === "create" ? "create" : "edit") ? <DraftForm synthetic={synthetic} key={mode + revision + synthetic} initial={mode === "edit" ? record : undefined} editing={mode === "edit"} catalogs={catalogs} busy={busy} errors={errors} onCancel={cancel} onSubmit={(values, reason) => execute(mode === "create" ? "create" : "edit", mode === "create" ? values : { versaoEsperada: record?.versao, justificativa: reason, alteracoes: values })} /> : <p role="alert">Seu perfil não permite este formulário.</p>)}
    {inactivation && record && <Dialog title="Simular inativação lógica" onClose={() => { if (!locked.current) setInactivation(false) }}>
      <div className={styles.form}><h2>Simular inativação lógica</h2><p>Ocorrência {record.id} · versão {record.versao}. Nenhum dado será alterado no banco.</p>
        <label htmlFor={`${prefix}-inactive-reason`}>Justificativa obrigatória<textarea id={`${prefix}-inactive-reason`} disabled={busy} value={reason} maxLength={500} onChange={e => setReason(e.target.value)} aria-invalid={Boolean(errors.motivo)} /></label>{errors.motivo && <p role="alert">{errors.motivo}</p>}
        <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />Confirmo que desejo somente simular a inativação.</label>
        <p role="status">{message}</p><div className={styles.actions}><Button disabled={busy || !confirmed} onClick={() => execute("inactivate", { versaoEsperada: record.versao, motivo: reason })}>{busy ? "Simulando…" : "Confirmar simulação de inativação"}</Button><Button variant="outline" disabled={busy} onClick={() => setInactivation(false)}>Cancelar inativação</Button></div>
      </div>
    </Dialog>}
  </section>
}
