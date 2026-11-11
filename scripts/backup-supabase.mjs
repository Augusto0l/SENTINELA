import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { existsSync, mkdirSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.length === 0 || (args.length === 1 && args[0] === "--help")) {
  console.log("Backup local PostgreSQL (nenhuma conexão no modo ajuda).\nUso: node scripts/backup-supabase.mjs --run\nConfigure SENTINELA_DATABASE_URL no .env.local. Exige TLS verify-full e CA confiável.\nDestino padrão: D:/Backups/SENTINELA. Não testa restauração nem aplica SQL.");
  process.exit(0);
}

function fail(message) { throw new Error(message); }
function outsideRepo(target) {
  const relative = path.relative(realpathSync(root), target);
  return relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}
function physicalTarget(target) {
  let ancestor = target;
  const suffix = [];
  while (!existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) fail("Destino de backup indisponível.");
    suffix.unshift(path.basename(ancestor));
    ancestor = parent;
  }
  return path.join(realpathSync(ancestor), ...suffix);
}
function execute(binary, parameters, env, stage) {
  const result = spawnSync(binary, parameters, {
    env, cwd: root, windowsHide: true, encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024,
    timeout: 60 * 60 * 1000,
  });
  // Never forward stderr/stdout or exception details: providers may include secrets.
  if (result.error || result.status !== 0) fail(`${stage}: falha. Detalhes do processo omitidos para proteger credenciais. Arquivo parcial, se existente, não é backup validado.`);
  return { output: result.stdout, warning: Boolean(result.stderr.trim()) };
}

