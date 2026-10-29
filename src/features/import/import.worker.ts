import { createImportWorkerProcessor } from "@/features/import/importWorkerProcessor"
import type { ImportWorkerJob } from "@/data/importTypes"

const process = createImportWorkerProcessor()
self.onmessage = async (event: MessageEvent<ImportWorkerJob>) => {
  const response = await process(event.data)
  if (response) self.postMessage(response)
}
