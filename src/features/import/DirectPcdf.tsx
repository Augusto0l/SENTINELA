"use client";

import { useEffect, useState } from "react";
import type { z } from "zod";
import Header from "@/components/Header";
import Button from "@/components/ui/button";
import { directDetail, directHistory, directPreview, directReceipt } from "@/contracts/pcdf-direct";
import styles from "./ImportWorkflow.module.css";
import { callDirectPcdf as call, confirmPcdf, previewPcdf } from "./pcdf-intake-client";
import { Pager } from "./ImportUi";
import { PcdfRecords } from "./PcdfRecords";

const pageSize = 25;
const total = (value: number) => value.toLocaleString("pt-BR");
const statuses = { recebida: "Recebida", concluida: "Gravada em staging", reenvio: "Reenvio sem duplicação", falhou: "Gravação revertida" };
type EmbeddedPcdf = { file?: File; onSaving?: (saving: boolean) => void; onComplete?: () => void };

export default function DirectPcdf({ file, onSaving, onComplete }: EmbeddedPcdf = {}) {
  const [chosen, setCsv] = useState<File>();
  const csv = file ?? chosen;
  const [manifest, setManifest] = useState<File>();
  const [preview, setPreview] = useState<z.infer<typeof directPreview>>();
  const [receipt, setReceipt] = useState<z.infer<typeof directReceipt>>();
  const [historyRevision, setHistoryRevision] = useState(0);
  const [busy, setBusy] = useState<"validar" | "confirmar" | undefined>(file ? "validar" : undefined);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);

  useEffect(() => {
    if (!file) return;
    const controller = new AbortController();
    void previewPcdf(file, undefined, controller.signal)
      .then(data => { if (!controller.signal.aborted) setPreview(data); },
        failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(undefined); });
    return () => controller.abort();
  }, [file]);

  async function validate(file: File | undefined, technicalManifest: File | undefined) {
    setPreview(undefined);
    setReceipt(undefined);
    setReview(false);
    setError("");
    setPage(1);
    if (!file) return;
    setBusy("validar");
    try { setPreview(await previewPcdf(file, technicalManifest)); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(undefined); }
  }

  async function confirm() {
    if (!csv || !preview || busy || !review) return;
    setBusy("confirmar");
    onSaving?.(true);
    setError("");
    try {
      setReceipt(await confirmPcdf(csv, preview, manifest));
      setReview(false);
    } catch (failure) { setError((failure as Error).message); }
    finally {
      setHistoryRevision(value => value + 1);
      onComplete?.();
      onSaving?.(false);
      setBusy(undefined);
    }
  }

  const offset = (page - 1) * pageSize;
  const pages = preview ? Math.ceil(preview.records.length / pageSize) : 0;
  const contents = <>
        <section className={styles.card} aria-labelledby="pcdf-upload">
          <h2 id="pcdf-upload">{file ? "Validação do CSV PCDF" : "Arquivo mensal"}</h2>
          <p>Os dados recebidos serão armazenados em origem e staging para revisão.</p>
          <div className={styles.mapping}>
            {!file && <label>Arquivo CSV mensal
              <input type="file" accept=".csv,text/csv" disabled={!!busy} onChange={event => {
                const file = event.target.files?.[0];
                setCsv(file);
                void validate(file, manifest);
              }} />
            </label>}
            <label>Manifesto técnico JSON (opcional)
              <input type="file" accept=".json,application/json" disabled={!!busy} onChange={event => {
                const file = event.target.files?.[0];
                setManifest(file);
                void validate(csv, file);
              }} />
            </label>
          </div>
          {busy && <p role="status">{busy === "validar" ? "Validando arquivo PCDF…" : "Gravando em origem e staging…"}</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
        </section>

        {preview && <section className={styles.card} aria-labelledby="pcdf-preview">
          <h2 id="pcdf-preview">Prévia dos registros</h2>
          <p><strong>Layout PCDF v1.0 reconhecido</strong> · {preview.name} · {preview.month}</p>
          <p>{total(preview.records.length)} associações · 34 campos · {total(preview.bytes)} bytes</p>
          <p className={styles.file}>SHA-256 <code>{preview.sha256}</code></p>
          <p>{preview.manifestSha
            ? "Arquivo, contagem e identificadores conferidos com o manifesto."
            : "Proveniência declarada no CSV. O vínculo com o hash do XML pode ser conferido com o manifesto."}</p>
          <details>
            <summary>Campos vazios e avisos da validação</summary>
            <ul>{preview.headers.filter(key => preview.fields[key].empty || preview.fields[key].issues).map(key =>
              <li key={key}>{key} · {total(preview.fields[key].empty)} vazios · {total(preview.fields[key].issues)} avisos</li>)}</ul>
          </details>
          <p id="pcdf-scroll-description">Role a tabela horizontalmente para conferir todos os campos.</p>
          <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Registros PCDF"
            aria-describedby="pcdf-scroll-description">
            <table className={styles.pcdfTable}>
              <caption>Associações {total(offset + 1)} a {total(Math.min(offset + pageSize, preview.records.length))}</caption>
              <thead><tr><th scope="col">Registro</th>{preview.headers.map(field => <th key={field} scope="col">{field}</th>)}<th scope="col">Avisos</th></tr></thead>
              <tbody>{preview.records.slice(offset, offset + pageSize).map((row, index) =>
                <tr key={offset + index}>
                  <th scope="row">{offset + index + 1}</th>
                  {row.cells.map((value, column) => <td key={preview.headers[column]}>{value || <span aria-label="Campo vazio">—</span>}</td>)}
                  <td>{row.issues.map(([field, rule]) => <div key={field + rule}>{field} · {rule.replace(/_/g, " ")}</div>)}</td>
                </tr>)}</tbody>
            </table>
          </div>
          <div className={styles.actions}>
            <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</Button>
            <span aria-live="polite">Página {total(page)} de {total(pages)}</span>
            <Button variant="outline" disabled={page === pages} onClick={() => setPage(page + 1)}>Próxima</Button>
          </div>
          {!receipt && <div className={styles.actions}>
            {!review && <Button onClick={() => setReview(true)}>Revisar confirmação</Button>}
            {review && <>
              <span>Gravar {total(preview.records.length)} associações em origem e staging?</span>
              <Button variant="outline" disabled={!!busy} onClick={() => setReview(false)}>Voltar à prévia</Button>
              <Button disabled={!!busy} onClick={() => void confirm()}>Confirmar importação</Button>
            </>}
          </div>}
        </section>}

        {receipt && <section className={styles.card} aria-live="polite" aria-labelledby="pcdf-receipt">
          <h2 id="pcdf-receipt">{receipt.replay ? "Arquivo já recebido" : "Gravação confirmada"}</h2>
          <p>{total(receipt.records)} associações em staging · {total(receipt.issues)} pendências</p>
          <p>Lote <code>{receipt.lot}</code><br />Execução <code>{receipt.run}</code></p>
        </section>}

  </>;
  if (file) return contents;
  return <div className={styles.root}>
    <Header title="Importar dados" dataMode="pcdf-staging" />
    <main className={styles.content}>
      <div className={styles.heading}><h1>Importação PCDF</h1></div>
      {contents}
      <DirectPcdfHistory key={historyRevision} />
    </main>
  </div>;
}

