import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import { Client } from "pg";
import { csvName, fixture } from "./fixtures/pcdf-v2-package.mjs";
import { v1 } from "./fixtures/pcdf-v1-package.mjs";
import { preparePcdfV2Delivery } from "../src/lib/db/pcdf-v2-delivery.ts";

const root = process.env.SENTINELA_MANAGEMENT_FIXTURE;
const subject = Symbol.for("sentinela-gestao-test");
const account = "a".repeat(64);
const host = "127.0.0.1:3318";
const origin = "http://" + host;
const path = "/api/v1/ocorrencias/gestao";
const logins = { Administrador: "sentinela_local_admin", Operador: "sentinela_local_operator", Analista: "sentinela_local_analyst" };
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const settings = { NODE_ENV: "development", SENTINELA_AUTH_PROVIDER: "local", SENTINELA_LOCAL_BIND: "127.0.0.1",
  SENTINELA_APP_ORIGIN: origin, SENTINELA_HTTP_VALIDATION_ID: randomUUID(), SENTINELA_PCDF_SYNTHETIC: "1",
  SENTINELA_PCDF_V2_SYNTHETIC_WRITE: "1", SENTINELA_OCCURRENCE_MANAGEMENT: "1",
  VERCEL: "", VERCEL_ENV: "", SENTINELA_PERSISTENT_HOMOLOGATION: "0", SENTINELA_SANDBOX_WRITE: "0" };

const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
  if (specifier === "@/lib/auth/local-server")
    return { url: "data:text/javascript,export const getLocalPrincipal=()=>globalThis[Symbol.for('sentinela-gestao-test')]", shortCircuit: true };
  if (specifier.startsWith("@/")) return next(new URL("../src/" + specifier.slice(2) + ".ts", import.meta.url).href, context);
  if (specifier === "next/headers") return next("next/headers.js", context);
  if (/^\.{1,2}\//.test(specifier) && context.parentURL?.startsWith(new URL("../src/", import.meta.url).href)) {
    const candidate = new URL(specifier + ".ts", context.parentURL);
    if (existsSync(candidate)) return next(candidate.href, context);
  }
  return next(specifier, context);
} });

test("o serviço de gestão exige modo sintético explícito", async () => {
  const { occurrenceManagementMode } = await import("../src/lib/db/occurrence-management-mode.ts");
  const config = { ...settings, SENTINELA_PCDF_LOCAL_ID: randomUUID(),
    SENTINELA_PCDF_LOCAL_SYSTEM_ID: "12345678901234567", SENTINELA_PCDF_LOCAL_START: "1700000000" };
  assert.equal(occurrenceManagementMode(config)?.port, 55488);
  for (const patch of [{ SENTINELA_PCDF_SYNTHETIC: "0" }, { SENTINELA_OCCURRENCE_MANAGEMENT: "0" },
    { VERCEL: "1" }, { NODE_ENV: "production" }, { SENTINELA_LOCAL_BIND: "0.0.0.0" }])
    assert.equal(occurrenceManagementMode({ ...config, ...patch }), null);
});

test("a prévia operacional de leitura não carrega uma revisão para excluir", async () => {
  const { lotPurgeAssessment, lotPurgePreview, managementWrite } = await import("../src/contracts/occurrence-management.ts");
  const id = randomUUID();
  const draft = { escopo: "consulta", id, arquivo: "homologacao.csv", competencia: "2026-01", contrato: "1.0",
    associacoes: 3, pendenciasRegistradas: 2, dependencias: ["sentinela.linhas_staging"] };
  assert.deepEqual(lotPurgeAssessment.parse(draft), draft);
  assert.equal(lotPurgePreview.safeParse(draft).success, false);
  assert.equal(lotPurgeAssessment.safeParse({ ...draft, revisao: sha("tentativa") }).success, false);
  assert.equal(managementWrite.safeParse({ acao: "excluir_lote", id, confirmacao: id, definitiva: true,
    justificativa: "Ensaio de contrato" }).success, false);
});

test("a exceção aceita UUID e revisão e recusa prova de backup fornecida pelo navegador", async () => {
  const { managementWrite, protectedJanuaryLot } = await import("../src/contracts/occurrence-management.ts");
  const target = { id: protectedJanuaryLot, revisao: sha("revisão"), confirmacao: protectedJanuaryLot };
  const approval = { ...target, acao: "autorizar_exclusao" };
  const deletion = { ...target, acao: "excluir_lote", definitiva: true, palavra: "EXCLUIR", justificativa: "Ensaio" };
  assert.equal(managementWrite.safeParse(approval).success, true);
  assert.equal(managementWrite.safeParse({ ...approval, provaBackup: sha("prova fabricada") }).success, false);
  assert.equal(managementWrite.safeParse(deletion).success, true);
  assert.equal(managementWrite.safeParse({ ...deletion, palavra: "excluir" }).success, false);
  assert.equal(managementWrite.safeParse({ ...deletion, provaBackup: sha("prova fabricada") }).success, false);
});

test("o clone usa somente sua porta de banco e recusa a origem principal", async () => {
  const { operationalOccurrenceManagementMode } = await import("../src/lib/db/occurrence-management-mode.ts");
  const config = { ...settings, SENTINELA_PCDF_LOCAL_ID: randomUUID(),
    SENTINELA_PCDF_LOCAL_SYSTEM_ID: "12345678901234567", SENTINELA_PCDF_LOCAL_START: "1700000000",
    SENTINELA_PCDF_SYNTHETIC: "0", SENTINELA_OPERATIONAL_CLONE: "1", SENTINELA_OPERATIONAL_IMPORT_MANAGEMENT: "1" };
  assert.equal(operationalOccurrenceManagementMode(config)?.port, 55487);
  assert.equal(operationalOccurrenceManagementMode({ ...config, SENTINELA_APP_ORIGIN: "http://localhost:3000" }), null);
  assert.equal(operationalOccurrenceManagementMode({ ...config, SENTINELA_HTTP_VALIDATION_ID: "" }), null);
  assert.equal(operationalOccurrenceManagementMode({ ...config, SENTINELA_PCDF_SYNTHETIC: "1" }), null);
});