try {
  if (args.length !== 1 || args[0] !== "--run") fail("Argumento inválido. Use --help ou --run; não passe credenciais por argumentos.");
  const require = createRequire(import.meta.url);
  const nextRequire = createRequire(require.resolve("next/package.json"));
  nextRequire("@next/env").loadEnvConfig(root, true, { info() {}, error() {} });
  const value = process.env.SENTINELA_DATABASE_URL;
  if (!value || /PREENCHER|PLACEHOLDER|[<>]/i.test(value)) fail("Preencha SENTINELA_DATABASE_URL no .env.local antes de executar.");
  let url;
  try { url = new URL(value); } catch { fail("SENTINELA_DATABASE_URL inválida; valor omitido."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !url.password || url.hash) fail("Conexão PostgreSQL incompleta ou inválida; valor omitido.");
  const allowed = new Set(["sslmode", "sslrootcert"]);
  if ([...url.searchParams.keys()].some(key => !allowed.has(key))) fail("Parâmetro de conexão não suportado; use somente sslmode e sslrootcert.");
  if (url.searchParams.getAll("sslmode").length !== 1 || url.searchParams.get("sslmode") !== "verify-full" || url.searchParams.getAll("sslrootcert").length > 1) fail("Exige sslmode=verify-full, sem parâmetros duplicados.");
  const ca = process.env.SENTINELA_DATABASE_SSLROOTCERT || url.searchParams.get("sslrootcert");
  if (!ca || !path.isAbsolute(ca) || !existsSync(ca) || !statSync(ca).isFile()) fail("Configure SENTINELA_DATABASE_SSLROOTCERT com caminho absoluto da CA confiável.");
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database || database.includes("/") || database.includes("=") || /[\r\n\0]/.test(database)) fail("Nome do banco inválido.");
  const bin = process.env.SENTINELA_POSTGRES_BIN || "C:/Program Files/PostgreSQL/17/bin";
  const dump = path.join(bin, process.platform === "win32" ? "pg_dump.exe" : "pg_dump");
  const restore = path.join(bin, process.platform === "win32" ? "pg_restore.exe" : "pg_restore");
  if (!existsSync(dump) || !existsSync(restore)) fail("Ferramentas PostgreSQL ausentes; nenhuma instalação automática será feita.");
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^PG/i.test(key) || /DATABASE_URL|SUPABASE.*(?:KEY|TOKEN|URL)/i.test(key)) delete env[key];
  }
  Object.assign(env, {
    PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username),
    PGDATABASE: database, PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: "verify-full",
    PGSSLROOTCERT: ca, PGCONNECT_TIMEOUT: "15", PGAPPNAME: "sentinela-local-backup",
    PGOPTIONS: "-c default_transaction_read_only=on", PGCLIENTENCODING: "UTF8",
  });
  const dumpVersion = execute(dump, ["--version"], env, "Versão pg_dump").output.trim();
  const restoreVersion = execute(restore, ["--version"], env, "Versão pg_restore").output.trim();
  if (!/\b17\./.test(dumpVersion) || !/\b17\./.test(restoreVersion)) fail("Este roteiro exige clientes PostgreSQL 17 para o servidor 17.11 aprovado.");
  const destination = physicalTarget(path.resolve(process.env.SENTINELA_BACKUP_DIR || "D:/Backups/SENTINELA"));
  if (!outsideRepo(destination)) fail("A pasta de backup deve ficar fora do repositório, inclusive após resolver links.");
  const started = new Date();
  const stamp = started.toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const folder = path.join(destination, `SENTINELA-PRODUCTION-${stamp}`);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  if (!outsideRepo(realpathSync(folder))) fail("Destino físico inválido.");
  if (process.platform === "win32") {
    const account = process.env.USERDOMAIN && process.env.USERNAME
      ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}` : null;
    if (!account) fail("Destino: identidade Windows indisponível para restringir a pasta.");
    execute("icacls.exe", [folder, "/inheritance:r", "/grant:r", `${account}:(OI)(CI)F`,
      "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F"], env, "Destino protegido");
  }
  const partial = path.join(folder, "database.dump.partial");
  const exported = execute(dump, ["--no-password", "--format=custom", "--lock-wait-timeout=10s", "--file", partial], env, "Exportação");
  if (statSync(partial).size === 0) fail("Exportação vazia; arquivo não validado.");
  const listed = execute(restore, ["--list", partial], env, "Inventário do arquivo");
  const archive = path.join(folder, "database.dump");
  renameSync(partial, archive);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  const entries = listed.output.split(/\r?\n/).filter(line => /^\d+;/.test(line)).length;
  const manifest = {
    project: "SENTINELA", environment: "PRODUCTION (destino deve ser conferido pelo operador)",
    startedAt: started.toISOString(), finishedAt: new Date().toISOString(), durationSeconds: (Date.now() - started.getTime()) / 1000,
    file: "database.dump", bytes: statSync(archive).size, sha256: hash.digest("hex"),
    format: "PostgreSQL custom", dumpVersion, restoreVersion, archiveEntries: entries,
    dumpExitCode: 0, listExitCode: 0, warnings: exported.warning || listed.warning,
    scope: "Banco acessível ao executor; sem filtros de schema. Roles globais e arquivos Storage não incluídos.",
    inventoryComparedWithRemote: false, restorationTested: false,
  };
  writeFileSync(path.join(folder, "archive-list.txt"), listed.output, { flag: "wx", mode: 0o600 });
  writeFileSync(path.join(folder, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ folder, ...manifest }, null, 2));
  if (manifest.warnings) { console.log("Há avisos não exibidos. Exige revisão segura antes de considerar o backup aprovado."); process.exitCode = 2; }
} catch (error) {
  // Print only fixed application messages; never native errors containing inputs.
  const safe = error instanceof Error && /^(Argumento|Preencha|SENTINELA_DATABASE_URL|Conexão PostgreSQL|Parâmetro de conexão|Exige sslmode|Configure SENTINELA_DATABASE_SSLROOTCERT|Nome do banco|Ferramentas PostgreSQL|Este roteiro|A pasta de backup|Destino|Exportação|Inventário do arquivo|Versão pg_)/.test(error.message);
  console.error(safe ? error.message : "Backup interrompido. Detalhes omitidos para proteger credenciais; nenhum arquivo deve ser considerado validado.");
  process.exitCode = 1;
}
