import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { persistentDestination, persistentReaders, persistentWriters } from "../../../src/lib/db/config.ts"
import { previousLedger, revision } from "./crud-sql.mjs"
import { approvedSource } from "./approved-source.mjs"

const assets = {
  "install.sql":"81d8d894b47f47fcd09cebc0ad318b6af15f19929f9f8904283b9e49d4e5af56",
  "consolidate.sql":"58f5105d5e5b4b3a89cc302e10d6f1de217fa7cc732cb732359f4d36ed9ad9f1",
  "workspace.sql":"291c9619f7282b34e2b2c86ec15d5454ad16df215a6c593001f5cf1acc6ecd7a",
  "catalog-fixtures.sql":"9bee51302fdbc9d231b2f370ae5f7cf2598ddc648f46f863b7a5526f961a1b08",
}
export const pcdfSchema="sentinela_homolog_pcdf"
const owner="s4_hom_pcdf"
const readers=Object.values(persistentReaders).join(",")
export const pcdfRevision="homolog-persist-0005"
const ledger=[...previousLedger,revision,"homolog-persist-0004"]
export const pcdfLedger=[...ledger,pcdfRevision]
const xmlFixture=Buffer.from("<Workbook><!-- synthetic provenance fixture --></Workbook>")
const xmlHash=createHash("sha256").update(xmlFixture).digest("hex")
const attestation=`current_database()='${persistentDestination.database}' AND host(inet_server_addr())='${persistentDestination.host}'
 AND inet_server_port()=${persistentDestination.port} AND current_setting('listen_addresses')='${persistentDestination.host}'
 AND current_setting('cluster_name')='${persistentDestination.cluster}'
 AND current_setting('server_version_num')='${persistentDestination.version}'
 AND sentinela_homologacao.system_identifier()='${persistentDestination.system}'`

async function source(name) {
  const bytes=await readFile(new URL("../pcdf-sandbox/"+name,import.meta.url))
  const text=approvedSource(bytes,assets[name])
  assert.equal(text.match(/^\\ir .*$/gm)?.length,1)
  return text.replace(/^\\(?:ir|set) .*\n|^BEGIN;\n|^COMMIT;\n/gm,"")
    .replaceAll("sentinela_write_lab","sentinela_homolog_crud")
    .replaceAll("sentinela_pcdf_lab",pcdfSchema)
    .replaceAll("sentinela_pcdf_sbx_importer",owner)
    .replaceAll("sentinela_sbx_admin",persistentWriters.Administrador.login)
    .replaceAll("sentinela_sbx_operator",persistentWriters.Operador.login)
    .replaceAll("sentinela_sbx_analyst",persistentReaders.Analista)
    .replaceAll("sentinela_rls_sandbox",persistentDestination.database)
    .replaceAll("55432",String(persistentDestination.port))
    .replaceAll("OR inet_server_port()<>55473 OR host(inet_server_addr())<>'127.0.0.1'",
      `OR NOT coalesce((${attestation}),false)`)
}

export async function pcdfSql() {
  let stage=await source("install.sql")
  const marker="  -- ponytail:" // Pin the insertion point before the first SQL write.
  const index=stage.indexOf(marker.trimStart())
  assert(index>=0)
  stage=stage.slice(0,index)+`IF xml_sha IS DISTINCT FROM '${xmlHash}' OR xml_size IS DISTINCT FROM ${xmlFixture.length}::bigint
   OR jsonb_typeof(batch->'rows') IS DISTINCT FROM 'array'
   OR jsonb_array_length(batch->'rows')>10000
   OR EXISTS(SELECT FROM jsonb_to_recordset(batch->'rows') r(raw jsonb) WHERE
      r.raw->>'versao_tratamento' IS DISTINCT FROM 'sandbox-fixture-v1'
      OR r.raw->>'aba_origem' IS DISTINCT FROM 'NATUREZAS'
      OR r.raw->>'fonte' IS DISTINCT FROM 'PCDF'
      OR coalesce(r.raw->>'linha_xml','') !~ '^[1-9][0-9]*$'
      OR r.raw->>'linha_origem_id' IS DISTINCT FROM concat('${xmlHash}:NATUREZAS:',r.raw->>'linha_xml'))
   THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Proveniencia sintetica recusada'; END IF;
 `+stage.slice(index)
  const reviewers=[persistentWriters.Administrador.login,persistentWriters.Operador.login,persistentReaders.Analista]
  let workspace=await source("workspace.sql")
  workspace=workspace.replaceAll("WHERE session_user IN (",`WHERE (${attestation}) AND session_user IN (`)
  workspace=workspace.replace("IF session_user NOT IN (",`IF NOT coalesce((${attestation}),false) OR session_user NOT IN (`)
  return `DO $guard$ BEGIN
  IF NOT coalesce((${attestation}),false) OR session_user<>'sprint4_migration' OR session_user<>current_user
    OR (SELECT array_agg(versao ORDER BY versao) FROM sentinela.schema_migrations) IS DISTINCT FROM
      ARRAY[${ledger.map(v=>`'${v}'`).join(",")}]
    OR EXISTS(SELECT FROM sentinela.extracoes_origem)
  THEN RAISE EXCEPTION 'Destino staging PCDF recusado'; END IF;
END $guard$;
${stage}
GRANT USAGE ON SCHEMA sentinela_homologacao TO ${owner};
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system(),sentinela_homologacao.system_identifier() TO ${owner};
${await source("consolidate.sql")}
${workspace}
${await source("catalog-fixtures.sql")}
CREATE POLICY homolog_pcdf_occ ON sentinela.ocorrencias FOR SELECT TO ${readers}
  USING (fonte='PCDF-SANDBOX' AND ativo AND consolidacao_status='consolidada');
CREATE POLICY homolog_pcdf_natures ON sentinela.naturezas_criminais FOR SELECT TO ${readers} USING(fonte='PCDF-SANDBOX');
CREATE POLICY homolog_pcdf_mapping ON sentinela.mapeamentos_natureza FOR SELECT TO ${readers}
  USING(versao='pcdf-sandbox-v1' AND status='homologado');
CREATE POLICY homolog_pcdf_category ON sentinela.categorias_criminais FOR SELECT TO ${readers}
  USING(versao_catalogo='pcdf-sandbox-v1' AND status='homologada');
INSERT INTO sentinela.schema_migrations(versao,descricao) VALUES ('${pcdfRevision}','Staging, revisao e promocao PCDF sinteticos');
-- Authenticated roles admitted by this workspace: ${reviewers.join(",")}
`
}
