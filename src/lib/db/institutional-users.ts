import "server-only";
import type { Client } from "pg";
import { z } from "zod";
import { institutionalUser, type InstitutionalCreate, type InstitutionalEdit } from "@/contracts/institutional-users";
import type { Principal } from "@/lib/auth/policy";
import { withHostedOperationalDatabase } from "@/lib/db/hosted-import-db";
import { hostedOperationalMode, institutionalDatabaseMode } from "@/lib/db/pcdf-direct-mode";
import { withOperationalDatabase, LocalOccurrenceForbidden } from "@/lib/db/local-occurrences";

function withUsersDatabase<T>(principal: Principal, readOnly: boolean, operation: (client: Client) => Promise<T>) {
  if (principal.source !== "supabase" || principal.role !== "Administrador" || !institutionalDatabaseMode())
    throw new LocalOccurrenceForbidden();
  return hostedOperationalMode()
    ? withHostedOperationalDatabase(principal, readOnly, operation, 8000, "users")
    : withOperationalDatabase(principal, readOnly, operation, true);
}

export async function institutionalUsers(principal: Principal) {
  return withUsersDatabase(principal, true, async client => {
    const { rows: [row] } = await client.query("SELECT sentinela_pessoas.listar($1,$2) AS data", [principal.id, principal.authUserId]);
    return institutionalUser.array().parse(row?.data);
  });
}

export async function institutionalUserCapabilities(principal: Principal) {
  return withUsersDatabase(principal, true, async client => {
    const { rows: [row] } = await client.query(`SELECT
      coalesce(has_function_privilege(to_regprocedure('sentinela_pessoas.preparar_cadastro(uuid,uuid,uuid,jsonb)'),'EXECUTE'),false) AS "create",
      coalesce(has_function_privilege(to_regprocedure('sentinela_pessoas.alterar_gestao(uuid,uuid,uuid,text,jsonb)'),'EXECUTE'),false) AS manage`);
    return { create: row?.create === true, manage: row?.manage === true };
  });
}

export async function prepareInstitutionalCreation(principal: Principal, requestId: string, data: Omit<InstitutionalCreate, "password">) {
  return withUsersDatabase(principal, false, async client => {
    const { rows: [row] } = await client.query("SELECT sentinela_pessoas.preparar_cadastro($1,$2,$3,$4) AS data",
      [principal.id, principal.authUserId, requestId, data]);
    const { record } = z.object({ record: institutionalUser.nullable().optional() }).parse(row?.data);
    if (record === null) throw Object.assign(new Error("Solicitação já concluída e conta arquivada."), { code: "40001" });
    return record;
  });
}

export async function updateInstitutionalUser(principal: Principal, { id, version, ...data }: InstitutionalEdit) {
  return withUsersDatabase(principal, false, async client => {
    const actor = [principal.id, principal.authUserId, id, version];
    if (!hostedOperationalMode() && "name" in data) {
      const { rows: [row] } = await client.query("SELECT sentinela_pessoas.editar($1,$2,$3,$4,$5,$6,$7) AS data",
        [...actor, data.name, data.email || null, data.orgao || null]);
      return institutionalUser.parse(row?.data);
    }
    const { rows: [row] } = await client.query("SELECT sentinela_pessoas.alterar_gestao($1,$2,$3,$4,$5) AS data", [...actor, data]);
    return institutionalUser.parse(row?.data);
  });
}

export async function archiveInstitutionalUser(principal: Principal, id: string, version: string, email: string) {
  await withUsersDatabase(principal, false, client => client.query(
    "SELECT sentinela_pessoas.alterar_gestao($1,$2,$3,$4,$5)",
    [principal.id, principal.authUserId, id, version, { confirmacao: email }],
  ));
}
