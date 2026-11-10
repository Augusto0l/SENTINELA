import '../scripts/contracts-runtime.mjs'
import { registerHooks } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes, scryptSync } from 'node:crypto'
import { spawnSync } from 'node:child_process'
registerHooks({ resolve(s, c, next) { return s === 'server-only' ? { url: 'data:text/javascript,export{}', shortCircuit: true } : next(s, c) } })
const local = await import('../src/lib/auth/local-provider.ts')
const { localPost } = await import('../src/lib/auth/local-handler.ts')
const { hasPermission } = await import('../src/lib/auth/policy.ts')

test('local: three fixed roles, sessions, logout, rate limit and remote/production isolation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sentinela-auth-test-'))
  const previous = { ...process.env }
  const roles = ['Administrador', 'Operador', 'Analista']
  const password = randomBytes(24).toString('hex')
  const accounts = roles.map((role, i) => {
    const salt = randomBytes(16).toString('hex')
    return { email: `synthetic-${i}@example.test`, role, salt, hash: scryptSync(password + i, Buffer.from(salt, 'hex'), 64).toString('hex') }
  })
  const file = join(directory, 'accounts.json')
  const env = { ...process.env, NODE_ENV: 'development', SENTINELA_AUTH_PROVIDER: 'local', SENTINELA_LOCAL_BIND: '127.0.0.1', SENTINELA_APP_ORIGIN: 'http://localhost:3000', SENTINELA_LOCAL_ACCOUNTS_FILE: file }
  Object.assign(process.env, env)
  const request = (action, fields = {}, headers = {}) => new Request(`${env.SENTINELA_APP_ORIGIN}/auth/${action}`, { method: 'POST', headers: { host: 'localhost:3000', origin: env.SENTINELA_APP_ORIGIN, 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(fields) })
  try {
    await writeFile(file, JSON.stringify({ accounts }))
    for (let i = 0; i < 3; i++) {
      const response = await localPost('login', request('login', { email: accounts[i].email, password: password + i, role: 'Administrador', next: 'https://invalid.test' }))
      assert.equal(response.status, 303)
      assert.equal(new URL(response.headers.get('location')).pathname, '/dashboard')
      const cookie = response.headers.get('set-cookie')
      assert.match(cookie, /HttpOnly; SameSite=Strict; Path=\/; Max-Age=28800/)
      const token = cookie.split(';')[0].split('=')[1]
      const principal = await local.localSession(token, 'localhost:3000', env)
      assert.equal(principal.role, roles[i])
      assert.equal(principal.source, 'local')
      assert.equal(principal.authUserId, '')
      assert.equal(hasPermission(principal.role, 'administrar'), i === 0)
      assert.equal(hasPermission(principal.role, 'cadastrar'), i !== 2)
      assert.equal(await local.localSession('f'.repeat(64), 'localhost:3000', env), null)
      assert.equal(await local.localSession(token, 'localhost:3000', env, Date.now() + 28801_000), null)
      assert.equal(await local.localSession(token, 'remote.example:3000', env), null)
      assert.equal(await local.localSession(token, 'localhost:3000', { ...env, NODE_ENV: 'production' }), null)
      const logout = await localPost('logout', request('logout', {}, { cookie: `${local.LOCAL_COOKIE}=${token}` }))
      assert.equal(logout.status, 303)
      assert.match(logout.headers.get('set-cookie'), /Max-Age=0/)
      assert.equal(await local.localSession(token, 'localhost:3000', env), null)
    }
    assert.equal(await local.localLogin(accounts[0].email, 'incorrect', 'localhost:3000', env), null)
    assert.equal(local.localAllowed('localhost:3000', { ...env, SENTINELA_LOCAL_BIND: '' }), false)
    assert.equal(local.localAllowed('localhost:3000', { ...env, SENTINELA_APP_ORIGIN: 'https://remote.example' }), false)
    assert.equal(local.localAllowed('localhost:3000', { ...env, SENTINELA_AUTH_PROVIDER: 'supabase' }), false)
    assert.equal((await localPost('login', request('login', {}, { origin: 'https://evil.test' }))).status, 403)
    assert.equal((await localPost('logout', request('logout', {}, { origin: 'null' }))).status, 403)
    assert.equal((await localPost('recuperar', request('recuperar'))).status, 403)
    assert.equal((await localPost('login', request('login', {}, { 'content-type': 'application/json' }))).status, 415)
    for (let i = 0; i < 12; i++) await local.localLogin('unknown@example.test', 'incorrect', 'localhost:3000', env)
    assert.equal(await local.localLogin(accounts[0].email, password + 0, 'localhost:3000', env), null)
    await writeFile(file, JSON.stringify({ accounts: accounts.slice(0, 2) }))
    await assert.rejects(local.localConfig(env), /unavailable/)
    await assert.rejects(local.localConfig({ ...env, SENTINELA_LOCAL_ACCOUNTS_FILE: join(process.cwd(), 'package.json') }), /unavailable/)
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]
    Object.assign(process.env, previous)
    await rm(directory, { recursive: true, force: true })
  }
})

