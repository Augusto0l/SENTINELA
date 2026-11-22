"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import NavigationIcon from "@/components/NavigationIcon";
import Button from "@/components/ui/button";
import { useOperations } from "@/components/OperationalProvider";
import { actionAccess } from "@/lib/auth/policy";
import { directCsvLimit } from "@/contracts/pcdf-direct";
import { IMPORT_FIELDS, IMPORT_LABELS, REQUIRED_IMPORT_FIELDS, type CsvDelimiter } from "@/data/importTypes";
import GeneralRecords from "./GeneralRecords";
import ImportHistory, { ImportEntryDetails, useImportHistory } from "./ImportHistory";
import { Metrics, formatBytes, formatCount, formatMonth } from "./ImportUi";
import { PcdfPreviewRecords } from "./PcdfRecords";
import { useImportWorkflow, type Step } from "./useImportWorkflow";
import styles from "./ImportWorkflow.module.css";

const stages = ["Selecionar arquivo", "Validar arquivo", "Revisar registros", "Confirmar importação"] as const;
type Workflow = ReturnType<typeof useImportWorkflow>;

function Guide({ combinedPcdf, persistent }: { combinedPcdf: boolean; persistent: boolean }) {
  return <details className={styles.help}>
    <summary>Como preparar o arquivo?</summary>
    <div>
      <p>Use data, horário, natureza, RA e endereço nos arquivos gerais. Confira o mapeamento sugerido e ajuste as colunas se necessário.</p>
      <p>O CSV geral aceita ponto e vírgula, vírgula ou tabulação. No XLSX, selecione a planilha de dados e prefira valores a fórmulas.</p>
      {combinedPcdf && <p>Para PCDF v1.0, mantenha o nome mensal, a ordem dos 34 campos e o conteúdo original. O manifesto JSON é opcional.</p>}
      <p>{persistent ? "Pendências sinalizam pontos para revisão. Os registros permanecem em origem e staging." : "A simulação analisa os registros na sessão."}</p>
      <div className={styles.links}>
        <a className={styles.template} href="/modelos/ocorrencias-demonstracao.csv" download>Baixar modelo CSV</a>
        <a className={styles.template} href="/modelos/ocorrencias-demonstracao.xlsx" download>Baixar modelo XLSX</a>
      </div>
    </div>
  </details>;
}

