import "server-only";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Client } from "pg";
import { z } from "zod";
import {
  directCsvLimit, directHash, directHistory, directManifestLimit, directMaxRows, directMonth,
  directDetail, directPreview, directReceipt, directUploadLimit,
} from "@/contracts/pcdf-direct";
import { getLocalPrincipal } from "@/lib/auth/local-server";
import { hasPermission } from "@/lib/auth/policy";
import { directPcdfMode, integratedImportMode } from "@/lib/db/pcdf-direct-mode";
import { attestLocalImportDatabase, localImportConnection, LocalImportDbError } from "@/lib/db/local-import-db";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Host" };
const messages: Record<number, string> = {
  404: "Execução não encontrada.", 400: "Requisição inválida.", 401: "Sessão necessária.", 403: "Importação não autorizada.",
  409: "O arquivo mudou após a prévia ou conflita com uma origem já registrada.",
  413: "O arquivo excede o limite de envio.", 415: "Envie o CSV e, se houver, o manifesto JSON.",
  422: "O arquivo não passou nas verificações do layout PCDF v1.0.",
  503: "Receptor PCDF local indisponível.",
};

class IntakeError extends Error {
  constructor(readonly status: number, readonly diagnostic?: string) { super(messages[status]); }
}

async function boundedForm(request: Request) {
  const limit = directUploadLimit;
  const length = request.headers.get("content-length");
  if (length && Number(length) > limit) throw new IntakeError(413);
  const reader = request.body?.getReader();
  if (!reader) throw new IntakeError(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new IntakeError(413);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
    if (request.body && size > limit) void request.body.cancel().catch(() => {});
  }
  if (length !== null && size !== Number(length)) throw new IntakeError(400);
  try {
    return await new Response(Buffer.concat(chunks, size), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    throw new IntakeError(400);
  }
}

const nameSchema = z.string().regex(/^pcdf_naturezas_[0-9]{4}-[0-9]{2}\.csv$/);
const preparedBatch = z.object({
  name: nameSchema, month: directMonth, sha256: directHash, size: z.int().min(1).max(directCsvLimit),
  rows: z.array(z.unknown()).min(1).max(directMaxRows),
});
const deliverySchema = z.object({ batch: preparedBatch, manifestSha: directHash.nullable() });

async function readIntake(request: Request, preview: boolean) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new IntakeError(415);
  const form = await boundedForm(request);
  const keys = [...form.keys()];
  const allowed = preview ? ["csv", "manifesto"] : ["csv", "manifesto", "sha256", "manifestSha"];
  if (keys.some(key => !allowed.includes(key)) || new Set(keys).size !== keys.length) throw new IntakeError(400);
  const upload = form.get("csv");
  const manifest = form.get("manifesto");
  if (!(upload instanceof File) || (manifest !== null && !(manifest instanceof File))) throw new IntakeError(400);
  if (!nameSchema.safeParse(upload.name).success) throw new IntakeError(422, "nome_competencia_invalido");
  if (upload.size > directCsvLimit || (manifest && manifest.size > directManifestLimit)) throw new IntakeError(413);
  if (!upload.size || (manifest && !manifest.size)) throw new IntakeError(422, "tamanho_csv_invalido");
  return {
    name: upload.name,
    csv: Buffer.from(await upload.arrayBuffer()),
    manifest: manifest ? Buffer.from(await manifest.arrayBuffer()) : null,
    expected: preview ? null : {
      sha256: directHash.parse(form.get("sha256")),
      manifestSha: directHash.nullable().parse(form.get("manifestSha")),
    },
  };
}

function prepare(input: Awaited<ReturnType<typeof readIntake>>, preview: boolean): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const { NODE_ENV, PATH, SystemRoot, WINDIR, TEMP, TMP } = process.env;
    const script = join(process.cwd(), "database", "local", "pcdf-sandbox", "direct_input.py");
    const child = spawn("python", ["-E", "-B", script, preview ? "preview" : "receive"], {
      env: { NODE_ENV, PATH, SystemRoot, WINDIR, TEMP, TMP }, windowsHide: true,
      timeout: 45000, stdio: ["pipe", "pipe", "ignore"],
    });
    const chunks: Buffer[] = [];
    let size = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 128 * 1024 * 1024) child.kill();
      else chunks.push(chunk);
    });
    child.on("error", () => reject(new IntakeError(503)));
    child.stdin.on("error", () => { /* Exit status handles parser failures. */ });
    child.on("close", code => {
      if ((code !== 0 && code !== 2) || size > 128 * 1024 * 1024) return reject(new IntakeError(503));
      try {
        const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (code === 0) resolve(result);
        else reject(new IntakeError(422, z.object({ error: z.string().regex(/^[a-z0-9_]{1,80}$/) }).parse(result).error));
      } catch { reject(new IntakeError(503)); }
    });
    child.stdin.write(JSON.stringify([input.name, input.csv.length, input.manifest?.length ?? -1]) + "\n");
    child.stdin.write(input.csv);
    child.stdin.end(input.manifest ?? undefined);
  });
}

