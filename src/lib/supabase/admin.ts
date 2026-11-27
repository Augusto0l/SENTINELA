import "server-only"
import { execFile } from "node:child_process"
import { lstat } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { createClient } from "@supabase/supabase-js"
import { hostedOperationalMode, institutionalDatabaseMode } from "@/lib/db/pcdf-direct-mode"
import { publicSupabaseConfig } from "@/lib/supabase/config"

const exec = promisify(execFile)
const windowsCredential = [
  "$ErrorActionPreference='Stop'",
  "$path=Join-Path (Get-Location) 'tmp/sentinela-users-auth.dpapi'",
  "$secret=ConvertTo-SecureString ([IO.File]::ReadAllText($path))",
  "[Console]::Out.Write(([Net.NetworkCredential]::new('', $secret)).Password)",
].join(";")
let protectedKey: { signature: string; value: Promise<string | undefined> } | undefined

async function readWindowsCredential() {
  if (process.platform !== "win32" || !process.env.SystemRoot) return undefined
  const file = await lstat(join(process.cwd(), "tmp", "sentinela-users-auth.dpapi")).catch(() => null)
  if (!file?.isFile() || file.isSymbolicLink() || file.size > 4096) return undefined
  const signature = `${file.mtimeMs}:${file.size}`
  if (protectedKey?.signature !== signature) {
    const powershell = join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    const value = exec(powershell, ["-NoProfile", "-NonInteractive", "-Command", windowsCredential],
      { windowsHide: true, timeout: 12000, maxBuffer: 1024 }).then(result => result.stdout.trim(), () => undefined)
    protectedKey = { signature, value }
  }
  const cached = protectedKey
  const key = await cached.value
  if (!key && protectedKey === cached) protectedKey = undefined
  return key
}

export async function institutionalAuthAdmin() {
  const config = publicSupabaseConfig()
  const hosted = hostedOperationalMode()
  if (!config || !institutionalDatabaseMode()) return null
  const key = process.env.SENTINELA_USERS_AUTH_KEY || (hosted ? undefined : await readWindowsCredential())
  if (!key || !/^sb_secret_[\w-]{20,}$/.test(key)) return null
  return createClient(config.url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000) }) },
  })
}
