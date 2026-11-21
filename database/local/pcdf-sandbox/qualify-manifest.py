"""Synthetic qualification with producer-format CSV, manifesto and XML bytes."""
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import csv
from hashlib import sha256
import io
import json
from pathlib import Path
import secrets
import subprocess
import sys
import unittest
from unittest.mock import patch
from uuid import uuid4

from manifest_receiver import HEADERS, LINE_VERSION, ORIGINALS, TECHNICAL, compact_json, line_id, prepare_month
from pipeline import InvalidFile, MAX_BYTES, XML_FIXTURE
from pilot_preflight import approval, report as preflight_report
import pilot_recovery
from qualify import HERE, backup, control, fixture
from workspace import prepare_synthetic

MONTH = "2026-08"
TREATMENT = "pcdf-receptor-fixture-v1"
XML = b"<Workbook><!-- generated PCDF qualification fixture --></Workbook>"
SHA = sha256(XML).hexdigest()


def csv_fixture(month=MONTH, positions=(2, 3, 4, 5, 6), overrides=None, xml_hash=SHA):
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, HEADERS, delimiter=";", lineterminator="\r\n")
    writer.writeheader()
    for position in positions:
        row = dict.fromkeys(HEADERS, "")
        row.update(ano_registro="2026", unidade_registro="Unidade Época TESTE", numero_registro="000001",
                   ano_fato="2026", data_inicio_fato_original=f"12/{month[5:]}/2026 12:34:56",
                   data=month + "-12", horario="12:34:56", natureza_original="Natureza A TESTE",
                   natureza_padronizada_pcdf="Categoria TESTE", crime_tentado="NÃO",
                   cidade_endereco_original="Cidade TESTE", ra_original="RA 98_NÃO INFORMADA",
                   area_endereco_original='  Área "TESTE";\r\nlinha  ', quadra_endereco_original=" ",
                   local='  Área "TESTE";\r\nlinha  ', coordenada_status="ausente",
                   flagrante="NÃO INFORMADO", classificacao_status="pendente", fonte="PCDF",
                   linha_origem_id=line_id(xml_hash, position), linha_xml=str(position),
                   aba_origem="NATUREZAS", versao_tratamento=TREATMENT)
        row.update({
            3: {"natureza_original": "Natureza B TESTE"},
            5: {"numero_registro": "", "data_inicio_fato_original": "data impossível",
                "data": "2026-08-99", "horario": "24:99:61", "natureza_original": "",
                "latitude_geo_original": "NULL", "longitude_geo_original": "NULL",
                "coordenada_status": "invalida"},
            6: {"data_inicio_fato_original": f"13/{month[5:]}/2026 12:34:56", "data": month + "-13"},
        }.get(position, {}))
        identity = [row[name] for name in ("ano_registro", "unidade_registro", "numero_registro")]
        row["ocorrencia_chave"] = compact_json(["PCDF", *identity]) if all(identity) else ""
        row.update((overrides or {}).get(position, {}))
        writer.writerow(row)
    return buffer.getvalue().encode()


def manifest_for(files, xml=XML, *, finalized=False):
    counts = {month: rows for month, (_, rows) in files.items()}
    total = sum(counts.values())
    manifest = {"fonte": {"nome": "fixture.xml", "aba": "NATUREZAS", "sha256": sha256(xml).hexdigest(), "bytes": len(xml)},
            "status": "reconciliado", "versao_layout": "1.0", "versao_tratamento": TREATMENT,
            "layout": {"colunas": list(HEADERS), "originais": 18, "derivadas": 10, "tecnicas": 6},
            "identificador_linha": {"versao": LINE_VERSION, "hash": "SHA-256"},
            "arquivos_csv": {f"tecnico/pcdf_naturezas_{month}.csv":
                             {"tipo": "mensal", "sha256": sha256(content).hexdigest(), "bytes": len(content), "linhas": rows}
                             for month, (content, rows) in files.items()},
            "distribuicao": {"por_mes": counts},
            "reconciliacao": {"associacoes_exportadas": total, "associacoes_lidas": total, "linhas_quarentena": 0,
                             "linhas_estruturais_vazias": 0, "ids_tecnicos_distintos": total,
                             "valores_originais_conferidos": total * 18, "conferida_integralmente": True,
                             "erros_transformacao": 0, "linhas_fisicas_lidas": total + 1, "cabecalhos_lidos": 1}}
    if finalized:
        manifest.update(status="validado", execucao={"hash_fonte_reconferido": True}, preflight={
            "status": "aprovado", "fonte": dict(manifest["fonte"]),
            "estrutura_xml": {"linhas_lidas": total, "linhas_estruturais_vazias": 0},
        })
    return manifest


