"use client"

import { useEffect, useState } from "react"
import { z } from "zod"

const envelope = z.strictObject({ success: z.literal(true), scope: z.literal("sandbox-synthetic-only"), data: z.unknown() })

const errors: Record<number, string> = {
  400: "Confira os dados enviados.", 401: "Sessão expirada. Entre novamente.",
  403: "Seu perfil ou ambiente não permite esta operação.", 404: "Registro não encontrado.",
  409: "Os dados mudaram ou já existem. Atualize a consulta.", 413: "O arquivo excede o limite de 16 MiB.",
  415: "Use um arquivo CSV.", 422: "O arquivo ou a correção foi recusado.",
}

export async function requestPcdf<T extends z.ZodType>(url: string, shape: T, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin", ...init })
  if (!response.ok) throw new Error(errors[response.status] ?? "Serviço PCDF indisponível.")
  const result = envelope.safeParse(await response.json())
  if (!result.success) throw new Error("Resposta PCDF inválida.")
  const data = shape.safeParse(result.data.data)
  if (!data.success) throw new Error("Resposta PCDF inválida.")
  return data.data
}

export function usePcdfQuery<T extends z.ZodType>(url: string, shape: T) {
  const [result, setResult] = useState<{ url: string; data?: z.infer<T>; error?: string }>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void requestPcdf(url, shape, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]) })
      .then(data => { if (!controller.signal.aborted) setResult({ url, data }) })
      .catch(error => { if (!controller.signal.aborted) setResult({ url, error: error.message }) })
    return () => controller.abort()
  }, [url, shape, attempt])
  return { current: result?.url === url ? result : undefined,
    reload: () => { setResult(undefined); setAttempt(value => value + 1) } }
}
