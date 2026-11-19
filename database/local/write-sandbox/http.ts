// Isolated loopback only. The Next.js adapter validates its cookie session.
import { z } from "zod"
import { SandboxError, sandboxCreateSchema, type createSandboxRegistrar } from "./service.ts"
import { sandboxUpdateSchema } from "./mutation-contracts.ts"

const addressField = z.string().trim().min(1).max(100)
const street = z.string().trim().min(1).max(240)
const createBody = sandboxCreateSchema.safeExtend({ bairroOuSetor: addressField, endereco: street.optional() })
const changes = sandboxUpdateSchema.shape.alteracoes.safeExtend({ bairroOuSetor: addressField.optional(), endereco: street.optional() })
const updateBody = sandboxUpdateSchema.safeExtend({ alteracoes: changes }).refine(
  ({ alteracoes }) => (alteracoes.local === undefined) === (alteracoes.bairroOuSetor === undefined),
)
const maxBodyBytes = 32 * 1024
const root = "/api/v1/ocorrencias"
const errors: Record<number, string> = {
  400: "Requisição inválida.", 401: "Sessão de ensaio necessária.", 403: "Operação recusada.",
  404: "Recurso indisponível.", 405: "Método não permitido.", 409: "Conflito de versão ou comando.",
  413: "Corpo da requisição excede o limite.", 415: "Use application/json.",
  422: "Dados recusados.", 503: "Operação experimental indisponível.",
}

function reply(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
}

async function readJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new SandboxError(415)
  if (Number(request.headers.get("content-length")) > maxBodyBytes) throw new SandboxError(413)
  const reader = request.body?.getReader()
  if (!reader) throw new SandboxError(400)
  const decoder = new TextDecoder("utf-8", { fatal: true })
  let text = "", bytes = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return JSON.parse(text + decoder.decode()) as unknown
      bytes += value.byteLength
      if (bytes > maxBodyBytes) throw new SandboxError(413)
      text += decoder.decode(value, { stream: true })
    }
  } catch (error) {
    if (error instanceof SandboxError) throw error
    throw new SandboxError(400)
  } finally {
    void reader.cancel().catch(() => {})
  }
}

export function createSandboxWriteHandler(origin: string, service: ReturnType<typeof createSandboxRegistrar>) {
  if (!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(origin)) throw new SandboxError(403)
  return async (request: Request, context?: { verifiedSession: true }) => {
    try {
      const url = new URL(request.url)
      if (process.env.NODE_ENV !== "development" || process.env.SENTINELA_SANDBOX_WRITE !== "1"
        || url.origin !== origin || request.headers.get("host") !== url.host
        || request.headers.get("origin") !== origin) throw new SandboxError(403)
      if (url.search) throw new SandboxError(400)
      const [, id, action] = /^\/api\/v1\/ocorrencias\/([^/]+)(?:\/(inativacao))?$/.exec(url.pathname) ?? []
      if (!id && url.pathname !== root) throw new SandboxError(404)
      if (request.method !== (id && !action ? "PATCH" : "POST")) throw new SandboxError(405)
      const token = context?.verifiedSession ? "server-verified-session" : /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get("authorization") ?? "")?.[1]
      if (!token) throw new SandboxError(401)
      const input = await readJson(request)
      if (!id) {
        const { bairroOuSetor, endereco, ...payload } = createBody.parse(input)
        if (context?.verifiedSession) {
          if (!endereco) throw new SandboxError(422)
          return reply(await service.register(token, payload, request.headers.get("idempotency-key"),
            { address: endereco, district: bairroOuSetor }), 201)
        }
        return reply(await service.register(token, { ...payload, local: `${payload.local} — ${bairroOuSetor}` },
          request.headers.get("idempotency-key")), 201)
      }
      if (action) return reply(await service.inactivate(token, { id, payload: input }), 200)
      const { alteracoes: { bairroOuSetor, endereco, ...alteracoes }, ...payload } = updateBody.parse(input)
      if (context?.verifiedSession) {
        if (!endereco || !bairroOuSetor) throw new SandboxError(422)
        return reply(await service.edit(token, { id, payload: { ...payload, alteracoes } },
          { address: endereco, district: bairroOuSetor }), 200)
      }
      if (alteracoes.local !== undefined) alteracoes.local = `${alteracoes.local} — ${bairroOuSetor}`
      return reply(await service.edit(token, { id, payload: { ...payload, alteracoes } }), 200)
    } catch (error) {
      const status = error instanceof z.ZodError ? 422 : error instanceof SandboxError ? error.status : 503
      return reply({ success: false, scope: "sandbox-synthetic-only", error: { status, message: errors[status] } }, status)
    }
  }
}
