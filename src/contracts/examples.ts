import type { z } from "zod"
import { plannedOccurrenceCreateSchema, plannedOccurrenceUpdateSchema, plannedOccurrenceInactivationSchema, plannedWriteHeadersSchema, plannedManualResponseSchema, plannedInactivationResponseSchema, plannedWriteResponseSchema } from "@/contracts/planned-occurrence-writes"
import { regionCatalogResponseSchema, natureCatalogResponseSchema } from "@/contracts/persistent-catalogs"
import { persistentAnalyticsResponse } from "@/contracts/persistent-analytics"
import { persistentQuerySchema, persistentListResponseSchema, persistentDetailResponseSchema } from "@/contracts/persistent-occurrences"
import {
  CONTRACT_VERSION,
  catalogVersion,
  contractError,
  errorSchema,
} from "@/contracts/common"
import {
  occurrenceCreateSchema,
  occurrenceUpdateSchema,
  occurrenceSchema,
  occurrenceQuerySchema,
  occurrenceResponseSchema,
  occurrenceListSchema,
  inactivationSchema,
  analyticsFilterSchema,
} from "@/contracts/occurrences"
import {
  importCreateSchema,
  importMappingSchema,
  importAnalysisSchema,
  importBatchSchema,
  importBatchResponseSchema,
  importAnalysisResponseSchema,
  demoImportResultSchema,
  demoImportResponseSchema,
  operationalImportResultSchema,
} from "@/contracts/imports"
import {
  analyticsDataSchema,
  analyticsResponseSchema,
  buildDemoAnalytics,
  buildDemoMap,
  mapDataSchema,
  mapQuerySchema,
  mapResponseSchema,
} from "@/contracts/analytics"

