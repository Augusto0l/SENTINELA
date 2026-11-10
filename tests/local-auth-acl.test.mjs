import '../scripts/contracts-runtime.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomBytes, scryptSync } from 'node:crypto'

test('NTFS: non-admin creation, protected reconfiguration, file DACL and rollback', { skip: process.platform !== 'win32' }, async () => {
  const parent = await mkdtemp(join(tmpdir(), 'sentinela-ntfs-test-'))
  const directory = join(parent, '.sentinela-local')
  const file = join(directory, 'accounts.json')
  const powershell = join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe')
  const protect = (...flags) => {
    const result = spawnSync(powershell, ['-NoProfile', '-File', 'tests/fixtures/local-auth-acl.ps1', '-Directory', directory, ...flags], { encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 0, 'DACL fixture must succeed without Windows elevation')
    assert.equal(result.stderr, '')
    return JSON.parse(result.stdout)
  }
  const verify = (result, requireProtected = true) => {
    assert.equal(result.administrator, false, 'Test must run using a non-administrator token')
    const expected = [result.user, 'S-1-5-18', 'S-1-5-32-544'].sort()
    for (const target of result.targets) {
      if (requireProtected || target.directory) assert.equal(target.protected, true)
      assert.deepEqual(target.rules.map(r => r.sid).sort(), expected)
      assert.equal(target.rules.every(r => r.allow && r.full), true)
    }
  }
  const accounts = ['Administrador', 'Operador', 'Analista'].map((role, i) => ({ role, email: `ntfs-${i}@example.test`, password: randomBytes(16).toString('hex') }))
  const create = replace => {
    const result = spawnSync(process.execPath, ['scripts/write-local-accounts.mjs', file, ...(replace ? ['--replace'] : [])], { input: JSON.stringify(accounts), encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 0)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr, '')
  }
  try {
    verify(protect()) // First creation includes a private DACL from the start.
    verify(protect()) // Previously-protected root caused the original Set-Acl failure.
    create(false)
    verify(protect('-InspectOnly'), false) // New file already inherits only the three trusted SIDs.
    verify(protect('-SeedBroadAccess')) // Remove explicit ordinary-user access on both targets.
    const before = await readFile(file, 'utf8')
    assert.equal(protect('-SeedBroadAccess', '-SimulateFailure').rollback, true)
    assert.equal(await readFile(file, 'utf8'), before)
    verify(protect())
    create(true)
    verify(protect('-InspectOnly'), false) // Atomic replacement also inherits the private parent DACL.
    const after = await readFile(file, 'utf8')
    assert.notEqual(after, before)
    const summary = protect()
    verify(summary)
    assert.equal(summary.targets.length, 2)
    const stored = JSON.parse(after).accounts
    for (let i=0; i<3; i++) {
      assert.equal(after.includes(accounts[i].password), false)
      assert.equal('password' in stored[i], false)
      assert.equal(scryptSync(accounts[i].password, Buffer.from(stored[i].salt,'hex'),64).equals(Buffer.from(stored[i].hash,'hex')), true)
    }
    const local = await import('../src/lib/auth/local-provider.ts')
    const env = { ...process.env, NODE_ENV:'development', SENTINELA_AUTH_PROVIDER:'local', SENTINELA_LOCAL_BIND:'127.0.0.1', SENTINELA_APP_ORIGIN:'http://localhost:3000', SENTINELA_LOCAL_ACCOUNTS_FILE:file }
    for (let i=0; i<3; i++) {
      const token = await local.localLogin(accounts[i].email, accounts[i].password, 'localhost:3000', env)
      assert.equal(typeof token, 'string')
      assert.equal((await local.localSession(token,'localhost:3000',env)).role, accounts[i].role)
      await local.localLogout(token,env)
    }
  } finally {
    assert.equal(dirname(resolve(parent)), resolve(tmpdir()))
    assert.ok(parent.includes('sentinela-ntfs-test-'))
    await rm(parent,{recursive:true,force:true})
  }
})
