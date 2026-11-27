import { directPcdfPath } from "../../contracts/pcdf-direct.ts";

export const mainImportOrigin = "http://localhost:3000";
export const directPcdfOrigins = [mainImportOrigin, "http://127.0.0.1:3317", "http://127.0.0.1:3318"] as const;
export const directDatabase = "sentinela_pcdf_local";
export const directDatabasePort = 55484;
export const cloneDatabasePort = 55487;
const cloneOrigin = "http://127.0.0.1:3318";
const syntheticDatabasePort = 55488;

export function hostedImportMode(env = process.env) {
  if (env.SENTINELA_IMPORT_MODE !== "supabase" || env.SENTINELA_AUTH_PROVIDER !== "supabase"
    || env.SENTINELA_INTEGRATED_SUPABASE === "1" || env.SENTINELA_OPERATIONAL_CLONE === "1"
    || env.SENTINELA_LOCAL_DEMO === "1" || env.SENTINELA_PCDF_SYNTHETIC === "1") return null;
  try {
    const origin = new URL(env.SENTINELA_APP_ORIGIN ?? "");
    if (origin.protocol !== "https:" || origin.origin !== env.SENTINELA_APP_ORIGIN) return null;
    const historicalWrite = env.SENTINELA_SUPABASE_IMPORT_WRITE === "1";
    return { origin: origin.origin, historicalWrite, write: historicalWrite && env.SENTINELA_SUPABASE_OPERATIONAL_WRITE === "1" };
  } catch { return null; }
}

export function hostedOperationalMode(env = process.env) {
  const mode = hostedImportMode(env);
  return mode && { origin: mode.origin, write: env.SENTINELA_SUPABASE_OPERATIONAL_WRITE === "1" };
}

export function hostedManualCreationEnabled(env = process.env) {
  return Boolean(hostedOperationalMode(env)
    && (env.SENTINELA_SUPABASE_MANUAL_WRITE ?? env.SENTINELA_SUPABASE_OPERATIONAL_WRITE) === "1");
}

export function institutionalDatabaseMode(env = process.env) {
  return hostedOperationalMode(env) ?? integratedSupabaseMode(env);
}

export function institutionalUsersWriteEnabled(env = process.env) {
  return Boolean(hostedOperationalMode(env) && env.SENTINELA_SUPABASE_USERS_WRITE === "1");
}

function supabaseLauncherSelected(env: NodeJS.ProcessEnv) {
  return env.SENTINELA_AUTH_PROVIDER === "supabase" && env.SENTINELA_INTEGRATED_SUPABASE === "1"
    && env.SENTINELA_APP_ORIGIN === mainImportOrigin && !env.SENTINELA_OPERATIONAL_CLONE
    && env.SENTINELA_PCDF_SYNTHETIC !== "1" && env.SENTINELA_LOCAL_DEMO !== "1"
    && /^[0-9a-f]{64}$/.test(env.SENTINELA_DEV_LOCAL_INSTANCE ?? "");
}

function directPcdfEnvironment(env: NodeJS.ProcessEnv) {
  return env.SENTINELA_IMPORT_MODE !== "supabase"
    && env.NODE_ENV === "development" && (env.SENTINELA_AUTH_PROVIDER === "local" || supabaseLauncherSelected(env))
    && env.SENTINELA_LOCAL_BIND === "127.0.0.1" && env.SENTINELA_PERSISTENT_HOMOLOGATION !== "1"
    && env.SENTINELA_SANDBOX_WRITE !== "1" && !env.VERCEL && !env.VERCEL_ENV;
}

export function expectsIntegratedImport(env = process.env) {
  return directPcdfEnvironment(env) && env.SENTINELA_APP_ORIGIN === mainImportOrigin;
}

export function directPcdfMode(env = process.env) {
  if (!directPcdfEnvironment(env)) return null;
  const origin = directPcdfOrigins.find(value => value === env.SENTINELA_APP_ORIGIN);
  const id = env.SENTINELA_PCDF_LOCAL_ID;
  const system = env.SENTINELA_PCDF_LOCAL_SYSTEM_ID;
  const epoch = env.SENTINELA_PCDF_LOCAL_START;
  if (!origin || !id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)
    || !system || !/^\d{15,22}$/.test(system) || !epoch || !/^\d{10}$/.test(epoch)) return null;
  const synthetic = env.SENTINELA_PCDF_SYNTHETIC === "1";
  if (env.SENTINELA_OPERATIONAL_CLONE === "1") {
    if (origin !== cloneOrigin || synthetic || !env.SENTINELA_HTTP_VALIDATION_ID) return null;
    return { origin, id, system, epoch, port: cloneDatabasePort };
  }
  if (synthetic && !env.SENTINELA_HTTP_VALIDATION_ID) return null;
  return { origin, id, system, epoch, port: synthetic ? syntheticDatabasePort : directDatabasePort };
}

export function syntheticPcdfV2Enabled(env = process.env) {
  return env.SENTINELA_PCDF_V2_SYNTHETIC_WRITE === "1"
    && directPcdfMode(env)?.port === syntheticDatabasePort;
}

export function isDirectPcdfEndpoint(path: string, method: string) {
  return path === directPcdfPath && (method === "GET" || method === "POST");
}

export function integratedImportMode(env = process.env) {
  const mode = directPcdfMode(env);
  return mode?.origin === mainImportOrigin || mode?.port === cloneDatabasePort ? mode : null;
}

export function integratedSupabaseMode(env = process.env) {
  if (!supabaseLauncherSelected(env)) return null;
  const mode = integratedImportMode(env);
  return mode?.port === directDatabasePort ? mode : null;
}

export function isIntegratedGeneralEndpoint(path: string, method: string) {
  const base = "/api/v1/importacoes/geral";
  return (path === base && (method === "GET" || method === "POST"))
    || (method === "GET" && path.startsWith(base + "/") && /^[0-9a-f-]{36}$/i.test(path.slice(base.length + 1)));
}