def prepare(content, month=MONTH, rows=5, manifest=None, xml=XML):
    raw = compact_json(manifest if manifest is not None else manifest_for({month: (content, rows)})).encode()
    return prepare_month(content, month, raw, sha256(raw).hexdigest(), (xml[:10], xml[10:]))


def synthetic_approval(manifest, target):
    now = datetime.now(timezone.utc)
    raw = compact_json({"escopo": "pcdf-fixture", "destino": target,
                        "aprovado_em": (now - timedelta(minutes=1)).isoformat(),
                        "expira_em": (now + timedelta(minutes=5)).isoformat(),
                        "referencia": "fixture/approval", "aprovador": "Ensaio sintetico",
                        "versao_layout": "1.0", "manifesto_sha256": sha256(manifest).hexdigest()}).encode()
    signed = subprocess.run(["node", "-e", """
      const {generateKeyPairSync, sign}=require('node:crypto');
      const {publicKey,privateKey}=generateKeyPairSync('ed25519');
      const record=Buffer.from(require('node:fs').readFileSync(0,'utf8'),'hex');
      process.stdout.write(JSON.stringify([publicKey.export({type:'spki',format:'pem'}),
        sign(null,record,privateKey).toString('hex')]));
    """], input=raw.hex(), text=True, capture_output=True, check=True, timeout=8)
    pem, signature = json.loads(signed.stdout)
    return raw, bytes.fromhex(signature), pem.encode("ascii"), sha256(pem.encode("ascii")).hexdigest()


