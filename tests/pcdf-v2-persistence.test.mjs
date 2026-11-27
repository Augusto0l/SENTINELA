import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync, realpathSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import { syntheticPcdfV2Enabled } from "../src/lib/db/pcdf-direct-mode.ts";
import { preparePcdfV2Delivery } from "../src/lib/db/pcdf-v2-delivery.ts";
import { csvName, fixture } from "./fixtures/pcdf-v2-package.mjs";
import { v1 } from "./fixtures/pcdf-v1-package.mjs";

const ROOT = process.env.SENTINELA_PCDF_V2_FIXTURE_ROOT;
const database = "sentinela_pcdf_local";
const origin = "http://127.0.0.1:3318";
const endpoint = origin + "/api/v1/importacoes/pcdf/direta";
const account = "1".repeat(64);
const roles = { Administrador: "sentinela_local_admin", Operador: "sentinela_local_operator", Analista: "sentinela_local_analyst" };
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

function modes() {
  return {
    NODE_ENV: "development", SENTINELA_AUTH_PROVIDER: "local", SENTINELA_LOCAL_BIND: "127.0.0.1",
    SENTINELA_APP_ORIGIN: origin, SENTINELA_PCDF_LOCAL_ID: randomUUID(),
    SENTINELA_PCDF_LOCAL_SYSTEM_ID: "12345678901234567", SENTINELA_PCDF_LOCAL_START: "1700000000",
    SENTINELA_HTTP_VALIDATION_ID: randomUUID(), SENTINELA_PCDF_SYNTHETIC: "1",
  };
}

test("a escrita v2 exige opt-in sintético e recusa modo operacional ou hospedado", () => {
  const env = modes();
  assert.equal(syntheticPcdfV2Enabled(env), false);
  const enabled = { ...env, SENTINELA_PCDF_V2_SYNTHETIC_WRITE: "1" };
  assert.equal(syntheticPcdfV2Enabled(enabled), true);
  for (const patch of [
    { SENTINELA_PCDF_SYNTHETIC: "0" }, { NODE_ENV: "production" }, { VERCEL: "1" },
    { SENTINELA_HTTP_VALIDATION_ID: "" }, { SENTINELA_LOCAL_BIND: "0.0.0.0" },
  ]) assert.equal(syntheticPcdfV2Enabled({ ...enabled, ...patch }), false);
});

function packageFiles(xml, change = () => {}) {
  return fixture(config => {
    config.manifest.fonte = { ...config.manifest.fonte, nome: "fixture.xml", bytes: xml.length, sha256: sha(xml) };
    for (const [i, row] of config.rows.entries()) {
      const id = sha(JSON.stringify(["pcdf-linha-v1", sha(xml), "NATUREZAS", Number(row.linha_xml)]));
      row.linha_origem_id = id;
      config.provenance[i].linha_origem_id = id;
    }
    change(config);
  });
}

async function v2(xml, change) {
  const pkg = packageFiles(xml, change);
  return { ...pkg, ...(await preparePcdfV2Delivery(pkg.csv, pkg.attachments)) };
}

const authFixture = "sentinela-pcdf-v2-test-principal";
function routeHooks() {
  return registerHooks({ resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
    if (specifier === "@/lib/auth/local-server") {
      return { url: "data:text/javascript,export const getLocalPrincipal=()=>globalThis[Symbol.for('" + authFixture + "')]", shortCircuit: true };
    }
    if (specifier.startsWith("@/")) return next(new URL("../src/" + specifier.slice(2) + ".ts", import.meta.url).href, context);
    if (specifier === "./pcdf-v2-delivery") return next(specifier + ".ts", context);
    return next(specifier, context);
  } });
}

