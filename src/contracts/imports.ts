import { z } from "zod"
import {
  countSchema,
  errorSchema,
  idSchema,
  successSchema,
} from "@/contracts/common"
import {
  IMPORT_FIELDS,
  IMPORT_LIMITS,
  REQUIRED_IMPORT_FIELDS,
} from "@/data/importTypes"
import { MAX_IMPORT_FILE_BYTES } from "@/data/importFile"
import { occurrenceSchema as formSchema } from "@/data/occurrenceForm"
import { occurrenceCreateSchema } from "@/contracts/occurrences"

const lineSchema = z.number().int().positive()
export const importFileSchema = z
  .strictObject({
    name: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[^/\\\x00-\x1f]+\.(csv|xlsx)$/i),
    size: z.number().int().min(1).max(MAX_IMPORT_FILE_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .describe(
    "Metadados propostos; hash deve ser conferido no servidor futuro. Não são upload nem prova do formato interno.",
  )
export const importCreateSchema = z.strictObject({
  file: importFileSchema,
  fonte: z.string().trim().min(1).max(240),
})
const mappingFields = Object.fromEntries(
  IMPORT_FIELDS.map((field) => [
    field,
    z
      .number()
      .int()
      .min(-1)
      .max(IMPORT_LIMITS.columns - 1),
  ]),
) as Record<typeof IMPORT_FIELDS[number], z.ZodNumber>
export const importMappingSchema = z
  .strictObject({
    headers: z
      .array(z.string().max(IMPORT_LIMITS.cellLength))
      .min(1)
      .max(IMPORT_LIMITS.columns),
    sheetName: z.string().min(1),
    sheetNames: z.array(z.string().min(1)).min(1),
    mapping: z.strictObject(mappingFields),
  })
  .superRefine((value, ctx) => {
    if (!value.sheetNames.includes(value.sheetName))
      ctx.addIssue({
        code: "custom",
        path: ["sheetName"],
        message: "Planilha não disponível.",
      })
    const used = new Set<number>()
    for (const field of IMPORT_FIELDS) {
      const column = value.mapping[field]
      if (
        column >= value.headers.length ||
        (column === -1 && REQUIRED_IMPORT_FIELDS.includes(field)) ||
        (column >= 0 && used.has(column))
      )
        ctx.addIssue({
          code: "custom",
          path: ["mapping", field],
          message: "Coluna ausente, repetida ou fora dos cabeçalhos.",
        })
      if (column >= 0) used.add(column)
    }
  })
export const importIssueSchema = z.strictObject({
  field: z.enum([...IMPORT_FIELDS, "linha"]),
  column: lineSchema.nullable(),
  message: z.string().min(1),
})
export const importCellSchema = z.strictObject({
  value: z.union([
    z.string().max(IMPORT_LIMITS.cellLength),
    z.number(),
    z.boolean(),
    z.null(),
  ]),
  formula: z.string().optional(),
  error: z.boolean().optional(),
})
export const importNormalizedSchema = z
  .strictObject({
    data: z.string(),
    horario: z.string(),
    naturezas: z.array(z.string()),
    raCode: z.string(),
    local: z.string(),
    latitude: z.string(),
    longitude: z.string(),
  })
  .describe(
    "Inclui valores inválidos/pendentes para diagnóstico; não é uma ocorrência consolidada. Os valores brutos são preservados em original.",
  )
export const importRowSchema = z
  .strictObject({
    line: lineSchema,
    original: z.array(importCellSchema).max(IMPORT_LIMITS.columns),
    normalized: importNormalizedSchema,
    status: z.enum(["valido", "invalido", "pendente"]),
    issues: z.array(importIssueSchema),
    possibleDuplicateOf: lineSchema.optional(),
  })
  .refine(
    (row) =>
      row.possibleDuplicateOf === undefined ||
      row.possibleDuplicateOf < row.line,
    "Duplicata candidata deve apontar para linha anterior.",
  )
  .superRefine((row, ctx) => {
    if (row.status === "invalido") {
      if (!row.issues.length)
        ctx.addIssue({
          code: "custom",
          path: ["issues"],
          message: "Linha inválida exige diagnóstico.",
        })
      return
    }
    const normalized = row.normalized
    const parsed = occurrenceCreateSchema
      .omit({ coordenadas: true })
      .safeParse({
        data: normalized.data.split("/").reverse().join("-"),
        horario: normalized.horario,
        raCode: normalized.raCode,
        naturezas: normalized.naturezas,
        local: normalized.local,
      })
    const missing = !normalized.latitude || !normalized.longitude
    const invalidCoordinates = (["latitude", "longitude"] as const).some(
      (field) =>
        normalized[field] &&
        (!/^-?\d+(\.\d+)?$/.test(normalized[field]) ||
          !formSchema.shape[field].safeParse(normalized[field]).success),
    )
    if (
      !parsed.success ||
      invalidCoordinates ||
      (row.status === "valido"
        ? missing || row.issues.length > 0
        : !missing || row.issues.length === 0) ||
      row.original.some((cell) => cell.formula || cell.error)
    )
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Estado da linha incompatível com dados e diagnósticos.",
      })
  })