export const meta = {
  contractVersion: CONTRACT_VERSION,
  catalogVersion,
  execution: { mode: "demonstrativo", persisted: false },
} as const
export const createExample = {
  data: "2026-08-25",
  horario: "23:59",
  raCode: "RA-I",
  local: "Quadra demonstrativa 10",
  naturezas: ["Furto", "Ameaça"],
  coordenadas: { latitude: -15.79, longitude: -47.88 },
}
export const occurrenceExample = occurrenceSchema.parse({
  ...createExample,
  id: "#00001",
  ativo: true,
  origem: "manual",
  loteId: null,
  localizacao: "valida",
  createdAt: "2026-08-25T23:00:00Z",
  updatedAt: "2026-08-25T23:00:00Z",
})
export const fileExample = {
  name: "ocorrencias.csv",
  size: 125,
  sha256: "a".repeat(64),
}
export const mappingExample = {
  headers: [
    "data",
    "horario",
    "naturezas",
    "RA",
    "local",
    "latitude",
    "longitude",
  ],
  sheetName: "CSV",
  sheetNames: ["CSV"],
  mapping: {
    data: 0,
    horario: 1,
    naturezas: 2,
    ra: 3,
    local: 4,
    latitude: 5,
    longitude: 6,
  },
}
export const analysisExample = {
  mappingErrors: [],
  rows: [
    {
      line: 2,
      original: [
        "25/08/2026",
        "23:59",
        "Furto|Ameaça",
        "Plano Piloto",
        "Quadra demonstrativa 10",
        "-15.79",
        "-47.88",
      ].map((value) => ({ value })),
      normalized: {
        data: "25/08/2026",
        horario: "23:59",
        naturezas: ["Furto", "Ameaça"],
        raCode: "RA-I",
        local: "Quadra demonstrativa 10",
        latitude: "-15.79",
        longitude: "-47.88",
      },
      status: "valido",
      issues: [],
    },
  ],
  counts: { total: 1, valid: 1, invalid: 0, pending: 0, possibleDuplicates: 0 },
}
export const demoResultExample = {
  total: 1,
  simulated: 1,
  pending: 0,
  rejected: 0,
  possibleDuplicates: 0,
  persisted: false,
}
export const batchExample = {
  id: "lote-demo-1",
  file: fileExample,
  fonte: "Exemplo fictício",
  requestedBy: "usuario-demo-1",
  createdAt: "2026-08-25T23:00:00Z",
  updatedAt: "2026-08-25T23:00:00Z",
  mappingVersion: null,
  validationVersion: null,
  failure: null,
  status: "criado",
  mode: "demonstrativo",
  result: null,
}
export const filterExample = {
  period: "custom",
  startDate: "2026-08-25",
  endDate: "2026-08-25",
  ra: "RA-I",
  nature: "Furto",
  hour: "18-24",
} as const
export const analyticsExample = buildDemoAnalytics(
  [occurrenceExample],
  filterExample,
)
export const mapExample = buildDemoMap(
  [occurrenceExample],
  filterExample,
  "heat",
)
const success = (data: unknown) => ({ success: true, data, meta })
export const contractModels: Record<string, {
  schema: z.ZodType
  example: unknown
}> = {
  PlannedManualCreate: { schema: plannedOccurrenceCreateSchema, example: { data: "2026-11-11", horario: "12:30:00", raId: "10000000-0000-4000-8000-000000000001", local: "Endereço sintético", coordenadas: null, naturezas: [{ naturezaId: "30000000-0000-4000-8000-000000000001", crimeTentado: null }] } },
  PlannedManualUpdate: { schema: plannedOccurrenceUpdateSchema, example: { versaoEsperada: "1", justificativa: "Ajuste sintético autorizado", alteracoes: { local: "Endereço sintético atualizado" } } },
  PlannedInactivation: { schema: plannedOccurrenceInactivationSchema, example: { versaoEsperada: "1", motivo: "Inativação sintética autorizada" } },
  PlannedWriteHeaders: { schema: plannedWriteHeadersSchema, example: { "Idempotency-Key": "90000000-0000-4000-8000-000000000001" } },
  RegionCatalog: { schema: regionCatalogResponseSchema, example: { success: true, data: { items: [{ id: "10000000-0000-4000-8000-000000000001", nome: "Região sintética" }] }, meta: { ...meta, execution: { mode: "operacional", persisted: true } } } },
  PersistentAnalytics: { schema: persistentAnalyticsResponse, example: { success: true, data: {
    total: 0, mapTotal: 0, byRa: [], byNature: [], timeline: [], weekday: null, hour: null,
    regions: [], natures: [], categories: [], points: [], heatReference: [], pointsTruncated: false, heatUnavailable: false,
  }, meta: { ...meta, execution: { mode: "operacional", persisted: true } } } },
  NatureCatalog: { schema: natureCatalogResponseSchema, example: { success: true, data: { items: [{ id: "30000000-0000-4000-8000-000000000001", descricao: "Natureza original sintética" }] }, meta: { ...meta, execution: { mode: "operacional", persisted: true } } } },
  PersistentQuery: { schema: persistentQuerySchema, example: { page: 1, pageSize: 25, sortBy: "data", direction: "desc" } },
  PersistentList: { schema: persistentListResponseSchema, example: { success: true, data: { items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } }, meta: { ...meta, execution: { mode: "operacional", persisted: true } } } },
  PersistentDetail: { schema: persistentDetailResponseSchema, example: { success: true, data: {
    id: "50000000-0000-4000-8000-000000000001", origem: "importacao", fonte: "SENTINELA_TESTE_LOCAL_V1", anoRegistro: null, unidadeRegistro: null, numeroRegistro: null,
    identidadeStatus: "homologada", data: null, horario: null, local: null, latitude: null, longitude: null,
    localizacaoStatus: "ausente", consolidacaoStatus: "consolidada", ativo: true, versao: "1",
    criadoEm: "2026-11-11T12:00:00Z", atualizadoEm: "2026-11-11T12:00:00Z", ra: null, naturezas: [],
  }, meta: { ...meta, execution: { mode: "operacional", persisted: true } } } },
  OccurrenceCreate: { schema: occurrenceCreateSchema, example: createExample },
  OccurrenceUpdate: {
    schema: occurrenceUpdateSchema,
    example: { local: "Novo local demonstrativo" },
  },
  Occurrence: { schema: occurrenceSchema, example: occurrenceExample },
  OccurrenceQuery: {
    schema: occurrenceQuerySchema,
    example: {
      ...filterExample,
      page: 1,
      pageSize: 25,
      sortBy: "data",
      direction: "desc",
      includeInactive: false,
    },
  },
  OccurrenceResponse: {
    schema: occurrenceResponseSchema,
    example: success(occurrenceExample),
  },
  OccurrenceList: {
    schema: occurrenceListSchema,
    example: success({
      items: [occurrenceExample],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    }),
  },
  Inactivation: {
    schema: inactivationSchema,
    example: { motivo: "Revisão demonstrativa solicitada" },
  },
  AnalyticsFilter: { schema: analyticsFilterSchema, example: filterExample },
  ImportCreate: {
    schema: importCreateSchema,
    example: { file: fileExample, fonte: "Exemplo fictício" },
  },
  ImportMapping: { schema: importMappingSchema, example: mappingExample },
  ImportAnalysis: { schema: importAnalysisSchema, example: analysisExample },
  ImportAnalysisResponse: {
    schema: importAnalysisResponseSchema,
    example: success(analysisExample),
  },
  ImportBatch: { schema: importBatchSchema, example: batchExample },
  ImportBatchResponse: {
    schema: importBatchResponseSchema,
    example: success(batchExample),
  },
  DemoImportResult: {
    schema: demoImportResultSchema,
    example: demoResultExample,
  },
  DemoImportResponse: {
    schema: demoImportResponseSchema,
    example: success(demoResultExample),
  },
  OperationalImportResult: {
    schema: operationalImportResultSchema,
    example: {
      total: 1,
      inserted: 1,
      pending: 0,
      rejected: 0,
      possibleDuplicates: 0,
      persisted: true,
    },
  },
  AnalyticsData: { schema: analyticsDataSchema, example: analyticsExample },
  AnalyticsResponse: {
    schema: analyticsResponseSchema,
    example: success(analyticsExample),
  },
  MapData: { schema: mapDataSchema, example: mapExample },
  MapQuery: {
    schema: mapQuerySchema,
    example: { ...filterExample, mode: "heat" },
  },
  MapResponse: { schema: mapResponseSchema, example: success(mapExample) },
  ApiError: {
    schema: errorSchema,
    example: contractError("VALIDATION_ERROR", "Revise os campos.", [
      { path: ["data"], code: "invalid_format", message: "Data inválida." },
    ]),
  },
}