function GeneralValidation({ workflow: w }: { workflow: Workflow }) {
  const { analysis, table, file, busy } = w;
  const [mappingView, setMappingView] = useState<{ file: File; open: boolean }>();
  if (!table || !file) return null;
  if (analysis) return <>
    <Metrics items={[
      { label: "Registros", value: formatCount(analysis.counts.total) },
      { label: "Válidos", value: formatCount(analysis.counts.valid) },
      { label: "Com pendências", value: formatCount(analysis.counts.pending) },
      { label: "Inválidos", value: formatCount(analysis.counts.invalid) },
    ]} />
    <p className={styles.muted}>As contagens são por registro. Confira os avisos na prévia.</p>
    {analysis.counts.possibleDuplicates > 0 && <p className={styles.warningText}>
      {formatCount(analysis.counts.possibleDuplicates)} {analysis.counts.possibleDuplicates === 1 ? "possível duplicata sinalizada." : "possíveis duplicatas sinalizadas."}
    </p>}
    {analysis.mappingErrors.length > 0 && <p role="alert" className={styles.feedbackError}>{analysis.mappingErrors.join(" ")}</p>}
    <div className={styles.stageActions}>
      <Button variant="outline" onClick={() => {
        setMappingView({ file, open: true });
        w.invalidateMapping();
      }}>Editar mapeamento</Button>
      <Button disabled={!w.canConfirm} onClick={() => w.go(3)}>Revisar registros</Button>
    </div>
  </>;
  return <>
    <div className={styles.historyFilters}>
      {!file.name.toLowerCase().endsWith(".csv")
        ? <label>Planilha<select aria-label="Planilha" value={table.sheetName} disabled={!!busy || table.sheetNames.length === 1}
          onChange={event => w.chooseSheet(event.target.value)}>
          {table.sheetNames.map(name => <option key={name}>{name}</option>)}
        </select></label>
        : <label>Separador do CSV<select aria-label="Separador do CSV" disabled={!!busy} value={w.delimiter ?? ""} onChange={event =>
          void w.selectFiles([file], (event.target.value || undefined) as CsvDelimiter | undefined)}>
          <option value="">Automático</option><option value=";">Ponto e vírgula</option><option value=",">Vírgula</option><option value={"\t"}>Tabulação</option>
        </select></label>}
      <p className={styles.muted}>{formatCount(table.rowCount)} registros · {table.headers.length} campos</p>
    </div>
    {table.sheetError && <p role="alert" className={styles.feedbackError}>{table.sheetError}</p>}
    {table.headers.length > 0 && <>
      <details className={styles.disclosure}
        open={mappingView?.file === file ? mappingView.open : w.mappingErrors.length > 0}
        onToggle={event => setMappingView({ file, open: event.currentTarget.open })}>
        <summary>Mapeamento de colunas</summary>
        <p>Confira as sugestões. Campos com * são obrigatórios.</p>
        <div className={styles.mapping}>
          {IMPORT_FIELDS.map(field => {
            const required = REQUIRED_IMPORT_FIELDS.includes(field);
            const label = IMPORT_LABELS[field] + (required ? " *" : " (opcional)");
            return <label key={field}>{label}
              <select aria-label={label} aria-required={required} value={w.mapping[field]} disabled={!!busy}
                onChange={event => w.changeMapping(field, Number(event.target.value))}>
                <option value={-1}>Não mapeado</option>
                {table.headers.map((header, i) => <option key={i} value={i}>{i + 1}. {header.trim() || "Sem nome"}</option>)}
              </select>
            </label>;
          })}
        </div>
      </details>
      {w.mappingErrors.length > 0 && <div role="status" className={styles.feedbackWarning}>
        <ul>{w.mappingErrors.map(reason => <li key={reason}>{reason}</li>)}</ul>
      </div>}
      <div className={styles.stageActions}><Button disabled={!!busy || !!w.mappingErrors.length || !table.rowCount}
        onClick={w.validateGeneral}>Validar arquivo</Button></div>
    </>}
  </>;
}

function PcdfValidation({ workflow: w }: { workflow: Workflow }) {
  const { file, preview } = w;
  const manifestInput = useRef<HTMLInputElement>(null);
  if (!file) return null;
  return <>
    {preview && <>
      <p className={w.pcdfValidated ? styles.goodText : styles.warningText}>
        {w.pcdfValidated ? "Layout PCDF v1.0 reconhecido" : "Última prévia disponível. Valide a seleção para confirmar."}
      </p>
      <Metrics items={[
        { label: "Competência", value: formatMonth(preview.month) },
        { label: "Associações", value: formatCount(preview.records.length) },
        { label: "Campos", value: preview.headers.length },
        { label: "Tamanho", value: formatBytes(preview.bytes) },
      ]} />
      <p className={styles.muted}>{formatCount(preview.bytes)} bytes · {formatCount(w.pcdfIssues)} avisos de validação</p>
      {w.warnings && w.warnings.size > 0 && <details className={styles.disclosure}>
        <summary>Avisos e campos vazios</summary>
        <p>Um registro pode aparecer em mais de um grupo.</p>
        {[...w.warnings].map(([category, info]) => <details className={styles.warningGroup} key={category}>
          <summary>{category} <span>{formatCount(info.rows.size)} registros</span></summary>
          <ul>{[...info.fields].map(([message, count]) => <li key={message}>{message} · {formatCount(count)}</li>)}</ul>
          <Button variant="ghost" size="sm" onClick={() => { w.setWarningGroup(category); w.go(3); }}>Ver registros</Button>
        </details>)}
      </details>}
    </>}
    <details className={styles.disclosure}>
      <summary>Verificação adicional de integridade{w.manifest ? " · manifesto selecionado" : ""}</summary>
      <p>{preview?.manifestSha && w.pcdfValidated ? "Arquivo, contagem e identificadores conferidos com o manifesto." : "O manifesto técnico é opcional. Com o CSV avulso, a proveniência é registrada como declarada no arquivo."}</p>
      <label>Manifesto técnico JSON (opcional)
        <input ref={manifestInput} type="file" accept=".json,application/json" disabled={!!w.busy}
          onChange={event => { const chosen = event.target.files?.[0]; if (chosen) void w.validatePcdf(file, chosen); }} />
      </label>
      {w.manifest && <div className={styles.links}>
        <span className={styles.breakWord}>{w.manifest.name}</span>
        <Button variant="ghost" size="sm" disabled={!!w.busy} onClick={() => {
          if (manifestInput.current) manifestInput.current.value = "";
          void w.validatePcdf(file);
        }}>Remover manifesto</Button>
      </div>}
    </details>
    <div className={styles.stageActions}>
      {!w.pcdfValidated && w.error && file.size <= directCsvLimit && <Button variant="outline" disabled={!!w.busy}
        onClick={() => void w.validatePcdf(file, w.manifest)}>Validar novamente</Button>}
      {preview && <Button disabled={!!w.busy} onClick={() => { w.setWarningGroup(""); w.go(3); }}>Revisar registros</Button>}
    </div>
  </>;
}

