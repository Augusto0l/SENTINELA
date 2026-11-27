import type { NextConfig } from "next";
import { persistentPcdfEnabled } from "./src/lib/db/config";
import { directUploadLimit, directV2UploadLimit } from "./src/contracts/pcdf-direct";
import { directPcdfMode, integratedImportMode, syntheticPcdfV2Enabled } from "./src/lib/db/pcdf-direct-mode";
const validation = process.env.SENTINELA_VALIDATE_BUILD === "1";
const httpId = process.env.SENTINELA_HTTP_VALIDATION_ID;
const localInstance = process.env.SENTINELA_DEV_LOCAL_INSTANCE ?? "";
const pcdf = persistentPcdfEnabled() || (process.env.NODE_ENV === "development"
  && process.env.SENTINELA_AUTH_PROVIDER === "local" && process.env.SENTINELA_LOCAL_BIND === "127.0.0.1"
  && process.env.SENTINELA_SANDBOX_WRITE === "1" && (process.env.SENTINELA_SANDBOX_PCDF === "1" || process.env.SENTINELA_SANDBOX_GENERAL_IMPORT === "1")
  && !process.env.VERCEL && !process.env.VERCEL_ENV);
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
  ...(integratedImportMode() && /^[a-f0-9]{64}$/.test(localInstance) && {
    // Probe a static asset so a second launcher does not trigger compilation of a page.
    headers: () => [{ source: "/icons/sentinela.svg", headers: [{ key: "X-Sentinela-Local-Instance", value: localInstance }] }],
  }),
  // Search terms and identifiers from the local occurrence reader stay out of dev logs.
  logging: { incomingRequests: { ignore: [/^\/api\/v1\/ocorrencias\/(?:consulta|gestao)(?:\?|$)/] } },
  ...(directPcdfMode()
    ? { experimental: { proxyClientMaxBodySize: (syntheticPcdfV2Enabled() ? directV2UploadLimit : directUploadLimit) + 1 } }
    : pcdf && { experimental: { proxyClientMaxBodySize: 16 * 1024 * 1024 + 1 } }),
};
export default nextConfig;
