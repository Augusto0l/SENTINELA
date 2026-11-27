import { SSF } from "xlsx";
import { occurrenceSchema } from "@/data/occurrenceForm";
import { CRIME_NATURES, RA_LIST } from "@/data/mockData";
import { pcdfNatureDescriptions } from "@/data/pcdfNatureCatalog";
import { IMPORT_FIELDS, IMPORT_LABELS, REQUIRED_IMPORT_FIELDS } from "@/data/importTypes";
import type { ImportAnalysis, ImportField, ImportMapping, ImportResult, ImportTable, ValidatedImportRow } from "@/data/importTypes";

export function normalizeImportName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
const aliases: Record<ImportField, string[]> = {
  data: ["data", "data da ocorrência", "data ocorrência", "dt ocorrência", "data fato", "data do fato"],
  horario: ["hora", "horário", "hora da ocorrência", "hora ocorrência", "hora fato"],
  naturezas: ["natureza_original", "natureza", "naturezas", "natureza criminal", "naturezas criminais", "tipo do crime", "tipo de crime", "crime"],
  ra: ["RA", "região administrativa", "regiao_administrativa", "raCode", "código RA"],
  local: ["local", "endereço", "endereço/local", "local/endereço", "logradouro", "local da ocorrência"],
  latitude: ["latitude", "lat"], longitude: ["longitude", "lon", "lng", "long"],
};
export function autoMapImport(headers: string[]): ImportMapping {
  return Object.fromEntries(IMPORT_FIELDS.map(field => {
    const matches = headers.flatMap((header, index) => aliases[field].some(alias => normalizeImportName(alias) === normalizeImportName(header)) ? [index] : []);
    return [field, matches.length === 1 ? matches[0] : -1];
  })) as ImportMapping;
}
export function importMappingErrors(headers: string[], mapping: ImportMapping): string[] {
  const errors: string[] = [];
  const used = new Set<number>();
  for (const field of IMPORT_FIELDS) {
    const column = mapping[field];
    if (!Number.isInteger(column) || column < -1 || column >= headers.length) {
      errors.push(`Coluna inválida para ${IMPORT_LABELS[field]}.`);
    } else if (column === -1) {
      if (REQUIRED_IMPORT_FIELDS.includes(field)) errors.push(`Mapeie o campo obrigatório ${IMPORT_LABELS[field]}.`);
    } else if (used.has(column)) {
      errors.push(`A coluna ${column + 1} foi associada a mais de um campo.`);
    } else used.add(column);
  }
  return errors;
}
function normalizedDate(value: string | number | boolean | null, date1904: boolean): string {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 2958466) {
    const date = SSF.parse_date_code(value, { date1904 });
    if (date) return `${String(date.d).padStart(2, "0")}/${String(date.m).padStart(2, "0")}/${String(date.y).padStart(4, "0")}`;
  }
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text.split("-").reverse().join("/") : text;
}
function normalizedTime(value: string | number | boolean | null): string {
  if (typeof value === "number" && value >= 0 && value < 1 && Math.abs(value * 1440 - Math.round(value * 1440)) < 0.00001) {
    const minutes = Math.round(value * 1440);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  return String(value ?? "").trim();
}
export function analyzeImport(table: ImportTable, mapping: ImportMapping, persistent = false): ImportAnalysis {
  const mappingErrors = importMappingErrors(table.headers, mapping);
  const counts = { total: table.rows.length, valid: 0, invalid: 0, pending: 0, possibleDuplicates: 0 };
  if (mappingErrors.length) return { mappingErrors, rows: [], counts };
  const seen = new Map<string, number>();
  const rows = table.rows.map((row): ValidatedImportRow => {
    const value = (field: ImportField) => row.cells[mapping[field]]?.value ?? "";
    const text = (field: ImportField) => String(value(field)).trim();
    const ra = RA_LIST.find(item => [item.codigo, item.nome, item.nomeDisplay].some(name => normalizeImportName(name) === normalizeImportName(text("ra"))));
    const rawNatures = text("naturezas").split(/[|;]/);
    const naturezas = rawNatures.slice(0, 32).map(item => item.trim()).map(item => persistent ? item
      : CRIME_NATURES.find(nature => normalizeImportName(nature) === normalizeImportName(item)) ?? item);
    const normalized = {
      data: normalizedDate(value("data"), table.date1904), horario: normalizedTime(value("horario")),
      naturezas: [...new Set(naturezas)], raCode: ra?.codigo ?? text("ra"), local: text("local"),
      latitude: text("latitude").replace(",", "."), longitude: text("longitude").replace(",", "."),
    };
    const result: ValidatedImportRow = { line: row.line, original: row.cells, normalized, status: "valido", issues: [] };
    const add = (field: ImportField | "linha", message: string, column = field === "linha" ? null : mapping[field] < 0 ? null : mapping[field] + 1) => {
      result.issues.push({ field, column, message });
    };
    if (rawNatures.length > 32) add("naturezas", "A célula excede o limite de 32 itens de natureza. Revise os separadores e as repetições; a linha não será aceita.");
    if (row.structuralError) add("linha", row.structuralError);
    if (row.cells.every(cell => cell.value === null || String(cell.value).trim() === "")) add("linha", "Linha vazia.");
    row.cells.forEach((cell, index) => {
      if (cell.formula) add("linha", "Fórmula não aceita; substitua pelo valor literal.", index + 1);
      if (cell.error) add("linha", "Célula contém erro do Excel.", index + 1);
    });
    for (const field of ["data", "horario", "raCode", "local", "latitude", "longitude"] as const) {
      if ((field === "latitude" || field === "longitude") && !normalized[field]) continue;
      const parsed = occurrenceSchema.shape[field].safeParse(normalized[field]);
      if (!parsed.success) for (const issue of parsed.error.issues) add(field === "raCode" ? "ra" : field, issue.message);
    }
    for (const nature of naturezas) {
      const recognized = persistent ? pcdfNatureDescriptions.has(nature) : occurrenceSchema.shape.natureza.safeParse(nature).success;
      if (!recognized) add("naturezas", `Natureza fora do catálogo ${persistent ? "PCDF" : "demonstrativo"}: ${nature || "(vazia)"}.`);
    }
    for (const field of ["latitude", "longitude"] as const) {
      if (normalized[field] && !/^-?\d+(\.\d+)?$/.test(normalized[field])) add(field, "Use uma coordenada decimal, sem símbolos ou notação científica.");
    }
    const missingLocation = !normalized.latitude || !normalized.longitude;
    result.status = result.issues.length ? "invalido" : missingLocation ? "pendente" : "valido";
    if (result.status === "pendente") {
      if (!normalized.latitude) add("latitude", "Latitude ausente: pendência de localização.");
      if (!normalized.longitude) add("longitude", "Longitude ausente: pendência de localização.");
    }
    if (result.status !== "invalido") {
      const key = JSON.stringify([normalized.data, normalized.horario, [...normalized.naturezas].sort(), normalized.raCode, normalizeImportName(normalized.local), normalized.latitude, normalized.longitude]);
      const previous = seen.get(key);
      if (previous !== undefined) { result.possibleDuplicateOf = previous; counts.possibleDuplicates++; }
      else seen.set(key, row.line);
    }
    counts[result.status === "valido" ? "valid" : result.status === "pendente" ? "pending" : "invalid"]++;
    return result;
  });
  return { mappingErrors, rows, counts };
}

/** Resultado somente em memória: pendências não são promovidas a ocorrências válidas. */
export function simulateImportConfirmation(analysis: ImportAnalysis): ImportResult {
  if (analysis.mappingErrors.length || analysis.counts.valid + analysis.counts.pending === 0) throw new Error("Não há registros aptos ou pendentes para simular. Corrija o arquivo ou o mapeamento.");
  return { total: analysis.counts.total, simulated: analysis.counts.valid, pending: analysis.counts.pending,
    rejected: analysis.counts.invalid, possibleDuplicates: analysis.counts.possibleDuplicates, persisted: false };
}