test('local integration has fail-closed remote guards and no client credential imports', async () => {
  const source = path => readFile(path, 'utf8')
  assert.match(await source('src/lib/supabase/server.ts'), /if \(localSelected\(\)\) return null/)
  assert.match(await source('src/lib/auth/gateway.ts'), /if \(localSelected\(\)\) throw/)
  assert.match(await source('src/proxy.ts'), /pathname\.startsWith\("\/api\/"\)/)
  assert.match(await source('src/app/api/ocorrencias/geocode/route.ts'), /principal.source === "local"/)
  for (const path of ['src/components/auth/LoginForm.tsx', 'src/lib/supabase/browser.ts']) {
    assert.doesNotMatch(await source(path), /local-provider|LOCAL_ACCOUNTS|scrypt|passwordHash|SENTINELA_DATABASE/)
  }
  assert.match(await source('scripts/next-cli.mjs'), /args.push\("--hostname", "127.0.0.1"\)/)
})

test('account setup writes only salted hashes, preserves Unicode and refuses overwrite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sentinela-auth-setup-'))
  const file = join(directory, 'accounts.json')
  const accounts = ['Administrador', 'Operador', 'Analista'].map((role, i) => ({ role, email: `setup-${i}@example.test`, password: randomBytes(24).toString('hex') + 'ç🔒' }))
  try {
    const run = () => spawnSync(process.execPath, ['scripts/write-local-accounts.mjs', file], { input: JSON.stringify(accounts), encoding: 'utf8', windowsHide: true })
    const result = run()
    assert.equal(result.status, 0)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr, '')
    const raw = await readFile(file, 'utf8')
    const stored = JSON.parse(raw).accounts
    for (let i = 0; i < 3; i++) {
      assert.equal(raw.includes(accounts[i].password), false)
      assert.deepEqual(Object.keys(stored[i]).sort(), ['email', 'hash', 'role', 'salt'])
      assert.equal(scryptSync(accounts[i].password, Buffer.from(stored[i].salt, 'hex'), 64).equals(Buffer.from(stored[i].hash, 'hex')), true)
    }
    assert.equal(run().status, 1)
    assert.equal(await readFile(file, 'utf8'), raw)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

for (const [index, password] of ['0000', '1111'].entries()) {
  test(`local shared numeric password scenario ${index + 1}: setup, three roles and minimum length`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sentinela-auth-password-'))
    const file = join(directory, 'accounts.json')
    const roles = ['Administrador', 'Operador', 'Analista']
    const accounts = roles.map((role, i) => ({ role, email: `numeric-${i}@example.test`, password }))
    const provider = await import(`../src/lib/auth/local-provider.ts?numeric=${index}`)
    const env = { ...process.env, NODE_ENV: 'development', SENTINELA_AUTH_PROVIDER: 'local', SENTINELA_LOCAL_BIND: '127.0.0.1', SENTINELA_APP_ORIGIN: 'http://localhost:3000', SENTINELA_LOCAL_ACCOUNTS_FILE: file }
    const run = (input, replace = false) => spawnSync(process.execPath, ['scripts/write-local-accounts.mjs', file, ...(replace ? ['--replace'] : [])], { input: JSON.stringify(input), encoding: 'utf8', windowsHide: true })
    try {
      const created = run(accounts)
      assert.equal(created.status, 0)
      assert.equal(created.stdout, '')
      assert.equal(created.stderr, '')
      const original = await readFile(file, 'utf8')
      const stored = JSON.parse(original).accounts
      assert.equal(new Set(stored.map(a => a.email)).size, 3)
      assert.equal(new Set(stored.map(a => a.salt)).size, 3)
      assert.equal(new Set(stored.map(a => a.hash)).size, 3)
      for (let i = 0; i < 3; i++) {
        assert.equal('password' in stored[i], false)
        const token = await provider.localLogin(accounts[i].email, password, 'localhost:3000', env)
        assert.equal(typeof token, 'string')
        assert.equal((await provider.localSession(token, 'localhost:3000', env)).role, roles[i])
        assert.equal(await provider.localSession(token, 'localhost:3000', { ...env, NODE_ENV: 'production' }), null)
        assert.equal(await provider.localSession(token, 'remote.example:3000', env), null)
        await provider.localLogout(token, env)
      }
      for (const short of ['', '1', '123']) {
        const refused = run(accounts.map(a => ({ ...a, password: short })), true)
        assert.equal(refused.status, 1)
        assert.equal(refused.stdout, '')
        assert.equal(await readFile(file, 'utf8'), original)
        assert.equal(await provider.localLogin(accounts[0].email, short, 'localhost:3000', env), null)
      }
      assert.equal(run(accounts.map(a => ({ ...a, email: accounts[0].email })), true).status, 1)
      assert.equal(await readFile(file, 'utf8'), original)
      assert.equal(run(accounts, true).status, 0)
      assert.notEqual(await readFile(file, 'utf8'), original)
      const duplicated = JSON.parse(original)
      duplicated.accounts[1].email = duplicated.accounts[0].email
      await writeFile(file, JSON.stringify(duplicated))
      await assert.rejects(provider.localConfig(env), /unavailable/)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
}