function Confirmation({ workflow: w, persistent, onHistory }: { workflow: Workflow; persistent: boolean; onHistory: () => void }) {
  const [details, setDetails] = useState(false);
  const { file, receipt, result, preview, analysis, table } = w;
  if (!file) return null;
  const pcdf = receipt && "pcdf" in receipt ? receipt.pcdf : undefined;
  const general = receipt && "general" in receipt ? receipt.general : undefined;
  const records = pcdf?.records ?? general?.persisted;
  const issues = pcdf?.issues ?? general?.summary.issues;
  if (receipt && records !== undefined && issues !== undefined) {
    const replay = pcdf?.replay ?? general?.replay;
    return <div className={styles.result}>
      <div role="status" className={styles.resultTitle}>
        <span className={styles.heroIcon}><NavigationIcon name="shield" size={25} /></span>
        <div><h2>{replay ? "Arquivo já recebido" : "Gravação confirmada"}</h2>
          <p>{replay ? "O lote original foi preservado." : "Registros gravados em origem e staging."}</p></div>
      </div>
      <Metrics items={[
        ...(pcdf ? [{ label: "Competência", value: formatMonth(pcdf.month) }] : []),
        { label: "Registros persistidos", value: formatCount(records) },
        { label: "Pendências", value: formatCount(issues) },
        { label: "Reconciliação", value: "Conferida" },
      ]} />
      <div className={styles.stageActions}>
        <Button variant="ghost" onClick={() => setDetails(true)}>Ver detalhes</Button>
        <Button variant="outline" onClick={onHistory}>Consultar histórico</Button>
        <Button onClick={w.reset}>Nova importação</Button>
      </div>
      {details && <ImportEntryDetails onClose={() => setDetails(false)} entry={{
        request: "", name: file.name, type: pcdf ? "PCDF" : file.name.toLowerCase().endsWith(".csv") ? "CSV" : "XLSX",
        status: replay ? "reenvio" : "concluida", lot: pcdf?.lot ?? general?.lot, run: pcdf?.run ?? general?.run,
        persisted: records, received: records, issues, month: pcdf?.month, hash: pcdf?.sha256, manifest: pcdf?.manifestSha, sheet: table?.sheetName,
      }} />}
    </div>;
  }
  if (result) return <div role="status">
    <h2>Simulação concluída</h2>
    <p>{result.simulated} aptos · {result.pending} pendentes · {result.rejected} rejeitados. A simulação registra o resultado nesta sessão.</p>
    <Button onClick={w.reset}>Nova importação</Button>
  </div>;
  return <>
    <p className={styles.breakWord}><strong>{file.name}</strong></p>
    <Metrics items={[
      ...(preview ? [{ label: "Competência", value: formatMonth(preview.month) }] : []),
      { label: "Registros recebidos", value: formatCount(preview?.records.length ?? analysis?.counts.total ?? 0) },
      { label: "Campos", value: preview?.headers.length ?? table?.headers.length ?? 0 },
      { label: "Validação", value: w.canConfirm ? "Arquivo validado" : "Revisão necessária" },
    ]} />
    <p className={styles.muted}>{preview ? formatCount(w.pcdfIssues) + " avisos de validação." :
      formatCount((analysis?.counts.pending ?? 0) + (analysis?.counts.invalid ?? 0)) + " registros com pendências ou inválidos."}</p>
    <div className={styles.destination}><NavigationIcon name="shield" size={20} /><div><strong>{persistent ? "PostgreSQL local" : "Simulação"}</strong>
      <p>{persistent ? "A confirmação grava em origem e staging para revisão." : "O resultado fica disponível nesta sessão."}</p></div></div>
    <div className={styles.stageActions}>
      <Button variant="outline" disabled={w.persisting} onClick={() => w.go(3)}>Voltar e revisar</Button>
      <Button disabled={!!w.busy || !w.canConfirm} onClick={() => void w.confirm()}>
        {w.persisting ? "Gravando…" : persistent ? "Confirmar importação" : "Confirmar simulação"}
      </Button>
    </div>
  </>;
}

