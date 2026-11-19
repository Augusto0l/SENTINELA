"""Run synthetic PCDF staging on a newly attested, disposable cluster."""
import base64
import csv
import io
import json
from pathlib import Path
import secrets
import sys
from time import perf_counter

from pipeline import HEADERS, InvalidFile, XML_FIXTURE, XML_SHA, prepare_csv

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backup"))
import recover as backup

control = backup.c


def fixture(indices, month="2026-01", stride=2, overrides=None, **patch):
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, HEADERS, delimiter=";", lineterminator="\r\n")
    writer.writeheader()
    for index in indices:
        row = dict.fromkeys(HEADERS, "")
        row.update(ano_registro="2026", unidade_registro="Unidade TESTE", numero_registro=f"{index//stride:06}",
                   ano_fato="2026", data_inicio_fato_original=month+"-12T12:34:56",
                   data=month+"-12", horario="12:34:56", natureza_original='  Rótulo "TESTE";\r\nlinha  ',
                   natureza_padronizada_pcdf="Categoria sintética", crime_tentado="NÃO",
                   ra_original="Referência sintética", local="Área TESTE", latitude="-15.8", longitude="-47.9",
                   fonte="PCDF", linha_origem_id=f"{XML_SHA}:NATUREZAS:{index}", linha_xml=str(index),
                   aba_origem="NATUREZAS", versao_tratamento="sandbox-fixture-v1")
        row.update(patch)
        row.update((overrides or {}).get(index, {}))
        writer.writerow(row)
    return buffer.getvalue().encode("utf-8")


def check_parser():
    data = fixture([2, 3])
    rows = prepare_csv(data, "2026-01")["rows"]
    assert len(rows[0]["raw"]) == 34 and rows[0]["derived"]["candidate"] == rows[1]["derived"]["candidate"]
    assert rows[0]["raw"]["natureza_original"] == '  Rótulo "TESTE";\r\nlinha  '
    assert rows[0]["raw"]["numero_registro"] == "000001" and rows[0]["derived"]["crime_tentado"] is False
    assert prepare_csv(fixture([]), "2026-02")["rows"] == []
    for raw in (b"cabecalho errado", b"\xff", data.replace(b"2026;", b"2026;;", 1), fixture([2, 2])):
        try:
            prepare_csv(raw, "2026-01")
        except InvalidFile:
            continue
        raise AssertionError("Invalid synthetic CSV accepted")


def stage_command(batch, after="", xml_sha=XML_SHA):
    encoded = base64.b64encode(json.dumps(batch, ensure_ascii=False, separators=(",", ":")).encode()).decode()
    return ("BEGIN; SET LOCAL ROLE sentinela_pcdf_sbx_importer; "
            "SELECT sentinela_pcdf_lab.stage(convert_from(decode('" + encoded + "','base64'),'UTF8')::jsonb,'"
            + xml_sha + "'," + str(len(XML_FIXTURE)) + "); " + after + " COMMIT;")


