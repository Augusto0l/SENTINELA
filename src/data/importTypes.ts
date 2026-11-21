export const IMPORT_FIELDS = ["data", "horario", "naturezas", "ra", "local", "latitude", "longitude"] as const;
export type ImportField = typeof IMPORT_FIELDS[number];
export const REQUIRED_IMPORT_FIELDS: readonly ImportField[] = ["data", "horario", "naturezas", "ra", "local"];
export const IMPORT_LABELS: Record<ImportField, string> = {
  data: "Data", horario: "Horário", naturezas: "Naturezas criminais", ra: "Região Administrativa",
  local: "Local/endereço", latitude: "Latitude", longitude: "Longitude",
};
export const IMPORT_LIMITS = { rows: 10_000, columns: 64, cells: 200_000, cellLength: 4_000, text: 16 * 1024 * 1024, expanded: 100 * 1024 * 1024, timeout: 60_000 } as const;
export type ImportMapping = Record<ImportField, number>;
export type CsvDelimiter = ";" | "," | "\t";
export interface ImportCell { value: string | number | boolean | null; formula?: string; error?: boolean }
export interface ImportRow { line: number; cells: ImportCell[]; structuralError?: string }
export interface ImportTable {
  headers: string[]; headerLine: number; rows: ImportRow[]; date1904: boolean;
  sheetName: string; sheetNames: string[]; encoding?: string; sheetError?: string; delimiter?: CsvDelimiter;
}
export interface ImportIssue { field: ImportField | "linha"; column: number | null; message: string }
export interface ImportRecord {
  data: string; horario: string; naturezas: string[]; raCode: string; local: string;
  latitude: string; longitude: string;
}
export interface ValidatedImportRow {
  line: number; original: ImportCell[]; normalized: ImportRecord;
  status: "valido" | "invalido" | "pendente"; issues: ImportIssue[]; possibleDuplicateOf?: number;
}
export interface ImportAnalysis {
  mappingErrors: string[]; rows: ValidatedImportRow[];
  counts: { total: number; valid: number; invalid: number; pending: number; possibleDuplicates: number };
}
export interface ImportResult {
  total: number; simulated: number; pending: number; rejected: number; possibleDuplicates: number; persisted: false;
}
export type ImportWorkerRequest =
  | { type: "load"; file: File; delimiter?: CsvDelimiter; persistent?: boolean }
  | { type: "sheet"; name: string }
  | { type: "validate"; mapping: ImportMapping };
export type ImportWorkerResponse =
  | { type: "table"; table: Omit<ImportTable, "rows"> & { rowCount: number } }
  | { type: "analysis"; analysis: ImportAnalysis }
  | { type: "error"; message: string };
export interface ImportWorkerJob { id: number; request: ImportWorkerRequest }
export interface ImportWorkerReply { id: number; response: ImportWorkerResponse }
