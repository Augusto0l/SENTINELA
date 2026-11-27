import { z } from "zod";
import { institutionalCreate, institutionalDelete, institutionalDeletionTarget, institutionalEdit } from "@/contracts/institutional-users";
import { InstitutionalCreationFailure, provisionInstitutionalUser } from "@/lib/auth/institutional-provisioning";
import { getOperationalPrincipal } from "@/lib/auth/operational-server";
import { archiveInstitutionalUser, institutionalUsers, updateInstitutionalUser } from "@/lib/db/institutional-users";
import { LocalOccurrenceForbidden } from "@/lib/db/local-occurrences";
import { hostedOperationalMode, institutionalDatabaseMode, institutionalUsersWriteEnabled } from "@/lib/db/pcdf-direct-mode";
import { JsonLimitExceeded, readBoundedJson } from "@/lib/http/read-json";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Host" };
const error = (status: number, message: string) => Response.json({ error: message }, { status, headers });

async function authorize(request: Request) {
  const mode = institutionalDatabaseMode();
  const reading = request.method === "GET" || request.method === "HEAD";
  if (!mode || request.headers.get("host") !== new URL(mode.origin).host
    || (!reading && request.headers.get("origin") !== mode.origin))
    return error(403, "Origem não autorizada.");
  const principal = await getOperationalPrincipal();
  if (!principal) return error(401, "Sessão institucional ativa necessária.");
  if (principal.role !== "Administrador" || principal.source !== "supabase")
    return error(403, "A gestão de usuários requer um Administrador institucional.");
  if (!reading && !institutionalUsersWriteEnabled() && (hostedOperationalMode() || request.method !== "PATCH"))
    return error(403, "Escrita institucional indisponível neste ambiente.");
  return principal;
}

function databaseError(failure: unknown, message: string) {
  const code = (failure as { code?: string } | null)?.code;
  if (failure instanceof InstitutionalCreationFailure) return error(failure.status, failure.message);
  if (code === "42501" || failure instanceof LocalOccurrenceForbidden) return error(403, "Operação institucional não autorizada.");
  if (code === "23505") return error(409, "Já existe uma conta com este e-mail.");
  if (code === "23514") return error(409, "O último Administrador ativo precisa manter seu perfil e acesso.");
  if (code === "P0002") return error(404, "Usuário não encontrado.");
  if (code === "40001") return error(409, "O cadastro ou a solicitação mudou. Atualize a página e tente novamente.");
  if (code === "55P03" || code === "40P01") return error(409, "Outro gerenciamento está em andamento. Tente novamente.");
  if (code === "22023") return error(422, "Confira os dados e a confirmação da operação.");
  return error(503, message);
}

export async function GET(request: Request) {
  const principal = await authorize(request);
  if (principal instanceof Response) return principal;
  const params = new URL(request.url).searchParams;
  const targetId = params.get("exclusao");
  if (targetId !== null && (!z.uuid().safeParse(targetId).success || params.size !== 1))
    return error(422, "Identificador de usuário inválido.");
  try {
    const records = await institutionalUsers(principal);
    if (!targetId) return Response.json({ data: records }, { headers });
    if (targetId === principal.id) return error(403, "Outra conta de Administrador deve realizar esta operação.");
    const target = records.find(record => record.id === targetId);
    if (!target) return error(404, "Usuário não encontrado.");
    const preview = institutionalDeletionTarget.safeParse({ ...target, email: target.loginEmail });
    if (!preview.success) return error(409, "O e-mail de acesso da conta está indisponível para confirmação.");
    return Response.json({ data: preview.data }, { headers });
  } catch (failure) {
    return databaseError(failure, "Não foi possível consultar o cadastro institucional.");
  }
}

async function jsonBody(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return error(415, "Envie dados em JSON.");
  try { return { data: await readBoundedJson(request, 4096) }; }
  catch (failure) {
    return failure instanceof JsonLimitExceeded ? error(413, "Solicitação grande demais.") : error(400, "JSON inválido.");
  }
}

export async function POST(request: Request) {
  const principal = await authorize(request);
  if (principal instanceof Response) return principal;
  const body = await jsonBody(request);
  if (body instanceof Response) return body;
  const requestId = z.uuidv4().safeParse(request.headers.get("idempotency-key"));
  const parsed = institutionalCreate.safeParse(body.data);
  if (!requestId.success || !parsed.success) return error(422, "Confira os dados do cadastro e a senha inicial.");
  try {
    return Response.json({ data: await provisionInstitutionalUser(principal, requestId.data, parsed.data) }, { status: 201, headers });
  } catch (failure) {
    return databaseError(failure, "Não foi possível confirmar o cadastro. Tente novamente com os mesmos dados.");
  }
}

export async function PATCH(request: Request) {
  const principal = await authorize(request);
  if (principal instanceof Response) return principal;
  const body = await jsonBody(request);
  if (body instanceof Response) return body;
  const edit = institutionalEdit.safeParse(body.data);
  if (!edit.success) return error(422, "Confira os dados do usuário, do perfil ou do status.");
  if (!institutionalUsersWriteEnabled() && !("name" in edit.data))
    return error(403, "Alteração de acesso indisponível neste ambiente.");
  try {
    return Response.json({ data: await updateInstitutionalUser(principal, edit.data) }, { headers });
  } catch (failure) {
    return databaseError(failure, "Não foi possível salvar o cadastro.");
  }
}

export async function DELETE(request: Request) {
  const principal = await authorize(request);
  if (principal instanceof Response) return principal;
  const body = await jsonBody(request);
  if (body instanceof Response) return body;
  const parsed = institutionalDelete.safeParse(body.data);
  if (!parsed.success) return error(422, "Informe o usuário e o e-mail de acesso para confirmar.");
  try {
    await archiveInstitutionalUser(principal, parsed.data.id, parsed.data.version, parsed.data.email);
    return new Response(null, { status: 204, headers });
  } catch (failure) {
    return databaseError(failure, "Não foi possível concluir a exclusão lógica.");
  }
}
