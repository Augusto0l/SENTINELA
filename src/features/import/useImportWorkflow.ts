"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import { directCsvLimit, directManifestLimit, type directPreview, type directReceipt } from "@/contracts/pcdf-direct";
import { generalFormats, generalImportPath, generalReceipt, generalUploadHeader, generalUploadLimit } from "@/contracts/general-import";
import { validateImportFiles } from "@/data/importFile";
import { isInstitutionalPcdf } from "@/data/importSource";
import { autoMapImport, importMappingErrors, simulateImportConfirmation } from "@/data/importValidation";
import { IMPORT_FIELDS, type CsvDelimiter, type ImportAnalysis, type ImportMapping, type ImportResult, type ImportTable,
  type ImportWorkerRequest } from "@/data/importTypes";
import { createImportWorkerClient, type ImportWorkerClient } from "./importWorkerClient";
import { requestPcdf } from "./pcdf-client";
import { confirmPcdf, previewPcdf } from "./pcdf-intake-client";
import { summarizePcdfWarnings } from "./PcdfRecords";

type TableMetadata = Omit<ImportTable, "rows"> & { rowCount: number };
export type Step = 1 | 2 | 3 | 4;
const emptyMapping = () => Object.fromEntries(IMPORT_FIELDS.map(field => [field, -1])) as ImportMapping;
type Receipt = { pcdf: z.infer<typeof directReceipt> } | { general: z.infer<typeof generalReceipt> };
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export function useImportWorkflow({ persistent, combinedPcdf, allowed, clearInput }: {
  persistent: boolean; combinedPcdf: boolean; allowed: boolean; clearInput: () => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [reached, setReached] = useState<Step>(1);
  const [file, setFile] = useState<File>();
  const [pcdf, setPcdf] = useState(false);
  const [manifest, setManifest] = useState<File>();
  const [preview, setPreview] = useState<z.infer<typeof directPreview>>();
  const [pcdfValidated, setPcdfValidated] = useState(false);
  const [warningGroup, setWarningGroup] = useState("");
  const [table, setTable] = useState<TableMetadata>();
  const [mapping, setMapping] = useState<ImportMapping>(emptyMapping);
  const [analysis, setAnalysis] = useState<ImportAnalysis>();
  const [result, setResult] = useState<ImportResult>();
  const [receipt, setReceipt] = useState<Receipt>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [persisting, setPersisting] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [delimiter, setDelimiter] = useState<CsvDelimiter>();
  const uploadKey = useRef<string | undefined>(undefined);
  const saving = useRef(false);
  const client = useRef<ImportWorkerClient | null>(null);
  const pcdfRequest = useRef<AbortController | null>(null);
  const selection = useRef(0);

  useEffect(() => () => {
    client.current?.cancel();
    pcdfRequest.current?.abort();
  }, []);

  function go(next: Step) {
    setStep(next);
    setReached(previous => previous >= next ? previous : next);
  }

  function reset() {
    if (saving.current) return;
    selection.current++;
    client.current?.cancel();
    pcdfRequest.current?.abort();
    setFile(undefined);
    setPcdf(false);
    setManifest(undefined);
    setPreview(undefined);
    setPcdfValidated(false);
    setWarningGroup("");
    setTable(undefined);
    setMapping(emptyMapping());
    setAnalysis(undefined);
    setResult(undefined);
    setReceipt(undefined);
    setBusy("");
    setError("");
    uploadKey.current = undefined;
    setStep(1);
    setReached(1);
    clearInput();
  }

  function fail(reason: string) {
    client.current?.cancel();
    setBusy("");
    setAnalysis(undefined);
    setError(reason);
  }

  function send(request: ImportWorkerRequest, label: string) {
    if (!allowed || saving.current) return;
    setError("");
    if (!client.current) { fail("O processamento foi encerrado. Selecione o arquivo novamente."); return; }
    client.current.send(request, label);
  }

  async function validatePcdf(chosen: File, technicalManifest?: File) {
    pcdfRequest.current?.abort();
    setManifest(technicalManifest);
    setPcdfValidated(false);
    setWarningGroup("");
    setReached(2);
    setError("");
    if (technicalManifest && (technicalManifest.size > directManifestLimit || technicalManifest.size === 0)) {
      setError("Selecione um manifesto JSON válido de até 1 MiB.");
      setBusy("");
      return;
    }
    const controller = new AbortController();
    pcdfRequest.current = controller;
    setBusy("Validando o layout e a integridade do CSV PCDF…");
    try {
      const parsed = await previewPcdf(chosen, technicalManifest, controller.signal);
      if (controller.signal.aborted) return;
      setPreview(parsed);
      setPcdfValidated(true);
    } catch (failure) {
      if (!controller.signal.aborted) setError(message(failure, "Falha na validação do CSV PCDF."));
    } finally {
      if (!controller.signal.aborted) setBusy("");
    }
  }

  async function selectFiles(files: File[], selectedDelimiter?: CsvDelimiter) {
    if (!allowed || saving.current) return;
    reset();
    setDelimiter(selectedDelimiter);
    const invalid = validateImportFiles(files);
    if (invalid) { setError(invalid); return; }
    const chosen = files[0];
    setFile(chosen);
    go(2);
    if (combinedPcdf && chosen.name.toLowerCase().endsWith(".csv")) {
      const current = selection.current;
      setBusy("Identificando o formato do CSV…");
      try {
        const header = (await chosen.slice(0, 16384).text()).split(/\r?\n/, 1)[0];
        if (selection.current !== current) return;
        if (isInstitutionalPcdf(chosen.name, header.split(/[;,\t]/))) {
          setPcdf(true);
          if (chosen.size > directCsvLimit) { fail("O CSV PCDF excede 16 MiB."); return; }
          await validatePcdf(chosen);
          return;
        }
      } catch {
        if (selection.current === current) fail("Não foi possível ler o cabeçalho do arquivo.");
        return;
      }
    }
    if (persistent && chosen.size > generalUploadLimit) { fail("O arquivo geral excede 8 MiB."); return; }
    client.current ??= createImportWorkerClient({
      createWorker: () => new Worker(new URL("./import.worker.ts", import.meta.url)),
      onBusy: setBusy,
      onError: fail,
      onResponse: response => {
        if (response.type === "table") {
          setTable(response.table);
          setMapping(autoMapImport(response.table.headers));
          setAnalysis(undefined);
        } else {
          setAnalysis(response.analysis);
        }
      },
    });
    client.current.start({ type: "load", file: chosen, delimiter: selectedDelimiter, persistent }, "Lendo arquivo e identificando colunas…");
  }

  function invalidateMapping() {
    uploadKey.current = undefined;
    setAnalysis(undefined);
    setReached(2);
  }

  function chooseSheet(name: string) {
    if (!table) return;
    invalidateMapping();
    setTable({ ...table, sheetName: name, headers: [], rowCount: 0, sheetError: undefined });
    send({ type: "sheet", name }, "Lendo planilha…");
  }

  const mappingErrors = table?.headers.length ? importMappingErrors(table.headers, mapping) : [];
  const warnings = useMemo(() => preview ? summarizePcdfWarnings(preview.headers, preview.records) : undefined, [preview]);
  const pcdfIssues = useMemo(() => preview?.records.reduce((total, row) => total + row.issues.length, 0) ?? 0, [preview]);
  const canConfirm = pcdf ? pcdfValidated && !!preview
    : !!analysis && !analysis.mappingErrors.length && (persistent ? analysis.counts.total > 0 : analysis.counts.valid + analysis.counts.pending > 0);

  async function confirm() {
    if (!allowed || !file || !canConfirm || saving.current || receipt || result) return;
    if (!persistent && analysis) {
      setResult(simulateImportConfirmation(analysis));
      return;
    }
    saving.current = true;
    setPersisting(true);
    setBusy("Aguardando validação, gravação e reconciliação no PostgreSQL…");
    setError("");
    try {
      if (pcdf && preview) {
        setReceipt({ pcdf: await confirmPcdf(file, preview, manifest) });
      } else if (table) {
        uploadKey.current ??= crypto.randomUUID();
        const data = await requestPcdf(generalImportPath, generalReceipt, { method: "POST", body: file, headers: {
          "content-type": file.name.toLowerCase().endsWith(".csv") ? generalFormats.csv : generalFormats.xlsx,
          "idempotency-key": uploadKey.current,
          [generalUploadHeader]: encodeURIComponent(JSON.stringify({ name: file.name, sheet: table.sheetName, delimiter: table.delimiter, mapping })),
        } });
        setReceipt({ general: data });
      }
    } catch (failure) {
      setError(message(failure, "Gravação sem confirmação. Consulte o histórico antes de reenviar."));
    } finally {
      saving.current = false;
      setPersisting(false);
      setBusy("");
      setHistoryRevision(value => value + 1);
    }
  }

  return {
    step, reached, go, file, pcdf, manifest, preview, pcdfValidated, warningGroup, setWarningGroup, warnings,
    validatePcdf, pcdfIssues, table, mapping, mappingErrors, chooseSheet, analysis, invalidateMapping,
    changeMapping: (field: keyof ImportMapping, index: number) => { invalidateMapping(); setMapping({ ...mapping, [field]: index }); },
    validateGeneral: () => send({ type: "validate", mapping }, "Validando os registros…"),
    result, receipt, busy, error, persisting, historyRevision, delimiter,
    reset, selectFiles, canConfirm, confirm,
  };
}
