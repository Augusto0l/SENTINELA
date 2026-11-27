import "server-only";
import { occurrenceManagementMode } from "@/lib/db/occurrence-management-mode";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Client } from "pg";
import { z } from "zod";
import {
  directCsvLimit, directCsvPreview, directHash, directHistory, directManifestLimit, directMaxRows, directMonth,
  directDetail, directPreview, directReceipt, directUploadLimit, directV2UploadLimit,
  completeHistoricalStatus, historicalMonth, historicalMonthCount, historicalPreview, historicalReceipt, historicalStatus,
} from "@/contracts/pcdf-direct";
import { getOperationalPrincipal } from "@/lib/auth/operational-server";
import type { OperationalPrincipal } from "@/lib/auth/operational-access";
import { hasPermission } from "@/lib/auth/policy";
import { directPcdfMode, hostedImportMode, integratedImportMode, integratedSupabaseMode, syntheticPcdfV2Enabled } from "@/lib/db/pcdf-direct-mode";
import { attestLocalImportDatabase, localImportConnection, LocalImportDbError } from "@/lib/db/local-import-db";
import { attestHostedImportDatabase, getHostedImportPrincipal, hostedImportConnection } from "@/lib/db/hosted-import-db";

import { PcdfV2Error } from "@/data/pcdfV2";
import { preparePcdfCsvDelivery, preparePcdfV2Delivery } from "./pcdf-v2-delivery";
import { operationalActor } from "./operational-import-review";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Host" };
const messages: Record<number, string> = {
  404: "Execução não encontrada.", 400: "Requisição inválida.", 401: "Sessão necessária.", 403: "Importação não autorizada.",
  409: "O arquivo mudou após a prévia ou conflita com uma origem já registrada.",
  413: "O arquivo excede o limite de envio.", 415: "Envie o CSV e, se houver, o manifesto JSON.",
  422: "O arquivo não passou nas verificações do layout PCDF v1.0.",
  503: "Receptor PCDF local indisponível.",
};

class IntakeError extends Error {
  constructor(readonly status: number, readonly diagnostic?: string, detail?: string) { super(detail ?? messages[status]); }
}

