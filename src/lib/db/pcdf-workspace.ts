import "server-only"
import { spawn } from "node:child_process"
import { join } from "node:path"
import { Client } from "pg"
import { z } from "zod"
import { attestManifest } from "../../../database/local/write-sandbox/service.ts"
import { getLocalPrincipal } from "@/lib/auth/local-server"
import { hasPermission, type Permission, type Role } from "@/lib/auth/policy"
import { isolatedPcdfMode } from "@/lib/db/isolated-write-mode"
import { pcdfDecision, pcdfIssue, pcdfLot, pcdfMonth, pcdfPromotion,
  pcdfReviewFilters, pcdfUpload } from "@/contracts/pcdf-workspace"
import { parseAnalyticsSearch, persistentAnalyticsData } from "@/contracts/persistent-analytics"
import { analyticsSql } from "@/lib/db/analytics-query"

const maxCsvBytes = 16 * 1024 * 1024
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Host" }
const identities: Record<Role, [string, string]> = {
  Administrador: ["sentinela_sbx_admin", "SENTINELA_SANDBOX_ADMIN_PASSWORD"],
  Operador: ["sentinela_sbx_operator", "SENTINELA_SANDBOX_OPERATOR_PASSWORD"],
  Analista: ["sentinela_sbx_analyst", "SENTINELA_SANDBOX_ANALYST_PASSWORD"],
}

class WorkspaceError extends Error {
  constructor(readonly status: number) { super("Operação PCDF indisponível.") }
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

function stagePayload(content: Buffer, month: string) {
  return new Promise<{ batch: object; xmlSha: string; xmlSize: number }>((resolve, reject) => {
    const env = { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP }
    const child = spawn("python", ["-E", "-B", join(process.cwd(), "database", "local", "pcdf-sandbox", "workspace.py"), month], {
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
      if (code !== 0) return reject(new WorkspaceError(code === 2 ? 422 : 503))
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))) }
      catch { reject(new WorkspaceError(503)) }
    })
    child.stdin.end(content)
  })
}

type Operation = "upload" | "lots" | "promote" | "review" | "decide" | "analytics"
const permissions: Record<Operation, Permission> = {
  upload: "importar", lots: "importar", promote: "importar", review: "consultar_central", decide: "corrigir", analytics: "analisar",
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
  try {
    const mode = isolatedPcdfMode()
    if (!mode || request.headers.get("host") !== new URL(mode.origin).host) throw new WorkspaceError(403)
    const write = operation === "upload" || operation === "promote" || operation === "decide"
    if (write && request.headers.get("origin") !== mode.origin) throw new WorkspaceError(403)
    const principal = await getLocalPrincipal()
    if (!principal) throw new WorkspaceError(401)
    if (!principal.localSubject || !hasPermission(principal.role, permissions[operation])) throw new WorkspaceError(403)
    const [user, passwordKey] = identities[operation === "analytics" ? "Analista" : principal.role]
    const password = process.env[passwordKey]
    if (!password) throw new WorkspaceError(503)
    const manifest = await attestManifest({ manifest: join(mode.root, "manifest.json"), expectedUUID: mode.id,
      credentials: { Administrador: { user: "", password: "" }, Operador: { user: "", password: "" } } })
    if (manifest.pcdf_workspace !== true) throw new WorkspaceError(403)
    if (operation === "analytics" && manifest.pcdf_workspace_revision !== 2) throw new WorkspaceError(403)

    const search = new URL(request.url).searchParams
    if (new Set(search.keys()).size !== search.size) throw new WorkspaceError(400)
    const query = Object.fromEntries(search)
    const bodyType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()
    let statement: string, params: unknown[], schema: z.ZodType
    switch (operation) {
      case "upload": {
        if (bodyType !== "text/csv") throw new WorkspaceError(415)
        const { competencia } = z.strictObject({ competencia: pcdfMonth }).parse(query)
        const content = await readBody(request, maxCsvBytes)
        const { batch, xmlSha, xmlSize } = await stagePayload(content, competencia)
        statement = "SELECT sentinela_pcdf_lab.upload($1,$2,$3,$4,$5) AS data"
        params = [principal.localSubject, batch, content, xmlSha, xmlSize]
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

    client = new Client({ host: "127.0.0.1", port: 55432, database: "sentinela_rls_sandbox", user, password, ssl: false,
      connectionTimeoutMillis: 3000, statement_timeout: 45000, query_timeout: 50000, lock_timeout: 3000 })
    await client.connect()
    await client.query(write ? "BEGIN" : "BEGIN READ ONLY")
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
    const result = await client.query(statement, params)
    const validated = schema.safeParse(result.rows[0]?.data)
    if (!validated.success) throw new WorkspaceError(503)
    await client.query("COMMIT")
    const status = operation === "upload" && !(validated.data as z.infer<typeof pcdfUpload>).replay ? 201 : 200
    return Response.json({ success: true, scope: "sandbox-synthetic-only", data: validated.data }, { status, headers })
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => {})
    const status = error instanceof WorkspaceError ? error.status
      : error instanceof SyntaxError || error instanceof z.ZodError ? 400 : sqlError(error)
    const message: Record<number, string> = { 400: "Parâmetros ou corpo inválidos.", 401: "Sessão necessária.",
      403: "Operação não autorizada.", 404: "Registro não encontrado.", 409: "Conflito. Atualize a consulta antes de repetir.",
      413: "Arquivo ou corpo excede o limite.", 415: "Formato de envio não aceito.",
      422: "CSV ou alteração recusados.", 503: "Operação PCDF indisponível." }
    return Response.json({ success: false, error: { status, message: message[status] } }, { status, headers })
  } finally {
    await client?.end().catch(() => {})
  }
}
