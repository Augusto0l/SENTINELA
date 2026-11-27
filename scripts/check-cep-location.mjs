// Integration check: requires a running local server and access to ViaCEP/Nominatim.
import assert from "node:assert/strict"
import { chromium } from "playwright-core"
import { mkdir, writeFile } from "node:fs/promises"
import { postalAddressFrom } from "../src/data/addressLocation.ts"

const base = process.env.SENTINELA_TEST_URL ?? "http://127.0.0.1:3000"
const samples = new Map()
const fixtures = process.argv.includes("--fixtures")
if (fixtures) {
  for (const [index, cep] of ["73081140", "70790075", "70390100"].entries()) {
    samples.set(cep, {
      postal: {
        uf: "DF",
        localidade: "Brasília",
        logradouro: `Quadra de homologação ${index + 1}`,
        bairro: "Setor demonstrativo",
        cep,
      },
      data: {
        results: [
          {
            id: `homologacao-${index}`,
            label: `Referência sintética de teste ${index + 1}`,
            latitude: -15.79 + index * 0.005,
            longitude: -47.88,
            approximate: true,
          },
        ],
      },
    })
  }
  samples.set("00000000", { postal: { erro: true } })
  console.log(
    "FIXTURES: validação determinística da interface, sem comprovar serviços externos",
  )
}
if (!fixtures) {
  for (const cep of ["73081140", "70790075", "70390100", "00000000"]) {
    const postal = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: AbortSignal.timeout(10000),
    }).then((response) => response.json())
    if (postal.erro) {
      samples.set(cep, { postal })
      continue
    }
    const address = postalAddressFrom(postal)
    const params = new URLSearchParams({
      q: address.query,
      cep,
      street: address.street,
      district: address.district,
    })
    const response = await fetch(`${base}/api/ocorrencias/geocode?${params}`)
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.ok(data.results.length > 0, `Sem referência geográfica para ${cep}`)
    assert.ok(data.results.every((result) => result.approximate))
    samples.set(cep, { postal, data })
    console.log(
      `PASS serviços reais: ${cep}, ${data.results.length} referência(s) aproximada(s)`,
    )
    await new Promise((resolve) => setTimeout(resolve, 1200))
  }
}
let addressData = samples.get("73081140")?.data
if (!fixtures) {
  const addressResponse = await fetch(
    `${base}/api/ocorrencias/geocode?${new URLSearchParams({ q: "SQN 210, Distrito Federal, Brasil" })}`,
  )
  assert.equal(addressResponse.status, 200)
  addressData = await addressResponse.json()
}
assert.ok(addressData.results.length > 0)
console.log(
  fixtures
    ? "FIXTURES: referência por endereço definida"
    : "PASS geocodificação real por endereço",
)

