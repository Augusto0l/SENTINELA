import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextPackage = require.resolve("next/package.json");
const nextRequire = createRequire(nextPackage);
const nextRoot = dirname(nextPackage);
const [command, ...args] = process.argv.slice(2);
if (!["build", "dev"].includes(command)) throw new Error("Use build ou dev.");

// Preserve Turbopack on platforms where the native compiler works.
// Windows App Control can reject the unsigned addon; use Next's WASM fallback
// with Webpack, without changing Windows policy or the blocked native file.
if (process.platform === "win32" && ["x64", "arm64"].includes(process.arch)) {
  try {
    nextRequire(`@next/swc-win32-${process.arch}-msvc`);
  } catch (error) {
    if (error.code !== "ERR_DLOPEN_FAILED") throw error;
    const wasmRoot = dirname(require.resolve("@next/swc-wasm-nodejs/package.json"));
    const version = JSON.parse(readFileSync(nextPackage, "utf8")).version;
    const wasmVersion = JSON.parse(readFileSync(join(wasmRoot, "package.json"), "utf8")).version;
    if (version !== wasmVersion) throw new Error(`Next ${version} e SWC WASM ${wasmVersion} precisam corresponder.`);
    const cache = join(nextRoot, "wasm", "@next", "swc-wasm-nodejs");
    const cacheRelative = relative(projectRoot, cache);
    if (cacheRelative.startsWith("..") || isAbsolute(cacheRelative)) throw new Error("Cache SWC fora do projeto.");
    if (!existsSync(join(cache, "wasm.js")) || !existsSync(join(cache, "wasm_bg.wasm"))) {
      // A failed on-demand download may leave an empty directory that Next skips.
      // Populate only missing cache files from the versioned official dependency.
      mkdirSync(cache, { recursive: true });
      cpSync(wasmRoot, cache, { recursive: true, force: false });
    }
    if (!args.includes("--webpack")) args.push("--webpack");
    console.log(`SWC nativo indisponível no Windows (${error.code}); usando Webpack + SWC WASM ${version}.`);
  }
}
const child = spawn(process.execPath, [join(nextRoot, "dist", "bin", "next"), command, ...args], { stdio: "inherit", cwd: projectRoot });
child.on("error", (error) => { console.error(error); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
