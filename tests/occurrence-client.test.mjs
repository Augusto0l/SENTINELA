import "../scripts/contracts-runtime.mjs"
import test from "node:test"
import assert from "node:assert/strict"
const c = await import("../src/features/occurrences/client.ts")
const { contractModels } = await import("../src/contracts/examples.ts")
const row = structuredClone(contractModels.PersistentDetail.example.data)
const meta = contractModels.PersistentDetail.example.meta
const controller = () => new AbortController()
const response = (data, status = 200) => Response.json(data, { status })
const list = (items = [], total = 0, page = 1) => ({
  success: true,
  data: {
    items,
    pagination: {
      page,
      pageSize: 25,
      total,
      totalPages: Math.ceil(total / 25),
    },
  },
  meta,
})

test("client: initial list and empty results are real GET-shaped responses, no browser credentials or fallback", async () => {
  let call
  const data = await c.readList(
    c.queryFromFilters(c.emptyFilters()),
    controller().signal,
    async (...args) => {
      call = args
      return response(list())
    },
  )
  assert.deepEqual(data.items, [])
  assert.equal(data.pagination.total, 0)
  assert(call[0].startsWith("/api/v1/ocorrencias?"))
  assert.equal(call[1].method, "GET")
  assert.equal(call[1].credentials, "same-origin")
  assert.equal(call[1].cache, "no-store")
})
test("client: combined filters are encoded exactly and pagination resets with new filters", () => {
  const filters = {
    ...c.emptyFilters(),
    identificacao: "%' OR true --",
    local: "Teste & local",
    raId: "10000000-0000-4000-8000-000000000001",
    naturezaId: "30000000-0000-4000-8000-000000000001",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  }
  const query = c.queryFromFilters(filters)
  const url = new URL(c.listUrl(query), "http://localhost")
  assert.equal(url.searchParams.get("local"), filters.local)
  assert.equal(query.page, 1)
  assert.equal(url.searchParams.get("naturezaId"), filters.naturezaId)
  assert.deepEqual(c.queryFromFilters(c.emptyFilters()), {
    page: 1,
    pageSize: 25,
    sortBy: "data",
    direction: "desc",
  })
  assert.throws(() =>
    c.queryFromFilters({
      ...filters,
      startDate: "2026-12-31",
      endDate: "2026-01-01",
    }),
  )
  assert.throws(() => c.queryFromFilters({ ...filters, raId: "RA-I" }))
})
test("client: allowed sorts, pagination windows and global totals", async () => {
  for (const sort of ["data", "horario", "identificacao", "local", "ra"])
    for (const direction of ["asc", "desc"])
      assert.equal(
        c.queryFromFilters(c.emptyFilters(), 2, sort, direction).direction,
        direction,
      )
  assert.deepEqual(c.paginationWindow(1, 0), [])
  assert.deepEqual(c.paginationWindow(7, 8), [4, 5, 6, 7, 8])
  const items = Array.from({ length: 25 }, (_, i) => ({
    ...row,
    id: `50000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  }))
  const data = await c.readList(
    c.queryFromFilters(c.emptyFilters()),
    controller().signal,
    async () => response(list(items, 26)),
  )
  assert.equal(data.pagination.total, 26)
  assert.equal(data.items.length, 25)
  const beyond = await c.readList(
    c.queryFromFilters(c.emptyFilters(), 3),
    controller().signal,
    async () => response(list([], 26, 3)),
  )
  assert.deepEqual(beyond.items, [])
})
test("client: unsafe or contradictory envelopes never become usable records", async () => {
  for (const payload of [
    {},
    list([row, row], 2),
    list([], 1),
    {
      ...list(),
      data: {
        ...list().data,
        pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
      },
    },
  ])
    await assert.rejects(
      () =>
        c.readList(
          c.queryFromFilters(c.emptyFilters()),
          controller().signal,
          async () => response(payload),
        ),
      /Resposta inesperada/,
    )
})
test("client: HTTP authorization/validation/unavailable errors stay generic", async () => {
  for (const status of [400, 401, 403, 404, 422, 503, 500]) {
    await assert.rejects(
      () =>
        c.readList(
          c.queryFromFilters(c.emptyFilters()),
          controller().signal,
          async () =>
            response({ error: "SELECT password FROM private" }, status),
        ),
      (e) =>
        e instanceof c.OccurrenceReadError &&
        e.status === status &&
        !e.message.includes("password"),
    )
  }
})
test("client: network and invalid JSON are distinct from empty results", async () => {
  await assert.rejects(
    () =>
      c.readList(
        c.queryFromFilters(c.emptyFilters()),
        controller().signal,
        async () => {
          throw Error("private SQL")
        },
      ),
    /conectar/,
  )
  await assert.rejects(
    () =>
      c.readList(
        c.queryFromFilters(c.emptyFilters()),
        controller().signal,
        async () => new Response("not JSON", { status: 200 }),
      ),
    /Resposta inesperada/,
  )
})
test("client: nullable details, real UUID and multiple associations are preserved", async () => {
  const item = {
    ...row,
    naturezas: [1, 2].map((i) => ({
      id: `60000000-0000-4000-8000-00000000000${i}`,
      crimeTentado: null,
      classificacaoStatus: "pendente",
      natureza: null,
      categoria: null,
    })),
  }
  let endpoint
  const detail = await c.readDetail(
    row.id,
    controller().signal,
    async (url) => {
      endpoint = url
      return response({ success: true, data: item, meta })
    },
  )
  assert.equal(endpoint, "/api/v1/ocorrencias/" + row.id)
  assert.equal(detail.data, null)
  assert.equal(detail.naturezas.length, 2)
  assert.deepEqual(c.natureLabels(detail), [
    "Natureza indisponível",
    "Natureza indisponível",
  ])
  await assert.rejects(
    () =>
      c.readDetail("#demo", controller().signal, async () => {
        throw Error("Must not fetch")
      }),
    (e) => e.status === 400,
  )
  await assert.rejects(
    () =>
      c.readDetail(row.id, controller().signal, async () =>
        response({
          success: true,
          data: { ...row, id: "50000000-0000-4000-8000-000000000002" },
          meta,
        }),
      ),
    /Resposta inesperada/,
  )
})
test("client: obsolete list/detail responses cannot be committed even if transport ignores abort", async () => {
  for (const detail of [false, true]) {
    const abort = controller()
    let finish
    const fetcher = () =>
      new Promise((r) => {
        finish = r
      })
    const promise = detail
      ? c.readDetail(row.id, abort.signal, fetcher)
      : c.readList(c.queryFromFilters(c.emptyFilters()), abort.signal, fetcher)
    abort.abort()
    finish(response(detail ? { success: true, data: row, meta } : list()))
    await assert.rejects(
      () => promise,
      (e) => e.name === "AbortError",
    )
  }
})
