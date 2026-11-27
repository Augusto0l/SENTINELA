"""One shot: a NEW private cluster, no operational or remote reference connection."""
import argparse
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
from uuid import uuid4
from datetime import datetime, timezone

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'sandbox'))
import control as c

CONTROL_HASH = 'ee4cf011654d35cba6467399a2dc9f4f27dbb31a80e4139678feef9e2c88ebea'
SNAPSHOT_HASH = '14a5df87024e068eb282e8ce199e79092c8114e3a0b8c6ec23d7cf67187ad82c'


def verifier(password):
    salt = secrets.token_bytes(16)
    salted = hashlib.pbkdf2_hmac('sha256', password.encode('ascii'), salt, 4096)
    enc = lambda x: base64.b64encode(x).decode('ascii')
    return 'SCRAM-SHA-256$4096:' + enc(salt) + '$' + enc(hashlib.sha256(hmac.digest(salted, b'Client Key', 'sha256')).digest()) + ':' + enc(hmac.digest(salted, b'Server Key', 'sha256'))


class PrivateRun:
    def __init__(self, password):
        self.password = password
        self.last_failure = None

    def __call__(self, exe, args, password=None, console=False):
        secret = None
        if exe == 'initdb' and console:
            root = Path(args[args.index('-D') + 1]).parent
            c.no_links(root)
            c.require(root.is_relative_to(c.BASE.resolve()), 'Private bootstrap scope required')
            secret = root / ('bootstrap-' + secrets.token_hex(16) + '.secret')
            with secret.open('x', encoding='ascii') as f:
                f.write(self.password + '\n')
            args = [a for a in args if a != '-W'] + ['--pwfile=' + str(secret)]
        elif exe != 'psql':
            return c.process(exe, args, password=password, console=console)
        try:
            p = subprocess.run([str(c.BIN / (exe + '.exe')), *map(str, args)],
                               env=c.environment(password), capture_output=True, text=True,
                               encoding='utf8', errors='replace', timeout=120 if exe == 'initdb' else 30)
        finally:
            if secret is not None and secret.exists():
                secret.unlink()  # Only our exclusively created bootstrap file.
        if p.returncode:
            self.last_failure = {'operation': exe, 'exit_code': p.returncode,
                                 'message': p.stderr.replace(self.password, '<secret>')[-1800:]}
            raise c.Refused('Private sandbox subprocess failed; evidence retained')
        return p.stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--next', action='store_true', help='Also qualify the isolated Next.js routes and browser form')
    parser.add_argument('--pcdf', action='store_true', help='Include the synthetic PCDF workspace in the Next.js qualification')
    args = parser.parse_args()
    c.require(args.execute, 'Explicit --execute required')
    c.require(not args.pcdf or args.next, '--pcdf requires --next')
    c.require(c.digest(c.HERE / 'control.py') == CONTROL_HASH, 'Lifecycle revision changed')
    c.require(c.digest(c.HERE / 'sql/snapshot_extra.sql') == SNAPSHOT_HASH, 'Snapshot revision changed')
    # Offline reference only: the preserved successful 2.14 evidence, NEVER 5432.
    reference_root = c.BASE / 'rls-sandbox-9fd0814b-92b4-4719-aa94-f5f7a45d78c7'
    reference_file = reference_root / 'evidence/sandbox-final.json'
    reference = json.loads(reference_file.read_text(encoding='utf8'))
    locale = reference['extra']['locale']
    c.require(locale['datlocprovider'] == 'c' and locale['datcollate'] == locale['datctype'], 'Unsupported reference locale')
    previous = {str(p): c.digest(p) for p in c.BASE.glob('rls-sandbox-*/manifest.json')}
    m = c.prepare(locale['datcollate'])
    m.update(purpose='sentinela-write-sandbox-v1', mutation_revision=2)
    pcdf_dir = HERE.parent / 'pcdf-sandbox'
    pcdf_files = ('install.sql', 'consolidate.sql', 'workspace.sql', 'catalog-fixtures.sql', 'analytics.sql')
    if args.pcdf:
        m['pcdf_workspace'] = True
        m['pcdf_workspace_revision'] = 2
        for name in (*pcdf_files, 'workspace.py', 'pipeline.py', 'qualify.py'):
            path = pcdf_dir / name
            m['artifacts'][str(path.relative_to(c.REPO))] = c.digest(path)
    for p in HERE.iterdir():
        if p.is_file():
            m['artifacts'][str(p.relative_to(c.REPO))] = c.digest(p)
    c.save(m)
    evidence = Path(m['root']) / 'evidence'
    report = {'uuid': m['uuid'], 'stages': [], 'reference_sha256': c.digest(reference_file), 'operational_connections': 0}
    admin = secrets.token_urlsafe(40)
    runner = PrivateRun(admin)

    def record(stage, result='PASS'):
        report.update(system_id=m['system_id'], phase=m['phase'])
        report['stages'].append({'stage': stage, 'result': result, 'utc': datetime.now(timezone.utc).isoformat()})
        (evidence / 'mutation-completion.json').write_text(json.dumps(report, indent=2), encoding='utf8')
        print(stage + ': ' + result, flush=True)

    try:
        c.create(m, run=runner)
        hba = Path(m['data']) / 'pg_hba.conf'
        hba.write_bytes(b'host sentinela_rls_sandbox sentinela_sbx_admin,sentinela_sbx_operator,sentinela_sbx_analyst 127.0.0.1/32 scram-sha-256\n' + hba.read_bytes())
        m['runtime_files']['pg_hba.conf'] = c.digest(hba)
        c.save(m)
        c.start(m, admin, run=runner)
        c.install(m, admin, run=runner)
        initial = c.snapshot(m, admin, run=runner)
        for key in ['tables', 'columns', 'constraints', 'indexes', 'triggers', 'functions', 'domains']:
            c.require(initial['catalog'][key] == reference['catalog'][key], 'Offline baseline definition mismatch: ' + key)
        record('new_cluster_baseline_matches_preserved_definitions')
        c.psql(m, admin, file=HERE / 'setup.sql', run=runner)
        c.psql(m, admin, file=HERE / 'mutations.sql', run=runner)
        c.psql(m, admin, file=HERE / 'mutation-fixtures.sql', run=runner)
        c.psql(m, admin, file=HERE / '003_individual_address.sql', run=runner)
        c.psql(m, admin, file=HERE / '004_workspace_read.sql', run=runner)
        subjects = {role: str(uuid4()) for role in ('sentinela_sbx_admin', 'sentinela_sbx_operator', 'sentinela_sbx_analyst')}
        c.psql(m, admin, sql="INSERT INTO sentinela_write_lab.individuals(login,subject) VALUES "
               + ",".join(f"('{role}','{subjects[role]}')" for role in ('sentinela_sbx_admin', 'sentinela_sbx_operator')),
               run=runner)
        pcdf = None
        if args.pcdf:
            sys.path.insert(0, str(pcdf_dir))
            from qualify import fixture, stage_command
            from workspace import prepare_synthetic

            for name in pcdf_files:
                c.psql(m, admin, file=pcdf_dir / name, run=runner)
            raw = fixture([100, 101], natureza_original='Natureza de ensaio A',
                          natureza_padronizada_pcdf='Categoria de ensaio', flagrante='SIM',
                          overrides={101: {'horario': '', 'flagrante': '?', 'natureza_original': 'Natureza de ensaio B'}})
            upload = fixture([103], natureza_original='Natureza sem regra', natureza_padronizada_pcdf='Categoria de ensaio')
            stage_sql = stage_command(prepare_synthetic(raw, '2026-01')['batch'])

            def stage_input(exe, psql_args, **kwargs):
                p = subprocess.run([str(c.BIN / 'psql.exe'), *map(str, psql_args)],
                                   input=stage_sql, env=c.environment(admin), capture_output=True,
                                   text=True, encoding='utf8', timeout=30)
                c.require(p.returncode == 0, 'PCDF fixture staging failed')
                return p.stdout.strip()

            receipt = json.loads(c.psql(m, admin, file='-', run=stage_input))
            run_id = receipt['run']
            c.psql(m, admin, sql=f"""INSERT INTO sentinela_pcdf_lab.approved_groups
              SELECT DISTINCT execucao_id,derivados_efetivos->'candidate','pcdf-sandbox-v1','Browser fixture approval'
              FROM sentinela.linhas_staging WHERE execucao_id='{run_id}'""", run=runner)
            pcdf = {'run': run_id, 'lot': receipt['lot'], 'csv': raw.decode('utf8'), 'upload': upload.decode('utf8'), 'analytics': True}
            record('pcdf_workspace_and_approved_synthetic_fixture_installed')
        installed = c.snapshot(m, admin, run=runner)
        for key in ['tables', 'columns', 'constraints', 'indexes', 'triggers', 'domains']:
            c.require(initial['catalog'][key] == installed['catalog'][key], 'Unexpected baseline structural drift: ' + key)
        old_functions = {x[0]: x for x in initial['catalog']['functions']}
        new_functions = {x[0]: x for x in installed['catalog']['functions']}
        changed = {k for k in old_functions if old_functions[k] != new_functions.get(k)}
        c.require(set(old_functions) == set(new_functions) and changed == {'bloquear_correcao_sem_backend', 'exigir_historico_correcao'}, 'Unexpected trigger function evolution')
        record('only_two_declared_trigger_functions_evolved_all_triggers_active')
        roles = ['sentinela_sbx_admin', 'sentinela_sbx_operator', 'sentinela_sbx_analyst']
        credentials = {r: secrets.token_urlsafe(40) for r in roles}
        script = (c.HERE / 'sql/guard.sql').read_text() + '\nBEGIN;\n'
        for role, password in credentials.items():
            script += "ALTER ROLE " + role + " PASSWORD '" + verifier(password) + "';\n"
        script += 'COMMIT;\n'

        def configure(exe, arguments, **kwargs):
            p = subprocess.run([str(c.BIN / 'psql.exe'), *map(str, arguments)], input=script,
                               env=c.environment(admin), capture_output=True, text=True, encoding='utf8', timeout=30)
            c.require(p.returncode == 0, 'Private ephemeral SCRAM bootstrap failed')
            return p.stdout.strip()

        c.psql(m, admin, file='-', run=configure)
        runtime = {'manifest': str(Path(m['root']) / 'manifest.json'), 'expectedUUID': m['uuid'],
                   'credentials': {'Administrador': {'user': roles[0], 'password': credentials[roles[0]]},
                                   'Operador': {'user': roles[1], 'password': credentials[roles[1]]}}}
        env = {k: v for k, v in c.environment().items() if not any(x in k.upper() for x in ['SUPABASE', 'DATABASE_URL', 'READER_URL'])}
        env.update(NODE_ENV='development', SENTINELA_SANDBOX_WRITE='1')
        payload = json.dumps({'config': runtime, 'analyst': credentials[roles[2]], 'subjects': [subjects[role] for role in roles],
                              'pcdf': pcdf})
        suites = [('qualify.mjs', 'create-regression.json'), ('qualify-mutations.mjs', 'mutation-tests.json')]
        if args.next:
            suites.append(('qualify-next.mjs', 'next-write-tests.json'))
        for filename, output in suites:
            c.attest(m, admin)
            p = subprocess.run(['node', '--experimental-strip-types', str(HERE / filename)], input=payload,
                               env=env, capture_output=True, text=True, encoding='utf8',
                               timeout=(540 if args.pcdf else 360) if filename == 'qualify-next.mjs' else 150)
            try:
                result = json.loads(p.stdout)
            except ValueError:
                result = {'result': 'FAIL', 'stage': 'child_protocol', 'exit_code': p.returncode}
            (evidence / output).write_text(json.dumps(result, indent=2), encoding='utf8')
            c.require(p.returncode == 0 and result.get('result') == 'PASS', 'Qualification failed: ' + filename)
            record(filename)
        final = c.snapshot(m, admin, run=runner)
        if args.next:
            individual = json.loads(c.psql(m, admin, sql="""SELECT json_build_object(
              'versions',count(*),'authors',count(DISTINCT v.subject),
              'structured',count(*) FILTER (WHERE address IS NOT NULL AND district IS NOT NULL),
              'geometry',bool_and(position IS NOT NULL AND extensions.ST_SRID(position)=4326 AND
                 (version<>o.versao OR (extensions.ST_X(position)=o.longitude AND extensions.ST_Y(position)=o.latitude))),
              'write_scope',bool_and(o.fonte='SENTINELA_WRITE_SANDBOX_V1'),
              'created',count(*) FILTER (WHERE operation='create'),
              'edited',count(*) FILTER (WHERE operation='edit'),
              'inactivated',count(*) FILTER (WHERE operation='inactivate'))
              FROM sentinela_write_lab.occurrence_versions v JOIN sentinela.ocorrencias o ON o.id=v.occurrence_id""", run=runner))
            c.require(individual == {'versions': 8, 'authors': 2, 'structured': 7, 'geometry': True,
                                     'write_scope': True, 'created': 3, 'edited': 3, 'inactivated': 2},
                      'Individual address and audit invariants failed')
            report['individual_addresses'] = individual
            record('individual_audit_and_structured_addresses')
        if args.pcdf:
            grants = json.loads(c.psql(m, admin, sql="""SELECT jsonb_object_agg(r.rolname,jsonb_build_object(
                'upload',has_function_privilege(r.oid,'sentinela_pcdf_lab.upload(uuid,jsonb,bytea,text,bigint)','EXECUTE'),
                'review',has_function_privilege(r.oid,'sentinela_pcdf_lab.workspace_review(text,text,text,uuid)','EXECUTE'),
                'decide',has_function_privilege(r.oid,'sentinela_pcdf_lab.decide(uuid,uuid,bigint,text,text,text)','EXECUTE'),
                'promote',has_function_privilege(r.oid,'sentinela_pcdf_lab.workspace_promote(uuid,uuid)','EXECUTE'),
                'direct_edit',has_any_column_privilege(r.oid,'sentinela.ocorrencias','UPDATE')
                  OR has_any_column_privilege(r.oid,'sentinela_pcdf_lab.review_decisions','INSERT,UPDATE')))
              FROM pg_roles r WHERE r.rolname IN ('sentinela_sbx_admin','sentinela_sbx_operator',
                'sentinela_sbx_analyst','sentinela_local_reader')""", run=runner))
            c.require(grants == {
                'sentinela_sbx_admin': dict(upload=True, review=True, decide=True, promote=True, direct_edit=False),
                'sentinela_sbx_operator': dict(upload=True, review=True, decide=False, promote=True, direct_edit=False),
                'sentinela_sbx_analyst': dict(upload=False, review=True, decide=False, promote=False, direct_edit=False),
                'sentinela_local_reader': dict(upload=False, review=False, decide=False, promote=False, direct_edit=False),
            }, 'PCDF effective privilege matrix changed')
            report['pcdf_grants'] = grants
            for role in ('sentinela_sbx_owner', 'sentinela_sbx_mutator'):
                hidden = c.psql(m, admin, sql=f"""BEGIN READ ONLY; SET LOCAL ROLE {role};
                    SELECT NOT EXISTS(SELECT id FROM sentinela.linhas_origem)
                       AND NOT EXISTS(SELECT id FROM sentinela.extracoes_origem); ROLLBACK;""", run=runner)
                c.require(hidden == 't', 'Manual writer owner can see PCDF lineage')
            record('pcdf_effective_grants_and_reader_writer_separation')
            pcdf_checks = json.loads(c.psql(m, admin, sql="""SELECT jsonb_build_object(
              'uploads',(SELECT count(*) FROM sentinela_pcdf_lab.uploads),
              'preserved_bytes',(SELECT bool_and(encode(sha256(u.content),'hex')=l.sha256_arquivo)
                 FROM sentinela_pcdf_lab.uploads u JOIN sentinela.lotes_importacao l ON l.id=u.lot_id),
              'admin_reviews',(SELECT count(*) FROM sentinela_pcdf_lab.review_decisions d
                 JOIN sentinela_write_lab.individuals i ON i.subject=d.subject AND i.login='sentinela_sbx_admin'),
              'promotions',(SELECT count(*) FROM sentinela.eventos_auditoria WHERE acao='consolidacao_pcdf'),
              'operator_promotion',(SELECT count(*) FROM sentinela.eventos_auditoria e
                 JOIN sentinela_write_lab.individuals i ON i.subject::text=e.depois->>'subject'
                 WHERE e.acao='consolidacao_pcdf' AND i.login='sentinela_sbx_operator'),
              'source_links',(SELECT count(*) FROM sentinela.ocorrencia_naturezas a
                 JOIN sentinela.linhas_staging s ON s.linha_origem_id=a.linha_origem_id),
              'review_applied_without_rewriting_original',(SELECT count(*) FROM sentinela.ocorrencias o
                 JOIN sentinela.ocorrencia_naturezas a ON a.ocorrencia_id=o.id
                 JOIN sentinela.linhas_staging s ON s.linha_origem_id=a.linha_origem_id
                 WHERE o.fonte='PCDF-SANDBOX' AND o.horario_fato='12:34:56' AND o.flagrante
                   AND s.campos_csv->>'horario'='' AND s.campos_csv->>'flagrante'='?'))""", run=runner))
            c.require(pcdf_checks == dict(uploads=2, preserved_bytes=True, admin_reviews=2,
                                         promotions=1, operator_promotion=1, source_links=2,
                                         review_applied_without_rewriting_original=1),
                      'PCDF workspace audit invariants failed')
            report['pcdf'] = pcdf_checks
            record('pcdf_source_bytes_review_and_promotion_invariants')
        c.require(final['catalog'] == installed['catalog'], 'Definitions changed during qualification')
        c.require(final['extra'] == installed['extra'], 'Privileges or roles changed during qualification')
        invariants = c.psql(m, admin, sql="""SELECT json_build_object(
 'occurrences',(SELECT count(*) FROM sentinela.ocorrencias),
 'history',(SELECT count(*) FROM sentinela_write_lab.mutation_history),
 'retired',(SELECT count(*) FROM sentinela_write_lab.retirements),
 'context_empty',NOT EXISTS(SELECT FROM sentinela_write_lab.mutation_context),
 'native_actors',(SELECT count(DISTINCT actor)=2 FROM sentinela_write_lab.mutation_history)
   AND NOT EXISTS(SELECT FROM sentinela_write_lab.mutation_history WHERE actor NOT IN ('sentinela_sbx_admin','sentinela_sbx_operator')),
 'version_chain',NOT EXISTS(SELECT FROM sentinela_write_lab.mutation_history WHERE new_version<>old_version+1),
 'reader_unchanged',(SELECT NOT rolcanlogin AND rolpassword IS NULL FROM pg_authid WHERE rolname='sentinela_local_reader'),
 'human_users',(SELECT count(*) FROM sentinela.usuarios));""", run=runner)
        inv = json.loads(invariants)
        c.require(inv['context_empty'] and inv['native_actors'] and inv['version_chain'] and inv['reader_unchanged']
                  and inv['human_users'] == int(args.pcdf), 'Final security invariants failed')
        report['invariants'] = inv
        report['artifact_hashes'] = m['artifacts']
        (evidence / 'mutation-final-snapshot.json').write_text(json.dumps(final), encoding='utf8')
        c.require(all(c.digest(Path(p)) == h for p, h in previous.items()), 'Earlier sandbox manifest changed')
        record('integrity_and_prior_clusters_preserved')
    except BaseException:
        record('failed_or_interrupted', 'FAIL')
        if runner.last_failure:
            (evidence / 'mutation-subprocess-failure.json').write_text(json.dumps(runner.last_failure, indent=2), encoding='utf8')
        raise
    finally:
        try:
            c.attest(m, admin, database='postgres')
            c.stop(m, admin)
            record('identified_cluster_stopped')
        except (Exception, KeyboardInterrupt):
            record('requires_state_inspection', 'UNKNOWN')
        runner.password = None
        print('Evidence: ' + str(evidence / 'mutation-completion.json'), flush=True)
    c.require(all(x['result'] == 'PASS' for x in report['stages']), 'Qualification incomplete')


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print('FAIL: ' + type(error).__name__ + '; no automatic retry; evidence retained', flush=True)
        raise SystemExit(1)
