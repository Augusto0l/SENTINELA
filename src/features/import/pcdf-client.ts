"use client"

import { useEffect, useState } from "react"
import { z } from "zod"
import { OFFICIAL_PCDF_BLOCK } from "@/data/importSource"
import { generalImportPath } from "@/contracts/general-import"

const envelope = z.strictObject({ success: z.literal(true), scope: z.enum(["sandbox-synthetic-only","homologacao-persistente-sintetica","importacao-local","importacao-supabase"]), data: z.unknown() })

const errors: Record<number, string> = {
  400: "Confira os dados enviados.", 401: "Sessão expirada. Entre novamente.",
  403: "Seu perfil ou ambiente não permite esta operação.", 404: "Registro não encontrado.",
  409: "Os dados mudaram ou já existem. Atualize a consulta.", 413: "O arquivo excede o limite de 16 MiB.",
  415: "Formato de arquivo indisponível neste ambiente.", 422: "O arquivo ou a correção foi recusado.",
}

export class PcdfHttpError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export async function requestPcdf<T extends z.ZodType>(url: string, shape: T, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin", ...init }).catch(error => {
    if (error instanceof Error && error.name === "AbortError") throw error
    throw new PcdfHttpError(503, "Backend de importação indisponível. Tente novamente.")
  })
  if (!response.ok) {
    let message = errors[response.status] ?? "Serviço PCDF indisponível."
    if (url.startsWith(generalImportPath)) {
      if (response.status === 413) message = "O arquivo excede o limite de 8 MiB."
      if (response.status === 503) {
        const details = await response.json().catch(() => null)
        message = typeof details?.error?.message === "string" ? details.error.message : "Backend de importação indisponível."
      }
    }
    if (response.status === 422) {
      const details = await response.json().catch(() => null)
      const diagnosis = typeof details?.error?.diagnostic === "string" ? details.error.diagnostic : ""
      if (url.startsWith(generalImportPath) && typeof details?.error?.message === "string") message = details.error.message
      if (diagnosis === "pcdf_institucional") throw new PcdfHttpError(422, OFFICIAL_PCDF_BLOCK)
      if (diagnosis === "estrutura_ou_mapeamento") throw new PcdfHttpError(422, "Confira o formato, a planilha, o separador e o mapeamento do arquivo.")
      const cell = /^linha_(\d+)_coluna_(\d+)_(use_texto|formula_recusada|texto_invalido)$/.exec(diagnosis)
      if (cell) {
        const instruction = cell[3] === "use_texto" ? "Informe o valor como texto."
          : cell[3] === "formula_recusada" ? "Substitua a fórmula pelo valor original." : "Confira o tamanho e os caracteres."
        message = `Linha ${cell[1]}, coluna ${cell[2]}. ${instruction}`
      }
    }
    throw new PcdfHttpError(response.status, message)
  }
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
