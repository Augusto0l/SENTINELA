import { z } from "zod";

export const directPcdfPath = "/api/v1/importacoes/pcdf/direta";
export const directCsvLimit = 16 * 1024 * 1024;
export const directManifestLimit = 1024 * 1024;
export const directUploadLimit = directCsvLimit + directManifestLimit + 16384;
export const directMaxRows = 10_000;

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

export const directReceipt = z.strictObject({
  ...metadata, lot: z.uuid(), run: z.uuid(), records: count.min(1).max(directMaxRows),
  issues: count, replay: z.boolean(),
});

export const directHistoryItem = z.strictObject({
  ...metadata, lot: z.uuid().nullable(), records: count.min(1).max(directMaxRows),
  status: z.enum(["recebida", "concluida", "reenvio", "falhou"]),
  role: z.enum(["Administrador", "Operador"]), request: z.uuid(), at: z.string(),
});
export const directHistory = z.array(directHistoryItem).max(100);
