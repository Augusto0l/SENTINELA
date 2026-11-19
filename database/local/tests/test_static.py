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
# Privileged functions are already qualified in these disposable-cluster
# scripts. Pin the expanded SQL, including the guard and grants.
QUALIFIED_SANDBOX_SQL = {
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
            if path in QUALIFIED_SANDBOX_SQL:
                self.assertEqual(hashlib.sha256(text.encode()).hexdigest(), QUALIFIED_SANDBOX_SQL[path], str(path))
            else:
                self.assertNotRegex(text.upper(), r'\bSECURITY\s+DEFINER\b')
            nodes = json.loads(parser.parse_sql_json(text))['stmts']
            if path.name == 'fixtures_rollback.sql':
                self.assertEqual(nodes[0]['stmt']['TransactionStmt']['kind'], 'TRANS_STMT_BEGIN')
                self.assertEqual(nodes[-1]['stmt']['TransactionStmt']['kind'], 'TRANS_STMT_ROLLBACK')
                self.assertFalse(any(n['stmt'].get('TransactionStmt',{}).get('kind')=='TRANS_STMT_COMMIT' for n in nodes))
            elif path.name in ('0001_create_local_reader.sql','0001_read_only.sql','0001_suspend_reader.sql'):
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