export function StoredPcdfRows({ run }: { run: string }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ page: number; data?: z.infer<typeof directDetail>; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    const query = "?" + new URLSearchParams({ execucao: run, pagina: String(page) });
    void call(directDetail, query, undefined, AbortSignal.any([controller.signal, AbortSignal.timeout(25000)])).then(
      data => { if (!controller.signal.aborted) setResult({ page, data }); },
      failure => { if (!controller.signal.aborted) setResult({ page, error: failure.message }); });
    return () => controller.abort();
  }, [page, run]);
  if (result?.page !== page) return <p role="status">Consultando registros gravados?</p>;
  if (!result.data) return <p role="alert">{result.error}</p>;
  return <>
    <PcdfRecords headers={result.data.headers} label="Registros PCDF gravados"
      rows={result.data.rows.map(row => ({ ...row, issues: row.issues.map(({ field, rule }) => [field, rule]) }))} />
    <Pager page={page} total={result.data.total} onChange={setPage} label="Pagina??o de registros gravados" />
  </>;
}

export function DirectPcdfHistory() {
  const [result, setResult] = useState<{ items?: z.infer<typeof directHistory>; error?: string; revision: number }>();
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    void call(directHistory, "", undefined, controller.signal).then(
      items => { if (!controller.signal.aborted) setResult({ items, revision }); },
      failure => { if (!controller.signal.aborted) setResult({ error: failure.message, revision }); });
    return () => controller.abort();
  }, [revision]);
  const current = result?.revision === revision ? result : undefined;
  return <section className={styles.card} aria-labelledby="pcdf-history">
    <h2 id="pcdf-history">Histórico de importações PCDF</h2>
    <Button variant="outline" onClick={() => setRevision(revision + 1)}>Atualizar histórico PCDF</Button>
    {!current && <p role="status">Consultando o PostgreSQL…</p>}
    {current?.error && <p role="alert">{current.error}</p>}
    {current?.items?.length === 0 && <p>Nenhuma importação PCDF registrada.</p>}
    {current?.items?.map(item => <article className={styles.historyItem} key={item.request}>
      <h3>{item.name}</h3>
      <p>{statuses[item.status]} · {item.month} · {total(item.records)} associações · {item.role}</p>
      <p>{new Date(item.at).toLocaleString("pt-BR")}</p>
      {item.persisted !== undefined && <p>{total(item.persisted)} persistidas
        {item.issues !== null && item.issues !== undefined && ` · ${total(item.issues)} pendências · Reconciliação conferida`}</p>}
      {item.lot && <p>Lote {item.lot}{item.run && <><br />Execução {item.run}</>}</p>}
      {item.run && <Button variant="outline" aria-expanded={selected === item.request}
        onClick={() => setSelected(selected === item.request ? undefined : item.request)}>Consultar registros PCDF</Button>}
      {item.run && selected === item.request && <StoredPcdfRows key={item.run} run={item.run} />}
    </article>)}
  </section>;
}
