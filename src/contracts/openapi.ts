import { z } from "zod"
import {
  CONTRACT_VERSION,
  ERROR_STATUS,
  contractError,
  idSchema,
} from "@/contracts/common"
import { contractModels } from "@/contracts/examples"
import { persistentIdSchema } from "@/contracts/persistent-occurrences"

export const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
function jsonSchema(schema: z.ZodType) {
  const value = z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" })
  delete value.$schema
  return value
}
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
      description: "GET implementado somente no provedor local em development/loopback. Sessão validada no servidor, permissão analisar, PostgreSQL local via role mínima e RLS sintética. Sem fallback. UUIDs persistentes não equivalem aos catálogos demonstrativos. Página além do total retorna lista vazia; datas inclusivas. Metadado catalogVersion identifica o contrato legado, não homologa catálogos do banco.",
      security: [{ localSession: [] }],
      parameters: detail ? [{ name: "id", in: "path", required: true, schema: jsonSchema(persistentIdSchema) }] : queryParameters("PersistentQuery"),
      responses: { "200": { description: "Leitura PostgreSQL local.", content: media(detail ? "PersistentDetail" : "PersistentList") },
        ...errorRefs(["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "INTERNAL_ERROR", "SERVICE_UNAVAILABLE", ...(detail ? ["NOT_FOUND" as const] : [])]) },
    }
  }
  return {
    openapi: "3.1.1",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: {
      title: "SENTINELA — contratos propostos",
      version: CONTRACT_VERSION,
      description:
        "GET de ocorrências implementados no PostgreSQL local de desenvolvimento. Demais operações propostas continuam não implementadas. Exemplos são fictícios; as telas permanecem demonstrativas.",
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
      "/api/v1/ocorrencias": {
        get: persistentOperation(false),
        post: operation(
          "createOccurrence",
          "Cadastrar ocorrência (futuro)",
          "OccurrenceResponse",
          201,
          "OccurrenceCreate",
        ),
      },
      "/api/v1/ocorrencias/{id}": {
        get: persistentOperation(true),
        patch: operation(
          "updateOccurrence",
          "Atualizar campos da ocorrência",
          "OccurrenceResponse",
          200,
          "OccurrenceUpdate",
          undefined,
          true,
        ),
      },
      "/api/v1/ocorrencias/{id}/inativacao": {
        post: operation(
          "inactivateOccurrence",
          "Inativar logicamente, sem exclusão física",
          "OccurrenceResponse",
          200,
          "Inactivation",
          undefined,
          true,
        ),
      },
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
