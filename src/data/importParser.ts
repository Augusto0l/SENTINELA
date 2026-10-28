import { read, utils } from "xlsx";
import type { WorkBook } from "xlsx";
import { IMPORT_LIMITS } from "@/data/importTypes";
import type { ImportCell, ImportRow, ImportTable } from "@/data/importTypes";
import { validateImportFiles } from "@/data/importFile";

function checkCellLimits(rows: ImportRow[]) {
  let cells = 0, text = 0;
  for (const row of rows) {
    if (row.cells.length > IMPORT_LIMITS.columns) throw new Error(`Limite demonstrativo: ${IMPORT_LIMITS.columns} colunas.`);
    cells += row.cells.length;
    for (const cell of row.cells) {
      const length = String(cell.value ?? "").length + (cell.formula?.length ?? 0);
      if (length > IMPORT_LIMITS.cellLength) throw new Error(`Célula muito longa na linha ${row.line}; limite de ${IMPORT_LIMITS.cellLength} caracteres.`);
      text += length;
    }
    if (cells > IMPORT_LIMITS.cells || text > IMPORT_LIMITS.text) throw new Error("Conteúdo excede os limites de memória da demonstração (200 mil células / 16 Mi caracteres).");
  }
}
function tableFromRows(rows: ImportRow[], metadata: Omit<ImportTable, "headers" | "headerLine" | "rows">): ImportTable {
  const first = rows.findIndex(row => row.cells.some(cell => cell.value !== null && String(cell.value).trim() !== ""));
  if (first < 0) throw new Error("Arquivo ou planilha sem conteúdo.");
  const header = rows[first];
  if (header.cells.some(cell => cell.formula || cell.error)) throw new Error("Cabeçalhos devem ser textos literais, sem fórmulas ou erros.");
  const headers = header.cells.map(cell => String(cell.value ?? ""));
  if (headers.length < 2) throw new Error("Não foi possível identificar colunas. Use CSV separado por vírgula, ponto e vírgula ou tabulação.");
  const records = rows.slice(first + 1);
  if (!records.length || records.every(row => row.cells.every(cell => String(cell.value ?? "").trim() === ""))) throw new Error("O arquivo contém cabeçalhos, mas não contém registros.");
  if (records.length > IMPORT_LIMITS.rows) throw new Error(`Limite demonstrativo: ${IMPORT_LIMITS.rows.toLocaleString("pt-BR")} registros por planilha. Divida o arquivo.`);
  checkCellLimits(rows);
  return { ...metadata, headers, headerLine: header.line, rows: records };
}
function detectDelimiter(text: string): string {
  let quoted = false;
  const scores = new Map([[";", 0], [",", 0], ["\t", 0]]);
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { index++; continue; }
      quoted = !quoted;
    }
    if (!quoted) {
      if (scores.has(char)) scores.set(char, scores.get(char)! + 1);
      if (char === "\n" || char === "\r") {
        if ([...scores.values()].some(score => score > 0)) break;
      }
    }
  }
  const [delimiter, score] = [...scores].sort((a, b) => b[1] - a[1])[0];
  if (score === 0) throw new Error("CSV sem separador reconhecido (vírgula, ponto e vírgula ou tabulação).");
  return delimiter;
}
export function parseImportCsv(input: string, encoding = "UTF-8"): ImportTable {
  const text = input.replace(/^\uFEFF/, "");
  if (!text.trim()) throw new Error("Arquivo CSV vazio.");
  if (text.includes("\0")) throw new Error("CSV inválido: conteúdo binário ou codificação não suportada.");
  const delimiter = detectDelimiter(text);
  const rows: ImportRow[] = [];
  let cells: ImportCell[] = [], value = "", quoted = false, closed = false, line = 1, rowLine = 1, totalCells = 0, totalText = 0;
  const endCell = () => {
    cells.push({ value }); totalCells++; totalText += value.length; value = ""; closed = false;
    if (cells.length > IMPORT_LIMITS.columns || totalCells > IMPORT_LIMITS.cells || totalText > IMPORT_LIMITS.text) throw new Error("CSV excede o limite de colunas, células ou texto da demonstração.");
  };
  const endRow = () => {
    endCell();
    // O prefixo vazio consome os limites de células/texto, mas não o de registros.
    const emptyBeforeHeader = rows.length === 0 && cells.every(cell => String(cell.value ?? "").trim() === "");
    if (!emptyBeforeHeader) rows.push({ line: rowLine, cells });
    cells = [];
    if (rows.length > IMPORT_LIMITS.rows + 1) throw new Error(`Limite demonstrativo: ${IMPORT_LIMITS.rows} registros. Divida o CSV.`);
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { value += '"'; index++; }
        else { quoted = false; closed = true; }
      } else { value += char; if (char === "\n" || (char === "\r" && text[index + 1] !== "\n")) line++; }
    } else if (char === delimiter) endCell();
    else if (char === "\r" || char === "\n") {
      endRow(); if (char === "\r" && text[index + 1] === "\n") index++;
      line++; rowLine = line;
    } else if (char === '"') {
      if (value.length || closed) throw new Error(`CSV inválido: aspas inesperadas na linha ${line}.`);
      quoted = true;
    } else {
      if (closed && char.trim()) throw new Error(`CSV inválido: texto após fechamento de aspas na linha ${line}.`);
      value += char;
    }
    if (value.length > IMPORT_LIMITS.cellLength) throw new Error(`Célula excede ${IMPORT_LIMITS.cellLength} caracteres na linha ${line}.`);
  }
  if (quoted) throw new Error(`CSV inválido: aspas não fechadas na linha ${rowLine}.`);
  if (value.length || cells.length || closed) endRow();
  const table = tableFromRows(rows, { date1904: false, sheetName: "CSV", sheetNames: ["CSV"], encoding });
  for (const row of table.rows) if (row.cells.length !== table.headers.length) row.structuralError = `Quantidade de colunas diferente do cabeçalho (${row.cells.length}/${table.headers.length}).`;
  return table;
}

