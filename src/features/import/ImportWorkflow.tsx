"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Button from "@/components/ui/button";
import { CRIME_NATURES, RA_LIST } from "@/data/mockData";
import { validateImportFiles } from "@/data/importFile";
import { autoMapImport, importMappingErrors, simulateImportConfirmation } from "@/data/importValidation";
import { IMPORT_FIELDS, IMPORT_LABELS, REQUIRED_IMPORT_FIELDS } from "@/data/importTypes";
import type { CsvDelimiter, ImportAnalysis, ImportMapping, ImportResult, ImportTable, ImportWorkerRequest } from "@/data/importTypes";
import { createImportWorkerClient, type ImportWorkerClient } from "@/features/import/importWorkerClient";
import styles from "@/features/import/ImportWorkflow.module.css";
import { useOperations } from "@/components/OperationalProvider";
import { actionAccess } from "@/lib/auth/policy";
import { generalFormats, generalImportPath, generalReceipt, generalUploadHeader, generalUploadLimit } from "@/contracts/general-import";
import { requestPcdf } from "./pcdf-client";
import ImportHistory from "./ImportHistory";
import type { z } from "zod";

type TableMetadata = Omit<ImportTable, "rows"> & { rowCount: number };
const PAGE_SIZE = 25;
const emptyMapping = () => Object.fromEntries(IMPORT_FIELDS.map(field => [field, -1])) as ImportMapping;