function errorStatus(error: unknown) {
  if (error instanceof IntakeError || error instanceof LocalImportDbError) return error.status;
  const code = (error as { code?: string } | null)?.code;
  if (code === "42501") return 403;
  if (code === "23505") return 409;
  if (code === "22023") return 422;
  return 503;
}

export async function directPcdf(request: Request) {
  let client: Client | undefined;
  let attempt: string | undefined;
  let committing = false;
  try {
    const mode = directPcdfMode();
    const write = request.method === "POST";
    if (!mode || request.headers.get("host") !== new URL(mode.origin).host
      || (write && request.headers.get("origin") !== mode.origin)) throw new IntakeError(403);
    const principal = await getLocalPrincipal();
    if (!principal) throw new IntakeError(401);
    if (principal.role === "Analista" || !hasPermission(principal.role, "importar")) throw new IntakeError(403);
    const search = new URL(request.url).searchParams;
    const step = search.get("etapa");
    const mainMode = integratedImportMode();
    const detail = !write && search.size ? z.strictObject({
      execucao: z.uuid(), pagina: z.string().regex(/^[1-9]\d{0,2}$/),
    }).safeParse(Object.fromEntries(search)) : null;
    if (new Set(search.keys()).size !== search.size || (detail && (!mainMode || !detail.success))
      || (write && (search.size !== 1 || !["validar", "confirmar"].includes(step ?? "")))) throw new IntakeError(400);
    const connection = localImportConnection(principal.role);
    client = connection.client;
    await attestLocalImportDatabase(client, connection.login, mode, principal.role);
    if (detail?.success) {
      const { execucao, pagina } = detail.data;
      const { rows: [row] } = await client.query("SELECT sentinela_pcdf_local.detail($1,$2) AS data", [
        execucao, (Number(pagina) - 1) * 25,
      ]);
      if (!row?.data) throw new IntakeError(404);
      return Response.json({ success: true, data: directDetail.parse(row.data) }, { headers });
    }
    if (!write) {
      const { rows: [row] } = await client.query("SELECT sentinela_pcdf_local.history() AS data");
      return Response.json({ success: true, data: directHistory.parse(row.data) }, { headers });
    }

    const preview = step === "validar";
    let input;
    try { input = await readIntake(request, preview); }
    catch (error) {
      if (error instanceof z.ZodError) throw new IntakeError(400);
      throw error;
    }
    const payload = await prepare(input, preview);
    if (preview) return Response.json({ success: true, data: directPreview.parse(payload) }, { headers });

    const { batch, manifestSha } = deliverySchema.parse(payload);
    const { name, month, sha256, size, rows } = batch;
    if (input.expected?.sha256 !== sha256 || input.expected.manifestSha !== manifestSha) throw new IntakeError(409);
    committing = true;
    const requestId = randomUUID();
    await client.query("SELECT sentinela_pcdf_local.attempt($1,$2,$3)", [
      requestId, principal.localAccountId, { name, month, sha256, bytes: size, records: rows.length, manifestSha },
    ]);
    attempt = requestId;
    await client.query("BEGIN");
    const result = await client.query("SELECT sentinela_pcdf_local.receive($1,$2,$3,$4) AS data", [
      requestId, payload, input.csv, input.manifest,
    ]);
    const receipt = directReceipt.parse(result.rows[0].data);
    await client.query("COMMIT");
    attempt = undefined;
    return Response.json({ success: true, data: receipt }, { headers, status: receipt.replay ? 200 : 201 });
  } catch (error) {
    if (attempt && client) {
      await client.query("ROLLBACK").catch(() => {});
      await client.query("SELECT sentinela_pcdf_local.fail($1)", [attempt]).catch(() => {});
    }
    const status = errorStatus(error);
    const code = (error as { code?: string } | null)?.code;
    const message = error instanceof LocalImportDbError && status === 503 ? error.message
      : code === "23514" ? "Falha de reconciliação do PCDF. A transação foi revertida."
      : committing && status === 503 ? "Falha de persistência. Consulte o histórico antes de reenviar."
      : messages[status];
    return Response.json({ success: false, error: { message,
      ...(error instanceof IntakeError && error.diagnostic && { diagnostic: error.diagnostic }) } }, { status, headers });
  } finally {
    await client?.end().catch(() => {});
  }
}
