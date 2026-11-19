import "server-only"
import { Client } from "pg"
import { z } from "zod"
import { getLocalPrincipal } from "@/lib/auth/local-server"
import { localAllowed } from "@/lib/auth/local-provider"
import { hasPermission, type Principal } from "@/lib/auth/policy"
import { apiError } from "@/lib/db/http"
import { isIsolatedMutation } from "@/lib/db/isolated-write-mode"
import { assertPersistentIdentity, persistentCrudEnabled, persistentPcdfEnabled, persistentReadConfig, persistentWriters } from "@/lib/db/config"
import { persistentIdentitySql, readLocal } from "@/lib/db/persistent-read"
import type { IsolatedOccurrence } from "@/lib/db/isolated-occurrence-read"
import { sandboxCreateSchema } from "../../../database/local/write-sandbox/service.ts"
import { sandboxUpdateSchema, sandboxInactivationCommandSchema } from "../../../database/local/write-sandbox/mutation-contracts.ts"

const structuredAddress = { endereco: z.string().trim().min(1).max(240), bairroOuSetor: z.string().trim().min(1).max(100) }
const createInput = sandboxCreateSchema.safeExtend(structuredAddress)
const editInput = sandboxUpdateSchema.safeExtend({
  alteracoes: sandboxUpdateSchema.shape.alteracoes.safeExtend(structuredAddress),
})
const receipt = z.object({ id: z.uuid(), auditId: z.uuid(), versao: z.string().regex(/^[1-9]\d*$/),
  atorSintetico: z.string() }).passthrough()

export function readPersistentWorkspace(principal: Principal) {
  return readLocal(principal, async client => {
    const { rows } = await client.query<{ data: IsolatedOccurrence }>("SELECT sentinela_homolog_crud.list_workspace() AS data")
    if (persistentPcdfEnabled()) {
      const imported = await client.query<{ data: IsolatedOccurrence }>(`SELECT jsonb_build_object(
        'id',o.id,'ativo',o.ativo,'elegivel',false,'fonte','PCDF-SANDBOX','versao',o.versao::text,
        'data',o.data_fato::text,'horario',o.horario_fato::text,'local',o.local,'ra',o.ra_id,
        'latitude',o.latitude,'longitude',o.longitude,'endereco',NULL,'bairro',NULL,
        'naturezas',coalesce((SELECT jsonb_agg(jsonb_build_object('naturezaId',a.natureza_id,
          'crimeTentado',a.crime_tentado) ORDER BY a.natureza_id) FROM sentinela.ocorrencia_naturezas a
          WHERE a.ocorrencia_id=o.id),'[]'::jsonb)) AS data
        FROM sentinela.ocorrencias o WHERE o.fonte='PCDF-SANDBOX'
        ORDER BY o.data_fato DESC NULLS LAST,o.id LIMIT 100`)
      rows.push(...imported.rows)
    }
    return rows.map(row => row.data)
  })
}

export async function persistentOccurrenceMutation(request: Request) {
  const url = new URL(request.url)
  if (!persistentCrudEnabled() || !isIsolatedMutation(url.pathname, request.method)
    || !localAllowed(request.headers.get("host")) || request.headers.get("origin") !== process.env.SENTINELA_APP_ORIGIN) {
    return apiError("FORBIDDEN", "Escrita de homologação indisponível.")
  }
  const principal = await getLocalPrincipal()
  if (!principal) return apiError("UNAUTHORIZED", "Sessão necessária.")
  if (principal.role !== "Administrador" && principal.role !== "Operador") return apiError("FORBIDDEN", "Operação não autorizada.")
  const writer = persistentWriters[principal.role]
  const [, rawId, inactivation] = /\/ocorrencias(?:\/([^/]+))?(\/inativacao)?$/.exec(url.pathname) ?? []
  const mode = !rawId ? "create" : inactivation ? "inactivate" : "edit"
  const permission = mode === "create" ? "cadastrar" : mode === "edit" ? "editar" : "inativar"
  if (principal.source !== "local" || principal.localSubject !== writer.subject || !hasPermission(principal.role, permission))
    return apiError("FORBIDDEN", "Vínculo de autoria ou perfil não autorizado.")

  const key = z.uuid().safeParse(request.headers.get("idempotency-key"))
  if (url.search || !key.success || (rawId && !z.uuid().safeParse(rawId).success))
    return apiError("BAD_REQUEST", "Identificador, chave de idempotência ou parâmetros inválidos.")
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return apiError("BAD_REQUEST", "Use application/json.")
  const reader = request.body?.getReader()
  if (!reader) return apiError("BAD_REQUEST", "Corpo da requisição necessário.")
  let input: unknown
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true })
    let bytes = 0, text = ""
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 32768) return apiError("BAD_REQUEST", "Corpo da requisição excede o limite.")
      text += decoder.decode(value, { stream: true })
    }
    input = JSON.parse(text + decoder.decode())
  } catch { return apiError("BAD_REQUEST", "JSON inválido.") }
  finally { void reader.cancel().catch(() => {}) }
  let body: unknown, address: string | null = null, district: string | null = null
  try {
    if (mode === "create") {
      const { endereco, bairroOuSetor, ...fields } = createInput.parse(input)
      address = endereco; district = bairroOuSetor; body = fields
    } else if (mode === "edit") {
      const parsed = editInput.parse(input)
      address = parsed.alteracoes.endereco; district = parsed.alteracoes.bairroOuSetor; body = parsed
    } else body = sandboxInactivationCommandSchema.parse({ id: rawId, payload: input }).payload
  } catch { return apiError("VALIDATION_ERROR", "Revise o comando e os campos de endereço.") }

  const password = process.env[`SENTINELA_PERSISTENT_PASSWORD_${writer.login}`]
  if (!password || !/^[a-f0-9]{64}$/.test(password)) return apiError("SERVICE_UNAVAILABLE", "Escrita indisponível.")
  let config
  try { config = persistentReadConfig(principal.role) } catch {
    return apiError("SERVICE_UNAVAILABLE", "Destino de homologação indisponível.")
  }
  const client = new Client({ ...config, user: writer.login, password, ssl: false, connectionTimeoutMillis: 3000,
    statement_timeout: 5000, query_timeout: 7000, lock_timeout: 2000, application_name: "sentinela-homologacao-crud" })
  client.on("error", () => {})
  try {
    await client.connect()
    await client.query("BEGIN")
    const { rows: [identity] } = await client.query(persistentIdentitySql)
    assertPersistentIdentity(identity, writer.login, "off")
    const { rows: [row] } = await client.query("SELECT sentinela_homolog_crud.command($1,$2,$3,$4,$5,$6,$7) AS data",
      [writer.subject, key.data, mode, rawId ?? null, JSON.stringify(body), address, district])
    const result = receipt.parse(row?.data)
    if (result.atorSintetico !== writer.login) throw Error("Autor divergente")
    await client.query("COMMIT")
    return Response.json({ success: true, scope: "homologacao-persistente-sintetica", persisted: true, data: result },
      { status: mode === "create" ? 201 : 200, headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === "23505" || code === "40001") return apiError("CONFLICT", "Conflito de versão ou de idempotência.")
    if (code === "P0002") return apiError("NOT_FOUND", "Ocorrência não encontrada.")
    if (code === "42501") return apiError("FORBIDDEN", "Operação não autorizada.")
    if (code?.startsWith("22") || code === "23503" || code === "23514")
      return apiError("VALIDATION_ERROR", "Ocorrência inelegível ou dados inválidos.")
    return apiError("SERVICE_UNAVAILABLE", "Escrita indisponível.")
  } finally { await client.end().catch(() => {}) }
}
