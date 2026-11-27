import { catalogVersion, CONTRACT_VERSION } from "@/contracts/common"
import {
  lotPurgeHistory, lotPurgePreview, managedLotDetail, managedLots, managedOccurrence, importManagementAvailability,
  managementRead, managementReceipt, managementWrite, managementWriteBlocked, protectedJanuaryLot, purgeAuthorizationReceipt,
} from "@/contracts/occurrence-management"
import { nowInDf } from "@/contracts/manual-occurrences"
import { pcdfNatureDescriptions } from "@/data/pcdfNatureCatalog"
import { getOperationalPrincipal } from "@/lib/auth/operational-server"
import { operationalHostAllowed } from "@/lib/auth/operational-access"
import { hasPermission } from "@/lib/auth/policy"
import { apiError } from "@/lib/db/http"
import { LocalOccurrenceReadOnly, withLocalOccurrenceDatabase, withOperationalDatabase } from "@/lib/db/local-occurrences"
import { occurrenceManagementMode, operationalOccurrenceManagementMode } from "@/lib/db/occurrence-management-mode"
import {
  manualActor, manualOperationalMode, manualOperationalReady,
  operationalActor, operationalImportReady, operationalImportReviewMode, operationalLotRecords,
  operationalPurgePreview, operationalReviewDraft, OperationalLotScopeUnavailable,
} from "@/lib/db/operational-import-review"
import { JsonLimitExceeded, readBoundedJson } from "@/lib/http/read-json"
import { cloneDatabasePort, hostedImportMode, hostedOperationalMode } from "@/lib/db/pcdf-direct-mode"
import { getHostedImportPrincipal, hostedImportActor, withHostedImportDatabase } from "@/lib/db/hosted-import-db"
import { januaryPurgeBackup } from "@/lib/db/january-purge-backup"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function success(data: unknown, persisted = false) {
  return Response.json({ success: true, data,
    meta: { contractVersion: CONTRACT_VERSION, catalogVersion, execution: { mode: "operacional", persisted } } },
  { headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Host" } })
}

function failure(error: unknown, action?: "autorizar_exclusao" | "excluir_lote") {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined
  const deleting = action === "excluir_lote"
  if (code === "42501" || error instanceof LocalOccurrenceReadOnly)
    return apiError("FORBIDDEN", deleting ? "A autorização de exclusão está ausente, vencida ou vinculada a outra sessão. Reconsulte o impacto."
      : "O servidor recusou o perfil, a autoria ou a autorização específica da operação.")
  if (code === "P0002") return apiError("NOT_FOUND", deleting ? "O lote já saiu do histórico. Confira os comprovantes de exclusão."
    : "Registro indisponível para esta operação.")
  if (code === "40001" || code === "55P03" || code === "23505" || (deleting && ["23503", "40P01"].includes(String(code))))
    return apiError("CONFLICT", deleting ? "O lote mudou, está em uso ou possui vínculos impeditivos. Consulte a prévia novamente."
      : action === "autorizar_exclusao" ? "A revisão mudou, há um impedimento ou já existe autorização vigente. Reconsulte o impacto."
      : "O registro mudou ou tem vínculos consolidados exclusivos. Confira o impacto novamente.")
  if (typeof code === "string" && code.startsWith("22"))
    return apiError("VALIDATION_ERROR", "Confira os campos alterados, a vigência territorial e a justificativa.")
  return apiError("SERVICE_UNAVAILABLE", "Não foi possível acessar o serviço de gestão. Confira o histórico antes de repetir uma alteração.")
}

export async function GET(request: Request) {
  const mode = occurrenceManagementMode()
  const hosted = hostedImportMode()
  const host = request.headers.get("host")
  if (hosted ? host !== new URL(hosted.origin).host : !operationalHostAllowed(host))
    return apiError("FORBIDDEN", "Gestão indisponível neste ambiente.")
  const hostedPrincipal = hosted ? await getHostedImportPrincipal() : null
  const principal = hosted ? hostedPrincipal : await getOperationalPrincipal()
  if (!principal) return apiError("UNAUTHORIZED", "Sessão necessária.")
  const params = new URL(request.url).searchParams
  const parsed = managementRead.safeParse(Object.fromEntries(params))
  if (!parsed.success || params.size !== new Set(params.keys()).size)
    return apiError("BAD_REQUEST", "Filtros ou identificador inválidos.")
  const query = parsed.data
  const manualOperating = !occurrenceManagementMode() && manualOperationalMode()
  if (manualOperating && (query.view === "manuais" || query.view === "consolidadas")) {
    const actor = manualActor(principal)
    if (host !== new URL(manualOperating.origin).host || !actor || !hasPermission(principal.role, "editar"))
      return apiError("FORBIDDEN", "Gestão manual indisponível para esta sessão.")
    try {
      const data = await withOperationalDatabase(principal, true, async client => {
        if (!await manualOperationalReady(client, actor)) throw new LocalOccurrenceReadOnly()
        const { rows: [row] } = await client.query("SELECT sentinela_ocorrencias_manual.contexto($1) AS data", [query.id])
        return row?.data === null ? null : managedOccurrence.parse(row?.data)
      })
      return data === null ? apiError("NOT_FOUND", "Registro indisponível para esta consulta.") : success(data)
    } catch (error) { return failure(error) }
  }
  const operational = hosted || operationalImportReviewMode()
  const actor = hostedPrincipal ? (hostedPrincipal.role === "Administrador" ? hostedImportActor(hostedPrincipal) : null)
    : operationalOccurrenceManagementMode() && operationalActor(principal)
  const withDatabase = <T,>(callback: (client: import("pg").Client) => Promise<T>) => hostedPrincipal
    ? withHostedImportDatabase(hostedPrincipal, true, callback)
    : withLocalOccurrenceDatabase(principal, true, callback)
  const admin = hasPermission(principal.role, "administrar") && hasPermission(principal.role, "editar")
  const legacyQuery = query.view === "registros_lote" || query.view === "rascunho_importado"
  let operationalActive = false
  if (actor && admin && !legacyQuery && (!hosted || hosted.write)) {
    try {
      operationalActive = await withDatabase(client => operationalImportReady(client, actor))
    } catch (error) { return failure(error) }
  }
  if (query.view === "disponibilidade") {
    const catalogoGestao = (!!mode || operationalActive) && hasPermission(principal.role, "importar")
    const respond = (escrita: "disponivel" | "ambiente_bloqueado" | "sem_permissao" | "banco_sem_escrita",
      consultaOperacional = false) =>
      success(importManagementAvailability.parse({
        catalogoGestao: catalogoGestao && escrita !== "banco_sem_escrita", escrita,
        ...(consultaOperacional && { consultaOperacional: true }),
      }))
    if (!admin) return respond("sem_permissao")
    if (operationalActive) return respond("disponivel", true)
    if (operational) {
      try {
        const readable = await withDatabase(async client => {
          const { rows: [row] } = await client.query(`SELECT
            coalesce(has_function_privilege(to_regprocedure('sentinela_ocorrencias_local.lista(text,jsonb,integer,text,text)'), 'EXECUTE'), false)
            AND coalesce(has_function_privilege(to_regprocedure('sentinela_pcdf_local.history()'), 'EXECUTE'), false) AS disponivel`)
          return row?.disponivel === true
        })
        if (readable) return respond("ambiente_bloqueado", true)
      } catch { /* Existing history can still report its own availability. */ }
      return apiError("SERVICE_UNAVAILABLE", "A consulta administrativa exige o PostgreSQL local atestado e as funções de leitura instaladas.")
    }
    if (!mode) return respond("ambiente_bloqueado")
    try {
      const writable = await withLocalOccurrenceDatabase(principal, false, async client => {
        const { rows: [row] } = await client.query(`SELECT NOT pg_is_in_recovery()
          AND coalesce(has_function_privilege(to_regprocedure('sentinela_gestao.mutar(jsonb,text)'), 'EXECUTE'), false)
          AND coalesce(has_function_privilege(to_regprocedure('sentinela_exclusao.excluir(jsonb,text)'), 'EXECUTE'), false)
          AND coalesce(has_function_privilege(to_regprocedure('sentinela_exclusao.previa(uuid)'), 'EXECUTE'), false) AS disponivel`)
        return row?.disponivel === true
      })
      return respond(writable ? "disponivel" : "banco_sem_escrita")
    } catch (error) {
      if (error instanceof LocalOccurrenceReadOnly) return respond("banco_sem_escrita")
      return apiError("SERVICE_UNAVAILABLE", "Não foi possível atestar a conexão com o PostgreSQL de homologação.")
    }
  }
  if (operational && (legacyQuery || (!operationalActive && query.view === "previa_exclusao"))) {
    if (!admin) return apiError("FORBIDDEN", "Consulta administrativa indisponível para este perfil.")
    try {
      const data = await withDatabase(async client => {
        if (query.view === "registros_lote") return operationalLotRecords(client, query.id, query.pagina, query.busca)
        if (query.view === "rascunho_importado") return operationalReviewDraft(client, query.id, query.lote)
        return operationalPurgePreview(client, query.id)
      })
      return data === null ? apiError("NOT_FOUND", "Registro indisponível para esta consulta.") : success(data)
    } catch (error) {
      if (error instanceof OperationalLotScopeUnavailable)
        return apiError("SERVICE_UNAVAILABLE", "A versão instalada do leitor não conseguiu isolar as associações deste lote.")
      return failure(error)
    }
  }
  if (legacyQuery)
    return apiError("FORBIDDEN", "Consulta indisponível neste ambiente.")
  const catalog = operationalActive ? operational : mode
  if (!catalog || host !== new URL(catalog.origin).host) return apiError("FORBIDDEN", "Gestão indisponível neste ambiente.")
  if (operationalActive && (query.view === "manuais" || query.view === "consolidadas"))
    return apiError("FORBIDDEN", "O escopo operacional desta gestão é de arquivos importados.")
  if (!hasPermission(principal.role, query.view === "manuais" ? "editar" : "importar")
    || (["consolidadas", "importados", "previa_exclusao", "exclusoes"].includes(query.view) && !hasPermission(principal.role, "administrar")))
    return apiError("FORBIDDEN", "Consulta indisponível para este perfil.")
  try {
    const data = await withDatabase(async client => {
      if (query.view === "arquivos") {
        const { rows: [row] } = await client.query("SELECT sentinela_gestao.arquivos($1) AS data", [query])
        const catalog = managedLots.parse(row?.data)
        if (!admin || !catalog.itens.length) return catalog
        const { rows } = operationalActive ? { rows: [] } : await client.query(
          "SELECT sentinela_exclusao.previa(id) AS data FROM unnest($1::uuid[]) AS ids(id)", [catalog.itens.map(lot => lot.id)])
        const previews = new Map(rows.map(row => {
          const preview = lotPurgePreview.parse(row.data)
          return [preview.id, preview] as const
        }))
        return managedLots.parse({ ...catalog, itens: catalog.itens.map(lot => ({
          ...lot, acoes: {
            edicao: lot.contrato === "geral-v1" ? "contrato"
              : !["concluida", "com_pendencias"].includes(lot.situacao) ? "situacao"
                : lot.recebidos ? "disponivel" : "sem_associacoes",
            bloqueiosExclusao: operationalActive ? [] : previews.get(lot.id)?.bloqueios,
          },
        })) })
      }
      if (query.view === "exclusoes") {
        const { rows: [row] } = await client.query("SELECT sentinela_exclusao.historico($1) AS data", [query.pagina])
        return lotPurgeHistory.parse(row?.data)
      }
      if (query.view === "previa_exclusao") {
        const { rows: [row] } = operationalActive && actor
          ? await client.query("SELECT sentinela_exclusao.previa($1,$2,$3) AS data", [query.id, actor.subject, actor.account])
          : await client.query("SELECT sentinela_exclusao.previa($1) AS data", [query.id])
        if (row?.data === null) return null
        const preview = lotPurgePreview.parse(row?.data)
        if (!preview.excecao) return preview
        const eligibleSession = !hosted && (principal.source === "supabase" || ("port" in catalog && catalog.port === cloneDatabasePort))
        const backup = eligibleSession && await januaryPurgeBackup()
        return { ...preview, excecao: { ...preview.excecao, elegivel: eligibleSession && preview.excecao.elegivel,
          backup: backup ? "verificado" : "indisponivel" } }
      }
      if (query.view === "arquivo") {
        const { rows: [row] } = await client.query("SELECT sentinela_gestao.arquivo($1) AS data", [query.id])
        return row?.data === null ? null : managedLotDetail.parse(row?.data)
      }
      const { rows: [row] } = await client.query("SELECT sentinela_gestao.contexto($1,$2) AS data", [query.view, query.id])
      return row?.data === null ? null : managedOccurrence.parse(row?.data)
    })
    return data === null ? apiError("NOT_FOUND", "Registro indisponível para esta consulta.") : success(data)
  } catch (error) { return failure(error) }
}

const manualStatements = {
  editar_manual: "SELECT sentinela_ocorrencias_manual.editar($1,$2,$3) AS data",
  inativar_manual: "SELECT sentinela_ocorrencias_manual.transicionar($1,$2,$3) AS data",
  consolidar_manual: "SELECT sentinela_ocorrencias_manual.transicionar($1,$2,$3) AS data",
} as const

// Manual occurrences on the operational database: institutional authorship, Administrador or Operador.
async function manualOperationalPOST(request: Request, mode: NonNullable<ReturnType<typeof manualOperationalMode>>) {
  if (request.headers.get("host") !== new URL(mode.origin).host || request.headers.get("origin") !== mode.origin)
    return apiError("FORBIDDEN", "A origem da solicitação não corresponde à instalação autorizada.")
  const principal = await getOperationalPrincipal()
  if (!principal) return apiError("UNAUTHORIZED", "Sessão necessária.")
  const actor = manualActor(principal)
  if (!actor) return apiError("FORBIDDEN", "A gestão manual exige autoria institucional vinculada à sessão.")
  if (new URL(request.url).search) return apiError("BAD_REQUEST", "Parâmetros de URL não aceitos.")
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return apiError("UNSUPPORTED_MEDIA_TYPE", "Envie os dados como JSON.")
  let body: unknown
  try { body = await readBoundedJson(request, 32768) } catch (error) {
    return error instanceof JsonLimitExceeded ? apiError("PAYLOAD_TOO_LARGE", "Dados excedem o limite.") : apiError("BAD_REQUEST", "JSON inválido.")
  }
  const parsed = managementWrite.safeParse(body)
  if (!parsed.success) {
    const missingPoint = parsed.error.issues.some(issue => issue.path[0] === "dados" && issue.path[1] === "localizacaoConfirmada")
    return apiError("VALIDATION_ERROR", missingPoint ? "Confirme o ponto da ocorrência no mapa."
      : "Confira os campos, a confirmação e a justificativa.")
  }
  const command = parsed.data
  if (command.acao !== "editar_manual" && command.acao !== "inativar_manual" && command.acao !== "inativar_consolidada"
    && command.acao !== "consolidar_manual") return null
  if (hostedOperationalMode()?.write === false) return apiError("FORBIDDEN", managementWriteBlocked)
  const permission = command.acao === "editar_manual" ? "editar" : command.acao === "consolidar_manual" ? "administrar" : "inativar"
  if (!hasPermission(principal.role, permission)) return apiError("FORBIDDEN", "Operação indisponível para este perfil.")
  if (command.confirmacao !== command.id) return apiError("VALIDATION_ERROR", "Confirme o identificador do registro selecionado.")
  if (command.acao === "editar_manual") {
    const { data, horario } = nowInDf()
    if (command.dados.data + command.dados.horario > data + horario)
      return apiError("VALIDATION_ERROR", "A data e o horário devem estar no passado ou no presente.")
  }
  // A consolidated manual record leaves circulation through the same audited transition.
  const action = command.acao === "inativar_consolidada" ? "inativar_manual" : command.acao
  const payload = { ...command, acao: action }
  try {
    const result = await withOperationalDatabase(principal, false, async client => {
      if (!await manualOperationalReady(client, actor)) throw new LocalOccurrenceReadOnly()
      const { rows: [row] } = await client.query(manualStatements[action], [payload, actor.account, actor.subject])
      return managementReceipt.parse(row?.data)
    }, true)
    return success(result, true)
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23514")
      return apiError("VALIDATION_ERROR", "A ocorrência tem pendências de publicação. Revise identidade, natureza, ponto e dados.")
    return failure(error)
  }
}

export async function POST(request: Request) {
  const manualMode = !occurrenceManagementMode() && manualOperationalMode()
  if (manualMode) {
    const response = await manualOperationalPOST(request.clone(), manualMode)
    if (response) return response
  }
  const hosted = hostedImportMode()
  if (hosted && !hosted.write) return apiError("FORBIDDEN", managementWriteBlocked)
  const operating = operationalOccurrenceManagementMode()
  const mode = hosted ?? occurrenceManagementMode() ?? operating
  if (!mode) return apiError("FORBIDDEN", managementWriteBlocked)
  if (request.headers.get("host") !== new URL(mode.origin).host || request.headers.get("origin") !== mode.origin)
    return apiError("FORBIDDEN", "A origem da solicitação não corresponde à instalação autorizada.")
  const hostedPrincipal = hosted ? await getHostedImportPrincipal() : null
  const principal = hosted ? hostedPrincipal : await getOperationalPrincipal()
  if (!principal) return apiError("UNAUTHORIZED", "Sessão necessária.")
  if (!hasPermission(principal.role, "editar")) return apiError("FORBIDDEN", "Operação indisponível para este perfil.")
  const actor = hostedPrincipal ? (hostedPrincipal.role === "Administrador" ? hostedImportActor(hostedPrincipal) : null)
    : operating && operationalActor(principal)
  if ((operating || hosted) && !actor) return apiError("FORBIDDEN", "A gestão operacional exige autoria institucional vinculada à sessão.")
  const account = actor ? actor.account : "localAccountId" in principal ? principal.localAccountId : undefined
  if (!account) return apiError("FORBIDDEN", "Autoria indisponível para esta sessão.")
  if (new URL(request.url).search) return apiError("BAD_REQUEST", "Parâmetros de URL não aceitos.")
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return apiError("UNSUPPORTED_MEDIA_TYPE", "Envie os dados como JSON.")
  let body: unknown
  try { body = await readBoundedJson(request, 32768) } catch (error) {
    return error instanceof JsonLimitExceeded ? apiError("PAYLOAD_TOO_LARGE", "Dados excedem o limite.") : apiError("BAD_REQUEST", "JSON inválido.")
  }
  const parsed = managementWrite.safeParse(body)
  if (!parsed.success) {
    const missingPoint = parsed.error.issues.some(issue => issue.path[0] === "dados" && issue.path[1] === "localizacaoConfirmada")
    return apiError("VALIDATION_ERROR", missingPoint ? "Confirme o ponto da ocorrência no mapa."
      : "Confira os campos, a confirmação e a justificativa.")
  }
  const command = parsed.data
  if ((operating || hosted) && command.acao !== "corrigir_associacao" && command.acao !== "excluir_lote" && command.acao !== "autorizar_exclusao")
    return apiError("FORBIDDEN", "O escopo operacional desta gestão é de arquivos importados.")
  const manual = command.acao === "editar_manual" || command.acao === "inativar_manual"
  if (manual ? !hasPermission(principal.role, command.acao === "editar_manual" ? "editar" : "inativar")
    : !hasPermission(principal.role, "administrar"))
    return apiError("FORBIDDEN", "Operação indisponível para este perfil.")
  if (command.acao === "corrigir_associacao" && command.alteracoes.natureza !== undefined
    && !pcdfNatureDescriptions.has(command.alteracoes.natureza))
    return apiError("VALIDATION_ERROR", "Use a descrição original da natureza no catálogo PCDF.")
  if ("confirmacao" in command && command.confirmacao !== command.id)
    return apiError("VALIDATION_ERROR", "Confirme o identificador do registro selecionado.")
  const authorizing = command.acao === "autorizar_exclusao"
  const protectedPurge = (authorizing || command.acao === "excluir_lote") && command.id.toLowerCase() === protectedJanuaryLot
  if (hosted && (authorizing || protectedPurge))
    return apiError("FORBIDDEN", "A exclusão excepcional do lote protegido exige o procedimento de backup autorizado.")
  if ((authorizing || protectedPurge) && (!protectedPurge || !actor || !operating
    || (principal.source !== "supabase" && operating.port !== cloneDatabasePort)))
    return apiError("FORBIDDEN", "A exceção exige o lote protegido e a sessão institucional vinculada.")
  if (protectedPurge && command.acao === "excluir_lote" && command.palavra !== "EXCLUIR")
    return apiError("VALIDATION_ERROR", "Digite EXCLUIR para confirmar a remoção definitiva.")
  const backup = protectedPurge ? await januaryPurgeBackup() : null
  if (protectedPurge && !backup)
    return apiError("SERVICE_UNAVAILABLE", "O backup restaurável do lote está indisponível ou falhou na verificação de integridade.")
  if (command.acao === "editar_manual") {
    const { data, horario } = nowInDf()
    if (command.dados.data + command.dados.horario > data + horario)
      return apiError("VALIDATION_ERROR", "A data e o horário devem estar no passado ou no presente.")
  }
  try {
    const timeout = command.acao === "excluir_lote" ? 30_000 : undefined
    const mutation = async (client: import("pg").Client) => {
      if (actor && !await operationalImportReady(client, actor))
        throw new LocalOccurrenceReadOnly()
      if (command.acao === "autorizar_exclusao" && actor) {
        const { rows: [installed] } = await client.query(`SELECT coalesce(
          has_function_privilege(to_regprocedure('sentinela_exclusao.autorizar_jan2021(uuid,uuid,text,text,text)'), 'EXECUTE'),false) AS ready`)
        if (!installed.ready) throw new LocalOccurrenceReadOnly()
        const { rows: [row] } = await client.query("SELECT sentinela_exclusao.autorizar_jan2021($1,$2,$3,$4,$5) AS data",
          [command.id, actor.subject, actor.account, command.revisao, backup])
        return purgeAuthorizationReceipt.parse(row?.data)
      }
      const deleting = command.acao === "excluir_lote"
      const statement = actor
        ? deleting ? "SELECT sentinela_exclusao.excluir($1,$2,$3) AS data" : "SELECT sentinela_gestao.mutar($1,$2,$3) AS data"
        : deleting ? "SELECT sentinela_exclusao.excluir($1,$2) AS data" : "SELECT sentinela_gestao.mutar($1,$2) AS data"
      const payload = protectedPurge ? { ...command, provaBackup: backup } : command
      const args = actor ? [payload, account, actor.subject] : [payload, account]
      const { rows: [row] } = await client.query(statement, args)
      return managementReceipt.parse(row?.data)
    }
    const result = hostedPrincipal ? await withHostedImportDatabase(hostedPrincipal, false, mutation, timeout)
      : await withLocalOccurrenceDatabase(principal, false, mutation, !!operating, timeout)
    return success(result, true)
  } catch (error) { return failure(error, authorizing || command.acao === "excluir_lote" ? command.acao : undefined) }
}
