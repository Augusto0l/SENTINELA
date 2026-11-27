import { z } from "zod";
import { classificacaoAplicacao } from "./classificacao.ts";

export const directPcdfPath = "/api/v1/importacoes/pcdf/direta";
export const localImportStartupMessage = "Inicie o SENTINELA com npm run dev:local e recarregue a página para conectar ao PostgreSQL local.";
export const directCsvLimit = 16 * 1024 * 1024;
export const directManifestLimit = 1024 * 1024;
export const directUploadLimit = directCsvLimit + directManifestLimit + 16384;
export const directMaxRows = 10_000;
export const directV2UploadLimit = 3 * directCsvLimit + 2 * directManifestLimit + 32768;

export const directHash = z.string().regex(/^[0-9a-f]{64}$/);
export const directMonth = z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/);
const fileName = z.string().regex(/^pcdf_naturezas_[0-9]{4}-[0-9]{2}\.csv$/);
const count = z.int().nonnegative();
const metadata = {
  name: fileName, month: directMonth, sha256: directHash,
  bytes: count.min(1).max(directCsvLimit), manifestSha: directHash.nullable(),
};

export const directPreview = z.strictObject({
  ...metadata, treatment: z.string().min(1).max(128),
  headers: z.array(z.string()).length(34),
  fields: z.record(z.string(), z.strictObject({ empty: count, issues: count })),
  records: z.array(z.strictObject({
    cells: z.array(z.string()).length(34), issues: z.array(z.tuple([z.string(), z.string()])),
  })).min(1).max(directMaxRows),
});

export const directCsvPreview = directPreview.extend({
  headers: z.array(z.string()).length(26),
  records: z.array(directPreview.shape.records.element.extend({
    cells: z.array(z.string()).length(26),
  })).min(1).max(directMaxRows),
  standalone: z.strictObject({
    invalid: count, pending: count, valid: count, candidates: count, duplicates: count,
    errors: z.array(z.strictObject({ row: count, field: z.string(), message: z.string() })).max(100),
  }),
});

export const directReceipt = z.strictObject({
  ...metadata, lot: z.uuid(), run: z.uuid(), records: count.min(1).max(directMaxRows),
  issues: count, replay: z.boolean(), classificacao: classificacaoAplicacao.optional(),
});

export const historicalTreatmentState = z.enum([
  "aguardando", "processando", "concluido", "concluido_com_pendencias", "falha_recuperavel",
]);
// Tratamento automático e auditado das pendências da competência (0019).
export const historicalTreatment = z.strictObject({
  state: historicalTreatmentState, version: z.string().nullable(), treated: count.nullable(),
  remaining: count.nullable(), before: count.nullable(), attempts: count.nullable(), updatedAt: z.string().nullable(),
});
export const historicalMonth = z.strictObject({
  month: directMonth, sha256: directHash, bytes: count.min(1).max(directCsvLimit),
  records: count.min(1).max(directMaxRows), candidates: count, through: z.iso.date(), complete: z.boolean(),
  state: z.enum(["missing", "conflict", "staged", "done"]), lot: z.uuid().nullable(),
  unique: count.nullable(), links: count.nullable(), review: count.nullable(), issues: count.nullable(),
  treatment: historicalTreatment.optional(),
});
export const historicalMonthCount = 68;
export const historicalTreatmentRun = z.array(z.strictObject({
  lot: z.uuid(), month: directMonth.nullable(),
  state: z.enum(["concluido", "concluido_com_pendencias", "falha_recuperavel"]),
  treated: count.nullable(), remaining: count.nullable(), replay: z.boolean(),
})).max(historicalMonthCount);
const historicalAccess = {
  canValidate: z.boolean().optional(),
  block: z.enum(["profile", "inventory", "january", "configuration", "recovery"]).optional(),
};
export const completeHistoricalStatus = z.strictObject({
  ...historicalAccess, items: z.array(historicalMonth).length(historicalMonthCount), canApprove: z.boolean(),
});
export const historicalStatus = z.union([completeHistoricalStatus, z.strictObject({
  ...historicalAccess, items: z.array(historicalMonth).max(historicalMonthCount - 1), canApprove: z.literal(false),
})]);
export const historicalPreview = historicalMonth.extend({
  accepted: count, rejected: count, diagnostics: count,
  errors: directCsvPreview.shape.standalone.shape.errors,
});
export const historicalReceipt = historicalMonth.extend({ replay: z.boolean(), classificacao: classificacaoAplicacao.optional() });

export const directHistoryItem = z.strictObject({
  ...metadata, lot: z.uuid().nullable(), records: count.min(1).max(directMaxRows),
  run: z.uuid().nullable().optional(), persisted: count.optional(), issues: count.nullable().optional(),
  status: z.enum(["recebida", "concluida", "reenvio", "falhou"]),
  inativada: z.literal(true).optional(),
  contract: z.literal("2.0").optional(),
  role: z.enum(["Administrador", "Operador"]), request: z.uuid(), at: z.string(),
});
export const directHistory = z.array(directHistoryItem).max(100);
export const directDetail = z.strictObject({
  total: count, headers: z.union([z.array(z.string()).length(34), z.array(z.string()).length(26)]),
  rows: z.array(z.strictObject({
    ordinal: count, cells: z.union([z.array(z.string()).length(34), z.array(z.string()).length(26)]),
    issues: z.array(z.strictObject({ field: z.string(), rule: z.string() })),
  })).max(25),
}).refine(detail => detail.rows.every(row => row.cells.length === detail.headers.length));
