export class JsonLimitExceeded extends Error {}

export async function readBoundedJson(request: Request, limit: number): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) throw new Error("Missing request body")
  const decoder = new TextDecoder("utf-8", { fatal: true })
  let size = 0, body = ""
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return JSON.parse(body + decoder.decode())
      size += value.byteLength
      if (size > limit) throw new JsonLimitExceeded()
      body += decoder.decode(value, { stream: true })
    }
  } finally {
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
