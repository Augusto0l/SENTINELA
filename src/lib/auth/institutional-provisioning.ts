import "server-only"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"
import type { InstitutionalCreate } from "@/contracts/institutional-users"
import type { Principal } from "@/lib/auth/policy"
import { linkInstitutionalUser, verifyInstitutionalCreation } from "@/lib/db/institutional-users"
import { institutionalAuthAdmin } from "@/lib/supabase/admin"
import { publicSupabaseConfig } from "@/lib/supabase/config"

const lookup = z.object({ exists: z.boolean(), pending: z.uuid().optional() })

export class InstitutionalCreationFailure extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}
const duplicate = () => new InstitutionalCreationFailure(409, "Já existe uma conta com este e-mail.")
const pending = () => new InstitutionalCreationFailure(503, "O cadastro ficou pendente. Reenvie os mesmos dados para concluir.")

export async function provisionInstitutionalUser(principal: Principal, { password, ...data }: InstitutionalCreate) {
  if (principal.source !== "supabase" || principal.role !== "Administrador")
    throw new InstitutionalCreationFailure(403, "O cadastro requer um Administrador institucional.")
  const config = publicSupabaseConfig()
  const admin = await institutionalAuthAdmin()
  if (!config || !admin || !await verifyInstitutionalCreation(principal))
    throw new InstitutionalCreationFailure(503, "O provisionamento institucional está indisponível.")
  const cadastro = { actor: principal.id, identity: principal.authUserId, name: data.name, perfil: data.perfil, orgao: data.orgao }
  const existing = await admin.schema("sentinela_api").rpc("consultar_cadastro", { email: data.email, cadastro })
  const account = lookup.safeParse(existing.data)
  if (existing.error || !account.success) throw new InstitutionalCreationFailure(503, "A consulta de identidades está indisponível.")

  let id: string
  if (account.data.pending) {
    id = account.data.pending
    const verifier = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000) }) },
    })
    const { data: verified, error } = await verifier.auth.signInWithPassword({ email: data.email, password })
    if (error || verified.user?.id !== id)
      throw new InstitutionalCreationFailure(409, "Informe a senha inicial usada no cadastro pendente.")
    await verifier.auth.signOut({ scope: "local" })
  } else {
    if (account.data.exists) throw duplicate()
    const created = await admin.auth.admin.createUser({ email: data.email, password, email_confirm: true,
      app_metadata: { sentinela_cadastro_institucional: cadastro, sentinela_onboarding: "provisioning" } })
    if (created.error?.code === "email_exists" || created.error?.code === "user_already_exists") throw duplicate()
    if (created.error?.code === "weak_password")
      throw new InstitutionalCreationFailure(422, "O autenticador recusou a senha inicial. Escolha outra senha forte.")
    const identity = z.uuid().safeParse(created.data.user?.id)
    if (created.error || !identity.success || created.data.user?.email !== data.email) throw pending()
    id = identity.data
  }

  let record
  try { record = await linkInstitutionalUser(principal, id, data) }
  catch (error) {
    if ((error as { code?: string })?.code !== "23505") throw pending()
    // Only a confirmed local conflict is compensated. The provider trigger allows
    // cleanup of its inactive link and the FK protects a concurrently activated link.
    if ((await admin.auth.admin.deleteUser(id)).error) throw pending()
    throw duplicate()
  }
  const result = await admin.auth.admin.updateUserById(id, {
    app_metadata: { sentinela_cadastro_institucional: cadastro, sentinela_onboarding: "password" },
  })
  if (result.error || result.data.user?.app_metadata.sentinela_onboarding !== "password") throw pending()
  return { ...record, ativo: true }
}
