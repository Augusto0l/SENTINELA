"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/button";
import { generalDetail, generalHistory, generalImportPath, type generalAttempt } from "@/contracts/general-import";
import { directHistory, type directHistoryItem } from "@/contracts/pcdf-direct";
import type { z } from "zod";
import { PcdfHttpError, requestPcdf, usePcdfQuery } from "./pcdf-client";
import { callDirectPcdf } from "./pcdf-intake-client";
import { StoredPcdfRows } from "./DirectPcdf";
import { Fields, ImportDialog, Pager, formatCount, formatMonth, pageSize } from "./ImportUi";
import ImportedFileActions from "./ImportedFileActions";
import files from "./ImportedFiles.module.css";
import styles from "./ImportWorkflow.module.css";

type GeneralAttempt = z.infer<typeof generalAttempt>;
type PcdfAttempt = z.infer<typeof directHistoryItem>;
type Entry = {
  request: string; name: string; type: "CSV" | "XLSX" | "PCDF"; date?: string;
  status: PcdfAttempt["status"]; actor?: string; lot?: string | null; run?: string | null; inativada?: true;
  persisted?: number; issues?: number | null; received?: number; hash?: string; manifest?: string | null;
  month?: string; sheet?: string;
};
type FileReviewActions = (entry: { id: string; arquivo: string; competencia: string }) => void;

const statusLabels: Record<Entry["status"], string> = {
  recebida: "Recebida", concluida: "Concluída", reenvio: "Reenvio", falhou: "Falhou",
};

function generalEntry(item: GeneralAttempt): Entry {
  return {
    request: item.request, name: item.name, type: item.format === "csv" ? "CSV" : "XLSX", date: item.created,
    status: item.receipt?.replay ? "reenvio" : item.status, actor: item.actor, sheet: item.sheet, inativada: item.inativada,
    lot: item.receipt?.lot, run: item.receipt?.run, persisted: item.receipt?.persisted,
    received: item.receipt?.summary.total, issues: item.receipt?.summary.issues,
  };
}

function pcdfEntry(item: PcdfAttempt): Entry {
  const committed = item.status === "concluida" || item.status === "reenvio";
  return {
    request: item.request, name: item.name, type: "PCDF", date: item.at, status: item.status,
    actor: item.role, lot: item.lot, run: item.run, inativada: item.inativada,
    persisted: committed ? item.persisted : item.status === "falhou" ? 0 : undefined,
    received: item.records, issues: committed ? item.issues : undefined,
    hash: item.sha256, manifest: item.manifestSha, month: item.month,
  };
}

type HistoryError = { source: "CSV/XLSX" | "PCDF"; message: string; status?: number };

export function useImportHistory(enabled: boolean, includePcdf: boolean, revision: number) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; entries: Entry[]; errors: HistoryError[]; connected: boolean }>();
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
      const entries: Entry[] = [], errors: HistoryError[] = [];
      responses.forEach((response, index) => {
        if (response.status === "fulfilled") entries.push(...response.value);
        else errors.push({
          source: index === 0 ? "CSV/XLSX" : "PCDF",
          message: response.reason instanceof Error ? response.reason.message : "Histórico indisponível.",
          status: response.reason instanceof PcdfHttpError ? response.reason.status : undefined,
        });
      });
      entries.sort((a, b) => Date.parse(b.date ?? "") - Date.parse(a.date ?? ""));
      setResult({ key, entries, errors, connected: errors.length < responses.length });
    });
    return () => controller.abort();
  }, [enabled, includePcdf, key]);
  const current = enabled && result?.key === key ? result : undefined;
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

