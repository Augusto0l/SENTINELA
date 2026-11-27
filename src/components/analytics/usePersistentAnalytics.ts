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

export function usePersistentAnalytics(enabled: boolean, filters: AnalyticSelection, dashboard = false) {
  const url = enabled ? `${PERSISTENT_ANALYTICS_PATH}?${dashboard ? "scope=pcdf&" : ""}${search(filters)}` : ""
  const [attempt, setAttempt] = useState(0)
  // A return to the same URL is a new request if another filter ran in between.
  const request = useMemo(() => ({ url, attempt }), [url, attempt])
  const [result, setResult] = useState<{ request: typeof request; data?: PersistentAnalyticsData; error?: string }>()
  const [catalog, setCatalog] = useState<Pick<PersistentAnalyticsData, "regions" | "natures" | "categories">>()
  useEffect(() => {
    if (!request.url) return
    const controller = new AbortController()
    let inFlight = false
    // Last body accepted for this request. A periodic refresh with byte-identical content keeps the
    // current data objects, so the map and charts are not parsed, validated and redrawn again.
    let acceptedBody: string | undefined
    const load = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const response = await fetch(request.url, { cache: "no-store", credentials: "same-origin",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) })
        if (!response.ok) throw new Error(response.status === 401 ? "Sessão expirada. Entre novamente." : "Leitura persistente indisponível.")
        const text = await response.text()
        if (text === acceptedBody) return
        const body = JSON.parse(text)
        const isolated = isolatedAnalyticsResponse.safeParse(body)
        const { data } = isolated.success ? isolated.data : persistentAnalyticsResponse.parse(body)
        if (!controller.signal.aborted) {
          const { regions, natures, categories } = data
          setCatalog({ regions, natures, categories })
          setResult({ request, data })
          acceptedBody = text
        }
      } catch (error) {
        // After a failure the next successful body must be applied again, even if it matches the old one.
        acceptedBody = undefined
        if (!controller.signal.aborted) setResult({ request, error: error instanceof Error && error.message === "Sessão expirada. Entre novamente."
          ? error.message : "Não foi possível consultar os indicadores persistentes." })
      } finally { inFlight = false }
    }
    const refresh = () => { if (document.visibilityState === "visible") void load() }
    void load()
    document.addEventListener("visibilitychange", refresh)
    const timer = window.setInterval(refresh, 60000)
    return () => {
      controller.abort()
      document.removeEventListener("visibilitychange", refresh)
      window.clearInterval(timer)
    }
  }, [request])
  const current = result?.request === request ? result : undefined
  return { data: current?.data ?? null, pending: Boolean(url && !current), error: current?.error,
    catalog: enabled ? catalog : undefined,
    retry: () => setAttempt(value => value + 1) }
}
