"use client"

import { useRef, useState, type FormEvent } from "react"
import { z } from "zod"
import Header from "@/components/Header"
import Button from "@/components/ui/button"
import Dialog from "@/components/ui/dialog"
import { pcdfIssue, pcdfPriorities, pcdfReviewPath } from "@/contracts/pcdf-workspace"
import { requestPcdf, usePcdfQuery } from "./pcdf-client"
import screen from "@/features/Occurrences.module.css"
import styles from "@/features/occurrences/SimulationWorkspace.module.css"

const issueList = z.array(pcdfIssue)
const types: Record<z.infer<typeof pcdfIssue>["type"], string> = { identificacao: "Identificação",
  datas_horarios: "Datas e horários", classificacao: "Classificação", endereco_ra: "Endereço e RA",
  coordenadas: "Coordenadas", informacoes_policiais: "Informações policiais", proveniencia: "Proveniência" }
const labels = { aberta: "Aberta", resolvida: "Resolvida", encerrada_sem_solucao: "Encerrada sem solução" }
const priority = { alta: "Alta", media: "Média", baixa: "Baixa" }

export default function PcdfReview({ canCorrect }: { canCorrect: boolean }) {
  const [query, setQuery] = useState("status=aberta")
  const { current, reload } = usePcdfQuery(pcdfReviewPath + "?" + query, issueList)
  const [selected, setSelected] = useState<z.infer<typeof pcdfIssue>>()
  const [decision, setDecision] = useState<"resolvida" | "encerrada_sem_solucao">("encerrada_sem_solucao")
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>()
  const running = useRef(false)
  const [busy, setBusy] = useState(false)

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parameters = new URLSearchParams()
    for (const [key, value] of new FormData(event.currentTarget)) if (value) parameters.set(key, String(value))
    setQuery(parameters.toString())
  }

  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || running.current) return
    const values = new FormData(event.currentTarget)
    const input = String(values.get("valor") ?? "")
    const value = selected.field === "horario" && /^\d{2}:\d{2}$/.test(input) ? input + ":00" : input
    running.current = true
    setBusy(true)
    setFeedback(undefined)
    try {
      const receipt = await requestPcdf(pcdfReviewPath + "/" + selected.id, pcdfIssue, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao: decision, justificativa: values.get("justificativa"),
          versaoEsperada: selected.version, ...(decision === "resolvida" && { valor: value }) }),
      })
      setSelected(receipt)
      setFeedback({ text: "Decisão registrada no histórico." })
      reload()
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : "Operação indisponível.", error: true })
      reload()
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  return <div className={screen.screen}>
    <Header title="Central de Revisão" subtitle="Pendências PCDF sintéticas" />
    <div className={screen.content}>
      <section className={styles.workspace}>
        <h2>Pendências</h2>
        <form onSubmit={filter}>
          <fieldset className={styles.grid}>
            <label>Tipo<select name="tipo"><option value="">Todos</option>
              {Object.entries(types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
            <label>Prioridade<select name="prioridade"><option value="">Todas</option>
              {pcdfPriorities.map(key => <option key={key} value={key}>{priority[key]}</option>)}
            </select></label>
            <label>Situação<select name="status" defaultValue="aberta"><option value="">Todas</option>
              {Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
          </fieldset>
          <Button type="submit">Aplicar filtros</Button>
        </form>
        {!current && <p role="status">Carregando pendências…</p>}
        {current?.error && <p role="alert">{current.error} <Button variant="outline" onClick={reload}>Tentar novamente</Button></p>}
        {current?.data?.length === 0 && <p>Nenhuma pendência no recorte.</p>}
        {current?.data?.length === 100 && <p>Até 100 resultados, priorizados. Refine os filtros para reduzir a lista.</p>}
        {current?.data?.map(issue => <article className={styles.identity} key={issue.id}>
          <h3>{types[issue.type]} · {issue.field}</h3>
          <p>{priority[issue.priority]} · {labels[issue.status]}</p>
          <Button variant="outline" onClick={() => {
            setSelected(issue)
            setDecision(issue.canResolve ? "resolvida" : "encerrada_sem_solucao")
            setFeedback(undefined)
          }}>Detalhar {issue.field}</Button>
        </article>)}
      </section>
      {selected && <Dialog title="Detalhes da pendência" onClose={() => { if (!busy) setSelected(undefined) }}>
        <div className={styles.workspace}>
          <h2>{types[selected.type]} · {selected.field}</h2>
          <p>{selected.reason}</p>
          <dl className={screen.fields}>
            <div><dt>Original</dt><dd>{selected.original || "Ausente"}</dd></div>
            <div><dt>Normalizado</dt><dd>{selected.normalized || "Ausente"}</dd></div>
            <div><dt>Situação</dt><dd>{labels[selected.status]}</dd></div>
            <div><dt>Versão</dt><dd>{selected.version}</dd></div>
            {selected.occurrenceId && <div><dt>Ocorrência consolidada</dt><dd>{selected.occurrenceId}</dd></div>}
          </dl>
          {selected.history && <>
            <h3>Histórico</h3>
            <p>{selected.history.reason}</p>
            <p>{selected.history.before || "Ausente"} → {selected.history.after || "Ausente"}</p>
            <p>{new Date(selected.history.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {selected.history.author}</p>
          </>}
          {canCorrect && selected.status === "aberta" && <form onSubmit={change}>
            <fieldset disabled={busy}>
              <label>Decisão<select value={decision} onChange={event => setDecision(event.target.value as typeof decision)}>
                {selected.canResolve && <option value="resolvida">Corrigir valor</option>}
                <option value="encerrada_sem_solucao">Encerrar sem solução</option>
              </select></label>
              {decision === "resolvida" && <label>Novo valor{selected.field === "horario"
                ? <input type="time" step="1" name="valor" required />
                : selected.field === "flagrante" ? <select name="valor" defaultValue="" required>
                  <option value="">Selecione</option><option value="true">Sim</option><option value="false">Não</option>
                </select> : <input name="valor" maxLength={240} required />}
              </label>}
              <label>Justificativa<textarea name="justificativa" maxLength={500} required /></label>
            </fieldset>
            <div className={styles.actions}>
              <Button type="submit" disabled={busy}>Confirmar decisão</Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setSelected(undefined)}>Cancelar</Button>
            </div>
          </form>}
          {feedback && <p role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
        </div>
      </Dialog>}
    </div>
  </div>
}
