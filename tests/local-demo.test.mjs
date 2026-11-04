import test from 'node:test'
import assert from 'node:assert/strict'
import { localDemoEnabled } from '../src/lib/auth/local-demo.ts'

test('prévia local exige opt-in, desenvolvimento, host local e ausência de Supabase', () => {
  const env = { NODE_ENV: 'development', SENTINELA_LOCAL_DEMO: '1' }
  assert.equal(localDemoEnabled('localhost:3000', env), true)
  assert.equal(localDemoEnabled('127.0.0.1:3000', env), true)
  for (const host of [null, 'sentinela.example', 'localhost.evil:3000', 'localhost:3000@evil', 'localhost/path']) {
    assert.equal(localDemoEnabled(host, env), false)
  }
  for (const override of [
    { NODE_ENV: 'production' }, { NODE_ENV: 'test' }, { SENTINELA_LOCAL_DEMO: undefined },
    { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'configured' },
  ]) assert.equal(localDemoEnabled('localhost:3000', { ...env, ...override }), false)
})
