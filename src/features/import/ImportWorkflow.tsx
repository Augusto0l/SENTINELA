"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import NavigationIcon from "@/components/NavigationIcon";
import Button from "@/components/ui/button";
import { useOperations } from "@/components/OperationalProvider";
import { actionAccess, hasPermission } from "@/lib/auth/policy";
import { ImportedFiles } from "@/features/occurrences/OccurrenceManagement";
import { directCsvLimit } from "@/contracts/pcdf-direct";
import { IMPORT_FIELDS, IMPORT_LABELS, REQUIRED_IMPORT_FIELDS, type CsvDelimiter } from "@/data/importTypes";
import GeneralRecords from "./GeneralRecords";
import ImportHistory, { ImportEntryDetails, useImportHistory } from "./ImportHistory";
import { Metrics, formatBytes, formatCount, formatMonth } from "./ImportUi";
import { PcdfPreviewRecords } from "./PcdfRecords";
import PcdfV2Preview from "./PcdfV2Preview";
import PcdfHistoricalQueue from "./PcdfHistoricalQueue";
import { useImportWorkflow, type Step } from "./useImportWorkflow";
import styles from "./ImportWorkflow.module.css";

const stages = ["Selecionar arquivo", "Validar arquivo", "Revisar registros", "Confirmar importação"] as const;
const pcdfV2Stages = ["Selecionar pacote", "Validar pacote", "Revisar registros"] as const;
type Workflow = ReturnType<typeof useImportWorkflow>;

// Two fictitious rows accepted by analyzeImport (src/data/importValidation.ts) in each mode.
const GUIDE_HEADERS = ["data", "horario", "natureza", "RA", "endereco", "latitude", "longitude"] as const;
const guideRows = (persistent: boolean) => [
  ["28/10/2026", "08:15", persistent ? "FURTO EM RESIDENCIA" : "Furto", "Plano Piloto", "Quadra fictícia 10, lote 5", "-15.7942", "-47.8822"],
  ["2026-10-28", "21:40", persistent ? "ROUBO A TRANSEUNTE|ROUBO DE VEICULO" : "Roubo|Ameaça", "RA-IX", "Avenida fictícia 20", "-15.8205", "-48.1083"],
];

