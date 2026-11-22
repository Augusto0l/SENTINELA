"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/button";
import { generalDetail, generalHistory, generalImportPath, type generalAttempt } from "@/contracts/general-import";
import { directHistory, type directHistoryItem } from "@/contracts/pcdf-direct";
import type { z } from "zod";
import { requestPcdf, usePcdfQuery } from "./pcdf-client";
import { callDirectPcdf } from "./pcdf-intake-client";
import { StoredPcdfRows } from "./DirectPcdf";
import { Fields, ImportDialog, Pager, formatCount, formatMonth } from "./ImportUi";
import styles from "./ImportWorkflow.module.css";

type GeneralAttempt = z.infer<typeof generalAttempt>;
type PcdfAttempt = z.infer<typeof directHistoryItem>;
type Entry = {
  request: string; name: string; type: "CSV" | "XLSX" | "PCDF"; date?: string;
  status: PcdfAttempt["status"]; actor?: string; lot?: string | null; run?: string | null;
  persisted?: number; issues?: number | null; received?: number; hash?: string; manifest?: string | null;
  month?: string; sheet?: string;
};

const statusLabels: Record<Entry["status"], string> = {
  recebida: "Recebida", concluida: "Concluída", reenvio: "Reenvio", falhou: "Falhou",
};

function generalEntry(item: GeneralAttempt): Entry {
  return {
    request: item.request, name: item.name, type: item.format === "csv" ? "CSV" : "XLSX", date: item.created,
    status: item.receipt?.replay ? "reenvio" : item.status, actor: item.actor, sheet: item.sheet,
    lot: item.receipt?.lot, run: item.receipt?.run, persisted: item.receipt?.persisted,
    received: item.receipt?.summary.total, issues: item.receipt?.summary.issues,
  };
}

function pcdfEntry(item: PcdfAttempt): Entry {
  const committed = item.status === "concluida" || item.status === "reenvio";
  return {
    request: item.request, name: item.name, type: "PCDF", date: item.at, status: item.status,
    actor: item.role, lot: item.lot, run: item.run,
    persisted: committed ? item.persisted : item.status === "falhou" ? 0 : undefined,
    received: item.records, issues: committed ? item.issues : undefined,
    hash: item.sha256, manifest: item.manifestSha, month: item.month,
  };
}

export function useImportHistory(enabled: boolean, includePcdf: boolean, revision: number) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; entries: Entry[]; errors: string[] }>();
  const key = revision + ":" + attempt;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]);
    const general = requestPcdf(generalImportPath, generalHistory, { signal }).then(list => list.map(generalEntry));
    const requests = includePcdf
      ? [general, callDirectPcdf(directHistory, "", undefined, signal).then(list => list.map(pcdfEntry))]
      : [general];
    void Promise.allSettled(requests).then(responses => {
      if (controller.signal.aborted) return;
      const entries: Entry[] = [], errors: string[] = [];
      responses.forEach((response, index) => {
        if (response.status === "fulfilled") entries.push(...response.value);
        else errors.push((index === 0 ? "CSV/XLSX" : "PCDF") + " · " +
          (response.reason instanceof Error ? response.reason.message : "Histórico indisponível."));
      });
      entries.sort((a, b) => Date.parse(b.date ?? "") - Date.parse(a.date ?? ""));
      setResult({ key, entries, errors });
    });
    return () => controller.abort();
  }, [enabled, includePcdf, key]);
  const current = result?.key === key ? result : undefined;
  return {
    current,
    reload: () => setAttempt(value => value + 1),
  };
}

function GeneralRecords({ run }: { run: string }) {
  const [page, setPage] = useState(1);
  const { current, reload } = usePcdfQuery(generalImportPath + "/" + run + "?pagina=" + page, generalDetail);
  if (current?.error) return <p role="alert">{current.error} <Button variant="outline" onClick={reload}>Tentar novamente</Button></p>;
  if (!current?.data) return <p role="status">Consultando registros gravados…</p>;
  const { total, headers, rows } = current.data;
  return <>
    <div role="region" aria-label="Registros gerais gravados">
      {rows.map(row => <details className={styles.disclosure} key={row.line}>
        <summary>Registro {row.line} · {row.status === "valido" ? "Sem avisos" : row.status === "pendente" ? "Com pendências" : "Inválido"}</summary>
        <Fields items={row.cells.map((cell, i) => ({
          label: headers[i] || "Coluna " + (i + 1),
          value: cell.formula ? <>{cell.value ?? ""}<small>Fórmula original <code>{cell.formula}</code></small></>
            : cell.value === null ? null : String(cell.value),
        }))} />
        {row.issues.length > 0 && <ul>{row.issues.map((issue, i) => <li key={i}>{issue.message}</li>)}</ul>}
        {row.duplicateOf !== undefined && <p>Possível duplicata do registro {row.duplicateOf}.</p>}
      </details>)}
    </div>
    <Pager page={page} total={total} onChange={setPage} label="Paginação do histórico" />
  </>;
}

