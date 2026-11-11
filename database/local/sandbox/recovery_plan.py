"""Pure recovery planning. No I/O, subprocesses, credentials or lifecycle mutations.

Observations must be collected independently and refreshed before future actions.
This module is NOT permission to reconcile a real manifest or remove a PID file.
"""
from copy import deepcopy
from pathlib import PureWindowsPath
import uuid


class RecoveryRefused(ValueError):
    pass


def need(condition, message):
    if not condition:
        raise RecoveryRefused(message)


def plan_recovery(manifest, observation, authorization):
    """Return a non-executable proposal, preserving both caller-owned inputs."""
    m, o = deepcopy(manifest), deepcopy(observation)
    need(str(uuid.UUID(m['uuid'])) == authorization == m['uuid'], 'UUID mismatch')
    need(m['kind'] == 'sentinela-rls-disposable-v1', 'Purpose mismatch')
    need((m['host'], m['port'], m['database']) ==
         ('127.0.0.1', 55432, 'sentinela_rls_sandbox'), 'Operational/remote target refused')
    root, data = PureWindowsPath(m['root']), PureWindowsPath(m['data'])
    need(root.is_absolute() and root.name == 'rls-sandbox-' + m['uuid'] and
         root.parent.name == 'rls-sandboxes' and root.parent.parent.name == '.sentinela-local'
         and data == root / 'data', 'Unexpected data directory')
    need(m['phase'] == 'RUNNING', 'Unexpected lifecycle phase')
    need(o['uuid'] == m['uuid'] and o['system_id'] == m['system_id'] and
         PureWindowsPath(o['data']) == data, 'Cluster identity mismatch')
    for key in ('manifest_unchanged', 'runtime_hashes_match', 'reviewed_files_match',
                'no_reparse_points', 'no_external_tablespaces', 'process_inventory_complete'):
        need(o[key] is True, 'Missing or conflicting integrity evidence: ' + key)
    need(o['pid_probe'] == 'ABSENT', 'PID active, reused or unknown')
    need(o['associated_processes'] == [] and o['listener_owners'] == [],
         'Process/listener still present')
    need(o['pid_file']['pid'] == m['pid'] and
         o['pid_file']['start_epoch'] == m['start_epoch'] and
         PureWindowsPath(o['pid_file']['data']) == data and
         o['pid_file']['port'] == m['port'], 'Residual PID identity mismatch')
    need(o['control_state'] in ('in production', 'shut down'), 'Unknown control state')
    need(o['redo_segment_present'] is True and o['redo_record_readable'] is True,
         'Required WAL not verified')
    need(o['known_corruption'] is False, 'Corruption or unknown integrity')
    return {
        'status': 'PLAN_ONLY', 'uuid': m['uuid'], 'system_id': m['system_id'],
        'reconciliation_executable': False,
        'wal_recovery_expected': o['control_state'] == 'in production',
        'proposed_phase': 'RECOVERY_REQUIRED',
        'preserve': ['full_stopped_cluster', 'manifest', 'pid_file', 'logs',
                     'runtime_configuration', 'artifacts', 'checksums', 'ACLs'],
        'gates': ['private_verified_copy', 'repeat_complete_process_and_listener_scan',
                  'review_controller_and_hash_approval', 'explicit_reconciliation_authorization',
                  'explicit_start_authorization', 'authenticated_identity_and_WAL_validation'],
        'failure_policy': 'preserve_evidence_no_retry_no_cleanup_no_manifest_write',
        'forbidden': ['pg_resetwal', 'automatic_pid_removal', 'operational_target',
                      'automatic_restore', 'artifact_hash_replacement'],
    }


def failure_decision(stage, server_state):
    """No exception, timeout or interrupt alone proves the server stopped."""
    need(stage in ('before_start', 'start', 'attestation', 'reconciliation'), 'Unknown stage')
    need(server_state in ('ACTIVE', 'ABSENT', 'UNKNOWN'), 'Unknown observation')
    return {'stage': stage, 'server_state': server_state, 'retry': False,
            'stop': False, 'cleanup': False, 'write_manifest': False,
            'preserve_evidence': True, 'requires_fresh_observation': True}
