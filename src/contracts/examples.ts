import type { z } from "zod"
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
