import "server-only"
import type { InstitutionalCreate } from "@/contracts/institutional-users"
import type { Principal } from "@/lib/auth/policy"
import { prepareInstitutionalCreation } from "@/lib/db/institutional-users"
import { institutionalAuthAdmin } from "@/lib/supabase/admin"

export class InstitutionalCreationFailure extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export async function provisionInstitutionalUser(principal: Principal, requestId: string, { password, ...data }: InstitutionalCreate) {
  const admin = await institutionalAuthAdmin()
  if (!admin) throw new InstitutionalCreationFailure(503, "O servidor ainda não está configurado para provisionar contas no Supabase Auth.")

  const existing = await prepareInstitutionalCreation(principal, requestId, data)
  if (existing) return existing

  // The database trigger commits the Auth identity, profile, contact and audit together.
  const result = await admin.auth.admin.createUser({
    email: data.email, password, email_confirm: true,
    app_metadata: { sentinela_cadastro_solicitacao: requestId, sentinela_onboarding: "password" },
  }).catch(() => null)

  // Resolve lost responses and concurrent retries using the same request identifier.
  const persisted = await prepareInstitutionalCreation(principal, requestId, data)
  if (persisted) return persisted
  if (result?.error?.code === "weak_password")
    throw new InstitutionalCreationFailure(422, "O Supabase Auth recusou a senha inicial. Escolha outra senha forte.")
  if (["email_exists", "user_already_exists"].includes(result?.error?.code ?? ""))
    throw new InstitutionalCreationFailure(409, "Já existe uma conta com este e-mail.")
  throw new InstitutionalCreationFailure(503, "O cadastro não foi confirmado. Tente novamente com os mesmos dados.")
}