const plannedRecord = {
  ...persistentDetailResponseSchema.parse(contractModels.PersistentDetail.example).data,
  origem: "manual", identidadeStatus: "manual", fonte: "FONTE_MANUAL_A_DEFINIR",
  data: "2026-11-11", horario: "12:30:00", local: "Endereço sintético",
  consolidacaoStatus: "em_revisao",
  ra: { id: "10000000-0000-4000-8000-000000000001", codigo: "EXEMPLO", nome: "Região sintética" },
  naturezas: [{ id: "60000000-0000-4000-8000-000000000001", crimeTentado: null, classificacaoStatus: "pendente",
    natureza: { id: "30000000-0000-4000-8000-000000000001", descricao: "Natureza original sintética", categoriaOriginal: null }, categoria: null }],
}
const plannedMeta = { ...meta, execution: { mode: "proposto", persisted: false } }
contractModels.PlannedManualResponse = { schema: plannedManualResponseSchema, example: { success: true, data: plannedRecord, meta: plannedMeta } }
contractModels.PlannedUpdateResponse = { schema: plannedWriteResponseSchema, example: { success: true, data: { ...plannedRecord, versao: "2" }, meta: plannedMeta } }
contractModels.PlannedInactivationResponse = { schema: plannedInactivationResponseSchema, example: { success: true, data: { ...plannedRecord, ativo: false, versao: "2" }, meta: plannedMeta } }