async function boundedForm(request: Request, limit = directUploadLimit) {
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

const v2Review = z.object({ reason: z.enum([
  "extracao_divergente", "origem_divergente_ou_avulsa", "csv_ja_recebido_com_outro_vinculo",
]), replay: z.literal(false) });
const v2StagingReceipt = z.object({
  lot: z.uuid(), run: z.uuid(), records: z.int().min(1).max(directMaxRows),
  issues: z.int().nonnegative(), reused: z.int().nonnegative(), replay: z.boolean(),
});

async function confirmSyntheticV2(client: Client, request: Request, account: string) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new IntakeError(415);
  const form = await boundedForm(request, directV2UploadLimit);
  const csv = form.get("csv");
  const attachments = form.getAll("artefato");
  const digest = directHash.safeParse(form.get("digest"));
  if (!(csv instanceof File) || !attachments.every(file => file instanceof File) || !digest.success
    || form.getAll("csv").length !== 1 || form.getAll("digest").length !== 1
    || [...form.keys()].some(key => !["csv", "artefato", "digest"].includes(key))) throw new IntakeError(400);

  const input = await preparePcdfV2Delivery(csv, attachments).catch(error => {
    if (error instanceof PcdfV2Error) throw new IntakeError(422, "pacote_pcdf_v2_invalido");
    throw error;
  });
  if (input.digest !== digest.data) throw new IntakeError(409);
  await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
  let result;
  try {
    const { rows } = await client.query(
      "SELECT sentinela_pcdf_local.receive_v2($1,$2,$3,$4,$5) AS data",
      [randomUUID(), account, input.delivery, input.names, input.parts],
    );
    result = z.union([v2Review, v2StagingReceipt]).parse(rows[0]?.data);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
  if ("reason" in result) throw new IntakeError(409, result.reason);
  return Response.json({ success: true, data: result }, { headers, status: result.replay ? 200 : 201 });
}

async function historicalRecoveryReady(client: Client, subject: string) {
  const { rows: [capability] } = await client.query(`SELECT coalesce(has_function_privilege(
    to_regprocedure('sentinela_pcdf_historico.pode_confirmar(uuid)'),'EXECUTE'),false) AS installed`);
  if (!capability?.installed) return false;
  const { rows: [result] } = await client.query(
    "SELECT sentinela_pcdf_historico.pode_confirmar($1) AS allowed", [subject],
  );
  return result?.allowed === true;
}

async function intakeStandalone(client: Client, request: Request, previewOnly: boolean,
  actor: NonNullable<ReturnType<typeof operationalActor>>, historical: boolean, hosted: boolean) {
  const { rows: [access] } = await client.query(
    `SELECT sentinela_gestao_autorizacao.capacidade($1,$2) AS authorized,
      to_regprocedure(CASE WHEN $3 THEN 'sentinela_pcdf_historico.receive(uuid,uuid,text,jsonb,bytea)'
        ELSE 'sentinela_pcdf_local.receive_csv(uuid,uuid,text,jsonb,bytea)' END) IS NOT NULL AS installed,
      to_regprocedure('sentinela_pcdf_local.efetivos_csv_v1(jsonb,date)') IS NOT NULL AS independent`,
    [actor.subject, actor.account, historical],
  );
  if (historical && hosted) {
    if (!previewOnly && !await historicalRecoveryReady(client, actor.subject))
      throw new IntakeError(503, "recuperacao_historica_indisponivel",
        "A recuperação da fila mensal ainda precisa ser habilitada no PostgreSQL.");
  } else if (!access?.authorized && (!previewOnly || historical)) {
    throw new IntakeError(403, "autorizacao_institucional_ausente");
  }
  if (!access.installed) throw new IntakeError(503, undefined, "O receptor de CSV PCDF v2 ainda não está instalado no PostgreSQL.");
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new IntakeError(415);
  const form = await boundedForm(request, directCsvLimit + 16384);
  const csv = form.get("csv");
  const digest = directHash.safeParse(form.get("sha256"));
  if (!(csv instanceof File) || form.getAll("csv").length !== 1
    || [...form.keys()].length !== (previewOnly ? 1 : 2)
    || (!previewOnly && !digest.success)) throw new IntakeError(400);
  if (csv.size > directCsvLimit) throw new IntakeError(413);
  const prepared = await preparePcdfCsvDelivery(csv, access.independent === true).catch(error => {
    if (error instanceof PcdfV2Error) throw new IntakeError(422, undefined, error.message);
    throw error;
  });
  if (historical) {
    if (!access.independent) throw new IntakeError(503);
    const { rows: [status] } = await client.query("SELECT sentinela_pcdf_historico.status() AS data");
    const known = z.array(historicalMonth).parse(status?.data).find(item => item.month === prepared.preview.month);
    if (!known || known.sha256 !== prepared.preview.sha256 || known.bytes !== csv.size
      || known.records !== prepared.preview.records.length || known.candidates !== prepared.preview.standalone.candidates)
      throw new IntakeError(409, "historico_arquivo_divergente",
        "O arquivo diverge do inventário PCDF desta competência. Selecione o CSV original ou encaminhe para revisão.");
    const { invalid, errors } = prepared.preview.standalone;
    if (previewOnly) return Response.json({ success: true, data: historicalPreview.parse({
      ...known, accepted: known.records - invalid, rejected: invalid, errors,
      diagnostics: prepared.batch.rows.reduce((sum, row) => sum + row.diagnostics.length, 0),
    }) }, { headers });
    if (known.state === "conflict") throw new IntakeError(409, "competencia_ja_importada",
      "Esta competência possui outro lote. A substituição exige revisão separada.");
  }
  if (previewOnly) return Response.json({ success: true, data: directCsvPreview.parse(prepared.preview) }, { headers });
  if (prepared.preview.sha256 !== digest.data) throw new IntakeError(409);
  if (prepared.preview.standalone.invalid) throw new IntakeError(422, undefined, "Corrija os registros inválidos indicados na prévia.");
  await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
  try {
    if (historical) await client.query("SET LOCAL lock_timeout='4s'");
    const receiver = historical ? "sentinela_pcdf_historico.receive" : "sentinela_pcdf_local.receive_csv";
    const { rows: [row] } = await client.query(`SELECT ${receiver}($1,$2,$3,$4,$5) AS data`, [
      randomUUID(), actor.subject, actor.account, prepared.batch, Buffer.from(prepared.content),
    ]);
    if (row?.data?.conflict === "competencia")
      throw new IntakeError(409, "competencia_ja_importada", "Já existe um lote PCDF nesta competência. Consulte o Histórico.");
    if (row?.data?.conflict === "proveniencia")
      throw new IntakeError(409, "proveniencia_ja_registrada", "Uma origem deste arquivo já pertence a outro lote e exige revisão.");
    const receipt = (historical ? historicalReceipt : directReceipt).parse(row?.data);
    await client.query("COMMIT");
    return Response.json({ success: true, data: receipt }, { headers, status: receipt.replay ? 200 : 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

export async function directPcdf(request: Request) {
  let client: Client | undefined;
  let attempt: string | undefined;
  let committing = false;
  try {
    const mode = directPcdfMode();
    const hosted = hostedImportMode();
    const origin = hosted?.origin ?? mode?.origin;
    const write = request.method === "POST";
    if (!origin || request.headers.get("host") !== new URL(origin).host
      || (write && request.headers.get("origin") !== origin)) throw new IntakeError(403);
    const hostedPrincipal = hosted ? await getHostedImportPrincipal() : null;
    const principal: OperationalPrincipal | null = hosted ? hostedPrincipal : await getOperationalPrincipal();
    if (!principal) throw new IntakeError(401);
    if (principal.role === "Analista" || !hasPermission(principal.role, "importar")) throw new IntakeError(403);
    const search = new URL(request.url).searchParams;
    const step = search.get("etapa");
    const v2 = write && search.has("versao");
    const historical = search.get("modalidade") === "historico";
    const standalone = v2 && (search.get("modalidade") === "csv" || historical);
    const mainMode = hosted || integratedImportMode();
    const detail = !write && !historical && search.size ? z.strictObject({
      execucao: z.uuid(), pagina: z.string().regex(/^[1-9]\d{0,2}$/),
    }).safeParse(Object.fromEntries(search)) : null;
    if (new Set(search.keys()).size !== search.size || (detail && (!mainMode || !detail.success))
      || (historical && (!mainMode || (!write && search.size !== 1)))
      || (write && (v2 ? search.get("versao") !== "2.0" || (standalone
        ? search.size !== 3 || !["validar", "confirmar"].includes(step ?? "")
        : search.size !== 2 || step !== "confirmar")
        : search.size !== 1 || !["validar", "confirmar"].includes(step ?? "")))) throw new IntakeError(400);
    const localActor = !hosted && standalone && (integratedSupabaseMode() || (mainMode && process.env.SENTINELA_OPERATIONAL_CLONE === "1"))
      ? operationalActor(principal) : null;
    if (standalone && (!hosted && !localActor || hosted && principal.role !== "Administrador")) throw new IntakeError(403);
    if (hosted && write && step !== "validar" && !(historical ? hosted.historicalWrite : hosted.write))
      throw new IntakeError(403, "importacao_desabilitada");
    if (v2 && !standalone && !syntheticPcdfV2Enabled()) throw new IntakeError(403);
    if (!hosted && write && !standalone && step !== "validar" && (principal.source !== "local" || !principal.localAccountId))
      throw new IntakeError(403);
    const readOnly = !write || step === "validar";
    const timeout = historical && !readOnly ? 120000 : undefined;
    const remote = hostedPrincipal ? hostedImportConnection(hostedPrincipal, timeout) : null;
    if (remote && hostedPrincipal) {
      client = remote.client;
      if (!await attestHostedImportDatabase(remote, hostedPrincipal, readOnly)) throw new IntakeError(403);
      const { rows: [check] } = await client.query("SELECT sentinela_pcdf_local.preflight() AS role");
      if (check?.role !== principal.role) throw new IntakeError(403);
    } else if (mode) {
      const connection = localImportConnection(principal.role, mode.port, readOnly, timeout);
      client = connection.client;
      await attestLocalImportDatabase(client, connection.login, mode, principal.role);
    } else throw new IntakeError(403);
    const hostedActor = remote && principal.role === "Administrador" ? { subject: remote.actor, account: remote.account } : null;
    const actor = hostedActor ?? localActor;
    if (historical) {
      const { rows: [status] } = await client.query(`SELECT coalesce(has_function_privilege(
        to_regprocedure('sentinela_pcdf_historico.status()'),'EXECUTE'),false) AS installed`);
      if (!status?.installed) throw new IntakeError(503, "historico_nao_instalado",
        "A fila histórica aguarda a instalação autorizada no PostgreSQL.");
      if (!write) {
        const { rows: [result] } = await client.query("SELECT sentinela_pcdf_historico.status() AS data");
        if (hosted) {
          const items = z.array(historicalMonth).parse(result?.data ?? []);
          const block = !hostedActor ? "profile"
            : items.length !== historicalMonthCount ? "inventory"
            : items.find(item => item.month === "2021-01")?.state !== "done" ? "january"
            : !hosted.historicalWrite ? "configuration"
            : await historicalRecoveryReady(client, hostedActor.subject) ? undefined : "recovery";
          return Response.json({ success: true, data: historicalStatus.parse({
            items, canApprove: !block, canValidate: Boolean(hostedActor && items.length), ...(block && { block }),
          }) }, { headers });
        }
        const approval = operationalActor(principal);
        const permitted = approval && (await client.query(
          "SELECT sentinela_gestao_autorizacao.capacidade($1,$2) AS allowed", [approval.subject, approval.account],
        )).rows[0]?.allowed === true;
        return Response.json({ success: true, data: completeHistoricalStatus.parse({
          items: result?.data, canApprove: Boolean(permitted),
        }) }, { headers });
      }
    }
    if (detail?.success) {
      const { execucao, pagina } = detail.data;
      const { rows: [row] } = await client.query("SELECT sentinela_pcdf_local.detail($1,$2) AS data", [
        execucao, (Number(pagina) - 1) * 25,
      ]);
      if (!row?.data) throw new IntakeError(404);
      return Response.json({ success: true, data: directDetail.parse(row.data) }, { headers });
    }
    if (!write) {
      const { rows: [row] } = await client.query(occurrenceManagementMode()
        ? "SELECT sentinela_gestao.marcar_historico(sentinela_pcdf_local.history()) AS data"
        : "SELECT sentinela_pcdf_local.history() AS data");
      return Response.json({ success: true, data: directHistory.parse(row.data) }, { headers });
    }

    if (standalone && actor) {
      committing = step === "confirmar";
      return await intakeStandalone(client, request, !committing, actor, historical, Boolean(hosted));
    }
    if (v2 && principal.localAccountId) return await confirmSyntheticV2(client, request, principal.localAccountId);
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
      requestId, remote?.account ?? principal.localAccountId, { name, month, sha256, bytes: size, records: rows.length, manifestSha },
    ]);
    attempt = requestId;
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    const result = await client.query("SELECT sentinela_pcdf_local.receive($1,$2,$3,$4) AS data", [
      requestId, payload, input.csv, input.manifest,
    ]);
    const data = result.rows[0].data;
    if (data?.review === true) {
      await client.query("COMMIT");
      attempt = undefined;
      throw new IntakeError(409);
    }
    const receipt = directReceipt.parse(data);
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
    const message = error instanceof IntakeError && error.diagnostic === "pacote_pcdf_v2_invalido"
      ? "O pacote não passou nas verificações do layout PCDF v2.0."
      : error instanceof IntakeError ? error.message
      : error instanceof LocalImportDbError && status === 503 ? error.message
      : code === "23514" ? "Falha de integridade na recepção do PCDF. A transação foi revertida."
      : committing && status === 503 ? "Falha de persistência. Consulte o histórico antes de reenviar."
      : messages[status];
    return Response.json({ success: false, error: { message,
      ...(error instanceof IntakeError && error.diagnostic && { diagnostic: error.diagnostic }) } }, { status, headers });
  } finally {
    await client?.end().catch(() => {});
  }
}