const browser = await chromium.launch({ channel: "chrome", headless: true })
try {
  const page = await browser.newPage()
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort())
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort())
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  // Replay real samples, or explicitly selected synthetic fixtures; fixtures do not validate providers.
  await page.route("https://viacep.com.br/ws/**", async (route) => {
    const cep = route
      .request()
      .url()
      .match(/ws\/(\d+)/)[1]
    await route.fulfill({ json: samples.get(cep)?.postal ?? { erro: true } })
  })
  let mode = "success"
  let release
  await page.route("**/api/ocorrencias/geocode?**", async (route) => {
    const params = new URL(route.request().url()).searchParams
    if (mode === "delayed")
      await new Promise((resolve) => {
        release = resolve
      })
    if (mode === "failure")
      return route.fulfill({
        status: 503,
        json: { error: "Serviço de localização indisponível." },
      })
    await route.fulfill({
      json:
        mode === "empty"
          ? { results: [] }
          : (samples.get(params.get("cep"))?.data ?? addressData),
    })
  })
  await page.goto(`${base}/ocorrencias/nova`)
  const search = page.locator(".address-location-search")
  const button = search.getByRole("button", {
    name: "Buscar localização",
    exact: true,
  })
  const lat = page.locator("#occ-latitude")
  const lon = page.locator("#occ-longitude")
  const coordinates = async () => [
    await lat.inputValue(),
    await lon.inputValue(),
  ]
  await lat.fill("-15.790000")
  await lon.fill("-47.880000")
  await page.locator(".leaflet-container").waitFor()
  const initial = await coordinates()

  for (const cep of ["73081140", "70790-075", "70390100"]) {
    await page.locator("#occ-cep").fill(cep)
    await search.getByText(/CEP consultado/).waitFor()
    await button.click()
    const options = search
      .getByRole("list", { name: "Resultados de localização" })
      .getByRole("button")
    await options.first().waitFor()
    assert.match(await options.first().innerText(), /Referência aproximada/)
    assert.deepEqual(await coordinates(), initial)
    const expected = samples.get(cep.replace("-", "")).data.results[0]
    await options.first().click()
    await page.waitForFunction(
      (latitude) => document.querySelector("#occ-latitude").value === latitude,
      expected.latitude.toFixed(6),
    )
    assert.deepEqual(await coordinates(), [
      expected.latitude.toFixed(6),
      expected.longitude.toFixed(6),
    ])
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".leaflet-tile")].some((tile) =>
        /\/16\//.test(tile.src),
      ),
    )
    const marker = page.locator(".leaflet-marker-icon")
    const markerBox = await marker.boundingBox()
    const mapBox = await page.locator(".leaflet-container").boundingBox()
    assert.ok(Math.abs(markerBox.x + 14 - (mapBox.x + mapBox.width / 2)) < 3)
    assert.ok(Math.abs(markerBox.y + 14 - (mapBox.y + mapBox.height / 2)) < 3)
    await marker.hover()
    await page.mouse.down()
    await page.mouse.move(markerBox.x + 60, markerBox.y + 45, { steps: 6 })
    await page.mouse.up()
    assert.notDeepEqual(await coordinates(), [
      expected.latitude.toFixed(6),
      expected.longitude.toFixed(6),
    ])
    console.log(
      `PASS navegador: ${cep}, opção clicável, centralização, zoom 16, coordenadas e arraste`,
    )
    await lat.fill(initial[0])
    await lon.fill(initial[1])
  }
  await page.locator("#occ-cep").fill("73081")
  await search.getByText(/CEP incompleto/).waitFor()
  assert.deepEqual(await coordinates(), initial)
  await page.locator("#occ-cep").fill("00000000")
  await search.getByText(/CEP não encontrado/).waitFor()
  assert.deepEqual(await coordinates(), initial)

  await page.locator("#occ-cep").fill("73081140")
  await search.getByText(/CEP consultado/).waitFor()
  mode = "empty"
  await button.click()
  await search.getByText(/Endereço postal encontrado, mas/).waitFor()
  assert.deepEqual(await coordinates(), initial)
  mode = "failure"
  await button.click()
  await search
    .getByText("Serviço de localização indisponível.", { exact: true })
    .waitFor()
  assert.deepEqual(await coordinates(), initial)

  mode = "delayed"
  await button.click()
  await page.waitForTimeout(200)
  assert.ok(release)
  await lat.fill("-15.780000")
  release()
  await search.getByText(/ajuste manual foi preservado/).waitFor()
  assert.equal(await lat.inputValue(), "-15.780000")
  console.log(
    "PASS CEP incompleto/inexistente, respostas vazias, falha e ajuste durante busca preservam coordenadas",
  )

  mode = "success"
  await page.locator("#occ-local").fill("SQN 210, Distrito Federal, Brasil")
  await page.waitForTimeout(800)
  await button.click()
  const options = search
    .getByRole("list", { name: "Resultados de localização" })
    .getByRole("button")
  await options.first().waitFor()
  await options.first().click()
  await page.waitForFunction(
    (latitude) => document.querySelector("#occ-latitude").value === latitude,
    addressData.results[0].latitude.toFixed(6),
  )
  assert.equal(
    await lon.inputValue(),
    addressData.results[0].longitude.toFixed(6),
  )
  assert.deepEqual(errors, [])
  console.log(
    "PASS navegador: busca por endereço preservada; nenhum erro JavaScript",
  )
  await mkdir("tmp/location-evidence", { recursive: true })
  await writeFile(
    `tmp/location-evidence/${fixtures ? "fixtures" : "live"}-results.json`,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        base,
        browser: browser.version(),
        mode: fixtures ? "synthetic-ui-fixtures" : "live-services",
        errors,
        checks: [
          "CEP completo/incompleto/inexistente",
          "resposta vazia e falha preservam coordenadas",
          "ajuste manual durante busca preservado",
          "seleção de referência exige ação explícita",
          "busca por endereço",
        ],
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
