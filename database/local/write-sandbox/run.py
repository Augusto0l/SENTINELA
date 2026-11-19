"""Explicit one-shot write qualification; NEW sandbox only, never the old clusters."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
from datetime import datetime, timezone

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'sandbox'))
import control as c
import complete_rls as common


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    c.require(args.execute, 'Explicit --execute required')
    # Only the separately named read-only reference function may contact 5432.
    before, fingerprints = common.operational_snapshot()
    locale = before['extra']['locale']
    c.require(locale['datlocprovider'] == 'c' and locale['datcollate'] == locale['datctype'], 'Unsupported locale')
    c.require(c.digest(c.HERE / 'control.py') == common.CONTROL_HASH, 'Reviewed lifecycle controller drift')
    c.require(c.digest(c.HERE / 'sql/snapshot_extra.sql') == common.SNAPSHOT_HASH, 'Reviewed snapshot drift')
    previous = {str(p): c.digest(p) for p in c.BASE.glob('rls-sandbox-*/manifest.json')}
    m = c.prepare(locale['datcollate'])
    m['purpose'] = 'sentinela-write-sandbox-v1'
    for p in HERE.iterdir():
        if p.is_file(): m['artifacts'][str(p.relative_to(c.REPO))] = c.digest(p)
    c.save(m)
    evidence = Path(m['root']) / 'evidence'
    report = {'uuid': m['uuid'], 'purpose': m['purpose'], 'stages': []}

    def record(stage, result='PASS'):
        report['stages'].append({'stage': stage, 'result': result, 'utc': datetime.now(timezone.utc).isoformat()})
        report['system_id'] = m['system_id']
        (evidence / 'write-completion.json').write_text(json.dumps(report, indent=2), encoding='utf8')
        print(stage + ': ' + result, flush=True)

    (evidence / 'operational-before.json').write_text(json.dumps(before), encoding='utf8')
    (evidence / 'operational-fingerprints-before.json').write_text(json.dumps(fingerprints), encoding='utf8')
    admin = secrets.token_urlsafe(40)
    runner = common.SecureRun(admin)
    try:
        c.create(m, run=runner)
        # Only this NEW cluster's HBA, before its first start; old HBA files untouched.
        hba = Path(m['data']) / 'pg_hba.conf'
        specific = 'host sentinela_rls_sandbox sentinela_sbx_admin,sentinela_sbx_operator,sentinela_sbx_analyst 127.0.0.1/32 scram-sha-256\n'
        hba.write_bytes(specific.encode('ascii') + hba.read_bytes())
        m['runtime_files']['pg_hba.conf'] = c.digest(hba)
        c.save(m)
        record('fresh_cluster_created')
        c.start(m, admin, run=runner)
        c.install(m, admin, run=runner)
        initial = c.snapshot(m, admin, run=runner)
        c.compare(before, initial, role_mode='installation-nologin', sandbox=m)
        record('baseline_equivalence')
        c.attest(m, admin)
        c.psql(m, admin, file=HERE / 'setup.sql', run=runner)
        record('sandbox_only_role_policies_function')
        roles = ['sentinela_sbx_admin', 'sentinela_sbx_operator', 'sentinela_sbx_analyst']
        credentials = {role: secrets.token_urlsafe(40) for role in roles}
        script = (c.HERE / 'sql/guard.sql').read_text() + '\nBEGIN;\n'
        for role, password in credentials.items():
            script += "ALTER ROLE " + role + " PASSWORD '" + common.verifier(password) + "';\n"
        script += 'COMMIT;\n'

        def configure(exe, arguments, **kwargs):
            p = subprocess.run([str(c.BIN / 'psql.exe'), *map(str, arguments)], input=script,
                               env=c.environment(admin), capture_output=True, text=True, encoding='utf8', timeout=30)
            c.require(p.returncode == 0, 'Private sandbox role bootstrap failed; details withheld')
            return p.stdout.strip()

        c.psql(m, admin, file='-', run=configure)
        record('new_scram_credentials_in_memory')
        runtime = {'manifest': str(Path(m['root']) / 'manifest.json'), 'expectedUUID': m['uuid'],
                   'credentials': {'Administrador': {'user': roles[0], 'password': credentials[roles[0]]},
                                   'Operador': {'user': roles[1], 'password': credentials[roles[1]]}}}
        env = {k: v for k, v in c.environment().items() if not any(x in k.upper() for x in ['SUPABASE', 'DATABASE_URL', 'READER_URL'])}
        env.update(NODE_ENV='development', SENTINELA_SANDBOX_WRITE='1')
        payload = {'config': runtime, 'analyst': credentials[roles[2]]}
        p = subprocess.run(['node', '--experimental-strip-types', str(HERE / 'qualify.mjs')],
                           input=json.dumps(payload), env=env, capture_output=True, text=True, encoding='utf8', timeout=120)
        # The child emits only a sanitized result document, never raw errors/SQL.
        try: result = json.loads(p.stdout)
        except (ValueError, TypeError): result = {'result': 'FAIL', 'stage': 'child_protocol'}
        (evidence / 'write-tests.json').write_text(json.dumps(result, indent=2), encoding='utf8')
        c.require(p.returncode == 0 and result.get('result') == 'PASS', 'Write qualification failed; sanitized evidence preserved')
        record('real_sql_service_tests')
        final = c.snapshot(m, admin, run=runner)
        for key in ['tables', 'columns', 'constraints', 'indexes', 'triggers', 'functions', 'domains']:
            c.require(initial['catalog'][key] == final['catalog'][key], 'Baseline definitions changed: ' + key)
        for table, count in [('ocorrencias', result['records']), ('ocorrencia_naturezas', result['links']), ('eventos_auditoria', result['records'])]:
            observed = int(c.psql(m, admin, sql='SELECT count(*) FROM sentinela.' + table, run=runner))
            c.require(observed == count, 'Unexpected sandbox row count')
        audits = c.psql(m, admin, sql="SELECT coalesce(bool_and(ator_tipo='servico' AND usuario_id IS NULL AND servico IN ('sentinela_sbx_admin','sentinela_sbx_operator') AND antes IS NULL AND depois IS NOT NULL AND transacao_id IS NOT NULL),false) FROM sentinela.eventos_auditoria", run=runner)
        c.require(audits == 't', 'Synthetic audit invariants failed')
        (evidence / 'sandbox-final.json').write_text(json.dumps(final), encoding='utf8')
        record('baseline_triggers_constraints_rls_audit_preserved')
        after, after_fingerprints = common.operational_snapshot()
        c.require(after == before and fingerprints == after_fingerprints, 'Operational reference changed')
        c.require(all(c.digest(Path(path)) == digest for path, digest in previous.items()), 'Previous sandbox manifest changed')
        (evidence / 'operational-after.json').write_text(json.dumps(after), encoding='utf8')
        (evidence / 'operational-fingerprints-after.json').write_text(json.dumps(after_fingerprints), encoding='utf8')
        record('operational_and_previous_sandboxes_preserved')
    except BaseException:
        record('interrupted_or_failed', 'FAIL')
        if runner.last_failure:
            (evidence / 'write-subprocess-failure.json').write_text(json.dumps(runner.last_failure, indent=2), encoding='utf8')
        raise
    finally:
        # Never stop an unidentified process; never delete the cluster or evidence.
        try:
            c.attest(m, admin, database='postgres')
            c.stop(m, admin)
            record('identified_cluster_stopped')
        except (Exception, KeyboardInterrupt): record('server_state_requires_inspection', 'UNKNOWN')
        runner.password = None
        print('Evidence: ' + str(evidence / 'write-completion.json'), flush=True)
    c.require(not any(s['result'] != 'PASS' for s in report['stages']), 'Qualification incomplete')


if __name__ == '__main__':
    try: main()
    except (Exception, KeyboardInterrupt) as error:
        print('FAIL: ' + type(error).__name__ + '; private evidence retained; no automatic retry', flush=True)
        raise SystemExit(1)
