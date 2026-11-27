import { IMPORT_LIMITS } from "@/data/importTypes"
import type {
  ImportWorkerJob,
  ImportWorkerReply,
  ImportWorkerRequest,
  ImportWorkerResponse,
} from "@/data/importTypes"

type WorkerPort = Pick<Worker, "onmessage" | "onerror" | "onmessageerror" | "postMessage" | "terminate">
interface Options {
  createWorker: () => WorkerPort
  onBusy: (label: string) => void
  onResponse: (
    response: Exclude<ImportWorkerResponse, { type: "error" }>,
  ) => void
  onError: (message: string) => void
  clock?: {
    set: (callback: () => void, milliseconds: number) => unknown
    clear: (handle: unknown) => void
  }
}
const PROCESSING_ERROR =
  "Não foi possível processar o arquivo. Verifique a integridade, divida arquivos grandes e tente novamente."

/** One active operation; invalidate identity before releasing resources or notifying React. */
export function createImportWorkerClient(options: Options) {
  const clock = options.clock ?? {
    set: (callback: () => void, milliseconds: number) =>
      setTimeout(callback, milliseconds),
    clear: (handle: unknown) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
  }
  let worker: WorkerPort | null = null
  let nextId = 0
  let pending: {
    id: number
    type: ImportWorkerRequest["type"]
    worker: WorkerPort
  } | null = null
  let timer: unknown = null
  function clearTimer() {
    if (timer !== null) clock.clear(timer)
    timer = null
  }
  function cancel() {
    pending = null
    clearTimer()
    const previous = worker
    worker = null
    if (previous) {
      previous.onmessage = null
      previous.onerror = null
      previous.onmessageerror = null
      previous.terminate()
    }
  }
  function fail(message: string) {
    cancel()
    options.onBusy("")
    options.onError(message)
  }
  function send(request: ImportWorkerRequest, label: string) {
    if (!worker) {
      fail("O processamento foi encerrado. Selecione o arquivo novamente.")
      return false
    }
    if (pending) return false
    const operation = { id: ++nextId, type: request.type, worker }
    pending = operation
    options.onBusy(label)
    timer = clock.set(() => {
      if (pending !== operation || worker !== operation.worker) return
      fail(
        "O processamento excedeu 60 segundos. Divida o arquivo e tente novamente.",
      )
    }, IMPORT_LIMITS.timeout)
    try {
      worker.postMessage({
        id: operation.id,
        request,
      } satisfies ImportWorkerJob)
    } catch {
      if (pending === operation) fail(PROCESSING_ERROR)
      return false
    }
    return true
  }
  function start(request: ImportWorkerRequest, label: string) {
    cancel()
    try {
      const next = options.createWorker()
      worker = next
      next.onmessage = (event: MessageEvent<ImportWorkerReply>) => {
        const operation = pending
        if (worker !== next || !operation || event.data?.id !== operation.id)
          return
        const response = event.data.response
        if (
          !response ||
          !["table", "analysis", "error"].includes(response.type) ||
          (response.type !== "error" &&
            response.type !==
              (operation.type === "validate" ? "analysis" : "table"))
        ) {
          fail(
            "O processamento retornou uma resposta inválida. Selecione o arquivo novamente.",
          )
          return
        }
        if (response.type === "error") {
          fail(response.message)
          return
        }
        pending = null
        clearTimer()
        options.onBusy("")
        options.onResponse(response)
      }
      next.onerror = (event) => {
        event.preventDefault()
        if (worker === next) fail(PROCESSING_ERROR)
      }
      next.onmessageerror = () => {
        if (worker === next)
          fail(
            "Não foi possível receber os dados processados. Selecione o arquivo novamente.",
          )
      }
      return send(request, label)
    } catch {
      fail(
        "O navegador não conseguiu iniciar o processamento. Tente novamente em um navegador com suporte a Web Workers.",
      )
      return false
    }
  }
  return { start, send, cancel }
}
export type ImportWorkerClient = ReturnType<typeof createImportWorkerClient>
