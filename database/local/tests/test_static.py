"""Offline tests only: SQL AST, privileges, HBA candidate and opt-in runtime harness."""
from __future__ import annotations

import argparse
import ast as pyast
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
SPEC = json.loads((ROOT / 'security-spec.json').read_text(encoding='utf-8'))
RA_V2_TEMPLATE = ROOT / 'ra-catalog-v2/install.sql'
SANDBOX_GUARD = ROOT / 'sandbox/sql/guard.sql'
OCCURRENCES_READ = ROOT / 'pcdf-sandbox/occurrences-read.sql'
OCCURRENCES_READ_SHA256 = '6178d34b74d4df8a6349ebade18680166da2d3d4b1201d0d12961b0629571384'
MANUAL_OCCURRENCES = ROOT / 'pcdf-sandbox/manual-occurrences.sql'
MANUAL_OCCURRENCES_SHA256 = 'baa6f5f782c3c3949fa1b0e0d1260807c32bbdacf99c9b042503e074eebec972'
MANUAL_CATALOG_CODES = ROOT / 'pcdf-sandbox/manual-catalog-codes.sql'
MANUAL_CATALOG_CODES_SHA256 = '47fbe06a78bbeb0ab1bbeb87c0500c5280cf52aff4232d5a5ddbbcb02a5b2529'
MANUAL_CATALOG_RELEASE = ROOT / 'pcdf-sandbox/manual-catalog-release.sql'
MANUAL_CATALOG_RELEASE_SHA256 = 'ea34257bcd2971a43ebdb9adc6a9c2210577a1ff84a80df9c49e8d05deb2bc02'
PCDF_V2_SYNTHETIC = ROOT / 'pcdf-sandbox/0001_pcdf_v2_synthetic.sql'
MANAGEMENT_SYNTHETIC = ROOT / 'pcdf-sandbox/0002_occurrence_management_synthetic.sql'
EDITING_SYNTHETIC = ROOT / 'pcdf-sandbox/0003_occurrence_editing_synthetic.sql'
MANUAL_PERSISTENCE_SYNTHETIC = ROOT / 'pcdf-sandbox/0004_manual_occurrence_persistence_synthetic.sql'
PURGE_SYNTHETIC = ROOT / 'pcdf-sandbox/0005_import_purge_synthetic.sql'
OCCURRENCES_ANALYTICS = ROOT / 'pcdf-sandbox/occurrences-analytics.sql'
LOCAL_ATTESTED_SQL = (OCCURRENCES_READ, MANUAL_OCCURRENCES, MANUAL_CATALOG_CODES, MANUAL_CATALOG_RELEASE,
                      MANAGEMENT_SYNTHETIC, EDITING_SYNTHETIC, MANUAL_PERSISTENCE_SYNTHETIC,
                      PURGE_SYNTHETIC, OCCURRENCES_ANALYTICS)
