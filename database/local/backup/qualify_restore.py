"""Replay the qualified pre-RA archive into a fresh disposable cluster, offline from its source."""
import argparse
import json
from pathlib import Path
import secrets
from time import perf_counter

import recover as backup

c = backup.c
EXPECTED = {
    'database.dump': '75041a81fadcddb6af7a6a21b4b5d1a6ef028258016a0ac80bd9f18a451178b5',
    'report.json': '382a2caca55a32d8e4b359241705c3277b19d6b6e6dc8da663157dcf6a2beefe',
    'source-metadata.json': '82998e2feb622dd8c2c63b6e36890c938010a26119bbaab014a6c8e44b315d84',
    'source-data-hashes.json': '058dd43af21fc70936a9d6bb6afe5d1363e6516629e021c960b09107ec0a0db1',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--isolated-only', action='store_true', required=True)
    args = parser.parse_args()
    directory = args.directory.resolve(strict=True)
    c.no_links(directory)
    for name, digest in EXPECTED.items():
        c.no_links(directory / name)
        backup.require(backup.digest(directory / name) == digest, 'Historical artifact hash mismatch')
    receipt = json.loads((directory / 'report.json').read_bytes())
    before = json.loads((directory / 'source-metadata.json').read_bytes())
    data = json.loads((directory / 'source-data-hashes.json').read_bytes())
    archive = directory / 'database.dump'
    backup.require(receipt['result'] == 'PASS' and receipt['backup']['sha256'] == EXPECTED['database.dump'],
                   'Qualified recovery receipt required')
    c.BASE = c.REPO / 'tmp' / 'release-recovery'
    password = secrets.token_urlsafe(40)
    commands = backup.Commands()
    run = backup.bootstrap_runner(commands, password)
    backup.validate_archive(archive, EXPECTED['database.dump'], commands.call)
    cluster = c.prepare(receipt['source']['locale']['collate'], run=run)
    evidence = Path(cluster['root']) / 'evidence' / 'restore-requalification.json'
    report = {'result': 'FAIL', 'stage': 'bootstrap', 'sourceConnections': 0}
    try:
        c.create(cluster, run=run)
        backup.require(cluster['system_id'] != backup.SYSTEM_ID, 'Operational cluster refused')
        c.start(cluster, password, run=run)
        c.attest(cluster, password, database='postgres', run=run)
        c.psql(cluster, password, database='postgres', run=run,
               sql='CREATE DATABASE sentinela_rls_sandbox TEMPLATE template0;')
        c.attest(cluster, password, run=run)
        c.psql(cluster, password, run=run, sql='CREATE ROLE sentinela_local_reader NOLOGIN NOSUPERUSER '
               'NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT CONNECTION LIMIT 5;')
        report['stage'] = 'restore'
        restore_args = ['-w', '-h', '127.0.0.1', '-p', '55432', '-U', 'postgres', '-d', 'sentinela_rls_sandbox',
                        '--exit-on-error', '--single-transaction', str(archive)]
        started = perf_counter()
        commands.call('pg_restore', restore_args, password=password)
        report['restoreSeconds'] = round(perf_counter() - started, 3)
        restored = json.loads(c.psql(cluster, password, sql=backup.metadata_sql(), run=run))
        restored_data = json.loads(c.psql(cluster, password, sql=backup.data_sql(), run=run))
        report['schemaDifferences'] = backup.compare_metadata(before, restored)
        report['dataHashesMatch'] = data == restored_data
        backup.require(not report['schemaDifferences'] and report['dataHashesMatch'], 'Restore changed snapshot')
        def release_inventory(system_id):
            def inventory_psql(exe, args, password=None, **kwargs):
                for key, value in {'destino': cluster['database'], 'host': cluster['host'], 'porta': cluster['port'],
                                   'system_id': system_id, 'postgres_num': '170011', 'postgis': '3.6.2'}.items():
                    args.extend(['-v', f'{key}={value}'])
                return run(exe, args, password=password, **kwargs)

            result = c.psql(cluster, password, file=c.REPO/'database/release/preflight.psql', run=inventory_psql)
            guard, inventory = result.splitlines()
            backup.require(guard == '1', 'Release destination not attested')
            return json.loads(inventory)

        preflight = release_inventory(cluster['system_id'])
        backup.require(preflight['tabelasComRlsForcada'] == 19 and not preflight['readerPodeGravar'],
                       'Unexpected release inventory')
        try:
            release_inventory('0')
        except RuntimeError:
            pass
        else:
            raise RuntimeError('Preflight accepted a mismatched destination')
        report['stage'] = 'rollback'
        try:
            commands.call('pg_restore', restore_args, password=password)
        except RuntimeError:
            backup.require(commands.events[-1]['exit_code'] != 0, 'Native restore failure unconfirmed')
        else:
            raise RuntimeError('Restore accepted existing schema')
        backup.require(restored == json.loads(c.psql(cluster, password, sql=backup.metadata_sql(), run=run))
                       and restored_data == json.loads(c.psql(cluster, password, sql=backup.data_sql(), run=run)),
                       'Rejected restore left changes')
        backup.require(backup.digest(archive) == EXPECTED['database.dump'], 'Archive changed')
        backup.require(release_inventory(cluster['system_id']) == preflight, 'Release inventory changed after rollback')
        report['preflightAndReconciliation'] = True
        report.update(result='PASS', stage='complete', rollbackVerified=True, tables=len(data))
    except (Exception, KeyboardInterrupt) as error:
        report['error'] = type(error).__name__
    finally:
        if cluster['phase'] in {'RUNNING', 'START_FAILED', 'ATTESTATION_FAILED', 'START_UNKNOWN'}:
            try:
                c.stop(cluster, password, run=run)
            except (Exception, KeyboardInterrupt):
                report.update(result='FAIL', stop='UNCONFIRMED')
        report['state'] = cluster['phase']
        evidence.write_text(json.dumps(report, indent=2), encoding='utf8')
        print(json.dumps(report), flush=True)
        print(f'Evidence: {evidence}', flush=True)
    return int(report['result'] != 'PASS' or report['state'] != 'STOPPED')


if __name__ == '__main__':
    raise SystemExit(main())
