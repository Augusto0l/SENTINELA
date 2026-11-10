// Explicit integration check: starts only a disposable loopback Next server.
import { mkdtemp, writeFile, rm, readFile, rename, mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { checkOccurrenceMap } from './check-occurrence-map-browser.mjs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes, scryptSync } from 'node:crypto'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const directory = await mkdtemp(join(tmpdir(), 'sentinela-auth-http-'))
const origin = 'http://127.0.0.1:3017'
const roles = ['Administrador', 'Operador', 'Analista']
const passwords = roles.map(() => randomBytes(24).toString('hex'))
const accounts = roles.map((role, i) => {
  const salt = randomBytes(16).toString('hex')
  return { email: `synthetic-${i}@example.test`, role, salt, hash: scryptSync(passwords[i], Buffer.from(salt, 'hex'), 64).toString('hex') }
})
let child
let browser
async function stop() {
  if (!child || child.exitCode !== null) return
  // Windows termination is restricted to this spawned process tree.
  if (process.platform === 'win32') {
    await new Promise(resolve => spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('close', resolve))
  } else { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)) }
  child = undefined
}
async function start(production) {
  const next = createRequire(import.meta.url).resolve('next/dist/bin/next')
  child = spawn(process.execPath, production ? [next, 'start', '--hostname', '127.0.0.1', '--port', '3017'] : ['scripts/next-cli.mjs', 'dev', '--port', '3017'], {
    windowsHide: true, stdio: 'ignore', env: { ...process.env, NODE_ENV: production ? 'production' : 'development', SENTINELA_AUTH_PROVIDER: 'local', SENTINELA_LOCAL_ACCOUNTS_FILE: join(directory, 'accounts.json'), SENTINELA_APP_ORIGIN: origin, NEXT_TELEMETRY_DISABLED: '1' },
  })
  const until = Date.now() + 120_000
  while (Date.now() < until) {
    if (child.exitCode !== null) throw Error('Disposable server failed to start')
    try { const response = await fetch(`${origin}/login`, { signal: AbortSignal.timeout(10000) }); if (response.ok) return response.text() } catch { /* Startup only. */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw Error('Disposable server timed out')
}
const post = (action, fields, cookie) => fetch(`${origin}/auth/${action}`, { method: 'POST', redirect: 'manual', headers: { origin, 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(fields) })
try {
  // Refuse to touch a port already occupied by another application.
  const { createServer } = await import('node:net')
  await new Promise((resolve, reject) => { const server = createServer(); server.once('error', reject); server.listen(3017, '127.0.0.1', () => server.close(resolve)) })
  await writeFile(join(directory, 'accounts.json'), JSON.stringify({ accounts }))
  const html = await start(false)
  for (const account of accounts) assert.ok(!html.includes(account.hash) && !html.includes(account.salt) && !html.includes(account.email))
  assert.ok(html.includes('Acesso local'))
  for (let i = 0; i < 3; i++) {
    const response = await post('login', { email: accounts[i].email, password: passwords[i], role: 'Administrador' })
    assert.equal(response.status, 303, response.status !== 303 ? await response.text() : undefined)
    assert.equal(new URL(response.headers.get('location'), origin).pathname, '/dashboard')
    const cookie = response.headers.get('set-cookie').split(';')[0]
    const dashboard = await fetch(`${origin}/dashboard`, { headers: { cookie }, redirect: 'manual' })
    assert.equal(dashboard.status, 200)
    const admin = await fetch(`${origin}/usuarios`, { headers: { cookie }, redirect: 'manual' })
    if (i === 0) assert.equal(admin.status, 200)
    else assert.equal(new URL(admin.headers.get('location'), origin).pathname, '/acesso-negado')
    const api = await fetch(`${origin}/api/ocorrencias/geocode`, { headers: { cookie } })
    assert.equal(api.status, 403)
    assert.equal((await post('logout', {}, cookie)).status, 303)
    const revoked = await fetch(`${origin}/dashboard`, { headers: { cookie }, redirect: 'manual' })
    assert.equal(new URL(revoked.headers.get('location'), origin).pathname, '/login')
  }
  const rejected = await post('login', { email: accounts[0].email, password: randomBytes(12).toString('hex') })
  assert.equal(new URL(rejected.headers.get('location'), origin).searchParams.get('erro'), 'credenciais')
  assert.equal((await post('recuperar', { email: accounts[0].email })).status, 403)
  console.log('HTTP development: three profiles, authorization, logout, remote API denial and generic rejection approved.')
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage()
  let remoteAuthAttempts = 0
  const tileReferences = []
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=', 'base64')
  let liveTilePromise, liveStarted = false
  const liveTile = process.argv.includes('--live-tile')
  await page.route('**/*', async route => {
    const target = new URL(route.request().url())
    if (target.origin === origin) return route.continue()
    if (/supabase\.(co|in)$/.test(target.hostname) || /^\/(auth|rest)\/v1(?:\/|$)/.test(target.pathname)) remoteAuthAttempts++
    if (target.hostname === 'viacep.com.br') return route.fulfill({ json: { cep:'70000-000', logradouro:'Avenida Sintetica', bairro:'Setor de Teste', localidade:'Brasilia', uf:'DF' }, headers: { 'Access-Control-Allow-Origin':'*' } })
    if (target.hostname === 'tile.openstreetmap.org' || target.hostname.endsWith('basemaps.cartocdn.com') || target.hostname === 'tiles.maps.eox.at') {
      const headers = await route.request().allHeaders()
      tileReferences.push(headers.referer)
      if (liveTile && target.hostname === 'tile.openstreetmap.org' && !liveStarted) {
        liveStarted = true
        if (/no-cache|no-store/.test(headers['cache-control'] ?? '') || /no-cache/.test(headers.pragma ?? '')) {
          liveTilePromise = Promise.resolve({ status:0, png:false, reason:'Test cache disabled: live request withheld' })
          return route.abort()
        }
        liveTilePromise = page.waitForResponse(r => r.url() === target.href, { timeout:20000 }).then(async response => {
          const image = await response.body()
          await mkdir('tmp', { recursive:true })
          await writeFile('tmp/osm-tile-check.png', image)
          return { status:response.status(), png:image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), imageBytes:image.length }
        }).catch(() => ({ status:0, png:false, imageBytes:0 }))
        return route.continue()
      }
      return route.fulfill({ body:pixel, contentType:'image/png' })
    }
    return route.abort()
  })
  async function controls(disabled) {
    assert.equal(await page.locator('#auth-email').isDisabled(), disabled)
    assert.equal(await page.locator('#auth-password').isDisabled(), disabled)
    assert.equal(await page.getByRole('button', { name: 'Entrar', exact: true }).isDisabled(), disabled)
  }
  for (let scenario = 0; scenario < 4; scenario++) {
    const i = scenario % 3
    await page.setViewportSize({width:1360,height:950})
    await page.goto(`${origin}/login`)
    await controls(false)
    assert.equal(await page.getByText('Autenticação indisponível neste ambiente.', { exact: false }).count(), 0)
    await page.locator('#auth-email').fill(accounts[i].email)
    await page.locator('#auth-password').fill(passwords[i])
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await page.waitForURL(`${origin}/dashboard`)
    await page.goto(`${origin}/usuarios`)
    if (i === 0) assert.equal(new URL(page.url()).pathname, '/usuarios')
    else await page.waitForURL(`${origin}/acesso-negado`)
    if (scenario === 0) await checkOccurrenceMap(page, origin)
    await page.goto(`${origin}/dashboard`)
    if (scenario % 2) await page.getByRole('button', { name:'Recolher navega\u00e7\u00e3o', exact:true }).click()
    // Mobile deliberately hides the collapse control; preserve its desktop state on resize.
    if (scenario >= 2) await page.setViewportSize({width:430,height:950})
    const staleCookies = (await page.context().cookies()).filter(c => c.name === 'sentinela-local-session')
    const staleCookie = staleCookies.map(c => `${c.name}=${c.value}`).join('; ')
    if (scenario === 0) {
      await page.route(`${origin}/auth/logout`, route => route.fulfill({ status:503, body:'' }))
      await page.getByRole('button', {name:'Encerrar sess\u00e3o',exact:true}).click()
      await page.getByRole('alert').filter({hasText:'Tente novamente.'}).waitFor()
      assert.equal(new URL(page.url()).pathname,'/dashboard')
      await page.unroute(`${origin}/auth/logout`)
    }
    const replyPromise = page.waitForResponse(r => new URL(r.url()).pathname === '/auth/logout' && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Encerrar sess\u00e3o', exact: true }).click()
    const reply = await replyPromise
    assert.equal(reply.status(),303)
    assert.equal(reply.request().headers().origin,origin)
    assert.match((await reply.allHeaders())['set-cookie'], /HttpOnly; SameSite=Strict; Path=\/; Max-Age=0/)
    await page.waitForURL(url => url.pathname === '/login')
    assert.equal((await page.context().cookies()).some(c => c.name === 'sentinela-local-session'),false)
    const old = await fetch(`${origin}/dashboard`, {headers:{cookie:staleCookie},redirect:'manual'})
    assert.equal(new URL(old.headers.get('location'),origin).pathname,'/login')
    await page.goBack()
    await page.waitForURL(url => url.pathname === '/login')
    await page.goto(`${origin}/dashboard`)
    await page.waitForURL(url => url.pathname === '/login')
  }
  await page.locator('#auth-email').fill(accounts[0].email)
  await page.locator('#auth-password').fill('synthetic-incorrect-password')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.waitForURL(url => url.searchParams.get('erro') === 'credenciais')
  assert.equal(await page.getByRole('alert').filter({ hasText: 'Verifique suas credenciais' }).count(), 1)
  const accountPath = join(directory, 'accounts.json')
  await rename(accountPath, accountPath + '.missing')
  try {
    await page.goto(`${origin}/login`)
    await controls(true)
    assert.equal(await page.getByText('Acesso local de desenvolvimento.', { exact: false }).count(), 0)
  } finally { await rename(accountPath + '.missing', accountPath) }
  await page.goto(`${origin}/login`)
  await controls(false)
  assert.equal(remoteAuthAttempts, 0)
  assert.ok(tileReferences.length > 0)
  assert.equal(tileReferences.every(ref => ref === origin + '/'), true)
  if (liveTile) {
    const result = liveTilePromise ? await liveTilePromise : {status:0,png:false}
    console.log('Single live OSM image: '+JSON.stringify(result))
    if (result.status !== 200 || !result.png) process.exitCode = 1
  }
  console.log('Sidebar logout: desktop/mobile, expanded/collapsed, server revocation, cookie expiration, failed logout and browser Back approved. Tile requests disclose only the origin.')
  console.log('Browser Edge: enabled controls, three logins, permissions, logout, invalid credentials and disabled controls without a valid provider approved; external traffic blocked and no Supabase requests.')
  await stop()
  await start(true)
  await page.goto(`${origin}/login`)
  await controls(true)
  assert.equal((await post('login', { email: accounts[0].email, password: passwords[0] })).status, 403)
  const denied = await fetch(`${origin}/dashboard`, { redirect: 'manual' })
  assert.equal(new URL(denied.headers.get('location'), origin).pathname, '/login')
  console.log('HTTP production: local login and protected pages denied with explicit local configuration.')
  // Client chunks must not contain private configuration or password derivation code.
  const { readdir } = await import('node:fs/promises')
  async function inspect(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name)
      if (entry.isDirectory()) await inspect(file)
      else if (file.endsWith('.js')) assert.doesNotMatch(await readFile(file, 'utf8'), /SENTINELA_LOCAL_ACCOUNTS_FILE|sentinela-sessions|Local configuration unavailable/)
    }
  }
  await inspect('.next/static')
  console.log('Client bundles: no local credential loader or session storage implementation.')
} finally { if (browser) await browser.close(); await stop(); await rm(directory, { recursive: true, force: true }) }