# Pin the qualified local functions together with their guards, grants and includes.
QUALIFIED_LOCAL_SQL = {
    ROOT / 'pcdf-sandbox/main-import-history.sql': '23f0fb153a9798a2dcd7c08cc8f8ab291beec3515aad7b3697b333be18f3cd62',
    ROOT / 'pcdf-sandbox/direct.sql': '14d5997478d022615429af680a60652038c3ed64e07b55f32423d9f9342dd122',
    PCDF_V2_SYNTHETIC: '9955381c9dba155e051d8134f2a20f59f3be52a52f3d0d59c1af66e5086606d6',
    MANAGEMENT_SYNTHETIC: 'b49fe72f694134d44a44b224605d8ed0c32f97e1ed729f6e00ed38990f650b4f',
    EDITING_SYNTHETIC: '67803f18fca9faf1368cac4c8927c13dc7091edeb9072ec2ded894fc74cb1d09',
    MANUAL_PERSISTENCE_SYNTHETIC: '0e2eb2d540764aa7d645f1f86266eaed09837b21fe6dbc81c48b6f52ad05882b',
    PURGE_SYNTHETIC: '6f1b00b9f7b0ec0ad5b09973709c0eb4dde6f182b13f29a92497ba7152be633d',
    OCCURRENCES_ANALYTICS: 'e23a85551ae277e6b70a79fb2efd88f817ef060c02a3b02dbcdda1e121711f23',
    ROOT / 'write-sandbox/005_general_import.sql': 'c7778aacd67c7f3017402d61a8e9e341334d6f1ce187ae518a8f0d962a539bde',
    ROOT / 'pcdf-sandbox/pilot-executor.sql': '8e483068d1bc014e293b10709f29bed04a5562d7af1aefa57b3bc2f75066a1b5',
    ROOT / 'pcdf-sandbox/receiver-service-fixture.sql': '6a5d7f7b0e431440c736522b7fcf06db9632ac2bbf7a0541124848053a06c2fb',
    ROOT / 'pcdf-sandbox/workspace.sql': '6d1b8c4f2ef26a96f1c480a45cd847c7075a5531d753a431bf4656a2285e4a64',
    ROOT / 'write-sandbox/003_individual_address.sql': 'dc4cdb9dca32c0fbbb9cc9280ff552349cd46c4559c675c2777a7bb5ec03010e',
    ROOT / 'write-sandbox/004_workspace_read.sql': '3e088c4b0b88be8c67bdcf65f52dc56a73e94d6d968eb3ac23e70770975277dc',
    ROOT / 'write-sandbox/bindings.sql': 'a8f5b9c74f42b5789fa085ee5b089bf51c8da1c92d702ed0398cc96b04cf090f',
    ROOT / 'write-sandbox/geography.sql': 'ad8702472205a4fb6642c2778608bf7f08478041bd7e526bb75ca72289070857',
    ROOT / 'write-sandbox/mutations.sql': 'ca3ba3f41cf93e2dd72359748262dc61390318bc9ff8cf1bfb7e66fc7490a9ce',
    ROOT / 'write-sandbox/setup.sql': 'a274933b339d7ae86153c3bd35905f6ced8626b2908bade1217da45d38084904',
}


def expand(path):
    source = path.read_text(encoding='utf-8')
    if path == RA_V2_TEMPLATE:
        payload = json.loads(path.with_name('payload.json').read_text(encoding='utf-8'))
        approved = {row['code']: {'name': row['name'], 'metadata': row['metadata']} for row in payload['entries']}
        literal = "'" + json.dumps(approved, ensure_ascii=False).replace("'", "''") + "'"
        source = source.replace('__APPROVED_JSON__', literal)
    parts = []
    for line in source.splitlines():
        if line.startswith('\\ir '):
            target = line[4:].strip()
            include = SANDBOX_GUARD if path == RA_V2_TEMPLATE and target == '__GUARD_PATH__' else path.parent / target
            include = include.resolve()
            if not include.is_relative_to(ROOT) and not (path == ROOT/'sandbox/sql/baseline.sql' and include == REPO/'database/supabase/baseline/0001_modelo_inicial.sql'):
                raise AssertionError('SQL include outside local artifacts')
            parts.append(expand(include))
        elif not line.startswith('\\'):
            parts.append(line)
    text = '\n'.join(parts)
    if path.is_relative_to(ROOT/'sandbox/sql'):
        text = re.sub(r":'sandbox_start'", "'1000'", text)
        text = re.sub(r":'sandbox_(uuid|systemid|data)'", "'static-parser-placeholder'", text)
    if path in LOCAL_ATTESTED_SQL:
        text = text.replace(":'expected_uuid'", "'00000000-0000-4000-8000-000000000000'")
    if path == OCCURRENCES_ANALYTICS:
        text = text.replace(":'expected_system'", "'0'")
    return text


