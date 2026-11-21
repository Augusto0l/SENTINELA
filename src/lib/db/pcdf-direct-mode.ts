import { directPcdfPath } from "../../contracts/pcdf-direct.ts";

export const directPcdfOrigins = ["http://127.0.0.1:3317", "http://127.0.0.1:3318"] as const;
export const directDatabase = "sentinela_pcdf_local";
export const directDatabasePort = 55484;

export function directPcdfMode(env = process.env) {
  if (env.NODE_ENV !== "development" || env.SENTINELA_AUTH_PROVIDER !== "local"
    || env.SENTINELA_LOCAL_BIND !== "127.0.0.1" || env.SENTINELA_PERSISTENT_HOMOLOGATION === "1"
    || env.SENTINELA_SANDBOX_WRITE === "1" || env.VERCEL || env.VERCEL_ENV) return null;
  const origin = directPcdfOrigins.find(value => value === env.SENTINELA_APP_ORIGIN);
  const id = env.SENTINELA_PCDF_LOCAL_ID;
  const system = env.SENTINELA_PCDF_LOCAL_SYSTEM_ID;
  const epoch = env.SENTINELA_PCDF_LOCAL_START;
  if (!origin || !id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)
    || !system || !/^\d{15,22}$/.test(system) || !epoch || !/^\d{10}$/.test(epoch)) return null;
  return { origin, id, system, epoch };
}

export function isDirectPcdfEndpoint(path: string, method: string) {
  return path === directPcdfPath && (method === "GET" || method === "POST");
}