export function ImportEntryDetails({ entry, history, onClose }: { entry: Entry; history?: Entry[]; onClose: () => void }) {
  const [records, setRecords] = useState(false);
  const reconciled = entry.status === "concluida" || entry.status === "reenvio";
  return <ImportDialog title="Detalhes da importação" onClose={onClose}>
    <p className={styles.breakWord}><strong>{entry.name}</strong></p>
    <Fields items={[
      { label: "Tipo", value: entry.type }, { label: "Situação", value: statusLabels[entry.status] },
      ...(entry.inativada ? [{ label: "Estado do lote", value: "Inativado" }] : []),
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
    {!!history?.length && <section className={styles.recordGroup}>
      <h3>Histórico da importação</h3>
      <ul>{history.map(attempt => <li key={attempt.request}>
        {statusLabels[attempt.status]}
        {attempt.date && Number.isFinite(Date.parse(attempt.date)) && <> · <time dateTime={attempt.date}>{sentAt.format(new Date(attempt.date))}</time></>}
        {attempt.actor && " · " + attempt.actor}
      </li>)}</ul>
    </section>}
    {entry.run && <div className={styles.recordGroup}>
      <Button variant="outline" aria-expanded={records} onClick={() => setRecords(!records)}>
        {records ? "Ocultar registros importados" : "Abrir registros importados"}
      </Button>
      {records && (entry.type === "PCDF" ? <StoredPcdfRows run={entry.run} /> : <GeneralRecords run={entry.run} />)}
    </div>}
  </ImportDialog>;
}

export function ImportedFilesHeading({ reload }: { reload: () => void }) {
  return <header className={files.heading}>
    <div>
      <h2>Arquivos importados</h2>
      <p>Consulte e gerencie o histórico de importações realizadas no SENTINELA.</p>
    </div>
    <Button variant="outline" size="sm" onClick={reload}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M20 4v5h-5M4 20v-5h5M4.5 10A8 8 0 0 1 18 6l2 3M4 15l2 3a8 8 0 0 0 13.5-4" />
      </svg>
      Atualizar histórico
    </Button>
  </header>;
}

const sentAt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo",
});

