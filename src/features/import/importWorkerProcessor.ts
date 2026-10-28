import { readImportBuffer, tableFromWorkbook } from "@/data/importParser"
import { analyzeImport } from "@/data/importValidation"
import type {
  ImportTable,
  ImportWorkerJob,
  ImportWorkerReply,
  ImportWorkerResponse,
} from "@/data/importTypes"
import type { WorkBook } from "xlsx"

/** Worker-side state, separate from self so real CSV/XLSX jobs can be exercised in Node. */
export function createImportWorkerProcessor() {
  let table: ImportTable | null = null
  let workbook: WorkBook | null = null
  let generation = 0
  return async function process(
    job: ImportWorkerJob,
  ): Promise<ImportWorkerReply | null> {
    const current = ++generation
    const { request: message } = job
    const reply = (response: ImportWorkerResponse): ImportWorkerReply | null =>
      current === generation ? { id: job.id, response } : null
    const tableReply = () => {
      if (!table) throw new Error("Selecione uma planilha com registros.")
      const { rows, ...metadata } = table
      return reply({
        type: "table",
        table: { ...metadata, rowCount: rows.length },
      })
    }
    try {
      if (message.type === "load") {
        table = null
        workbook = null
        const buffer = await message.file.arrayBuffer()
        if (current !== generation) return null
        const parsed = readImportBuffer(message.file.name, buffer)
        table = parsed.table
        workbook = parsed.workbook
        return tableReply()
      }
      if (message.type === "sheet") {
        table = null
        if (!workbook) throw new Error("Selecione um arquivo XLSX novamente.")
        try {
          table = tableFromWorkbook(workbook, message.name)
        } catch (error) {
          table = {
            headers: [],
            rows: [],
            headerLine: 0,
            date1904: false,
            sheetName: message.name,
            sheetNames: workbook.SheetNames,
            sheetError:
              error instanceof Error ? error.message : "Planilha inválida.",
          }
        }
        return tableReply()
      }
      if (!table?.rows.length)
        throw new Error("Selecione uma planilha com registros.")
      return reply({
        type: "analysis",
        analysis: analyzeImport(table, message.mapping),
      })
    } catch (error) {
      return reply({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Falha no processamento. Selecione novamente um arquivo válido.",
      })
    }
  }
}
