// Tratamento automático e auditado das pendências PCDF v2 (migration 0019).
// O importador chama `runPcdfTreatment` depois do COMMIT de cada competência. Cada lote é tratado numa
// transação própria; uma falha fica registrada como `falha_recuperavel` e é retomada na próxima execução,
// sem afetar a importação já gravada. Sem a 0019 instalada (ou após a reversão), nada é executado.
import type { Client } from "pg";
import { z } from "zod";
import { historicalTreatment, historicalTreatmentRun } from "../../contracts/pcdf-direct.ts";

type Treatment = z.infer<typeof historicalTreatment>;
type RunItem = z.infer<typeof historicalTreatmentRun>[number];
export type PcdfTreatmentProcess = "importacao-automatica" | "retomada";

const executable = (signature: string) => `coalesce(has_function_privilege(
  to_regprocedure('sentinela_pcdf_historico.${signature}'),'EXECUTE'),false)`;

export async function pcdfTreatmentInstalled(client: Client) {
  const { rows: [row] } = await client.query(`SELECT ${executable("tratar_lote(uuid,text)")} AS run`);
  return row?.run === true;
}

export async function pcdfTreatmentStatus(client: Client) {
  const { rows: [installed] } = await client.query(`SELECT ${executable("situacao_tratamento()")} AS ok`);
  if (installed?.ok !== true) return new Map<string, Treatment>();
  const { rows: [row] } = await client.query("SELECT sentinela_pcdf_historico.situacao_tratamento() AS data");
  const items = z.array(z.object({ month: z.string(), lot: z.uuid() }).passthrough()).parse(row?.data ?? []);
  return new Map(items.map(item => [item.month, historicalTreatment.parse({
    state: item.state, version: item.version, treated: item.treated, remaining: item.remaining,
    before: item.before, attempts: item.attempts, updatedAt: item.updatedAt,
  })]));
}

function failureCode(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? `sqlstate:${code}` : "falha_tratamento";
}

export async function runPcdfTreatment(client: Client, process: PcdfTreatmentProcess): Promise<RunItem[]> {
  if (!await pcdfTreatmentInstalled(client)) return [];
  const { rows: [pending] } = await client.query(
    "SELECT sentinela_pcdf_historico.lotes_pendentes_tratamento() AS lots");
  const lots = z.array(z.uuid()).parse(pending?.lots ?? []);
  const results: RunItem[] = [];
  for (const lot of lots) {
    try {
      await client.query("SELECT sentinela_pcdf_historico.iniciar_tratamento($1,$2)", [lot, process]);
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await client.query("SET LOCAL lock_timeout = '4s'");
      const { rows: [row] } = await client.query(
        "SELECT sentinela_pcdf_historico.tratar_lote($1,$2) AS data", [lot, process]);
      await client.query("COMMIT");
      const data = z.object({
        competencia: z.string().nullable().optional(), estado: z.enum(["concluido", "concluido_com_pendencias"]),
        tratadas: z.int().nonnegative().nullable(), restantes: z.int().nonnegative().nullable(), replay: z.boolean(),
      }).parse(row?.data);
      results.push({ lot, month: data.competencia ?? null, state: data.estado,
        treated: data.tratadas, remaining: data.restantes, replay: data.replay });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      await client.query("SELECT sentinela_pcdf_historico.registrar_falha_tratamento($1,$2)",
        [lot, failureCode(error)]).catch(() => {});
      results.push({ lot, month: null, state: "falha_recuperavel", treated: null, remaining: null, replay: false });
    }
  }
  return historicalTreatmentRun.parse(results);
}
