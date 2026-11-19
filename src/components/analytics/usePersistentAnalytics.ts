"use client"
import { useEffect, useState } from "react"
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
  const [result, setResult] = useState<{ url: string; data: PersistentAnalyticsData | null; error?: string }>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(url, { cache: "no-store", credentials: "same-origin",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
        if (!response.ok) throw new Error(response.status === 401 ? "Sessão expirada. Entre novamente." : "Leitura persistente indisponível.")
        const body = await response.json()
        const isolated = isolatedAnalyticsResponse.safeParse(body)
        const { data } = isolated.success ? isolated.data : persistentAnalyticsResponse.parse(body)
        if (!controller.signal.aborted) setResult({ url, data })
      } catch (error) {
        if (!controller.signal.aborted) setResult({ url, data: null, error: error instanceof Error && error.message === "Sessão expirada. Entre novamente."
          ? error.message : "Não foi possível consultar os indicadores persistentes." })
      }
    })()
    return () => controller.abort()
  }, [url, attempt])
  const current = url && result?.url === url ? result : undefined
  return { data: current?.data ?? null, pending: Boolean(url && !current), error: current?.error,
    catalog: result?.data ?? null,
    retry: () => { setResult(undefined); setAttempt(value => value + 1) } }
}
