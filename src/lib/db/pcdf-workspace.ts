import "server-only"
import { spawn } from "node:child_process"
import { join } from "node:path"
import { Client } from "pg"
import { z } from "zod"
import { attestManifest } from "../../../database/local/write-sandbox/service.ts"
import { getLocalPrincipal } from "@/lib/auth/local-server"
import { hasPermission, type Permission, type Role } from "@/lib/auth/policy"
import { isolatedPcdfMode, generalImportMode } from "@/lib/db/isolated-write-mode"
import { pcdfDecision, pcdfIssue, pcdfLot, pcdfMonth, pcdfPromotion,
  pcdfReviewFilters, pcdfReviewPage, pcdfReviewPageQuery, pcdfUpload } from "@/contracts/pcdf-workspace"
import { parseAnalyticsSearch, persistentAnalyticsData } from "@/contracts/persistent-analytics"
import { analyticsSql } from "@/lib/db/analytics-query"
import { assertPersistentIdentity, persistentPcdfCompletionEnabled, persistentPcdfEnabled, persistentReadConfig, persistentWriters } from "@/lib/db/config"
import { localAllowed } from "@/lib/auth/local-provider"
import { persistentIdentitySql } from "@/lib/db/persistent-read"
import { generalDetail, generalHistory, generalReceipt, generalUploadLimit } from "@/contracts/general-import"
import { GeneralImportError, generalInput, prepareGeneralImport } from "@/lib/db/general-import-input"
import { integratedImportMode } from "@/lib/db/pcdf-direct-mode"
import { attestLocalImportDatabase, localImportConnection, LocalImportDbError } from "@/lib/db/local-import-db"

const maxCsvBytes = 16 * 1024 * 1024
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Host" }
const identities: Record<Role, [string, string]> = {
  Administrador: ["sentinela_sbx_admin", "SENTINELA_SANDBOX_ADMIN_PASSWORD"],
  Operador: ["sentinela_sbx_operator", "SENTINELA_SANDBOX_OPERATOR_PASSWORD"],
  Analista: ["sentinela_sbx_analyst", "SENTINELA_SANDBOX_ANALYST_PASSWORD"],
}

class WorkspaceError extends Error {
  constructor(readonly status: number, readonly diagnostic?: string) { super("Operação PCDF indisponível.") }
}

async function readBody(request: Request, limit: number) {
  const length = request.headers.get("content-length")
  if (length !== null && Number(length) > limit) throw new WorkspaceError(413)
  const reader = request.body?.getReader()
  if (!reader) throw new WorkspaceError(400)
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) {
        if (length !== null && size !== Number(length)) throw new WorkspaceError(400)
        return Buffer.concat(chunks, size)
      }
      size += chunk.value.length
      if (size > limit) throw new WorkspaceError(413)
      chunks.push(chunk.value)
    }
  } finally {
    void reader.cancel().catch(() => {})
  }
}

function stagePayload(content: Buffer, month: string, xlsx = false) {
  return new Promise<{ batch: object; xmlSha: string; xmlSize: number; csv?: string }>((resolve, reject) => {
    const env = { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP }
    const script = xlsx ? ["persistent-homologation", "xlsx.py"] : ["pcdf-sandbox", "workspace.py"]
    const child = spawn("python", ["-E", "-B", join(process.cwd(), "database", "local", ...script), month], {
      env, windowsHide: true, timeout: 30000, stdio: ["pipe", "pipe", "ignore"],
    })
    const chunks: Buffer[] = []
    let size = 0
    child.stdout.on("data", (value: Buffer) => {
      size += value.length
      if (size > 128 * 1024 * 1024) child.kill()
      else chunks.push(value)
    })
    child.on("error", () => reject(new WorkspaceError(503)))
    child.stdin.on("error", () => { /* The child reports parse failures via its exit code. */ })
    child.on("close", code => {
      const output = Buffer.concat(chunks).toString("utf8")
      if (code !== 0) {
        let diagnostic: string | undefined
        if (xlsx && code === 2 && output.length <= 256) {
          try { diagnostic = z.string().regex(/^[a-z0-9_]{1,100}$/).parse(JSON.parse(output).error) } catch {}
        }
        return reject(new WorkspaceError(code === 2 ? 422 : 503, diagnostic))
      }
      try { resolve(JSON.parse(output)) }
      catch { reject(new WorkspaceError(503)) }
    })
    child.stdin.end(content)
  })
}

