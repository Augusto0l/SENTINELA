import type { NextConfig } from "next";
const validation = process.env.SENTINELA_VALIDATE_BUILD === "1";
const httpId = process.env.SENTINELA_HTTP_VALIDATION_ID;
const pcdf = process.env.NODE_ENV === "development"
  && process.env.SENTINELA_AUTH_PROVIDER === "local" && process.env.SENTINELA_LOCAL_BIND === "127.0.0.1"
  && process.env.SENTINELA_SANDBOX_WRITE === "1" && process.env.SENTINELA_SANDBOX_PCDF === "1"
  && !process.env.VERCEL && !process.env.VERCEL_ENV;
if (httpId && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(httpId)) throw new Error("Identificador de validação inválido.");
const output = httpId ? {
  distDir: `.next-http-validation-${httpId}`,
  typescript: { tsconfigPath: `tmp/tsconfig-http-${httpId}.json` },
  // Turbopack otherwise creates a junction for its external `pg` package.
  transpilePackages: ["pg"],
} : validation ? {
  distDir: ".next-build-validation",
  typescript: { tsconfigPath: "tmp/tsconfig-build-validation.json" },
} : {};
const nextConfig: NextConfig = {
  ...output,
  ...(pcdf && { experimental: { proxyClientMaxBodySize: 16 * 1024 * 1024 + 1 } }),
};
export default nextConfig;
