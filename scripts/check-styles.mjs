import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const file = new URL("../src/index.css", import.meta.url);
const result = await postcss([tailwind()]).process(readFileSync(file, "utf8"), { from: fileURLToPath(file) });
if (result.warnings().length) {
  for (const warning of result.warnings()) console.error(warning.toString());
  process.exitCode = 1;
} else {
  console.log(`CSS processado por PostCSS/Tailwind: ${result.css.length} caracteres; 0 avisos. Não substitui build Next.js.`);
}
