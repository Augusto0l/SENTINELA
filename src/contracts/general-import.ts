import { z } from "zod"
import { IMPORT_FIELDS } from "@/data/importTypes"

export const generalImportPath = "/api/v1/importacoes/geral"
export const generalReviewPath = generalImportPath + "/revisao"
export const generalUploadLimit = 8 * 1024 * 1024
export const generalUploadHeader = "x-sentinela-import"
export const generalFormats = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const

export const generalSelection = z.strictObject({
  name: z.string().min(5).max(240).regex(/^[^\x00-\x1f\x7f/\\:]+\.(csv|xlsx)$/i),
  sheet: z.string().min(1).max(31),
  delimiter: z.enum([";", ",", "\t"]).optional(),
  mapping: z.strictObject(Object.fromEntries(IMPORT_FIELDS.map(field => [field, z.number().int().min(-1).max(63)]))),
})

const count = z.number().int().nonnegative()
export const generalSummary = z.strictObject({
  total: count, structural: count, valid: count, invalid: count, pending: count, possibleDuplicates: count, issues: count,
}).refine(row => row.total === row.valid + row.invalid + row.pending && row.structural <= row.total)
export const generalReceipt = z.strictObject({
  lot: z.uuid(), run: z.uuid(), persisted: count, replay: z.boolean(), summary: generalSummary,
}).refine(row => row.persisted === row.summary.total)

export const generalAttempt = z.strictObject({
  request: z.uuid(), name: z.string(), format: z.enum(["csv", "xlsx"]), sheet: z.string(),
  actor: z.enum(["Administrador", "Operador"]), created: z.iso.datetime({ offset: true }),
  status: z.enum(["recebida", "concluida", "falhou"]),
  receipt: generalReceipt.nullable(),
})
export const generalHistory = z.array(generalAttempt).max(100)

const originalCell = z.strictObject({ value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  formula: z.string().optional(), error: z.boolean().optional() })
export const generalDetail = z.strictObject({
  total: count,
  headers: z.array(z.string()),
  rows: z.array(z.strictObject({
    line: z.number().int().positive(), status: z.enum(["valido", "invalido", "pendente"]),
    cells: z.array(originalCell), duplicateOf: z.number().int().positive().optional(),
    issues: z.array(z.strictObject({ field: z.string(), column: z.number().int().positive().nullable(), message: z.string() })),
  })).max(25),
})
