import { readImportBuffer, tableFromWorkbook } from "@/data/importParser";
import { analyzeImport } from "@/data/importValidation";
import type { ImportTable, ImportWorkerRequest, ImportWorkerResponse } from "@/data/importTypes";
import type { WorkBook } from "xlsx";

let table: ImportTable | null = null;
let workbook: WorkBook | null = null;
function send(message: ImportWorkerResponse) { self.postMessage(message); }
function sendTable() {
  if (!table) return;
  const { rows, ...metadata } = table;
  send({ type: "table", table: { ...metadata, rowCount: rows.length } });
}
self.onmessage = async (event: MessageEvent<ImportWorkerRequest>) => {
  try {
    const message = event.data;
    if (message.type === "load") {
      table = null; workbook = null;
      const parsed = readImportBuffer(message.file.name, await message.file.arrayBuffer());
      table = parsed.table; workbook = parsed.workbook;
      sendTable();
    } else if (message.type === "sheet") {
      table = null;
      if (!workbook) throw new Error("Selecione um arquivo XLSX novamente.");
      try { table = tableFromWorkbook(workbook, message.name); }
      catch (error) {
        table = { headers: [], rows: [], headerLine: 0, date1904: false, sheetName: message.name, sheetNames: workbook.SheetNames, sheetError: error instanceof Error ? error.message : "Planilha inválida." };
      }
      sendTable();
    } else {
      if (!table?.rows.length) throw new Error("Selecione uma planilha com registros.");
      send({ type: "analysis", analysis: analyzeImport(table, message.mapping) });
    }
  } catch (error) {
    send({ type: "error", message: error instanceof Error ? error.message : "Falha no processamento. Selecione novamente um arquivo válido." });
  }
};