def load_hba():
    spec = importlib.util.spec_from_file_location('reader_hba', ROOT / 'tools/prepare_hba.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class StaticSecurityTests(unittest.TestCase):
    def test_ra_v2_expands_guard_and_approved_payload(self):
        rendered = expand(RA_V2_TEMPLATE)
        self.assertTrue(rendered.startswith('\n'.join(RA_V2_TEMPLATE.read_text(encoding='utf-8').splitlines()[:1])
                                            + '\n' + expand(SANDBOX_GUARD)))
        self.assertNotIn('__GUARD_PATH__', rendered)
        self.assertNotIn('__APPROVED_JSON__', rendered)

    def test_sql_and_procedural_syntax(self):
        from pglast import ast, parse_sql, parse_plpgsql
        from pglast.stream import RawStream
        for path in sorted(ROOT.rglob('*.sql')):
            with self.subTest(path=path.name):
                nodes = parse_sql(expand(path))
                self.assertTrue(nodes)
                for raw in nodes:
                    if isinstance(raw.stmt, ast.DoStmt):
                        parse_plpgsql(RawStream()(raw.stmt))

    def test_original_baseline_unchanged(self):
        path = REPO / 'database/supabase/baseline/0001_modelo_inicial.sql'
        content = path.read_text(encoding='utf-8-sig').replace('\r\n', '\n').replace('\r', '\n')
        self.assertEqual(hashlib.sha256(content.encode()).hexdigest(), SPEC['baseline_sha256'])
        auth = REPO / 'database/supabase/migrations/0006_auth_vinculo_acesso.sql'
        normalized = auth.read_text(encoding='utf-8-sig').replace('\r\n', '\n').replace('\r', '\n')
        self.assertEqual(hashlib.sha256(normalized.encode()).hexdigest(),
                         '7c6555bd0c54d47a28e1faa8d2e93a3487b89c12c96c831cfb751a17aef741b6')

    def test_migration_grants_are_exact_and_column_scoped(self):
        from pglast import parser
        statements = json.loads(parser.parse_sql_json(expand(ROOT / 'migrations/0001_read_only.sql')))['stmts']
        tables = {}
        for raw in statements:
            node = raw['stmt'].get('GrantStmt')
            if not node or not node.get('is_grant'):
                continue
            self.assertEqual(node['grantees'], [{'RoleSpec': {'roletype': 'ROLESPEC_CSTRING', 'rolename': SPEC['role'],
                              'location': node['grantees'][0]['RoleSpec']['location']}}])
            self.assertFalse(node.get('grant_option', False))
            if node['objtype'] == 'OBJECT_TABLE':
                self.assertEqual(node['targtype'], 'ACL_TARGET_OBJECT')
                self.assertEqual(len(node['objects']), 1)
                table = node['objects'][0]['RangeVar']
                self.assertEqual(table['schemaname'], 'sentinela')
                self.assertEqual(len(node['privileges']), 1)
                privilege = node['privileges'][0]['AccessPriv']
                self.assertEqual(privilege['priv_name'], 'select')
                self.assertTrue(privilege.get('cols'))
                tables[table['relname']] = [c['String']['sval'] for c in privilege['cols']]
            else:
                self.assertIn(node['objtype'], ('OBJECT_DATABASE', 'OBJECT_SCHEMA'))
                names = [p['AccessPriv']['priv_name'] for p in node['privileges']]
                self.assertEqual(names, ['connect'] if node['objtype']=='OBJECT_DATABASE' else ['usage'])
        self.assertEqual(tables, SPEC['grants'])
        actual = {(row[0], row[2]): row[3] for row in SPEC['columns']}
        for table, cols in tables.items():
            for col in cols:
                self.assertIn((table, col), actual)

    def test_policies_are_select_only_and_dependencies_acyclic(self):
        from pglast import parser
        text = expand(ROOT / 'migrations/0001_read_only.sql')
        nodes = json.loads(parser.parse_sql_json(text))['stmts']
        policies = [n['stmt']['CreatePolicyStmt'] for n in nodes if 'CreatePolicyStmt' in n['stmt']]
        self.assertEqual(len(policies), 6)
        self.assertEqual({p['table']['relname'] for p in policies}, set(SPEC['grants']))
        for p in policies:
            self.assertEqual(p['cmd_name'], 'select')
            self.assertEqual(p['roles'][0]['RoleSpec']['rolename'], SPEC['role'])
            self.assertNotIn('with_check', p)
        expected = {
            'ocorrencias': "fonte='SENTINELA_TESTE_LOCAL_V1' AND ativo AND consolidacao_status='consolidada'",
            'ocorrencia_naturezas': 'EXISTS(SELECT 1 FROM sentinela.ocorrencias o WHERE o.id=ocorrencia_naturezas.ocorrencia_id)',
            'naturezas_criminais': "fonte='SENTINELA_TESTE_LOCAL_V1'",
            'categorias_criminais': "versao_catalogo='SENTINELA_TESTE_LOCAL_V1' AND status='homologada'",
            'mapeamentos_natureza': "versao='SENTINELA_TESTE_LOCAL_V1' AND status='homologado' AND EXISTS(SELECT 1 FROM sentinela.naturezas_criminais n WHERE n.id=mapeamentos_natureza.natureza_id) AND EXISTS(SELECT 1 FROM sentinela.categorias_criminais c WHERE c.id=mapeamentos_natureza.categoria_id)",
            'regioes_administrativas': "versao_catalogo='SENTINELA_TESTE_LOCAL_V1'",
        }
        def normalized(value):
            if isinstance(value, dict):
                return {k: normalized(v) for k,v in value.items() if k != 'location'}
            if isinstance(value, list):
                return [normalized(v) for v in value]
            return value
        for p in policies:
            condition = expected[p['table']['relname']]
            ref = json.loads(parser.parse_sql_json('CREATE POLICY expected ON sentinela.' + p['table']['relname'] + ' FOR SELECT USING (' + condition + ')'))['stmts'][0]['stmt']['CreatePolicyStmt']['qual']
            self.assertEqual(normalized(p['qual']), normalized(ref))
        dependencies = {}
        def relations(value):
            if isinstance(value, dict):
                if 'RangeVar' in value:
                    yield value['RangeVar']['relname']
                for child in value.values():
                    yield from relations(child)
            elif isinstance(value, list):
                for child in value:
                    yield from relations(child)
        for p in policies:
            dependencies[p['table']['relname']] = set(relations(p['qual']))
        def visit(name, stack):
            self.assertNotIn(name, stack, 'Recursive RLS dependency')
            for target in dependencies[name]:
                self.assertIn(target, SPEC['grants'])
                visit(target, stack | {name})
        for name in dependencies:
            visit(name, set())
        self.assertIn("fonte='SENTINELA_TESTE_LOCAL_V1' AND ativo AND consolidacao_status='consolidada'", text)

    def test_sandbox_policy_and_grant_definitions_match_original(self):
        from pglast import parser
        def definitions(path):
            nodes=json.loads(parser.parse_sql_json(expand(path)))['stmts']
            def normalized(v):
                if isinstance(v,dict):return {k:normalized(x) for k,x in v.items() if k!='location'}
                if isinstance(v,list):return [normalized(x) for x in v]
                if v=='sentinela_dev_operacional':return 'sentinela_rls_sandbox'
                return v
            return [normalized(n['stmt']) for n in nodes if any(k in n['stmt'] for k in ['CreatePolicyStmt','GrantStmt'])]
        self.assertEqual(definitions(ROOT/'migrations/0001_read_only.sql'),definitions(ROOT/'sandbox/sql/read_only.sql'))

    def test_role_safe_defaults_and_no_password(self):
        from pglast import parser
        nodes = json.loads(parser.parse_sql_json(expand(ROOT / 'roles/0001_create_local_reader.sql')))['stmts']
        roles = [n['stmt']['CreateRoleStmt'] for n in nodes if 'CreateRoleStmt' in n['stmt']]
        self.assertEqual(len(roles), 1)
        self.assertEqual(roles[0]['role'], SPEC['role'])
        opts = {o['DefElem']['defname']: o['DefElem'].get('arg') for o in roles[0]['options']}
        for key in ['canlogin','superuser','bypassrls','createdb','createrole','isreplication','inherit']:
            self.assertEqual(opts[key], {'Boolean': {'boolval': False}})
        self.assertEqual(opts['connectionlimit'], {'Integer': {'ival': 5}})
        self.assertNotIn('rolemembers', opts)
        self.assertNotIn('adminmembers', opts)
        self.assertIn('password', opts)
        self.assertIsNone(opts['password'])

    def test_no_dangerous_sql_or_fixture_commit(self):
        from pglast import parser
        for path in ROOT.rglob('*.sql'):
            text = expand(path)
            self.assertNotRegex(text.upper(), r'\bDISABLE\s+(?:TRIGGER|ROW LEVEL)|\bNO\s+FORCE\b|\bDROP\s+(?:SCHEMA|TABLE|TRIGGER|ROLE)')
            if path == OCCURRENCES_READ:
                # Pin the reviewed reader artifact, including the role and scope guards.
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), OCCURRENCES_READ_SHA256)
            elif path == MANUAL_OCCURRENCES:
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), MANUAL_OCCURRENCES_SHA256)
            elif path == MANUAL_CATALOG_CODES:
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), MANUAL_CATALOG_CODES_SHA256)
            elif path == MANUAL_CATALOG_RELEASE:
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), MANUAL_CATALOG_RELEASE_SHA256)
            elif path in QUALIFIED_LOCAL_SQL:
                self.assertEqual(hashlib.sha256(text.encode()).hexdigest(), QUALIFIED_LOCAL_SQL[path], str(path))
            else:
                self.assertNotRegex(text.upper(), r'\bSECURITY\s+DEFINER\b')
            nodes = json.loads(parser.parse_sql_json(text))['stmts']
            if path.name == 'fixtures_rollback.sql':
                self.assertEqual(nodes[0]['stmt']['TransactionStmt']['kind'], 'TRANS_STMT_BEGIN')
                self.assertEqual(nodes[-1]['stmt']['TransactionStmt']['kind'], 'TRANS_STMT_ROLLBACK')
                self.assertFalse(any(n['stmt'].get('TransactionStmt',{}).get('kind')=='TRANS_STMT_COMMIT' for n in nodes))
            elif path in LOCAL_ATTESTED_SQL or path == PCDF_V2_SYNTHETIC or path.name in ('0001_create_local_reader.sql','0001_read_only.sql','0001_suspend_reader.sql'):
                self.assertEqual(nodes[0]['stmt']['TransactionStmt']['kind'], 'TRANS_STMT_BEGIN')
                self.assertEqual(nodes[-1]['stmt']['TransactionStmt']['kind'], 'TRANS_STMT_COMMIT')

    def test_hba_allow_deny_matrix(self):
        hba = load_hba()
        hba.validate_fragment((ROOT / 'hba/sentinela_local_reader.conf').read_text())
        self.assertEqual(hba.decision(SPEC['database'], '127.0.0.1'), 'scram-sha-256')
        for db, address in [('postgres','127.0.0.1'),('template1','127.0.0.1'),('other','127.0.0.1'),
                            (SPEC['database'],'127.0.0.2'),(SPEC['database'],'::1'),
                            (SPEC['database'],'192.168.1.2'),(SPEC['database'],'2001:db8::1'),
                            ('replication','127.0.0.1'),('replication','::1')]:
            self.assertEqual(hba.decision(db, address), 'reject')
        self.assertEqual(hba.decision(SPEC['database']), 'reject')
        with self.assertRaises(ValueError):
            hba.validate_fragment('\n'.join(reversed((ROOT / 'hba/sentinela_local_reader.conf').read_text().splitlines())))

    def test_hba_candidate_preserves_original_and_refuses_overwrite(self):
        hba = load_hba()
        with tempfile.TemporaryDirectory(prefix='sentinela-hba-static-') as temp:
            root = Path(temp)
            active = root / 'active'
            active.mkdir()
            source = active / 'pg_hba.conf'
            raw = b'# synthetic original\r\nhost all all 127.0.0.1/32 scram-sha-256\r\n'
            source.write_bytes(raw)
            out = root / 'candidate'
            result = hba.prepare(source, out)
            self.assertEqual(source.read_bytes(), raw)
            self.assertEqual((out / 'pg_hba.original.conf').read_bytes(), raw)
            candidate = (out / 'pg_hba.candidate.conf').read_bytes()
            self.assertTrue(candidate.endswith(raw))
            self.assertEqual(hashlib.sha256(candidate).hexdigest(), result['candidate_sha256'])
            with self.assertRaises(ValueError):
                hba.prepare(source, out)
            with self.assertRaises(ValueError):
                hba.prepare(source, active / 'unsafe')
            source.write_text('host all sentinela_local_reader 127.0.0.1/32 trust\n')
            with self.assertRaises(ValueError):
                hba.prepare(source, root / 'duplicate')

    def test_runtime_harness_opt_in_does_not_connect(self):
        result = subprocess.run([sys.executable, str(ROOT / 'tests/run_reader.py')], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('No connection made', result.stderr)
        # Compile only; never import or run security probes during static validation.
        for path in ROOT.rglob('*.py'):
            pyast.parse(path.read_text(encoding='utf-8'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--parser-path', type=Path)
    options, extra = parser.parse_known_args()
    if options.parser_path:
        sys.path.insert(0, str(options.parser_path.resolve()))
    unittest.main(argv=[sys.argv[0], *extra])