type Operation = "upload" | "lots" | "promote" | "review" | "decide" | "analytics"
  | "general-upload" | "general-lots" | "general-detail" | "general-review" | "general-decide"
const permissions: Record<Operation, Permission> = {
  upload: "importar", lots: "importar", promote: "importar", review: "consultar_central", decide: "corrigir", analytics: "analisar",
  "general-upload": "importar", "general-lots": "importar", "general-detail": "importar",
  "general-review": "consultar_central", "general-decide": "corrigir",
}

function sqlError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  switch (code) {
    case "42501": return 403
    case "P0002": return 404
    case "40001": case "23505": return 409
    case "22023": case "23514": return 422
    default: return 503
  }
}

export async function pcdfWorkspace(request: Request, operation: Operation, id?: string) {
  let client: Client | undefined
  let registered: [string, string] | undefined
  try {
    const general = operation.startsWith("general-")
    const integrated = ["general-upload", "general-lots", "general-detail"].includes(operation) && integratedImportMode()
    const persistent = !general && persistentPcdfEnabled()
    const completion = persistentPcdfCompletionEnabled()
    const mode = persistent || integrated ? null : general ? generalImportMode() : isolatedPcdfMode()
    const origin = persistent ? process.env.SENTINELA_APP_ORIGIN : integrated ? integrated.origin : mode?.origin
    if (!origin || request.headers.get("host") !== new URL(origin).host
      || (persistent && !localAllowed(request.headers.get("host")))) throw new WorkspaceError(403)
    const write = operation === "upload" || operation === "promote" || operation === "decide"
      || operation === "general-upload" || operation === "general-decide"
    if (write && request.headers.get("origin") !== origin) throw new WorkspaceError(403)
    const principal = await getLocalPrincipal()
    if (!principal) throw new WorkspaceError(401)
    if (principal.source !== "local" || !hasPermission(principal.role, permissions[operation])) throw new WorkspaceError(403)
    const connection = integrated && principal.role !== "Analista" ? localImportConnection(principal.role) : null
    const writer = principal.role === "Analista" ? undefined : persistentWriters[principal.role]
    if ((!persistent && !connection && !principal.localSubject) || (persistent && writer && writer.subject!==principal.localSubject)) throw new WorkspaceError(403)
    const reader = persistent ? persistentReadConfig(principal.role) : null
    const [user, passwordKey] = reader ? [writer?.login ?? reader.user, `SENTINELA_PERSISTENT_PASSWORD_${writer?.login ?? reader.user}`]
      : identities[operation === "analytics" ? "Analista" : principal.role]
    const password = process.env[passwordKey]
    if (!connection && (!password || (persistent && !/^[a-f0-9]{64}$/.test(password)))) throw new WorkspaceError(503)
    const manifest = mode && await attestManifest({ manifest: join(mode.root, "manifest.json"), expectedUUID: mode.id,
      credentials: { Administrador: { user: "", password: "" }, Operador: { user: "", password: "" } } })
    if (manifest && (general ? manifest.general_import !== true
      : manifest.pcdf_workspace !== true || (operation === "analytics" && manifest.pcdf_workspace_revision !== 2)))
      throw new WorkspaceError(403)

    const search = new URL(request.url).searchParams
    if (new Set(search.keys()).size !== search.size) throw new WorkspaceError(400)
    const query = Object.fromEntries(search)
    const bodyType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()
    let statement: string, params: unknown[], schema: z.ZodType
    let intake: { metadata: Awaited<ReturnType<typeof prepareGeneralImport>>["metadata"]; content: Buffer } | undefined
    switch (operation) {
      case "general-upload": {
        z.strictObject({}).parse(query)
        const key = z.uuid().parse(request.headers.get("idempotency-key"))
        const input = generalInput(request, bodyType)
        const content = await readBody(request, generalUploadLimit)
        const prepared = await prepareGeneralImport(content, input)
        intake = { metadata: prepared.metadata, content }
        statement = "SELECT sentinela_import_lab.receive($1,$2,$3) AS data"
        params = [connection?.actor ?? principal.localSubject, key, { summary: prepared.summary, rows: prepared.rows }]
        schema = generalReceipt
        break
      }
      case "general-lots": {
        z.strictObject({}).parse(query)
        statement = "SELECT sentinela_import_lab.history() AS data"
        params = []
        schema = generalHistory
        break
      }
      case "general-detail": {
        const { pagina } = z.strictObject({ pagina: z.string().regex(/^[1-9]\d{0,2}$/).default("1") }).parse(query)
        statement = "SELECT sentinela_import_lab.detail($1,$2) AS data"
        params = [z.uuid().parse(id), (Number(pagina) - 1) * 25]
        schema = generalDetail
        break
      }
      case "general-review": {
        const { tipo, prioridade, status, q, ordem, pagina, limite = 25 } = pcdfReviewPageQuery.parse(query)
        statement = "SELECT ARRAY(SELECT sentinela_import_lab.review($1,$2,$3,$4,$5,NULL,$6,$7)) AS data"
        params = [tipo, prioridade, status, q, ordem, (pagina - 1) * limite, limite + 1]
        schema = z.array(pcdfIssue).max(limite + 1).transform(items => pcdfReviewPage.parse({
          items: items.slice(0, limite), page: pagina, pageSize: limite, hasMore: items.length > limite && pagina < 10000,
        }))
        break
      }
      case "general-decide": {
        z.strictObject({}).parse(query)
        if (bodyType !== "application/json") throw new WorkspaceError(415)
        const body = pcdfDecision.parse(JSON.parse((await readBody(request, 8192)).toString("utf8")))
        statement = "SELECT sentinela_import_lab.decide($1,$2,$3,$4,$5,$6) AS data"
        params = [principal.localSubject, z.uuid().parse(id), body.versaoEsperada, body.decisao,
          body.decisao === "resolvida" ? body.valor : null, body.justificativa]
        schema = pcdfIssue
        break
      }
      case "upload": {
        const xlsx = completion && bodyType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if (!xlsx && bodyType !== "text/csv") throw new WorkspaceError(415)
        const { competencia } = z.strictObject({ competencia: pcdfMonth }).parse(query)
        const content = await readBody(request, maxCsvBytes)
        const { batch, xmlSha, xmlSize, csv } = await stagePayload(content, competencia, xlsx)
        if (xlsx) {
          if (!csv) throw new WorkspaceError(503)
          statement = "SELECT sentinela_pcdf_lab.upload_xlsx($1,$2,$3,$4,$5,$6) AS data"
          params = [principal.localSubject, batch, Buffer.from(csv,"base64"), xmlSha, xmlSize, content]
        } else {
          statement = "SELECT sentinela_pcdf_lab.upload($1,$2,$3,$4,$5) AS data"
          params = [principal.localSubject, batch, content, xmlSha, xmlSize]
        }
        schema = pcdfUpload
        break
      }
      case "lots":
        z.strictObject({}).parse(query)
        statement = "SELECT ARRAY(SELECT sentinela_pcdf_lab.workspace_lots()) AS data"
        params = []
        schema = z.array(pcdfLot)
        break
      case "promote":
        z.strictObject({}).parse(query)
        statement = "SELECT sentinela_pcdf_lab.workspace_promote($1,$2) AS data"
        params = [principal.localSubject, z.uuid().parse(id)]
        schema = pcdfPromotion
        break
      case "review": {
        if (completion && search.has("pagina")) {
          const { tipo, prioridade, status, q, ordem, pagina, limite = 25 } = pcdfReviewPageQuery.parse(query)
          statement = "SELECT ARRAY(SELECT sentinela_pcdf_lab.review_page($1,$2,$3,$4,$5,$6,$7)) AS data"
          params = [tipo, prioridade, status, q, ordem, pagina, limite]
          schema = z.array(pcdfIssue).max(limite + 1).transform(items => pcdfReviewPage.parse({
            items: items.slice(0,limite), page: pagina, pageSize: limite, hasMore: items.length > limite && pagina < 10000,
          }))
          break
        }
        const { tipo, prioridade, status } = pcdfReviewFilters.parse(query)
        statement = "SELECT ARRAY(SELECT sentinela_pcdf_lab.workspace_review($1,$2,$3,NULL)) AS data"
        params = [tipo, prioridade, status]
        schema = z.array(pcdfIssue)
        break
      }
      case "decide": {
        z.strictObject({}).parse(query)
        if (bodyType !== "application/json") throw new WorkspaceError(415)
        const body = pcdfDecision.parse(JSON.parse((await readBody(request, 8192)).toString("utf8")))
        statement = "SELECT sentinela_pcdf_lab.decide($1,$2,$3,$4,$5,$6) AS data"
        params = [principal.localSubject, z.uuid().parse(id), body.versaoEsperada, body.decisao,
          body.decisao === "resolvida" ? body.valor : null, body.justificativa]
        schema = pcdfIssue
        break
      }
      case "analytics": {
        const analyticsQuery = analyticsSql(parseAnalyticsSearch(search))
        statement = analyticsQuery.text
        params = analyticsQuery.values
        schema = persistentAnalyticsData
        break
      }
    }

    client = connection?.client ?? new Client({ ...(reader ?? { host: "127.0.0.1", port: 55432, database: "sentinela_rls_sandbox" }), user, password, ssl: false,
      connectionTimeoutMillis: 3000, statement_timeout: 45000, query_timeout: 50000, lock_timeout: 3000 })
    if (integrated && connection) {
      await attestLocalImportDatabase(client, connection.login, integrated, principal.role)
      statement = statement.replace("sentinela_import_lab.", "sentinela_import_local.")
    } else {
      await client.connect()
    }
    await client.query(write ? "BEGIN" : "BEGIN READ ONLY")
    if (persistent) {
      const { rows:[identity] } = await client.query(persistentIdentitySql)
      assertPersistentIdentity(identity,user,write ? "off" : "on")
      statement=statement.replace("sentinela_pcdf_lab.","sentinela_homolog_pcdf.")
    } else if (mode && manifest) {
      const { rowCount } = await client.query(`SELECT 1 FROM pg_roles r
      WHERE r.rolname=current_user AND current_user=$1 AND session_user=$1
        AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolinherit)
        AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
        AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
        AND current_database()='sentinela_rls_sandbox' AND host(inet_server_addr())='127.0.0.1' AND inet_server_port()=55432
        AND current_setting('server_version_num')='170011' AND current_setting('sentinela.sandbox_uuid',true)=$2
        AND (SELECT system_identifier::text FROM pg_control_system())=$3
        AND abs(extract(epoch FROM pg_postmaster_start_time())::bigint-$4::bigint)<=2`,
    [user, mode.id, manifest.system_id, manifest.start_epoch])
      if (rowCount !== 1) throw new WorkspaceError(403)
    } else if (!connection) throw new WorkspaceError(403)
    const generalSchema = connection ? "sentinela_import_local" : "sentinela_import_lab"
    if (intake) {
      const key = [String(params[0]), String(params[1])] as [string, string]
      await client.query(`SELECT ${generalSchema}.begin_request($1,$2,$3,$4,$5)`,
        [...key, intake.metadata, intake.content, params[2]])
      await client.query("COMMIT")
      registered = key
      await client.query("BEGIN")
    }
    const result = await client.query(statement, params)
    if (operation === "general-detail" && !result.rows[0]?.data) throw new WorkspaceError(404)
    const validated = schema.safeParse(result.rows[0]?.data)
    if (!validated.success) throw new WorkspaceError(503)
    await client.query("COMMIT")
    registered = undefined
    const status = (operation === "upload" || operation === "general-upload") && !(validated.data as { replay: boolean }).replay ? 201 : 200
    return Response.json({ success: true, scope: connection ? "importacao-local" : persistent ? "homologacao-persistente-sintetica" : "sandbox-synthetic-only",
      data: validated.data }, { status, headers })
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => {})
    if (registered) {
      const schema = integratedImportMode() ? "sentinela_import_local" : "sentinela_import_lab"
      await client?.query(`SELECT ${schema}.fail($1,$2)`, registered).catch(() => {})
    }
    const status = error instanceof WorkspaceError || error instanceof GeneralImportError || error instanceof LocalImportDbError ? error.status
      : error instanceof SyntaxError || error instanceof URIError || error instanceof z.ZodError ? 400 : sqlError(error)
    const message: Record<number, string> = { 400: "Parâmetros ou corpo inválidos.", 401: "Sessão necessária.",
      403: "Operação não autorizada.", 404: "Registro não encontrado.", 409: "Conflito. Atualize a consulta antes de repetir.",
      413: "Arquivo ou corpo excede o limite.", 415: "Formato de envio não aceito.",
      422: "Arquivo ou alteração recusados.", 503: "Operação PCDF indisponível." }
    const state = (error as { code?: string } | null)?.code
    const detail = error instanceof LocalImportDbError ? error.message : registered && state === "23514"
      ? "Falha de reconciliação. A transação foi revertida." : registered && status === 503
        ? "Falha de persistência. Consulte o histórico antes de reenviar." : message[status]
    return Response.json({ success: false, error: { status, message: detail,
      ...((error instanceof WorkspaceError || error instanceof GeneralImportError) && error.diagnostic && { diagnostic: error.diagnostic }) } }, { status, headers })
  } finally {
    await client?.end().catch(() => {})
  }
}
