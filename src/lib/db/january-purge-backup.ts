import "server-only"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { lstat, readFile, realpath } from "node:fs/promises"
import { join } from "node:path"

// Evidence captured by operational_clone.py and restored with all 27 table fingerprints.
const backupDirectory = "clone-a38d1eb68d804382bd71bb409f7e6c9b"
const verifiedSha = "fa4ed26293a1e09e49b35963fedd58a37f0f72c29e2bade7386d4bdd96b08108"

export async function januaryPurgeBackup() {
  if (!process.env.USERPROFILE) return null
  try {
    const parent = await realpath(join(process.env.USERPROFILE, ".sentinela-local", "homologacao-clone"))
    const root = join(parent, backupDirectory)
    if ((await realpath(root)).toLowerCase() !== root.toLowerCase()) return null
    const archive = join(root, "origem.dump")
    const info = await lstat(archive)
    if (!info.isFile() || info.nlink !== 1 || info.size !== 3167297) return null
    const metadata = JSON.parse(await readFile(join(root, "backup.json"), "utf8"))
    const restored = JSON.parse(await readFile(join(root, "identity-55487.json"), "utf8"))
    if (metadata.sha256 !== verifiedSha || metadata.tables !== 27 || metadata.origin?.port !== 55484
      || restored.port !== 55487 || !restored.system || restored.system === metadata.origin.system) return null
    const sha = createHash("sha256")
    for await (const chunk of createReadStream(archive)) sha.update(chunk)
    return sha.digest("hex") === verifiedSha ? verifiedSha : null
  } catch {
    return null
  }
}
