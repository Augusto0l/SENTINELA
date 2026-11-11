import type { NextConfig } from "next";
const validation = process.env.SENTINELA_VALIDATE_BUILD === "1";
const httpId = process.env.SENTINELA_HTTP_VALIDATION_ID;
if (httpId && !/^[a-f0-9-]{36}$/.test(httpId)) throw new Error("Identificador de validação inválido.");
const nextConfig: NextConfig = httpId ? {
  distDir: `.next-http-validation-${httpId}`,
  typescript: { tsconfigPath: `tmp/tsconfig-http-${httpId}.json` },
} : validation ? {
  distDir: ".next-build-validation",
  typescript: { tsconfigPath: "tmp/tsconfig-build-validation.json" },
} : {};
export default nextConfig;
