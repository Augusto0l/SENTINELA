import { z } from "zod"
import {
  CONTRACT_VERSION,
  ERROR_STATUS,
  contractError,
  idSchema,
  successSchema,
} from "@/contracts/common"
import { contractModels } from "@/contracts/examples"
import { persistentIdSchema } from "@/contracts/persistent-occurrences"
import { localOccurrenceList, localOccurrenceResponse, localOccurrencesPath, localOccurrencesQuery } from "@/contracts/local-occurrences"
import { manualCatalogResponse, manualCatalogSearchSchema, manualOccurrenceSchema, manualOccurrencesPath, manualReceiptResponse } from "@/contracts/manual-occurrences"
import { importedReviewDraft, importManagementAvailability, lotPurgeAssessment, lotPurgeHistory, managedLotDetail, managedLots, managedOccurrence, managementPath, managementRead, managementReceipt, managementWrite, purgeAuthorizationReceipt } from "@/contracts/occurrence-management"
import { natureCatalogQuerySchema } from "@/contracts/persistent-catalogs"
import { persistentAnalyticsData, persistentAnalyticsQuery, PERSISTENT_ANALYTICS_PATH } from "@/contracts/persistent-analytics"
import { directHash, directPcdfPath, historicalPreview, historicalReceipt, historicalStatus } from "@/contracts/pcdf-direct"
import { hostedReviewQuery, pcdfDecision, pcdfImportPath, pcdfIssue, pcdfLot, pcdfMonth, pcdfPromotion, pcdfResponse,
  pcdfReviewPage, pcdfReviewPath, pcdfUpload } from "@/contracts/pcdf-workspace"

