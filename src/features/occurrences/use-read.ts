"use client"
// A changed URL hides old data immediately, before effect cleanup/next response.
import { useEffect, useState } from "react"
import { OccurrenceReadError } from "@/features/occurrences/client"

type State<T> = {
  key: string
  data?: T
  error?: OccurrenceReadError
}
export default function useRead<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  retry = 0,
) {
  const [state, setState] = useState<State<T>>({ key: "" })
  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ key, data })
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState(previous => ({
            key,
            data: previous.key === key && error?.status !== 401 && error?.status !== 403 ? previous.data : undefined,
            error:
              error instanceof
              OccurrenceReadError
                ? error
                : new OccurrenceReadError(
                    0,
                    "Não foi possível concluir a consulta.",
                  ),
          }))
      })
    return () => controller.abort()
  }, [key, load, retry])
  return state.key === key
    ? { ...state, loading: false }
    : { loading: true, data: undefined, error: undefined }
}
