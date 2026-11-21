"""Qualify the dedicated pilot with an expiring SCRAM login and rollback-only synthetic traffic."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import runpy
import secrets
from time import monotonic, sleep
from uuid import uuid4

from manifest_receiver import compact_json, prepare_month
from pipeline import InvalidFile
from pilot_preflight import SCOPE, approval
from pilot_runtime import (ACTOR, FIXTURE, HERE, LOGIN, RECEIPT_PREFIX, SCHEMA, Pilot,
                           control, document_sql, expect_denial, fixture_role, literal, receive_sql, reconciliation,
                           verify_denials)

VOLUME = 6393


def fixture(cluster):
    helpers = runpy.run_path(str(HERE / "qualify-manifest.py"))
    xml = b"<Workbook><!-- dedicated PCDF synthetic qualification only --></Workbook>"
    positions = range(100, 100 + VOLUME)
    csv = helpers["csv_fixture"](positions=positions, xml_hash=sha256(xml).hexdigest(),
                                 overrides={i: {"local": "  Setor de teste " * 20} for i in positions})
    month = helpers["MONTH"]
    manifest = compact_json(helpers["manifest_for"]({month: (csv, VOLUME)}, xml, finalized=True)).encode()
    signed = helpers["synthetic_approval"](manifest, cluster)
    verified = approval(*signed, cluster, scope="pcdf-fixture")
    try:
        approval(*signed, cluster, scope=SCOPE)
    except InvalidFile:
        pass
    else:
        raise AssertionError("Synthetic approval accepted for institutional scope")
    return prepare_month(csv, month, manifest, verified["manifesto_sha256"], (xml,)), verified, signed


def connection_refused(pilot, secret, *, role=FIXTURE, database=None):
    try:
        pilot.restricted(secret, "SELECT 1", role=role, database=database)
    except RuntimeError:
        control.require(pilot.commands.events[-1]["exit_code"] == 2, "Unexpected connection failure")
    else:
        raise AssertionError("Unauthorized connection accepted")


def wait_for(pilot, event, job):
    deadline = monotonic() + 25
    while monotonic() < deadline and not job.done():
        if pilot.query(f"""SELECT EXISTS (SELECT FROM pg_stat_activity
          WHERE usename='{FIXTURE}' AND wait_event={literal(event)})"""):
            return
        sleep(0.2)
    if job.done():
        job.result()
    raise AssertionError(f"Concurrent observation missing: {event}")


def qualify(pilot, receipt):
    evidence = pilot.inspect()
    baseline = pilot.counts()
    control.require(not any(baseline.values()) and not evidence["active"] and not evidence["institutionalKey"],
                    "Qualification requires an empty, inactive dedicated pilot")
    payload, signed_record, signed = fixture(pilot.cluster["uuid"])
    document = document_sql(payload)
    qualification_secret = secrets.token_urlsafe(48)
    actor_name = f"PCDF ensaio {uuid4()}"
    receipt.update(before=baseline, schema=evidence, scope=signed_record["escopo"],
                   cluster=pilot.cluster["uuid"], systemId=pilot.cluster["system_id"], host=pilot.cluster["host"],
                   port=pilot.cluster["port"], database=pilot.cluster["database"],
                   syntheticApprovalRejectedForInstitutionalScope=True)

    try:
        pilot.admin_sql(f"""BEGIN;
          {fixture_role(qualification_secret)}
          INSERT INTO sentinela.usuarios(id,nome_exibicao,perfil,ativo)
            VALUES ('{ACTOR}',{literal(actor_name)},'Operador',true);
          COMMIT;""")
        checks = receipt["checks"]

        def restricted(statement, commands=None):
            return pilot.restricted(qualification_secret, statement, role=FIXTURE, commands=commands)

        connection_refused(pilot, qualification_secret + "x")
        connection_refused(pilot, qualification_secret, role=LOGIN)
        connection_refused(pilot, qualification_secret, role="pcdf_fixture_login")
        connection_refused(pilot, qualification_secret, role="sentinela_local_reader")
        connection_refused(pilot, qualification_secret, role="postgres")
        checks.append("autenticacao")
        receipt["identity"] = pilot.effective(qualification_secret, role=FIXTURE)
        pilot.inspect(fixture=True)
        checks.extend(("identidade", "heranca"))
        receipt["sqlDenials"] = verify_denials(restricted)
        checks.extend(("consolidacao_negada", "ddl_negado", "exclusao_negada", "escrita_direta_negada", "administracao_negada"))
        for name in ("postgres", "template0", "template1", "sentinela_rls_sandbox"):
            connection_refused(pilot, qualification_secret, database=name)
        checks.append("outros_bancos_negados")

        request = uuid4()

        def call(name, request_id=request, data=document):
            return f"{SCHEMA}.{name}({data},'{request_id}')"

        restricted(expect_denial(f"SELECT {call('receive')}"))
        pilot.admin_sql(f"""INSERT INTO {SCHEMA}.fixture_release (manifesto,csv,xml,payload,
          approval_record,release_record,key_pin,reference,operator_name,actor,starts_at,expires_at)
          SELECT d->>'manifestSha',d->'batch'->>'sha256',d->'source'->>'sha256',
            encode(sha256(convert_to(d::text,'UTF8')),'hex'),'{sha256(signed[0]).hexdigest()}',
            '{sha256(signed[1]).hexdigest()}','{signed[3]}','fixture/qualification','Ensaio sintético',
            '{ACTOR}',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour'
          FROM (SELECT {document} AS d) fixture;""")
        restricted(expect_denial(f"SELECT {call('record_attempt')}"))
        pilot.admin_sql(f"UPDATE {SCHEMA}.fixture_release SET expires_at={literal(signed_record['expira_em'])};")
        tampered = f"jsonb_set({document},'{{manifest,status}}','\"alterado\"')"
        restricted(expect_denial(f"SELECT {call('record_attempt', data=tampered)}"))
        real_month = f"jsonb_set({document},'{{batch,month}}','\"2021-01\"')"
        restricted(expect_denial(f"SELECT {call('receive', data=real_month)}"))
        checks.append("autorizacao_invalida_negada")
        restricted("BEGIN; SET LOCAL row_security=off;"
                   + expect_denial(f"SELECT {call('record_attempt')}") + "ROLLBACK;")
        checks.append("rls")
        restricted(expect_denial(f"SELECT {call('receive')}", "22023"))
        restricted(expect_denial(f"SELECT {call('reconcile')}"))

        replay_req = uuid4()
        recovered = restricted(f"""BEGIN;
          SELECT {call('record_attempt')};
          {receive_sql(document, request, VOLUME)}
          SELECT {call('record_attempt')};
          SELECT {call('receive')};
          SELECT {call('record_attempt', replay_req)};
          SELECT {call('receive', replay_req)};
          ROLLBACK;""")
        result, same_request, replay = [json.loads(line) for line in recovered.splitlines() if line.strip()]
        first, compared = result["receipt"], result["reconciliation"]
        control.require(not first["replay"] and first["records"] == VOLUME and compared == reconciliation(VOLUME)
                        and first == same_request and replay["replay"]
                        and (first["lot"], first["run"]) == (replay["lot"], replay["run"]),
                        "Staging, audit, data reconciliation or replay differs")
        receipt.update(reconciliation=compared, replay=True)
        checks.extend(("funcoes", "staging", "auditoria", "34_campos", "18_originais", "idempotencia"))
        control.require(pilot.counts() == baseline, "Rollback left residual data")
        checks.append("rollback")

        def concurrent(request_id, pause):
            commands = type(pilot.commands)()
            result = restricted(f"""BEGIN;
              SELECT {call('record_attempt',request_id)};
              SELECT {call('receive',request_id)};
              {pause}
              ROLLBACK;""", commands)
            return next(json.loads(line) for line in result.splitlines() if line.strip())

        with ThreadPoolExecutor(max_workers=2) as pool:
            first_job = pool.submit(concurrent, uuid4(), "SELECT pg_sleep(19);")
            wait_for(pilot, "PgSleep", first_job)
            second_job = pool.submit(concurrent, uuid4(), "")
            wait_for(pilot, "advisory", second_job)
            first_run, second_run = first_job.result(), second_job.result()
        control.require(first_run["records"] == second_run["records"] == VOLUME
                        and not first_run["replay"] and not second_run["replay"]
                        and first_run["run"] != second_run["run"], "Concurrent retry after rollback differs")
        receipt["concurrency"] = {"observedAdvisoryWait": True, "bothRolledBack": True, "retryRecords": VOLUME}
        checks.append("concorrencia")
    finally:
        # Match the private actor marker before cleaning up anything from this run.
        if pilot.query(f"""SELECT EXISTS (SELECT FROM sentinela.usuarios
                   WHERE id='{ACTOR}' AND nome_exibicao={literal(actor_name)})"""):
            pilot.admin_sql(f"""BEGIN;
              DELETE FROM {SCHEMA}.fixture_release WHERE actor='{ACTOR}';
              DELETE FROM sentinela.usuarios WHERE id='{ACTOR}' AND nome_exibicao={literal(actor_name)};
              DROP ROLE {FIXTURE};
              COMMIT;""")
        pilot.inspect()
        receipt["after"] = pilot.counts()
        control.require(receipt["after"] == baseline and pilot.query(f"""SELECT NOT EXISTS
          (SELECT FROM {SCHEMA}.fixture_release) AND NOT EXISTS (SELECT FROM sentinela.usuarios WHERE id='{ACTOR}')"""),
                        "Synthetic qualification left residue")
    receipt["checks"].append("sem_residuos")
    control.require(len(receipt["checks"]) == 20, "Dedicated qualification check inventory changed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cluster", required=True, type=Path)
    args = parser.parse_args()
    pilot = Pilot(args.cluster)
    artifact = Path(pilot.cluster["root"]) / "evidence" / f"{RECEIPT_PREFIX}{uuid4()}.json"
    receipt = {"result": "FAIL", "utc": datetime.now(timezone.utc).isoformat(), "checks": []}
    try:
        with pilot.running():
            qualify(pilot, receipt)
        receipt["result"] = "PASS"
    finally:
        receipt["state"] = pilot.cluster["phase"]
        artifact.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
        print(json.dumps({**receipt, "artifact": str(artifact)}, ensure_ascii=True))


if __name__ == "__main__":
    main()