export default function ImportWorkflow({ persistent = false, syntheticPcdf = false }: { persistent?: boolean; syntheticPcdf?: boolean }) {
  const { role } = useOperations();
  const access = actionAccess(role, "importar");
  const [file, setFile] = useState<File | null>(null);
  const [table, setTable] = useState<TableMetadata | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>(emptyMapping);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [stage, setStage] = useState<"mapping" | "preview" | "confirm" | "complete">("mapping");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("todos");
  const [delimiter, setDelimiter] = useState<CsvDelimiter>();
  const [historyRevision, setHistoryRevision] = useState(0);
  const [persisting, setPersisting] = useState(false);
  const [receipt, setReceipt] = useState<z.infer<typeof generalReceipt>>();
  const uploadKey = useRef<string | undefined>(undefined);
  const saving = useRef(false);
  const client = useRef<ImportWorkerClient | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stageHeading = useRef<HTMLHeadingElement>(null);

  function stopWorker() {
    client.current?.cancel();
  }
  useEffect(() => () => {
    client.current?.cancel();
  }, []);
  useEffect(() => { if (analysis || result || table) stageHeading.current?.focus(); }, [stage, analysis, result, table]);

  function reset() {
    if (saving.current) return;
    stopWorker(); setFile(null); setTable(null); setAnalysis(null); setResult(null);
    setReceipt(undefined); uploadKey.current = undefined;
    setMapping(emptyMapping()); setStage("mapping"); setBusy(""); setError(""); setPage(1); setFilter("todos");
    if (fileInput.current) fileInput.current.value = "";
  }
  function fail(message: string) {
    stopWorker(); setBusy(""); setAnalysis(null); setResult(null); setTable(null); setStage("mapping"); setError(message);
  }
  function send(message: ImportWorkerRequest, label: string) {
    if (!access.enabled) return;
    setError("");
    if (!client.current) { fail("O processamento foi encerrado. Selecione o arquivo novamente."); return; }
    client.current.send(message, label);
  }
  function selectFiles(files: File[], selectedDelimiter: CsvDelimiter | null = delimiter ?? null) {
    if (!access.enabled || saving.current) return;
    reset();
    const invalid = validateImportFiles(files);
    if (invalid) { setError(invalid); return; }
    if (persistent && files[0].size > generalUploadLimit) { setError("O arquivo excede 8 MiB. Divida a entrega em arquivos menores."); return; }
    setFile(files[0]);
    if (!client.current) client.current = createImportWorkerClient({
      createWorker: () => new Worker(new URL("./import.worker.ts", import.meta.url)),
      onBusy: setBusy,
      onError: fail,
      onResponse: message => {
        if (message.type === "table") {
          setTable(message.table); setMapping(autoMapImport(message.table.headers)); setAnalysis(null); setResult(null); setStage("mapping");
        } else {
          setAnalysis(message.analysis); setPage(1); setFilter("todos"); setStage("preview");
        }
      },
    });
    setError("");
    client.current.start({ type: "load", file: files[0], delimiter: selectedDelimiter ?? undefined, persistent }, "Lendo arquivo e identificando colunas…");
  }

  async function persist() {
    if (!file || !table || saving.current) return;
    saving.current = true;
    setPersisting(true);
    uploadKey.current ??= crypto.randomUUID();
    setBusy("Enviando o arquivo e aguardando validação, gravação e conferência no servidor…");
    setError("");
    try {
      const result = await requestPcdf(generalImportPath, generalReceipt, { method: "POST", body: file, headers: {
        "content-type": file.name.toLowerCase().endsWith(".csv") ? generalFormats.csv : generalFormats.xlsx,
        "idempotency-key": uploadKey.current,
        [generalUploadHeader]: encodeURIComponent(JSON.stringify({ name: file.name, sheet: table.sheetName, delimiter: table.delimiter, mapping })),
      } });
      setReceipt(result);
      setStage("complete");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Gravação sem confirmação. Consulte o histórico antes de reenviar.");
    } finally {
      saving.current = false;
      setPersisting(false);
      setBusy("");
      setHistoryRevision(value => value + 1);
    }
  }
  const mappingErrors = table?.headers.length ? importMappingErrors(table.headers, mapping) : [];
  const visibleRows = analysis?.rows.filter(row => filter === "todos" || row.status === filter) ?? [];
  const pages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const rows = visibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (!access.enabled) return <p role="alert">{access.reason}</p>;
  return (
    <div className={styles.root}>
      <Header title="Importar Dados" subtitle={persistent ? "Importação geral em PostgreSQL local" : "Importação demonstrativa de CSV e XLSX"} />
      <div className={styles.content}>
        <div className={styles.heading}>
          <div><h1>Importar ocorrências</h1><p>{persistent ? "Confira o arquivo antes de gravar em staging." : "Leia, mapeie e confira seu arquivo antes de confirmar a simulação."}</p></div>
          <div className={styles.actions}><a className={styles.template} href="/modelos/ocorrencias-demonstracao.csv" download>Baixar modelo CSV</a><a className={styles.template} href="/modelos/ocorrencias-demonstracao.xlsx" download>Baixar modelo XLSX</a></div>
        </div>
        {persistent ? <p className={styles.notice}>Homologação local com arquivos sintéticos. Os registros ficam em staging. Arquivos oficiais da PCDF exigem autorização pelo receptor institucional.</p>
          : <p className={styles.notice}>Demonstração: processamento local no navegador, sem envio ou gravação no servidor. Os resultados não alteram a listagem, o Dashboard ou os mapas.</p>}
        {syntheticPcdf && <Link className={styles.template} href="/importar?origem=pcdf">Abrir ensaio PCDF sintético</Link>}
        <ol className={styles.steps} aria-label="Etapas da importação">
          {["Selecionar arquivo", "Mapear colunas", "Pré-visualizar", persistent ? "Gravar em staging" : "Confirmar simulação"].map((label, index) => <li key={label} aria-current={index === (!table ? 0 : stage === "mapping" ? 1 : stage === "preview" ? 2 : 3) ? "step" : undefined}>{index + 1}. {label}</li>)}
        </ol>

        <section className={styles.card} aria-label="Seleção de arquivo">
          <div className={`${styles.drop} ${dragging ? styles.dragging : ""}`}
            onDragOver={event => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={event => { event.preventDefault(); setDragging(false); selectFiles(Array.from(event.dataTransfer.files)); }}>
            <p>Arraste um arquivo CSV ou XLSX para esta área</p>
            <Button disabled={persisting} onClick={() => fileInput.current?.click()}>Selecionar arquivo</Button>
            <input ref={fileInput} className={styles.hidden} type="file" accept=".csv,.xlsx" aria-label="Arquivo CSV ou XLSX"
              onChange={event => { if (event.target.files?.length) selectFiles(Array.from(event.target.files)); }} />
            <small>Um arquivo por vez · {persistent ? "até 8 MiB" : "até 50 MB (52.428.800 bytes)"}</small>
          </div>
          {persistent && file?.name.toLowerCase().endsWith(".csv") && <div className={styles.toolbar}>
            <label>Separador do CSV<select disabled={persisting} value={delimiter ?? ""} onChange={event => {
              const next = (event.target.value || undefined) as CsvDelimiter | undefined;
              setDelimiter(next); selectFiles([file], next ?? null);
            }}><option value="">Automático</option><option value=";">Ponto e vírgula</option><option value=",">Vírgula</option><option value={"\t"}>Tabulação</option></select></label>
          </div>}
          <p className={styles.file}>{file ? `Selecionado: ${file.name} (${(file.size / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB)` : "Nenhum arquivo selecionado."}</p>
          {(file || busy) && !persisting && <Button variant="outline" onClick={reset}>{busy ? "Cancelar processamento" : "Limpar seleção"}</Button>}
        </section>
        <div role="status" aria-live="polite" aria-atomic="true">{busy && <p className={styles.notice}>{busy}</p>}</div>
        {error && <p role="alert" className={styles.error}>{error}</p>}

        {table && <section className={styles.card} aria-busy={Boolean(busy)}>
          <h2 ref={stageHeading} tabIndex={-1}>{stage === "mapping" ? "Mapeamento de colunas" : stage === "complete" ? (persistent ? "Gravação confirmada" : "Simulação concluída") : stage === "confirm" ? (persistent ? "Confirmar gravação em staging" : "Confirmar importação demonstrativa") : "Pré-visualização dos registros"}</h2>
          <div className={styles.toolbar}>
            <label>Planilha<select value={table.sheetName} disabled={Boolean(busy) || table.sheetNames.length === 1} onChange={event => {
              uploadKey.current = undefined; setReceipt(undefined); setAnalysis(null); setResult(null); setStage("mapping"); setTable({ ...table, sheetName: event.target.value, headers: [], rowCount: 0, sheetError: undefined });
              send({ type: "sheet", name: event.target.value }, "Lendo planilha…");
            }}>{table.sheetNames.map(name => <option key={name}>{name}</option>)}</select></label>
            <p>{table.rowCount.toLocaleString("pt-BR")} linhas de dados{table.encoding ? ` · ${table.encoding}` : ""}</p>
          </div>
          {table.sheetError && <p role="alert" className={styles.error}>{table.sheetError}</p>}
          {stage === "mapping" && table.headers.length > 0 && <>
            <p>Confira as correspondências sugeridas. Campos com * são obrigatórios. Uma coluna só pode ser usada uma vez.</p>
            <div className={styles.mapping}>
              {IMPORT_FIELDS.map(field => <label key={field}>{IMPORT_LABELS[field]}{REQUIRED_IMPORT_FIELDS.includes(field) ? " *" : " (opcional)"}
                <select aria-label={`${IMPORT_LABELS[field]}${REQUIRED_IMPORT_FIELDS.includes(field) ? " *" : " (opcional)"}`} aria-required={REQUIRED_IMPORT_FIELDS.includes(field)} value={mapping[field]} disabled={Boolean(busy)} onChange={event => { uploadKey.current = undefined; setMapping({ ...mapping, [field]: Number(event.target.value) }); setAnalysis(null); setResult(null); }}>
                  <option value={-1}>Não mapeado</option>
                  {table.headers.map((header, index) => <option key={index} value={index}>{index + 1}. {header.trim() || "(sem nome)"}</option>)}
                </select>
              </label>)}
            </div>
            {mappingErrors.length > 0 && <div className={styles.error} role="status"><ul>{mappingErrors.map(message => <li key={message}>{message}</li>)}</ul></div>}
            <p>Colunas não selecionadas serão preservadas nos valores originais, sem virar campos da ocorrência.</p>
            <Button disabled={Boolean(busy) || mappingErrors.length > 0 || table.rowCount === 0} onClick={() => send({ type: "validate", mapping }, "Validando os registros…")}>Validar e pré-visualizar</Button>
          </>}
          {analysis && <>
            <dl className={styles.counts}>
              {[["Total de linhas", analysis.counts.total], ["Válidos", analysis.counts.valid], ["Inválidos", analysis.counts.invalid], ["Pendentes de localização", analysis.counts.pending], ["Possíveis duplicatas", analysis.counts.possibleDuplicates]].map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
            </dl>
            <p>Possíveis duplicatas são apenas alertas entre linhas deste arquivo; nenhuma linha é eliminada. Pendências não são promovidas a ocorrências válidas.</p>
            {analysis.mappingErrors.length > 0 && <p role="alert" className={styles.error}>{analysis.mappingErrors.join(" ")}</p>}
          </>}
          {stage === "preview" && analysis && <>
            <details><summary>Colunas mapeadas e valores originais</summary><ul>{IMPORT_FIELDS.map(field => <li key={field}>{IMPORT_LABELS[field]}: {mapping[field] < 0 ? "não mapeado" : `${mapping[field] + 1}. ${table.headers[mapping[field]]}`}</li>)}</ul><p>Os valores originais de cada linha estão disponíveis abaixo, incluindo colunas não mapeadas.</p></details>
            <div className={styles.toolbar}><label>Filtrar linhas<select value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}><option value="todos">Todas</option><option value="valido">Válidas</option><option value="invalido">Inválidas</option><option value="pendente">Pendentes</option></select></label><span>Exibindo até {PAGE_SIZE} linhas por página.</span></div>
            <div className={styles.tableScroll} role="region" aria-label="Registros interpretados" tabIndex={0}>
              <table><caption>Dados normalizados e erros por linha/coluna</caption><thead><tr><th scope="col">Linha / situação</th><th scope="col">Data / horário</th><th scope="col">Naturezas</th><th scope="col">RA / local</th><th scope="col">Coordenadas</th><th scope="col">Mensagens / originais</th></tr></thead><tbody>
                {rows.map(row => <tr key={row.line}><th scope="row">{row.line}<br /><span className={styles[row.status]}>{row.status === "valido" ? "Válido" : row.status === "invalido" ? "Inválido" : "Pendente"}</span></th><td>{row.normalized.data}<br />{row.normalized.horario}</td><td>{row.normalized.naturezas.join("; ")}</td><td>{row.normalized.raCode}<br />{row.normalized.local}</td><td>{row.normalized.latitude || "Ausente"}<br />{row.normalized.longitude || "Ausente"}</td><td>
                  {row.issues.length > 0 && <ul>{row.issues.map((issue, index) => <li key={index}>{issue.column ? `Coluna ${issue.column} (${table.headers[issue.column - 1] || "sem nome"})` : issue.field === "linha" ? "Linha" : IMPORT_LABELS[issue.field]}: {issue.message}</li>)}</ul>}
                  {row.possibleDuplicateOf !== undefined && <p>Possível duplicata da linha {row.possibleDuplicateOf}. Registro preservado.</p>}
                  <details><summary>Valores originais da linha {row.line}</summary><dl>{row.original.map((cell, index) => <div key={index}><dt>{index + 1}. {table.headers[index] || "Sem cabeçalho"}</dt><dd>{String(cell.value ?? "(vazio)")}{cell.formula ? ` · Fórmula: ${cell.formula}` : ""}{cell.error ? " · Erro Excel" : ""}</dd></div>)}</dl></details>
                </td></tr>)}
                {!rows.length && <tr><td colSpan={6}>Nenhuma linha nesta situação.</td></tr>}
              </tbody></table>
            </div>
            <nav className={styles.actions} aria-label="Paginação da pré-visualização"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button><span>Página {page} de {pages} · {visibleRows.length} linhas</span><Button variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</Button></nav>
            <div className={styles.actions}><Button variant="outline" onClick={() => { setStage("mapping"); setAnalysis(null); }}>Voltar ao mapeamento</Button><Button disabled={analysis.mappingErrors.length > 0 || (persistent ? analysis.counts.total === 0 : analysis.counts.valid + analysis.counts.pending === 0)} onClick={() => setStage("confirm")}>{persistent ? "Revisar confirmação" : "Preparar simulação"}</Button></div>
          </>}
          {stage === "confirm" && analysis && <>
            {persistent ? <p className={styles.notice}>{analysis.counts.total} linhas serão enviadas para nova validação. Os valores originais serão preservados, incluindo linhas com diagnósticos.</p>
              : <p className={styles.notice}>Ao confirmar, {analysis.counts.valid} registros serão considerados aptos na simulação, {analysis.counts.pending} ficarão como pendências de localização e {analysis.counts.invalid} serão rejeitados. Nada será gravado ou enviado ao servidor.</p>}
            <div className={styles.actions}><Button variant="outline" disabled={persisting} onClick={() => setStage("preview")}>Voltar à pré-visualização</Button><Button disabled={persisting} onClick={() => {
              if (!access.enabled) return;
              if (persistent) { void persist(); return; }
              try { setResult(simulateImportConfirmation(analysis)); setStage("complete"); }
              catch (failure) { setError(failure instanceof Error ? failure.message : "Falha na simulação."); }
            }}>{persistent ? "Confirmar importação" : "Confirmar simulação"}</Button></div>
          </>}
          {stage === "complete" && result && <div role="status" className={styles.notice}>
            <p>Resultado demonstrativo: {result.simulated} aptos, {result.pending} pendentes de localização e {result.rejected} rejeitados, de {result.total} linhas analisadas.</p>
            <p>Nenhum registro foi persistido. O resultado existe somente nesta tela e será perdido ao sair ou recarregar.</p>
            <Button variant="outline" onClick={() => setStage("preview")}>Rever registros analisados</Button>
          </div>}
          {stage === "complete" && receipt && <div role="status" className={styles.notice}>
            <p>{receipt.replay ? "Reenvio: lote original preservado." : "Gravação confirmada pelo PostgreSQL."}</p>
            <p>{receipt.persisted} linhas persistidas · {receipt.summary.structural} linhas estruturalmente válidas · {receipt.summary.issues} diagnósticos.</p>
            <p>Lote {receipt.lot}<br />Execução {receipt.run}</p>
          </div>}
        </section>}
        {persistent && <ImportHistory key={historyRevision} />}
        <section className={styles.card}>
          <h2>Como preparar o arquivo</h2>
          <ul>
            <li>Obrigatórios: data (DD/MM/AAAA ou AAAA-MM-DD), horário (HH:mm), natureza, RA e endereço com 5 a 240 caracteres.</li>
            <li>Use várias naturezas na mesma célula, separadas por ponto e vírgula ou |. Cada linha continua sendo uma ocorrência.</li>
            <li>Latitude e longitude são opcionais; ausências geram pendência de localização. Valores fornecidos devem respeitar os limites demonstrativos do formulário (latitude −16,2 a −15,4; longitude −48,3 a −47,3).</li>
            <li>Use nomes ou identificadores internos das RAs e nomes das naturezas do catálogo de referência. Valores desconhecidos serão sinalizados para revisão.</li>
            <li>CSV: vírgula, ponto e vírgula ou tabulação; use aspas em células com separadores. XLSX: selecione a planilha desejada e substitua fórmulas por valores.</li>
            <li>Limites da demonstração: 10 mil linhas por planilha, 64 colunas, 200 mil células, 4 mil caracteres por célula, 16 Mi caracteres de texto e XLSX com até 100 MB descompactados. Arquivos maiores devem ser divididos; não são truncados silenciosamente.</li>
            <li>Os modelos CSV/XLSX são propostas demonstrativas, sem homologação institucional.</li>
            {persistent && <li>Arquivos XLS precisam ser exportados como XLSX ou CSV. O XML SpreadsheetML da PCDF segue o procedimento institucional.</li>}
          </ul>
          <details><summary>Consultar catálogos demonstrativos</summary><p>Naturezas: {CRIME_NATURES.join("; ")}. Não são classificações oficiais.</p><ul>{RA_LIST.map(ra => <li key={ra.codigo}>{ra.nomeDisplay} ({ra.codigo}, identificador interno){ra.codigo === "RA-S" ? " — área demonstrativa, não homologada como RA oficial" : ""}</li>)}</ul></details>
        </section>
      </div>
    </div>
  );
}
