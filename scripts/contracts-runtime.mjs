import { registerHooks } from "node:module"
import { existsSync } from "node:fs"

// Same @/ resolution used by Next/TypeScript, for the Node 22 contracts tools and tests.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const url = new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url)
      if (existsSync(url)) return nextResolve(url.href, context)
    }
    return nextResolve(specifier, context)
  },
})
