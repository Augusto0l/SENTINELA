"""Synthetic observations only. No real files, PostgreSQL or lifecycle calls."""
import copy
import unittest
from recovery_plan import RecoveryRefused, failure_decision, plan_recovery


class RecoveryPlanTests(unittest.TestCase):
    def setUp(self):
        ident = '11111111-1111-4111-8111-111111111111'
        root = 'C:\\Synthetic\\.sentinela-local\\rls-sandboxes\\rls-sandbox-' + ident
        self.m = dict(kind='sentinela-rls-disposable-v1', uuid=ident, system_id='123',
                      root=root, data=root+'\\data', host='127.0.0.1', port=55432,
                      database='sentinela_rls_sandbox', phase='RUNNING', pid=42, start_epoch=100)
        self.o = dict(uuid=ident, system_id='123', data=self.m['data'],
                      manifest_unchanged=True, runtime_hashes_match=True,
                      reviewed_files_match=True, no_reparse_points=True,
                      no_external_tablespaces=True, process_inventory_complete=True,
                      pid_probe='ABSENT', associated_processes=[], listener_owners=[],
                      pid_file=dict(pid=42, start_epoch=100, data=self.m['data'], port=55432),
                      control_state='in production', redo_segment_present=True,
                      redo_record_readable=True, known_corruption=False)

    def plan(self):
        return plan_recovery(self.m, self.o, self.m['uuid'])

    def test_running_manifest_missing_pid_is_plan_only(self):
        p = self.plan()
        self.assertEqual(p['status'], 'PLAN_ONLY')
        self.assertFalse(p['reconciliation_executable'])

    def test_residual_pid_preserved(self):
        self.assertIn('pid_file', self.plan()['preserve'])
        self.assertIn('automatic_pid_removal', self.plan()['forbidden'])

    def test_unclean_shutdown_requires_wal_recovery(self):
        self.assertTrue(self.plan()['wal_recovery_expected'])

    def test_clean_shutdown_does_not_claim_wal_recovery(self):
        self.o['control_state'] = 'shut down'
        self.assertFalse(self.plan()['wal_recovery_expected'])

    def test_interruption_does_not_stop_or_write_manifest(self):
        self.assertFalse(failure_decision('start', 'UNKNOWN')['stop'])
        self.assertFalse(failure_decision('start', 'UNKNOWN')['write_manifest'])

    def test_active_process_after_failure_refused(self):
        self.o['pid_probe'] = 'ACTIVE'
        with self.assertRaises(RecoveryRefused): self.plan()

    def test_pid_reused_refused(self):
        self.o['pid_probe'] = 'REUSED'
        with self.assertRaises(RecoveryRefused): self.plan()

    def test_port_owned_by_other_process_refused(self):
        self.o['listener_owners'] = [99]
        with self.assertRaises(RecoveryRefused): self.plan()

    def test_wrong_identity_refused(self):
        for key in ('uuid', 'system_id', 'data'):
            with self.subTest(key=key):
                original = self.o[key]; self.o[key] = 'unexpected'
                with self.assertRaises((RecoveryRefused, ValueError)): self.plan()
                self.o[key] = original

    def test_missing_or_unreadable_wal_refused(self):
        for key in ('redo_segment_present', 'redo_record_readable'):
            self.o[key] = False
            with self.assertRaises(RecoveryRefused): self.plan()
            self.o[key] = True

    def test_reconciliation_failure_preserves_evidence(self):
        result = failure_decision('reconciliation', 'ABSENT')
        self.assertTrue(result['preserve_evidence'])
        self.assertFalse(result['retry'] or result['cleanup'] or result['write_manifest'])

    def test_operational_target_refused(self):
        self.m['port'] = 5432
        self.m['database'] = 'sentinela_dev_operacional'
        with self.assertRaises(RecoveryRefused): self.plan()

    def test_inputs_and_evidence_unchanged(self):
        before = copy.deepcopy((self.m, self.o)); self.plan()
        self.assertEqual((self.m, self.o), before)

    def test_incomplete_inventory_unknown_pid_refused(self):
        self.o['process_inventory_complete'] = False
        with self.assertRaises(RecoveryRefused): self.plan()

    def test_drift_or_corruption_refused(self):
        for key, value in [('manifest_unchanged', False), ('runtime_hashes_match', False),
                           ('reviewed_files_match', False), ('known_corruption', True)]:
            old = self.o[key]; self.o[key] = value
            with self.assertRaises(RecoveryRefused): self.plan()
            self.o[key] = old


if __name__ == '__main__':
    unittest.main()