class ManifestTests(unittest.TestCase):
    def test_preflight_never_promotes_an_unresolved_requirement(self):
        passed = {"resultado": "APROVADO"}
        self.assertEqual(preflight_report([])["resultado"], "REPROVADO")
        self.assertEqual(preflight_report([passed, {}])["resultado"], "REPROVADO")
        self.assertEqual(preflight_report([passed])["resultado"], "APROVADO")
        self.assertEqual(preflight_report([passed, {"resultado": "PENDENTE"}])["resultado"], "PENDENTE")
        self.assertEqual(preflight_report([passed, {"resultado": "PENDENTE"}, {"resultado": "REPROVADO"}])[
            "resultado"], "REPROVADO")

    def test_pilot_catalog_refuses_incompatible_evidence(self):
        inspect = pilot_recovery.dedicated.inspect
        evidence = {"postgres": "17.11", "postgis": "3.6.2", "rls": 19, "fks": 34,
                    "staging": 0, "origins": 0, "occurrences": 0, "audit": 0, "role_restricted": True,
                    "memberships": 0, "no_schema_create": True, "no_write": True, "public_connect": False}
        with patch.object(control, "attest"), patch.object(control, "psql", return_value=json.dumps(evidence)):
            self.assertEqual(inspect({}, "", None), evidence)
        for key, value in (("postgis", None), ("fks", 33), ("rls", 18), ("role_restricted", False),
                           ("no_write", False), ("public_connect", True), ("staging", 1)):
            broken = {**evidence, key: value}
            with self.subTest(key=key), patch.object(control, "attest"), patch.object(
                control, "psql", return_value=json.dumps(broken)
            ), self.assertRaises(control.Refused):
                inspect({}, "", None)
        for failure in ("wrong database", "wrong cluster", "unavailable", "bad credential"):
            with self.subTest(failure=failure), patch.object(
                control, "attest", side_effect=control.Refused(failure)
            ), patch.object(control, "psql") as query, self.assertRaises(control.Refused):
                inspect({}, "", None)
            query.assert_not_called()

    def test_approval_rejects_wrong_scope_target_key_expiry_and_signature(self):
        signed = synthetic_approval(b"fixture", "sandbox-test")
        grant = approval(*signed, "sandbox-test", scope="pcdf-fixture")
        self.assertEqual(grant["manifesto_sha256"], sha256(b"fixture").hexdigest())
        with self.assertRaises(InvalidFile):
            approval(*signed, "sandbox-test")
        with self.assertRaises(InvalidFile):
            approval(*signed, "other", scope="pcdf-fixture")
        with self.assertRaises(InvalidFile):
            approval(*signed, "sandbox-test", scope="pcdf-fixture",
                     now=datetime.now(timezone.utc) + timedelta(hours=1))
        with self.assertRaises(InvalidFile):
            approval(*signed[:3], "0" * 64, "sandbox-test", scope="pcdf-fixture")
        with self.assertRaises(InvalidFile):
            approval(signed[0] + b" ", *signed[1:], "sandbox-test", scope="pcdf-fixture")

    def test_contract_and_literals(self):
        self.assertEqual((len(HEADERS), len(ORIGINALS), len(TECHNICAL)), (34, 18, 6))
        self.assertEqual(len(set(HEADERS) - set(ORIGINALS) - set(TECHNICAL)), 10)
        rows = prepare(csv_fixture())["batch"]["rows"]
        self.assertEqual(rows[0]["raw"]["numero_registro"], "000001")
        self.assertEqual(rows[0]["raw"]["area_endereco_original"], '  Área "TESTE";\r\nlinha  ')
        self.assertEqual(rows[0]["raw"]["flagrante"], "NÃO INFORMADO")
        self.assertEqual(rows[0]["derived"]["estados_originais"]["flagrante"], "desconhecido")
        self.assertEqual(rows[0]["derived"]["estados_originais"]["quadra_endereco_original"], "vazio_semantico")
        self.assertEqual(rows[0]["derived"]["estados_originais"]["latitude_utm_original"], "ausente")
        self.assertEqual(rows[0]["derived"]["candidate"], rows[1]["derived"]["candidate"])
        self.assertNotEqual(rows[0]["raw"]["natureza_original"], rows[1]["raw"]["natureza_original"])
        self.assertEqual({k: v for k, v in rows[0]["raw"].items() if k not in ("linha_xml", "linha_origem_id")},
                         {k: v for k, v in rows[2]["raw"].items() if k not in ("linha_xml", "linha_origem_id")})
        self.assertNotEqual(rows[0]["raw"]["linha_origem_id"], rows[2]["raw"]["linha_origem_id"])

    def test_incomplete_and_no_projections_invented(self):
        rows = prepare(csv_fixture())["batch"]["rows"]
        self.assertEqual(rows[3]["raw"]["natureza_original"], "")
        self.assertEqual(rows[3]["raw"]["latitude_geo_original"], "NULL")
        for key in ("candidate", "data", "horario", "flagrante"):
            self.assertIsNone(rows[3]["derived"][key])
        self.assertIn("estado_recebido_invalida", {d["rule"] for d in rows[3]["diagnostics"]})
        self.assertIn("estado_recebido_ausente", {d["rule"] for d in rows[0]["diagnostics"]})
        self.assertIn("ra_nao_verificada", {d["rule"] for d in rows[0]["diagnostics"]})
        self.assertEqual(rows[0]["derived"]["coordenadas_candidatas"], [None, None])
        self.assertEqual(rows[0]["derived"]["classificacao_status"], "pendente")

    def test_candidate_and_civil_fields(self):
        bad = {2: {"ocorrencia_chave": "chave divergente", "horario": "13:00:00", "numero_registro": "+00001"},
               3: {"data_inicio_fato_original": "13/08/2026 00:00:00"}}
        rows = prepare(csv_fixture(overrides=bad))["batch"]["rows"]
        self.assertEqual(rows[0]["raw"]["numero_registro"], "+00001")
        self.assertIsNone(rows[0]["derived"]["candidate"])
        self.assertIsNone(rows[0]["derived"]["horario"])
        self.assertIsNone(rows[1]["derived"]["data"])
        with self.assertRaisesRegex(InvalidFile, "registro_fora_da_competencia"):
            prepare(csv_fixture(overrides={2: {"data": "2026-07-12"}}))

    def test_bad_transport(self):
        content = csv_fixture()
        for bad in (b"header", b"\xff",
                    content + b'"unclosed', content + b"\0", csv_fixture(positions=(2, 2))):
            with self.subTest(length=len(bad)), self.assertRaises(InvalidFile):
                prepare(bad)
        with self.assertRaisesRegex(InvalidFile, "largura_ou_limite_csv"):
            prepare(csv_fixture(overrides={2: {"local": "x" * 16385}}))
        self.assertEqual(prepare(csv_fixture(positions=()), rows=0)["batch"]["rows"], [])

    def test_invalid_provenance_and_flow_separation(self):
        legacy = fixture([2], month=MONTH)
        self.assertEqual(prepare_synthetic(legacy, MONTH)["xmlSize"], len(XML_FIXTURE))
        with self.assertRaises(InvalidFile):
            prepare_synthetic(csv_fixture(), MONTH)
        with self.assertRaisesRegex(InvalidFile, "proveniencia_linha_invalida"):
            prepare(legacy, rows=1)
        for override in ({"linha_origem_id": "0" * 64},
                         {"versao_tratamento": "declared-only"}, {"aba_origem": "OTHER"}):
            with self.subTest(fields=tuple(override)), self.assertRaises(InvalidFile):
                prepare(csv_fixture(overrides={2: override}))

    def test_manifest_digest_and_consistency(self):
        content = csv_fixture()
        manifest = manifest_for({MONTH: (content, 5)})
        raw = compact_json(manifest).encode()
        with self.assertRaisesRegex(InvalidFile, "manifesto_nao_aprovado"):
            prepare_month(content, MONTH, raw, "0" * 64, (XML,))
        duplicate = b'{"fonte":{},' + raw[1:]
        with self.assertRaisesRegex(InvalidFile, "manifesto_inconsistente"):
            prepare_month(content, MONTH, duplicate, sha256(duplicate).hexdigest(), (XML,))
        for key in ("layout", "reconciliacao"):
            with self.subTest(key=key), self.assertRaisesRegex(InvalidFile, "manifesto_inconsistente"):
                prepare(content, manifest={**manifest, key: {}})
        with self.assertRaisesRegex(InvalidFile, "contagem_csv_divergente"):
            prepare(content, rows=6)
        with self.assertRaisesRegex(InvalidFile, "csv_divergente_manifesto"):
            prepare(content[:-1] + b" ", manifest=manifest)
        with self.assertRaisesRegex(InvalidFile, "xml_divergente_manifesto"):
            prepare(content, manifest=manifest, xml=XML[::-1])
        for xml in (XML[:-1], XML + b" "):
            with self.subTest(xml_size=len(xml)), self.assertRaisesRegex(InvalidFile, "xml_divergente_manifesto"):
                prepare(content, manifest=manifest, xml=xml)

    def test_limits(self):
        with self.assertRaisesRegex(InvalidFile, "limite_competencia"):
            prepare(b"X" * (MAX_BYTES + 1), rows=0)
        with self.assertRaisesRegex(InvalidFile, "limite_competencia"):
            prepare(csv_fixture(), rows=10001)

    def test_manifest_terminal_statuses(self):
        content = csv_fixture()
        for finalized, status in ((False, "reconciliado"), (True, "validado")):
            with self.subTest(status=status):
                manifest = manifest_for({MONTH: (content, 5)}, finalized=finalized)
                result = prepare(content, manifest=manifest)
                self.assertEqual(result["manifest"]["status"], status)
                self.assertEqual(len(result["batch"]["rows"]), 5)
        for status in ("aprovado", "interrompido", "em_validacao", "VALIDADO", None):
            with self.subTest(status=status), self.assertRaisesRegex(InvalidFile, "manifesto_inconsistente"):
                prepare(content, manifest={**manifest, "status": status})

    def test_validated_requires_final_evidence(self):
        content = csv_fixture()
        cases = (
            ("preflight", "status", "interrompido"),
            ("execucao", "hash_fonte_reconferido", 1),
            ("reconciliacao", "conferida_integralmente", False),
            ("reconciliacao", "ids_tecnicos_distintos", 4),
        )
        for section, key, value in cases:
            with self.subTest(key=key), self.assertRaisesRegex(InvalidFile, "manifesto_inconsistente"):
                manifest = manifest_for({MONTH: (content, 5)}, finalized=True)
                manifest[section][key] = value
                prepare(content, manifest=manifest)
        for key, value in (("sha256", "0" * 64), ("bytes", len(XML) + 1)):
            with self.subTest(key=key), self.assertRaisesRegex(InvalidFile, "manifesto_inconsistente"):
                manifest = manifest_for({MONTH: (content, 5)}, finalized=True)
                manifest["preflight"]["fonte"][key] = value
                prepare(content, manifest=manifest)
        for key, value in (("linhas_lidas", 4), ("linhas_estruturais_vazias", 1)):
            with self.subTest(key=key), self.assertRaisesRegex(InvalidFile, "manifesto_inconsistente"):
                manifest = manifest_for({MONTH: (content, 5)}, finalized=True)
                manifest["preflight"]["estrutura_xml"][key] = value
                prepare(content, manifest=manifest)
        unproven = manifest_for({MONTH: (content, 5)})
        unproven["status"] = "validado"
        with self.assertRaisesRegex(InvalidFile, "manifesto_inconsistente"):
            prepare(content, manifest=unproven)

    def test_validated_preserves_hash_and_provenance_checks(self):
        content = csv_fixture()
        manifest = manifest_for({MONTH: (content, 5)}, finalized=True)
        raw = compact_json(manifest).encode()
        with self.assertRaisesRegex(InvalidFile, "manifesto_nao_aprovado"):
            prepare_month(content, MONTH, raw + b"\n", sha256(raw).hexdigest(), (XML,))
        with self.assertRaisesRegex(InvalidFile, "csv_divergente_manifesto"):
            prepare(content + b" ", manifest=manifest)
        with self.assertRaisesRegex(InvalidFile, "xml_divergente_manifesto"):
            prepare(content, manifest=manifest, xml=XML[::-1])
        wrong_origin = csv_fixture(overrides={2: {"linha_origem_id": "0" * 64}})
        with self.assertRaisesRegex(InvalidFile, "proveniencia_linha_invalida"):
            prepare(wrong_origin, manifest=manifest_for({MONTH: (wrong_origin, 5)}, finalized=True))


