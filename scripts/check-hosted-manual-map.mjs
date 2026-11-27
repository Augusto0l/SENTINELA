import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { chromium } from "playwright-core"
import { withHostedImportEnvironment } from "./hosted-import-browser-environment.mjs"

await withHostedImportEnvironment(async ({ origin, project, actors, sql }) => {
  const region = randomUUID()
  const nature = randomUUID()
  await sql(await readFile(new URL("../database/supabase/pendentes/0017_mapa_ocorrencias_manuais.sql", import.meta.url), "utf8"))
  await sql(`INSERT INTO sentinela.regioes_administrativas(id,codigo_interno,nome,versao_catalogo,vigencia,
      limite,versao_cartografia,evidencia_referencia_espacial,referencia_cartografica)
    SELECT CASE WHEN i=1 THEN $1::uuid ELSE gen_random_uuid() END, 'RA-TESTE-'||i,'Territorio de ensaio '||i,
      'SENTINELA_RA_PUBLICO_2026_11_13_V1',daterange(NULL,NULL),
      extensions.ST_Multi(extensions.ST_MakeEnvelope(-47.92+(i-1)*0.1,-15.82,-47.86+(i-1)*0.1,-15.76,4326)),
      'IDE-DF-2026-11-13','fixture',jsonb_build_object('approvalStatus','approved','administrativeNumber',i,
        'sourceHash','fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553')
    FROM generate_series(1,37) i`, [region])
  await sql("INSERT INTO sentinela.naturezas_criminais(id,fonte,descricao_original) VALUES ($1,'PCDF','FURTO EM COMERCIO')", [nature])
  await sql(`INSERT INTO sentinela_ocorrencias_manual.naturezas_uso_local VALUES ($1,'PCDF-N-01','uso-local-provisorio',
    jsonb_build_object('codigoOficial',NULL,'homologacaoInstitucional','ausente',
    'inventarioSha256',repeat('a',64),'catalogoSha256',repeat('b',64)))`, [nature])

  const browser = await chromium.launch({ channel: "msedge", headless: true })
  const api = "/api/v1/ocorrencias/manuais"
  const body = {
    data: "2025-08-06", horario: "11:23:00", cep: "70070010", endereco: "Endereco de ensaio",
    bairroOuSetor: "Setor de ensaio", raId: region, coordenadas: { latitude: -15.7942, longitude: -47.8825 },
    localizacaoConfirmada: true, naturezas: [{ naturezaId: nature, crimeTentado: false }],
    dadosCrime: { descricao: "Registro de homologacao", meio: "outro", vitimas: 0, autores: 0 },
  }
  try {
    const contexts = await Promise.all(actors.map(async actor => {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: "pt-BR" })
      const response = await context.request.post(origin + "/auth/login", { headers: { Origin: origin },
        form: { email: actor.email, password: actor.password }, maxRedirects: 0 })
      assert.equal(response.status(), 303)
      return context
    }))
    const [admin, operator, analyst] = contexts
    const anonymous = await browser.newContext({ ignoreHTTPSErrors: true })
    async function request(context, path, status, options = {}) {
      const response = await context.request.fetch(origin + path, options)
      assert.equal(response.status(), status, path + " " + await response.text())
      return (await response.json()).data
    }
    const post = (data, key = randomUUID(), requestOrigin = origin) => ({
      method: "POST", data, headers: { Origin: requestOrigin, "Idempotency-Key": key },
    })
    process.env.SENTINELA_SUPABASE_OPERATIONAL_WRITE = "0"
    process.env.SENTINELA_SUPABASE_MANUAL_WRITE = "0"
    assert.equal((await request(admin, api, 200)).cadastroDisponivel, false)
    await request(admin, api, 503, post(body))

    process.env.SENTINELA_SUPABASE_MANUAL_WRITE = "1"
    assert.equal((await request(admin, api, 200)).cadastroDisponivel, false)
    await request(admin, api, 403, post(body))

    await sql(`INSERT INTO sentinela_ocorrencias_manual.liberacao VALUES
      (true,5432,sentinela_ambiente.instalacao(),sentinela_ambiente.sistema(),$1,true)`, [project])
    assert.equal((await request(admin, api, 200)).cadastroDisponivel, true)
    assert.equal((await request(operator, api, 200)).cadastroDisponivel, true)
    await request(analyst, api, 403, post(body))
    await request(anonymous, api, 401, post(body))
    await request(admin, api, 403, post(body, randomUUID(), "https://other.example"))
    await request(admin, api, 422, post({ ...body, localizacaoConfirmada: false }))
    await request(admin, api, 422, post({ ...body, coordenadas: { latitude: -16, longitude: -48 } }))
    const key = randomUUID()
    const create = await request(admin, api, 201, post(body, key))
    assert.equal(create.situacao, "em_revisao")
    assert.deepEqual(await request(admin, api, 201, post(body, key)), create)
    await request(admin, api, 409, post({ ...body, dadosCrime: { ...body.dadosCrime, vitimas: 1 } }, key))
    await request(operator, api, 201, post(body))
    assert.deepEqual(await sql(`SELECT jsonb_build_array(
      (SELECT count(*) FROM sentinela.ocorrencias WHERE origem='manual'),
      (SELECT count(*) FROM sentinela.ocorrencia_naturezas WHERE origem='manual'),
      (SELECT count(*) FROM sentinela.eventos_auditoria WHERE acao='ocorrencia.manual.criada'),
      (SELECT count(*) FROM sentinela_ocorrencias_analytics.pontos_confirmados)) AS data`), [2, 2, 2, 0])
    const map = await admin.newPage()
    await map.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
    const focused = "/mapa-criminal?ocorrencia=" + create.id
    const marker = map.locator(`[data-testid="manual-map-marker"][data-occurrence="${create.id}"]`)
    await map.goto(origin + focused)
    await marker.waitFor({ state: "visible", timeout: 40000 })
    await map.reload()
    await marker.waitFor({ state: "visible", timeout: 40000 })
    const analystMap = await analyst.newPage()
    await analystMap.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
    assert.equal((await analystMap.goto(origin + focused)).status(), 200)
    await analystMap.getByRole("heading", { name: "Mapa Criminal", exact: true }).first().waitFor()
    assert.equal(await analystMap.getByTestId("manual-map-marker").count(), 0)
    assert.equal((await request(admin, "/api/v1/analytics/persistente?scope=pcdf", 200)).points.length, 0)
    console.log("Cadastro manual persistido e auditado, reenvio idempotente, marcador apos recarga e indicadores preservados.")
  } finally {
    await browser.close()
  }
}, { operational: true, review: true })
