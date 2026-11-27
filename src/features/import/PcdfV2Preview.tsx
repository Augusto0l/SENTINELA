"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Button from "@/components/ui/button";
import { pcdfV2Attachments, type PcdfV2Preview as Preview } from "@/data/pcdfV2";
import { Metrics, formatCount, formatMonth } from "./ImportUi";
import { PcdfPreviewRecords, summarizePcdfWarnings } from "./PcdfRecords";
import type { PcdfV2Files, PcdfV2WorkerResult } from "./pcdf-v2.worker";
import styles from "./ImportWorkflow.module.css";

export default function PcdfV2Preview({ csv, initialAttachments = [], reviewing, onInvalidate, onReview, onBack }: {
  csv: File; initialAttachments?: File[]; reviewing: boolean; onInvalidate: () => void; onReview: () => void; onBack: () => void;
}) {
  const [attachments, setAttachments] = useState(initialAttachments);
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const attachmentInput = useRef<HTMLInputElement>(null);
  const job = useRef<Worker | null>(null);
  useEffect(() => () => job.current?.terminate(), []);

  const warnings = useMemo(() => preview ? summarizePcdfWarnings(preview.headers, preview.records) : undefined, [preview]);
  const missing = pcdfV2Attachments.filter(name => !attachments.some(file => file.name === name));
  const writeStatus = "Confirmação indisponível. A gravação PCDF v2 no PostgreSQL operacional depende de homologação e autorização institucional.";

  function addAttachments(files: File[]) {
    if (!files.length) return;
    const names = new Set(files.map(file => file.name));
    setAttachments(previous => [...previous.filter(file => !names.has(file.name)), ...files]);
    setPreview(undefined);
    setError("");
    setFilter("");
    onInvalidate();
  }

  function validate() {
    job.current?.terminate();
    setPreview(undefined);
    setError("");
    setFilter("");
    setBusy(true);
    try {
      const worker = new Worker(new URL("./pcdf-v2.worker.ts", import.meta.url));
      job.current = worker;
      function finish() {
        worker.terminate();
        job.current = null;
        setBusy(false);
      }
      worker.onmessage = (event: MessageEvent<PcdfV2WorkerResult>) => {
        if (job.current !== worker) return;
        finish();
        if ("preview" in event.data) setPreview(event.data.preview);
        else setError(event.data.error);
      };
      worker.onerror = event => {
        event.preventDefault();
        if (job.current !== worker) return;
        finish();
        setError("Falha ao iniciar a validação local.");
      };
      worker.onmessageerror = () => {
        if (job.current !== worker) return;
        finish();
        setError("Não foi possível ler o resultado da validação local.");
      };
      worker.postMessage({ csv, attachments } satisfies PcdfV2Files);
    } catch {
      job.current?.terminate();
      job.current = null;
      setBusy(false);
      setError("Não foi possível iniciar a validação local.");
    }
  }

  if (reviewing && preview) return <>
    <p className={styles.muted}>PCDF v2.0 · {formatMonth(preview.month)} · {formatCount(preview.records.length)} associações · {formatCount(preview.occurrences)} ocorrências candidatas</p>
    <p className={styles.notice}>{writeStatus}</p>
    {filter && <div className={styles.links}>
      <span>Filtro · {filter}</span>
      <Button variant="ghost" size="sm" onClick={() => setFilter("")}>Limpar filtro</Button>
    </div>}
    <PcdfPreviewRecords key={filter} headers={preview.headers} records={preview.records}
      indices={filter ? [...(warnings?.get(filter)?.rows ?? [])] : undefined} />
    <div className={styles.stageActions}><Button variant="outline" onClick={onBack}>Voltar à validação</Button></div>
  </>;

  return <>
    <p className={styles.goodText}>Layout PCDF v2.0 reconhecido · 26 campos</p>
    <p className={styles.muted}>Prévia local no navegador · {csv.name} e {pcdfV2Attachments.length - missing.length} de {pcdfV2Attachments.length} anexos selecionados.</p>
    {missing.length > 0 && <p className={styles.feedbackWarning} role="status">
      Pacote incompleto. Faltam {missing.join(", ")}. Inclua o arquivo de quarentena mesmo quando estiver vazio.
    </p>}
    <div className={styles.stageActions}>
      <input ref={attachmentInput} className={styles.hidden} aria-label="Adicionar ou substituir anexos"
        type="file" accept=".json,.jsonl,.txt,.md" multiple disabled={busy} onChange={event => {
          addAttachments(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }} />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => attachmentInput.current?.click()}>
        {missing.length ? "Adicionar anexos" : "Substituir anexos"}
      </Button>
    </div>
    <p className={styles.notice}>{writeStatus}</p>
    {busy && <p className={styles.progress} role="status">Conferindo os hashes, os registros e a proveniência…</p>}
    {error && <p className={styles.feedbackError} role="alert">{error}</p>}
    {preview && <>
      <p role="status" className={styles.goodText}>Integridade do pacote e correspondência da proveniência conferidas.</p>
      <Metrics items={[
        { label: "Competência", value: formatMonth(preview.month) },
        { label: "Associações de natureza", value: formatCount(preview.records.length) },
        { label: "Ocorrências candidatas distintas", value: formatCount(preview.occurrences) },
        { label: "Naturezas originais distintas", value: formatCount(preview.natures) },
      ]} />
      <p className={styles.muted}>{formatCount(preview.multiNature)} candidatas com múltiplas naturezas · {formatCount(preview.repeatedNature)} repetições de chave e natureza para revisão · {formatCount(preview.missingCandidate)} associações sem chave candidata</p>
      <p className={styles.muted}>As contagens refletem este pacote. A confirmação de reenvios e divergências exige comparação com a custódia.</p>
      <details className={styles.disclosure}>
        <summary>Pendências de localização e quarentena temporal</summary>
        <Metrics items={[
          { label: "Referência geográfica pendente", value: formatCount(preview.coordinates.referencia_pendente ?? 0) },
          { label: "Coordenadas ausentes", value: formatCount(preview.coordinates.ausente ?? 0) },
          { label: "Coordenadas incompletas", value: formatCount(preview.coordinates.incompleta ?? 0) },
          { label: "Coordenadas inválidas", value: formatCount(preview.coordinates.invalida ?? 0) },
          { label: "Candidatos à revisão UTM sem GEO", value: formatCount(preview.utmWithoutGeo) },
          { label: "Associações em quarentena temporal", value: formatCount(preview.quarantine) },
        ]} />
        <p className={styles.muted}>As coordenadas mantêm os valores da fonte e aguardam validação espacial para uso no mapa. A quarentena temporal fica fora da contagem de associações do CSV.</p>
      </details>
      <details className={styles.disclosure}>
        <summary>Origem e versão do tratamento</summary>
        <p>{preview.source} · {preview.sheet} · {preview.treatment}</p>
        <p className={styles.breakWord}>SHA-256 declarado do XML · <code>{preview.sourceSha}</code></p>
      </details>
      {warnings && warnings.size > 0 && <details className={styles.disclosure}>
        <summary>Avisos e campos vazios</summary>
        {[...warnings].map(([category, info]) => <details key={category} className={styles.warningGroup}>
          <summary>{category} <span>{formatCount(info.rows.size)} associações</span></summary>
          <ul>{[...info.fields].map(([label, count]) => <li key={label}>{label} · {formatCount(count)}</li>)}</ul>
          <Button variant="ghost" size="sm" onClick={() => { setFilter(category); onReview(); }}>Ver registros</Button>
        </details>)}
      </details>}
    </>}
    <div className={styles.stageActions}>
      <Button variant={preview ? "outline" : "default"} disabled={busy || !!preview || missing.length > 0} onClick={validate}>Validar pacote v2</Button>
      {preview && <Button onClick={() => { setFilter(""); onReview(); }}>Revisar registros</Button>}
    </div>
  </>;
}
