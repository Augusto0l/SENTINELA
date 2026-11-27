import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const expected = ["login", "dashboard", "mapa-criminal", "ocorrencias", "ocorrencias/nova", "importar", "usuarios", "configuracoes"];
for (const route of expected) {
  const page = join(root, "src/app", route === "login" ? route : `(sistema)/${route}`, "page.tsx");
  assert.ok(existsSync(page), `Rota ausente: /${route}`);
  assert.match(readFileSync(page, "utf8"), /export default/, `Export ausente: /${route}`);
}
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : /\.(tsx?|mjs)$/.test(file) ? [file] : [];
  });
}
let imports = 0;
for (const file of walk(join(root, "src"))) {
  for (const match of readFileSync(file, "utf8").matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;
    const target = specifier.startsWith("@/") ? join(root, "src", specifier.slice(2)) : resolve(dirname(file), specifier);
    assert.ok(["", ".ts", ".tsx", ".json", "/index.ts", "/index.tsx"].some((ext) => existsSync(`${target}${ext}`)), `Import inválido: ${relative(root, file)} -> ${specifier}`);
    imports++;
  }
}
console.log(`${expected.length} rotas planejadas presentes; ${imports} imports locais resolvidos. Verificação estática; não comprova carregamento HTTP.`);
