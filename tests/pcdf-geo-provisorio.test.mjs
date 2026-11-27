import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../database/supabase/pendentes/${path}`, import.meta.url), "utf8");
const migration = read("0022_geo_provisorio_pcdf.sql");
const reversal = read("reverter_0022_geo_provisorio_pcdf.sql");

test("0022 withdraws only GEO pendencies whose occurrence has a published point", () => {
  assert.match(migration, /AS RESTRICTIVE\s+FOR SELECT TO sentinela_ocorrencias_reader/);
  assert.match(migration, /regra IN \('geo_referencia_pendente','referencia_pendente'\)/);
  assert.match(migration, /JOIN sentinela_ocorrencias_analytics\.pontos_pcdf_publicados p ON p\.id = a\.ocorrencia_id/);
  for (const kept of ["geo_ausente", "'ausente'", "revisao_utm_sem_geo", "utm_ausente"])
    assert.doesNotMatch(migration.split("CREATE POLICY")[1].split("));")[0], new RegExp(kept));
});

test("0022 keeps CRS as a documented global issue and never mutates pending records", () => {
  assert.match(migration, /'crsOrigem', 'nao confirmado: pendencia documental global da fonte PCDF'/);
  assert.match(migration, /NOT EXISTS \(SELECT FROM sentinela\.schema_migrations WHERE versao='0018'\)/);
  assert.doesNotMatch(migration, /UPDATE\s+sentinela\.|DELETE\s+FROM|TRUNCATE\s+(TABLE\s+)?sentinela\./i);
  assert.match(reversal, /DROP POLICY pendencias_pcdf_geo_publicado_leitura/);
  assert.doesNotMatch(reversal, /pcdf_pontos|DELETE\s+FROM|DROP TABLE/i);
});