test("HTTP e PostgreSQL isolados qualificam a persistência PCDF entre versões", { skip: !ROOT }, async t => {
  assert.ok(ROOT, "use um diretório temporário exclusivo para qualificação");
  const root = realpathSync(ROOT);
  assert.equal(dirname(root).toLowerCase(), realpathSync(tmpdir()).toLowerCase());
  assert.match(basename(root), /^sentinela-pcdf-v2-fixture-[a-f0-9]{32}$/);
  const pgDirectory = join(root, "data");
  assert.equal(realpathSync(pgDirectory), pgDirectory);
  assert.ok(existsSync(join(pgDirectory, "PG_VERSION")));
  const secret = join(root, "setup-password");
  assert.equal(realpathSync(secret), secret);
  const password = readFileSync(secret, "ascii");
  assert.match(password, /^[a-f0-9]{64}$/);

  const { Client } = await import("pg");
  const options = { host: "127.0.0.1", port: 55488, database, ssl: false, connectionTimeoutMillis: 3000 };
  const admin = new Client({ ...options, user: "postgres", password });
  const credentials = Object.fromEntries(Object.values(roles).map(login => [login, randomBytes(32).toString("hex")]));
  const env = { ...modes(), SENTINELA_PCDF_V2_SYNTHETIC_WRITE: "1", VERCEL: "", VERCEL_ENV: "",
    SENTINELA_PERSISTENT_HOMOLOGATION: "0", SENTINELA_SANDBOX_WRITE: "0" };
  const priorEnv = {};
  const subject = Symbol.for(authFixture);
  let hooks;
  try {
    await admin.connect();
    const { rows: [proof] } = await admin.query(
      "SELECT current_setting('data_directory') AS directory, current_setting('sentinela.sandbox_uuid') AS id," +
      " system_identifier::text AS system, extract(epoch FROM pg_postmaster_start_time())::bigint::text AS epoch" +
      " FROM pg_control_system() WHERE current_database()=$1 AND inet_server_port()=55488" +
      " AND inet_server_addr()=inet '127.0.0.1' AND to_regclass('sentinela_pcdf_local.aprovacoes_pacote') IS NOT NULL", [database],
    );
    assert.ok(proof, "o cluster precisa estar inicializado com a migration sintética");
    assert.equal(realpathSync(proof.directory), pgDirectory);
    Object.assign(env, { SENTINELA_PCDF_LOCAL_ID: proof.id, SENTINELA_PCDF_LOCAL_SYSTEM_ID: proof.system,
      SENTINELA_PCDF_LOCAL_START: proof.epoch });
    for (const [login, value] of Object.entries(credentials)) {
      await admin.query("ALTER ROLE " + login + " PASSWORD '" + value + "'");
      env["SENTINELA_PCDF_LOCAL_PASSWORD_" + login] = value;
    }
    for (const [key, value] of Object.entries(env)) {
      priorEnv[key] = process.env[key];
      process.env[key] = value;
    }
    hooks = routeHooks();
    const { directPcdf } = await import("../src/lib/db/pcdf-direct.ts");

    function session(role = "Operador") {
      globalThis[subject] = role && { role, source: "local", localAccountId: account };
    }
    function request(url, form, headers = { host: "127.0.0.1:3318", origin }) {
      return directPcdf(new Request(endpoint + url, { method: "POST", headers, body: form }));
    }
    async function sendV1(f, expected, step = "confirmar") {
      const form = new FormData();
      form.set("csv", new File([f.csv], csvName));
      if (f.manifest) form.set("manifesto", new File([f.manifest], "manifesto.json"));
      if (step === "confirmar") {
        form.set("sha256", f.delivery.batch.sha256);
        if (f.manifest) form.set("manifestSha", f.delivery.manifestSha);
      }
      const response = await request("?etapa=" + step, form);
      const body = await response.json();
      assert.equal(response.status, expected, JSON.stringify(body.error));
      return body.data;
    }
    function formV2(p, digest = p.digest) {
      const form = new FormData();
      form.set("csv", p.csv);
      for (const file of p.attachments) form.append("artefato", file);
      form.set("digest", digest);
      return form;
    }
    async function sendV2(p, expected, digest) {
      const response = await request("?etapa=confirmar&versao=2.0", formV2(p, digest));
      const body = await response.json();
      assert.equal(response.status, expected, JSON.stringify(body.error));
      return body.data || body.error;
    }
    async function approve(contract, p, xml) {
      assert.equal(p.delivery.source.sha256, sha(xml));
      assert.equal(p.delivery.source.bytes, xml.length);
      const names = contract === "1.0" ? ["manifesto.json", csvName] : p.names;
      const parts = contract === "1.0" ? [Buffer.from(p.manifest), Buffer.from(p.csv)] : p.parts;
      const { rows: [record] } = await admin.query(
        "INSERT INTO sentinela_pcdf_local.aprovacoes_pacote(digest,contrato,xml_sha256,projecao_sha256)" +
        " VALUES (sentinela_pcdf_local.pacote_digest($1,$2),$3,$4,encode(sha256(convert_to(($5::jsonb)::text,'UTF8')),'hex')) RETURNING digest",
        [names, parts, contract, sha(xml), p.delivery],
      );
      if (contract === "2.0") assert.equal(record.digest, p.digest);
      return record.digest;
    }
    async function counts() {
      return (await admin.query("SELECT (SELECT count(*)::int FROM sentinela.extracoes_origem) AS extracts," +
        " (SELECT count(*)::int FROM sentinela.linhas_origem) AS origins," +
        " (SELECT count(*)::int FROM sentinela.lotes_importacao) AS lots," +
        " (SELECT count(*)::int FROM sentinela.execucoes_importacao) AS runs," +
        " (SELECT count(*)::int FROM sentinela.linhas_staging) AS staging," +
        " (SELECT count(*)::int FROM sentinela.pendencias_revisao) AS issues," +
        " (SELECT count(*)::int FROM sentinela.eventos_auditoria WHERE servico='pcdf-local') AS audits," +
        " (SELECT count(*)::int FROM sentinela_pcdf_local.entregas_pacote) AS packages")).rows[0];
    }
    const xml = () => Buffer.from("<Workbook><!-- synthetic " + randomUUID() + " --></Workbook>");
    session();


    await t.test("gate antes da conexão, sessão, Host/Origin e papéis SQL", async () => {
      const p = await v2(xml());
      const before = await counts();
      const flag = env.SENTINELA_PCDF_V2_SYNTHETIC_WRITE;
      delete process.env.SENTINELA_PCDF_V2_SYNTHETIC_WRITE;
      await sendV2(p, 403);
      process.env.SENTINELA_PCDF_V2_SYNTHETIC_WRITE = flag;
      process.env.SENTINELA_PCDF_SYNTHETIC = "0";
      const key = "SENTINELA_PCDF_LOCAL_PASSWORD_" + roles.Operador;
      delete process.env[key];
      await sendV2(p, 403);
      process.env[key] = env[key];
      process.env.SENTINELA_PCDF_SYNTHETIC = "1";
      assert.equal((await request("?etapa=confirmar&versao=2.0", formV2(p), { host: "127.0.0.1:3318", origin: "http://127.0.0.1:1" })).status, 403);
      session(null);
      await sendV2(p, 401);
      session("Analista");
      await sendV2(p, 403);
      const analyst = new Client({ ...options, user: roles.Analista, password: credentials[roles.Analista] });
      try {
        await analyst.connect();
        await assert.rejects(analyst.query("SELECT sentinela_pcdf_local.receive_v2(NULL,NULL,NULL,NULL,NULL)"), { code: "42501" });
      } finally { await analyst.end(); }
      session();
      const writer = new Client({ ...options, user: roles.Operador, password: credentials[roles.Operador] });
      try {
        await writer.connect();
        for (const query of [
          "SELECT artefatos FROM sentinela_pcdf_local.entregas_pacote",
          "SELECT digest FROM sentinela_pcdf_local.aprovacoes_pacote",
          "INSERT INTO sentinela_pcdf_local.aprovacoes_pacote DEFAULT VALUES",
          "SELECT sentinela_pcdf_local.receive_v1_legacy(NULL,NULL,NULL,NULL)",
          "SELECT sentinela_pcdf_local.staging_pacote(NULL,NULL,NULL,NULL,NULL,NULL)",
          "SELECT 1 FROM sentinela.ocorrencias",
        ]) await assert.rejects(writer.query(query), { code: "42501" });
        const receive = "SELECT sentinela_pcdf_local.receive_v2($1,$2,$3,$4,$5)";
        const params = [randomUUID(), account, p.delivery, p.names, p.parts];
        await assert.rejects(writer.query(receive, params), { code: "42501" });
        await writer.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        await assert.rejects(writer.query(receive, params), { code: "22023" });
        await writer.query("ROLLBACK");
      } finally { await writer.end(); }
      assert.deepEqual(await counts(), before);
    });

    await t.test("pacote inválido, sem aprovação, ou diferente do confirmado não grava", async () => {
      const source = xml();
      const p = await v2(source);
      const initial = await counts();
      await sendV2(p, 403); // matching internal checksums do not establish trust
      await sendV2(p, 409, "0".repeat(64));
      await sendV2({ ...p, csv: new File(["alterado"], csvName) }, 422);
      await sendV2({ ...p, attachments: p.attachments.filter(f => f.name !== "proveniencia.jsonl") }, 422);
      const badManifest = packageFiles(source, ({ manifest }) => { manifest.layout.versao = "1.0"; });
      await sendV2({ ...badManifest, digest: p.digest }, 422);
      const inconsistent = packageFiles(source, ({ provenance }) => { provenance[0].linha_xml = 999; });
      await sendV2({ ...inconsistent, digest: p.digest }, 422);
      const duplicated = packageFiles(source, ({ rows }) => { rows[1].linha_origem_id = rows[0].linha_origem_id; });
      await sendV2({ ...duplicated, digest: p.digest }, 422);
      assert.deepEqual(await counts(), initial);
    });

    await t.test("v1, replay, v2, natureza adicional e custódia do pacote", async () => {
      const source = xml();
      const packageV2 = await v2(source);
      const packageV1 = v1(source, packageV2.rows.slice(0, 1));
      await approve("1.0", packageV1, source);
      await approve("2.0", packageV2, source);
      const initial = await counts();
      const preview = await sendV1(packageV1, 200, "validar");
      assert.equal(preview.headers.length, 34);
      assert.deepEqual(await counts(), initial);
      const first = await sendV1(packageV1, 201);
      const repeated = await sendV1(packageV1, 200);
      assert.equal(repeated.replay, true);
      assert.equal(repeated.run, first.run);
      const followup = await sendV2(packageV2, 201);
      assert.equal(followup.reused, 1);
      assert.equal(followup.records, 2);
      const later = await sendV2(packageV2, 200);
      assert.equal(later.replay, true);
      assert.equal(later.run, followup.run);
      const { rows: staged } = await admin.query("SELECT s.linha_origem_id,s.estado," +
        " s.derivados_efetivos->>'recepcao' AS outcome,s.campos_csv AS cells,o.data_inicio_fato_original AS literal" +
        " FROM sentinela.linhas_staging s JOIN sentinela.linhas_origem o ON o.id=s.linha_origem_id" +
        " WHERE s.execucao_id=$1 ORDER BY s.registro_csv", [followup.run]);
      assert.deepEqual(staged.map(row => row.estado), ["reenviada", "bloqueada"]);
      assert.deepEqual(staged.map(row => row.outcome), ["origem_reutilizada", "nova_associacao_candidata_conhecida"]);
      assert.deepEqual(staged[0].cells, packageV2.delivery.batch.rows[0].raw);
      assert.equal(staged[0].literal, "13/01/2021 09:04:59");
      const { rows: [legacy] } = await admin.query(
        "SELECT linha_origem_id FROM sentinela.linhas_staging WHERE execucao_id=$1", [first.run],
      );
      assert.equal(staged[0].linha_origem_id, legacy.linha_origem_id);
      const { rows: [custody] } = await admin.query(
        "SELECT nomes,artefatos,execucao_id FROM sentinela_pcdf_local.entregas_pacote WHERE digest=$1", [packageV2.digest],
      );
      assert.deepEqual(custody.nomes, packageV2.names);
      assert.deepEqual(custody.artefatos, packageV2.parts);
      assert.equal(custody.execucao_id, followup.run);
      const final = await counts();
      assert.equal(final.origins - initial.origins, 2);
      assert.equal(final.runs - initial.runs, 2);
      assert.equal(final.audits - initial.audits, 6);

      const differentEnvelope = v1(source, packageV2.rows.slice(0, 1), false);
      await sendV1(differentEnvelope, 409);
      const denied = await counts();
      assert.deepEqual(denied, { ...final, audits: final.audits + 2 });

      const modifiedReport = await v2(source, config => { config.report += "Envelope alternativo.\n"; });
      assert.notEqual(modifiedReport.digest, packageV2.digest);
      await approve("2.0", modifiedReport, source);
      assert.equal((await sendV2(modifiedReport, 409)).diagnostic, "csv_ja_recebido_com_outro_vinculo");
      assert.deepEqual(await counts(), { ...denied, packages: denied.packages + 1, audits: denied.audits + 1 });
    });

    await t.test("v2 primeiro, replay concorrente e reuso na recepção v1", async () => {
      const source = xml();
      const newer = await v2(source);
      const older = v1(source, newer.rows);
      await approve("2.0", newer, source);
      await approve("1.0", older, source);
      const initial = await counts();
      session("Administrador");
      const [a, b] = await Promise.all([1, 2].map(() => request("?etapa=confirmar&versao=2.0", formV2(newer))));
      assert.deepEqual([a.status, b.status].sort(), [200, 201]);
      const receipts = await Promise.all([a.json(), b.json()]);
      assert.equal(receipts[0].data.run, receipts[1].data.run);
      assert.deepEqual(receipts.map(x => x.data.replay).sort(), [false, true]);
      session();
      const oldReceipt = await sendV1(older, 201);
      const { rows: [run] } = await admin.query(
        "SELECT linhas_reenviadas::int AS reused FROM sentinela.execucoes_importacao WHERE id=$1", [oldReceipt.run],
      );
      assert.equal(run.reused, 2);
      const final = await counts();
      assert.equal(final.origins - initial.origins, 2);
      assert.equal(final.staging - initial.staging, 4);
      assert.equal(final.packages - initial.packages, 2);
    });

    await t.test("duas versões concorrentes disputam a mesma identidade", async () => {
      const source = xml();
      const next = await v2(source);
      const legacy = v1(source, next.rows);
      await approve("1.0", legacy, source);
      await approve("2.0", next, source);
      const initial = await counts();
      const [receiptV1, receiptV2] = await Promise.all([sendV1(legacy, 201), sendV2(next, 201)]);
      const { rows: [runs] } = await admin.query(
        "SELECT sum(linhas_reenviadas)::int AS reused FROM sentinela.execucoes_importacao WHERE id=ANY($1::uuid[])",
        [[receiptV1.run, receiptV2.run]],
      );
      assert.equal(runs.reused, 2);
      const final = await counts();
      assert.equal(final.origins - initial.origins, 2);
      assert.equal(final.staging - initial.staging, 4);
      assert.equal(final.runs - initial.runs, 2);
    });

    await t.test("conflitos aprovados e legado avulso ficam em revisão sem alterar originais", async () => {
      const source = xml();
      const canonical = await v2(source);
      const variant = await v2(source, ({ rows, manifest }) => {
        // Deliberate conflict in a separately authorized synthetic challenge.
        rows[0].natureza_original = "DIVERGENTE";
        manifest.reconciliacao.naturezas_originais = { DIVERGENTE: 1, "NATUREZA B": 1 };
      });
      await approve("2.0", canonical, source);
      await approve("2.0", variant, source);
      const first = await sendV2(canonical, 201);
      const initial = await counts();
      const review = await sendV2(variant, 409);
      assert.equal(review.diagnostic, "origem_divergente_ou_avulsa");
      const after = await counts();
      assert.deepEqual(after, { ...initial, packages: initial.packages + 1, audits: initial.audits + 1 });
      const { rows: [conflict] } = await admin.query("SELECT e.execucao_id,e.resultado,a.acao FROM sentinela_pcdf_local.entregas_pacote e" +
        " JOIN sentinela.eventos_auditoria a ON a.depois->>'digest'=e.digest WHERE e.digest=$1", [variant.digest]);
      assert.equal(conflict.execucao_id, null);
      assert.equal(conflict.acao, "revisao_pcdf_v2");
      assert.equal(conflict.resultado.reason, "origem_divergente_ou_avulsa");
      assert.equal((await sendV2(canonical, 200)).run, first.run);

      const unverifiedSource = xml();
      const incoming = await v2(unverifiedSource);
      const legacy = v1(unverifiedSource, incoming.rows, false);
      await sendV1(legacy, 201);
      await sendV1(legacy, 200);
      await approve("2.0", incoming, unverifiedSource);
      const before = await counts();
      assert.equal((await sendV2(incoming, 409)).diagnostic, "origem_divergente_ou_avulsa");
      assert.deepEqual(await counts(), { ...before, packages: before.packages + 1, audits: before.audits + 1 });
    });

    await t.test("classificação, coordenada inválida, natureza repetida e quarentena preservam a evidência", async () => {
      const source = xml();
      const p = await v2(source, config => {
        const { rows, provenance, manifest } = config;
        rows[0].latitude_geo_original = "-91";
        rows[0].coordenada_status = "invalida";
        rows[1].natureza_original = rows[0].natureza_original;
        provenance[0].coordenadas.GEO = {
          estado: "invalida", componentes: { latitude_geo_original: "fora_do_dominio", longitude_geo_original: "numerico" },
        };
        const fields = [
          "ano_registro", "unidade_registro", "numero_registro", "ano_fato", "data_inicio_fato_original", "flagrante",
          "natureza_original", "crime_tentado", "natureza_padronizada_pcdf", "cidade_endereco_original", "ra_original",
          "area_endereco_original", "quadra_endereco_original", "latitude_geo_original", "longitude_geo_original",
          "latitude_utm_original", "longitude_utm_original", "unidade_apuracao",
        ];
        const originals = Object.fromEntries(fields.map(field => [field, rows[0][field] ?? ""]));
        originals.data_inicio_fato_original = "  data inválida sintética  ";
        config.quarantine = JSON.stringify({
          ...provenance[0], linha_xml: 4, linha_origem_id: sha(JSON.stringify(["pcdf-linha-v1", sha(source), "NATUREZAS", 4])),
          data_inicio_fato_original: originals.data_inicio_fato_original, originais: originals, motivo: "sem_competencia",
          diagnosticos: { invalido: ["data_inicio_fato_original"] },
        }) + "\n";
        Object.assign(manifest.reconciliacao, {
          coordenada_status: { invalida: 1, referencia_pendente: 1 },
          coordenada_status_v1_para_v2: { "invalida -> invalida": 1, "invalida -> referencia_pendente": 1 },
          pares_coordenadas: { GEO: { invalida: 1, referencia_pendente: 1 }, UTM: { ausente: 2 } },
          naturezas_originais_distintas: 1, naturezas_originais: { "NATUREZA A": 2 }, repeticoes_chave_natureza: 1,
          quarentena_temporal: { sem_competencia: 1, ano_fato_divergente_ou_invalido: 0 },
        });
      });
      await approve("2.0", p, source);
      const initial = await counts();
      const receipt = await sendV2(p, 201);
      const { rows: pending } = await admin.query(
        "SELECT p.campo,p.regra,p.valor_original FROM sentinela.pendencias_revisao p" +
        " JOIN sentinela.linhas_staging s ON s.linha_origem_id=p.linha_origem_id WHERE s.execucao_id=$1",
        [receipt.run],
      );
      assert.equal(pending.filter(row => row.regra === "classificacao_pendente").length, 0);
      assert.equal(pending.filter(row => row.regra === "natureza_fora_do_catalogo").length, 2);
      assert.ok(pending.some(row => row.regra === "associacao_repetida_para_revisao"));
      assert.ok(pending.some(row => row.regra === "fora_do_dominio" && row.valor_original === "-91"));
      const { rows: [proof] } = await admin.query(
        "SELECT a.depois->'quarantine' AS quarantine, p.artefatos[array_position(p.nomes,'pendencias_temporais.jsonl')] AS artifact," +
        " q.aprovado_por AS approver FROM sentinela.eventos_auditoria a" +
        " JOIN sentinela_pcdf_local.entregas_pacote p ON a.depois->>'digest'=p.digest" +
        " JOIN sentinela_pcdf_local.aprovacoes_pacote q ON q.digest=p.digest WHERE a.execucao_id=$1",
        [receipt.run],
      );
      assert.equal(proof.quarantine, 1);
      assert.equal(proof.approver, "postgres");
      assert.deepEqual(proof.artifact, p.parts[p.names.indexOf("pendencias_temporais.jsonl")]);
      const after = await counts();
      assert.equal(after.origins - initial.origins, 2);
      assert.equal(after.staging - initial.staging, 2);
    });

    await t.test("falha tardia de auditoria reverte custódia, staging, origens e pendências", async () => {
      const source = xml();
      const p = await v2(source);
      await approve("2.0", p, source);
      await admin.query("CREATE OR REPLACE FUNCTION sentinela_pcdf_local.fixture_fail_audit()" +
        " RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN" +
        " IF NEW.acao='staging_pcdf_v2' AND NEW.depois->>'digest'='" + p.digest +
        "' THEN RAISE EXCEPTION USING ERRCODE='P0001'; END IF; RETURN NEW; END $$");
      await admin.query("CREATE OR REPLACE TRIGGER pcdf_fixture_fail BEFORE INSERT ON sentinela.eventos_auditoria" +
        " FOR EACH ROW EXECUTE FUNCTION sentinela_pcdf_local.fixture_fail_audit()");
      const initial = await counts();
      try {
        await sendV2(p, 503);
        assert.deepEqual(await counts(), initial);
      } finally {
        await admin.query("ALTER TABLE sentinela.eventos_auditoria DISABLE TRIGGER pcdf_fixture_fail");
      }
      await sendV2(p, 201);
      const { rows: [domain] } = await admin.query("SELECT (SELECT count(*)::int FROM sentinela.ocorrencias) AS occurrences," +
        " (SELECT count(*)::int FROM sentinela.ocorrencia_naturezas) AS associations");
      assert.deepEqual(domain, { occurrences: 0, associations: 0 });
    });
  } finally {
    hooks?.deregister();
    delete globalThis[subject];
    for (const [key, value] of Object.entries(priorEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await admin.end();
  }
});
