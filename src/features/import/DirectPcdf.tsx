"use client";

import { useEffect, useState } from "react";
import type { z } from "zod";
import Header from "@/components/Header";
import Button from "@/components/ui/button";
import { directHistory, directPcdfPath, directPreview, directReceipt } from "@/contracts/pcdf-direct";
import styles from "./ImportWorkflow.module.css";

const pageSize = 25;
const total = (value: number) => value.toLocaleString("pt-BR");
const statuses = { recebida: "Recebida", concluida: "Gravada em staging", reenvio: "Reenvio sem duplicação", falhou: "Gravação revertida" };
const diagnostics: Record<string, string> = {
  nome_competencia_invalido: "Use o arquivo mensal com o nome pcdf_naturezas_AAAA-MM.csv.",
  cabecalho_invalido: "O CSV precisa conter os 34 campos do layout PCDF v1.0, na ordem original.",
  csv_divergente_manifesto: "O conteúdo ou tamanho do CSV diverge do manifesto.",
  contagem_csv_divergente: "A quantidade de registros diverge do manifesto.",
  contagem_csv_invalida: "O CSV mensal precisa conter de 1 a 10.000 associações.",
  proveniencia_linha_invalida: "Há identificadores de origem ou versões de tratamento incompatíveis.",
  linha_de_origem_duplicada: "O CSV contém identificador de origem ou posição XML repetidos.",
  registro_fora_da_competencia: "Há uma data válida fora da competência indicada pelo nome do CSV.",
  manifesto_inconsistente: "Os dados técnicos do manifesto são inconsistentes.",
  competencia_nao_manifestada: "A competência do CSV não está no manifesto.",
};

async function call<T>(schema: z.ZodType<T>, step?: string, body?: FormData): Promise<T> {
  const response = await fetch(directPcdfPath + (step ? "?etapa=" + step : ""), {
    cache: "no-store", ...(body && { method: "POST", body }),
  });
  const result = await response.json();
  if (!response.ok || result.success !== true) {
    const detail = result.error?.diagnostic;
    throw new Error(diagnostics[detail] ?? result.error?.message ?? "Receptor PCDF local indisponível.");
  }
  return schema.parse(result.data);
}

function form(csv: File, manifest: File | undefined) {
  const body = new FormData();
  body.set("csv", csv);
  if (manifest) body.set("manifesto", manifest);
  return body;
}

export default function DirectPcdf() {
  const [csv, setCsv] = useState<File>();
  const [manifest, setManifest] = useState<File>();
  const [preview, setPreview] = useState<z.infer<typeof directPreview>>();
  const [receipt, setReceipt] = useState<z.infer<typeof directReceipt>>();
  const [history, setHistory] = useState<z.infer<typeof directHistory>>([]);
  const [historyError, setHistoryError] = useState(false);
  const [busy, setBusy] = useState<"validar" | "confirmar">();
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);

  async function refreshHistory() {
    try { setHistory(await call(directHistory)); setHistoryError(false); }
    catch { setHistoryError(true); }
  }

  useEffect(() => {
    void call(directHistory).then(setHistory, () => setHistoryError(true));
  }, []);

  async function validate(file: File | undefined, technicalManifest: File | undefined) {
    setPreview(undefined);
    setReceipt(undefined);
    setReview(false);
    setError("");
    setPage(1);
    if (!file) return;
    setBusy("validar");
    try { setPreview(await call(directPreview, "validar", form(file, technicalManifest))); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(undefined); }
  }

  async function confirm() {
    if (!csv || !preview || busy || !review) return;
    setBusy("confirmar");
    setError("");
    const body = form(csv, manifest);
    body.set("sha256", preview.sha256);
    if (preview.manifestSha) body.set("manifestSha", preview.manifestSha);
    try {
      setReceipt(await call(directReceipt, "confirmar", body));
      setReview(false);
    } catch (failure) { setError((failure as Error).message); }
    finally {
      await refreshHistory();
      setBusy(undefined);
    }
  }

  const offset = (page - 1) * pageSize;
  const pages = preview ? Math.ceil(preview.records.length / pageSize) : 0;
  return (
    <div className={styles.root}>
      <Header title="Importar dados" dataMode="pcdf-staging" />
      <main className={styles.content}>
        <div className={styles.heading}><h1>Importação PCDF</h1></div>
        <section className={styles.card} aria-labelledby="pcdf-upload">
          <h2 id="pcdf-upload">Arquivo mensal</h2>
          <p>Os dados recebidos serão armazenados em origem e staging para revisão.</p>
          <div className={styles.mapping}>
            <label>Arquivo CSV mensal
              <input type="file" accept=".csv,text/csv" disabled={!!busy} onChange={event => {
                const file = event.target.files?.[0];
                setCsv(file);
                void validate(file, manifest);
              }} />
            </label>
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
          <p>Lote <code>{receipt.lot}</code></p>
        </section>}

        <section className={styles.card} aria-labelledby="pcdf-history">
          <h2 id="pcdf-history">Histórico de importações PCDF</h2>
          {historyError ? <p role="alert">Histórico indisponível. Atualize a página para tentar novamente.</p>
            : history.length === 0 ? <p>Nenhuma importação confirmada nesta base.</p>
            : history.map(item => <article className={styles.historyItem} key={item.request}>
              <strong>{item.name}</strong>
              <p>{statuses[item.status]} · {total(item.records)} associações · {item.role}</p>
              <small>{new Date(item.at).toLocaleString("pt-BR")}{item.lot && " · Lote " + item.lot}</small>
            </article>)}
        </section>
      </main>
    </div>
  );
}