def main():
    if sys.argv[1:] == ["--parser-only"]:
        check_parser()
        print("PASS: parser sintético")
        return 0
    if sys.argv[1:] != ["--isolated-only"]:
        sys.exit("Explicit --isolated-only required")
    check_parser()
    control.BASE = control.REPO / "tmp" / "pcdf-sandbox"
    admin = secrets.token_urlsafe(40)
    commands = backup.Commands()
    run = backup.bootstrap_runner(commands, admin)
    cluster = control.prepare("Portuguese_Brazil.1252", run=run)
    for name in ("install.sql", "consolidate.sql", "catalog-fixtures.sql"):
        cluster["artifacts"][str((HERE/name).relative_to(control.REPO))] = control.digest(HERE/name)
    control.save(cluster)
    evidence = Path(cluster["root"]) / "evidence"
    report = {"result": "FAIL", "stages": [], "operationalConnections": 0}

    def read(sql):
        return json.loads(control.psql(cluster, admin, sql=sql, run=run))

    def transact(batch, after="", xml_sha=XML_SHA):
        sql = stage_command(batch, after, xml_sha)

        def stdin(exe, args, password=None, console=False):
            return commands.call(exe, args, password=password, input=sql, timeout=180)

        return json.loads(control.psql(cluster, admin, file="-", run=stdin))

    def native_refusal(sql):
        try:
            control.psql(cluster, admin, sql=sql, run=run)
        except RuntimeError:
            return
        raise AssertionError("Expected native refusal")

    def stage(name):
        report["stages"].append(name)
        print(name, flush=True)

    try:
        control.create(cluster, run=run)
        control.start(cluster, admin, run=run)
        control.install(cluster, admin, run=run)
        control.attest(cluster, admin, run=run)
        control.psql(cluster, admin, file=HERE/"install.sql", run=run)
        control.psql(cluster, admin, file=HERE/"consolidate.sql", run=run)
        report["environment"] = read("""SELECT jsonb_build_object('postgres',current_setting('server_version'),
          'postgis',(SELECT extversion FROM pg_extension WHERE extname='postgis'),'database',current_database(),
          'port',inet_server_port(),'systemId',(SELECT system_identifier::text FROM pg_control_system()))""")
        assert report["environment"]["database"] == "sentinela_rls_sandbox"
        assert report["environment"]["port"] == 55432
        assert report["environment"]["systemId"] != "7702156035351602692"
        stage("attested_isolated_baseline_installed")

        (evidence/"synthetic.xml").write_bytes(XML_FIXTURE)

        def batch(raw, month):
            result = prepare_csv(raw, month)
            path = evidence/(result["sha256"]+".csv")
            if not path.exists():
                path.write_bytes(raw)
            return result

        sample = batch(fixture([2, 3]), "2026-01")
        result = transact(sample)
        assert result["records"] == 2 and result["candidates"] == 1
        replay = transact(sample)
        assert replay == {"replay": True, "lot": result["lot"], "run": result["run"]}
        stage("two_origins_one_provisional_group_same_file_replay")

        collision = batch(fixture([3], local="Conflito sintético"), "2026-01")
        try:
            transact(collision)
        except RuntimeError:
            pass
        else:
            raise AssertionError("Overlapping origin accepted")
        assert read("SELECT to_jsonb(count(*)) FROM sentinela.lotes_importacao") == 1
        stage("cross_batch_origin_conflict_rolls_back")

        pending_rollback = batch(fixture([4, 5], "2026-02"), "2026-02")
        try:
            transact(pending_rollback, "SELECT 1/0;")
        except RuntimeError:
            pass
        else:
            raise AssertionError("Intentional failure accepted")
        assert read("SELECT to_jsonb(count(*)) FROM sentinela.lotes_importacao") == 1
        assert read("SELECT to_jsonb(count(*)) FROM sentinela.linhas_staging") == 2
        retried = transact(pending_rollback)
        assert retried["records"] == 2 and not retried["replay"]
        empty = batch(fixture([], "2026-02"), "2026-02")
        assert transact(empty)["records"] == 0
        stage("failure_after_staging_rolls_back_before_successful_retry")

        invalid = batch(fixture([6], horario="24:00:00", local="", ra_original="",
                                natureza_original="", latitude="NaN", ano_registro="", flagrante="?"), "2026-01")
        invalid_result = transact(invalid)
        assert invalid_result["issues"] >= 7
        review = read("""SET ROLE sentinela_pcdf_sbx_importer;
          SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM sentinela_pcdf_lab.review(NULL,'alta',20) q""")
        assert {"identificacao", "classificacao"} <= {row["tipo"] for row in review}
        assert all(row["status"] == "aberta" for row in review)
        filtered = read("""SET ROLE sentinela_pcdf_sbx_importer;
          SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM sentinela_pcdf_lab.review('classificacao','alta',20) q""")
        assert len(filtered) == 1 and filtered[0]["valor_original"] == ""
        native_refusal("SET ROLE sentinela_pcdf_sbx_importer; SELECT * FROM sentinela_pcdf_lab.review(NULL,NULL,101)")
        native_refusal("SET ROLE sentinela_pcdf_sbx_importer; UPDATE sentinela.pendencias_revisao SET status='resolvida'")
        native_refusal("SET ROLE sentinela_local_reader; SELECT campos_csv FROM sentinela.linhas_staging")
        stage("review_priority_filter_and_negative_permissions")

        start = perf_counter()
        large = batch(fixture(range(10000, 20000), "2026-03"), "2026-03")
        parsed = perf_counter()
        large_run = transact(large)
        finished = perf_counter()
        assert large_run["records"] == 10000 and large_run["candidates"] == 5000
        report["throughput"] = {"rows": 10000, "csvBytes": large["size"],
                                "parseSeconds": round(parsed-start, 3), "transactionSeconds": round(finished-parsed, 3)}
        final = read("""SELECT jsonb_build_object(
          'origins',(SELECT count(*) FROM sentinela.linhas_origem),
          'staging',(SELECT count(*) FROM sentinela.linhas_staging),
          'runs',(SELECT count(*) FROM sentinela.execucoes_importacao),
          'audit',(SELECT count(*) FROM sentinela.eventos_auditoria WHERE acao='staging_pcdf'),
          'issues',(SELECT count(*) FROM sentinela.pendencias_revisao),
          'occurrences',(SELECT count(*) FROM sentinela.ocorrencias),
          'associations',(SELECT count(*) FROM sentinela.ocorrencia_naturezas),
          'forcedRls',(SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace
                        AND relkind='r' AND relrowsecurity AND relforcerowsecurity),
          'rawMatches',(SELECT bool_and(s.campos_csv->>'natureza_original'=l.natureza_original)
                        FROM sentinela.linhas_staging s JOIN sentinela.linhas_origem l ON l.id=s.linha_origem_id))""")
        assert final == dict(origins=10005, staging=10005, runs=5, audit=5,
                             issues=result["issues"]+retried["issues"]+invalid_result["issues"]+large_run["issues"],
                             occurrences=0, associations=0, forcedRls=19, rawMatches=True)
        report["databaseChecks"] = final
        stage("large_batch_lineage_audit_and_forced_rls")

        control.psql(cluster, admin, file=HERE/"catalog-fixtures.sql", run=run)
        promotion_batch = batch(fixture(range(30, 36), natureza_original="Natureza de ensaio A", natureza_padronizada_pcdf="Categoria de ensaio", overrides={
            31: {"natureza_original": "Natureza de ensaio B"},
            33: {"natureza_original": "Natureza sem regra"},
            35: {"local": "Local que diverge da outra associação"},
        }), "2026-01")
        promotion_run = transact(promotion_batch)["run"]

        def approve(run_id):
            control.psql(cluster, admin, sql=f"""INSERT INTO sentinela_pcdf_lab.approved_groups
              SELECT DISTINCT execucao_id,derivados_efetivos->'candidate','pcdf-sandbox-v1','Fixture approval'
              FROM sentinela.linhas_staging WHERE execucao_id='{run_id}'""", run=run)

        approve(promotion_run)
        command = "SET ROLE sentinela_pcdf_sbx_importer; SELECT sentinela_pcdf_lab.promote('" + promotion_run + "');"
        native_refusal("BEGIN; " + command + " SELECT 1/0; COMMIT;")
        assert read("SELECT to_jsonb(count(*)) FROM sentinela.ocorrencias") == 0
        assert read("SELECT to_jsonb(count(*)) FROM sentinela.eventos_auditoria WHERE acao='consolidacao_pcdf'") == 0
        summary = read(command)
        assert summary == dict(run=promotion_run, rows=6, consolidated=2, pending=4,
                               occurrencesCreated=1, associationsCreated=2)
        assert read(command) == dict(summary, occurrencesCreated=0, associationsCreated=0)
        assert read("""SELECT jsonb_build_array(count(DISTINCT o.id),count(a.id),count(DISTINCT m.categoria_id),
          bool_and(o.geometria IS NULL AND o.ra_id IS NULL AND o.latitude IS NULL AND o.longitude IS NULL))
          FROM sentinela.ocorrencias o JOIN sentinela.ocorrencia_naturezas a ON a.ocorrencia_id=o.id
          JOIN sentinela.mapeamentos_natureza m ON m.id=a.mapeamento_id
          JOIN sentinela.linhas_staging s ON s.linha_origem_id=a.linha_origem_id""") == [1, 2, 1, True]
        overlapping_run = transact(batch(fixture([36], numero_registro="000015",
                                                 natureza_original="Natureza de ensaio A",
                                                 natureza_padronizada_pcdf="Categoria de ensaio"), "2026-01"))["run"]
        approve(overlapping_run)
        assert read(f"SET ROLE sentinela_pcdf_sbx_importer; SELECT sentinela_pcdf_lab.promote('{overlapping_run}')")["pending"] == 1
        native_refusal(f"SET ROLE sentinela_local_reader; SELECT sentinela_pcdf_lab.promote('{promotion_run}')")
        report["promotion"] = summary
        stage("promotion_preserves_multiple_natures_idempotency_and_blocks_conflicts")

        def stage_identity(index, number, month, xml_sha=XML_SHA):
            raw = fixture([index], month, numero_registro=number, natureza_original="Natureza de ensaio A",
                          natureza_padronizada_pcdf="Categoria de ensaio",
                          linha_origem_id=f"{xml_sha}:NATUREZAS:{index}")
            return transact(batch(raw, month), xml_sha=xml_sha)["run"]

        cases = [
            (stage_identity(40, "000020", "2026-01"), stage_identity(41, " 000020 ", "2026-02")),
            (stage_identity(42, "000021", "2026-01"), stage_identity(42, "000021", "2026-01", "a"*64)),
        ]
        for first, second in cases:
            for staged in (first, second):
                approve(staged)
                result = read(f"SET ROLE sentinela_pcdf_sbx_importer; SELECT sentinela_pcdf_lab.promote('{staged}')")
                assert result["pending"] == 1 and result["occurrencesCreated"] == 0
        incomplete = stage_identity(43, "", "2026-01")
        assert read(f"SET ROLE sentinela_pcdf_sbx_importer; SELECT sentinela_pcdf_lab.promote('{incomplete}')")["pending"] == 1
        stage("pending_identity_collisions_across_months_and_extractions_are_not_promoted")
        report["result"] = "PASS"
    except (Exception, KeyboardInterrupt) as error:
        report["error"] = type(error).__name__
        if isinstance(error, AssertionError):
            report["assertionLine"] = error.__traceback__.tb_lineno
        elif commands.events:
            report["lastCommand"] = commands.events[-1]
    finally:
        if cluster["phase"] in {"INSTALLED", "RUNNING", "FAILED", "START_FAILED", "ATTESTATION_FAILED", "START_UNKNOWN"}:
            try:
                control.stop(cluster, admin, run=run)
            except (Exception, KeyboardInterrupt):
                report.update(result="FAIL", stop="UNCONFIRMED")
        report["state"] = cluster["phase"]
        (evidence/"pcdf-staging.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report), flush=True)
        print("Evidence: " + str(evidence/"pcdf-staging.json"), flush=True)
    return int(report["result"] != "PASS" or report["state"] != "STOPPED")


if __name__ == "__main__":
    sys.exit(main())
