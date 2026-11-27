import "../scripts/contracts-runtime.mjs"
import assert from "node:assert/strict"
import test from "node:test"

const { parseLocalOccurrencesQuery, localOccurrenceList, importedOccurrenceDetail } =
  await import("../src/contracts/local-occurrences.ts")
const uuid = "10000000-0000-4000-8000-000000000001"
const parse = (value) => parseLocalOccurrencesQuery(new URLSearchParams(value))

test("local staging query keeps original labels and validates scope, date range and pagination", () => {
  const query = parse({
    view: "importados", competencia: "2021-01", ra: "RA Fictícia", natureza: " Natureza de teste ",
    dataInicial: "2021-01-01", dataFinal: "2021-01-31", situacao: "bloqueada", pagina: "2",
  })
  assert.equal(query.natureza, " Natureza de teste ")
  assert.equal(query.pagina, 2)
  assert.equal(query.ordenar, "data")
  assert.equal(query.direcao, "desc")
  for (const input of [
    "view=importados&pagina=1&pagina=2",
    "view=importados&pagina=2e0",
    "view=importados&pagina=0",
    "view=importados&naturezaId=" + uuid,
    "view=consolidadas&ra=A",
    "view=consolidadas&competencia=2021-01",
    "view=importados&competencia=2021-13",
    "view=importados&ordenar=pg_sleep(1)",
    "view=importados&dataInicial=2021-01-29&dataFinal=2021-01-20",
    "view=importados&dataInicial=2021-01-32",
    "view=detalhe&area=importados&id=outro",
    "view=resumo&local=outro",
  ]) assert.throws(() => parse(input), input)
  assert.deepEqual(parse("view=detalhe&area=importados&id=" + uuid), { view: "detalhe", area: "importados", id: uuid })
  assert(localOccurrenceList.safeParse({ pagina: 1, total: 0, itens: [] }).success)
})

test("local staging detail accepts 34 exact strings including original whitespace and empty values", () => {
  const campos = Object.fromEntries(Array.from({ length: 34 }, (_, i) => ["campo_" + i, i === 0 ? " 001 " : ""]))
  const detail = {
    origemId: uuid, stagingId: uuid, lote: uuid, execucao: uuid, arquivo: "pcdf_naturezas_2021-01.csv",
    competencia: "2021-01", ordinal: 25, situacao: "bloqueada", campos, pendencias: [],
  }
  assert.equal(importedOccurrenceDetail.parse(detail).campos.campo_0, " 001 ")
  assert.equal(importedOccurrenceDetail.parse(detail).campos.campo_1, "")
  assert.equal(importedOccurrenceDetail.safeParse({ ...detail, campos: { ...campos, outro: "" } }).success, false)
})