function Guide({ combinedPcdf, persistent }: { combinedPcdf: boolean; persistent: boolean }) {
  return <details className={styles.help}>
    <summary>Como preparar o arquivo?</summary>
    <div className={styles.guide}>
      <h4>1. Estrutura</h4>
      <ul>
        <li>A primeira linha preenchida é o cabeçalho; cada linha seguinte é uma ocorrência.</li>
        <li>As colunas podem estar em qualquer ordem. O sistema sugere o mapeamento pelos nomes do cabeçalho, e você pode ajustá-lo na validação.</li>
        <li>Colunas extras são ignoradas. Cada coluna só pode ser associada a um campo.</li>
      </ul>
      <h4>2. Campos</h4>
      <ul>
        <li><strong>Obrigatórios:</strong> data, horário, natureza criminal, RA e local/endereço.</li>
        <li><strong>Opcionais:</strong> latitude e longitude. Sem as duas, o registro fica com pendência de localização.</li>
      </ul>
      <h4>3. Preenchimento</h4>
      <ul>
        <li><strong>Natureza:</strong> {persistent
          ? "use a descrição exatamente como no catálogo PCDF (mesma grafia e acentos), por exemplo FURTO EM RESIDENCIA."
          : "use uma natureza do catálogo demonstrativo, como Furto, Roubo ou Ameaça."} Para mais de uma, separe com | (até 32 por célula).</li>
        <li><strong>RA:</strong> informe o código (RA-IX) ou o nome (Ceilândia) de uma região do catálogo.</li>
        <li><strong>Local:</strong> endereço com 5 a 240 caracteres.</li>
        <li><strong>Coordenadas:</strong> decimais dentro do DF: latitude de -16,2 a -15,4 e longitude de -48,3 a -47,3.</li>
      </ul>
      <h4>4. Formatação</h4>
      <ul>
        <li><strong>Data:</strong> DD/MM/AAAA ou AAAA-MM-DD. No XLSX, células de data também são aceitas.</li>
        <li><strong>Horário:</strong> HH:mm de 00:00 a 23:59, com dois dígitos (08:15, não 8:15).</li>
        <li><strong>Coordenadas:</strong> ponto ou vírgula decimal, sem símbolos nem notação científica.</li>
        <li><strong>CSV:</strong> separador ponto e vírgula, vírgula ou tabulação; codificação UTF-8 ou Windows-1252. Se o separador também aparecer dentro de um valor, coloque o valor entre aspas.</li>
        <li><strong>XLSX:</strong> escolha a planilha de dados e use valores literais. Fórmulas e células com erro invalidam a linha.</li>
      </ul>
      <h4>5. Exemplo</h4>
      <div className={styles.guideTable}>
        <table>
          <thead><tr>{GUIDE_HEADERS.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead>
          <tbody>{guideRows(persistent).map(row => <tr key={row[0]}>{row.map((cell, index) => <td key={GUIDE_HEADERS[index]}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <h4>6. Cuidados</h4>
      <ul>
        <li>Linhas vazias, valores fora das regras e, no CSV, linhas com quantidade de colunas diferente do cabeçalho tornam o registro inválido; ele não é importado.</li>
        <li>Registros iguais em data, horário, naturezas, RA, local e coordenadas são sinalizados como possíveis duplicatas.</li>
        <li>Limites: {persistent ? "8 MiB por arquivo" : "50 MB por arquivo"}, 10 mil registros por planilha, 64 colunas e 4 mil caracteres por célula. Divida arquivos maiores.</li>
        <li>{persistent ? "Pendências sinalizam pontos para revisão. Os registros permanecem em origem e staging." : "A simulação analisa os registros na sessão."}</li>
      </ul>
      <h4>7. Importação PCDF</h4>
      <ul>
        {combinedPcdf && <li><strong>PCDF v1.0:</strong> CSV mensal com o nome mensal e os 34 campos na ordem original, até 16 MiB. O manifesto JSON é opcional.</li>}
        {combinedPcdf && <li><strong>PCDF v2.0:</strong> selecione só o CSV mensal de 26 campos, até 16 MiB. A gravação exige vínculo institucional de Administrador.</li>}
        <li>Use sempre &quot;Selecionar arquivo&quot;: o layout PCDF é reconhecido pelo cabeçalho. Mantenha o conteúdo original, sem editar colunas.</li>
      </ul>
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
  const summary = preview && "standalone" in preview ? preview.standalone : undefined;
  return <>
    {preview && <>
      <p className={w.pcdfValidated ? styles.goodText : styles.warningText}>
        {summary ? "Layout PCDF v2.0 reconhecido" : w.pcdfValidated ? "Layout PCDF v1.0 reconhecido" : "Última prévia disponível. Valide a seleção para confirmar."}
      </p>
      <Metrics items={[
        { label: "Competência", value: formatMonth(preview.month) },
        { label: "Associações", value: formatCount(preview.records.length) },
        { label: "Campos", value: preview.headers.length },
        { label: "Tamanho", value: formatBytes(preview.bytes) },
      ]} />
      <p className={styles.muted}>{formatCount(preview.bytes)} bytes · {formatCount(w.pcdfIssues)} avisos de validação</p>
      {summary && <>
        <Metrics items={[
          { label: "Válidas sem pendências", value: formatCount(summary.valid) },
          { label: "Com pendências", value: formatCount(summary.pending) },
          { label: "Inválidas", value: formatCount(summary.invalid) },
          { label: "Ocorrências candidatas", value: formatCount(summary.candidates) },
          { label: "Consolidadas nesta importação", value: 0 },
        ]} />
        <p className={styles.breakWord}>SHA-256 do CSV {preview.sha256}</p>
        {summary.duplicates > 0 && <p className={styles.warningText}>{formatCount(summary.duplicates)} linhas com origem repetida.</p>}
        {summary.errors.length > 0 && <details className={styles.disclosure} open>
          <summary>Erros que impedem a gravação</summary>
          <ul>{summary.errors.map(({ row, field, message }) => <li key={`${row}-${field}`}>
            Associação {row} · {field} · {message}
          </li>)}</ul>
          {summary.errors.length === 100 && <p>Exibindo até 100 erros. Revise as linhas sinalizadas na prévia.</p>}
        </details>}
      </>}
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
    {!w.standalone && <details className={styles.disclosure}>
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
    </details>}
    <div className={styles.stageActions}>
      {!w.pcdfValidated && w.error && file.size <= directCsvLimit && <Button variant="outline" disabled={!!w.busy}
        onClick={() => void w.validatePcdf(file, w.manifest)}>Validar novamente</Button>}
      {preview && <Button disabled={!!w.busy} onClick={() => { w.setWarningGroup(""); w.go(3); }}>Revisar registros</Button>}
    </div>
  </>;
}

function Confirmation({ workflow: w, persistent, hosted, onHistory, writeBlocked }: {
  workflow: Workflow; persistent: boolean; hosted: boolean; onHistory: () => void; writeBlocked?: string;
}) {
  const [details, setDetails] = useState(false);
  const { file, receipt, result, preview, analysis, table } = w;
  if (!file) return null;
  const pcdf = receipt && "pcdf" in receipt ? receipt.pcdf : undefined;
  const general = receipt && "general" in receipt ? receipt.general : undefined;
  const records = pcdf?.records ?? general?.persisted;
  const issues = pcdf?.issues ?? general?.summary.issues;
  const destination = hosted ? "PostgreSQL hospedado" : persistent ? "PostgreSQL local" : "Simulação";
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
    <div className={styles.destination}><NavigationIcon name="shield" size={20} /><div><strong>{destination}</strong>
      <p>{writeBlocked ?? (persistent ? "A confirmação grava em origem e staging para revisão." : "O resultado fica disponível nesta sessão.")}</p></div></div>
    <div className={styles.stageActions}>
      <Button variant="outline" disabled={w.persisting} onClick={() => w.go(3)}>Voltar e revisar</Button>
      <Button disabled={!!w.busy || !w.canConfirm || !!writeBlocked} onClick={() => void w.confirm()}>
        {w.persisting ? "Gravando…" : persistent ? "Confirmar importação" : "Confirmar simulação"}
      </Button>
    </div>
  </>;
}

export default function ImportWorkflow({ persistent = false, syntheticPcdf = false, combinedPcdf = false, hosted = false, configurationError, writeBlocked, blockAllWrites }: {
  persistent?: boolean; syntheticPcdf?: boolean; combinedPcdf?: boolean; configurationError?: string; writeBlocked?: string;
  blockAllWrites?: boolean; hosted?: boolean;
}) {
  const { role } = useOperations();
  const access = actionAccess(role, "importar");
  const fileInput = useRef<HTMLInputElement>(null);
  const available = access.enabled && !configurationError;
  const selectionAvailable = access.enabled && (available || combinedPcdf);
  const w = useImportWorkflow({ allowed: available, persistent, combinedPcdf,
    clearInput: () => {
      if (fileInput.current) fileInput.current.value = "";
    } });
  const [area, setArea] = useState<"mensal" | "nova" | "historico">(hosted ? "mensal" : "nova");
  const [managementRevision, setManagementRevision] = useState(0);
  const [saved, setSaved] = useState("");
  const [dragging, setDragging] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const history = useImportHistory(persistent && available, combinedPcdf, w.historyRevision + managementRevision);
  const { step, busy, error, file, pcdf, preview, analysis, table, receipt, result } = w;
  const completed = !!(receipt || result);
  const stageLabels = w.pcdfV2 ? pcdfV2Stages : stages;
  useEffect(() => {
    if (area === "nova" && (step > 1 || completed)) stepHeading.current?.focus();
  }, [area, step, completed]);
  const current = history.current;
  const connection = w.pcdfV2 ? "Prévia local · sem gravação"
    : configurationError ? "Inicialização local necessária"
    : !current ? "Verificando PostgreSQL"
    : current.connected ? current.errors.length ? "PostgreSQL conectado · histórico parcial" : "PostgreSQL conectado"
    : current.errors.some(error => error.status === 401) ? "Sessão expirada"
    : current.errors.every(error => error.status === 403) ? "Acesso restrito" : "Conexão indisponível";
  const ext = file?.name.toLowerCase().endsWith(".xlsx") ? "XLSX" : "CSV";
  if (!access.enabled) return <p role="alert">{access.reason}</p>;

  function switchArea(next: typeof area) {
    setArea(next);
    setSaved("");
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
          {persistent && <div role="status" className={styles.connection} data-connected={!w.pcdfV2 && current?.connected ? "true" : "false"}>
            <span aria-hidden="true" />{connection}
          </div>}
        </header>
        {persistent && <nav className={styles.switcher} aria-label="Área de importação">
          {hosted && <button type="button" aria-controls="import-monthly" aria-pressed={area === "mensal"} onClick={() => switchArea("mensal")}>
            <NavigationIcon name="records" size={17} />PCDF mensal</button>}
          <button type="button" aria-controls="import-new" aria-pressed={area === "nova"} onClick={() => switchArea("nova")}>
            <NavigationIcon name="plus" size={17} />Nova importação</button>
          <button type="button" aria-controls="import-history" aria-pressed={area === "historico"} disabled={!available} onClick={() => switchArea("historico")}>
            <NavigationIcon name="records" size={17} />Histórico</button>
        </nav>}
        {hosted && <div id="import-monthly" hidden={area !== "mensal"}>
          <PcdfHistoricalQueue onComplete={() => setManagementRevision(value => value + 1)} />
        </div>}
        <div id="import-new" hidden={area !== "nova"}>
          {configurationError && !w.pcdfV2 && <p role="alert" className={styles.feedbackError}>{configurationError}</p>}
          <ol className={styles.stepper} aria-label="Etapas da importação">
            {stageLabels.map((label, i) => {
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
          <section className={styles.panel} aria-label={stageLabels[step - 1]} aria-busy={!!busy}>
            <div className={styles.sectionHead}>
              <h2 ref={stepHeading} tabIndex={-1} className={completed ? "sr-only" : undefined}>
                {completed ? "Resultado da importação" : stageLabels[step - 1]}
              </h2>
              {completed && <span className="sr-only">{file?.name}</span>}
            </div>
            <input ref={fileInput} className={styles.hidden} type="file" accept=".csv,.xlsx" aria-label="Arquivo CSV ou XLSX"
              disabled={!selectionAvailable || w.persisting} onChange={event => { if (event.target.files?.length) void w.selectFiles(Array.from(event.target.files)); }} />
            {!file && <div className={styles.uploadGrid}>
              <div className={styles.dropTarget} data-dragging={dragging}
                onDragOver={event => { event.preventDefault(); if (selectionAvailable) setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={event => {
                  event.preventDefault();
                  setDragging(false);
                  // One file at a time: several dropped files are rejected with the single-file message.
                  const files = Array.from(event.dataTransfer.files);
                  if (selectionAvailable) void w.selectFiles(files.length === 1 ? files : []);
                }}>
                <span className={styles.uploadIcon}><NavigationIcon name="upload" size={28} /></span>
                <div><h3>Arraste um arquivo CSV ou XLSX</h3><p>O formato e o layout (geral, PCDF v1.0 ou PCDF v2.0) são identificados automaticamente.</p></div>
                <div className={styles.fileActions}>
                  <Button disabled={!selectionAvailable} onClick={() => fileInput.current?.click()}>Selecionar arquivo</Button>
                </div>
              </div>
              <aside className={styles.formats} aria-label="Formatos aceitos">
                <h3>Formatos aceitos</h3>
                <div><strong>CSV (.csv)</strong><small>{persistent ? "Até 8 MiB" : "Até 50 MB para leitura local"} · separador ; , ou tabulação</small></div>
                <div><strong>Excel (.xlsx)</strong><small>{persistent ? "Até 8 MiB" : "Até 50 MB para leitura local"} · 10 mil registros por planilha</small></div>
                <Guide combinedPcdf={combinedPcdf} persistent={persistent} />
              </aside>
            </div>}
            {file && !completed && <div className={styles.selectedFile}>
              <span className={styles.fileIcon}><NavigationIcon name="records" size={21} /></span>
              <div><strong>{file.name}</strong><small>{w.pcdfV2 || w.standalone ? "PCDF v2.0" : pcdf ? "PCDF v1.0" : ext} · {formatBytes(file.size)}
                {preview && " · " + formatMonth(preview.month)}</small></div>
              <div className={styles.fileActions}>
                <Button variant="outline" size="sm" disabled={w.persisting} onClick={() => fileInput.current?.click()}>Substituir arquivo</Button>
                <Button variant="ghost" size="sm" disabled={w.persisting} onClick={w.reset}>Remover seleção</Button>
              </div>
            </div>}
            {busy && <p className={styles.progress} role="status"><span aria-hidden="true" />{busy}</p>}
            {error && <p role="alert" className={styles.feedbackError}>{error}</p>}
            {file && step === 1 && <div className={styles.stageActions}><Button onClick={() => w.go(2)}>Continuar para validação</Button></div>}
            {file && w.pcdfV2 && <div hidden={step === 1}>
              <PcdfV2Preview csv={file} initialAttachments={w.pcdfV2Parts} reviewing={step === 3}
                onInvalidate={w.invalidatePcdfV2} onReview={() => w.go(3)} onBack={() => w.go(2)} />
            </div>}
            {step === 2 && !w.pcdfV2 && (pcdf ? <PcdfValidation workflow={w} /> : <GeneralValidation workflow={w} />)}
            {step === 3 && !w.pcdfV2 && <>
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
            {step === 4 && !w.pcdfV2 && <Confirmation workflow={w} persistent={persistent} hosted={hosted}
              writeBlocked={w.standalone && !blockAllWrites ? undefined : writeBlocked} onHistory={() => switchArea("historico")} />}
          </section>
          {syntheticPcdf && <Link className={styles.template} href="/importar?origem=pcdf">Abrir ensaio PCDF sintético</Link>}
        </div>
        {persistent && <div id="import-history" hidden={area !== "historico"}>
          {saved && <p role="status">{saved}</p>}
          {combinedPcdf ? <ImportedFiles active={area === "historico"} canRead={available} hosted={hosted}
            admin={hasPermission(role, "administrar")} cycle={w.historyRevision + managementRevision} importHistory={history}
            onRetry={() => setManagementRevision(value => value + 1)}
            onChanged={(message = "Alteração registrada com auditoria.") => {
              setSaved(message); setManagementRevision(value => value + 1); history.reload()
            }} />
            : <ImportHistory current={history.current} reload={history.reload} />}
        </div>}
      </div>
    </div>
  </div>;
}
