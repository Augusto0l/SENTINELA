import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  { files: ["database/local/**/*.cjs"], rules: {
    "@typescript-eslint/no-require-imports": "off",
    "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
  } },
  { files: ["src/**/*.{tsx,jsx}"], rules: { "jsx-a11y/label-has-associated-control": "error" } },
  globalIgnores([".cache/**", ".next/**", ".next-build-validation/**", ".next-http-validation-*/**", "node_modules/**", "src/imports/**", "next-env.d.ts", ".figma/**", ".tmp-*", "tmp/**", "temp/**", "out/**"]),
]);