export function ImportEntryDetails({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const [records, setRecords] = useState(false);
  const reconciled = entry.status === "concluida" || entry.status === "reenvio";
  return <ImportDialog title="Detalhes da importação" onClose={onClose}>
    <p className={styles.breakWord}><strong>{entry.name}</strong></p>
    <Fields items={[
      { label: "Tipo", value: entry.type }, { label: "Situação", value: statusLabels[entry.status] },
      { label: "Competência", value: entry.month ? formatMonth(entry.month) : "Não se aplica" },
      { label: "Recebidos", value: entry.received === undefined ? "Não informado" : formatCount(entry.received) },
      { label: "Persistidos", value: entry.persisted === undefined ? "Não informado" : formatCount(entry.persisted) },
      { label: "Pendências", value: entry.issues == null ? "Não informado" : formatCount(entry.issues) },
      { label: "Reconciliação", value: reconciled ? "Conferida" : "Sem confirmação" },
      { label: "Proveniência", value: entry.type === "PCDF" ? entry.manifest ? "Identidade conferida com o manifesto técnico" : "Identidade declarada no CSV" : "Planilha " + entry.sheet },
      ...(entry.actor ? [{ label: "Perfil", value: entry.actor }] : []),
      ...(entry.date ? [{ label: "Data e hora", value: new Date(entry.date).toLocaleString("pt-BR") }] : []),
      ...(entry.request ? [{ label: "Referência de auditoria", value: entry.request }] : []),
      { label: "Lote", value: entry.lot }, { label: "Execução", value: entry.run },
      { label: "SHA-256 do arquivo", value: entry.hash ?? "Não informado pelo histórico geral" },
      ...(entry.manifest ? [{ label: "SHA-256 do manifesto", value: entry.manifest }] : []),
    ]} />
    {entry.run && <div className={styles.recordGroup}>
      <Button variant="outline" aria-expanded={records} onClick={() => setRecords(!records)}>
        {records ? "Ocultar registros importados" : "Abrir registros importados"}
      </Button>
      {records && (entry.type === "PCDF" ? <StoredPcdfRows run={entry.run} /> : <GeneralRecords run={entry.run} />)}
    </div>}
  </ImportDialog>;
}

export default function ImportHistory({ current, reload }: Pick<ReturnType<typeof useImportHistory>, "current" | "reload">) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Entry>();
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const entries = current?.entries.filter(entry =>
    (!type || entry.type === type) && (!status || entry.status === status)
    && entry.name.toLocaleLowerCase("pt-BR").includes(term)) ?? [];
  return <section className={styles.panel} aria-labelledby="import-history-heading">
    <div className={styles.sectionHead}>
      <div><h2 id="import-history-heading">Histórico de importações</h2><p>Consulte o resultado das importações gravadas no PostgreSQL.</p></div>
      <Button variant="outline" onClick={reload}>Atualizar histórico</Button>
    </div>
    <div className={styles.historyFilters}>
      <label>Buscar pelo nome<input type="search" placeholder="Nome do arquivo" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label>Tipo<select aria-label="Tipo" value={type} onChange={event => setType(event.target.value)}>
        <option value="">Todos os tipos</option><option value="PCDF">PCDF v1.0</option><option>CSV</option><option>XLSX</option>
      </select></label>
      <label>Situação<select aria-label="Situação" value={status} onChange={event => setStatus(event.target.value)}>
        <option value="">Todas as situações</option>
        {Object.entries(statusLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
      </select></label>
    </div>
    {!current && <p role="status">Consultando o PostgreSQL…</p>}
    {current?.errors.map(error => <p role="alert" className={styles.feedbackError} key={error}>{error}</p>)}
    {current && !current.errors.length && entries.length === 0 &&
      <p className={styles.emptyState}>{current.entries.length ? "Nenhuma importação corresponde aos filtros." : "Nenhuma importação registrada."}</p>}
    {entries.length > 0 && <div className={styles.previewTable} role="region" aria-label="Importações registradas" tabIndex={0}>
      <table>
        <thead><tr>{["Arquivo", "Tipo", "Data de envio", "Persistidos", "Pendências", "Situação", "Detalhes"].map(label =>
          <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{entries.map(entry => <tr key={entry.type + entry.request}>
          <th scope="row" data-label="Arquivo"><strong>{entry.name}</strong>{entry.month && <small>{formatMonth(entry.month)}</small>}</th>
          <td data-label="Tipo">{entry.type}</td>
          <td data-label="Data de envio">{entry.date ? new Date(entry.date).toLocaleString("pt-BR") : "—"}</td>
          <td data-label="Persistidos">{entry.persisted === undefined ? "—" : formatCount(entry.persisted)}</td>
          <td data-label="Pendências">{entry.issues == null ? "—" : formatCount(entry.issues)}</td>
          <td data-label="Situação"><span className={entry.status === "falhou" ? styles.errorText : entry.status === "concluida" ? styles.goodText : styles.warningText}>
            {statusLabels[entry.status]}</span></td>
          <td data-label="Detalhes"><button type="button" className={styles.textButton} onClick={() => setSelected(entry)}
            aria-label={"Ver detalhes de " + entry.name}>Ver detalhes</button></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {selected && <ImportEntryDetails entry={selected} onClose={() => setSelected(undefined)} />}
  </section>;
}
