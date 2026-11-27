"use client";

import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import Button from "@/components/ui/button";
import { directCsvLimit, historicalMonthCount, historicalPreview, historicalReceipt, historicalStatus } from "@/contracts/pcdf-direct";
import { callDirectPcdf } from "./pcdf-intake-client";
import { PcdfHttpError } from "./pcdf-client";
import styles from "./ImportWorkflow.module.css";

const storageKey = "sentinela-pcdf-fila-historica-v1";
const query = "?modalidade=historico";
const canonicalName = /^pcdf_naturezas_(\d{4}-(?:0[1-9]|1[0-2]))\.csv$/;
const labels = {
  waiting: "Aguardando", validating: "Validando", ready: "Pronto para importar",
  importing: "Importando e consolidando", done: "Concluído", imported: "Já importado",
  review: "Requer revisão", error: "Erro", interrupted: "Interrompido",
} as const;
type Status = keyof typeof labels;
type Month = z.infer<typeof historicalStatus>["items"][number];
type Preview = z.infer<typeof historicalPreview>;
type Entry = { id: string; name: string; month?: string; file?: File; status: Status;
  preview?: Preview; result?: Month; error?: string };
const format = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("pt-BR");
const terminal = new Set<Status>(["done", "imported", "review", "error"]);

export default function PcdfHistoricalQueue({ onComplete }: { onComplete: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [catalog, setCatalog] = useState<z.infer<typeof historicalStatus>>();
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"check" | "import">();
  const [paused, setPaused] = useState(false);
  const stop = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void callDirectPcdf(historicalStatus, query, undefined, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setCatalog(data);
      if (!data.canApprove) return;
      let saved: Record<string, unknown> = {};
      try { saved = JSON.parse(localStorage.getItem(storageKey) ?? sessionStorage.getItem(storageKey) ?? "{}") ?? {}; }
      catch { /* The server still retains committed history. */ }
      const known = data.items.filter(item => typeof saved[item.month] === "string");
      setEntries(current => current.length ? current : known.map(result => {
        const done = result.state === "done";
        const checkpoint = saved[result.month];
        return { id: result.month, name: `pcdf_naturezas_${result.month}.csv`, month: result.month,
          status: done ? "imported" : result.state === "conflict" || checkpoint === "review" ? "review"
            : checkpoint === "error" ? "error" : "interrupted", result };
      }));
    }).catch(failure => { if (!controller.signal.aborted) setMessage((failure as Error).message); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!catalog?.canApprove) return;
    const saved = Object.fromEntries(entries.flatMap(entry => entry.month ? [[entry.month, entry.status]] : []));
    try {
      localStorage.setItem(storageKey, JSON.stringify(saved));
      sessionStorage.removeItem(storageKey);
    }
    catch { /* The server still retains committed history. */ }
  }, [catalog, entries]);

  function select(files: File[]) {
    if (!files.length || mode) return;
    const selected = files.map(file => ({
      id: crypto.randomUUID(), name: file.name, month: canonicalName.exec(file.name)?.[1], file, status: "waiting" as const,
    }));
    setEntries(current => {
      const months = new Set(selected.map(entry => entry.month));
      return [...current.filter(entry => !months.has(entry.month)), ...selected].sort(
        (a, b) => (a.month ?? "9999-99").localeCompare(b.month ?? "9999-99") || a.name.localeCompare(b.name));
    });
    setMessage("");
  }

  function change(id: string, patch: Partial<Entry>) {
    setEntries(current => current.map(entry => entry.id === id ? { ...entry, ...patch } : entry));
  }

  async function processQueue(kind: "check" | "import") {
    if (mode || !catalog?.canApprove) return;
    const work = entries.filter(entry => entry.file && (kind === "import" ? entry.status === "ready"
      : ["waiting", "error", "interrupted"].includes(entry.status)));
    if (!work.length) return;
    stop.current = false;
    setPaused(false);
    setMode(kind);
    setMessage("");
    const digests = new Set(entries.flatMap(entry => entry.preview && ["ready", "done", "imported"].includes(entry.status)
      ? [entry.preview.sha256] : []));
    let changed = false;
    try {
      for (const [index, entry] of work.entries()) {
        if (stop.current) {
          for (const remaining of work.slice(index)) change(remaining.id, { status: "interrupted" });
          break;
        }
        change(entry.id, { status: kind === "check" ? "validating" : "importing", error: undefined });
        try {
          if (!entry.month) throw new Error("Use o nome original pcdf_naturezas_AAAA-MM.csv.");
          if (!entry.file?.size || entry.file.size > directCsvLimit) throw new Error("O CSV deve ter entre 1 byte e 16 MiB.");
          const body = new FormData();
          body.set("csv", entry.file);
          const endpoint = query + "&versao=2.0&etapa=";
          const timeout = AbortSignal.timeout(kind === "import" ? 150000 : 90000);
          if (kind === "check") {
            const preview = await callDirectPcdf(historicalPreview, endpoint + "validar", body, timeout);
            if (preview.state === "done") change(entry.id, { preview, result: preview,
              status: "imported" });
            else if (preview.state === "conflict" || preview.rejected) change(entry.id, { preview, status: "review",
              error: preview.state === "conflict" ? "A competência está ocupada por outro lote." : undefined });
            else if (digests.has(preview.sha256)) change(entry.id, { preview, status: "review", error: "Arquivo repetido na seleção." });
            else { digests.add(preview.sha256); change(entry.id, { preview, status: "ready" }); }
          } else {
            if (!entry.preview) throw new Error("Valide o CSV antes da aprovação.");
            body.set("sha256", entry.preview.sha256);
            const receipt = await callDirectPcdf(historicalReceipt, endpoint + "confirmar", body, timeout);
            changed = true;
            change(entry.id, { result: receipt, status: receipt.review ? "review" : receipt.replay ? "imported" : "done" });
          }
        } catch (failure) {
          const status = failure instanceof PcdfHttpError ? failure.status : undefined;
          change(entry.id, { status: status === 409 || status === 422 ? "review" : status === 503 ||
            status === 401 || status === 403 ? "interrupted" : "error", error: (failure as Error).message });
          if (status === 401 || status === 403) { stop.current = true; setMessage((failure as Error).message); }
        }
      }
      if (kind === "import") {
        const data = await callDirectPcdf(historicalStatus, query);
        setCatalog(data);
        setEntries(current => current.map(row => {
          if (row.status !== "interrupted" || !row.preview) return row;
          const result = data.items.find(item => item.month === row.month && item.sha256 === row.preview?.sha256);
          return result?.state === "done" ? { ...row, result, status: result.review ? "review" : "imported", error: undefined } : row;
        }));
      }
    } catch (failure) { setMessage((failure as Error).message); }
    finally {
      if (changed) onComplete();
      setMode(undefined);
    }
  }

  const finished = entries.filter(entry => terminal.has(entry.status)).length;
  const ready = entries.filter(entry => entry.status === "ready").length;
  const examined = entries.filter(entry => entry.preview || terminal.has(entry.status)).length;
  const completed = catalog?.items.filter(item => item.state === "done") ?? [];
  return <section className={styles.panel} aria-labelledby="pcdf-historical-heading" aria-busy={!!mode}>
    <div className={styles.sectionHead}><h2 id="pcdf-historical-heading">Histórico mensal PCDF</h2></div>
    <p>Selecione os CSVs originais de janeiro de 2021 a agosto de 2026. Valide a seleção antes de aprovar a importação.</p>
    {message && <p role="alert" className={styles.feedbackError}>{message}</p>}
    {!catalog && !message && <p role="status">Consultando competências no PostgreSQL…</p>}
    {catalog && <>
      <p role="status">{catalog.items.length < historicalMonthCount
        ? `${catalog.items.length} de ${historicalMonthCount} competências cadastradas. ${completed.length} com consolidação confirmada na fila histórica. A aprovação está bloqueada enquanto o inventário estiver incompleto.`
        : <>{completed.length} de {historicalMonthCount} competências consolidadas.
          {!catalog.canApprove && " A aprovação exige Administrador com autorização institucional ativa."}</>}</p>
      {catalog.canApprove && <>
        <input ref={input} type="file" hidden accept=".csv,text/csv" multiple onChange={event => {
          select(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = "";
        }} />
        <div className={styles.actions}>
          <Button disabled={!!mode} onClick={() => input.current?.click()}>Selecionar CSVs mensais PCDF</Button>
          <Button variant="outline" disabled={!!mode || !entries.some(entry => entry.file &&
            ["waiting", "error", "interrupted"].includes(entry.status))} onClick={() => void processQueue("check")}>Validar seleção</Button>
          <Button disabled={!!mode || !ready} onClick={() => void processQueue("import")}>Aprovar e importar ({ready})</Button>
          {mode && <Button variant="outline" disabled={paused} onClick={() => {
            stop.current = true; setPaused(true);
          }}>Interromper após o arquivo atual</Button>}
          {!mode && entries.length > 0 && <Button variant="ghost" onClick={() => {
            setEntries([]); setMessage("");
          }}>Cancelar seleção pendente</Button>}
        </div>
      </>}
      {entries.length > 0 && <>
        <p>{examined} de {entries.length} arquivos analisados · {Math.floor(100 * examined / entries.length)}%</p>
        <p role="status">{finished} de {entries.length} arquivos com resultado · {Math.floor(100 * finished / entries.length)}%</p>
        <progress className={styles.historicalProgress} aria-label="Progresso da fila PCDF" max={entries.length} value={finished} />
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Fila de arquivos PCDF">
          <table className={`${styles.pcdfTable} ${styles.historicalTable}`}>
            <thead><tr><th scope="col">Arquivo</th><th scope="col">Competência</th><th scope="col">Validação e carga</th>
              <th scope="col">Linhas / aceitas / rejeitadas</th><th scope="col">Ocorrências únicas</th><th scope="col">Pendências</th></tr></thead>
            <tbody>{entries.map(entry => <tr key={entry.id}>
              <th scope="row">{entry.name}</th><td>{entry.month ?? "—"}
                {(entry.result ?? entry.preview)?.complete === false && <small> · parcial até {(entry.result ?? entry.preview)?.through}</small>}</td>
              <td><strong>{labels[entry.status]}</strong>
                {entry.error && <p>{entry.error}</p>}
                {entry.preview?.errors.map(error => <p key={`${error.row}-${error.field}-${error.message}`}>Linha {error.row} · {error.field} · {error.message}</p>)}
                {entry.status === "interrupted" && !entry.file && <p>Selecione o CSV novamente para retomar.</p>}
                {(entry.result?.review ?? 0) > 0 && <p>{format(entry.result?.review)} associações em revisão de identidade.</p>}
                {(entry.status === "validating" || entry.status === "importing")
                  ? <progress className={styles.historicalProgress} aria-label={`Processamento de ${entry.name}`} />
                  : entry.preview && <><p>Validação · 100%</p><progress className={styles.historicalProgress} aria-label={`Validação de ${entry.name}`}
                    max={entry.preview.records} value={entry.preview.accepted + entry.preview.rejected} /></>}
              </td>
              <td>{format((entry.result ?? entry.preview)?.records)} / {format(entry.preview?.accepted ?? entry.result?.records)} / {format(entry.preview?.rejected ?? (entry.result?.state === "done" ? 0 : null))}</td>
              <td>{format(entry.result?.unique)}</td><td>{format(entry.result?.issues ?? entry.preview?.diagnostics)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
      <details><summary>{catalog.items.length === historicalMonthCount ? `Consultar as ${historicalMonthCount} competências` : "Consultar competências cadastradas"}</summary>
        <ul>{catalog.items.map(item => <li key={item.month}>
          {item.month} · {item.state === "done" ? `Consolidada · ${format(item.unique)} ocorrências · lote ${item.lot}`
            : item.state === "staged" ? "Recebida em staging" : item.state === "conflict" ? "Requer revisão" : "Ainda sem importação"}
          {!item.complete && ` · cobertura parcial até ${item.through}`}
        </li>)}</ul>
      </details>
    </>}
  </section>;
}
