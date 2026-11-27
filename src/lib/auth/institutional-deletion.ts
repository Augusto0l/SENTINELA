import "server-only"
import { z } from "zod"
import { ROLES, type Principal } from "@/lib/auth/policy"
import { institutionalDeletionStep } from "@/lib/db/institutional-users"
import { institutionalAuthAdmin } from "@/lib/supabase/admin"

const targetSchema = z.discriminatedUnion("complete", [
  z.object({ complete: z.literal(true) }),
  z.object({ complete: z.literal(false), authId: z.uuid(), name: z.string(), perfil: z.enum(ROLES), email: z.email().nullable() }),
])

export class InstitutionalDeletionFailure extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

const notFound = () => new InstitutionalDeletionFailure(404, "Conta institucional não encontrada.")
const pending = () => new InstitutionalDeletionFailure(503, "A exclusão ficou pendente. Confira a listagem e tente concluir novamente.")

async function deletionTarget(principal: Principal, id: string) {
  try {
    return targetSchema.parse(await institutionalDeletionStep(principal, id, "consultar"))
  } catch (failure) {
    const code = (failure as { code?: string })?.code
    if (code === "23514") throw new InstitutionalDeletionFailure(409, "O último Administrador ativo não pode ser excluído.")
    if (code === "42501") throw new InstitutionalDeletionFailure(403, "A autoexclusão é proibida e a operação requer um Administrador ativo.")
    if (code === "P0002") throw notFound()
    throw failure
  }
}

type AdminClient = NonNullable<Awaited<ReturnType<typeof institutionalAuthAdmin>>>
const missingIdentity = (error: { code?: string; status?: number } | null) => error?.code === "user_not_found" || error?.status === 404

async function confirmationEmail(admin: AdminClient, target: Extract<z.infer<typeof targetSchema>, { complete: false }>) {
  if (target.email) return target.email
  const { data, error } = await admin.auth.admin.getUserById(target.authId)
  if (missingIdentity(error)) throw notFound()
  if (error || data.user?.id !== target.authId || !data.user.email)
    throw new InstitutionalDeletionFailure(503, "Não foi possível confirmar o e-mail de acesso no Supabase.")
  return data.user.email.toLowerCase()
}

export async function previewInstitutionalDeletion(principal: Principal, id: string) {
  const target = await deletionTarget(principal, id)
  if (target.complete) throw notFound()
  const admin = await institutionalAuthAdmin()
  if (!admin) throw pending()
  return { id, name: target.name, perfil: target.perfil, email: await confirmationEmail(admin, target) }
}

export async function deleteInstitutionalUser(principal: Principal, id: string, email: string) {
  const target = await deletionTarget(principal, id)
  if (target.complete) return
  const admin = await institutionalAuthAdmin()
  if (!admin) throw new InstitutionalDeletionFailure(503, "A exclusão institucional está indisponível.")
  if (await confirmationEmail(admin, target) !== email)
    throw new InstitutionalDeletionFailure(422, "Digite o e-mail de acesso exibido na confirmação.")

  await institutionalDeletionStep(principal, id, "iniciar", email)
  try {
    const { error } = await admin.schema("sentinela_api").rpc("bloquear_exclusao_usuario", {
      ator: principal.id, identidade: principal.authUserId, alvo: id, vinculo: target.authId, email,
    })
    if (error?.code === "23514") throw new InstitutionalDeletionFailure(409, "O último Administrador ativo não pode ser excluído.")
    if (error) throw pending()

    const deletion = await admin.auth.admin.deleteUser(target.authId)
    if (deletion.error && !missingIdentity(deletion.error)) {
      const verification = await admin.auth.admin.getUserById(target.authId)
      if (!missingIdentity(verification.error)) throw pending()
    }
    await institutionalDeletionStep(principal, id, "concluir", email)
  } catch (failure) {
    await institutionalDeletionStep(principal, id, "falha", email).catch(() => {})
    throw failure instanceof InstitutionalDeletionFailure ? failure : pending()
  }
}
