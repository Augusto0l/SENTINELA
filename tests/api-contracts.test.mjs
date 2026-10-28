import "../scripts/contracts-runtime.mjs"
import test from "node:test"
import assert from "node:assert/strict"
import * as XLSX from "xlsx"
const common = await import("../src/contracts/common.ts")
const occurrences = await import("../src/contracts/occurrences.ts")
const imports = await import("../src/contracts/imports.ts")
const analytics = await import("../src/contracts/analytics.ts")
const adapters = await import("../src/contracts/adapters.ts")
const examples = await import("../src/contracts/examples.ts")
const { validateApiContracts } = await import(
  "../scripts/validate-api-contracts.mjs"
)
const { parseImportCsv, tableFromWorkbook } = await import(
  "../src/data/importParser.ts"
)
const { autoMapImport, analyzeImport, simulateImportConfirmation } =
  await import("../src/data/importValidation.ts")
const { RA_LIST, CRIME_NATURES } = await import("../src/data/mockData.ts")
const { queryDemoAnalytics } = await import("../src/data/demoAnalytics.ts")
const {
  createExample,
  occurrenceExample,
  mappingExample,
  analysisExample,
  demoResultExample,
  meta,
} = examples
const invalid = (schema, value) =>
  assert.equal(schema.safeParse(value).success, false, JSON.stringify(value))
const canonical = (changes = {}) =>
  occurrences.occurrenceSchema.parse({ ...occurrenceExample, ...changes })