export default function ImportWorkflow({ persistent = false, syntheticPcdf = false, combinedPcdf = false }: {
  persistent?: boolean; syntheticPcdf?: boolean; combinedPcdf?: boolean;
}) {
  const { role } = useOperations();
  const access = actionAccess(role, "importar");
  const fileInput = useRef<HTMLInputElement>(null);
  const w = useImportWorkflow({ allowed: access.enabled, persistent, combinedPcdf,
    clearInput: () => { if (fileInput.current) fileInput.current.value = ""; } });
  const [area, setArea] = useState<"nova" | "historico">("nova");
  const [dragging, setDragging] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const history = useImportHistory(persistent && access.enabled, combinedPcdf, w.historyRevision);
  const { step, busy, error, file, pcdf, preview, analysis, table, receipt, result } = w;
  const completed = !!(receipt || result);
  useEffect(() => {
    if (area === "nova" && (step > 1 || completed)) stepHeading.current?.focus();
  }, [area, step, completed]);
  const connection = !history.current ? "Verificando PostgreSQL" : history.current.errors.length ? "Conexão indisponível" : "PostgreSQL conectado";
  const connectionOk = history.current && history.current.errors.length === 0;
  const ext = file?.name.toLowerCase().endsWith(".xlsx") ? "XLSX" : "CSV";
  if (!access.enabled) return <p role="alert">{access.reason}</p>;

  function switchArea(next: typeof area) {
    setArea(next);
    heading.current?.focus();
  }

  return <div className={styles.root}>
    <Header title="Importar Dados" dataMode={persistent ? "import-staging" : undefined} />
    <div className={styles.content}>
      <div className={styles.workspace}>
        <header className={styles.hero}>
          <div className={styles.heroLead}>
            <span className={styles.heroIcon}><NavigationIcon name="upload" size={25} /></span>
            <div><h1 ref={heading} tabIndex={-1}>Importar ocorrências</h1>
              <p>{persistent ? "Receba arquivos de ocorrências e acompanhe a gravação em staging." : "Analise arquivos de ocorrências na demonstração local."}</p></div>
          </div>
          {persistent && <div role="status" className={styles.connection} data-connected={connectionOk ? "true" : "false"}>
            <span aria-hidden="true" />{connection}
          </div>}
        </header>
        {persistent && <nav className={styles.switcher} aria-label="Área de importação">
          <button type="button" aria-controls="import-new" aria-pressed={area === "nova"} onClick={() => switchArea("nova")}>
            <NavigationIcon name="plus" size={17} />Nova importação</button>
          <button type="button" aria-controls="import-history" aria-pressed={area === "historico"} onClick={() => switchArea("historico")}>
            <NavigationIcon name="records" size={17} />Histórico</button>
        </nav>}
        <div id="import-new" hidden={area !== "nova"}>
          <ol className={styles.stepper} aria-label="Etapas da importação">
            {stages.map((label, i) => {
              const number = (i + 1) as Step;
              const done = number < w.reached || completed;
              return <li key={label}>
                <button type="button" aria-label={`Etapa ${number} · ${label}${done ? " (concluída)" : ""}`}
                  aria-current={number === step ? "step" : undefined} data-done={done}
                  disabled={number > w.reached || !!busy || completed} onClick={() => w.go(number)}>
                  <span aria-hidden="true">{done && number !== step ? "✓" : number}</span>{label}
                </button>
              </li>;
            })}
          </ol>
          <section className={styles.panel} aria-label={stages[step - 1]} aria-busy={!!busy}>
            <div className={styles.sectionHead}>
              <h2 ref={stepHeading} tabIndex={-1} className={completed ? "sr-only" : undefined}>
                {completed ? "Resultado da importação" : stages[step - 1]}
              </h2>
              {completed && <span className="sr-only">{file?.name}</span>}
            </div>
            <input ref={fileInput} className={styles.hidden} type="file" accept=".csv,.xlsx" aria-label="Arquivo CSV ou XLSX"
              disabled={w.persisting} onChange={event => { if (event.target.files?.length) void w.selectFiles(Array.from(event.target.files)); }} />
            {!file && <div className={styles.uploadGrid}>
              <div className={styles.dropTarget} data-dragging={dragging}
                onDragOver={event => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={event => { event.preventDefault(); setDragging(false); void w.selectFiles(Array.from(event.dataTransfer.files)); }}>
                <span className={styles.uploadIcon}><NavigationIcon name="upload" size={28} /></span>
                <div><h3>Arraste um arquivo para cá</h3><p>Envie um arquivo por vez.</p></div>
                <Button onClick={() => fileInput.current?.click()}>Selecionar arquivo</Button>
              </div>
              <aside className={styles.formats} aria-label="Formatos aceitos">
                <h3>Formatos aceitos</h3>
                <div><strong>CSV e XLSX</strong><small>{persistent ? "Até 8 MiB · 10 mil registros por planilha" : "Até 50 MB para leitura local"}</small></div>
                {combinedPcdf && <div><strong>CSV PCDF v1.0</strong><small>Até 16 MiB · 34 campos · 10 mil associações</small></div>}
                <Guide combinedPcdf={combinedPcdf} persistent={persistent} />
              </aside>
            </div>}
            {file && !completed && <div className={styles.selectedFile}>
              <span className={styles.fileIcon}><NavigationIcon name="records" size={21} /></span>
              <div><strong>{file.name}</strong><small>{pcdf ? "PCDF v1.0" : ext} · {formatBytes(file.size)}
                {preview && " · " + formatMonth(preview.month)}</small></div>
              <div className={styles.fileActions}>
                <Button variant="outline" size="sm" disabled={w.persisting} onClick={() => fileInput.current?.click()}>Substituir arquivo</Button>
                <Button variant="ghost" size="sm" disabled={w.persisting} onClick={w.reset}>Remover seleção</Button>
              </div>
            </div>}
            {busy && <p className={styles.progress} role="status"><span aria-hidden="true" />{busy}</p>}
            {error && <p role="alert" className={styles.feedbackError}>{error}</p>}
            {file && step === 1 && <div className={styles.stageActions}><Button onClick={() => w.go(2)}>Continuar para validação</Button></div>}
            {step === 2 && (pcdf ? <PcdfValidation workflow={w} /> : <GeneralValidation workflow={w} />)}
            {step === 3 && <>
              {preview && <>
                {w.warningGroup && <div className={styles.links}><span>Filtro · {w.warningGroup}</span>
                  <Button variant="ghost" size="sm" onClick={() => w.setWarningGroup("")}>Limpar filtro</Button></div>}
                <PcdfPreviewRecords key={w.warningGroup} headers={preview.headers} records={preview.records}
                  indices={w.warningGroup && w.warnings?.get(w.warningGroup) ? [...w.warnings.get(w.warningGroup)!.rows] : undefined} />
              </>}
              {analysis && table && <GeneralRecords analysis={analysis} columns={table.headers} />}
              <div className={styles.stageActions}>
                <Button variant="outline" onClick={() => w.go(2)}>Voltar à validação</Button>
                <Button disabled={!w.canConfirm || !!busy} onClick={() => w.go(4)}>Revisar confirmação</Button>
              </div>
            </>}
            {step === 4 && <Confirmation workflow={w} persistent={persistent} onHistory={() => switchArea("historico")} />}
          </section>
          {syntheticPcdf && <Link className={styles.template} href="/importar?origem=pcdf">Abrir ensaio PCDF sintético</Link>}
        </div>
        {persistent && <div id="import-history" hidden={area !== "historico"}>
          <ImportHistory current={history.current} reload={history.reload} />
        </div>}
      </div>
    </div>
  </div>;
}
