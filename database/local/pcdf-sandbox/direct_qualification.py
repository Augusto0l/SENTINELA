"""Exercise the direct intake over HTTP and reconcile every stored synthetic field."""
from hashlib import sha256
import json
from pathlib import Path
import runpy
import subprocess

from direct_input import prepare_direct
from direct_runtime import HERE, ROLES, QUALIFICATION_ORIGIN, app_environment, control, profile_query
from manifest_receiver import HEADERS, ORIGINALS

fixtures = runpy.run_path(str(HERE / "qualify-manifest.py"))
fixture, manifest_for = fixtures["csv_fixture"], fixtures["manifest_for"]


def fixture_delivery(root):
    xml = b"<Workbook><!-- Synthetic only: direct staging qualification --></Workbook>"
    xml_hash = sha256(xml).hexdigest()
    january = "2021-01"
    indices = range(2, 6395)
    overrides = {n: {"ano_fato": "2021", "data_inicio_fato_original": "12/01/2021 12:34:56",
                     "data": "2021-01-12", "numero_registro": f"{n:06}"} for n in indices}
    for n in indices:
        overrides[n]["ocorrencia_chave"] = json.dumps(
            ["PCDF","2026","Unidade Época TESTE",overrides[n]["numero_registro"]],
            ensure_ascii=False, separators=(",",":"))
    overrides[5].update(numero_registro="", ocorrencia_chave="", data="", data_inicio_fato_original="inválida")
    january_csv = fixture(january, indices, overrides=overrides, xml_hash=xml_hash)
    padding = 2948416 - len(january_csv)
    each, remainder = divmod(padding, len(indices))
    assert each >= 0
    for i, n in enumerate(indices):
        overrides[n]["unidade_apuracao"] = "X" * (each + (i < remainder))
    january_csv = fixture(january, indices, overrides=overrides, xml_hash=xml_hash)
    assert len(january_csv) == 2948416

    files = {january: (january_csv, len(indices))}
    for month, positions in {"2026-02":[7001,7002,7003], "2026-03":[7101,7102,7103],
                             "2026-04":[7201,7202,7203]}.items():
        files[month] = (fixture(month, positions, xml_hash=xml_hash), len(positions))
    manifest = json.dumps(manifest_for(files, xml, finalized=True), ensure_ascii=False).encode()
    (root / "fixture-manifest.json").write_bytes(manifest)
    batches = {}
    for month, (content, _) in files.items():
        name = f"pcdf_naturezas_{month}.csv"
        (root / name).write_bytes(content)
        batches[month] = prepare_direct(name, content, manifest)["batch"]
    return batches


READ_ROWS = """
SELECT jsonb_build_object('raw',s.campos_csv,'originals',(
 SELECT jsonb_object_agg(f,to_jsonb(o)->f) FROM unnest(ARRAY[%s]) f),
 'key',o.linha_origem_id,'xml',o.linha_xml::text,'sheet',o.aba_origem,
 'ordinal',s.registro_csv,'month',to_char(l.competencia,'YYYY-MM'),
 'state',s.estado,'unpublished',s.ocorrencia_id IS NULL AND s.associacao_id IS NULL)
FROM sentinela.linhas_staging s JOIN sentinela.linhas_origem o ON o.id=s.linha_origem_id
JOIN sentinela.lotes_importacao l ON l.id=s.lote_id WHERE l.versao_contrato='1.0'
ORDER BY l.competencia,s.registro_csv;
""" % ",".join("'" + key + "'" for key in ORIGINALS)

SUMMARY = """
SELECT jsonb_build_object(
 'origins',(SELECT count(*) FROM sentinela.linhas_origem WHERE versao_identificador='pcdf-linha-v1'),
 'staging',(SELECT count(*) FROM sentinela.linhas_staging s JOIN sentinela.lotes_importacao l
   ON l.id=s.lote_id WHERE l.versao_contrato='1.0'),
 'lots',(SELECT count(*) FROM sentinela.lotes_importacao WHERE versao_contrato='1.0'),
 'runs',(SELECT count(*) FROM sentinela.execucoes_importacao WHERE versao_importador='pcdf-local-v1'),
 'xml_declared',(SELECT count(*) FROM sentinela.extracoes_origem WHERE fonte='PCDF' AND sha256_xml IS NOT NULL),
 'csv_only',(SELECT count(*) FROM sentinela.extracoes_origem WHERE sha256_xml IS NULL AND nome_xml IS NULL),
 'occurrences',(SELECT count(*) FROM sentinela.ocorrencias),
 'associations',(SELECT count(*) FROM sentinela.ocorrencia_naturezas),
 'audits',(SELECT count(*) FROM sentinela.eventos_auditoria WHERE servico='pcdf-local'),
 'accounts',(SELECT count(DISTINCT depois->>'account') FROM sentinela.eventos_auditoria WHERE servico='pcdf-local'),
 'failed',(SELECT count(*) FROM sentinela.eventos_auditoria WHERE acao='falha_pcdf'),
 'replays',(SELECT count(*) FROM sentinela.eventos_auditoria WHERE acao='reenvio_pcdf'),
 'forced_rls',(SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace
    AND relkind='r' AND relrowsecurity AND relforcerowsecurity),
 'non_privileged',(SELECT count(*) FROM pg_roles WHERE rolname IN
    ('sentinela_local_admin','sentinela_local_operator','sentinela_local_analyst','sentinela_pcdf_owner')
    AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit)),
 'atomic_failure_attempts',(SELECT count(*) FROM sentinela.eventos_auditoria
    WHERE acao='falha_pcdf' AND depois->>'month'='2026-04'),
 'no_public_exec',(SELECT NOT EXISTS(SELECT FROM pg_proc p, LATERAL aclexplode(p.proacl) a
    WHERE p.pronamespace='sentinela_pcdf_local'::regnamespace AND a.grantee=0)));
"""