export const importCountsSchema = z.strictObject({
  total: countSchema.max(IMPORT_LIMITS.rows),
  valid: countSchema,
  invalid: countSchema,
  pending: countSchema,
  possibleDuplicates: countSchema,
})
export const importAnalysisSchema = z
  .strictObject({
    mappingErrors: z.array(z.string()),
    rows: z.array(importRowSchema).max(IMPORT_LIMITS.rows),
    counts: importCountsSchema,
  })
  .superRefine((analysis, ctx) => {
    const { counts, rows } = analysis
    if (analysis.mappingErrors.length) {
      if (
        rows.length ||
        counts.valid ||
        counts.invalid ||
        counts.pending ||
        counts.possibleDuplicates
      )
        ctx.addIssue({
          code: "custom",
          message: "Mapeamento inválido não produz linhas validadas.",
        })
      return
    }
    const uniqueLines = new Set(rows.map((row) => row.line))
    const countsMatch =
      counts.total === rows.length &&
      uniqueLines.size === rows.length &&
      counts.valid === rows.filter((row) => row.status === "valido").length &&
      counts.invalid ===
        rows.filter((row) => row.status === "invalido").length &&
      counts.pending ===
        rows.filter((row) => row.status === "pendente").length &&
      counts.possibleDuplicates ===
        rows.filter((row) => row.possibleDuplicateOf !== undefined).length
    if (!countsMatch)
      ctx.addIssue({
        code: "custom",
        message: "Contagens não correspondem às linhas analisadas.",
      })
    if (
      rows.some(
        (row) =>
          row.possibleDuplicateOf !== undefined &&
          !uniqueLines.has(row.possibleDuplicateOf),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Referência de possível duplicata ausente na análise.",
      })
  })
export const demoImportResultSchema = z
  .strictObject({
    total: countSchema.max(IMPORT_LIMITS.rows),
    simulated: countSchema,
    pending: countSchema,
    rejected: countSchema,
    possibleDuplicates: countSchema,
    persisted: z.literal(false),
  })
  .refine(
    (value) =>
      value.total === value.simulated + value.pending + value.rejected &&
      value.possibleDuplicates <= value.simulated + value.pending,
    "Resultado demonstrativo inconsistente.",
  )
export const operationalImportResultSchema = z
  .strictObject({
    total: countSchema,
    inserted: countSchema,
    pending: countSchema,
    rejected: countSchema,
    possibleDuplicates: countSchema,
    persisted: z.literal(true),
  })
  .refine(
    (value) =>
      value.total === value.inserted + value.pending + value.rejected &&
      value.possibleDuplicates <= value.inserted + value.pending,
    "Resultado operacional inconsistente.",
  )
  .describe(
    "Contrato futuro: não produzido pelo fluxo atual; candidatos não são descartados automaticamente.",
  )
export const importBatchSchema = z
  .strictObject({
    id: idSchema,
    file: importFileSchema,
    fonte: z.string().min(1),
    requestedBy: idSchema.describe(
      "Identidade derivada no servidor futuro; não recebida no cadastro do lote.",
    ),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    mappingVersion: z.string().min(1).nullable(),
    validationVersion: z.string().min(1).nullable(),
    failure: errorSchema.nullable(),
    status: z.enum([
      "criado",
      "mapeado",
      "validado",
      "processando",
      "concluido",
      "falhou",
    ]),
    mode: z.enum(["demonstrativo", "operacional"]),
    result: z
      .union([demoImportResultSchema, operationalImportResultSchema])
      .nullable(),
  })
  .refine(
    (value) =>
      value.result === null ||
      value.result.persisted === (value.mode === "operacional"),
    "Modo e persistência incompatíveis.",
  )
  .refine(
    (value) => (value.status === "concluido") === (value.result !== null),
    "Somente um lote concluído possui resultado final.",
  )
  .refine(
    (value) => (value.status === "falhou") === (value.failure !== null),
    "Lote com falha exige diagnóstico seguro.",
  )
export const importBatchResponseSchema = successSchema(importBatchSchema)
export const importAnalysisResponseSchema = successSchema(importAnalysisSchema)
export const demoImportResponseSchema = successSchema(
  demoImportResultSchema,
).refine(
  (value) => value.meta.execution.mode === "demonstrativo",
  "Simulação exige identificação demonstrativa.",
)
export type ImportBatch = z.infer<typeof importBatchSchema>
export type ImportAnalysisContract = z.infer<typeof importAnalysisSchema>
export type ImportCreate = z.infer<typeof importCreateSchema>
export type ImportMappingContract = z.infer<typeof importMappingSchema>
export type ImportBatchResponse = z.infer<typeof importBatchResponseSchema>
export type DemoImportResponse = z.infer<typeof demoImportResponseSchema>