export default function ImportHistory({ current, reload, inOccurrences = false, managementNotice, onReview, onPurgePreview }:
  Pick<ReturnType<typeof useImportHistory>, "current" | "reload"> & {
    inOccurrences?: boolean; managementNotice?: string; onReview?: FileReviewActions; onPurgePreview?: (id: string) => void;
  }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Entry>();
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const entries = current?.entries.filter(entry =>
    (!type || entry.type === type) && (!status || entry.status === status)
    && entry.name.toLocaleLowerCase("pt-BR").includes(term)) ?? [];
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(entries.length / pageSize)));
  const visible = inOccurrences ? entries.slice((visiblePage - 1) * pageSize, visiblePage * pageSize) : entries;
  const selectedHistory = selected?.lot ? current?.entries.filter(entry => entry.lot === selected.lot) : selected && [selected];
  const columns = ["Arquivo", "Tipo", "Data de envio", "Persistidos", "Pendências", "Situação", inOccurrences ? "Ações" : "Detalhes"];
  const numeric = inOccurrences ? files.numeric : undefined;
  return <section className={inOccurrences ? files.card : styles.panel}
    aria-label={inOccurrences ? "Histórico de importações" : undefined}
    aria-labelledby={inOccurrences ? undefined : "import-history-heading"}>
    {inOccurrences ? <ImportedFilesHeading reload={reload} /> : <div className={styles.sectionHead}>
      <div><h2 id="import-history-heading">Histórico de importações</h2><p>Consulte o resultado das importações gravadas no PostgreSQL.</p></div>
      <Button variant="outline" onClick={reload}>Atualizar histórico</Button>
    </div>}
    {inOccurrences && managementNotice && <p className={files.feedback} id="import-management-blocked">{managementNotice}</p>}
    <div className={inOccurrences ? files.filters : styles.historyFilters}>
      <label>Buscar pelo nome<input type="search" placeholder="Nome do arquivo" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      <label>Tipo<select aria-label="Tipo" value={type} onChange={event => { setType(event.target.value); setPage(1); }}>
        <option value="">Todos os tipos</option><option value="PCDF">PCDF</option><option>CSV</option><option>XLSX</option>
      </select></label>
      <label>Situação<select aria-label="Situação" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
        <option value="">Todas as situações</option>
        {Object.entries(statusLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
      </select></label>
    </div>
    {!current && <p role="status" className={inOccurrences ? files.feedback : undefined}>
      {inOccurrences ? "Carregando histórico de importações…" : "Consultando o PostgreSQL…"}
    </p>}
    {current?.errors.map(error => <p role="alert" className={inOccurrences ? files.feedback : styles.feedbackError}
      key={error.source}>{error.source} · {error.message}</p>)}
    {inOccurrences && current && (entries.length > 0 || !current.errors.length) && <p className={files.results} role="status">
      {formatCount(entries.length)} {entries.length === 1 ? "importação encontrada" : "importações encontradas"}
    </p>}
    {current && !current.errors.length && entries.length === 0 &&
      <p className={inOccurrences ? files.feedback : styles.emptyState}>
        {current.entries.length ? "Nenhuma importação corresponde aos filtros." : "Nenhuma importação registrada."}
      </p>}
    {visible.length > 0 && <div className={inOccurrences ? files.table : styles.previewTable} role="region" aria-label="Importações registradas" tabIndex={0}>
      <table role={inOccurrences ? "table" : undefined}>
        <thead><tr>{columns.map(label =>
          <th scope="col" className={label === "Persistidos" || label === "Pendências" ? numeric : undefined} key={label}>{label}</th>)}</tr></thead>
        <tbody>{visible.map(entry => {
          const persistedLot = !entry.inativada && (entry.status === "concluida" || entry.status === "reenvio") ? entry.lot : undefined;
          const lot = entry.type === "PCDF" && persistedLot && entry.month
            ? { id: persistedLot, arquivo: entry.name, competencia: entry.month } : undefined;
          const reason = onReview && !lot ? "A consulta administrativa requer um lote PCDF ativo com envio concluído." : managementNotice;
          const purgeReason = onPurgePreview && !persistedLot ? "A prévia requer um lote ativo com envio concluído." : managementNotice;
          return <tr key={entry.type + entry.request}>
          <th scope="row" data-label="Arquivo"><strong>{entry.name}</strong>{entry.month && <small>{formatMonth(entry.month)}</small>}</th>
          <td data-label="Tipo">{entry.type}</td>
          <td data-label="Data de envio">{entry.date && (!inOccurrences || Number.isFinite(Date.parse(entry.date)))
            ? inOccurrences ? <time dateTime={entry.date}>{sentAt.format(new Date(entry.date))}</time>
              : new Date(entry.date).toLocaleString("pt-BR")
            : "—"}</td>
          <td data-label="Persistidos" className={numeric}>{entry.persisted === undefined ? "—" : formatCount(entry.persisted)}</td>
          <td data-label="Pendências" className={numeric}>{entry.issues == null ? "—" : formatCount(entry.issues)}</td>
          <td data-label="Situação"><span data-status={entry.status} className={inOccurrences ? files.badge
            : entry.status === "falhou" ? styles.errorText : entry.status === "concluida" ? styles.goodText : styles.warningText}>
            {statusLabels[entry.status]}</span>{entry.inativada && <small>Lote inativado</small>}</td>
          {inOccurrences ? <td data-label="Ações"><ImportedFileActions name={entry.name} onDetails={() => setSelected(entry)}
            edit={lot && onReview ? () => onReview(lot) : reason}
            remove={persistedLot && onPurgePreview ? () => onPurgePreview(persistedLot) : purgeReason}
            blockDescription={!onReview && managementNotice ? "import-management-blocked" : undefined} /></td>
            : <td data-label="Detalhes"><button type="button" className={styles.textButton} onClick={() => setSelected(entry)}
              aria-label={"Ver detalhes de " + entry.name}>Ver detalhes</button></td>}
        </tr>})}</tbody>
      </table>
    </div>}
    {inOccurrences && entries.length > 0 && <Pager page={visiblePage} total={entries.length} onChange={setPage}
      label="Paginação de importações" />}
    {selected && <ImportEntryDetails entry={selected} history={inOccurrences ? selectedHistory : undefined}
      onClose={() => setSelected(undefined)} />}
  </section>;
}