test("contratos: cadastro válido, atributos obrigatórios, opcionais e anuláveis", () => {
  occurrences.occurrenceCreateSchema.parse(createExample)
  for (const field of ["data", "horario", "raCode", "naturezas", "local"]) {
    const value = { ...createExample }
    delete value[field]
    invalid(occurrences.occurrenceCreateSchema, value)
    invalid(occurrences.occurrenceCreateSchema, {
      ...createExample,
      [field]: null,
    })
  }
  const noCoordinates = { ...createExample }
  delete noCoordinates.coordenadas
  occurrences.occurrenceCreateSchema.parse(noCoordinates)
  occurrences.occurrenceCreateSchema.parse({
    ...createExample,
    coordenadas: null,
  })
  invalid(occurrences.occurrenceCreateSchema, { ...createExample, ativo: true })
  invalid(occurrences.occurrenceCreateSchema, {
    ...createExample,
    local: "abcd",
  })
})
test("contratos: datas civis, bissextos e horários não aceitam rollover ou timezone implícito", () => {
  for (const data of [
    "2026-02-29",
    "2026-04-31",
    "25/08/2026",
    "1899-12-31",
    "2026-08-25T00:00:00Z",
  ])
    invalid(common.dateSchema, data)
  common.dateSchema.parse("2024-02-29")
  for (const hour of ["24:00", "23:60", "9:00", "00:00:00", ""])
    invalid(common.timeSchema, hour)
  common.timeSchema.parse("00:00")
  common.timeSchema.parse("23:59")
})
test("contratos: WGS84 exige números finitos e um par completo", () => {
  for (const coordinates of [
    { latitude: -91, longitude: 0 },
    { latitude: 0, longitude: 181 },
    { latitude: NaN, longitude: 0 },
    { latitude: Infinity, longitude: 0 },
    { latitude: "-15.79", longitude: -47.88 },
    { latitude: 0 },
  ])
    invalid(common.coordinateSchema, coordinates)
  common.coordinateSchema.parse({ latitude: -90, longitude: 180 })
  invalid(occurrences.occurrenceSchema, {
    ...occurrenceExample,
    coordenadas: null,
  })
  canonical({ coordenadas: null, localizacao: "pendente" })
})
test("contratos: IDs opacos, catálogos internos e múltiplas naturezas", () => {
  for (const value of ["#00001", "0bfe32ac-81d1-433d-93ce-000000000001"])
    common.idSchema.parse(value)
  for (const value of ["", "../registro", "a/b", "id com espaço"])
    invalid(common.idSchema, value)
  for (const ra of RA_LIST) common.raSchema.parse(ra.codigo)
  for (const nature of CRIME_NATURES) common.natureSchema.parse(nature)
  invalid(common.raSchema, "RA-INVENTADA")
  invalid(common.natureSchema, "Crime inventado")
  for (const natures of [[], ["Furto", "Furto"], ["Furto", "inventada"]])
    invalid(occurrences.natureListSchema, natures)
  assert.equal(canonical().naturezas.length, 2)
})
test("contratos: PATCH parcial não aceita vazio, autoria, ID ou natureza nula", () => {
  occurrences.occurrenceUpdateSchema.parse({ local: "Novo endereço" })
  occurrences.occurrenceUpdateSchema.parse({ coordenadas: null })
  for (const patch of [
    {},
    { id: "outro" },
    { autor: "analista" },
    { naturezas: null },
    { local: "" },
  ])
    invalid(occurrences.occurrenceUpdateSchema, patch)
  invalid(occurrences.occurrenceSchema, {
    ...occurrenceExample,
    origem: "importacao",
  })
  canonical({ origem: "importacao", loteId: "lote-1" })
})
test("contratos: inativação lógica exige motivo, sem DELETE físico", () => {
  invalid(occurrences.inactivationSchema, { motivo: "  " })
  invalid(occurrences.inactivationSchema, { motivo: "x".repeat(501) })
  occurrences.inactivationSchema.parse({ motivo: "Correção solicitada" })
  assert.equal(canonical({ ativo: false }).ativo, false)
})
test("contratos: paginação, ordenação e HTTP não fazem coerção silenciosa", () => {
  const query = occurrences.parseOccurrenceQuery(
    new URLSearchParams(
      "page=2&pageSize=25&sortBy=data&direction=desc&includeInactive=false",
    ),
  )
  assert.equal(query.page, 2)
  assert.equal(query.includeInactive, false)
  for (const search of [
    "page=0",
    "pageSize=101",
    "page=1.5",
    "page=",
    "includeInactive=0",
    "sortBy=data",
    "direction=asc",
    "page=1&page=2",
    "unknown=x",
    "sortBy=sql&direction=asc",
  ])
    assert.throws(() =>
      occurrences.parseOccurrenceQuery(new URLSearchParams(search)),
    )
  invalid(common.paginationSchema, {
    page: 1,
    pageSize: 25,
    total: 26,
    totalPages: 1,
  })
  common.paginationSchema.parse({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  })
  invalid(occurrences.occurrenceListSchema, {
    success: true,
    data: {
      items: [occurrenceExample, occurrenceExample],
      pagination: { page: 1, pageSize: 25, total: 2, totalPages: 1 },
    },
    meta,
  })
})
test("contratos: filtros combinados aceitam o mesmo período inclusivo da Etapa 2", () => {
  occurrences.analyticsFilterSchema.parse(examples.filterExample)
  for (const value of [
    { period: "custom" },
    { period: "custom", startDate: "2026-08-26", endDate: "2026-08-25" },
    { period: "all", startDate: "2026-01-01" },
    { period: "custom", startDate: "2026-02-30", endDate: "2026-08-25" },
    { hour: "24-25" },
  ])
    invalid(occurrences.analyticsFilterSchema, value)
  for (const period of ["all", "today", "7d", "1m", "3m", "6m", "12m"])
    occurrences.analyticsFilterSchema.parse({ period })
})
test("contratos: adaptadores de formulário preservam campos e rejeitam conversão com perda", () => {
  const form = {
    natureza: "Furto",
    data: "25/08/2026",
    horario: "23:59",
    raCode: "RA-I",
    local: "Quadra demonstrativa 10",
    latitude: "-15.79",
    longitude: "-47.88",
  }
  const api = adapters.fromOccurrenceForm(form)
  assert.equal(api.data, "2026-08-25")
  assert.deepEqual(api.naturezas, ["Furto"])
  assert.deepEqual(adapters.toOccurrenceForm(canonical({ ...api })), form)
  assert.throws(() => adapters.toOccurrenceForm(occurrenceExample))
  assert.throws(() =>
    adapters.toOccurrenceForm(
      canonical({
        naturezas: ["Furto"],
        coordenadas: null,
        localizacao: "pendente",
      }),
    ),
  )
  assert.throws(() => adapters.fromOccurrenceForm({ ...form, latitude: "0" }))
})
test("contratos: filtros vazios de UI são adaptados sem alterar os originais", () => {
  const filters = {
    period: "custom",
    startDate: "2026-08-25",
    endDate: "2026-08-25",
    ra: "",
    nature: "",
    hour: "",
  }
  assert.deepEqual(
    adapters.toDemoFilters(adapters.fromDemoFilters(filters)),
    filters,
  )
  assert.equal(
    adapters.fromDemoFilters({ ...filters, period: "all" }).startDate,
    undefined,
  )
  assert.equal(filters.startDate, "2026-08-25")
})
test("contratos: metadados de lote, arquivo vazio, limite de 50 MB e formato", () => {
  imports.importCreateSchema.parse({
    file: examples.fileExample,
    fonte: "Teste",
  })
  for (const change of [
    { size: 0 },
    { size: 52428801 },
    { name: "arquivo.txt" },
    { name: "../arquivo.csv" },
    { sha256: "invalido" },
  ])
    invalid(imports.importFileSchema, { ...examples.fileExample, ...change })
  imports.importFileSchema.parse({ ...examples.fileExample, size: 52428800 })
})
test("contratos: mapeamento obrigatório, único e limitado aos cabeçalhos/planilhas", () => {
  imports.importMappingSchema.parse(mappingExample)
  for (const change of [{ data: -1 }, { horario: 0 }, { latitude: 7 }])
    invalid(imports.importMappingSchema, {
      ...mappingExample,
      mapping: { ...mappingExample.mapping, ...change },
    })
  invalid(imports.importMappingSchema, {
    ...mappingExample,
    sheetName: "Inexistente",
  })
  imports.importMappingSchema.parse({
    ...mappingExample,
    mapping: { ...mappingExample.mapping, latitude: -1, longitude: -1 },
  })
})
test("contratos: análise real da Etapa 1 preserva originais, erros, pendências e duplicatas", () => {
  const row =
    "25/08/2026,23:59,Furto|Ameaça,Plano Piloto,Quadra demonstrativa 10,-15.79,-47.88"
  const table = parseImportCsv(
    `data,horario,naturezas,RA,local,latitude,longitude\n${row}\n${row}\n${row.replace("-15.79,-47.88", ",")}\n${row.replace("23:59", "24:00")}`,
  )
  const analysis = analyzeImport(table, autoMapImport(table.headers))
  assert.deepEqual(imports.importAnalysisSchema.parse(analysis), analysis)
  assert.equal(analysis.counts.total, 4)
  assert.equal(analysis.counts.possibleDuplicates, 1)
  assert.equal(analysis.rows[3].issues[0].column, 2)
  assert.deepEqual(
    imports.demoImportResultSchema.parse(simulateImportConfirmation(analysis)),
    simulateImportConfirmation(analysis),
  )
  invalid(imports.importAnalysisSchema, {
    ...analysis,
    counts: { ...analysis.counts, valid: 999 },
  })
})
test("contratos: diagnóstico inválido não precisa fingir ocorrência válida", () => {
  imports.importRowSchema.parse({
    line: 2,
    original: [{ value: "original" }],
    normalized: {
      data: "inválida",
      horario: "",
      raCode: "",
      naturezas: [],
      local: "",
      latitude: "",
      longitude: "",
    },
    status: "invalido",
    issues: [{ field: "data", column: 1, message: "Data inválida" }],
  })
  invalid(imports.importRowSchema, {
    ...analysisExample.rows[0],
    normalized: { ...analysisExample.rows[0].normalized, data: "31/02/2026" },
  })
  invalid(imports.importRowSchema, {
    ...analysisExample.rows[0],
    possibleDuplicateOf: 2,
  })
  invalid(imports.importAnalysisSchema, {
    ...analysisExample,
    rows: Array(10001).fill(analysisExample.rows[0]),
  })
})
test("contratos: prévia XLSX e erro global de mapeamento mantêm os tipos da Etapa 1", () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["data", "horario", "naturezas", "RA", "local", "latitude", "longitude"],
      [
        "25/08/2026",
        "23:59",
        "Furto|Ameaça",
        "Plano Piloto",
        "Quadra demonstrativa 10",
        -15.79,
        -47.88,
      ],
    ]),
    "Dados",
  )
  const table = tableFromWorkbook(workbook, "Dados")
  const analysis = analyzeImport(table, autoMapImport(table.headers))
  assert.deepEqual(imports.importAnalysisSchema.parse(analysis), analysis)
  assert.equal(typeof analysis.rows[0].original[5].value, "number")
  const unmapped = analyzeImport(table, {
    ...autoMapImport(table.headers),
    data: -1,
  })
  assert.ok(unmapped.mappingErrors.length)
  imports.importAnalysisSchema.parse(unmapped)
})
test("contratos: resultado demonstração nunca afirma persistência e estados são coerentes", () => {
  invalid(imports.demoImportResultSchema, {
    ...demoResultExample,
    persisted: true,
  })
  invalid(imports.demoImportResultSchema, {
    ...demoResultExample,
    simulated: 2,
  })
  invalid(imports.importBatchSchema, {
    ...examples.batchExample,
    status: "concluido",
  })
  imports.importBatchSchema.parse({
    ...examples.batchExample,
    status: "concluido",
    result: demoResultExample,
  })
  invalid(imports.importBatchSchema, {
    ...examples.batchExample,
    mode: "operacional",
    status: "concluido",
    result: demoResultExample,
  })
  invalid(common.executionSchema, { mode: "demonstrativo", persisted: true })
  imports.importBatchSchema.parse({
    ...examples.batchExample,
    status: "falhou",
    failure: common.contractError("VALIDATION_ERROR", "Revise o lote."),
  })
  invalid(imports.importBatchSchema, {
    ...examples.batchExample,
    status: "falhou",
  })
})
test("contratos: analytics reutiliza regras da Etapa 2 e conta múltiplas naturezas sem inflar total", () => {
  const result = analytics.buildDemoAnalytics(
    [occurrenceExample],
    examples.filterExample,
  )
  const expected = queryDemoAnalytics(
    [analytics.toDemoRecord(occurrenceExample)],
    examples.filterExample,
  )
  assert.deepEqual(result.summary, expected.summary)
  assert.equal(result.summary.total, 1)
  assert.equal(
    Object.values(result.summary.byNature).reduce((a, b) => a + b, 0),
    2,
  )
  assert.equal(result.summary.timeline[0].count, 1)
  assert.throws(() =>
    analytics.buildDemoAnalytics([occurrenceExample, occurrenceExample], {}),
  )
})
test("contratos: analytics vazio, limites de dia, inativas e conservação de contagens", () => {
  const first = canonical({ id: "inicio", horario: "00:00" })
  const last = canonical({ id: "fim", horario: "23:59" })
  const inactive = canonical({ id: "inativa", ativo: false })
  const filters = {
    period: "custom",
    startDate: "2026-08-25",
    endDate: "2026-08-25",
  }
  const result = analytics.buildDemoAnalytics([first, last, inactive], filters)
  assert.equal(result.summary.total, 2)
  assert.equal(
    analytics.buildDemoAnalytics([first], {
      ...filters,
      startDate: "2027-01-01",
      endDate: "2027-01-01",
    }).summary.total,
    0,
  )
  invalid(analytics.summarySchema, { ...result.summary, total: 3 })
  invalid(analytics.summarySchema, {
    ...result.summary,
    timeline: [...result.summary.timeline, ...result.summary.timeline],
  })
})
test("contratos: pontos, calor e clusters preservam IDs, pendências e referência integral", () => {
  const pending = canonical({
    id: "pendente",
    coordenadas: null,
    localizacao: "pendente",
  })
  const other = canonical({ id: "outra-ra", raCode: "RA-II" })
  for (const mode of ["points", "heat", "clusters"]) {
    const map = analytics.buildDemoMap(
      [occurrenceExample, pending, other],
      { ra: "RA-I" },
      mode,
    )
    assert.equal(map.totalOccurrences, 2)
    assert.equal(map.points.length, 1)
    assert.equal(map.pendingLocation, 1)
    assert.equal(map.heatReference.totalLocated, 2)
    assert.equal(map.countsByRa["RA-II"], 1)
    assert.equal(map.heatReference.points.length, 2)
    assert.equal(map.points[0].longitude, -47.88)
    assert.equal(map.points[0].naturezas.length, 2)
    invalid(analytics.mapDataSchema, {
      ...map,
      points: [...map.points, ...map.points],
    })
  }
})
test("contratos: códigos HTTP e erros de validação são padronizados", () => {
  for (const [code, status] of Object.entries(common.ERROR_STATUS)) {
    const error = common.contractError(code, "Mensagem segura", [
      {
        path: ["rows", 2, "data"],
        code: "invalid_format",
        message: "Revise a data",
      },
    ])
    assert.equal(error.error.status, status)
    invalid(common.errorSchema, {
      ...error,
      error: { ...error.error, status: 200 },
    })
  }
  invalid(occurrences.occurrenceResponseSchema, {
    success: true,
    data: occurrenceExample,
    meta: { ...meta, execution: { mode: "demonstrativo", persisted: true } },
  })
})
test("contratos: OpenAPI válido, sincronizado e todos os exemplos aceitos por Zod e AJV", async () => {
  const result = await validateApiContracts()
  assert.equal(result.operations, 13)
  assert.ok(result.schemas >= 23 && result.payloads >= 29)
})
