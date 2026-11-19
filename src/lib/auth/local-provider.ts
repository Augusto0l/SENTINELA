// Node-only implementation. Imported by server-only adapters and the Node proxy.
import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto"
import { promisify } from "node:util"
import { readFile, realpath, mkdir, writeFile, unlink, readdir } from "node:fs/promises"
import { isAbsolute, relative, resolve, dirname, join } from "node:path"
import { ROLES, type Role, type Principal } from "@/lib/auth/policy"

const derive = promisify(scrypt)
export const LOCAL_COOKIE = "sentinela-local-session"
export const LOCAL_TTL = 8 * 60 * 60
export const localSelected = (env = process.env) => env.SENTINELA_AUTH_PROVIDER === "local"
export function localAllowed(host: string | null, env = process.env) {
  if (!localSelected(env) || env.NODE_ENV !== "development" || env.SENTINELA_LOCAL_BIND !== "127.0.0.1") return false
  try {
    const origin = new URL(env.SENTINELA_APP_ORIGIN ?? "")
    return origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
      && origin.origin === env.SENTINELA_APP_ORIGIN && host === origin.host
  } catch { return false }
}
export function localLoginRedirect(host: string | null, env = process.env): URL | null {
  try {
    const origin = new URL(env.SENTINELA_APP_ORIGIN ?? "")
    if (!localAllowed(origin.host, env)) return null
    const alias = origin.hostname === "localhost" ? "127.0.0.1"
      : origin.hostname === "127.0.0.1" ? "localhost" : null
    if (!alias || host !== (origin.port ? `${alias}:${origin.port}` : alias)) return null
    return new URL("/login", origin)
  } catch {
    return null
  }
}
type Account = { email: string; role: Role; salt: string; hash: string; subject?: string }
type Config = { accounts: Account[]; directory: string; fingerprint: string }
function outside(path: string, root: string) {
  const rel = relative(root, path)
  return rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rel)
}
export async function localConfig(env = process.env): Promise<Config> {
  if (env.NODE_ENV !== "development" || !localSelected(env)) throw Error("Local configuration unavailable")
  const path = env.SENTINELA_LOCAL_ACCOUNTS_FILE ?? ""
  if (!isAbsolute(path)) throw Error("Local configuration unavailable")
  const actual = await realpath(/* turbopackIgnore: true */ path)
  if (!outside(actual, await realpath(process.cwd()))) throw Error("Local configuration unavailable")
  const raw = await readFile(actual, "utf8")
  if (Buffer.byteLength(raw) > 16384) throw Error("Local configuration unavailable")
  const data = JSON.parse(raw)
  if (!Array.isArray(data.accounts) || data.accounts.length !== 3) throw Error("Local configuration unavailable")
  const accounts: Account[] = data.accounts
  if (!ROLES.every(role => accounts.filter(a => a.role === role).length === 1)
    || new Set(accounts.map(a => a.email)).size !== 3
    || new Set(accounts.flatMap(a => a.subject ? [a.subject] : [])).size !== accounts.filter(a => a.subject).length
    || accounts.some(a => Object.keys(a).some(key => !["email", "role", "salt", "hash", "subject"].includes(key))
      || (a.subject !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a.subject))
      || typeof a.email !== "string" || a.email !== a.email.trim().toLowerCase()
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email) || a.email.length > 254
      || !/^[a-f0-9]{32}$/.test(a.salt) || !/^[a-f0-9]{128}$/.test(a.hash))) throw Error("Local configuration unavailable")
  return { accounts, directory: join(dirname(actual), "sentinela-sessions"), fingerprint: createHash("sha256").update(raw).digest("hex") }
}
const tokenName = (token: string) => createHash("sha256").update(token).digest("hex") + ".json"
export function localPrincipal(account: Account): Principal & { localSubject?: string } {
  return { id: `LOCAL-${account.role}`, authUserId: "", name: `Desenvolvimento — ${account.role}`, role: account.role, source: "local",
    ...(account.subject && { localSubject: account.subject }) }
}
export async function localSession(token: string | undefined, host: string | null, env = process.env, now = Date.now()): Promise<ReturnType<typeof localPrincipal> | null> {
  if (!localAllowed(host, env) || !token || !/^[a-f0-9]{64}$/.test(token)) return null
  try {
    const config = await localConfig(env)
    const session = JSON.parse(await readFile(join(config.directory, tokenName(token)), "utf8"))
    const account = config.accounts.find(a => a.role === session.role)
    if (!account || session.fingerprint !== config.fingerprint || !Number.isFinite(session.expires) || session.expires <= now) return null
    return localPrincipal(account)
  } catch { return null }
}
// Bounded process-local throttle, shared across account names: changing email cannot bypass it.
let windowStart = 0, attempts = 0
export async function localLogin(email: string, password: string, host: string | null, env = process.env) {
  if (!localAllowed(host, env)) return null
  const now = Date.now()
  if (now - windowStart >= 60_000) { windowStart = now; attempts = 0 }
  if (++attempts > 10 || password.length < 4 || password.length > 1024) return null
  const config = await localConfig(env)
  const account = config.accounts.find(a => a.email === email.trim().toLowerCase())
  const candidate = await derive(password, Buffer.from(account?.salt ?? "0".repeat(32), "hex"), 64) as Buffer
  if (!timingSafeEqual(candidate, Buffer.from(account?.hash ?? "0".repeat(128), "hex")) || !account) return null
  await mkdir(config.directory, { recursive: true, mode: 0o700 })
  if (await realpath(/* turbopackIgnore: true */ config.directory) !== resolve(/* turbopackIgnore: true */ config.directory)) throw Error("Local configuration unavailable")
  for (const file of await readdir(/* turbopackIgnore: true */ config.directory)) {
    if (!/^[a-f0-9]{64}\.json$/.test(file)) continue
    try {
      const stored = JSON.parse(await readFile(join(config.directory, file), "utf8"))
      if (stored.expires <= now) await unlink(join(config.directory, file))
    } catch { /* Never log session contents. */ }
  }
  const token = randomBytes(32).toString("hex")
  await writeFile(join(config.directory, tokenName(token)), JSON.stringify({ role: account.role, fingerprint: config.fingerprint, expires: now + LOCAL_TTL * 1000 }), { flag: "wx", mode: 0o600 })
  return token
}
export async function localLogout(token: string | undefined, env = process.env) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return
  const config = await localConfig(env)
  try { await unlink(join(config.directory, tokenName(token))) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw Error("Local logout unavailable")
  }
}