/** Preflight do diretório ZIP antes de descompactar; ZIP64 e criptografia não são suportados. */
export function inspectImportZip(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  const invalid = () => new Error("XLSX inválido, corrompido, criptografado ou formato ZIP não suportado.");
  if (bytes.length < 22 || view.getUint32(0, true) !== 0x04034b50) throw invalid();
  let end = bytes.length - 22;
  const minimum = Math.max(0, bytes.length - 65557);
  while (end >= minimum && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < minimum || end + 22 + view.getUint16(end + 20, true) !== bytes.length) throw invalid();
  const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), offset = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || count !== view.getUint16(end + 8, true) || count > 2048 || count === 0 || size === 0xffffffff || offset === 0xffffffff || offset + size !== end) throw invalid();
  let cursor = offset, expanded = 0;
  const names = new Set<string>();
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) throw invalid();
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true), uncompressed = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true), extra = view.getUint16(cursor + 30, true), comment = view.getUint16(cursor + 32, true);
    const local = view.getUint32(cursor + 42, true);
    if (flags & 1 || ![0, 8].includes(method) || uncompressed === 0xffffffff || compressed === 0xffffffff || local + 30 > offset || cursor + 46 + nameLength + extra + comment > end) throw invalid();
    if (view.getUint32(local, true) !== 0x04034b50 || view.getUint16(local + 8, true) !== method || view.getUint16(local + 6, true) !== flags) throw invalid();
    const localCompressed = view.getUint32(local + 18, true), localExpanded = view.getUint32(local + 22, true);
    if ((localCompressed !== 0 && localCompressed !== compressed) || (localExpanded !== 0 && localExpanded !== uncompressed)) throw invalid();
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (dataStart + compressed > offset) throw invalid();
    expanded += uncompressed;
    if (expanded > IMPORT_LIMITS.expanded) throw new Error("XLSX excede o limite demonstrativo de 100 MB descompactados. Divida o arquivo.");
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    const localName = new TextDecoder().decode(bytes.subarray(local + 30, local + 30 + view.getUint16(local + 26, true)));
    if (name !== localName) throw invalid();
    if (names.has(name)) throw invalid();
    names.add(name); cursor += 46 + nameLength + extra + comment;
  }
  if (cursor !== end || !names.has("[Content_Types].xml") || !names.has("xl/workbook.xml")) throw invalid();
}
export function readImportWorkbook(buffer: ArrayBuffer): WorkBook {
  inspectImportZip(buffer);
  try {
    const book = read(buffer, { type: "array", dense: true, cellFormula: true, cellDates: false, cellText: false, sheetRows: IMPORT_LIMITS.rows + 2 });
    if (!book.SheetNames.length || book.SheetNames.length > 50) throw new Error("Quantidade de planilhas não suportada (1 a 50).");
    return book;
  } catch (error) {
    throw new Error(`Não foi possível ler o XLSX. Verifique se está íntegro e sem senha. ${error instanceof Error ? error.message : ""}`);
  }
}
export function tableFromWorkbook(book: WorkBook, name: string): ImportTable {
  if (!book.SheetNames.includes(name) || !book.Sheets[name]) throw new Error("Planilha não encontrada.");
  const sheet = book.Sheets[name];
  const reference = sheet["!fullref"] as string | undefined ?? sheet["!ref"];
  if (!reference) throw new Error("Planilha vazia. Selecione outra planilha.");
  const range = utils.decode_range(reference);
  if (range.e.r + 1 > IMPORT_LIMITS.rows + 1 || range.e.c + 1 > IMPORT_LIMITS.columns || (range.e.r + 1) * (range.e.c + 1) > IMPORT_LIMITS.cells) throw new Error("Planilha excede os limites demonstrativos de linhas, colunas ou células. Divida o arquivo.");
  const rows: ImportRow[] = [];
  for (let r = 0; r <= range.e.r; r++) {
    const cells: ImportCell[] = [];
    for (let c = 0; c <= range.e.c; c++) {
      const cell = sheet["!data"]?.[r]?.[c] ?? sheet[utils.encode_cell({ r, c })];
      cells.push({ value: cell?.v ?? null, ...(cell?.f ? { formula: cell.f } : {}), ...(cell?.t === "e" ? { error: true } : {}) });
    }
    rows.push({ line: r + 1, cells });
  }
  return tableFromRows(rows, { sheetName: name, sheetNames: book.SheetNames, date1904: Boolean(book.Workbook?.WBProps?.date1904) });
}
export function decodeImportCsv(buffer: ArrayBuffer): { text: string; encoding: string } {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le", { fatal: true }).decode(buffer), encoding: "UTF-16LE" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be", { fatal: true }).decode(buffer), encoding: "UTF-16BE" };
  try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(buffer), encoding: "UTF-8" }; }
  catch { return { text: new TextDecoder("windows-1252", { fatal: true }).decode(buffer), encoding: "Windows-1252" }; }
}
export function readImportBuffer(name: string, buffer: ArrayBuffer): { table: ImportTable; workbook: WorkBook | null } {
  const error = validateImportFiles([{ name, size: buffer.byteLength }]);
  if (error) throw new Error(error);
  if (/\.csv$/i.test(name)) {
    const { text, encoding } = decodeImportCsv(buffer);
    return { table: parseImportCsv(text, encoding), workbook: null };
  }
  const workbook = readImportWorkbook(buffer);
  // A primeira planilha pode estar vazia; ainda é possível escolher outra na interface.
  try { return { table: tableFromWorkbook(workbook, workbook.SheetNames[0]), workbook }; }
  catch (error) {
    return { table: { headers: [], rows: [], headerLine: 0, date1904: false, sheetName: workbook.SheetNames[0], sheetNames: workbook.SheetNames, sheetError: error instanceof Error ? error.message : "Planilha inválida." }, workbook };
  }
}
