import { z } from "zod";
import { institutionalCreate, institutionalDelete, institutionalEdit } from "@/contracts/institutional-users";
import { deleteInstitutionalUser, InstitutionalDeletionFailure, previewInstitutionalDeletion } from "@/lib/auth/institutional-deletion";
import { InstitutionalCreationFailure, provisionInstitutionalUser } from "@/lib/auth/institutional-provisioning";
import { getOperationalPrincipal } from "@/lib/auth/operational-server";
import { institutionalUsers } from "@/lib/db/institutional-users";
import { hostedOperationalMode, institutionalDatabaseMode } from "@/lib/db/pcdf-direct-mode";
import { JsonLimitExceeded, readBoundedJson } from "@/lib/http/read-json";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Host" };
const error = (status: number, message: string) => Response.json({ error: message }, { status, headers });

async function authorize(request: Request) {
  const mode = institutionalDatabaseMode();
  if (!mode || request.headers.get("host") !== new URL(mode.origin).host
    || (request.method !== "GET" && request.headers.get("origin") !== mode.origin))
    return error(403, "Origem não autorizada.");
  const principal = await getOperationalPrincipal();
  if (!principal) return error(401, "Sessão necessária.");
  if (principal.role !== "Administrador" || principal.source !== "supabase")
    return error(403, "A gestão de usuários requer um Administrador institucional.");
  if (request.method !== "GET" && hostedOperationalMode()?.write === false)
    return error(403, "Escrita institucional indisponível neste ambiente.");
  return principal;
}

export async function GET(request: Request) {
  const principal = await authorize(request);
  if (principal instanceof Response) return principal;
  const params = new URL(request.url).searchParams;
  const targetId = params.get("exclusao");
  if (targetId !== null && (!z.uuid().safeParse(targetId).success || params.size !== 1))
    return error(422, "Identificador de usuário inválido.");
  try {
    const data = targetId ? await previewInstitutionalDeletion(principal, targetId) : await institutionalUsers(principal);
    return Response.json({ data }, { headers });
  } catch (failure) {
    if (failure instanceof InstitutionalDeletionFailure) return error(failure.status, failure.message);
    if ((failure as { code?: string })?.code === "42501") return error(403, "Consulta institucional não autorizada.");
    return error(503, "Não foi possível consultar o cadastro institucional.");
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
  const parsed = institutionalCreate.safeParse(body.data);
  if (!parsed.success) return error(422, "Confira o nome, e-mail Gmail, perfil e senha inicial forte.");
  try {
    return Response.json({ data: await provisionInstitutionalUser(principal, parsed.data) }, { status: 201, headers });
  } catch (failure) {
    return failure instanceof InstitutionalCreationFailure ? error(failure.status, failure.message)
      : error(503, "Não foi possível concluir o cadastro institucional.");
  }
}

export async function PATCH(request: Request) {
  const principal = await authorize(request);
  if (principal instanceof Response) return principal;
  const body = await jsonBody(request);
  if (body instanceof Response) return body;
  const edit = institutionalEdit.safeParse(body.data);
  if (!edit.success) return error(422, "Confira o nome, e-mail de contato e órgão ou unidade.");
  try {
    return Response.json({ data: await institutionalUsers(principal, edit.data) }, { headers });
  } catch (failure) {
    const code = (failure as { code?: string })?.code;
    if (code === "40001") return error(409, "O cadastro mudou. Atualize a página antes de editar novamente.");
    if (code === "P0002") return error(404, "Usuário não encontrado.");
    if (code === "42501") return error(403, "Edição institucional não autorizada.");
    return error(503, "Não foi possível salvar o cadastro.");
  }
}

export async function DELETE(request: Request) {
  const principal = await authorize(request);
  if (principal instanceof Response) return principal;
  const body = await jsonBody(request);
  if (body instanceof Response) return body;
  const parsed = institutionalDelete.safeParse(body.data);
  if (!parsed.success) return error(422, "Informe o usuário e o e-mail de confirmação.");
  try {
    await deleteInstitutionalUser(principal, parsed.data.id, parsed.data.email);
    return new Response(null, { status: 204, headers });
  } catch (failure) {
    return failure instanceof InstitutionalDeletionFailure ? error(failure.status, failure.message)
      : error(503, "Não foi possível concluir a exclusão institucional.");
  }
}