def qualify(cluster, admin, runner, credentials, integrated=False):
    root = Path(cluster["root"])
    evidence = root / "evidence" / "pcdf-direct-qualification.json"
    report = {"resultado": "REPROVADO", "cluster": cluster["uuid"], "banco": cluster["database"], "porta": cluster["port"]}
    batches = fixture_delivery(root)
    fail_hash = batches["2026-04"]["sha256"]
    sql = f"""
    CREATE FUNCTION sentinela_pcdf_local.qualification_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.acao='staging_pcdf' AND NEW.depois->>'sha256'='{fail_hash}'
      THEN RAISE EXCEPTION 'synthetic rollback after staging'; END IF;
      RETURN NEW;
    END $$;
    REVOKE ALL ON FUNCTION sentinela_pcdf_local.qualification_failure() FROM PUBLIC;
    CREATE TRIGGER qualification_atomic_rollback BEFORE INSERT ON sentinela.eventos_auditoria
      FOR EACH ROW EXECUTE FUNCTION sentinela_pcdf_local.qualification_failure();
    """
    try:
        control.psql(cluster, admin, sql=sql, run=runner)
        env = app_environment(cluster, credentials, origin="http://localhost:3000" if integrated else QUALIFICATION_ORIGIN)
        result = subprocess.run(["node", str(HERE / "qualify-direct.mjs")], cwd=control.REPO,
            input=json.dumps({"root": str(root), "analyst": credentials[ROLES[2]]}),
            env=env, encoding="utf8", capture_output=True, timeout=420)
        report["http"] = (json.loads(result.stdout.splitlines()[-1]) if result.stdout.strip() else {})
        print(json.dumps(report["http"], ensure_ascii=True), flush=True)
        control.require(result.returncode == 0 and report["http"].get("resultado") == "APROVADO",
                        "Direct browser and API qualification failed")

        expected = [row["raw"] for month, batch in sorted(batches.items()) if month != "2026-04" for row in batch["rows"]]
        matches = [json.loads(line) for line in control.psql(cluster, admin, sql=READ_ROWS, run=runner).splitlines()]
        control.require(len(matches) == len(expected), "Staging reconciliation count")
        for actual, original in zip(matches, expected):
            control.require(actual["raw"] == original and len(original) == len(HEADERS)
                and actual["originals"] == {key: original[key] for key in ORIGINALS}
                and (actual["key"],actual["xml"],actual["sheet"]) == tuple(original[k] for k in ("linha_origem_id","linha_xml","aba_origem"))
                and actual["state"] == "bloqueada" and actual["unpublished"], "Original/staging values differ")
        report["campos_conferidos"] = {"staging": len(expected) * len(HEADERS), "origem": len(expected) * len(ORIGINALS)}
        report["database"] = json.loads(control.psql(cluster, admin, sql=SUMMARY, run=runner))
        control.require(report["database"] == {
            "origins": 6399, "staging": 6399, "lots": 3, "runs": 3, "xml_declared": 1, "csv_only": 1,
            "occurrences": 0, "associations": 0, "audits": 12, "accounts": 2, "failed": 1, "replays": 2,
            "forced_rls": 19, "non_privileged": 4, "atomic_failure_attempts": 1, "no_public_exec": True,
        }, "Database qualification invariants failed")
        control.psql(cluster, admin, run=runner, sql="""
            DROP TRIGGER qualification_atomic_rollback ON sentinela.eventos_auditoria;
            DROP FUNCTION sentinela_pcdf_local.qualification_failure();""")
        control.stop(cluster, admin, run=runner)
        control.start(cluster, admin, run=runner)
        persisted = json.loads(profile_query(cluster, runner, credentials[ROLES[0]], ROLES[0],
                                             "SELECT sentinela_pcdf_local.history();"))
        control.require(len(persisted) == 6 and any(item["status"] == "falhou" for item in persisted),
                        "History did not survive database restart")
        report["historico_apos_reiniciar"] = len(persisted)
        if integrated:
            counts = json.loads(control.psql(cluster, admin, sql="""
              SELECT json_build_object(
                'persistidas',(SELECT count(*) FROM sentinela.linhas_staging s JOIN sentinela.lotes_importacao l
                    ON l.id=s.lote_id WHERE l.versao_contrato='geral-v1'),
                'execucoes',(SELECT count(*) FROM sentinela.execucoes_importacao WHERE versao_importador='geral-v1'),
                'reconciliacao',(SELECT bool_and(s.campos_csv->'cells'=o.estrutura_celulas->'cells')
                   FROM sentinela.linhas_staging s JOIN sentinela.linhas_origem o ON o.id=s.linha_origem_id
                   WHERE o.versao_identificador='geral-v1'),
                'rls',(SELECT count(*) FROM pg_class WHERE relnamespace IN ('sentinela_import_local'::regnamespace,
                   'sentinela_general_accounts'::regnamespace) AND relrowsecurity AND relforcerowsecurity))
            """, run=runner))
            control.require(counts == {"persistidas": 3, "execucoes": 2, "reconciliacao": True, "rls": 3},
                            "General intake reconciliation failed")
            report["general"] = counts
        report["resultado"] = "APROVADO"
    finally:
        evidence.write_text(json.dumps(report, indent=2), encoding="utf8")
        print(json.dumps(report, ensure_ascii=True), flush=True)
