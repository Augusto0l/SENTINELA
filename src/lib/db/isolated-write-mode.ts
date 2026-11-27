import { join } from "node:path"
import { pcdfImportPath, pcdfReviewPath } from "@/contracts/pcdf-workspace"
import { generalImportPath, generalReviewPath } from "@/contracts/general-import"

export function isolatedWriteMode(env = process.env) {
  const id = env.SENTINELA_SANDBOX_WRITE_ID
  if (env.NODE_ENV !== "development" || env.SENTINELA_AUTH_PROVIDER !== "local"
    || env.SENTINELA_PERSISTENT_HOMOLOGATION === "1"
    || env.SENTINELA_LOCAL_BIND !== "127.0.0.1" || env.SENTINELA_SANDBOX_WRITE !== "1"
    || env.VERCEL || env.VERCEL_ENV || !env.USERPROFILE || !id
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) return null
  const origin = env.SENTINELA_APP_ORIGIN
  if (!origin || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(origin)) return null
  const root = join(env.USERPROFILE, ".sentinela-local", "rls-sandboxes", "rls-sandbox-" + id)
  if (env.SENTINELA_LOCAL_ACCOUNTS_FILE !== join(root, "next-accounts.json")) return null
  return { id, origin, root }
}

export function isIsolatedMutation(path: string, method: string) {
  return (method === "POST" && (path === "/api/v1/ocorrencias" || /^\/api\/v1\/ocorrencias\/[^/]+\/inativacao$/.test(path)))
    || (method === "PATCH" && /^\/api\/v1\/ocorrencias\/[^/]+$/.test(path))
}

export function isolatedPcdfMode(env = process.env) {
  return env.SENTINELA_SANDBOX_PCDF === "1" ? isolatedWriteMode(env) : null
}

export function generalImportMode(env = process.env) {
  return env.SENTINELA_SANDBOX_GENERAL_IMPORT === "1" ? isolatedWriteMode(env) : null
}

export function isGeneralImportEndpoint(path: string, method: string) {
  const child = path.slice(generalImportPath.length + 1)
  return (path === generalImportPath && (method === "GET" || method === "POST"))
    || (method === "GET" && (path === generalReviewPath ||
      (path.startsWith(generalImportPath + "/") && /^[0-9a-f-]{36}$/i.test(child))))
    || (method === "PATCH" && path.startsWith(generalReviewPath + "/") && /^[0-9a-f-]{36}$/i.test(child.slice(8)))
}

export function isPcdfEndpoint(path: string, method: string) {
  return ((path === pcdfImportPath || path === pcdfReviewPath) && method === "GET")
    || (method === "POST" && (path === pcdfImportPath || /^\/api\/v1\/importacoes\/pcdf\/[^/]+\/consolidacao$/.test(path)))
    || (method === "PATCH" && /^\/api\/v1\/central-revisao\/[^/]+$/.test(path))
}
