import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { historicalMonth, historicalTreatmentRun } from "../src/contracts/pcdf-direct.ts";
import { pcdfTreatmentStatus, runPcdfTreatment } from "../src/lib/db/pcdf-treatment.ts";

const migration = readFileSync(new URL("../database/supabase/pendentes/0019_projecao_utm_ausente_pcdf.sql", import.meta.url), "utf8");
const reversal = readFileSync(new URL("../database/supabase/pendentes/reverter_0019_projecao_utm_ausente_pcdf.sql", import.meta.url), "utf8");
const lot = "5d260526-fef6-4a4d-9ffc-8c1ac981540c";

function fakeClient({ installed = true, lots = [lot], fail = false } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push([sql.replace(/\s+/g, " ").trim(), params]);
      if (sql.includes("AS run")) return { rows: [{ run: installed }] };
      if (sql.includes("lotes_pendentes_tratamento")) return { rows: [{ lots }] };
      if (sql.includes("tratar_lote")) {
        if (fail) throw Object.assign(new Error("lock"), { code: "55P03" });
        return { rows: [{ data: { competencia: "2021-02", estado: "concluido_com_pendencias", tratadas: 4737, restantes: 8856, replay: false } }] };
      }
      if (sql.includes("AS ok")) return { rows: [{ ok: installed }] };
      if (sql.includes("situacao_tratamento()")) return { rows: [{ data: [{ month: "2021-02", lot, state: "concluido_com_pendencias",
        version: "pcdf-tratamento-v1", treated: 4737, remaining: 8856, before: 13593, attempts: 1, updatedAt: "2026-11-27T17:00:00Z" }] }] };
      return { rows: [] };
    },
  };
}

test("treatment runs each pending lot in its own transaction after the import commit", async () => {
  const client = fakeClient();
  const result = await runPcdfTreatment(client, "importacao-automatica");
  assert.deepEqual(result, [{ lot, month: "2021-02", state: "concluido_com_pendencias", treated: 4737, remaining: 8856, replay: false }]);
  const sql = client.calls.map(([text]) => text);
  assert.ok(sql.indexOf("BEGIN ISOLATION LEVEL READ COMMITTED") > sql.findIndex(text => text.includes("iniciar_tratamento")));
  assert.ok(sql.includes("COMMIT"));
  assert.equal(sql.some(text => text.includes("registrar_falha_tratamento")), false);
});

test("a failed treatment is rolled back and recorded as recoverable without throwing", async () => {
  const client = fakeClient({ fail: true });
  const result = await runPcdfTreatment(client, "importacao-automatica");
  assert.equal(result[0].state, "falha_recuperavel");
  const sql = client.calls.map(([text]) => text);
  assert.ok(sql.includes("ROLLBACK"));
  const failure = client.calls.find(([text]) => text.includes("registrar_falha_tratamento"));
  assert.deepEqual(failure[1], [lot, "sqlstate:55P03"]);
});

test("without the 0019 privileges nothing is executed and the history shows no treatment", async () => {
  const client = fakeClient({ installed: false });
  assert.deepEqual(await runPcdfTreatment(client, "retomada"), []);
  assert.equal((await pcdfTreatmentStatus(client)).size, 0);
  assert.equal(client.calls.some(([text]) => text.includes("tratar_lote(") && !text.includes("to_regprocedure")), false);
});

test("treatment status is attached to the competency contract", async () => {
  const treatment = (await pcdfTreatmentStatus(fakeClient())).get("2021-02");
  assert.equal(treatment.state, "concluido_com_pendencias");
  const month = { month: "2021-02", sha256: "a".repeat(64), bytes: 1, records: 1, candidates: 1, through: "2021-02-28",
    complete: true, state: "done", lot, unique: 1, links: 1, review: 0, issues: 1 };
  assert.equal(historicalMonth.safeParse({ ...month, treatment }).success, true);
  assert.equal(historicalMonth.safeParse({ ...month, treatment: { ...treatment, state: "resolvida" } }).success, false);
  assert.equal(historicalTreatmentRun.safeParse([{ lot, month: null, state: "aguardando", treated: null, remaining: null, replay: false }]).success, false);
});

test("the 0019 migration preserves pending records and keeps the rule auditable", () => {
  assert.doesNotMatch(migration, /UPDATE\s+sentinela\.pendencias_revisao|DELETE\s+FROM\s+sentinela\.|TRUNCATE\s+(TABLE\s+)?sentinela\./i);
  assert.match(migration, /AS RESTRICTIVE\s+FOR SELECT TO sentinela_ocorrencias_reader/);
  assert.match(migration, /tratamento_pendencias c WHERE c\.pendencia_id = id/);
  for (const table of ["tratamentos", "tratamento_pendencias"]) {
    assert.match(migration, new RegExp(`ALTER TABLE sentinela_pcdf_historico\\.${table} FORCE ROW LEVEL SECURITY`));
    assert.match(migration, new RegExp(`REVOKE ALL ON sentinela_pcdf_historico\\.${table} FROM PUBLIC, anon, authenticated, service_role`));
  }
  assert.match(migration, /'pcdf\.tratamento\.concluido'/);
  assert.match(migration, /sum\(tratadas\) FROM sentinela_pcdf_historico\.tratamentos\) <> 49201/);
  assert.match(migration, /sum\(restantes\) FROM sentinela_pcdf_historico\.tratamentos\) <> 100751/);
  assert.match(migration, /count\(\*\) FROM sentinela\.pendencias_revisao\) <> 168575/);
  // Regras sem homologação permanecem registradas como não aplicadas.
  for (const rule of ["classificacao", "regiaoAdministrativa", "endereco", "geografia"])
    assert.match(migration, new RegExp(`'${rule}', jsonb_build_object\\('aplicada', false`));
  assert.match(reversal, /DROP POLICY pendencias_pcdf_utm_ausente_leitura/);
  assert.match(reversal, /REVOKE EXECUTE ON FUNCTION sentinela_pcdf_historico\.iniciar_tratamento/);
  assert.doesNotMatch(reversal, /DROP TABLE|DELETE FROM/i);
});
