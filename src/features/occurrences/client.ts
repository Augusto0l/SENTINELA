import {
  persistentDetailResponseSchema,
  persistentIdSchema,
  persistentListResponseSchema,
  persistentQuerySchema,
  type PersistentQuery,
} from "@/contracts/persistent-occurrences"
import { z } from "zod"

export type ReadOccurrence = z.infer<typeof persistentDetailResponseSchema>["data"]
export type ReadList = z.infer<typeof persistentListResponseSchema>["data"]
export type Filters = {
  identificacao: string
  local: string
  raId: string
  naturezaId: string
  startDate: string
  endDate: string
}
export const emptyFilters = (): Filters => ({
  identificacao: "",
  local: "",
  raId: "",
  naturezaId: "",
  startDate: "",
  endDate: "",
})
export class OccurrenceReadError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
export function queryFromFilters(
  filters: Filters,
  page = 1,
  sortBy: PersistentQuery["sortBy"] = "data",
  direction: PersistentQuery["direction"] = "desc",
) {
  return persistentQuerySchema.parse({
    ...Object.fromEntries(
      Object.entries(filters)
        .map(([k, v]) => [k, v.trim()])
        .filter(([, v]) => v !== ""),
    ),
    page,
    pageSize: 25,
    sortBy,
    direction,
  })
}
export function listUrl(query: PersistentQuery) {
  const value = persistentQuerySchema.parse(query)
  return (
    "/api/v1/ocorrencias?" +
    new URLSearchParams(
      Object.entries(value).map(([key, v]) => [key, String(v)]),
    ).toString()
  )
}
export function errorForStatus(status: number) {
  const messages: Record<number, string> = {
    400: "Revise os filtros informados.",
    401: "Sua sessão expirou. Entre novamente para continuar.",
    403: "Você não tem autorização para esta consulta.",
    404: "Ocorrência não encontrada ou indisponível.",
    422: "Revise os filtros informados.",
    503: "Serviço de leitura indisponível. Tente novamente.",
  }
  return new OccurrenceReadError(
    status,
    messages[status] ?? "Não foi possível concluir a consulta.",
  )
}
async function get(
  url: string,
  schema: z.ZodType,
  signal: AbortSignal,
  fetcher: typeof fetch,
) {
  try {
    const response = await fetcher(url, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    })
    if (signal.aborted) throw new DOMException("Obsolete request", "AbortError")
    if (!response.ok) throw errorForStatus(response.status)
    const payload = await response.json()
    if (signal.aborted) throw new DOMException("Obsolete request", "AbortError")
    const parsed = schema.safeParse(payload)
    if (!parsed.success)
      throw new OccurrenceReadError(
        0,
        "Resposta inesperada do serviço de leitura.",
      )
    return parsed.data
  } catch (error) {
    if (signal.aborted) throw new DOMException("Obsolete request", "AbortError")
    if (error instanceof OccurrenceReadError) throw error
    if (error instanceof SyntaxError)
      throw new OccurrenceReadError(
        0,
        "Resposta inesperada do serviço de leitura.",
      )
    throw new OccurrenceReadError(
      0,
      "Não foi possível conectar ao serviço de leitura. Tente novamente.",
    )
  }
}
export async function readList(
  query: PersistentQuery,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ReadList> {
  const parsed = persistentQuerySchema.parse(query)
  const result = (await get(
    listUrl(parsed),
    persistentListResponseSchema,
    signal,
    fetcher,
  )) as z.infer<typeof persistentListResponseSchema>
  const p = result.data.pagination
  const expected = Math.min(
    p.pageSize,
    Math.max(0, p.total - (p.page - 1) * p.pageSize),
  )
  if (
    p.page !== parsed.page ||
    p.pageSize !== parsed.pageSize ||
    p.totalPages !== Math.ceil(p.total / p.pageSize) ||
    result.data.items.length !== expected ||
    new Set(result.data.items.map((i) => i.id)).size !==
      result.data.items.length
  )
    throw new OccurrenceReadError(
      0,
      "Resposta inesperada do serviço de leitura.",
    )
  return result.data
}
export async function readDetail(
  id: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ReadOccurrence> {
  if (!persistentIdSchema.safeParse(id).success) throw errorForStatus(400)
  const result = (await get(
    `/api/v1/ocorrencias/${id}`,
    persistentDetailResponseSchema,
    signal,
    fetcher,
  )) as z.infer<typeof persistentDetailResponseSchema>
  if (result.data.id !== id)
    throw new OccurrenceReadError(
      0,
      "Resposta inesperada do serviço de leitura.",
    )
  return result.data
}
export function natureLabels(record: ReadOccurrence) {
  return record.naturezas.map(
    (a) => a.natureza?.descricao ?? "Natureza indisponível",
  )
}
export function paginationWindow(page: number, totalPages: number) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4))
  return Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i)
}
