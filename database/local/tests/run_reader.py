"""FUTURE real-login security tests. Explicit opt-in; never installs roles/migrations/fixtures."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
SPEC = json.loads((ROOT / 'security-spec.json').read_text(encoding='utf-8'))
ROLE = SPEC['role']


def environment():
    # Never use app .env, PGUSER, PGSERVICE, PGPASSWORD, PGOPTIONS or a remote URI.
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith('PG')}
    if os.environ.get('PGPASSFILE'):
        path = Path(os.environ['PGPASSFILE']).resolve(strict=True)
        if path.is_relative_to(REPO.resolve()):
            raise RuntimeError('Password file must be outside the repository.')
        env['PGPASSFILE'] = str(path)
    env.update(PGCLIENTENCODING='UTF8', PGCONNECT_TIMEOUT='3', PGAPPNAME='sentinela-local-reader-tests')
    return env


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--psql', default=r'C:\Program Files\PostgreSQL\17\bin\psql.exe')
    parser.add_argument('--execute-security-tests', action='store_true')
    args = parser.parse_args()
    if not args.execute_security_tests:
        parser.error('No connection made. Explicit --execute-security-tests and prior approval required.')
    env = environment()

    def run(sql=None, *, database=SPEC['database'], role=ROLE, path=None, host='127.0.0.1'):
        if not re.fullmatch(r'[A-Za-z0-9_]+', database):
            raise RuntimeError('Unsupported database identifier; never interpret connection strings.')
        if host not in ('127.0.0.1', '::1'):
            raise RuntimeError('Only loopback security probes are allowed.')
        command = [args.psql, '-X', '-w', '-h', host, '-p', '5432', '-U', role,
                   '-d', database, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-qAt']
        command += ['-f', str(path)] if path else ['-c', sql]
        return subprocess.run(command, env=env, capture_output=True, text=True, encoding='utf-8', timeout=20)

    def read(sql):
        result = run('BEGIN READ ONLY; ' + sql + '; COMMIT;')
        if result.returncode:
            raise RuntimeError('Reader query failed; diagnostics withheld to avoid sensitive output.')
        return result.stdout.strip()

    identity = json.loads(read("SELECT json_build_array(session_user,current_user,current_database(),host(inet_server_addr()),inet_server_port())"))
    assert identity == [ROLE, ROLE, SPEC['database'], '127.0.0.1', 5432], 'Wrong authenticated connection'
    attributes = json.loads(read("SELECT json_build_array(rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,rolinherit,rolcanlogin,rolconnlimit) FROM pg_roles WHERE rolname=current_user"))
    assert attributes == [False, False, False, False, False, False, True, 5]
    assert read("SELECT count(*) FROM pg_auth_members WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname=current_user) OR member=(SELECT oid FROM pg_roles WHERE rolname=current_user)") == '0'
    assert read("SELECT count(*) FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)") == '0'

    for table, columns in SPEC['grants'].items():
        read('SELECT ' + ','.join(columns) + ' FROM sentinela.' + table + ' LIMIT 0')
        assert read("SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE oid='sentinela." + table + "'::regclass") == 't'

    def denied(sql):
        # READ WRITE intentionally bypasses default_transaction_read_only as a fake safety net.
        # Unexpected success is always rolled back; psql exit on errors also aborts the transaction.
        result = run('BEGIN READ WRITE; ' + sql + '; ROLLBACK;')
        if result.returncode == 0 or not re.search(r'\b42501\b', result.stderr):
            raise RuntimeError('Expected ACL denial SQLSTATE 42501; test failed without exposing SQL output.')

    for sql in [
        'SELECT evidencia_identidade FROM sentinela.ocorrencias',
        'SELECT geometria FROM sentinela.ocorrencias',
        'SELECT linha_origem_id FROM sentinela.ocorrencia_naturezas',
        'SELECT evidencia_homologacao FROM sentinela.categorias_criminais',
        'SELECT limite FROM sentinela.regioes_administrativas',
        'SELECT * FROM sentinela.usuarios', 'SELECT * FROM sentinela.eventos_auditoria',
        'SELECT * FROM sentinela.historico_correcoes', 'SELECT * FROM sentinela.linhas_staging',
        'SELECT * FROM sentinela.linhas_origem', 'SELECT * FROM sentinela.extracoes_origem',
        'SELECT * FROM sentinela.schema_migrations',
        'INSERT INTO sentinela.ocorrencias DEFAULT VALUES',
        'UPDATE sentinela.ocorrencias SET local=local WHERE false',
        'DELETE FROM sentinela.ocorrencias WHERE false',
        'TRUNCATE sentinela.ocorrencias',
        'CREATE SCHEMA sentinela_reader_denied_test',
        'CREATE TABLE public.sentinela_reader_denied_test(id integer)',
        'CREATE TEMP TABLE sentinela_reader_denied_test(id integer)',
        "SELECT sentinela.avaliar_pertencimento_territorial('50000000-0000-4000-8000-000000000001'::uuid)",
        'SET ROLE postgres',
    ]:
        denied(sql)

    for table in SPEC['grants']:
        denied('INSERT INTO sentinela.' + table + ' DEFAULT VALUES')
        denied('UPDATE sentinela.' + table + ' SET id=id WHERE false')
        denied('DELETE FROM sentinela.' + table + ' WHERE false')
    allowed = set(SPEC['grants'])
    all_tables = json.loads(read("SELECT json_agg(relname ORDER BY relname) FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r'"))
    for table in set(all_tables) - allowed:
        if not re.fullmatch(r'[a-z_]+', table):
            raise RuntimeError('Unexpected table identifier.')
        denied('SELECT * FROM sentinela.' + table)

    databases = json.loads(read("SELECT json_agg(datname ORDER BY datname) FROM pg_database WHERE datallowconn AND datname<>current_database()")) or []
    for database in databases:
        result = run('SELECT 1', database=database)
        if result.returncode == 0 or 'pg_hba.conf' not in result.stderr or not re.search(r'reject|rejeit', result.stderr, re.I):
            raise RuntimeError('Other-database connection must fail by HBA rejection, not by a missing password/database.')
    ipv6 = run('SELECT 1', host='::1')
    if ipv6.returncode == 0 or 'pg_hba.conf' not in ipv6.stderr or not re.search(r'reject|rejeit', ipv6.stderr, re.I):
        raise RuntimeError('IPv6 loopback must be explicitly rejected by HBA, not fail for another reason.')

    # Positive fixture required: an empty table must never be reported as proof of RLS.
    visible = json.loads(read("SELECT coalesce(json_agg(id ORDER BY id),'[]') FROM sentinela.ocorrencias"))
    assert visible == ['50000000-0000-4000-8000-000000000001'], 'Committed approved fixtures required; RLS not certified'
    associations = json.loads(read("SELECT coalesce(json_agg(id ORDER BY id),'[]') FROM sentinela.ocorrencia_naturezas"))
    assert associations == ['60000000-0000-4000-8000-000000000001']
    for table, prefix in [('regioes_administrativas', '1'), ('categorias_criminais', '2'),
                          ('naturezas_criminais', '3'), ('mapeamentos_natureza', '4')]:
        ids = json.loads(read('SELECT coalesce(json_agg(id ORDER BY id),\'[]\') FROM sentinela.' + table))
        assert ids == [prefix + '0000000-0000-4000-8000-000000000001'], 'Positive/negative catalog RLS failed'
    assert read("SELECT count(*) FROM sentinela.naturezas_criminais WHERE fonte<>'SENTINELA_TESTE_LOCAL_V1'") == '0'
    assert read("SELECT count(*) FROM sentinela.mapeamentos_natureza WHERE status<>'homologado'") == '0'

    # Separate administrative connection is read-only and exclusively for structural attestation.
    # All authorization probes above used actual role authentication, not SET ROLE from postgres.
    snapshot = run(role='postgres', path=REPO / 'database/supabase/tests/catalog_snapshot.sql')
    if snapshot.returncode:
        raise RuntimeError('Administrative read-only structural attestation failed.')
    catalog = json.loads(snapshot.stdout.strip())
    for key, expected in SPEC['structural_sha256'].items():
        actual = hashlib.sha256(json.dumps(catalog[key], sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
        assert actual == expected, 'Baseline structural drift: ' + key
    print('PASS: authenticated reader, projections, RLS fixtures, write/DDL denials, HBA isolation and baseline structure.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, AssertionError, OSError, subprocess.TimeoutExpired) as error:
        # Messages above contain only fixed diagnostics, never server payloads or credentials.
        raise SystemExit(str(error) if isinstance(error, (RuntimeError, AssertionError)) else 'Local security test unavailable; diagnostics withheld.')
