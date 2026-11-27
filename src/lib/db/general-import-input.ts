import { createHash } from "node:crypto"
import { generalFormats, generalSelection, generalUploadHeader } from "@/contracts/general-import"
import { readImportBuffer, tableFromWorkbook, verifyImportWorkbookSize } from "@/data/importParser"
import { analyzeImport } from "@/data/importValidation"
import { isInstitutionalPcdf } from "@/data/importSource"
import type { ImportMapping } from "@/data/importTypes"

export class GeneralImportError extends Error {
  readonly status: number
  readonly diagnostic?: string
  constructor(status: number, diagnostic?: string) {
    super("Importação recusada.")
    this.status = status
    this.diagnostic = diagnostic
  }
}

export function generalInput(request: Request, contentType: string | undefined) {
  const raw = request.headers.get(generalUploadHeader)
  if (!raw || raw.length > 4096) throw new GeneralImportError(400)
  const selection = generalSelection.parse(JSON.parse(decodeURIComponent(raw)))
  const format = selection.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx"
  if (contentType !== generalFormats[format]) throw new GeneralImportError(415)
  if ((format === "csv" && selection.sheet !== "CSV") || (format === "xlsx" && selection.delimiter))
    throw new GeneralImportError(422)
  return { selection, format } as const
}

export async function prepareGeneralImport(content: Uint8Array, input: ReturnType<typeof generalInput>) {
  const { selection, format } = input
  if (isInstitutionalPcdf(selection.name, [])) throw new GeneralImportError(422, "pcdf_institucional")
  try {
    const buffer = Uint8Array.from(content).buffer
    if (format === "xlsx") await verifyImportWorkbookSize(buffer)
    const parsed = readImportBuffer(selection.name, buffer, selection.delimiter, true)
    const table = parsed.workbook ? tableFromWorkbook(parsed.workbook, selection.sheet) : parsed.table
    if (table.headers.some(value => value.includes("\0")) || table.rows.some(row => row.cells.some(cell =>
      (typeof cell.value === "string" && cell.value.includes("\0")) || cell.formula?.includes("\0"))))
      throw new Error("Célula contém caractere nulo.")
    if (isInstitutionalPcdf(selection.name, table.headers)) throw new GeneralImportError(422, "pcdf_institucional")
    const analysis = analyzeImport(table, selection.mapping as ImportMapping, true)
    if (analysis.mappingErrors.length) throw new Error(analysis.mappingErrors.join(" "))
    const rows = analysis.rows.map(row => {
      const { original: cells, normalized, line, status, issues, possibleDuplicateOf } = row
      return { line, normalized, status, snapshot: {
        line, status, cells, issues, ...(possibleDuplicateOf === undefined ? {} : { duplicateOf: possibleDuplicateOf }),
      } }
    })
    const sha = createHash("sha256").update(content).digest("hex")
    const context = createHash("sha256").update(JSON.stringify([table.sheetName, table.delimiter ?? null, selection.mapping])).digest("hex")
    return { metadata: { name: selection.name, format, sheet: table.sheetName, delimiter: table.delimiter,
      mapping: selection.mapping, headers: table.headers, bytes: content.byteLength, sha, context,
      sheetKey: createHash("sha256").update(JSON.stringify([sha, table.sheetName])).digest("hex") },
      summary: { ...analysis.counts, structural: table.rows.filter(row => !row.structuralError && row.cells.some(cell =>
        String(cell.value ?? "").trim())).length,
      issues: rows.reduce((total, row) => total + row.snapshot.issues.length + Number(row.snapshot.duplicateOf !== undefined), 0) },
      rows }
  } catch (error) {
    if (error instanceof GeneralImportError) throw error
    throw new GeneralImportError(422, "estrutura_ou_mapeamento")
  }
}
