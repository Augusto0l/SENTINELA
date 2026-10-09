import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  { rules: { "jsx-a11y/label-has-associated-control": "error" } },
  globalIgnores([".next/**", "node_modules/**", "src/imports/**", "next-env.d.ts", ".figma/**", ".tmp-*", "out/**"]),
]);
