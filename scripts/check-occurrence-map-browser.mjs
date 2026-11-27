import assert from 'node:assert/strict'

// Runs against synthetic identities. Tiles and CEP are mocked by the caller;
// live basemap verification, when explicitly requested, is limited to one tile.
export async function checkOccurrenceMap(page, origin) {
  const response = await page.goto(`${origin}/ocorrencias/nova?verificacao=nao-enviar`)
  assert.equal(response.headers()['referrer-policy'], 'no-referrer')
  const map = page.getByRole('region', { name: 'Mapa de ajuste da localização' }).locator('.leaflet-container')
  await map.waitFor()
  await map.locator('img.leaflet-tile-loaded').first().waitFor()
  assert.equal(await map.locator('.leaflet-control-attribution').getByRole('link', { name: 'OpenStreetMap', exact: true }).isVisible(), true)
  assert.equal(await map.locator('img.leaflet-tile').first().getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin')
  const lat = page.locator('#occ-latitude'), lon = page.locator('#occ-longitude')
  for (const width of [1360, 430]) {
    await page.setViewportSize({ width, height: 950 })
    await map.scrollIntoViewIfNeeded()
    const area = await map.boundingBox()
    await page.mouse.click(area.x + area.width * 0.65, area.y + area.height * 0.55)
    await page.waitForFunction(() => Boolean(document.querySelector('#occ-latitude').value))
    const previous = await lat.inputValue()
    const pin = await map.locator('.leaflet-marker-icon').boundingBox()
    await page.mouse.move(pin.x + pin.width/2, pin.y + pin.height/2)
    await page.mouse.down()
    await page.mouse.move(pin.x + pin.width/2 + 22, pin.y + pin.height/2 - 15, { steps: 8 })
    await page.mouse.up()
    await page.waitForFunction(value => document.querySelector('#occ-latitude').value !== value, previous)
    assert.ok(Number(await lat.inputValue()) >= -16.2 && Number(await lat.inputValue()) <= -15.4)
    assert.ok(Number(await lon.inputValue()) >= -48.3 && Number(await lon.inputValue()) <= -47.3)
    const pane = map.locator('.leaflet-map-pane')
    const transform = await pane.evaluate(el => el.style.transform)
    await page.mouse.move(area.x + area.width * 0.25, area.y + area.height * 0.7)
    await page.mouse.down()
    await page.mouse.move(area.x + area.width * 0.25 + 30, area.y + area.height * 0.7 + 15, { steps: 8 })
    await page.mouse.up()
    await page.waitForFunction(before => document.querySelector('.leaflet-map-pane').style.transform !== before, transform)
    await map.locator('.leaflet-control-zoom-in').click()
    await map.locator('.leaflet-control-zoom-out').click()
  }
  await page.setViewportSize({ width: 1360, height: 950 })
  await page.getByRole('button', { name: 'Ativar tema claro', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'claro')
  await page.getByRole('button', { name: 'Ativar tema escuro', exact: true }).click()
  const coordinates = [await lat.inputValue(), await lon.inputValue()]
  await page.locator('#occ-local').fill('Avenida de teste sintetico no Distrito Federal')
  const denied = page.waitForResponse(r => new URL(r.url()).pathname === '/api/ocorrencias/geocode')
  await page.getByRole('button', { name: 'Buscar localização', exact: true }).click()
  assert.equal((await denied).status(), 403)
  assert.deepEqual([await lat.inputValue(), await lon.inputValue()], coordinates)
  // CEP must not overwrite an address typed manually. Clear it to test auto-fill.
  await page.locator('#occ-local').fill('')
  await page.locator('#occ-cep').fill('70000000')
  await page.waitForFunction(() => document.querySelector('#occ-local').value.includes('Avenida Sintetica'))
  assert.deepEqual([await lat.inputValue(), await lon.inputValue()], coordinates)
  // Validate successful UI integration with a synthetic transport, not relaxed authorization.
  await page.route(`${origin}/api/ocorrencias/geocode?*`, route => route.fulfill({ json: { results: [{ id: 'synthetic-map', label: 'Referencia sintetica DF', latitude: -15.79, longitude: -47.9, approximate: true }] } }))
  await page.getByRole('button', { name: 'Buscar localização', exact: true }).click()
  const results = page.getByRole('list', { name: 'Resultados de localização' })
  await results.getByRole('button').first().click()
  await page.waitForFunction(() => document.querySelector('#occ-latitude').value === '-15.790000')
  await page.unroute(`${origin}/api/ocorrencias/geocode?*`)
  // Dashboard and Crime Map keep their original layers and common tile-image policy.
  await page.goto(`${origin}/dashboard`)
  for (const name of ['Pontos', 'Clusters', 'Mapa de calor', 'Satélite']) {
    const button = page.getByRole('button', { name, exact: true })
    await button.click()
    assert.equal(await button.getAttribute('aria-pressed'), 'true')
  }
  await page.locator('img.leaflet-tile').first().waitFor()
  assert.equal(await page.locator('img.leaflet-tile').first().getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin')
  await page.goto(`${origin}/mapa-criminal`)
  for (const name of ['Pontos', 'Clusters', 'Calor', 'Satélite']) {
    await page.getByRole('button', { name, exact: true }).click()
  }
  await page.locator('img.leaflet-tile').first().waitFor()
  assert.equal(await page.locator('img.leaflet-tile').first().getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin')
  console.log('Maps: desktop/mobile click, marker drag, pan, zoom, themes, synthetic CEP/search integration and preserved business API denial approved; Dashboard and all Crime Map layers checked.')
}
