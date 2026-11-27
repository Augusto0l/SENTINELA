import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { chromium, devices } from "playwright-core"
import "./contracts-runtime.mjs"
import { withHostedImportEnvironment } from "./hosted-import-browser-environment.mjs"

await withHostedImportEnvironment(async ({ origin, project, actors, sql }) => {
  const { validateTerritory } = await import("../src/data/territorial-validation.ts")
  const { projectLonLat } = await import("../src/components/map/raMapData.ts")
  const output = join("tmp", "marker-evidence-" + process.env.SENTINELA_HTTP_VALIDATION_ID)
  await mkdir(output, { recursive: true })
  const geography = JSON.parse(await readFile(new URL("../public/data/cartography/ras-ide-2026-11-13.geojson", import.meta.url), "utf8"))
  const latitude = -15.7942, longitude = -47.8825
  const projected = projectLonLat(longitude, latitude)
  const { matches } = validateTerritory(geography, latitude, longitude)
  assert.equal(matches.length, 1)
  const [raCode] = matches
  const region = randomUUID()
  const nature = randomUUID()
  await sql(await readFile(new URL("../database/supabase/pendentes/0017_mapa_ocorrencias_manuais.sql", import.meta.url), "utf8"))
  await sql(`INSERT INTO sentinela.regioes_administrativas(id,codigo_interno,nome,versao_catalogo,vigencia,
      limite,versao_cartografia,evidencia_referencia_espacial,referencia_cartografica)
    SELECT CASE WHEN f->'properties'->>'ra_codigo'=$2 THEN $1::uuid ELSE gen_random_uuid() END,
      f->'properties'->>'ra_codigo',f->'properties'->>'ra_nome',
      'SENTINELA_RA_PUBLICO_2026_11_13_V1',daterange(NULL,NULL),
      extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(f->'geometry'),4326)),
      'IDE-DF-2026-11-13','fixture',jsonb_build_object('approvalStatus','approved','administrativeNumber',ordinality,
        'sourceHash','fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553')
    FROM jsonb_array_elements($3::jsonb) WITH ORDINALITY AS t(f,ordinality)`,
    [region, raCode, JSON.stringify(geography.features)])
  await sql("INSERT INTO sentinela.naturezas_criminais(id,fonte,descricao_original) VALUES ($1,'PCDF','FURTO EM COMERCIO')", [nature])
  await sql(`INSERT INTO sentinela_ocorrencias_manual.naturezas_uso_local VALUES ($1,'PCDF-N-01','uso-local-provisorio',
    jsonb_build_object('codigoOficial',NULL,'homologacaoInstitucional','ausente',
    'inventarioSha256',repeat('a',64),'catalogoSha256',repeat('b',64)))`, [nature])

  const browser = await chromium.launch({ channel: "msedge", headless: true })
  const api = "/api/v1/ocorrencias/manuais"
  const body = {
    data: "2025-08-06", horario: "11:23:00", cep: "70070010", endereco: "Endereco de ensaio",
    bairroOuSetor: "Setor de ensaio", raId: region, coordenadas: { latitude, longitude },
    localizacaoConfirmada: true, naturezas: [{ naturezaId: nature, crimeTentado: false }],
    dadosCrime: { descricao: "Registro de homologacao", meio: "outro", vitimas: 0, autores: 0 },
  }

  async function isolate(page) {
    await page.route("**/*", route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin || url.pathname === "/api/ocorrencias/geocode") return route.abort()
      return route.continue()
    })
  }

  const modeButton = (page, name) => page.getByRole("button", { name, exact: true })
  const svg = 'svg:has([data-testid="occurrence-points"])'
  const centered = marker => marker.evaluate(point => {
    const { x, y, width, height } = point.ownerSVGElement.viewBox.baseVal
    return Math.hypot(Number(point.getAttribute("cx")) - (x + width / 2), Number(point.getAttribute("cy")) - (y + height / 2))
  }).then(distance => assert(distance < 0.5, "O ponto deve coincidir com o centro do viewBox."))
  const settled = page => page.waitForFunction(selector => {
    const map = document.querySelector(selector)
    return map && map.dataset.navigating !== "true"
  }, svg)

  async function checkPoint(page, id, benchmark) {
    const marker = page.locator(`[data-testid="occurrence-marker"][data-occurrence="${id}"]`)
    await marker.waitFor()
    assert.equal(await marker.count(), 1)
    assert.equal(await marker.getAttribute("data-selected"), "true")
    assert.equal(await modeButton(page, "Pontos").getAttribute("aria-pressed"), "true")
    const normal = page.locator(`[data-testid="occurrence-marker"][data-occurrence="${benchmark}"]`)
    await normal.waitFor()
    assert.equal(await marker.getAttribute("fill"), await normal.getAttribute("fill"))
    assert.equal(await marker.getAttribute("stroke-width"), await normal.getAttribute("stroke-width"))
    await compareSize(marker, normal)
    return marker
  }

  function markCoordinates(marker) {
    return marker.evaluate(point => [point.getAttribute("cx"), point.getAttribute("cy")].map(Number))
  }

  async function compareSize(marker, normal) {
    const diameter = target => target.evaluate(point => point.getBoundingClientRect().width)
    assert(Math.abs(await diameter(marker) - await diameter(normal)) < 0.2, "Mesmo tamanho do ponto consolidado.")
  }

  async function verifyCamera(page, marker, benchmark) {
    const normal = page.locator(`[data-testid="occurrence-marker"][data-occurrence="${benchmark}"]`)
    const coordinates = await markCoordinates(marker)
    assert(Math.hypot(coordinates[0] - projected.x, coordinates[1] - projected.y) < 1e-8)
    await centered(marker)
    const frameSize = () => page.locator(svg).evaluate(el => el.viewBox.baseVal.width)
    const start = await frameSize()
    await page.getByRole("button", { name: "Aproximar mapa" }).click()
    await settled(page)
    assert(await frameSize() < start)
    await compareSize(marker, normal)
    assert.deepEqual(await markCoordinates(marker), coordinates)
    await page.getByRole("button", { name: "Afastar mapa" }).click()
    await settled(page)
    assert(Math.abs(await frameSize() - start) < 0.1)
    await compareSize(marker, normal)
    if (!await page.evaluate(() => navigator.maxTouchPoints)) {
      const bounds = await page.locator(svg).boundingBox()
      const position = await marker.boundingBox()
      await page.mouse.move(bounds.x + bounds.width * .6, bounds.y + bounds.height * .63)
      await page.mouse.down()
      await page.mouse.move(bounds.x + bounds.width * .6 + 27, bounds.y + bounds.height * .63 + 17, { steps: 5 })
      await page.mouse.up()
      await settled(page)
      assert(Math.abs((await marker.boundingBox()).x - position.x) > 5)
      assert.deepEqual(await markCoordinates(marker), coordinates)
    }
    await page.getByRole("button", { name: "Restaurar enquadramento do mapa" }).click()
    await centered(marker)
    await compareSize(marker, normal)
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
    const benchmark = await request(operator, api, 201, post({ ...body,
      coordenadas: { latitude: latitude + 0.004, longitude: longitude + 0.005 } }))
    assert.deepEqual(await sql(`SELECT jsonb_build_array(
      (SELECT count(*) FROM sentinela.ocorrencias WHERE origem='manual'),
      (SELECT count(*) FROM sentinela.ocorrencia_naturezas WHERE origem='manual'),
      (SELECT count(*) FROM sentinela.eventos_auditoria WHERE acao='ocorrencia.manual.criada'),
      (SELECT count(*) FROM sentinela_ocorrencias_analytics.pontos_confirmados)) AS data`), [2, 2, 2, 0])
    const management = "/api/v1/ocorrencias/gestao"
    process.env.SENTINELA_SUPABASE_OPERATIONAL_WRITE = "1"
    const draft = await request(admin, management + "?view=manuais&id=" + benchmark.id, 200)
    await request(admin, management, 200, post({
      acao: "consolidar_manual", id: benchmark.id, confirmacao: benchmark.id,
      versao: draft.versao, justificativa: "Controle de ocorrencia consolidada em homologacao",
    }))
    process.env.SENTINELA_SUPABASE_OPERATIONAL_WRITE = "0"

    const map = await admin.newPage()
    await isolate(map)
    const analytics = "/api/v1/analytics/persistente"
    const before = await request(admin, analytics, 200)
    assert.deepEqual(before.points.map(p => p.id), [benchmark.id])
    await map.goto(origin + "/ocorrencias/nova")
    for (const [field, value] of Object.entries({
      data: body.data, horario: body.horario, cep: body.cep, endereco: body.endereco,
      bairroOuSetor: body.bairroOuSetor, latitude: String(latitude), longitude: String(longitude),
    })) await map.locator("#manual-" + field).fill(value)
    await map.locator("#manual-regiao").selectOption(raCode)
    await map.getByRole("button", { name: "Confirmar ponto no mapa" }).click()
    await map.getByRole("button", { name: "Continuar", exact: true }).click()
    await map.locator("#manual-nature-0").click()
    await map.getByRole("option", { name: "FURTO EM COMERCIO" }).click()
    await map.locator("#manual-attempt-0").selectOption("consumado")
    await map.locator("#manual-descricao").fill(body.dadosCrime.descricao)
    await map.locator("#manual-meio").selectOption("outro")
    await map.locator("#manual-vitimas").fill("0")
    await map.locator("#manual-autores").fill("0")
    const saved = map.waitForResponse(response => response.url().endsWith(api) && response.request().method() === "POST")
    await map.getByRole("button", { name: "Registrar ocorr\u00eancia" }).click()
    const response = await saved
    assert.equal(response.status(), 201, await response.text())
    const { data: selected } = await response.json()
    assert.equal(selected.situacao, "em_revisao")
    const focused = "/mapa-criminal?ocorrencia=" + selected.id
    await map.getByRole("link", { name: "Ver no mapa" }).click()
    await map.waitForURL(origin + focused)
    const marker = await checkPoint(map, selected.id, benchmark.id)
    await verifyCamera(map, marker, benchmark.id)
    const originalViewport = map.viewportSize()
    await map.setViewportSize({ width: 1100, height: 760 })
    await centered(marker)
    await checkPoint(map, selected.id, benchmark.id)
    await map.setViewportSize(originalViewport)
    await centered(marker)
    await map.screenshot({ path: join(output, "desktop-pontos.png"), animations: "disabled" })
    await map.getByRole("button", { name: "Aproximar mapa" }).click()
    await settled(map)
    await map.screenshot({ path: join(output, "desktop-zoom.png"), animations: "disabled" })

    for (const mode of ["Calor", "Clusters", "Sat\u00e9lite"]) {
      await modeButton(map, mode).click()
      await marker.waitFor({ state: "detached" })
      assert.equal(await modeButton(map, mode).getAttribute("aria-pressed"), "true")
      if (mode === "Sat\u00e9lite") {
        await map.getByTestId("satellite-map").waitFor()
        assert.equal(await marker.count(), 0)
      }
      if (mode === "Calor") await map.screenshot({ path: join(output, "desktop-calor.png"), animations: "disabled" })
    }
    await modeButton(map, "Pontos").click()
    await checkPoint(map, selected.id, benchmark.id)
    await map.reload()
    const reloaded = await checkPoint(map, selected.id, benchmark.id)
    await centered(reloaded)

    const mobile = await browser.newContext({
      ...devices["Pixel 7"], storageState: await admin.storageState(), ignoreHTTPSErrors: true, locale: "pt-BR",
    })
    const phone = await mobile.newPage()
    await isolate(phone)
    await phone.goto(origin + focused)
    const mobileMarker = await checkPoint(phone, selected.id, benchmark.id)
    await verifyCamera(phone, mobileMarker, benchmark.id)
    await phone.screenshot({ path: join(output, "mobile-pontos.png"), animations: "disabled", fullPage: true })
    await modeButton(phone, "Calor").click()
    await mobileMarker.waitFor({ state: "detached" })
    await modeButton(phone, "Pontos").click()
    await checkPoint(phone, selected.id, benchmark.id)

    await map.goto(origin + "/mapa-criminal")
    await modeButton(map, "Pontos").click()
    await map.locator('[data-occurrence="' + benchmark.id + '"]').waitFor()
    assert.equal(await map.locator('[data-occurrence="' + selected.id + '"]').count(), 0)

    const analystMap = await analyst.newPage()
    await isolate(analystMap)
    assert.equal((await analystMap.goto(origin + focused)).status(), 200)
    await modeButton(analystMap, "Pontos").click()
    await analystMap.locator('[data-occurrence="' + benchmark.id + '"]').waitFor()
    assert.equal(await analystMap.locator('[data-occurrence="' + selected.id + '"]').count(), 0)
    assert.deepEqual(await request(admin, analytics, 200), before)
    assert.deepEqual(await sql(`SELECT jsonb_build_array(consolidacao_status,latitude,longitude,
      extensions.ST_Y(geometria),extensions.ST_X(geometria)) AS data FROM sentinela.ocorrencias WHERE id=$1`, [selected.id]),
    ["em_revisao", latitude, longitude, latitude, longitude])

    await map.goto(origin + "/importar")
    await map.getByRole("heading", { name: "Hist\u00f3rico mensal PCDF" }).waitFor()
    assert.equal(typeof (await request(admin, "/api/v1/importacoes/pcdf/direta?modalidade=historico", 200)).canApprove, "boolean")
    await map.goto(origin + "/usuarios")
    await map.getByRole("button", { name: "Novo usu\u00e1rio" }).waitFor()
    assert((await request(admin, "/api/v1/usuarios", 200)).length >= 3)
    console.log("OK cadastro pela interface, marcador em Pontos, centro, zoom, movimento, mobile, recarga, ACL e indicadores.")
    console.log("OK fila PCDF e gestao de usuarios. Evidencias em " + output)
  } finally {
    await browser.close()
  }
}, { operational: true, review: true, users: true })
