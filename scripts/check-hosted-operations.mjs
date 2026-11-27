import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { chromium } from "playwright-core"
import { withHostedImportEnvironment } from "./hosted-import-browser-environment.mjs"

const manual = "/api/v1/ocorrencias/manuais"
const query = "/api/v1/ocorrencias/consulta"
const management = "/api/v1/ocorrencias/gestao"
const users = "/api/v1/usuarios"
const analytics = "/api/v1/analytics/persistente?scope=pcdf"

await withHostedImportEnvironment(async ({ origin, project, actors, sql, withActor, failNextAuthDeletion }) => {
  const browser = await chromium.launch({ channel: "msedge", headless: true })
  const ra = randomUUID()
  const nature = randomUUID()
  try {
    await sql(`INSERT INTO sentinela.regioes_administrativas(id,codigo_interno,nome,versao_catalogo,vigencia,
      limite,versao_cartografia,evidencia_referencia_espacial,referencia_cartografica)
      SELECT CASE WHEN i=1 THEN $1::uuid ELSE gen_random_uuid() END, 'RA-TESTE-'||i,'Território sintético '||i,
        'SENTINELA_RA_PUBLICO_2026_11_13_V1',daterange(NULL,NULL),
        extensions.ST_Multi(extensions.ST_MakeEnvelope(-47.92+(i-1)*0.1,-15.82,-47.86+(i-1)*0.1,-15.76,4326)),
        'IDE-DF-2026-11-13','fixture',jsonb_build_object('approvalStatus','approved','administrativeNumber',i,
          'sourceHash','fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553')
      FROM generate_series(1,37) i`, [ra])
    await sql(`INSERT INTO sentinela.naturezas_criminais(id,fonte,descricao_original)
      VALUES ($1,'PCDF','FURTO EM COMERCIO')`, [nature])
    await sql(`INSERT INTO sentinela_ocorrencias_manual.naturezas_uso_local VALUES ($1,'PCDF-N-01','uso-local-provisorio',
      jsonb_build_object('codigoOficial',NULL,'homologacaoInstitucional','ausente',
        'inventarioSha256',repeat('a',64),'catalogoSha256',repeat('b',64)))`, [nature])
    await sql(`INSERT INTO sentinela_ocorrencias_manual.liberacao
      VALUES (true,5432,sentinela_ambiente.instalacao(),sentinela_ambiente.sistema(),$1,true)`, [project])
    const tls = await sql("SELECT jsonb_build_array(current_setting('server_version'),extensions.postgis_lib_version()) AS data")
    const [adminContext, operatorContext, analystContext] = await Promise.all(actors.map(async actor => {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: "pt-BR" })
      await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
      const response = await context.request.post(origin + "/auth/login", { headers: { Origin: origin },
        form: { email: actor.email, password: actor.password }, maxRedirects: 0 })
      assert.equal(response.status(), 303, await response.text())
      assert.equal(new URL(response.headers().location, origin).pathname, "/dashboard")
      return context
    }))
    const [admin, operator, analyst] = [adminContext, operatorContext, analystContext].map(context => context.request)
    async function call(client, path, status = 200, options = {}) {
      const result = await client.fetch(origin + path, { maxRedirects: 0, ...options })
      assert.equal(result.status(), status, `${options.method ?? "GET"} ${path}: ${await result.text()}`)
      return status === 204 ? undefined : (await result.json()).data
    }
    const write = (method, data, headers = {}) => ({ method, data, headers: { Origin: origin, ...headers } })
    await Promise.all([admin, operator, analyst].map(async client => {
      assert.equal((await call(client, analytics)).points.length, 0)
      await call(client, query + "?view=resumo")
    }))
    const page = await analystContext.newPage()
    await page.goto(origin + "/dashboard")
    await page.getByText("Sem dados disponíveis para o período selecionado.", { exact: true }).waitFor()
    const maps = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/analytics/persistente")
    await page.goto(origin + "/mapa-criminal")
    assert.equal((await maps).status(), 200)
    await page.goto(origin + "/ocorrencias")
    assert.equal(new URL(page.url()).pathname, "/ocorrencias")
    await Promise.all([
      call(operator, users, 403), call(analyst, users, 403), call(analyst, manual, 403),
      call(analyst, query + "?view=importados", 403), call(analyst, "/api/v1/importacoes/geral", 403),
      call(admin, "/api/v1/importacoes/geral"), call(operator, "/api/v1/importacoes/geral"),
    ])
    console.log("OK Dashboard, Mapa e consulta com três perfis, listagens restritas e PostgreSQL " + tls.join(" / PostGIS "))

    const payload = {
      data: "2025-08-06", horario: "11:23:00", cep: "70070010", endereco: "Endereço de ensaio",
      bairroOuSetor: "Setor sintético", raId: ra, coordenadas: { latitude: -15.7942, longitude: -47.8825 },
      localizacaoConfirmada: true, naturezas: [{ naturezaId: nature, crimeTentado: false }],
      dadosCrime: { descricao: "Registro sintético", meio: "outro", vitimas: 0, autores: 0 },
    }
    const key = randomUUID()
    const operatorAccount = createHash("sha256").update(JSON.stringify(["sentinela-supabase", project, actors[1].authId])).digest("hex")
    await withActor(actors[1], async client => {
      assert.equal((await client.query("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()")).rows[0].ssl, true)
      await client.query("SELECT sentinela_ocorrencias_manual.cadastrar_completo($1,$2,$3,$4)",
        [payload, randomUUID(), operatorAccount, actors[1].id])
    })
    const post = (data = payload, idempotencyKey = key, headers = {}) =>
      write("POST", data, { "Idempotency-Key": idempotencyKey, ...headers })
    const catalog = await call(operator, manual)
    assert.equal(catalog.regioes.length, 37)
    assert.equal(catalog.naturezas[0].id, nature)
    assert.equal(catalog.cadastroDisponivel, true)
    await call(operator, manual, 403, post(payload, key, { Origin: "https://other.example" }))
    await call(analyst, manual, 403, post())
    const records = await Promise.all([call(operator, manual, 201, post()), call(operator, manual, 201, post())])
    const [{ id }] = records
    assert.equal(records[1].id, id)
    await call(operator, manual, 409, post({ ...payload, numero: "9" }))
    const detail = `${query}?view=detalhe&area=manuais&id=${id}`
    assert.equal((await call(analyst, detail)).endereco.endereco, payload.endereco)
    const context = await call(operator, management + "?view=manuais&id=" + id)
    const target = { id, confirmacao: id, justificativa: "Ensaio sintético", versao: context.versao }
    const edit = { ...target, acao: "editar_manual", dados: { ...payload, endereco: "Endereço editado" } }
    await withActor(actors[1], async client => {
      await client.query("SELECT sentinela_ocorrencias_manual.editar($1,$2,$3)", [edit, operatorAccount, actors[1].id])
      await client.query("SET CONSTRAINTS ALL IMMEDIATE")
    })
    const updated = await call(operator, management, 200, write("POST", edit))
    assert.equal((await call(analyst, detail)).endereco.endereco, edit.dados.endereco)
    await call(operator, management, 409, write("POST", edit))
    const auditActor = await sql("SELECT usuario_id AS data FROM sentinela.eventos_auditoria WHERE id=$1", [updated.auditoria])
    assert.equal(auditActor, actors[1].id)
    const next = await call(admin, management + "?view=manuais&id=" + id)
    const publication = { ...target, acao: "consolidar_manual", versao: next.versao }
    await call(operator, management, 403, write("POST", publication))
    await call(admin, management, 200, write("POST", publication))
    assert.equal((await call(analyst, analytics)).points.some(point => point.id === id), true)
    assert.equal((await call(analyst, `${query}?view=detalhe&area=consolidadas&id=${id}`)).id, id)
    await sql(`CREATE FUNCTION public.fixture_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Falha sintética depois da gravação'; END $$`)
    await sql(`CREATE TRIGGER fixture_reject_audit BEFORE INSERT ON sentinela.eventos_auditoria
        FOR EACH ROW WHEN (NEW.acao='ocorrencia.manual.criada') EXECUTE FUNCTION public.fixture_reject_audit()`)
    const count = await sql("SELECT count(*)::int AS data FROM sentinela.ocorrencias")
    await call(operator, manual, 503, post(payload, randomUUID()))
    assert.equal(await sql("SELECT count(*)::int AS data FROM sentinela.ocorrencias"), count)
    await sql("DROP TRIGGER fixture_reject_audit ON sentinela.eventos_auditoria")
    console.log("OK cadastro, idempotência, edição auditada, publicação restrita, ponto no mapa e rollback")

    const list = await call(admin, users)
    assert.deepEqual(new Set(list.map(record => record.id)), new Set(actors.map(actor => actor.id)))
    const operatorRecord = list.find(record => record.id === actors[1].id)
    const change = { id: operatorRecord.id, version: operatorRecord.version, name: "Operador de ensaio", email: "", orgao: "Ensaio" }
    assert.equal((await call(admin, users, 200, write("PATCH", change))).name, change.name)
    await call(admin, users, 409, write("PATCH", change))
    const account = { name: "Conta provisória de ensaio", email: "ensaio.sentinela.synthetic@gmail.com", perfil: "Analista",
      orgao: "Ensaio", password: "Senha-Sintetica-7632!" }
    const created = await call(admin, users, 201, write("POST", account))
    assert.equal(created.ativo, true)
    assert.equal(await sql("SELECT raw_app_meta_data->>'sentinela_onboarding' AS data FROM auth.users WHERE id=$1", [created.id]), "password")
    assert.equal((await call(admin, users + "?exclusao=" + created.id)).email, account.email)
    const deletion = write("DELETE", { id: created.id, email: account.email })
    failNextAuthDeletion()
    await call(admin, users, 503, deletion)
    assert.equal((await call(admin, users)).find(record => record.id === created.id).deletionPending, true)
    await call(admin, users, 204, deletion)
    assert.equal(await sql("SELECT count(*)::int AS data FROM auth.users WHERE id=$1", [created.id]), 0)
    assert.equal(await sql("SELECT count(*)::int AS data FROM sentinela.usuarios WHERE id=$1 AND NOT ativo AND auth_user_id IS NULL", [created.id]), 1)
    console.log("OK usuários, cadastro com primeiro acesso e recuperação da exclusão com Auth simulado")

    process.env.SENTINELA_SUPABASE_OPERATIONAL_WRITE = "0"
    assert.equal((await call(operator, manual)).cadastroDisponivel, false)
    await call(operator, manual, 403, post(payload, randomUUID()))
    await call(admin, users, 403, write("PATCH", change))
    await call(admin, users)
    const ca = process.env.SENTINELA_SUPABASE_IMPORT_CA
    process.env.SENTINELA_SUPABASE_IMPORT_CA = "invalid fixture certificate"
    await call(analyst, analytics, 503)
    process.env.SENTINELA_SUPABASE_IMPORT_CA = ca
    const installation = process.env.SENTINELA_SUPABASE_IMPORT_INSTALLATION
    process.env.SENTINELA_SUPABASE_IMPORT_INSTALLATION = randomUUID()
    await call(analyst, analytics, 503)
    process.env.SENTINELA_SUPABASE_IMPORT_INSTALLATION = installation
    await sql("DELETE FROM auth.sessions WHERE id=$1", [actors[2].session])
    await call(analyst, query + "?view=resumo", 401)
    console.log("OK recusa de CA inválida, instalação divergente, sessão revogada e escritas sem liberação")
  } finally {
    await browser.close()
  }
}, { operational: true }).catch(error => {
  console.error(error)
  process.exitCode = 1
})
