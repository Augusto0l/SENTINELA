import "server-only"
import { join } from "node:path"
import { createSandboxRegistrar } from "../../../database/local/write-sandbox/service.ts"
import { createSandboxWriteHandler } from "../../../database/local/write-sandbox/http.ts"
import { getLocalPrincipal } from "@/lib/auth/local-server"
import { isolatedWriteMode, isIsolatedMutation } from "@/lib/db/isolated-write-mode"
import { hasPermission } from "@/lib/auth/policy"
import { apiError } from "@/lib/db/http"
import { persistentCrudEnabled } from "@/lib/db/config"
import { persistentOccurrenceMutation } from "@/lib/db/persistent-crud"

export async function isolatedOccurrenceMutation(request: Request) {
  if (persistentCrudEnabled()) return persistentOccurrenceMutation(request)
  const mode = isolatedWriteMode()
  const path = new URL(request.url).pathname
  if (!mode || !isIsolatedMutation(path, request.method)) return apiError("FORBIDDEN", "Escrita isolada indisponível.")
  if (request.headers.get("origin") !== mode.origin) return apiError("FORBIDDEN", "Origem não autorizada.")
  const principal = await getLocalPrincipal()
  if (!principal) return apiError("UNAUTHORIZED", "Sessão necessária.")
  if (!principal.localSubject) return apiError("FORBIDDEN", "Conta isolada sem vínculo individual.")
  const permission = request.method === "PATCH" ? "editar" : path.endsWith("/inativacao") ? "inativar" : "cadastrar"
  if (principal.source !== "local" || !hasPermission(principal.role, permission)) return apiError("FORBIDDEN", "Operação não autorizada.")

  const service = createSandboxRegistrar({
    manifest: join(mode.root, "manifest.json"),
    expectedUUID: mode.id,
    credentials: {
      Administrador: { user: "sentinela_sbx_admin", password: process.env.SENTINELA_SANDBOX_ADMIN_PASSWORD ?? "" },
      Operador: { user: "sentinela_sbx_operator", password: process.env.SENTINELA_SANDBOX_OPERATOR_PASSWORD ?? "" },
    },
  }, async () => ({ kind: "sandbox-synthetic-only", role: principal.role, subject: principal.localSubject }))
  try {
    // Next may normalize request.url to localhost. The HTTP handler checks the
    // original Host and Origin again against the exact configured loopback.
    const url = new URL(request.url)
    const boundRequest = new Request(mode.origin + url.pathname + url.search, request)
    return await createSandboxWriteHandler(mode.origin, service)(boundRequest, { verifiedSession: true })
  } finally {
    await service.close()
  }
}
