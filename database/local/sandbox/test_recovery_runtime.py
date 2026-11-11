"""Offline integration of recovery gates; only synthetic temporary directories."""
import copy
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import uuid
import test_control as existing
c = existing.c


class RecoveryRuntime(unittest.TestCase):
    setUp = existing.Controllers.setUp
    tearDown = existing.Controllers.tearDown
    data = existing.Controllers.data
    running = existing.Controllers.running
    fake = existing.Controllers.fake

    def fixture(self):
        self.running()
        d=Path(self.m['data'])
        (d/'postmaster.pid').write_text('42\n'+str(d)+'\n1000\n55432\n')
        (d/'pg_wal').mkdir();(d/'pg_wal'/'000000010000000000000001').write_bytes(b'synthetic')
        self.record=Path(self.m['root'])/'copy.synthetic.json';self.record.write_text('{}')

    def run_fake(self,exe,args,**kw):
        if exe=='pg_controldata':
            return ("Database system identifier: 123456\nDatabase cluster state: in production\n"
                    "Latest checkpoint's REDO WAL file: 000000010000000000000001\n"
                    "Latest checkpoint's REDO location: 0/10\nBytes per WAL segment: 9\n")
        if exe=='pg_waldump':return 'synthetic readable redo record'
        return self.fake(exe,args,**kw)

    def absent(self,m):
        return dict(registered_pid_absent=True,associated_processes_absent=True,port_free=True)

    def test_stopped_identity_and_residual_pid_valid(self):
        self.fixture();pid=Path(self.m['data'])/'postmaster.pid';before=pid.read_bytes()
        self.assertEqual(c.stopped_state(self.m,self.run_fake,self.absent)['pid'],42)
        self.assertEqual(pid.read_bytes(),before)

    def test_active_reused_or_occupied_refused(self):
        self.fixture()
        for key in self.absent(self.m):
            with self.subTest(key=key):
                state=self.absent(self.m);state[key]=False
                with self.assertRaises(c.Refused):c.stopped_state(self.m,self.run_fake,lambda m:state)

    def test_system_identifier_refused(self):
        self.fixture()
        with self.assertRaises(c.Refused):
            c.stopped_state(self.m,lambda *a,**k:self.run_fake(*a,**k).replace('123456','999'),self.absent)

    def test_manifest_tamper_refused(self):
        self.fixture();self.m['pid']=999
        with self.assertRaises(c.Refused):c.stopped_state(self.m,self.run_fake,self.absent)

    def test_wal_missing_refused(self):
        self.fixture();(Path(self.m['data'])/'pg_wal'/'000000010000000000000001').unlink()
        with self.assertRaises(c.Refused):c.stopped_state(self.m,self.run_fake,self.absent)

    def test_wal_record_unreadable_refused(self):
        self.fixture()
        def run(exe,args,**kw):return '' if exe=='pg_waldump' else self.run_fake(exe,args,**kw)
        with self.assertRaises(c.Refused):c.stopped_state(self.m,run,self.absent)

    def test_reconcile_preserves_identity_hashes_and_records_before_after(self):
        self.fixture();before=copy.deepcopy(self.m)
        with patch.object(c,'verify_physical_copy',return_value={}):
            result=c.reconcile(self.m,self.m['uuid'],c.digest(Path(self.m['root'])/'manifest.json'),self.record,self.run_fake,self.absent)
        self.assertEqual(result['phase'],'RECOVERY_REQUIRED')
        for key in ('uuid','system_id','artifacts','pid','start_epoch','runtime_files'):
            self.assertEqual(result[key],before[key])
        evidence=list((Path(self.m['root'])/'evidence').glob('reconcile-*'))
        self.assertEqual(len(evidence),1)
        self.assertTrue(all((evidence[0]/n).exists() for n in ('before.json','proposed.json','after.json')))

    def test_reconcile_write_failure_preserves_intent(self):
        self.fixture();manifest=Path(self.m['root'])/'manifest.json';before=manifest.read_bytes()
        with patch.object(c,'verify_physical_copy',return_value={}),patch.object(c,'save',side_effect=OSError('synthetic write failure')):
            with self.assertRaises(OSError):c.reconcile(self.m,self.m['uuid'],c.digest(manifest),self.record,self.run_fake,self.absent)
        self.assertEqual(before,manifest.read_bytes())
        self.assertEqual(len(list((Path(self.m['root'])/'evidence').glob('reconcile-*/proposed.json'))),1)

    def test_reconcile_requires_copy_and_exact_hash(self):
        self.fixture()
        with self.assertRaises(c.Refused):c.reconcile(self.m,self.m['uuid'],'0'*64,self.record,self.run_fake,self.absent)
        with patch.object(c,'verify_physical_copy',side_effect=c.Refused('incomplete copy')):
            with self.assertRaises(c.Refused):c.reconcile(self.m,self.m['uuid'],c.digest(Path(self.m['root'])/'manifest.json'),self.record,self.run_fake,self.absent)

    def test_operational_endpoint_refused_before_write(self):
        self.fixture();self.m.update(port=5432,database='sentinela_dev_operacional')
        c.save(self.m)
        with self.assertRaises(c.Refused):c.stopped_state(self.m,self.run_fake,self.absent)

    def recovery(self):
        self.fixture();self.m.update(phase='RECOVERY_REQUIRED',recovery_copy=str(self.record),reconciliations=[{'copy_record_sha256':c.digest(self.record)}]);c.save(self.m)

    def test_recovery_start_success_attested_before_running(self):
        self.recovery()
        with patch.object(c,'stopped_state',return_value={}),patch.object(c,'verify_physical_copy',return_value={}),patch.object(c,'attest',return_value=(77,2000)):
            c.start(self.m,'synthetic',run=self.run_fake,probe=lambda:True,ready=lambda:True,report=lambda *a:None)
        self.assertEqual(self.m['phase'],'RUNNING');self.assertEqual(self.m['pid'],77)
        self.assertTrue(self.m['last_start']['recovery_start'])

    def test_recovery_failure_or_interrupt_keeps_manifest_and_evidence(self):
        self.recovery();manifest=Path(self.m['root'])/'manifest.json';before=manifest.read_bytes()
        for error in (c.ProcessFailure('pg_ctl','timeout'),KeyboardInterrupt()):
            def fail(exe,args,**kw):
                if exe=='pg_ctl':raise error
                return self.run_fake(exe,args,**kw)
            with patch.object(c,'stopped_state',return_value={}),patch.object(c,'verify_physical_copy',return_value={}),patch.object(c,'observed_server',return_value={'state':'UNKNOWN'}):
                with self.assertRaises(type(error)):c.start(self.m,'synthetic',run=fail,probe=lambda:True,report=lambda *a:None)
            self.assertEqual(manifest.read_bytes(),before)
        self.assertEqual(len(list((Path(self.m['root'])/'evidence').glob('start-*.json'))),2)

    def test_changed_copy_record_blocks_start(self):
        self.recovery();self.record.write_text('{"tampered":true}')
        with patch.object(c,'stopped_state',return_value={}):
            with self.assertRaises(c.Refused):c.start(self.m,'synthetic',run=self.run_fake)

    def test_recovery_attestation_failure_keeps_original_state(self):
        self.recovery();manifest=Path(self.m['root'])/'manifest.json';before=manifest.read_bytes()
        with patch.object(c,'stopped_state',return_value={}),patch.object(c,'verify_physical_copy',return_value={}),patch.object(c,'attest',side_effect=c.Refused('synthetic identity failure')),patch.object(c,'observed_server',return_value={'state':'PROCESS_PRESENT_UNATTESTED'}):
            with self.assertRaises(c.Refused):c.start(self.m,'synthetic',run=self.run_fake,probe=lambda:True,ready=lambda:True,report=lambda *a:None)
        self.assertEqual(before,manifest.read_bytes())
        evidence=list((Path(self.m['root'])/'evidence').glob('start-*.json'))
        self.assertEqual(json.loads(evidence[0].read_text())['result']['server_observation']['state'],'PROCESS_PRESENT_UNATTESTED')

    def test_recovery_review_wrong_uuid_and_unlisted_artifact_refused(self):
        self.fixture();path=Path(self.m['root'])/'review.json'
        review=dict(uuid=self.m['uuid'],system_id=self.m['system_id'],manifest_sha256=c.digest(Path(self.m['root'])/'manifest.json'),changes=[dict(artifact='unapproved.py',old_sha256='0'*64,new_sha256='1'*64)])
        path.write_text(json.dumps(review))
        for auth in ('wrong-uuid',self.m['uuid']):
            with self.assertRaises(c.Refused):c.approve_recovery_artifacts(self.m,path,c.digest(path),auth,self.run_fake,self.absent)

    def test_windows_launch_has_no_calling_console_and_no_pipe(self):
        seen={}
        class Child:
            def wait(self,timeout):return 0
        def launch(*a,**kw):seen.update(kw);return Child()
        with patch.object(c.subprocess,'Popen',side_effect=launch):c.process('pg_ctl',['start'])
        self.assertTrue(seen['creationflags'] & subprocess.CREATE_NO_WINDOW)
        self.assertTrue(seen['creationflags'] & subprocess.CREATE_NEW_PROCESS_GROUP)
        self.assertTrue(seen['close_fds']);self.assertNotEqual(seen['stdout'],subprocess.PIPE)

    @staticmethod
    def inventory(root):
        root=Path(root)
        return {str(p.relative_to(root)) if p!=root else '': {'directory':p.is_dir(),'bytes':p.stat().st_size if p.is_file() else None,'sha256':c.digest(p) if p.is_file() else None}
                for p in [root,*root.rglob('*')]}

    def test_copy_validation_detects_missing_file_and_hash_change(self):
        self.fixture();source=Path(self.m['root']);parent=self.base/('recovery-copy-'+str(uuid.uuid4()));parent.mkdir()
        shutil.copytree(source,parent/'payload')
        record=dict(kind='sentinela-stopped-copy-v1',uuid=self.m['uuid'],system_id=self.m['system_id'],source=str(source),
                    manifest_sha256=c.digest(source/'manifest.json'),inventory=self.inventory(source))
        path=parent/'copy.json';path.write_text(json.dumps(record))
        c.verify_physical_copy(self.m,path,inventory=self.inventory)
        wal=parent/'payload/data/pg_wal/000000010000000000000001';wal.write_bytes(b'changed')
        with self.assertRaises(c.Refused):c.verify_physical_copy(self.m,path,inventory=self.inventory)
        wal.unlink()
        with self.assertRaises(c.Refused):c.verify_physical_copy(self.m,path,inventory=self.inventory)

    def test_stopped_review_does_not_claim_authenticated_server(self):
        self.fixture();key='database/local/sandbox/control.py';actual=c.digest(c.HERE/'control.py')
        self.m['artifacts'][key]='0'*64;c.save(self.m)
        plan=Path(self.m['root'])/'review.json';plan.write_text(json.dumps(dict(uuid=self.m['uuid'],system_id=self.m['system_id'],
            manifest_sha256=c.digest(Path(self.m['root'])/'manifest.json'),changes=[dict(artifact=key,old_sha256='0'*64,new_sha256=actual)])))
        result=c.approve_recovery_artifacts(self.m,plan,c.digest(plan),self.m['uuid'],self.run_fake,self.absent)
        self.assertEqual(result['phase'],'RUNNING')
        self.assertFalse(result['recovery_artifact_approvals'][0]['authenticated_server'])


