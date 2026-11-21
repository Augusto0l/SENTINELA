"use client"
import { useEffect, useMemo, useState } from "react"
import {
  PERSISTENT_ANALYTICS_PATH, persistentAnalyticsData, persistentAnalyticsResponse, type PersistentAnalyticsData,
} from "@/contracts/persistent-analytics"
import { pcdfResponse } from "@/contracts/pcdf-workspace"
import type { DemoFilters } from "@/data/demoAnalytics"

export type AnalyticSelection = DemoFilters & { category?: string }
const isolatedAnalyticsResponse = pcdfResponse(persistentAnalyticsData)

function search(filters: AnalyticSelection) {
  const query = new URLSearchParams()
  for (const key of ["ra", "nature", "category", "hour"] as const) {
    if (filters[key]) query.set(key, filters[key])
  }
  if (filters.period === "custom") {
    query.set("startDate", filters.startDate)
    query.set("endDate", filters.endDate)
  }
  return query.toString()
}

export function usePersistentAnalytics(enabled: boolean, filters: AnalyticSelection) {
  const url = enabled ? `${PERSISTENT_ANALYTICS_PATH}?${search(filters)}` : ""
  const [attempt, setAttempt] = useState(0)
  // A return to the same URL is a new request if another filter ran in between.
  const request = useMemo(() => ({ url, attempt }), [url, attempt])
  const [result, setResult] = useState<{ request: typeof request; data?: PersistentAnalyticsData; error?: string }>()
  const [catalog, setCatalog] = useState<Pick<PersistentAnalyticsData, "regions" | "natures" | "categories">>()
  useEffect(() => {
    if (!request.url) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(request.url, { cache: "no-store", credentials: "same-origin",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
        if (!response.ok) throw new Error(response.status === 401 ? "Sessão expirada. Entre novamente." : "Leitura persistente indisponível.")
        const body = await response.json()
        const isolated = isolatedAnalyticsResponse.safeParse(body)
        const { data } = isolated.success ? isolated.data : persistentAnalyticsResponse.parse(body)
        if (!controller.signal.aborted) {
          const { regions, natures, categories } = data
          setCatalog({ regions, natures, categories })
          setResult({ request, data })
        }
      } catch (error) {
        if (!controller.signal.aborted) setResult({ request, error: error instanceof Error && error.message === "Sessão expirada. Entre novamente."
          ? error.message : "Não foi possível consultar os indicadores persistentes." })
      }
    })()
    return () => controller.abort()
  }, [request])
  const current = result?.request === request ? result : undefined
  return { data: current?.data ?? null, pending: Boolean(url && !current), error: current?.error,
    catalog: enabled ? catalog : undefined,
    retry: () => setAttempt(value => value + 1) }
}
