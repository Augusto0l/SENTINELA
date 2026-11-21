"use client"

import { useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import { z } from "zod"
import Header from "@/components/Header"
import Button from "@/components/ui/button"
import { pcdfImportPath, pcdfLot, pcdfPromotion, pcdfUpload } from "@/contracts/pcdf-workspace"
import { requestPcdf, usePcdfQuery } from "./pcdf-client"
import screen from "@/features/Occurrences.module.css"
import styles from "@/features/occurrences/SimulationWorkspace.module.css"

const lots = z.array(pcdfLot)

export default function PersistentPcdf({ persistent = false, xlsxEnabled = false, generalAvailable = false }: {
  persistent?: boolean; xlsxEnabled?: boolean; generalAvailable?: boolean
}) {
  const { current, reload } = usePcdfQuery(pcdfImportPath, lots)
  const operation = useRef(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>()
  const formats = xlsxEnabled ? "CSV ou XLSX" : "CSV"
  async function run(action: () => Promise<string>) {
    if (operation.current) return
    operation.current = true
    setBusy(true)
    setFeedback(undefined)
    try {
      setFeedback({ text: await action() })
      reload()
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : "Operação indisponível.", error: true })
    } finally {
      operation.current = false
      setBusy(false)
    }
  }

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const file = form.get("file")
    if (!(file instanceof File) || !file.size) return setFeedback({ error: true, text: `Selecione um arquivo ${formats}.` })
    const xlsx = xlsxEnabled && file.name.toLowerCase().endsWith(".xlsx")
    if (xlsxEnabled && !file.name.toLowerCase().endsWith(".csv") && !xlsx)
      return setFeedback({ error: true, text: `Use um arquivo ${formats}.` })
    if (file.size > 16 * 1024 * 1024) return setFeedback({ error: true, text: "O arquivo excede 16 MiB." })
    const parameters = new URLSearchParams({ competencia: String(form.get("competencia")) })
    void run(async () => {
      const result = await requestPcdf(pcdfImportPath + "?" + parameters, pcdfUpload, {
        method: "POST", headers: { "Content-Type": xlsx
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv" }, body: file,
      })
      return result.replay ? "Arquivo já recebido. O lote anterior foi preservado."
        : `${result.records} linhas em staging e ${result.issues} pendências detectadas.`
    })
  }

  return <div className={screen.screen}>
    <Header title="Importar dados" subtitle={persistent ? "PCDF sintético em PostgreSQL local" : "PCDF em PostgreSQL descartável"} />
    <div className={screen.content}>
      <section className={styles.workspace}>
        {generalAvailable && <Link href="/importar">Voltar à importação geral</Link>}
        <h2>Receber {formats} sintético</h2>
        <p>Use a fixture PCDF de 34 colunas. O arquivo e os valores de origem ficam {persistent ? "na homologação local" : "no cluster descartável"}.
          {xlsxEnabled && " No XLSX, use uma aba e preencha os campos originais como texto para preservar os zeros."}</p>
        <form onSubmit={upload}>
          <fieldset disabled={busy} className={styles.grid}>
            <label>Competência<input name="competencia" type="month" required /></label>
            <label>Arquivo {formats}<input name="file" type="file" accept={xlsxEnabled ? ".csv,.xlsx" : ".csv,text/csv"} required /></label>
          </fieldset>
          <Button disabled={busy} type="submit">{busy ? "Processando…" : xlsxEnabled ? "Enviar arquivo" : "Enviar CSV"}</Button>
        </form>
        {feedback && <p role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
      </section>
      <section className={styles.workspace}>
        <h2>Histórico de lotes</h2>
        {!current && <p role="status">Carregando lotes…</p>}
        {current?.error && <p role="alert">{current.error} <Button variant="outline" onClick={reload}>Tentar novamente</Button></p>}
        {current?.data?.length === 0 && <p>Nenhum lote recebido.</p>}
        {current?.data?.length === 100 && <p>Últimos 100 lotes.</p>}
        {current?.data?.map(lot => <article key={lot.lot} className={styles.identity}>
          <h3>{lot.month} · {lot.lot}</h3>
          <p>{lot.rows} linhas · {lot.consolidated} consolidadas · {lot.issues} diagnósticos na recepção</p>
          {lot.rows > lot.consolidated && <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
            const result = await requestPcdf(pcdfImportPath + "/" + lot.run + "/consolidacao", pcdfPromotion, { method: "POST" })
            return `${result.occurrencesCreated} novas ocorrências, ${result.associationsCreated} novas associações e ${result.pending} linhas ainda pendentes.`
          })}>Consolidar grupos aprovados</Button>}
        </article>)}
      </section>
    </div>
  </div>
}