class DisposableWindowsCopy(unittest.TestCase):
    def test_native_copy_acl_metadata_and_corruption_detection(self):
        # Native filesystem only; never runs pg_ctl, SQL or an actual observation.
        with tempfile.TemporaryDirectory(prefix='sentinela-recovery-copy-test-') as temp:
            base=Path(temp);root=base/('rls-sandbox-'+str(uuid.uuid4()));root.mkdir()
            c.private_directory(root)
            (root/'data').mkdir();(root/'evidence').mkdir()
            (root/'data/synthetic.txt').write_bytes(b'synthetic fixture, no credentials')
            m={'root':str(root),'data':str(root/'data'),'uuid':str(uuid.uuid4()),'system_id':'synthetic',
               'artifacts':{},'runtime_files':{}}
            (root/'manifest.json').write_text(json.dumps(m))
            with patch.object(c,'BASE',base),patch.object(c,'stopped_state',return_value={}),patch.object(c,'artifacts',return_value=None):
                record=c.physical_copy(m,m['uuid'],c.digest(root/'manifest.json'))
                self.assertTrue(record.exists())
                c.verify_physical_copy(m,record)
                (record.parent/'payload/data/synthetic.txt').write_bytes(b'changed')
                with self.assertRaises(c.Refused):c.verify_physical_copy(m,record)


if __name__=='__main__':unittest.main()
