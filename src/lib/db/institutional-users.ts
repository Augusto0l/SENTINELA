import "server-only";
import { institutionalUser, type InstitutionalCreate, type InstitutionalEdit, type InstitutionalUser } from "@/contracts/institutional-users";
import type { Principal } from "@/lib/auth/policy";
import { institutionalDatabaseMode } from "@/lib/db/pcdf-direct-mode";
import { withOperationalDatabase, LocalOccurrenceForbidden } from "@/lib/db/local-occurrences";

export function institutionalUsers(principal: Principal): Promise<InstitutionalUser[]>;
export function institutionalUsers(principal: Principal, edit: InstitutionalEdit): Promise<InstitutionalUser>;
export async function institutionalUsers(principal: Principal, edit?: InstitutionalEdit) {
  if (principal.source !== "supabase" || principal.role !== "Administrador" || !institutionalDatabaseMode())
    throw new LocalOccurrenceForbidden();
  return withOperationalDatabase(principal, !edit, async (client) => {
    const actor = [principal.id, principal.authUserId];
    if (!edit) {
      const { rows } = await client.query("SELECT sentinela_pessoas.listar($1,$2) AS data", actor);
      return institutionalUser.array().parse(rows[0]?.data);
    }
    const { rows } = await client.query("SELECT sentinela_pessoas.editar($1,$2,$3,$4,$5,$6,$7) AS data",
      [...actor, edit.id, edit.version, edit.name, edit.email || null, edit.orgao || null]);
    return institutionalUser.parse(rows[0]?.data);
  }, true);
}

export async function verifyInstitutionalCreation(principal: Principal) {
  if (principal.source !== "supabase" || principal.role !== "Administrador" || !institutionalDatabaseMode())
    throw new LocalOccurrenceForbidden();
  return withOperationalDatabase(principal, false, async (client) => {
    const { rows: [row] } = await client.query(`SELECT sentinela_pessoas.listar($1,$2) IS NOT NULL AS allowed,
      coalesce(has_function_privilege(to_regprocedure('sentinela_pessoas.criar(uuid,uuid,uuid,text,text,text,text)'),'EXECUTE'),false) AS installed`,
    [principal.id, principal.authUserId]);
    return row?.allowed === true && row?.installed === true;
  }, true);
}

export async function linkInstitutionalUser(principal: Principal, id: string, data: Omit<InstitutionalCreate, "password">) {
  if (principal.source !== "supabase" || principal.role !== "Administrador" || !institutionalDatabaseMode())
    throw new LocalOccurrenceForbidden();
  return withOperationalDatabase(principal, false, async (client) => {
    const { rows } = await client.query("SELECT sentinela_pessoas.criar($1,$2,$3,$4,$5,$6,$7) AS data",
      [principal.id, principal.authUserId, id, data.name, data.email, data.perfil, data.orgao || null]);
    return institutionalUser.parse(rows[0]?.data);
  }, true);
}

export async function institutionalDeletionStep(principal: Principal, id: string,
  step: "consultar" | "iniciar" | "concluir" | "falha", email?: string) {
  if (principal.source !== "supabase" || principal.role !== "Administrador" || !institutionalDatabaseMode())
    throw new LocalOccurrenceForbidden();
  return withOperationalDatabase(principal, step === "consultar", async client => {
    const { rows } = await client.query("SELECT sentinela_pessoas.excluir($1,$2,$3,$4,$5) AS data",
      [principal.id, principal.authUserId, id, email ?? null, step]);
    return rows[0]?.data as unknown;
  }, true);
}