test("Supabase operacional exige o lançador atestado e a identidade vinculada", async () => {
  const { integratedSupabaseMode } = await import("../src/lib/db/pcdf-direct-mode.ts");
  const { operationalActor } = await import("../src/lib/db/operational-import-review.ts");
  const config = { NODE_ENV: "development", SENTINELA_AUTH_PROVIDER: "supabase",
    SENTINELA_INTEGRATED_SUPABASE: "1", SENTINELA_LOCAL_BIND: "127.0.0.1", SENTINELA_APP_ORIGIN: "http://localhost:3000",
    SENTINELA_DEV_LOCAL_INSTANCE: sha("instalação"), SENTINELA_PCDF_LOCAL_ID: randomUUID(),
    SENTINELA_PCDF_LOCAL_SYSTEM_ID: "12345678901234567", SENTINELA_PCDF_LOCAL_START: "1700000000",
    NEXT_PUBLIC_SUPABASE_URL: "https://projeto.example", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" };
  assert.equal(integratedSupabaseMode(config)?.port, 55484);
  for (const patch of [{ SENTINELA_INTEGRATED_SUPABASE: "0" }, { SENTINELA_LOCAL_BIND: "0.0.0.0" },
    { SENTINELA_PCDF_SYNTHETIC: "1" }, { SENTINELA_OPERATIONAL_CLONE: "1" }, { SENTINELA_LOCAL_DEMO: "1" },
    { NODE_ENV: "production" }, { VERCEL: "1" }, { SENTINELA_DEV_LOCAL_INSTANCE: "" }])
    assert.equal(integratedSupabaseMode({ ...config, ...patch }), null);

  const previous = new Map(Object.keys(config).map(key => [key, process.env[key]]));
  Object.assign(process.env, config);
  try {
    const principal = { source: "supabase", role: "Administrador", id: randomUUID(), authUserId: randomUUID() };
    assert.deepEqual(operationalActor(principal), { subject: principal.id,
      account: sha(JSON.stringify(["sentinela-supabase", config.NEXT_PUBLIC_SUPABASE_URL, principal.authUserId])) });
    assert.equal(operationalActor({ ...principal, role: "Operador" }), null);
    assert.equal(operationalActor({ ...principal, role: "Analista" }), null);
    assert.equal(operationalActor({ ...principal, source: "preview" }), null);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

async function testPackage(admin, directPcdf) {
  const xml = Buffer.from("<Workbook><!-- " + randomUUID() + " --></Workbook>");
  const digestXml = sha(xml);
  const pkg = fixture(({ manifest, rows, provenance }) => {
    manifest.fonte = { ...manifest.fonte, nome: "fixture.xml", bytes: xml.length, sha256: digestXml };
    for (const [i, record] of rows.entries()) {
      record.linha_origem_id = sha(JSON.stringify(["pcdf-linha-v1", digestXml, "NATUREZAS", Number(record.linha_xml)]));
      provenance[i].linha_origem_id = record.linha_origem_id;
    }
  });
  const { digest, delivery } = await preparePcdfV2Delivery(pkg.csv, pkg.attachments);
  const approve = () => admin.query(`INSERT INTO sentinela_pcdf_local.aprovacoes_pacote(digest,contrato,xml_sha256,projecao_sha256)
    VALUES($1,'2.0',$2,encode(sha256(convert_to(($3::jsonb)::text,'UTF8')),'hex'))`, [digest, digestXml, delivery]);
  await approve();
  const send = async expected => {
    const body = new FormData();
    body.set("csv", pkg.csv);
    for (const file of pkg.attachments) body.append("artefato", file);
    body.set("digest", digest);
    const result = await directPcdf(new Request(origin + "/api/v1/importacoes/pcdf/direta?etapa=confirmar&versao=2.0",
      { method: "POST", headers: { host, origin }, body }));
    const decoded = await result.json();
    assert.equal(result.status, expected, JSON.stringify(decoded.error));
    return decoded.data;
  };
  return Object.assign(send, { approve, digest, xml, csv: pkg.csv });
}

async function purgeCounts(client, { lot, run, extraction, origins, digest, requests }) {
  const { rows: [counts] } = await client.query(`SELECT
    (SELECT count(*)::int FROM sentinela.lotes_importacao WHERE id=$1) AS lotes,
    (SELECT count(*)::int FROM sentinela.execucoes_importacao WHERE id=$2) AS execucoes,
    (SELECT count(*)::int FROM sentinela.linhas_staging WHERE lote_id=$1) AS staging,
    (SELECT count(*)::int FROM sentinela.linhas_origem WHERE id=ANY($4::uuid[])) AS origens,
    (SELECT count(*)::int FROM sentinela.extracoes_origem WHERE id=$3) AS extracoes,
    (SELECT count(*)::int FROM sentinela.pendencias_revisao WHERE linha_origem_id=ANY($4::uuid[])) AS pendencias,
    (SELECT count(*)::int FROM sentinela_pcdf_local.entregas_pacote WHERE execucao_id=$2) AS entregas,
    (SELECT count(*)::int FROM sentinela_pcdf_local.aprovacoes_pacote WHERE digest=$5) AS aprovacoes,
    (SELECT count(*)::int FROM sentinela.eventos_auditoria WHERE execucao_id=$2 OR depois->>'loteId'=$1::uuid::text
      OR depois->>'lot'=$1::uuid::text OR request_id=ANY($6::text[])) AS auditorias,
    (SELECT count(*)::int FROM sentinela_import_local.requests WHERE request::text=ANY($6::text[]) OR receipt->>'lot'=$1::uuid::text) AS recibos,
    (SELECT count(*)::int FROM sentinela_gestao.inativacoes WHERE lote_id=$1 OR auditoria_id IN (
      SELECT id FROM sentinela.eventos_auditoria WHERE execucao_id=$2)) AS inativacoes
  `, [lot, run, extraction, origins, digest ?? null, requests]);
  return counts;
}

async function purgeTarget(client, receipt, digest) {
  const { rows: [target] } = await client.query(`SELECT l.extracao_id AS extraction,
    ARRAY(SELECT DISTINCT s.linha_origem_id FROM sentinela.linhas_staging s WHERE s.lote_id=l.id) AS origins,
    ARRAY(SELECT DISTINCT e.request_id FROM sentinela.eventos_auditoria e WHERE e.execucao_id=$2) AS requests
    FROM sentinela.lotes_importacao l WHERE l.id=$1`, [receipt.lot, receipt.run]);
  return { ...receipt, ...target, digest };
}

async function oldLot(admin, sourceLot, ordinal = 1) {
  const id = randomUUID(), run = randomUUID();
  await admin.query(`INSERT INTO sentinela.lotes_importacao(id,extracao_id,nome_arquivo,sha256_arquivo,tamanho_bytes,
   referencia_arquivo,versao_contrato,versao_tratamento,competencia,solicitado_por)
   SELECT $2,extracao_id,'fixture-legado.csv',$3,100,'fixture:legado','1.0','fixture',competencia,solicitado_por
   FROM sentinela.lotes_importacao WHERE id=$1`, [sourceLot, id, sha(id)]);
  await admin.query(`INSERT INTO sentinela.execucoes_importacao(id,lote_id,extracao_id,tentativa,solicitado_por,versao_importador,
   versao_validacao,status,linhas_lidas,linhas_processadas,linhas_bloqueadas,finalizado_em)
   SELECT $2,l.id,l.extracao_id,1,l.solicitado_por,'pcdf-local-v1','pcdf-local-v1','concluida',1,1,1,clock_timestamp()
   FROM sentinela.lotes_importacao l WHERE l.id=$1`, [id, run]);
  await admin.query(`INSERT INTO sentinela.linhas_staging(execucao_id,lote_id,extracao_id,linha_origem_id,registro_csv,
   campos_csv,derivados_efetivos,diagnosticos,estado)
   SELECT $2,$3,extracao_id,linha_origem_id,registro_csv,campos_csv||'{"data_inicio_fato_original":"13/01/2021 09:04:59",
   "natureza_sentinela_codigo":"","versao_mapeamento":"","ra_codigo":"","latitude":"","longitude":"",
   "aba_origem":"NATUREZAS","versao_tratamento":"fixture"}',derivados_efetivos,diagnosticos,'bloqueada'
   FROM sentinela.linhas_staging WHERE lote_id=$1 AND registro_csv=$4`, [sourceLot, run, id, ordinal]);
  return id;
}

async function manualTerritory(client, latitude, longitude) {
  const { rows } = await client.query(`SELECT id,codigo_interno AS codigo FROM sentinela.regioes_administrativas
    WHERE extensions.ST_Contains(limite,extensions.ST_SetSRID(extensions.ST_MakePoint($2,$1),4326))`, [latitude, longitude]);
  assert.equal(rows.length, 1);
  return { raId: rows[0].id, codigo: rows[0].codigo, coordenadas: { latitude, longitude } };
}

test("gestão HTTP e SQL em PostgreSQL sintético", { skip: !root }, async t => {
  const realRoot = realpathSync(root);
  assert.equal(dirname(realRoot).toLowerCase(), realpathSync(tmpdir()).toLowerCase());
  assert.match(basename(realRoot), /^sentinela-occurrence-management-[a-z0-9_]+$/i);
  const password = readFileSync(join(realRoot, "setup-password"), "ascii");
  assert.match(password, /^[a-f0-9]{64}$/);
  const savedEnv = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  const config = { host: "127.0.0.1", database: "sentinela_pcdf_local", port: 55488, ssl: false, connectionTimeoutMillis: 3000 };
  const admin = new Client({ ...config, user: "postgres", password });
  try {
    await admin.connect();
    const { rows: [identity] } = await admin.query(`SELECT current_setting('data_directory') AS directory,
      current_setting('sentinela.sandbox_uuid') AS id FROM pg_control_system()
      WHERE current_database()='sentinela_pcdf_local' AND inet_server_port()=55488 AND inet_server_addr()=inet '127.0.0.1'
      AND to_regnamespace('sentinela_gestao') IS NOT NULL`);
    assert.equal(realpathSync(identity.directory), realpathSync(join(realRoot, "data")));
    assert.equal(identity.id, process.env.SENTINELA_PCDF_LOCAL_ID);
    const { GET, POST } = await import("../src/app/api/v1/ocorrencias/gestao/route.ts");
    const { GET: consult } = await import("../src/app/api/v1/ocorrencias/consulta/route.ts");
    const { GET: analytics } = await import("../src/app/api/v1/analytics/persistente/route.ts");
    const { GET: getManualCatalog, POST: createManual } = await import("../src/app/api/v1/ocorrencias/manuais/route.ts");
    const { directPcdf } = await import("../src/lib/db/pcdf-direct.ts");
    const session = (role = "Administrador") => { globalThis[subject] = role && { role, source: "local", localAccountId: account }; };
    const request = (endpoint, query = {}) => new Request(origin + endpoint + "?" + new URLSearchParams(query), { headers: { host } });
    const get = query => GET(request(path, query));
    const getConsultation = query => consult(request("/api/v1/ocorrencias/consulta", query));
    const getAnalytics = query => analytics(request("/api/v1/analytics/persistente", query));
    const post = (payload, site = origin) => POST(new Request(origin + path, {
      method: "POST", headers: { host, origin: site, "content-type": "application/json" }, body: JSON.stringify(payload),
    }));
    const check = async (response, status = 200) => {
      const result = await response;
      const body = await result.json();
      assert.equal(result.status, status, JSON.stringify(body.error));
      return body.data ?? body.error;
    };
    const create = (draft, key = randomUUID(), site = origin, sourceHost = host) => createManual(new Request(origin + "/api/v1/ocorrencias/manuais", {
      method: "POST", headers: { host: sourceHost, origin: site, "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(draft),
    }));
    const { rows: catalog } = await admin.query("SELECT id,codigo_manual FROM sentinela.naturezas_criminais WHERE codigo_manual LIKE 'TESTE-%' ORDER BY codigo_manual");
    assert.equal(catalog.length, 3);
    const { raId, coordenadas } = await manualTerritory(admin, -15.7942, -47.8825);
    const moved = await manualTerritory(admin, -15.832, -48.056);
    assert.notEqual(moved.raId, raId);
    const manualDraft = { data: "2025-01-01", horario: "12:30:00", cep: "70070010", endereco: "Endereço sintético",
      bairroOuSetor: "Setor sintético", raId, coordenadas, localizacaoConfirmada: true,
      naturezas: catalog.slice(0, 2).map(({ id }, i) => ({ naturezaId: id, crimeTentado: i === 0 ? null : false })),
      dadosCrime: { descricao: "Descrição original sintética", meio: "veiculo", vitimas: 0, autores: 0 } };
    session();
    const receive = await testPackage(admin, directPcdf);
    const newId = (await receive(201)).lot;
    const legacy = await oldLot(admin, newId);
    const snapshots = (await admin.query("SELECT * FROM sentinela.linhas_staging WHERE lote_id=$1 ORDER BY registro_csv", [newId])).rows;
    const fieldsBefore = snapshots.map(row => row.campos_csv);
    const [first, second] = snapshots.map(row => row.id);
    const readLot = id => check(get({ view: "arquivo", id }));
    const readTarget = (view, id) => check(get({ view, id }));
    const previewPurge = id => check(get({ view: "previa_exclusao", id }));
    const purgeCommand = ({ id, revisao }) => ({
      acao: "excluir_lote", id, confirmacao: id, revisao, definitiva: true, justificativa: "Exclusão física da fixture",
    });
    const purgeEvidence = {};
    await t.test("disponibilidade deriva da sessão, do ambiente e da prontidão do banco", async () => {
      const view = { view: "disponibilidade" };
      session(null);
      await check(get(view), 401);
      session("Operador");
      assert.deepEqual(await check(get(view)), { catalogoGestao: true, escrita: "sem_permissao" });
      session("Analista");
      assert.deepEqual(await check(get(view)), { catalogoGestao: false, escrita: "sem_permissao" });
      session();
      assert.deepEqual(await check(get(view)), { catalogoGestao: true, escrita: "disponivel" });
      process.env.SENTINELA_OCCURRENCE_MANAGEMENT = "0";
      try { assert.deepEqual(await check(get(view)), { catalogoGestao: false, escrita: "ambiente_bloqueado" }); }
      finally { process.env.SENTINELA_OCCURRENCE_MANAGEMENT = "1"; }
      await admin.query("ALTER ROLE sentinela_local_admin SET default_transaction_read_only=on");
      try { assert.deepEqual(await check(get(view)), { catalogoGestao: false, escrita: "banco_sem_escrita" }); }
      finally { await admin.query("ALTER ROLE sentinela_local_admin RESET default_transaction_read_only"); }
      const attested = process.env.SENTINELA_PCDF_LOCAL_ID;
      process.env.SENTINELA_PCDF_LOCAL_ID = randomUUID();
      try { await check(get(view), 503); }
      finally { process.env.SENTINELA_PCDF_LOCAL_ID = attested; }
    });
    const custody = () => admin.query("SELECT digest, nomes, artefatos FROM sentinela_pcdf_local.entregas_pacote WHERE execucao_id=$1", [snapshots[0].execucao_id]);
    const originRows = () => admin.query("SELECT * FROM sentinela.linhas_origem WHERE id=ANY($1::uuid[]) ORDER BY id", [snapshots.map(row => row.linha_origem_id)]);
    const { rows: originals } = await custody();
    const { rows: originalProvenance } = await originRows();
    assert.equal(originals.length, 1);
    assert.equal(originals[0].artefatos.length, 6);
    await t.test("analytics atestado distingue vazio, staging e permissões dos três perfis", async () => {
      session(null);
      await check(getAnalytics(), 401);
      for (const role of Object.keys(logins)) {
        session(role);
        const data = await check(getAnalytics());
        assert.equal(data.total, 0);
        assert.equal(data.mapTotal, 0);
        assert.deepEqual(data.points, []);
        assert.deepEqual(data.natures, []);
        assert.equal(data.regions.length, 37);
      }
      await check(getAnalytics({ startDate: "invalida" }), 400);
      const attested = process.env.SENTINELA_PCDF_LOCAL_SYSTEM_ID;
      process.env.SENTINELA_PCDF_LOCAL_SYSTEM_ID = "12345678901234567";
      try { await check(getAnalytics(), 503); }
      finally { process.env.SENTINELA_PCDF_LOCAL_SYSTEM_ID = attested; }
      session();
    });

    await t.test("lista, filtros, paginação, proveniência e perfis", async () => {
      const list = await check(get({ view: "arquivos", busca: newId, competencia: "2021-01", situacao: "com_pendencias" }));
      assert.equal(list.total, 1);
      assert.equal(list.itens[0].contrato, "2.0");
      assert.equal(list.itens[0].candidatas, 1);
      assert.equal(list.itens[0].recebidos, 2);
      assert.equal((await check(get({ view: "arquivos", busca: newId, pagina: 2 }))).itens.length, 0);
      assert.equal((await check(get({ view: "arquivos", busca: newId, dataFinal: "2000-01-01" }))).total, 0);
      const detail = await readLot(newId);
      assert.equal(detail.pacote.artefatos.length, 6);
      assert.equal(detail.compartilhadas, 1);
      assert.equal(detail.tentativas.length, 1);
      assert.equal((await readLot(legacy)).contrato, "1.0");
      const lookup = await check(getConsultation({ view: "detalhe", area: "importados", id: first }));
      assert.equal(Object.keys(lookup.campos).length, 26);
      const scoped = await check(getConsultation({ view: "importados", lote: newId }));
      assert.equal(scoped.total, 2);
      assert.ok(scoped.itens.every(item => item.lote === newId && item.acoes.editar));
      for (const row of scoped.itens) {
        for (const busca of [row.id, row.identificacao, row.natureza, row.ra, row.local].filter(Boolean)) {
          const found = await check(getConsultation({ view: "importados", lote: newId, busca }));
          assert.ok(found.itens.some(item => item.id === row.id));
          assert.ok(found.itens.every(item => item.lote === newId));
        }
      }
      assert.equal((await check(getConsultation({ view: "importados", lote: legacy, busca: first }))).total, 0);
      await check(getConsultation({ view: "importados", busca: first }), 400);
      session("Operador");
      assert.equal((await readLot(newId)).id, newId);
      assert.ok((await check(getConsultation({ view: "importados", lote: newId }))).itens.every(item => !item.acoes));
      await check(get({ view: "importados", id: first }), 403);
      session("Analista");
      await check(get({ view: "arquivos" }), 403);
      session(null);
      await check(get({ view: "arquivos" }), 401);
      session();
    });

    await t.test("correção administrativa, concorrência e isolamento por associação", async () => {
      const target = await readTarget("importados", first);
      assert.equal(target.vinculos, 2);
      const command = { acao: "corrigir_associacao", id: first, lote: newId, revisao: target.revisao, justificativa: "Revisão sintética",
        alteracoes: { natureza: "ESTUPRO DE VULNERÁVEL", horario: "16:10:32" } };
      session("Operador");
      await check(post(command), 403);
      session("Analista");
      await check(post(command), 403);
      session();
      process.env.SENTINELA_PCDF_SYNTHETIC = "0";
      try { await check(post(command), 403); }
      finally { process.env.SENTINELA_PCDF_SYNTHETIC = "1"; }
      await check(post(command, "http://127.0.0.1:1"), 403);
      await check(post({ ...command, lote: legacy }), 404);
      for (const field of ["linha_xml", "linha_origem_id", "ocorrencia_chave", "sha256", "manifesto"])
        await check(post({ ...command, alteracoes: { [field]: "alteração proibida" } }), 422);
      const responses = await Promise.all([post(command), post(command)]);
      assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
      assert.equal((await readTarget("importados", first)).natureza, "ESTUPRO DE VULNERÁVEL");
      const revision = (await readTarget("importados", first)).historico[0];
      assert.equal(revision.antes.natureza, target.natureza);
      assert.equal(revision.depois.natureza, "ESTUPRO DE VULNERÁVEL");
      assert.equal(revision.responsavel, logins.Administrador);
      assert.equal(revision.conta, account);
      assert.equal(revision.justificativa, command.justificativa);
      assert.ok(Date.parse(revision.data));
      assert.equal((await readTarget("importados", second)).natureza, "NATUREZA B");
      const filtered = await check(getConsultation({ view: "importados", natureza: "ESTUPRO DE VULNERÁVEL" }));
      assert.ok(filtered.itens.some(row => row.id === first));
      const unchanged = await check(getConsultation({ view: "detalhe", area: "importados", id: first }));
      assert.deepEqual(unchanged.campos, fieldsBefore[0]);
      assert.deepEqual((await custody()).rows, originals);
      assert.deepEqual((await originRows()).rows, originalProvenance);
    });

    await t.test("lote compartilhado, pendências, rollback e reenvio v2 depois da inativação", async () => {
      const before = await check(getConsultation({ view: "resumo" }));
      const lot = await readLot(newId);
      assert.ok(lot.pendenciasAfetadas > 0);
      const command = { acao: "inativar_lote", id: newId, confirmacao: newId, revisao: lot.revisao, justificativa: "Inativação sintética" };
      session("Operador");
      await check(post(command), 403);
      session("Analista");
      await check(post(command), 403);
      session();
      await check(post({ ...command, confirmacao: legacy }), 422);
      await admin.query("ALTER TABLE sentinela_gestao.inativacoes ADD CONSTRAINT teste_gestao_falha CHECK (lote_id IS NULL) NOT VALID");
      try { await check(post(command), 503); }
      finally { await admin.query("ALTER TABLE sentinela_gestao.inativacoes DROP CONSTRAINT teste_gestao_falha"); }
      assert.equal((await readLot(newId)).historico.some(event => event.acao === "inativar_lote"), false);
      await check(post(command));
      await check(post(command), 409);
      const after = await check(getConsultation({ view: "resumo" }));
      assert.equal(after.recebidas, before.recebidas - 2);
      assert.equal(after.pendencias, before.pendencias - lot.pendenciasAfetadas);
      const inactive = await readLot(newId);
      assert.equal(inactive.situacao, "inativada");
      assert.equal(inactive.historico.filter(event => event.acao === "inativar_lote").length, 1);
      assert.equal((await readLot(legacy)).situacao, "concluida");
      assert.equal((await receive(200)).lot, newId);
      assert.equal((await readLot(newId)).situacao, "inativada");
      await check(getConsultation({ view: "detalhe", area: "importados", id: second }), 404);
      const contents = await admin.query("SELECT campos_csv FROM sentinela.linhas_staging WHERE lote_id=$1 ORDER BY registro_csv", [newId]);
      assert.deepEqual(contents.rows.map(row => row.campos_csv), fieldsBefore);
      assert.deepEqual((await custody()).rows, originals);
      assert.deepEqual((await originRows()).rows, originalProvenance);
    });

    await t.test("cadastro completo, idempotência, rollback e leitura por nova conexão", async () => {
      const endpoint = "/api/v1/ocorrencias/manuais";
      session("Administrador");
      assert.equal((await check(getManualCatalog(request(endpoint)))).cadastroDisponivel, true);
      const persisted = async () => (await admin.query(`SELECT
        (SELECT count(*) FROM sentinela.ocorrencias WHERE fonte='SENTINELA_MANUAL') AS ocorrencias,
        (SELECT count(*) FROM sentinela.ocorrencia_naturezas WHERE origem='manual') AS naturezas,
        (SELECT count(*) FROM sentinela_ocorrencias_manual.cadastros) AS recibos,
        (SELECT count(*) FROM sentinela.eventos_auditoria WHERE acao='ocorrencia.manual.criada') AS auditorias`)).rows[0];
      const counts = await persisted();
      const full = { ...manualDraft, numero: "20", complemento: "Bloco A", referencia: "Praça sintética",
        naturezas: [...manualDraft.naturezas, { naturezaId: catalog[2].id, crimeTentado: true }],
        dadosCrime: { ...manualDraft.dadosCrime, observacoes: "Observação sintética" } };
      for (const patch of [{ cep: undefined }, { localizacaoConfirmada: undefined }, { localizacaoConfirmada: false },
        { raId: "RA-I" }, { raId: randomUUID() }, { raId: moved.raId }, { coordenadas: { latitude: 0, longitude: 0 } },
        { dadosCrime: undefined }, { naturezas: [] }, { naturezas: [{ naturezaId: catalog[0].id }] }])
        await check(create({ ...full, ...patch }), 422);
      for (const patch of [{ descricao: "\t \u00a0" }, { descricao: undefined }, { meio: undefined }, { meio: "indefinido" },
        { vitimas: undefined }, { autores: undefined }, { vitimas: -1 }, { autores: 1.5 }, { autores: 1000000 }, { vitimas: "0" }])
        await check(create({ ...full, dadosCrime: { ...full.dadosCrime, ...patch } }), 422);
      await check(create(full, randomUUID(), "http://127.0.0.1:9999"), 403);
      await check(create(full, randomUUID(), origin, "localhost:3318"), 403);
      const synthetic = process.env.SENTINELA_PCDF_SYNTHETIC;
      process.env.SENTINELA_PCDF_SYNTHETIC = "0";
      try { await check(create(full), 503); }
      finally { process.env.SENTINELA_PCDF_SYNTHETIC = synthetic; }
      session("Analista");
      await check(create(full), 403);
      session("Administrador");
      const failureKey = process.env.SENTINELA_MANUAL_ROLLBACK_KEY;
      assert.match(failureKey, /^[a-f0-9-]{36}$/);
      await check(create(full, failureKey), 503);
      assert.deepEqual(await persisted(), counts);

      const key = randomUUID();
      const [created, replay] = await Promise.all([check(create(full, key), 201), check(create(full, key), 201)]);
      assert.deepEqual(created, replay);
      await check(create({ ...full, dadosCrime: { ...full.dadosCrime, autores: 1 } }, key), 409);
      assert.deepEqual(await persisted(), { ocorrencias: String(Number(counts.ocorrencias) + 1),
        naturezas: String(Number(counts.naturezas) + 3), recibos: String(Number(counts.recibos) + 1),
        auditorias: String(Number(counts.auditorias) + 1) });
      const { rows: [audit] } = await admin.query(`SELECT depois,registrado_em,request_id,
        extensions.ST_SRID(o.geometria) AS srid,extensions.ST_X(o.geometria) AS lon,extensions.ST_Y(o.geometria) AS lat
        FROM sentinela.eventos_auditoria e JOIN sentinela.ocorrencias o ON o.id=e.ocorrencia_id
        WHERE o.id=$1 AND e.acao='ocorrencia.manual.criada'`, [created.id]);
      assert.equal(audit.srid, 4326);
      assert.equal(audit.lon, full.coordenadas.longitude);
      assert.equal(audit.lat, full.coordenadas.latitude);
      assert.equal(audit.request_id, key);
      assert.ok(audit.registrado_em instanceof Date);
      assert.equal(audit.depois.contaLocal, account);
      assert.equal(audit.depois.login, logins.Administrador);
      assert.equal(audit.depois.raId, raId);
      assert.deepEqual(audit.depois.dadosCrime, full.dadosCrime);
      assert.deepEqual(audit.depois.naturezas, full.naturezas);

      session("Analista");
      const detail = await check(getConsultation({ view: "detalhe", area: "manuais", id: created.id }));
      assert.deepEqual(detail.endereco, { cep: full.cep, endereco: full.endereco, bairroOuSetor: full.bairroOuSetor,
        numero: full.numero, complemento: full.complemento, referencia: full.referencia });
      assert.deepEqual(detail.dadosCrime, full.dadosCrime);
      assert.equal(detail.localizacaoConfirmada, true);
      assert.deepEqual(detail.naturezas.map(nature => nature.crimeTentado), [null, false, true]);
      session("Operador");
      const target = await readTarget("manuais", created.id);
      const command = { acao: "editar_manual", id: created.id, versao: target.versao, justificativa: "Ajuste isolado",
        confirmacao: created.id, dados: { ...target.manual, localizacaoConfirmada: true } };
      for (const removed of [{ cep: undefined }, { dadosCrime: { ...full.dadosCrime, vitimas: undefined } }])
        await check(post({ ...command, dados: { ...command.dados, ...removed } }), 422);
      await check(post({ ...command, dados: { ...command.dados, referencia: "Referência corrigida" } }));
      assert.deepEqual((await readTarget("manuais", created.id)).manual, { ...target.manual, referencia: "Referência corrigida" });
    });

    await t.test("registro anterior à migration mantém CEP e dados do crime ausentes e segue editável", async () => {
      session("Operador");
      const id = process.env.SENTINELA_MANUAL_LEGACY_ID;
      const target = await readTarget("manuais", id);
      assert.equal(target.manual.cep, undefined);
      assert.deepEqual(target.manual.dadosCrime, {});
      const dados = { ...target.manual, localizacaoConfirmada: true, referencia: "Referência acrescentada" };
      await check(post({ acao: "editar_manual", id, versao: target.versao, justificativa: "Correção pontual", confirmacao: id, dados }));
      const detail = await check(getConsultation({ view: "detalhe", area: "manuais", id }));
      assert.equal(detail.endereco.cep, undefined);
      assert.equal(detail.endereco.referencia, dados.referencia);
      assert.equal(detail.dadosCrime, undefined);
      assert.equal(detail.naturezas[0].crimeTentado, null);
    });

    await t.test("edição manual valida localização, versiona naturezas e grava dados complementares atomicamente", async () => {
      session("Operador");
      const key = randomUUID(), { id } = await check(create(manualDraft, key), 201);
      const target = await readTarget("manuais", id);
      assert.equal(target.vinculos, 2);
      assert.equal(target.manual.cep, manualDraft.cep);
      assert.deepEqual(target.manual.dadosCrime, manualDraft.dadosCrime);
      const optionalEmpty = await check(getConsultation({ view: "detalhe", area: "manuais", id }));
      assert.deepEqual(optionalEmpty.endereco, { cep: manualDraft.cep, endereco: manualDraft.endereco, bairroOuSetor: manualDraft.bairroOuSetor });
      assert.equal(optionalEmpty.dadosCrime.observacoes, undefined);
      const dados = { ...manualDraft, data: "2025-01-02", horario: "00:05:00", raId: moved.raId, coordenadas: moved.coordenadas,
        endereco: "Endereço revisto", bairroOuSetor: "Setor revisto", cep: "72000000", numero: "11", complemento: "Bloco B", referencia: "Praça",
        naturezas: [manualDraft.naturezas[0], { naturezaId: catalog[2].id, crimeTentado: true }],
        dadosCrime: { descricao: "Descrição validada", meio: "outro", vitimas: 0, autores: 2, observacoes: "Observação" } };
      const command = { acao: "editar_manual", id, versao: target.versao, justificativa: "Revisão da ocorrência sintética", confirmacao: id, dados };
      await check(post({ ...command, confirmacao: randomUUID() }), 422);
      await check(post({ ...command, justificativa: " " }), 422);
      for (const patch of [{ localizacaoConfirmada: false }, { data: "2999-01-01" }, { raId }, { coordenadas: { latitude: 0, longitude: 0 } },
        { endereco: "" }, { cep: "123" }, { naturezas: [dados.naturezas[0], dados.naturezas[0]] },
        { naturezas: [{ naturezaId: randomUUID(), crimeTentado: true }] }, { dadosCrime: { autores: -1 } }]) {
        await check(post({ ...command, dados: { ...dados, ...patch } }), 422);
      }
      assert.deepEqual(await readTarget("manuais", id), target);
      session("Analista");
      await check(post(command), 403);
      const analystList = await check(getConsultation({ view: "manuais", identificacao: id }));
      assert.equal(analystList.itens[0].acoes, undefined);
      session("Operador");
      const sql = new Client({ ...config, user: logins.Operador, password: process.env["SENTINELA_PCDF_LOCAL_PASSWORD_" + logins.Operador] });
      try {
        await sql.connect();
        await assert.rejects(sql.query("SELECT sentinela_gestao.mutar($1,$2)",
          [{ ...command, dados: { ...dados, localizacaoConfirmada: false } }, account]), { code: "22023" });
        await sql.query("BEGIN");
        const { rows: [pending] } = await sql.query("SELECT sentinela_gestao.mutar($1,$2) AS data", [command, account]);
        await sql.query("SET CONSTRAINTS ALL IMMEDIATE");
        await sql.query("ROLLBACK");
        assert.equal((await admin.query("SELECT 1 FROM sentinela.eventos_auditoria WHERE id=$1", [pending.data.auditoria])).rowCount, 0);
        assert.deepEqual(await readTarget("manuais", id), target);
      } finally { await sql.end(); }
      const responses = await Promise.all([post(command), post(command)]);
      assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
      await check(post(command), 409);
      assert.equal((await check(create(manualDraft, key), 201)).id, id);
      const detail = await check(getConsultation({ view: "detalhe", area: "manuais", id }));
      assert.equal(detail.data, "2025-01-02");
      assert.equal(detail.latitude, moved.coordenadas.latitude);
      assert.equal(detail.longitude, moved.coordenadas.longitude);
      assert.deepEqual(detail.endereco, { cep: dados.cep, endereco: dados.endereco, bairroOuSetor: dados.bairroOuSetor,
        numero: dados.numero, complemento: dados.complemento, referencia: dados.referencia });
      assert.deepEqual(detail.dadosCrime, dados.dadosCrime);
      assert.deepEqual(detail.naturezas.map(nature => [nature.nome, nature.crimeTentado]), [["Natureza sintetica A", null], ["Natureza sintetica C", true]]);
      const [manualRow] = (await check(getConsultation({ view: "manuais", identificacao: id }))).itens;
      assert.equal(manualRow.natureza, "Natureza sintetica A · Natureza sintetica C");
      assert.deepEqual(manualRow.acoes, { editar: true, inativar: true });
      const { rows: [point] } = await admin.query(`SELECT ra_id,extensions.ST_X(geometria) AS lon,extensions.ST_Y(geometria) AS lat
        FROM sentinela.ocorrencias WHERE id=$1`, [id]);
      assert.deepEqual(point, { ra_id: moved.raId, lon: moved.coordenadas.longitude, lat: moved.coordenadas.latitude });
      const after = await readTarget("manuais", id);
      await check(post({ acao: "inativar_manual", id, confirmacao: randomUUID(), versao: after.versao, justificativa: "Teste" }), 422);
      await check(post({ acao: "inativar_manual", id, confirmacao: id, versao: after.versao, justificativa: "Teste" }));
      await check(getConsultation({ view: "detalhe", area: "manuais", id }), 404);
      const evidence = await admin.query(`SELECT acao,antes,depois FROM sentinela.eventos_auditoria
        WHERE ocorrencia_id=$1 AND servico='ocorrencias-gestao-local' ORDER BY registrado_em`, [id]);
      assert.deepEqual(evidence.rows.map(row => row.acao), ["editar_manual", "inativar_manual"]);
      assert.equal(evidence.rows[0].antes.registro.data_fato, "2025-01-01");
      assert.deepEqual(evidence.rows[0].antes.dadosCrime, manualDraft.dadosCrime);
      assert.equal(evidence.rows[0].depois.registro.ra_id, moved.raId);
      assert.deepEqual(evidence.rows[0].depois.dadosCrime, dados.dadosCrime);
      const priorLinks = new Map(evidence.rows[0].antes.naturezas.map(n => [n.naturezaId, n.id]));
      assert.equal(evidence.rows[0].depois.naturezas.find(n => n.naturezaId === catalog[0].id).id, priorLinks.get(catalog[0].id));
      assert.equal((await admin.query("SELECT 1 FROM sentinela_gestao.naturezas_inativadas WHERE associacao_id=$1", [priorLinks.get(catalog[1].id)])).rowCount, 1);
      assert.equal(evidence.rows[0].depois.login, logins.Operador);
      assert.equal(evidence.rows[1].depois.ativo, false);
      assert.equal((await admin.query("SELECT 1 FROM sentinela.ocorrencia_naturezas WHERE ocorrencia_id=$1", [id])).rowCount, 3);
      session();
    });

    await t.test("RLS e privilégios SQL recusam escrita direta e analista", async () => {
      for (const role of ["Analista", "Operador"]) {
        const user = logins[role];
        const client = new Client({ ...config, user, password: process.env["SENTINELA_PCDF_LOCAL_PASSWORD_" + user] });
        try {
          await client.connect();
          await assert.rejects(client.query("SELECT * FROM sentinela_gestao.inativacoes"), { code: "42501" });
          await assert.rejects(client.query("SELECT id FROM sentinela.ocorrencias"), { code: "42501" });
          await assert.rejects(client.query("UPDATE sentinela_ocorrencias_analytics.ocorrencias SET ativo=false"), { code: "42501" });
          await assert.rejects(client.query("UPDATE sentinela.ocorrencias SET ativo=false"), { code: "42501" });
          await assert.rejects(client.query("UPDATE sentinela_ocorrencias_manual.cadastros SET dados_crime='{}'"), { code: "42501" });
          await assert.rejects(client.query("SELECT sentinela_gestao.editar_manual('{}',$1)", [account]), { code: "42501" });
          await assert.rejects(client.query("SELECT sentinela_ocorrencias_manual.cadastrar($1,$2,$3)",
            [manualDraft, randomUUID(), account]), { code: "42501" });
          const createSql = "SELECT sentinela_ocorrencias_manual.cadastrar_completo($1,$2,$3)";
          if (role === "Analista") {
            await assert.rejects(client.query(createSql, [manualDraft, randomUUID(), account]), { code: "42501" });
          } else {
            for (const patch of [{ descricao: "\t\u00a0" }, { descricao: undefined }, { vitimas: 0.5 }, { autores: -1 }])
              await assert.rejects(client.query(createSql, [{ ...manualDraft, dadosCrime: { ...manualDraft.dadosCrime, ...patch } },
                randomUUID(), account]), { code: "22023" });
          }
          await assert.rejects(client.query("SELECT sentinela_gestao.mutar_v2('{}',$1)", [account]), { code: "42501" });
          await assert.rejects(client.query("SET ROLE sentinela_gestao_owner"), { code: "42501" });
          await assert.rejects(client.query("SELECT sentinela_gestao.mutar($1,$2)", [
            { acao: "inativar_lote", id: legacy, confirmacao: legacy, justificativa: "Teste" }, account,
          ]), { code: "42501" });
        } finally { await client.end(); }
      }
    });
    await t.test("natureza individual e proteção de suporte consolidado exclusivo", async () => {
      session();
      const fresh = await testPackage(admin, directPcdf);
      const lot = (await fresh(201)).lot;
      const { rows: [only, sibling] } = await admin.query("SELECT id,linha_origem_id FROM sentinela.linhas_staging WHERE lote_id=$1 ORDER BY registro_csv", [lot]);
      const firstTarget = await readTarget("importados", only.id);
      await check(post({ acao: "inativar_associacao", id: only.id, revisao: firstTarget.revisao,
        confirmacao: only.id, justificativa: "Remover uma associação sintética" }));
      await check(getConsultation({ view: "detalhe", area: "importados", id: only.id }), 404);
      assert.equal((await readTarget("importados", sibling.id)).vinculos, 1);
      const occurrence = randomUUID(), nature = randomUUID();
      await admin.query("INSERT INTO sentinela.naturezas_criminais(id,fonte,descricao_original) VALUES($1::uuid,'PCDF',$1::text)", [nature]);
      await admin.query(`INSERT INTO sentinela.ocorrencias(id,origem,fonte,versao_identidade,consolidacao_status,
        ra_id,data_fato,horario_fato,latitude,longitude,localizacao_status,referencia_espacial_confirmada,regra_transformacao,geometria)
        VALUES($1,'importacao','PCDF','fixture','consolidada',$2,'2025-01-01','12:30:00',$3,$4,'validada',
          'WGS84 sintético','fixture',extensions.ST_SetSRID(extensions.ST_MakePoint($4,$3),4326))`,
      [occurrence, raId, coordenadas.latitude, coordenadas.longitude]);
      await admin.query(`INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,linha_origem_id)
        VALUES($1,$2,'importacao',$3)`, [occurrence, nature, sibling.linha_origem_id]);
      await admin.query(`INSERT INTO sentinela.naturezas_criminais(id,fonte,descricao_original) VALUES($1,'PCDF','Natureza sintetica adicional')`,
        [only.id]);
      await admin.query(`INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,linha_origem_id)
        VALUES($1,$2,'importacao',$3)`, [occurrence, only.id, only.linha_origem_id]);
      const sharedLot = await oldLot(admin, lot, 2);
      const shared = await readLot(sharedLot);
      assert.equal(shared.compartilhadas, 1);
      assert.equal(shared.vinculosConsolidados, 1);
      assert.equal(shared.bloqueiaConsolidacao, false);
      await check(post({ acao: "inativar_lote", id: sharedLot, revisao: shared.revisao, confirmacao: sharedLot,
        justificativa: "Inativar lote sintético com vínculo compartilhado" }));
      const { rows: [linkedOrigin] } = await admin.query(
        "SELECT linha_origem_id FROM sentinela.ocorrencia_naturezas WHERE ocorrencia_id=$1 AND natureza_id=$2",
        [occurrence, nature],
      );
      assert.equal(linkedOrigin.linha_origem_id, sibling.linha_origem_id);
      const purgeShared = await previewPurge(sharedLot);
      assert.equal(purgeShared.compartilhadas, 1);
      assert.deepEqual(purgeShared.bloqueios, []);
      assert.equal(purgeShared.quantidades.origens, 0);
      assert.equal(purgeShared.quantidades.inativacoes, 1);
      assert.ok(purgeShared.quantidades.auditorias > 0);
      await check(post(purgeCommand(purgeShared)));
      assert.equal((await admin.query("SELECT id FROM sentinela.lotes_importacao WHERE id=$1", [sharedLot])).rowCount, 0);
      assert.deepEqual((await admin.query("SELECT linha_origem_id FROM sentinela.ocorrencia_naturezas WHERE ocorrencia_id=$1 AND natureza_id=$2",
        [occurrence, nature])).rows, [linkedOrigin]);
      const purgeBlocked = await previewPurge(lot);
      assert.ok(purgeBlocked.bloqueios.some(block => block.tipo === "consolidacao" && block.ids.includes(occurrence)));
      await check(post(purgeCommand(purgeBlocked)), 409);
      purgeEvidence.compartilhamento = { loteExcluido: sharedLot, origemPreservada: linkedOrigin.linha_origem_id,
        ocorrenciaPreservada: occurrence, loteBloqueado: lot };
      const detail = await readLot(lot);
      assert.equal(detail.bloqueiaConsolidacao, true);
      assert.equal(detail.vinculosConsolidados, 1);
      const linked = (await check(getConsultation({ view: "importados" }))).itens.find(item => item.id === sibling.id);
      assert.deepEqual(linked.acoes, { editar: false, inativar: false });
      const command = { acao: "inativar_lote", id: lot, confirmacao: lot, revisao: detail.revisao, justificativa: "Teste" };
      await check(post(command), 409);
      const before = await check(getConsultation({ view: "resumo" }));
      const analytic = await check(getAnalytics());
      assert.equal(analytic.total, before.consolidadas);
      assert.equal(analytic.total, 1);
      assert.equal(analytic.byNature.length, 2);
      assert.deepEqual(analytic.points, [{ raCode: "RA-I", ...coordenadas }]);
      assert.deepEqual(analytic.byRa, [{ key: "RA-I", count: 1 }]);
      assert.equal((await check(getAnalytics({ nature }))).total, 1);
      assert.equal((await check(getAnalytics({ nature: randomUUID() }))).total, 0);
      const target = await readTarget("consolidadas", occurrence);
      await check(post({ acao: "inativar_consolidada", id: occurrence, confirmacao: occurrence, versao: target.versao, justificativa: "Teste" }));
      assert.equal((await check(getConsultation({ view: "resumo" }))).consolidadas, before.consolidadas - 1);
      assert.equal((await check(getAnalytics())).total, 0);
      assert.equal((await readLot(lot)).bloqueiaConsolidacao, false);
      await check(post(command), 409);
    });
    await t.test("CSV/XLSX geral, histórico de tentativa e baixa lógica no mesmo lote", async () => {
      session();
      const { pcdfWorkspace } = await import("../src/lib/db/pcdf-workspace.ts");
      const { utils, write } = await import("xlsx");
      const main = "http://localhost:3000";
      const general = "/api/v1/importacoes/geral";
      const headers = { host: "localhost:3000", origin: main };
      const names = ["Data", "Hora", "Natureza", "RA", "Local"];
      const row = ["08/01/2025", "13:04", "FURTO EM COMERCIO", "Plano Piloto", randomUUID()];
      const workbook = utils.book_new();
      utils.book_append_sheet(workbook, utils.aoa_to_sheet([names, row]), "Dados");
      const workbooks = [
        { ext: "csv", sheet: "CSV", type: "text/csv", bytes: [names, row].map(line => line.join(";")).join("\n") },
        { ext: "xlsx", sheet: "Dados", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          bytes: write(workbook, { type: "buffer", bookType: "xlsx" }) },
      ];
      for (const file of workbooks) {
        const name = "qualificacao-" + randomUUID() + "." + file.ext;
        const upload = async (status, key = randomUUID()) => {
          process.env.SENTINELA_APP_ORIGIN = main;
          try {
            return await check(pcdfWorkspace(new Request(main + general, { method: "POST", body: file.bytes, headers: {
              ...headers, "content-type": file.type, "idempotency-key": key,
              "x-sentinela-import": encodeURIComponent(JSON.stringify({ name, sheet: file.sheet,
                mapping: { data: 0, horario: 1, naturezas: 2, ra: 3, local: 4, latitude: -1, longitude: -1 } })),
            } }), "general-upload"), status);
          } finally { process.env.SENTINELA_APP_ORIGIN = origin; }
        };
        const key = randomUUID();
        const original = await upload(201, key);
        const detail = await readLot(original.lot);
        assert.equal(detail.formato, file.ext.toUpperCase());
        assert.equal(detail.candidatas, null);
        assert.equal(detail.shaXml, null);
        await check(post({ acao: "inativar_lote", id: detail.id, revisao: detail.revisao, confirmacao: detail.id, justificativa: "Teste" }));
        const repeated = await upload(200);
        assert.equal(repeated.lot, original.lot);
        assert.equal(repeated.replay, true);
        process.env.SENTINELA_APP_ORIGIN = main;
        try {
          const history = await check(pcdfWorkspace(new Request(main + general, { headers }), "general-lots"));
          assert.equal(history.filter(item => item.receipt?.lot === original.lot && item.inativada).length, 2);
        } finally { process.env.SENTINELA_APP_ORIGIN = origin; }
        const preview = await previewPurge(original.lot);
        assert.equal(preview.quantidades.recibos, 2);
        assert.deepEqual(preview.bloqueios, []);
        const target = await purgeTarget(admin, original);
        const before = await purgeCounts(admin, target);
        await check(post(purgeCommand(preview)));
        const after = await purgeCounts(admin, target);
        assert.ok(Object.values(after).every(count => count === 0));
        const reimport = await upload(201, key);
        assert.notEqual(reimport.lot, original.lot);
        purgeEvidence[file.ext] = { lote: original.lot, antes: before, depois: after, novoLote: reimport.lot };
      }
    });
    await t.test("exclusão física PCDF v2 com rollback, concorrência, autorização, recibo e reimportação", async () => {
      session();
      const fresh = await testPackage(admin, directPcdf);
      const files = [join(realRoot, "origem-exclusao.xml"), join(realRoot, "origem-exclusao.csv")];
      const originals = [fresh.xml, Buffer.from(await fresh.csv.arrayBuffer())];
      files.forEach((file, index) => writeFileSync(file, originals[index], { flag: "wx" }));
      const receipt = await fresh(201);
      const { rows: stages } = await admin.query("SELECT id FROM sentinela.linhas_staging WHERE lote_id=$1 ORDER BY registro_csv", [receipt.lot]);
      const stage = await readTarget("importados", stages[0].id);
      await check(post({ acao: "corrigir_associacao", id: stage.id, revisao: stage.revisao, justificativa: "Fixture com histórico",
        alteracoes: { local: "Local a excluir com a auditoria do lote" } }));
      const target = await purgeTarget(admin, receipt, fresh.digest);
      const preview = await previewPurge(receipt.lot);
      const payload = purgeCommand(preview);
      const before = await purgeCounts(admin, target);
      const manual = () => admin.query("SELECT * FROM sentinela_ocorrencias_manual.cadastros ORDER BY ocorrencia_id");
      const { rows: manualBefore } = await manual();
      assert.ok(manualBefore.length > 0);
      assert.equal(preview.candidatas, 1);
      assert.equal(preview.quantidades.staging, 2);
      assert.ok(preview.quantidades.pendencias > 0);
      assert.equal(preview.quantidades.artefatos, 6);
      assert.equal(before.entregas, 1);
      assert.equal(before.aprovacoes, 1);
      assert.ok(before.auditorias >= 2);
      assert.deepEqual(preview.bloqueios, []);
      for (const role of ["Operador", "Analista"]) {
        session(role);
        await check(get({ view: "previa_exclusao", id: receipt.lot }), 403);
        await check(get({ view: "exclusoes" }), 403);
        await check(post(payload), 403);
        const login = logins[role];
        const client = new Client({ ...config, user: login, password: process.env["SENTINELA_PCDF_LOCAL_PASSWORD_" + login] });
        try {
          await client.connect();
          await assert.rejects(client.query("SELECT sentinela_exclusao.excluir($1,$2)", [payload, account]), { code: "42501" });
        } finally { await client.end(); }
      }
      session();
      try {
        process.env.SENTINELA_PCDF_SYNTHETIC = "0";
        await check(post(payload), 403);
      } finally { process.env.SENTINELA_PCDF_SYNTHETIC = "1"; }
      await check(post({ ...payload, definitiva: false }), 422);
      await check(post({ ...payload, confirmacao: randomUUID() }), 422);
      await check(post({ ...payload, justificativa: "\t\u00a0" }), 422);
      const login = logins.Administrador;
      const sqlAdmin = new Client({ ...config, user: login, password: process.env["SENTINELA_PCDF_LOCAL_PASSWORD_" + login] });
      try {
        await sqlAdmin.connect();
        await assert.rejects(sqlAdmin.query("SELECT sentinela_exclusao.excluir($1,$2)",
          [{ ...payload, justificativa: "\t\u00a0" }, account]), { code: "22023" });
        await assert.rejects(sqlAdmin.query("DELETE FROM sentinela.lotes_importacao WHERE id=$1", [receipt.lot]), { code: "42501" });
      } finally { await sqlAdmin.end(); }
      await check(post({ ...payload, revisao: "0".repeat(64) }), 409);

      await admin.query("CREATE TABLE sentinela_exclusao.teste_fk (lote uuid REFERENCES sentinela.lotes_importacao(id) ON DELETE CASCADE)");
      try {
        await admin.query("INSERT INTO sentinela_exclusao.teste_fk VALUES($1)", [receipt.lot]);
        const blocked = await previewPurge(receipt.lot);
        assert.ok(blocked.bloqueios.some(item => item.tipo === "dependencia_desconhecida"));
        await check(post(purgeCommand(blocked)), 409);
      } finally { await admin.query("DROP TABLE sentinela_exclusao.teste_fk"); }

      await admin.query("ALTER TABLE sentinela_exclusao.comprovantes ADD CONSTRAINT teste_falha_exclusao CHECK (lote IS NULL) NOT VALID");
      try {
        await check(post(payload), 503);
        assert.deepEqual(await purgeCounts(admin, target), before);
        assert.equal((await previewPurge(receipt.lot)).revisao, preview.revisao);
        assert.equal((await check(get({ view: "exclusoes" }))).itens.some(item => item.lote === receipt.lot), false);
      } finally { await admin.query("ALTER TABLE sentinela_exclusao.comprovantes DROP CONSTRAINT teste_falha_exclusao"); }

      const summaryBefore = await check(getConsultation({ view: "resumo" }));
      const analyticsBefore = await check(getAnalytics());
      const responses = await Promise.all([post(payload), post(payload)]);
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 404]);
      const result = await responses.find(r => r.ok).json();
      assert.equal(result.meta.execution.persisted, true);
      const after = await purgeCounts(admin, target);
      const reconnect = new Client({ ...config, user: "postgres", password });
      let reconnected;
      try {
        await reconnect.connect();
        assert.equal((await reconnect.query("SELECT current_setting('sentinela.sandbox_uuid') AS id")).rows[0].id, identity.id);
        reconnected = await purgeCounts(reconnect, target);
      } finally { await reconnect.end(); }
      assert.deepEqual(after, reconnected);
      assert.ok(Object.values(after).every(count => count === 0));
      assert.deepEqual((await manual()).rows, manualBefore);
      files.forEach((file, index) => assert.deepEqual(readFileSync(file), originals[index]));
      const summaryAfter = await check(getConsultation({ view: "resumo" }));
      assert.equal(summaryAfter.recebidas, summaryBefore.recebidas - 2);
      assert.equal(summaryAfter.pendencias, summaryBefore.pendencias - preview.quantidades.pendencias);
      assert.deepEqual(await check(getAnalytics()), analyticsBefore);
      await check(get({ view: "arquivo", id: receipt.lot }), 404);
      await check(get({ view: "previa_exclusao", id: receipt.lot }), 404);
      assert.equal((await check(getConsultation({ view: "importados", lote: receipt.lot }))).total, 0);
      assert.equal((await check(get({ view: "arquivos", busca: receipt.lot }))).total, 0);
      const history = (await check(get({ view: "exclusoes" }))).itens.filter(item => item.lote === receipt.lot);
      assert.equal(history.length, 1);
      const [proof] = history;
      assert.deepEqual(Object.keys(proof).sort(), ["id", "justificativa", "lote", "momento", "quantidades", "responsavel"]);
      assert.equal(proof.id, result.data.auditoria);
      assert.equal(proof.responsavel, account);
      assert.equal(proof.justificativa, payload.justificativa);
      assert.deepEqual(proof.quantidades, preview.quantidades);
      await fresh(403);
      await fresh.approve();
      const restored = await fresh(201);
      assert.notEqual(restored.lot, receipt.lot);
      assert.equal((await fresh(200)).lot, restored.lot);
      assert.deepEqual((await check(get({ view: "exclusoes" }))).itens.filter(item => item.lote === receipt.lot), history);
      purgeEvidence.pcdfV2 = { lote: receipt.lot, antes: before, depois: after, reconexao: reconnected,
        comprovante: proof, novoLote: restored.lot, indicadoresAntes: { associacoes: summaryBefore.recebidas, pendencias: summaryBefore.pendencias },
        indicadoresDepois: { associacoes: summaryAfter.recebidas, pendencias: summaryAfter.pendencias } };
    });
    await t.test("CSV PCDF v1 avulso sai do histórico e recebe um lote novo", async () => {
      session();
      const month = "2021-02";
      const name = csvName.replace("2021-01", month);
      const rows = fixture().rows.map(row => ({ ...row, linha_origem_id: sha(randomUUID()),
        data: month + "-13", data_inicio_fato_original: "13/02/2021 09:04:59" }));
      const source = v1(Buffer.from("<Workbook/>"), rows, false, name);
      const send = status => {
        const form = new FormData();
        form.set("csv", new File([source.csv], name));
        form.set("sha256", source.delivery.batch.sha256);
        return check(directPcdf(new Request(origin + "/api/v1/importacoes/pcdf/direta?etapa=confirmar",
          { method: "POST", headers: { host, origin }, body: form })), status);
      };
      const receipt = await send(201);
      assert.ok((await check(getConsultation({ view: "resumo" }))).competencias.includes(month));
      assert.equal((await send(200)).lot, receipt.lot);
      const target = await purgeTarget(admin, receipt);
      const before = await purgeCounts(admin, target);
      assert.equal(before.auditorias, 4);
      const preview = await previewPurge(receipt.lot);
      assert.deepEqual(preview.bloqueios, []);
      await check(post(purgeCommand(preview)));
      const after = await purgeCounts(admin, target);
      assert.ok(Object.values(after).every(count => count === 0));
      assert.ok(!(await check(getConsultation({ view: "resumo" }))).competencias.includes(month));
      const history = await check(directPcdf(request("/api/v1/importacoes/pcdf/direta")));
      assert.ok(history.every(item => item.lot !== receipt.lot));
      const reimport = await send(201);
      assert.notEqual(reimport.lot, receipt.lot);
      assert.ok((await check(getConsultation({ view: "resumo" }))).competencias.includes(month));
      purgeEvidence.pcdfV1 = { lote: receipt.lot, antes: before, depois: after, novoLote: reimport.lot, competencia: month };
    });
    await t.test("reimportação PCDF v2 reutiliza a origem preservada por outro lote", async () => {
      session();
      const fresh = await testPackage(admin, directPcdf);
      const original = await fresh(201);
      const peer = await oldLot(admin, original.lot);
      const { rows: [shared] } = await admin.query("SELECT linha_origem_id FROM sentinela.linhas_staging WHERE lote_id=$1", [peer]);
      const preview = await previewPurge(original.lot);
      assert.equal(preview.compartilhadas, 1);
      assert.equal(preview.quantidades.origens, 1);
      assert.equal(preview.quantidades.extracoes, 0);
      await check(post(purgeCommand(preview)));
      await fresh.approve();
      const reimport = await fresh(201);
      assert.notEqual(reimport.lot, original.lot);
      assert.equal(reimport.reused, 1);
      const { rows: [reused] } = await admin.query("SELECT linha_origem_id FROM sentinela.linhas_staging WHERE lote_id=$1 AND registro_csv=1", [reimport.lot]);
      assert.equal(reused.linha_origem_id, shared.linha_origem_id);
      purgeEvidence.reimportacaoCompartilhada = { loteExcluido: original.lot, lotePreservado: peer,
        origemReutilizada: shared.linha_origem_id, novoLote: reimport.lot };
    });
    const desktop = await check(create(manualDraft, randomUUID()), 201);
    const mobile = await check(create(manualDraft, randomUUID()), 201);
    const restricted = await check(create(manualDraft, randomUUID()), 201);
    const browserImport = await testPackage(admin, directPcdf);
    const browserDelete = (await browserImport(201)).lot;
    writeFileSync(join(realRoot, "browser-fixtures.json"), JSON.stringify({
      lot: legacy, deleteLot: browserDelete, blockedLot: purgeEvidence.compartilhamento.loteBloqueado,
      manuals: [desktop.id, mobile.id], moved, restricted: restricted.id,
    }));
    writeFileSync(join(realRoot, "exclusao-sql.json"), JSON.stringify(purgeEvidence, null, 2) + "\n");
  } finally {
    await admin.end();
    delete globalThis[subject];
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test.after(() => hooks.deregister());
