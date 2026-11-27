import "./contracts-runtime.mjs"
import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { chromium } from "playwright-core"
import { fixture } from "../tests/fixtures/pcdf-v2-package.mjs"
import { withHostedImportEnvironment } from "./hosted-import-browser-environment.mjs"

const central = "/api/v1/central-revisao"
const general = "/api/v1/importacoes/geral"
const resolve = { decisao: "resolvida", versaoEsperada: "1", justificativa: "Correção sintética no ensaio", valor: "11:34:00" }
const close = { decisao: "encerrada_sem_solucao", versaoEsperada: "1", justificativa: "Sem evidência suficiente no ensaio" }

await withHostedImportEnvironment(async ({ origin, actors, sql, withActor }) => {
  const browser = await chromium.launch({ channel: "msedge", headless: true })
  try {
    const sessions = await Promise.all(actors.map(async ({ email, password }, index) => {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: "pt-BR",
        viewport: { width: index === 2 ? 390 : 1440, height: 900 } })
      await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
      const response = await context.request.post(origin + "/auth/login", { form: { email, password },
        headers: { Origin: origin }, maxRedirects: 0 })
      assert.equal(response.status(), 303)
      assert.equal(new URL(response.headers().location, origin).pathname, "/dashboard")
      return context
    }))
    const [admin, operator, analyst] = sessions.map(context => context.request)
    const result = async (response, status) => {
      const value = await response.json()
      assert.equal(response.status(), status, JSON.stringify(value))
      return value.data
    }
    const list = async (client, params = "", status = 200) => result(await client.get(origin + central + "?pagina=1" + params), status)
    const patch = (client, id, data, site = origin) =>
      client.patch(origin + central + "/" + id, { headers: { Origin: site }, data })

    const selection = { name: "central-ensaio.csv", sheet: "CSV", mapping: {
      data: 0, horario: 1, naturezas: 2, ra: 3, local: 4, latitude: -1, longitude: -1,
    } }
    const csv = "Data;Hora;Tipo de crime;Região Administrativa;Local\r\n2025-08-06;inválido;FURTO EM COMERCIO;Plano Piloto;x"
    const receipt = await result(await operator.post(origin + general, { data: csv, headers: {
      Origin: origin, "content-type": "text/csv", "idempotency-key": randomUUID(),
      "x-sentinela-import": encodeURIComponent(JSON.stringify(selection)),
    } }), 201)
    const pcdf = fixture(({ rows }) => {
      for (const row of rows) row.data = row.data.replace("2021-01", "2021-02")
      rows[0].horario = ""
      rows[0].flagrante = "NÃO INFORMADO"
    }).csv
    const bytes = Buffer.from(await pcdf.arrayBuffer())
    await result(await admin.post(origin + "/api/v1/importacoes/pcdf/direta?etapa=confirmar&versao=2.0&modalidade=csv", {
      headers: { Origin: origin }, multipart: { csv: { name: "pcdf_naturezas_2021-02.csv", mimeType: "text/csv", buffer: bytes },
        sha256: createHash("sha256").update(bytes).digest("hex") },
    }), 201)
    const manual = randomUUID()
    await sql(`INSERT INTO sentinela.ocorrencias(id,origem,fonte,versao_identidade,identidade_status)
      VALUES ($1,'manual','SENTINELA_MANUAL','fixture','manual')`, [manual])
    await sql(`INSERT INTO sentinela.pendencias_revisao(ocorrencia_id,campo,regra,versao_regra,motivo,tipo,prioridade,efeito)
      VALUES ($1,'local','fixture','fixture','Local ausente no ensaio','endereco_ra','media','bloqueia_consolidacao')`, [manual])

    const state = () => sql(`SELECT jsonb_build_object('pending',
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM sentinela.pendencias_revisao p),
      'staging',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM sentinela.linhas_staging s),
      'history',(SELECT count(*) FROM sentinela.historico_correcoes),
      'events',(SELECT count(*) FROM sentinela.eventos_auditoria)) AS data`)
    const originals = () => sql(`SELECT jsonb_build_object(
      'lines',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM sentinela.linhas_origem o),
      'snapshot',(SELECT jsonb_agg(jsonb_build_array(id,campos_csv,diagnosticos,estado) ORDER BY id)
        FROM sentinela.linhas_staging)) AS data`)
    const before = await originals()
    const pending = await list(admin, "&status=aberta")
    assert.deepEqual(await list(operator, "&status=aberta"), pending)
    assert.deepEqual(await list(analyst, "&status=aberta"), pending)
    assert.equal((await list(admin, "&limite=1")).hasMore, true)
    await list(admin, "&origem=pcdf&origem=geral", 400)
    const manualIssues = (await list(admin, "&origem=manual")).items
    assert.equal(manualIssues.length, 1)
    assert.equal(manualIssues[0].occurrenceId, manual)
    assert.equal(manualIssues[0].canResolve, false)
    const generalIssue = (await list(admin, "&origem=geral&tipo=datas_horarios")).items.find(issue => issue.field === "horario")
    assert.equal(generalIssue?.canResolve, true)
    assert.equal(generalIssue.lotId, receipt.lot)
    assert.equal(generalIssue.original, "inválido")
    const pcdfIssues = (await list(admin, "&origem=pcdf")).items
    const flag = pcdfIssues.find(issue => issue.field === "flagrante")
    const time = pcdfIssues.find(issue => issue.field === "horario")
    const other = pcdfIssues.find(issue => !issue.canResolve)
    assert(flag?.canResolve && time?.canResolve && other)
    await result(await patch(operator, generalIssue.id, resolve), 403)
    await result(await patch(analyst, generalIssue.id, resolve), 403)
    await result(await patch(admin, generalIssue.id, resolve, "https://other.example"), 403)
    await result(await patch(admin, other.id, resolve), 422)
    await result(await patch(admin, time.id, { ...resolve, valor: "30:11:00" }), 422)
    await withActor(actors[1], async client => {
      await assert.rejects(client.query("SELECT sentinela_revisao.decidir($1,1,'encerrada_sem_solucao',NULL,'Negar')", [generalIssue.id]),
        { code: "42501" })
    })
    await withActor(actors[0], async client => {
      await assert.rejects(client.query("UPDATE sentinela.pendencias_revisao SET status='resolvida' WHERE id=$1", [generalIssue.id]),
        { code: "42501" })
    })
    await withActor(actors[0], async client => {
      await client.query("SELECT set_config('sentinela.import_session',$1,true)", [actors[1].session])
      await assert.rejects(client.query("SELECT sentinela_revisao.fila(NULL,NULL,NULL,NULL,NULL,'prioridade',1,25)"),
        { code: "42501" })
    })
    await withActor(actors[0], async client => {
      const { rows: [probe] } = await client.query("SELECT sentinela_revisao.decidir($1,1,'resolvida',$2,$3) AS data",
        [generalIssue.id, resolve.valor, resolve.justificativa])
      assert.equal(probe.data.normalized, resolve.valor)
    })
    assert.equal((await list(admin, "&origem=geral&status=resolvida")).items.length, 0)

    const page = await sessions[0].newPage()
    const navigation = await page.goto(origin + "/central-revisao")
    assert.equal(navigation?.status(), 200, page.url())
    await page.getByRole("combobox", { name: /^Origem/ }).selectOption("geral")
    await page.getByRole("combobox", { name: /^Tipo/ }).selectOption("datas_horarios")
    await page.getByRole("button", { name: "Aplicar filtros" }).click()
    await page.getByRole("heading", { name: "Datas e horários · horario" }).waitFor()
    await page.getByRole("button", { name: "Detalhar horario" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Novo valor").fill(resolve.valor)
    await dialog.getByLabel("Justificativa").fill(resolve.justificativa)
    await dialog.getByRole("button", { name: "Confirmar decisão" }).click()
    await dialog.getByText("Decisão registrada no histórico.").waitFor()
    await dialog.getByText("Histórico", { exact: true }).waitFor()
    await page.reload()
    const corrected = (await list(analyst, "&origem=geral&status=resolvida")).items.find(row => row.id === generalIssue.id)
    assert.equal(corrected?.normalized, resolve.valor)
    assert.equal(corrected.original, generalIssue.original)
    assert.equal(corrected.history.author, actors[0].id)
    assert.equal(corrected.history.after, resolve.valor)
    assert.equal(corrected.version, "2")
    await result(await patch(admin, generalIssue.id, resolve), 409)
    const location = (await list(admin, "&origem=geral&tipo=endereco_ra")).items.find(row => row.field === "local")
    assert.equal(location?.canResolve, true)
    await result(await patch(admin, location.id, { ...resolve, valor: "Rua" }), 422)
    const renamed = await result(await patch(admin, location.id, { ...resolve, valor: "Local sintético corrigido" }), 200)
    assert.equal(renamed.normalized, "Local sintético corrigido")
    assert.equal(renamed.original, "x")

    const mobile = await sessions[2].newPage()
    await mobile.goto(origin + "/central-revisao")
    await mobile.getByRole("combobox", { name: /^Origem/ }).selectOption("pcdf")
    await mobile.getByRole("button", { name: "Aplicar filtros" }).click()
    await mobile.getByRole("button", { name: "Detalhar flagrante" }).click()
    assert.equal(await mobile.getByRole("button", { name: "Confirmar decisão" }).count(), 0)

    const race = await Promise.all([patch(admin, flag.id, { ...resolve, valor: "false" }),
      patch(admin, flag.id, { ...resolve, valor: "true" })])
    assert.deepEqual(race.map(response => response.status()).sort(), [200, 409])
    const winner = await result(race.find(response => response.status() === 200), 200)
    assert.equal(winner.history.after, winner.normalized)
    const closed = await result(await patch(admin, other.id, close), 200)
    assert.equal(closed.status, "encerrada_sem_solucao")
    assert.equal(closed.history.reason, close.justificativa)
    assert.equal(closed.original, other.original)
    assert.deepEqual((await list(analyst)).counts,
      { active: pending.counts.active - 4, resolved: 3, closed: 1 })
    assert.deepEqual(await originals(), before)

    const persisted = await state()
    await sql(`CREATE FUNCTION public.reject_review_event() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic failure after decision'; END $$`)
    await sql(`CREATE TRIGGER reject_review_event BEFORE INSERT ON sentinela.eventos_auditoria
      FOR EACH ROW WHEN (NEW.acao='pendencia.revisada') EXECUTE FUNCTION public.reject_review_event()`)
    await result(await patch(admin, time.id, resolve), 503)
    assert.deepEqual(await state(), persisted)
    await sql("DROP TRIGGER reject_review_event ON sentinela.eventos_auditoria")
    process.env.SENTINELA_SUPABASE_OPERATIONAL_WRITE = "0"
    await result(await patch(admin, time.id, resolve), 403)
    await list(admin)
    process.env.SENTINELA_SUPABASE_OPERATIONAL_WRITE = "1"
    assert.equal((await result(await patch(admin, time.id, resolve), 200)).normalized, resolve.valor)
    assert.deepEqual(await originals(), before)
    await sql("DELETE FROM auth.sessions WHERE id=$1", [actors[2].session])
    await list(analyst, "", 401)
    console.log("OK Central Edge 1440/390, origens Geral, PCDF e Manual, 3 perfis, correções, auditoria, concorrência e rollback")
  } finally {
    await browser.close()
  }
}, { operational: true, review: true }).catch(error => {
  console.error(error)
  process.exitCode = 1
})
