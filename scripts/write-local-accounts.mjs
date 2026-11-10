import { scryptSync, randomBytes } from 'node:crypto'
import { writeFileSync, realpathSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, isAbsolute, relative, sep } from 'node:path'

let temporary
try {
  const path = process.argv[2]
  if (!path || !isAbsolute(path)) throw Error()
  const rel = relative(realpathSync(process.cwd()), realpathSync(dirname(path)))
  if (!isAbsolute(rel) && !rel.startsWith(`..${sep}`)) throw Error()
  let input = ''
  for await (const chunk of process.stdin) {
    input += chunk
    if (Buffer.byteLength(input) > 20000) throw Error()
  }
  const accounts = JSON.parse(input)
  const roles = ['Administrador', 'Operador', 'Analista']
  if (!Array.isArray(accounts) || accounts.length !== 3 || !roles.every(r => accounts.filter(a => a.role === r).length === 1)
    || new Set(accounts.map(a => a.email)).size !== 3) throw Error()
  const hashes = accounts.map(({ email, role, password }) => {
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email !== email.trim().toLowerCase()
      || typeof password !== 'string' || password.length < 4 || password.length > 1024) throw Error()
    const salt = randomBytes(16).toString('hex')
    return { email, role, salt, hash: scryptSync(password, Buffer.from(salt, 'hex'), 64).toString('hex') }
  })
  const output = JSON.stringify({ accounts: hashes }, null, 2)
  if (process.argv[3] === '--replace') {
    temporary = path + '.' + randomBytes(16).toString('hex') + '.tmp'
    writeFileSync(temporary, output, { flag: 'wx', mode: 0o600 })
    renameSync(temporary, path)
    temporary = undefined
  } else {
    writeFileSync(path, output, { flag: 'wx', mode: 0o600 })
  }
} catch {
  console.error('Local configuration failed. Check destination, three unique emails and passwords of 4 to 1024 characters.')
  process.exitCode = 1
} finally {
  if (temporary) { try { unlinkSync(temporary) } catch { /* No secrets in diagnostics. */ } }
}