export const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
function jsonSchema(schema: z.ZodType) {
  const value = z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" })
  delete value.$schema
  return value
}
function pcdfOperation(operationId: string, summary: string, schema: z.ZodType, statuses: number[],
  errorStatuses: number[], hostedSchema?: z.ZodType) {
  const failure = z.strictObject({ success: z.literal(false), error: z.strictObject({
    status: z.number(), message: z.string(), diagnostic: z.string().regex(/^[a-z0-9_]{1,100}$/).optional(),
  }) })
  const json = (model: z.ZodType) => ({ "application/json": { schema: jsonSchema(model) } })
  return {
    operationId, summary, "x-implementation-status": hostedSchema ? "implemented-local-and-hosted" : "implemented-isolated-sandbox",
    "x-persistent-implementation": { scope: "homologacao-persistente-sintetica" },
    description: "Cluster local atestado, loopback e sessão sintética com permissão por operação. Mutações exigem Origin exata.",
    security: hostedSchema ? [{ localSession: [] }, { supabaseSession: [] }] : [{ localSession: [] }],
    responses: {
      ...Object.fromEntries(statuses.map(status => [status, { description: "Operação concluída no cluster atestado.",
        content: json(hostedSchema ? z.union([pcdfResponse(schema, true),
          z.strictObject({ success: z.literal(true), scope: z.literal("importacao-supabase"), data: hostedSchema })])
          : pcdfResponse(schema, true)) }])),
      ...Object.fromEntries(errorStatuses.map(status => [status, { description: "Operação recusada ou indisponível.",
        content: json(failure) }])),
    },
  }
}
const pcdfId = { name: "id", in: "path", required: true, schema: jsonSchema(persistentIdSchema) }
const pcdfCommonErrors = [400, 401, 403, 503]
const historicalMode = { name: "modalidade", in: "query", required: true, schema: { const: "historico" } }
const historicalJson = (schema: z.ZodType) => ({ "application/json": { schema: jsonSchema(successSchema(schema)) } })
const historicalErrors = Object.fromEntries([400, 401, 403, 409, 413, 415, 422, 503].map(status => [status, {
  description: "Solicitação recusada. Consulte a mensagem e o diagnóstico quando disponível.",
}]))
function media(name: string) {
  return {
    "application/json": {
      schema: ref(name),
      example: contractModels[name].example,
    },
  }
}
const errorDescriptions: Record<string, string> = {
  BAD_REQUEST: "Parâmetro ou JSON malformado.",
  UNAUTHORIZED: "Autenticação futura ausente ou inválida.",
  FORBIDDEN: "Ação não autorizada ao perfil/escopo futuro.",
  NOT_FOUND: "Recurso inexistente no escopo autorizado.",
  CONFLICT: "Conflito de estado; não comprova duplicidade por semelhança.",
  PAYLOAD_TOO_LARGE: "Limite de processamento excedido.",
  UNSUPPORTED_MEDIA_TYPE: "Formato de arquivo não suportado.",
  VALIDATION_ERROR: "Dados inválidos.",
  RATE_LIMITED: "Limite de consultas atingido.",
  INTERNAL_ERROR: "Erro interno sem exposição de detalhes sensíveis.",
  SERVICE_UNAVAILABLE: "Serviço indisponível.",
}
function queryParameters(
  model: "OccurrenceQuery" | "AnalyticsFilter" | "MapQuery" | "PersistentQuery",
) {
  const schema = jsonSchema(contractModels[model].schema)
  return Object.entries(schema.properties ?? {}).map(([name, property]) => ({
    name,
    in: "query",
    required: false,
    schema: property,
    description:
      "Parâmetro opcional. Datas exigem period=custom; intervalo inclusivo. page/pageSize são inteiros; includeInactive usa true/false literais.",
  }))
}
export function buildOpenApi() {
  const schemas = Object.fromEntries(
    Object.entries(contractModels).map(([name, model]) => [
      name,
      { ...jsonSchema(model.schema), examples: [model.example] },
    ]),
  )
  const responses = Object.fromEntries(
    Object.entries(ERROR_STATUS).map(([code, status]) => [
      code,
      {
        description: errorDescriptions[code],
        ...(status === 429
          ? {
              headers: {
                "Retry-After": {
                  description: "Segundos até nova tentativa.",
                  schema: { type: "integer", minimum: 1 },
                },
              },
            }
          : {}),
        content: {
          "application/json": {
            schema: ref("ApiError"),
            example: contractError(
              code as keyof typeof ERROR_STATUS,
              errorDescriptions[code],
            ),
          },
        },
      },
    ]),
  )
  const idParameter = {
    name: "id",
    in: "path",
    required: true,
    schema: jsonSchema(idSchema),
  }
  const errorRefs = (codes: Array<keyof typeof ERROR_STATUS>) =>
    Object.fromEntries(
      codes.map((code) => [
        String(ERROR_STATUS[code]),
        { $ref: `#/components/responses/${code}` },
      ]),
    )
  function operation(
    id: string,
    summary: string,
    response: string,
    status = 200,
    request?: string,
    query?: "OccurrenceQuery" | "AnalyticsFilter",
    withId = false,
  ) {
    return {
      operationId: id,
      summary,
      "x-implementation-status": "planned",
      description:
        "CONTRATO PROPOSTO. Endpoint não implementado nesta etapa. Autenticação, autorização, banco e transações são futuros. Refinamentos entre campos são executados por Zod e testados; consultar documentação técnica.",
      security: [{ bearerAuth: [] }],
      ...(query || withId
        ? {
            parameters: [
              ...(withId ? [idParameter] : []),
              ...(query ? queryParameters(query) : []),
            ],
          }
        : {}),
      ...(request
        ? { requestBody: { required: true, content: media(request) } }
        : {}),
      responses: {
        [status]: {
          description:
            "Exemplo do formato esperado, não evidencia execução ou persistência.",
          content: media(response),
        },
        ...errorRefs([
          "BAD_REQUEST",
          "UNAUTHORIZED",
          "FORBIDDEN",
          "VALIDATION_ERROR",
          "INTERNAL_ERROR",
          ...(withId ? ["NOT_FOUND" as const] : []),
          ...(request ? ["CONFLICT" as const] : []),
        ]),
      },
    }
  }
  function persistentOperation(detail: boolean) {
    return {
      operationId: detail ? "getPersistentOccurrence" : "listPersistentOccurrences",
      summary: detail ? "Consultar ocorrência persistente por UUID" : "Consultar ocorrências persistentes locais",
      "x-implementation-status": "implemented-local-development",
      description: "GET em development/loopback, com sessão do provedor local, permissão analisar e reader PostgreSQL sujeita à RLS. " +
        (detail ? "O detalhe rejeita parâmetros de consulta. Ocorrência ausente ou invisível retorna 404." :
          "Parâmetros desconhecidos ou repetidos são rejeitados. Datas inclusivas; página além do total retorna lista vazia.") +
        " A consulta usa UUIDs persistentes e retorna erro se a reader estiver indisponível.",
      security: [{ localSession: [] }],
      parameters: detail ? [{ name: "id", in: "path", required: true, schema: jsonSchema(persistentIdSchema) }] : queryParameters("PersistentQuery"),
      responses: { "200": { description: "Leitura PostgreSQL local.", content: media(detail ? "PersistentDetail" : "PersistentList") },
        ...errorRefs(["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "INTERNAL_ERROR", "SERVICE_UNAVAILABLE", ...(detail ? ["NOT_FOUND" as const] : [])]) },
    }
  }
  function catalogOperation(region: boolean) {
    return {
      operationId: region ? "listPersistentRegions" : "listPersistentNatures",
      summary: region ? "Consultar Regiões Administrativas persistentes" : "Consultar naturezas criminais originais persistentes",
      "x-implementation-status": "implemented-local-development",
      description: "GET em development/loopback com sessão local e permissão analisar. Retorna UUIDs e nomes ou descrições no escopo RLS. Ordenação por texto em minúsculas, texto original e UUID, com collation C na ordenação. Catálogo vazio retorna items vazio. " +
        (region ? "A consulta de RAs rejeita parâmetros." : "A consulta de naturezas aceita busca literal na descrição original e direção de ordenação. Preserva a grafia de origem e não expõe classificação derivada."),
      security: [{ localSession: [] }],
      parameters: region ? [] : [
        { name: "q", in: "query", required: false, schema: jsonSchema(natureCatalogQuerySchema.shape.q),
          description: "Trecho literal da descrição original, sem distinção entre maiúsculas e minúsculas." },
        { name: "direction", in: "query", required: false, schema: jsonSchema(natureCatalogQuerySchema.shape.direction),
          description: "Direção da ordenação por descrição. Padrão asc. UUID asc desempata." },
      ],
      responses: { "200": { description: "Catálogo PostgreSQL local visível, possivelmente vazio.", content: media(region ? "RegionCatalog" : "NatureCatalog") },
        ...errorRefs(["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "INTERNAL_ERROR", "SERVICE_UNAVAILABLE"]) },
    }
  }
  function plannedWrite(kind: "create" | "update" | "inactivate") {
    const create = kind === "create", inactive = kind === "inactivate"
    return {
      ...operation(create ? "createOccurrence" : inactive ? "inactivateOccurrence" : "updateOccurrence",
        create ? "PROPOSTA: cadastrar ocorrência manual" : inactive ? "PROPOSTA: inativar logicamente" : "PROPOSTA: editar ocorrência regular",
        inactive ? "PlannedInactivationResponse" : create ? "PlannedManualResponse" : "PlannedUpdateResponse",
        create ? 201 : 200, create ? "PlannedManualCreate" : inactive ? "PlannedInactivation" : "PlannedManualUpdate"),
      "x-isolated-implementation": {
        scope: "sandbox-synthetic-only",
        securityScheme: "localSession",
        description: "A rota Next.js aceita escrita somente em desenvolvimento com contas descartáveis e cluster atestado. O contrato experimental está documentado em database/local/write-sandbox/MUTACOES.md.",
      },
      description: "PLANEJADO, indisponível. Contratos UUID substituem o payload demonstrativo somente nestas operações propostas. Requer identidade SQL confiável, escopo e backend transacional auditado ainda não aprovados; login local atual não autoriza escrita. Ver docs/escrita-persistente-planejamento.md. Exemplos não evidenciam execução. Versão divergente ou reutilização incompatível da chave: 409; campos inválidos: 422. Nenhum DELETE físico.",
      parameters: [
        ...(!create ? [{ name: "id", in: "path", required: true, schema: jsonSchema(persistentIdSchema) }] : []),
        { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", format: "uuid" }, description: "Proposta: UUID por comando; repetição idêntica reapresenta o resultado, payload divergente retorna 409." },
      ],
      responses: {
        [create ? "201" : "200"]: { description: "Formato futuro; não comprova persistência.", content: media(inactive ? "PlannedInactivationResponse" : create ? "PlannedManualResponse" : "PlannedUpdateResponse") },
        ...errorRefs(["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "VALIDATION_ERROR", "CONFLICT", "INTERNAL_ERROR", "SERVICE_UNAVAILABLE", ...(!create ? ["NOT_FOUND" as const] : [])]),
      },
    }
  }
  return {
    openapi: "3.1.1",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: {
      title: "SENTINELA — contratos propostos",
      version: CONTRACT_VERSION,
      description:
        "Ocorrências, catálogos e analytics com leitura local. Importação PCDF sintética e Central de Revisão em clusters locais atestados. As operações futuras estão marcadas individualmente.",
    },
    servers: [
      {
        url: "https://sentinela.invalid",
        description: "Endereço reservado não operacional; não enviar dados.",
      },
    ],
    "x-cross-field-validation":
      "Datas ordenadas, pares de ordenação, contagens e estados são verificados nos schemas Zod; JSON Schema não expressa todas essas relações.",
    paths: {
      [directPcdfPath]: {
        get: {
          operationId: "readPcdfHistoricalImport", summary: "Consultar a fila mensal PCDF no PostgreSQL",
          description: "Modalidade histórica para Administrador e Operador. Retorna o inventário, a situação de cada competência e a capacidade de aprovação.",
          "x-implementation-status": "implemented-local-development", security: [{ localSession: [] }],
          parameters: [historicalMode],
          responses: { "200": { description: "Inventário e recibos mensais. No modo hospedado, um inventário parcial retorna canApprove igual a false.", content: historicalJson(historicalStatus) }, ...historicalErrors },
        },
        post: {
          operationId: "approvePcdfHistoricalImport", summary: "Validar ou aprovar um CSV mensal PCDF da fila",
          description: "O Administrador autorizado envia um CSV v2 por requisição. A confirmação exige o SHA-256 validado e recebe e consolida a competência em uma transação.",
          "x-implementation-status": "implemented-local-development", security: [{ localSession: [] }],
          parameters: [historicalMode, { name: "versao", in: "query", required: true, schema: { const: "2.0" } },
            { name: "etapa", in: "query", required: true, schema: { enum: ["validar", "confirmar"] } }],
          requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["csv"],
            properties: { csv: { type: "string", format: "binary" }, sha256: jsonSchema(directHash) } } } } },
          responses: {
            "200": { description: "Validação ou recibo de importação anterior.", content: historicalJson(z.union([historicalPreview, historicalReceipt])) },
            "201": { description: "Competência consolidada.", content: historicalJson(historicalReceipt) },
            ...historicalErrors,
          },
        },
      },
      [PERSISTENT_ANALYTICS_PATH]: { get: {
        operationId: "readPersistentAnalytics",
        summary: "Consultar agregados e projeções espaciais PostgreSQL",
        description: "GET em development/loopback com sessão local e permissão analisar. Agrega ocorrências ativas visíveis à reader sob RLS. Natureza e categoria devem corresponder na mesma associação. Parâmetros desconhecidos ou repetidos são rejeitados. Pontos validados limitados a 5000.",
        "x-implementation-status": "implemented-local-development",
        "x-isolated-implementation": {
          scope: "sandbox-synthetic-only",
          schema: jsonSchema(pcdfResponse(persistentAnalyticsData)),
          description: "Com PCDF isolado habilitado, a mesma consulta usa somente ocorrências sintéticas consolidadas.",
        },
        security: [{ localSession: [] }],
        parameters: Object.entries(persistentAnalyticsQuery.shape).map(([name,schema]) => ({
          name, in: "query", required: false, schema: jsonSchema(schema),
        })),
        responses: { "200": { description: "Consulta analítica concluída.", content: media("PersistentAnalytics") },
          ...errorRefs(["BAD_REQUEST","UNAUTHORIZED","FORBIDDEN","INTERNAL_ERROR","SERVICE_UNAVAILABLE"]) },
      } },
      "/api/v1/catalogos/regioes-administrativas": { get: catalogOperation(true) },
      "/api/v1/catalogos/naturezas-criminais": { get: catalogOperation(false) },
      "/api/v1/ocorrencias": {
        get: persistentOperation(false),
        post: plannedWrite("create"),
      },
      "/api/v1/ocorrencias/{id}": {
        get: persistentOperation(true),
        patch: plannedWrite("update"),
      },
      "/api/v1/ocorrencias/{id}/inativacao": {
        post: plannedWrite("inactivate"),
      },
      [localOccurrencesPath]: { get: {
        operationId: "readLocalOccurrenceWorkspace",
        summary: "Consultar registros PCDF recebidos, cadastros manuais e ocorrências consolidadas",
        description: "Somente leitura PostgreSQL em loopback com sessão local. Administrador e Operador acessam staging. Os três perfis podem consultar cadastros manuais em revisão e ocorrências consolidadas. A lista usa 25 itens por página e ID como desempate.",
        "x-implementation-status": "implemented-local-development",
        "x-query-schema": jsonSchema(localOccurrencesQuery),
        security: [{ localSession: [] }],
        parameters: [{ name: "view", in: "query", required: true,
          schema: { type: "string", enum: ["resumo", "importados", "consolidadas", "manuais", "detalhe"] } }],
        responses: { "200": { description: "Resultado no escopo selecionado.",
          content: { "application/json": { schema: jsonSchema(localOccurrenceResponse) } } },
          ...errorRefs(["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "INTERNAL_ERROR", "SERVICE_UNAVAILABLE"]) },
      } },
      [managementPath]: {
        get: {
          operationId: "readOccurrenceManagement",
          summary: "Consultar lotes, proveniência e impacto de operações de gestão",
          description: "A disponibilidade indica o destino atestado, o perfil e a autorização. No banco operacional com gestão liberada, a prévia inclui a revisão e a aprovação específica. Fora da liberação, a prévia operacional é informativa.",
          "x-implementation-status": "implemented-local-development",
          security: [{ localSession: [] }],
          "x-query-schema": jsonSchema(managementRead),
          parameters: [{ name: "view", in: "query", required: true, schema: {
            type: "string", enum: ["arquivos", "arquivo", "importados", "manuais", "consolidadas", "previa_exclusao",
              "exclusoes", "registros_lote", "rascunho_importado", "disponibilidade"],
          } }],
          responses: { "200": { description: "Dados do ambiente e escopo autorizados.",
            content: { "application/json": { schema: jsonSchema(successSchema(z.union([
              importManagementAvailability, managedLots, managedLotDetail, managedOccurrence, lotPurgeAssessment,
              lotPurgeHistory, importedReviewDraft, localOccurrenceList,
            ]))) } } },
            ...errorRefs(["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "SERVICE_UNAVAILABLE"]) },
        },
        post: {
          operationId: "writeOccurrenceManagement",
          summary: "Registrar alteração auditada, autorizar ou excluir uma importação",
          description: "Exige PostgreSQL atestado e vínculo institucional no destino operacional. A exceção de janeiro de 2021 exige sessão Supabase no destino operacional, UUID e revisão qualificados, verificação do backup e confirmação EXCLUIR. A exclusão consome a autorização vigente e registra um comprovante.",
          "x-implementation-status": "implemented-local-development",
          security: [{ localSession: [] }],
          requestBody: { required: true, content: { "application/json": { schema: jsonSchema(managementWrite) } } },
          responses: { "200": { description: "Operação confirmada pelo PostgreSQL.",
            content: { "application/json": { schema: jsonSchema(successSchema(z.union([managementReceipt, purgeAuthorizationReceipt]))) } } },
            ...errorRefs(["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "VALIDATION_ERROR",
              "PAYLOAD_TOO_LARGE", "UNSUPPORTED_MEDIA_TYPE", "SERVICE_UNAVAILABLE"]) },
        },
      },
      [manualOccurrencesPath]: {
        get: {
          operationId: "listManualOccurrenceCatalog",
          summary: "Consultar os catálogos persistentes habilitados para cadastro manual",
          "x-implementation-status": "implemented-local-development",
          security: [{ localSession: [] }],
          parameters: [{ name: "q", in: "query", required: false, schema: jsonSchema(manualCatalogSearchSchema),
            description: "Busca por código, nome ou descrição, sem distinção de caixa e acentos." }],
          responses: { "200": { description: "Catálogos do cadastro local e disponibilidade da função de gravação sintética para o perfil.",
            content: { "application/json": { schema: jsonSchema(manualCatalogResponse) } } },
            ...errorRefs(["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "SERVICE_UNAVAILABLE"]) },
        },
        post: {
          operationId: "createLocalManualOccurrence",
          summary: "Registrar ocorrência manual em revisão",
          description: "Somente Administrador e Operador autenticados no ambiente sintético atestado com a migration 0004. Exige CEP, ponto confirmado e consistente com a RA persistente, natureza com tentativa explícita, descrição, meio e as duas quantidades. A idempotência usa login, conta e chave. Responde após o commit.",
          "x-implementation-status": "implemented-isolated-sandbox",
          security: [{ localSession: [] }],
          parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: { required: true, content: { "application/json": { schema: jsonSchema(manualOccurrenceSchema) } } },
          responses: { "201": { description: "Ocorrência gravada em revisão.",
            content: { "application/json": { schema: jsonSchema(manualReceiptResponse) } } },
            ...errorRefs(["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "CONFLICT", "PAYLOAD_TOO_LARGE",
              "UNSUPPORTED_MEDIA_TYPE", "VALIDATION_ERROR", "SERVICE_UNAVAILABLE"]) },
        },
      },
      [pcdfImportPath]: {
        get: pcdfOperation("listSyntheticPcdfLots", "Consultar lotes PCDF sintéticos", z.array(pcdfLot), [200], pcdfCommonErrors),
        post: {
          ...pcdfOperation("uploadSyntheticPcdf", "Persistir arquivo PCDF sintético em staging", pcdfUpload,
            [200, 201], [...pcdfCommonErrors, 409, 413, 415, 422]),
          parameters: [{ name: "competencia", in: "query", required: true, schema: jsonSchema(pcdfMonth) }],
          requestBody: { required: true, description: "CSV UTF-8 ou XLSX, com 34 colunas, até 16 MiB e proveniência sintética. XLSX exige homologação persistente com a migration 0006.",
            content: { "text/csv": { schema: { type: "string", format: "binary" } },
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { schema: { type: "string", format: "binary" } } } },
        },
      },
      [pcdfImportPath + "/{id}/consolidacao"]: { post: {
        ...pcdfOperation("promoteSyntheticPcdf", "Consolidar identidades aprovadas do lote", pcdfPromotion,
          [200], [...pcdfCommonErrors, 404, 409, 422]),
        parameters: [pcdfId],
      } },
      [pcdfReviewPath]: { get: {
        ...pcdfOperation("listSyntheticPcdfReview", "Consultar pendências de revisão", z.union([z.array(pcdfIssue),pcdfReviewPage]),
          [200], pcdfCommonErrors, pcdfReviewPage),
        description: "No modo Supabase, informe pagina para consultar a fila global com filtros e contadores. Origem e situação em análise estão disponíveis nesse modo. A consulta local legada retorna uma lista.",
        parameters: Object.entries(hostedReviewQuery.shape).map(([name, schema]) => ({
          name, in: "query", required: false, schema: jsonSchema(schema),
        })),
      } },
      [pcdfReviewPath + "/{id}"]: { patch: {
        ...pcdfOperation("decideSyntheticPcdfReview", "Registrar decisão administrativa versionada", pcdfIssue,
          [200], [...pcdfCommonErrors, 404, 409, 413, 415, 422], pcdfIssue),
        description: "Decisão exclusiva de Administrador, com versão esperada, justificativa e Origin exata. No modo Supabase, exige a liberação de escrita operacional e sessão ativa.",
        parameters: [pcdfId],
        requestBody: { required: true, content: { "application/json": { schema: jsonSchema(pcdfDecision) } } },
      } },
      "/api/v1/importacoes": {
        post: {
          ...operation(
            "createImportBatch",
            "Criar lote com metadados; não transmite bytes",
            "ImportBatchResponse",
            201,
            "ImportCreate",
          ),
          responses: {
            "201": {
              description: "Lote proposto",
              content: media("ImportBatchResponse"),
            },
            ...errorRefs([
              "BAD_REQUEST",
              "UNAUTHORIZED",
              "FORBIDDEN",
              "CONFLICT",
              "VALIDATION_ERROR",
              "PAYLOAD_TOO_LARGE",
              "UNSUPPORTED_MEDIA_TYPE",
              "INTERNAL_ERROR",
            ]),
          },
        },
      },
      "/api/v1/importacoes/{id}": {
        get: operation(
          "getImportBatch",
          "Consultar status e resultado do processamento",
          "ImportBatchResponse",
          200,
          undefined,
          undefined,
          true,
        ),
      },
      "/api/v1/importacoes/{id}/mapeamento": {
        put: operation(
          "mapImportColumns",
          "Definir planilha e mapeamento de colunas",
          "ImportBatchResponse",
          200,
          "ImportMapping",
          undefined,
          true,
        ),
      },
      "/api/v1/importacoes/{id}/previa": {
        get: operation(
          "previewImportBatch",
          "Consultar prévia, contagens, erros e pendências",
          "ImportAnalysisResponse",
          200,
          undefined,
          undefined,
          true,
        ),
      },
      "/api/v1/importacoes/{id}/validacao": {
        post: operation(
          "validateImportBatch",
          "Solicitar validação (planejado)",
          "ImportAnalysisResponse",
          200,
          undefined,
          undefined,
          true,
        ),
      },
      "/api/v1/importacoes/{id}/simulacao": {
        post: operation(
          "simulateImportBatch",
          "Confirmar somente simulação, sem gravação",
          "DemoImportResponse",
          200,
          undefined,
          undefined,
          true,
        ),
      },
      "/api/v1/analytics/dashboard": {
        get: operation(
          "queryDashboard",
          "Indicadores, séries e distribuições com filtros compartilhados",
          "AnalyticsResponse",
          200,
          undefined,
          "AnalyticsFilter",
        ),
      },
      "/api/v1/mapa": {
        get: {
          ...operation(
            "queryMap",
            "Pontos WGS84 para pontos, calor e clusters calculados no cliente",
            "MapResponse",
            200,
            undefined,
            "AnalyticsFilter",
          ),
          parameters: queryParameters("MapQuery"),
        },
      },
    },
    components: {
      schemas,
      responses,
      securitySchemes: {
        localSession: { type: "apiKey", in: "cookie", name: "sentinela-local-session", description: "Somente desenvolvimento local; não disponível em produção." },
        supabaseSession: { type: "apiKey", in: "cookie", name: "sb-<project-ref>-auth-token",
          description: "Sessão SSR Supabase com o nome derivado da referência do projeto e vínculo institucional ativo." },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Futuro token de sessão; não existe autenticação real nesta entrega. JWT/claims/provedor sujeitos à integração posterior.",
        },
      },
    },
  }
}