def qualify_database():
    control.BASE = control.REPO / ".cache" / "pcdf-receiver-qualification"
    password = secrets.token_urlsafe(40)
    commands = backup.Commands()
    runner = backup.bootstrap_runner(commands, password)
    cluster = control.prepare("Portuguese_Brazil.1252", run=runner)
    sql = HERE / "receiver-staging-fixture.sql"
    service_sql = HERE / "receiver-service-fixture.sql"
    cluster["artifacts"][str(sql.relative_to(control.REPO))] = control.digest(sql)
    cluster["artifacts"][str(service_sql.relative_to(control.REPO))] = control.digest(service_sql)
    control.save(cluster)
    evidence = Path(cluster["root"]) / "evidence"
    report = {"result": "FAIL", "checks": [], "data": "synthetic"}
    service_secret = secrets.token_urlsafe(40)

    def query(statement):
        return json.loads(control.psql(cluster, password, sql=statement, run=runner))

    def sql_delivery(payload):
        encoded = base64.b64encode(compact_json(payload).encode()).decode()
        return f"convert_from(decode('{encoded}','base64'),'UTF8')::jsonb"

    def admin_stdin(statement):
        def stdin(exe, args, password=None, console=False):
            return commands.call(exe, args, password=password, input=statement, timeout=90)
        return control.psql(cluster, password, file="-", run=stdin)

    def service(statement):
        return pilot_recovery.login_sql(commands, cluster, service_secret, statement)

    def record(payload):
        request = uuid4()
        audit = {"sha256": payload["batch"]["sha256"], "manifesto_sha256": payload["manifestSha"]}
        query(f"""SET ROLE pcdf_receiver_fixture;
            INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,depois,justificativa,request_id)
            VALUES ('servico','pcdf-receptor-fixture','tentativa_iniciada',{sql_delivery(audit)},
              'Ensaio PCDF', '{request}'); SELECT 'true'""")
        return request

    def stage(payload, request, role="pcdf_receiver_fixture", expected_error=None):
        call = f"sentinela_pcdf_receiver_fixture.stage({sql_delivery(payload)},'{request}')"
        if expected_error:
            fail_after_staging = "PERFORM 1/0;" if expected_error == "22012" else ""
            outcome = "" if role != "pcdf_receiver_fixture" else f"""
                INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,depois,justificativa,request_id)
                VALUES ('servico','pcdf-receptor-fixture','tentativa_falhou',
                        jsonb_build_object('sqlstate','{expected_error}'),'Ensaio PCDF','{request}');
                """
            body = f"""DO $check$ BEGIN
                PERFORM {call};
                {fail_after_staging}
                RAISE EXCEPTION 'Expected SQLSTATE did not occur';
              EXCEPTION WHEN SQLSTATE '{expected_error}' THEN {outcome or 'NULL;'}
              END $check$; SELECT 'true';"""
        else:
            body = f"SELECT {call};"
        statement = f"BEGIN; SET LOCAL ROLE {role}; {body} COMMIT;"
        # Use stdin so multi-MiB fixture JSON does not cross the OS argument limit.
        def stdin(exe, args, password=None, console=False):
            return commands.call(exe, args, password=password, input=statement, timeout=90)
        return json.loads(control.psql(cluster, password, file="-", run=stdin))

    def mark(name):
        report["checks"].append(name)
        print(name, flush=True)

    def reconcile(receipt, content):
        recovered = query(f"""SELECT jsonb_agg(jsonb_build_object('raw',s.campos_csv,
          'originals',o.fields,'state',s.estado) ORDER BY s.registro_csv)
          FROM sentinela.linhas_staging s JOIN sentinela.linhas_origem l ON l.id=s.linha_origem_id
          CROSS JOIN LATERAL (SELECT jsonb_object_agg(k,to_jsonb(l)->k) AS fields
            FROM jsonb_object_keys(s.campos_csv) k WHERE k IN ({','.join(repr(k) for k in ORIGINALS)})) o
          WHERE s.execucao_id='{receipt["run"]}'""")
        reader = csv.DictReader(io.StringIO(content.decode(), newline=""), delimiter=";")
        for expected, row in zip(reader, recovered, strict=True):
            assert row["raw"] == expected and row["originals"] == {key: expected[key] for key in ORIGINALS}
            assert row["state"] == "bloqueada"
        return len(recovered)

    try:
        control.create(cluster, run=runner)
        pilot_recovery.allow_fixture_login(cluster)
        control.start(cluster, password, run=runner)
        control.install(cluster, password, run=runner)
        control.attest(cluster, password, run=runner)
        control.psql(cluster, password, file=sql, run=runner)
        admin_stdin(pilot_recovery.role_sql(service_secret))
        control.psql(cluster, password, file=service_sql, run=runner)
        report["serviceDenials"] = pilot_recovery.permissions(commands, cluster, service_secret)
        mark("authenticated_service_negative_permissions")
        report["database"] = query("""SELECT json_build_object('name',current_database(),'host',host(inet_server_addr()),
          'port',inet_server_port(),'version',current_setting('server_version'),
          'postgis',(SELECT extversion FROM pg_extension WHERE extname='postgis'))""")
        security = query("""SELECT json_build_object(
          'rls',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='sentinela' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity),
          'fks',(SELECT count(*) FROM pg_constraint WHERE contype='f' AND connamespace='sentinela'::regnamespace),
          'scoped_role',(SELECT NOT (rolcanlogin OR rolsuper OR rolbypassrls) FROM pg_roles WHERE rolname='pcdf_receiver_fixture'),
          'public_execute',(SELECT EXISTS(SELECT FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE')
             FROM pg_proc p WHERE p.oid='sentinela_pcdf_receiver_fixture.stage(jsonb,uuid)'::regprocedure),
          'no_occurrence_write',NOT has_table_privilege('pcdf_receiver_fixture','sentinela.ocorrencias','INSERT'))""")
        assert security == {"rls": 19, "fks": 34, "scoped_role": True, "public_execute": False, "no_occurrence_write": True}, security
        report["security"] = security
        mark("schema_constraints_rls_and_role")

        july = csv_fixture("2026-07", (7,), overrides={7: {"numero_registro": "000001"}})
        august = csv_fixture()
        september = csv_fixture("2026-09", (7,))
        manifest = manifest_for({"2026-07": (july, 1), MONTH: (august, 5), "2026-09": (september, 1)},
                                finalized=True)
        encoded_manifest = compact_json(manifest).encode()
        (evidence / "fixture.xml").write_bytes(XML)
        (evidence / "fixture-manifest.json").write_bytes(encoded_manifest)
        for month, content in ((MONTH, august), ("2026-07", july), ("2026-09", september)):
            (evidence / f"fixture-{month}.csv").write_bytes(content)
        payload = prepare(august, manifest=manifest)
        first_request = record(payload)
        assert stage(payload, first_request, role="postgres", expected_error="42501")
        mark("unauthorized_role_rejected")
        assert stage(payload, first_request, expected_error="22012")
        assert query("""SELECT json_build_array(
          (SELECT count(*) FROM sentinela.extracoes_origem WHERE fonte='PCDF-RECEPTOR-TESTE'),
          (SELECT count(*) FROM sentinela.eventos_auditoria WHERE servico='pcdf-receptor-fixture'
            AND acao='tentativa_iniciada'))""") == [0, 1]
        mark("interruption_rollback_and_durable_attempt")

        requests = [record(payload), record(payload)]
        with ThreadPoolExecutor(max_workers=2) as pool:
            receipts = list(pool.map(lambda request: stage(payload, request), requests))
        result, replay = sorted(receipts, key=lambda receipt: receipt["replay"])
        assert result["records"] == 5 and not result["replay"]
        assert replay["replay"] and (result["lot"], result["run"]) == (replay["lot"], replay["run"])
        mark("retry_and_replay")
        recovered = query(f"""SELECT jsonb_agg(jsonb_build_object('raw',s.campos_csv,
          'originals',o.fields,'state',s.estado,'diagnostics',s.diagnosticos) ORDER BY s.registro_csv)
          FROM sentinela.linhas_staging s JOIN sentinela.linhas_origem l ON l.id=s.linha_origem_id
          CROSS JOIN LATERAL (SELECT jsonb_object_agg(k,to_jsonb(l)->k) AS fields
            FROM jsonb_object_keys(s.campos_csv) k WHERE k IN ({','.join(repr(k) for k in ORIGINALS)})) o
          WHERE s.execucao_id='{result["run"]}'""")
        original_csv = list(csv.DictReader(io.StringIO(august.decode(), newline=""), delimiter=";"))
        for expected, row in zip(original_csv, recovered, strict=True):
            assert row["raw"] == expected and row["originals"] == {key: expected[key] for key in ORIGINALS}
            assert row["state"] == "bloqueada"
        assert "chave_candidata_conflitante" in {d["rule"] for d in recovered[0]["diagnostics"]}
        mark("roundtrip_34_fields_18_originals_and_distinct_associations")
        earlier = prepare(july, "2026-07", manifest=manifest)
        earlier_result = stage(earlier, record(earlier))
        assert query(f"""SELECT (diagnosticos @> '[{{"rule":"chave_candidata_conflitante"}}]')::text
          FROM sentinela.linhas_staging WHERE execucao_id='{earlier_result["run"]}'""")
        conflicting = prepare(september, "2026-09", manifest=manifest)
        assert stage(conflicting, record(conflicting), expected_error="23505")
        assert query("""SELECT json_build_array(
          (SELECT count(*) FROM sentinela.lotes_importacao),
          (SELECT count(*) FROM sentinela.execucoes_importacao),
          (SELECT count(*) FROM sentinela.linhas_origem),
          (SELECT count(*) FROM sentinela.linhas_staging),
          (SELECT count(*) FROM sentinela.ocorrencias),
          (SELECT count(*) FROM sentinela.ocorrencia_naturezas))""") == [2, 2, 6, 6, 0, 0]
        mark("cross_month_candidate_and_source_position_conflict")
        large_xml = b"<Workbook><!-- synthetic volume fixture --></Workbook>"
        large_hash = sha256(large_xml).hexdigest()
        positions = range(100, 6493)
        large = csv_fixture(positions=positions, xml_hash=large_hash,
                            overrides={i: {"local": "Setor de teste " * 17} for i in positions})
        assert len(large) >= 2976684
        large_manifest = compact_json(manifest_for({MONTH: (large, len(positions))}, large_xml)).encode()
        signed = synthetic_approval(large_manifest, cluster["uuid"])
        grant = approval(*signed, cluster["uuid"], scope="pcdf-fixture")
        large_payload = prepare_month(large, MONTH, large_manifest, grant["manifesto_sha256"], (large_xml,))
        batch = sql_delivery(large_payload)
        admin_stdin(f"""INSERT INTO sentinela_pcdf_receiver_fixture.approved_delivery
          SELECT d->>'manifestSha',d->'batch'->>'sha256',d->'source'->>'sha256',
            encode(sha256(convert_to(d::text,'UTF8')),'hex') FROM (SELECT {batch} d) q;""")
        service(f"""DO $test$ BEGIN
          PERFORM sentinela_pcdf_receiver_fixture.receive_fixture({batch},gen_random_uuid());
          RAISE EXCEPTION 'Unaudited delivery accepted';
          EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END $test$;""")
        def service_request():
            request = uuid4()
            audit = sql_delivery({"sha256": large_payload["batch"]["sha256"], "manifesto_sha256": grant["manifesto_sha256"]})
            service(f"SELECT sentinela_pcdf_receiver_fixture.record_attempt({audit},'{request}');")
            return f"SELECT sentinela_pcdf_receiver_fixture.receive_fixture({batch},'{request}');"

        service("BEGIN;" + service_request() + "ROLLBACK;")
        assert query("SELECT count(*) FROM sentinela.linhas_staging") == 6
        requests = [service_request(), service_request()]
        with ThreadPoolExecutor(max_workers=2) as pool:
            volume, replay = sorted(map(json.loads, pool.map(service, requests)), key=lambda row: row["replay"])
        assert volume["records"] == 6393 and not volume["replay"]
        assert replay["replay"] and replay["lot"] == volume["lot"] and replay["run"] == volume["run"]
        assert query("""SELECT count(*) FROM sentinela.eventos_auditoria
          WHERE acao='tentativa_iniciada' AND depois->>'login'='pcdf_fixture_login'""") == 3
        assert query(f"""SELECT jsonb_build_array(count(*), count(DISTINCT linha_origem_id))
          FROM sentinela.linhas_staging WHERE execucao_id='{volume["run"]}'""") == [6393, 6393]
        matched = reconcile(volume, large)
        assert matched == 6393
        assert query("""SELECT json_build_array(
          (SELECT count(*) FROM sentinela.ocorrencias),
          (SELECT count(*) FROM sentinela.ocorrencia_naturezas))""") == [0, 0]
        mark("volume_6393_rows_and_independent_extraction")
        report["backup"] = pilot_recovery.restore_and_compare(cluster, password, runner, commands, service_secret)
        mark("independent_restore_schema_acl_and_exact_rows")
        report.update(result="PASS", stagingRows=6399, promoted=0, volumeBytes=len(large),
                      comparedRows=matched, differences=0, syntheticApproval="ed25519")
    except (Exception, KeyboardInterrupt) as error:
        report["error"] = type(error).__name__
        if commands.events:
            report["lastCommand"] = commands.events[-1]
        if error.__traceback__:
            trace = error.__traceback__
            while trace.tb_next:
                trace = trace.tb_next
            report["line"] = trace.tb_lineno
    finally:
        if cluster["phase"] in {"INSTALLED", "RUNNING", "FAILED", "START_FAILED", "ATTESTATION_FAILED", "START_UNKNOWN"}:
            try:
                control.stop(cluster, password, run=runner)
            except (Exception, KeyboardInterrupt):
                report.update(result="FAIL", stop="UNCONFIRMED")
        report["state"] = cluster["phase"]
        (evidence / "receiver-result.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report), flush=True)
        print("Evidence: " + str(evidence / "receiver-result.json"), flush=True)
    return int(report["result"] != "PASS" or report["state"] != "STOPPED")


if __name__ == "__main__":
    if sys.argv[1:] == ["--isolated-only"]:
        sys.exit(qualify_database())
    unittest.main()
