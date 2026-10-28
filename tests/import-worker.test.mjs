import "../scripts/contracts-runtime.mjs"
import test from "node:test"
import assert from "node:assert/strict"
import * as XLSX from "xlsx"
const { createImportWorkerClient } = await import(
  "../src/features/import/importWorkerClient.ts"
)
const { createImportWorkerProcessor } = await import(
  "../src/features/import/importWorkerProcessor.ts"
)
const { IMPORT_LIMITS } = await import("../src/data/importTypes.ts")
const { autoMapImport } = await import("../src/data/importValidation.ts")
const header = "data,horario,naturezas,RA,local,latitude,longitude"
const row =
  "25/08/2026,23:59,Furto|Ameaça,Plano Piloto,Quadra demonstrativa 10,-15.79,-47.88"
const file = (name = "dados.csv", body = `${header}\n${row}`) =>
  new File([body], name)
const table = {
  type: "table",
  table: {
    headers: header.split(","),
    headerLine: 1,
    sheetName: "CSV",
    sheetNames: ["CSV"],
    date1904: false,
    rowCount: 1,
  },
}
const analysis = {
  type: "analysis",
  analysis: {
    mappingErrors: [],
    rows: [],
    counts: {
      total: 0,
      valid: 0,
      invalid: 0,
      pending: 0,
      possibleDuplicates: 0,
    },
  },
}
function rig() {
  const workers = [],
    responses = [],
    errors = [],
    busy = [],
    timers = new Map()
  let now = 0,
    sequence = 0
  const clock = {
    set(callback, milliseconds) {
      const id = ++sequence
      timers.set(id, { callback, at: now + milliseconds })
      return id
    },
    clear(id) {
      timers.delete(id)
    },
  }
  const options = {
    clock,
    onResponse: (response) => responses.push(response),
    onError: (error) => errors.push(error),
    onBusy: (label) => busy.push(label),
    createWorker() {
      const worker = {
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        jobs: [],
        terminated: 0,
        postMessage(job) {
          if (this.failSend) throw new Error("DataCloneError")
          this.jobs.push(job)
        },
        terminate() {
          this.terminated++
        },
        reply(response, id = this.jobs.at(-1).id) {
          this.onmessage?.({ data: { id, response } })
        },
      }
      workers.push(worker)
      return worker
    },
  }
  const client = createImportWorkerClient(options)
  return {
    client,
    options,
    workers,
    responses,
    errors,
    busy,
    timers,
    advance(milliseconds) {
      now += milliseconds
      for (const [id, timer] of [...timers])
        if (timer.at <= now) {
          timers.delete(id)
          timer.callback()
        }
    },
    start() {
      client.start({ type: "load", file: file() }, "Lendo…")
      return workers.at(-1)
    },
  }
}
test("Worker: cancelar durante leitura termina o Worker e libera timer/handlers sem atualizar a tela", () => {
  const r = rig(),
    worker = r.start(),
    lateReply = worker.onmessage,
    lateTimeout = [...r.timers.values()][0].callback
  r.client.cancel()
  r.client.cancel()
  assert.equal(worker.terminated, 1)
  assert.equal(r.timers.size, 0)
  assert.equal(worker.onmessage, null)
  assert.equal(worker.onerror, null)
  assert.equal(worker.onmessageerror, null)
  lateReply({ data: { id: worker.jobs[0].id, response: table } })
  lateTimeout()
  assert.deepEqual(r.responses, [])
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.busy, ["Lendo…"])
})
test("Worker: substituição de arquivo ignora resposta, erro e timeout já enfileirados da seleção antiga", () => {
  const r = rig(),
    old = r.start(),
    stale = {
      message: old.onmessage,
      error: old.onerror,
      deserialize: old.onmessageerror,
      timeout: [...r.timers.values()][0].callback,
    }
  const current = r.start()
  stale.message({ data: { id: old.jobs[0].id, response: table } })
  stale.error({ preventDefault() {} })
  stale.deserialize()
  stale.timeout()
  assert.equal(old.terminated, 1)
  assert.equal(current.terminated, 0)
  assert.equal(r.timers.size, 1)
  assert.deepEqual(r.responses, [])
  assert.deepEqual(r.errors, [])
  current.reply(table)
  assert.equal(r.responses.length, 1)
  assert.equal(r.timers.size, 0)
  r.client.cancel()
})
test("Worker: respostas antigas no mesmo Worker não substituem a operação atual nem cancelam seu watchdog", () => {
  const r = rig(),
    worker = r.start(),
    oldJob = worker.jobs[0]
  const staleTimeout = [...r.timers.values()][0].callback
  worker.reply(table)
  r.client.send(
    { type: "validate", mapping: autoMapImport(table.table.headers) },
    "Validando…",
  )
  worker.reply(table, oldJob.id)
  staleTimeout()
  assert.equal(r.responses.length, 1)
  assert.equal(r.timers.size, 1)
  assert.equal(r.busy.at(-1), "Validando…")
  worker.reply(analysis)
  worker.reply(analysis)
  assert.equal(r.responses.length, 2)
  assert.equal(r.timers.size, 0)
  r.client.cancel()
})
test("Worker: timeout segue exatamente os 60 segundos existentes e encerra processamento silencioso", () => {
  const r = rig(),
    worker = r.start()
  r.advance(IMPORT_LIMITS.timeout - 1)
  assert.deepEqual(r.errors, [])
  assert.equal(worker.terminated, 0)
  r.advance(1)
  assert.match(r.errors[0], /60 segundos/)
  assert.equal(worker.terminated, 1)
  assert.equal(r.timers.size, 0)
  r.advance(IMPORT_LIMITS.timeout)
  assert.equal(r.errors.length, 1)
})
test("Worker: cada operação possui prazo próprio e timers vencidos não derrubam validação posterior", () => {
  const r = rig(),
    worker = r.start(),
    oldTimeout = [...r.timers.values()][0].callback
  r.advance(IMPORT_LIMITS.timeout - 1)
  worker.reply(table)
  r.client.send(
    { type: "validate", mapping: autoMapImport(table.table.headers) },
    "Validando…",
  )
  oldTimeout()
  r.advance(1)
  assert.deepEqual(r.errors, [])
  assert.equal(worker.terminated, 0)
  worker.reply(analysis)
  r.advance(IMPORT_LIMITS.timeout)
  assert.deepEqual(r.errors, [])
  r.client.cancel()
})
test("Worker: criação indisponível, postMessage com falha, erro de execução e messageerror são recuperáveis", () => {
  const unavailable = rig()
  unavailable.options.createWorker = () => {
    throw new Error("CSP")
  }
  assert.equal(
    unavailable.client.start({ type: "load", file: file() }, "Lendo…"),
    false,
  )
  assert.match(unavailable.errors[0], /iniciar/)
  assert.equal(unavailable.timers.size, 0)
  for (const mode of ["send", "error", "messageerror", "reply"]) {
    const r = rig(),
      worker = r.start()
    worker.reply(table)
    if (mode === "send") {
      worker.failSend = true
      r.client.send({ type: "sheet", name: "Dados" }, "Lendo…")
    } else if (mode === "error") worker.onerror({ preventDefault() {} })
    else if (mode === "messageerror") worker.onmessageerror()
    else {
      r.client.send(
        { type: "validate", mapping: autoMapImport(table.table.headers) },
        "Validando…",
      )
      worker.reply({ type: "error", message: "Arquivo corrompido" })
    }
    assert.equal(r.errors.length, 1, mode)
    assert.equal(worker.terminated, 1)
    assert.equal(r.timers.size, 0)
    r.start().reply(table)
    assert.equal(r.responses.length, 2)
    r.client.cancel()
  }
})
test("Worker: impede sobreposição de tarefas e rejeita resposta incompatível com a operação", () => {
  const r = rig(),
    worker = r.start()
  assert.equal(r.client.send({ type: "sheet", name: "Outra" }, "Lendo…"), false)
  assert.equal(worker.jobs.length, 1)
  worker.reply(analysis)
  assert.match(r.errors[0], /resposta inválida/)
  assert.equal(worker.terminated, 1)
  assert.equal(r.client.send({ type: "sheet", name: "Outra" }, "Lendo…"), false)
  assert.match(r.errors.at(-1), /encerrado/)
})
test("Worker: limpeza no unmount ignora todos os callbacks posteriores e permite novo ciclo", () => {
  const r = rig(),
    worker = r.start(),
    callback = worker.onmessage
  r.client.cancel()
  callback({ data: { id: worker.jobs[0].id, response: table } })
  assert.equal(r.responses.length, 0)
  assert.equal(r.timers.size, 0)
  r.start().reply(table)
  assert.equal(r.responses.length, 1)
  r.client.cancel()
})
test("Processor: CSV real mantém múltiplas naturezas, duplicatas, erros e pendências no protocolo", async () => {
  const process = createImportWorkerProcessor()
  const loaded = await process({
    id: 1,
    request: {
      type: "load",
      file: file(
        "dados.csv",
        `${header}\n${row}\n${row}\n${row.replace("-15.79,-47.88", ",")}\n${row.replace("23:59", "24:00")}`,
      ),
    },
  })
  assert.equal(loaded.id, 1)
  assert.equal(loaded.response.table.rowCount, 4)
  const reply = await process({
    id: 2,
    request: {
      type: "validate",
      mapping: autoMapImport(loaded.response.table.headers),
    },
  })
  assert.deepEqual(reply.response.analysis.counts, {
    total: 4,
    valid: 2,
    invalid: 1,
    pending: 1,
    possibleDuplicates: 1,
  })
})
test("Processor: XLSX permite trocar planilhas e recuperar seleção vazia", async () => {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([header.split(","), row.split(",")]),
    "Dados",
  )
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), "Vazia")
  const process = createImportWorkerProcessor()
  const loaded = await process({
    id: 1,
    request: {
      type: "load",
      file: new File(
        [XLSX.write(book, { type: "buffer", bookType: "xlsx" })],
        "dados.xlsx",
      ),
    },
  })
  assert.deepEqual(loaded.response.table.sheetNames, ["Dados", "Vazia"])
  const empty = await process({
    id: 2,
    request: { type: "sheet", name: "Vazia" },
  })
  assert.ok(empty.response.table.sheetError)
  assert.equal(empty.response.table.rowCount, 0)
  const back = await process({
    id: 3,
    request: { type: "sheet", name: "Dados" },
  })
  assert.equal(back.response.table.rowCount, 1)
})
test("Processor: leitura assíncrona antiga concluída após arquivo novo não substitui seu conteúdo", async () => {
  const process = createImportWorkerProcessor()
  let release
  const old = process({
    id: 1,
    request: {
      type: "load",
      file: {
        name: "antigo.csv",
        arrayBuffer: () =>
          new Promise((resolve) => {
            release = resolve
          }),
      },
    },
  })
  const next = await process({ id: 2, request: { type: "load", file: file() } })
  release(await file("antigo.csv", `${header}\n${row}\n${row}`).arrayBuffer())
  assert.equal(await old, null)
  const result = await process({
    id: 3,
    request: {
      type: "validate",
      mapping: autoMapImport(next.response.table.headers),
    },
  })
  assert.equal(result.response.analysis.counts.total, 1)
})
test("Processor: erro tardio de leitura antiga não elimina a seleção atual", async () => {
  const process = createImportWorkerProcessor()
  let reject
  const old = process({
    id: 1,
    request: {
      type: "load",
      file: {
        name: "antigo.csv",
        arrayBuffer: () =>
          new Promise((_, fail) => {
            reject = fail
          }),
      },
    },
  })
  const next = await process({ id: 2, request: { type: "load", file: file() } })
  reject(new Error("Falha de leitura"))
  assert.equal(await old, null)
  assert.equal(
    (
      await process({
        id: 3,
        request: {
          type: "validate",
          mapping: autoMapImport(next.response.table.headers),
        },
      })
    ).response.analysis.counts.total,
    1,
  )
})
test("Processor: erros de leitura, arquivo corrompido e operação sem tabela retornam diagnóstico", async () => {
  for (const request of [
    { type: "load", file: file("corrompido.xlsx", "inválido") },
    { type: "validate", mapping: autoMapImport(header.split(",")) },
    { type: "sheet", name: "Dados" },
    {
      type: "load",
      file: {
        name: "erro.csv",
        arrayBuffer: async () => {
          throw new Error("Leitura indisponível")
        },
      },
    },
  ]) {
    const reply = await createImportWorkerProcessor()({ id: 1, request })
    assert.equal(reply.response.type, "error")
    assert.ok(reply.response.message)
  }
})
