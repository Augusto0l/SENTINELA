"""Only mocks and synthetic disposable directories; never starts PostgreSQL."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import uuid

spec=importlib.util.spec_from_file_location('sandbox',Path(__file__).with_name('control.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)

class Controllers(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='sentinela-controller-unit-');self.base=Path(self.temp.name)
  self.patches=[patch.object(c,'BASE',self.base),patch.object(c,'private_directory',lambda p:None),patch.object(c.subprocess,'run',side_effect=AssertionError('Real process forbidden in unit tests')),patch.object(c.subprocess,'Popen',side_effect=AssertionError('Real Popen forbidden in unit tests'))]
  for p in self.patches:p.start()
  ident=str(uuid.uuid4());r=self.base/('rls-sandbox-'+ident);r.mkdir();(r/'evidence').mkdir()
  self.m=dict(kind='sentinela-rls-disposable-v1',uuid=ident,root=str(r),data=str(r/'data'),host=c.HOST,port=c.PORT,database=c.DB,locale='C',phase='PREPARED',system_id=None,pid=None,start_epoch=None,artifacts={'database/local/sandbox/control.py':c.digest(c.HERE/'control.py')})
  c.save(self.m);self.calls=[]
 def tearDown(self):
  for p in reversed(self.patches):p.stop()
  self.temp.cleanup()
 def fail(self,fn):self.assertRaises(c.Refused,fn)
 def data(self):
  d=Path(self.m['data']);d.mkdir();(d/'PG_VERSION').write_text('17');(d/'pg_tblspc').mkdir();(d/'pg_hba.conf').write_text('synthetic SCRAM');self.m.update(system_id='123456',phase='CREATED')
  marker={k:self.m[k] for k in ['kind','uuid','system_id','data','port','database']};(d/'sentinela-sandbox.json').write_text(json.dumps(marker));self.m['runtime_files']={'pg_hba.conf':c.digest(d/'pg_hba.conf')};c.save(self.m)
 def running(self):
  self.data();self.m.update(phase='RUNNING',pid=42,start_epoch=1000);(Path(self.m['data'])/'postmaster.pid').write_text('42\n'+self.m['data']+'\n1000\n55432\n');c.save(self.m)
 def fake(self,exe,args,**kw):
  self.calls.append((exe,args))
  if exe=='pg_controldata':return 'Database system identifier: 123456'
  if exe=='psql' and c.IDENTITY_SQL in args:
   return json.dumps(dict(database='postgres' if 'postgres'==args[args.index('-d')+1] else c.DB,user='postgres',host=c.HOST,port=c.PORT,data=self.m['data'],uuid=self.m['uuid'],system_id=self.m['system_id'],start_epoch=1000,pid=42,external_tablespaces=0,marker={k:self.m[k] for k in ['kind','uuid','system_id','data','port','database']},listen=c.HOST,hba_file=str(Path(self.m['data'])/'pg_hba.conf'),hba_errors=0,trust_rules=0))
  return '17.11'
 def test_manifest_roundtrip(self):self.assertEqual(c.load(Path(self.m['root'])/'manifest.json'),self.m)
 def test_port_5432_refused(self):
  self.m['port']=5432;c.save(self.m);self.fail(lambda:c.load(Path(self.m['root'])/'manifest.json'))
 def test_operational_database_refused(self):
  self.m['database']='sentinela_dev_operacional';c.save(self.m);self.fail(lambda:c.load(Path(self.m['root'])/'manifest.json'))
 def test_remote_host_refused(self):
  self.m['host']='db.example.invalid';c.save(self.m);self.fail(lambda:c.load(Path(self.m['root'])/'manifest.json'))
 def test_wrong_uuid_refused(self):
  self.m['uuid']=str(uuid.uuid4());c.save(self.m);self.fail(lambda:c.load(Path(self.m['root'])/'manifest.json'))
 def test_invalid_manifest(self):
  self.m['kind']='other';c.save(self.m);self.fail(lambda:c.load(Path(self.m['root'])/'manifest.json'))
 def test_wrong_path(self):
  self.m['data']=str(self.base);c.save(self.m);self.fail(lambda:c.load(Path(self.m['root'])/'manifest.json'))
 def test_occupied_port_no_init(self):self.fail(lambda:c.prerequisites(self.fake,lambda:False));self.assertFalse(any(x[0]=='initdb' and '--version' not in x[1] for x in self.calls))
 def test_existing_data_refused(self):
  self.data();self.m['phase']='PREPARED'
  with patch.object(c,'prerequisites',lambda *a:None):self.fail(lambda:c.create(self.m,self.fake))
 def test_reparse_point_refused(self):
  st=type('Stat',(),{'st_file_attributes':0x400})()
  with patch.object(Path,'lstat',return_value=st),patch.object(Path,'exists',return_value=True),patch.object(Path,'is_symlink',return_value=False):self.fail(lambda:c.no_links(self.base))
 def test_symlink_refused(self):
  with patch.object(Path,'is_symlink',return_value=True):self.fail(lambda:c.no_links(self.base))
 def test_pid_mismatch_before_command(self):
  self.running();self.m['pid']=43
  self.fail(lambda:c.attest(self.m,'synthetic',run=self.fake,process_check=lambda *a:None));self.assertFalse(any(x[0]=='psql' for x in self.calls))
 def test_wrong_system_id(self):
  self.running();self.m['system_id']='999'
  self.fail(lambda:c.attest(self.m,'synthetic',run=self.fake,process_check=lambda *a:None))
 def test_process_identity_failure(self):
  self.running()
  def bad(*a):raise c.Refused('synthetic process mismatch')
  self.fail(lambda:c.attest(self.m,'synthetic',run=self.fake,process_check=bad));self.assertFalse(any(x[0]=='psql' for x in self.calls))
 def test_server_identity_failure(self):
  self.running()
  def wrong(exe,args,**kw):
   out=self.fake(exe,args,**kw)
   if exe=='psql':v=json.loads(out);v['port']=5432;return json.dumps(v)
   return out
  self.fail(lambda:c.attest(self.m,'synthetic',run=wrong,process_check=lambda *a:None))
 def test_configuration_tamper(self):
  self.running();(Path(self.m['data'])/'pg_hba.conf').write_text('trust')
  self.fail(lambda:c.attest(self.m,'synthetic',run=self.fake,process_check=lambda *a:None))
 def test_install_failure_preserves_evidence_and_stops(self):
  self.running()
  def bad(exe,args,**kw):
   if exe=='psql' and '-f' in args:raise c.Refused('synthetic SQL failure')
   return self.fake(exe,args,**kw)
  self.fail(lambda:c.install(self.m,'synthetic',run=bad,process_check=lambda *a:None));self.assertEqual(c.load(Path(self.m['root'])/'manifest.json')['phase'],'FAILED');self.assertTrue(Path(self.m['data']).exists())
 def test_start_failure_no_cleanup(self):
  self.data()
  def bad(exe,args,**kw):
   if exe=='pg_ctl':raise c.Refused('synthetic startup failure')
   return self.fake(exe,args,**kw)
  self.fail(lambda:c.start(self.m,'synthetic',run=bad,probe=lambda:True,process_check=lambda *a:None));self.assertTrue(Path(self.m['data']).exists());self.assertEqual(self.m['phase'],'START_FAILED')
 def test_create_failure_no_retry(self):
  def bad(*a,**kw):raise c.Refused('synthetic initdb failure')
  with patch.object(c,'prerequisites',lambda *a:None):self.fail(lambda:c.create(self.m,bad))
  self.assertEqual(self.m['phase'],'FAILED')
 def test_discard_requires_uuid_and_stopped(self):
  self.running();self.fail(lambda:c.discard(self.m,'wrong',run=self.fake));self.fail(lambda:c.discard(self.m,self.m['uuid'],run=self.fake))
 def test_discard_external_tablespace(self):
  self.data();self.m['phase']='STOPPED';c.save(self.m);(Path(self.m['data'])/'pg_tblspc'/'external').write_text('synthetic')
  self.fail(lambda:c.discard(self.m,self.m['uuid'],run=self.fake,probe=lambda:True));self.assertTrue(Path(self.m['data']).exists())
 def test_validated_discard_only_synthetic_data(self):
  self.data();self.m['phase']='STOPPED';c.save(self.m);keep=Path(self.m['root'])/'evidence/result.json';keep.write_text('synthetic')
  c.discard(self.m,self.m['uuid'],run=self.fake,probe=lambda:True)
  self.assertFalse(Path(self.m['data']).exists());self.assertTrue(keep.exists());self.assertEqual(c.load(Path(self.m['root'])/'manifest.json')['phase'],'DISCARDED')
 def test_recovery_corrupt_backup_stops_before_tools(self):
  p=Path(self.m['root'])/'evidence'/('backup-'+str(uuid.uuid4())+'.dump');p.write_bytes(b'synthetic');r=p.with_suffix('.json');r.write_text(json.dumps({'file':p.name,'bytes':9,'sha256':'wrong'}))
  self.fail(lambda:c.verify_backup(self.m,r,run=self.fake));self.assertEqual(self.calls,[])
 def test_recovery_parser_failure_does_not_restore(self):
  p=Path(self.m['root'])/'evidence'/('backup-'+str(uuid.uuid4())+'.dump');p.write_bytes(b'synthetic');r=p.with_suffix('.json');r.write_text(json.dumps({'file':p.name,'bytes':9,'sha256':c.digest(p)}))
  def bad(exe,args,**kw):self.assertEqual(exe,'pg_restore');self.assertNotIn('-d',args);raise c.Refused('synthetic unreadable archive')
  self.fail(lambda:c.verify_backup(self.m,r,run=bad));self.assertTrue(p.exists())
 def test_no_execute_flag_no_process(self):
  with patch.object(sys,'argv',['control.py','create']):self.fail(c.main)
 def test_environment_never_reuses_administrative_credentials(self):
  with patch.dict(c.os.environ,{'PGPASSWORD':'synthetic','PGHOST':'remote','PGSERVICE':'other'}):
   e=c.environment();self.assertNotIn('PGPASSWORD',e);self.assertNotIn('PGHOST',e);self.assertNotIn('PGSERVICE',e)
 def test_incomplete_comparison_refused(self):self.fail(lambda:c.compare({'catalog':{},'extra':{'database':'x','ledger':[]}}, {'catalog':{},'extra':{'database':'x','ledger':[]}}))
 def comparison_pair(self):
  catalog={k:[] for k in ['tables','columns','constraints','domains','indexes','triggers','functions','policies','table_external_acl','function_external_acl','schema_external_acl']}
  catalog.update(tables=[[str(i),True,True] for i in range(19)],indexes=[['index','definition',True,True]]*77,triggers=[['table','trigger','definition','O']]*55,functions=[['function','','definition',False,None]]*17,constraints=[['table','pk','p','definition',True,False,False]]*19+[['table','fk','f','definition',True,False,False]]*34+[['table','check','c','definition',False,False,False]]*2,policies=[{'policyname':str(i),'qual':"source='SYNTHETIC'",'cmd':'SELECT','roles':[c.ROLE],'permissive':'PERMISSIVE'} for i in range(6)],schema_external_acl=[[c.ROLE,'USAGE']])
  extra={k:[] for k in ['column_grants','database_acl','default_acl','column_collation','memberships','schema_config','object_acl','function_acl']}
  grants=json.loads((c.REPO/'database/local/security-spec.json').read_text())['grants']
  extra.update(snapshot_version=2,encoding='UTF8',locale={'datcollate':'Portuguese_Brazil.1252','datctype':'Portuguese_Brazil.1252','datlocprovider':'c','datlocale':None},postgis=['3.6.2','extensions'],database='sentinela_dev_operacional',identity={'host':c.HOST,'port':5432,'system_id':'900','sandbox_uuid':None,'data':str(self.base/'operational'),'server_version_num':170011,'user':'postgres'},column_grants=[list((t,col,c.ROLE,'SELECT',False)) for t,cols in grants.items() for col in cols],roles=[[c.ROLE,True,False,False,False,False,False,False,5,None]],ledger=[{'versao':v,'descricao':v,'aplicado_em':'time1'} for v in ['0001','0002','0003','0004','0005','local-read-0001']])
  a={'catalog':catalog,'extra':extra};b=copy.deepcopy(a);b['extra']['database']=c.DB;b['extra']['identity'].update(port=c.PORT,system_id=self.m['system_id'] or '123456',sandbox_uuid=self.m['uuid'],data=self.m['data']);return a,b
 def test_comparison_full_definitions_and_timestamp_normalization(self):
  a,b=self.comparison_pair();b['extra']['database']=c.DB;b['extra']['ledger'][0]['aplicado_em']='different';c.compare(a,b)
 def test_comparison_policy_expression_drift(self):
  a,b=self.comparison_pair();b['catalog']['policies'][0]['qual']='true';self.fail(lambda:c.compare(a,b))
 def test_comparison_column_definition_drift(self):
  a,b=self.comparison_pair();b['catalog']['columns']=[['column','integer',False]];self.fail(lambda:c.compare(a,b))
 def test_comparison_column_grant_drift(self):
  a,b=self.comparison_pair();b['extra']['column_grants']=copy.deepcopy(b['extra']['column_grants']);b['extra']['column_grants'][0]=['table','column','PUBLIC','SELECT',False];self.fail(lambda:c.compare(a,b))
 def test_comparison_ledger_description_drift(self):
  a,b=self.comparison_pair();b['extra']['ledger'][0]['descricao']='different';self.fail(lambda:c.compare(a,b))
 def test_comparison_collation_drift(self):
  a,b=self.comparison_pair();b['extra']['locale']=['other','other'];self.fail(lambda:c.compare(a,b))
 def test_stop_verifies_identity_before_any_stop(self):
  self.running();self.m['pid']=99;self.fail(lambda:c.stop(self.m,'synthetic',run=self.fake,probe=lambda:True,process_check=lambda *a:None));self.assertFalse(any(x[0]=='pg_ctl' for x in self.calls))
 def test_discard_refuses_busy_port(self):
  self.data();self.m['phase']='STOPPED';c.save(self.m);self.fail(lambda:c.discard(self.m,self.m['uuid'],run=self.fake,probe=lambda:False));self.assertTrue(Path(self.m['data']).exists())
 def test_backup_path_escape(self):
  self.fail(lambda:c.verify_backup(self.m,self.base/'outside.json',run=self.fake));self.assertEqual(self.calls,[])
 def test_runner_uses_authenticated_role_and_reports_each_scenario(self):
  self.running();self.m['phase']='FIXTURES';c.save(self.m);a,b=self.comparison_pair();seen=[]
  def sql(m,password,**kw):
   if kw.get('file').name in ['rls.sql','permissions.sql']:self.assertEqual(kw['role'],c.ROLE)
   seen.append(kw.get('file').name);return ''
  with patch.object(c,'snapshot',return_value=b),patch.object(c,'psql',side_effect=sql),patch.object(c,'refusal',lambda args,pw:self.assertEqual(args[args.index('-p')+1],'55432')):
   report=c.test(self.m,'synthetic-admin','synthetic-reader',a,run=self.fake,process_check=lambda *a:None)
  self.assertEqual(len(report),7);self.assertEqual(self.m['phase'],'TESTED');self.assertIn('rls.sql',seen)
  result=json.loads((Path(self.m['root'])/'evidence/test-report.json').read_text());self.assertEqual(result['result'],'PASS')
 def test_runner_failure_stops_and_preserves_sanitized_report(self):
  self.running();self.m['phase']='FIXTURES';a,b=self.comparison_pair()
  def bad(*args,**kw):raise c.Refused('synthetic-secret-never-logged')
  with patch.object(c,'snapshot',return_value=b),patch.object(c,'psql',side_effect=bad):self.fail(lambda:c.test(self.m,'synthetic','synthetic',a,run=self.fake,process_check=lambda *a:None))
  text=(Path(self.m['root'])/'evidence/test-report.json').read_text();self.assertNotIn('synthetic-secret',text);self.assertEqual(json.loads(text)['result'],'FAIL')
 def test_configure_reader_cli_keeps_password_out_of_arguments(self):
  self.running();self.m['phase']='INSTALLED';c.save(self.m);seen=[]
  def fake(exe,args,**kw):
   self.assertTrue(all(isinstance(a,str) for a in args));self.assertFalse(any('synthetic-password' in a for a in args));seen.append(exe);return ''
  with patch.object(c,'attest',return_value=(42,1000)),patch.object(c,'secret',return_value='synthetic-password'),patch.object(c,'process',side_effect=fake),patch.object(sys,'argv',['control.py','configure-reader','--execute','--manifest',str(Path(self.m['root'])/'manifest.json')]):c.main()
  self.assertEqual(seen,['psql'])
 def test_psql_cannot_override_database_to_operational(self):
  self.fail(lambda:c.psql(self.m,'synthetic',sql='SELECT 1',database='sentinela_dev_operacional',run=self.fake));self.assertEqual(self.calls,[])
 def test_dangling_data_link_refused_before_initdb(self):
  original=c.no_links
  def guard(p,*args):
   if Path(p)==Path(self.m['data']):raise c.Refused('synthetic dangling link')
   return original(p,*args)
  with patch.object(c,'prerequisites',lambda *a:None),patch.object(c,'no_links',side_effect=guard):self.fail(lambda:c.create(self.m,self.fake))
  self.assertFalse(any(x[0]=='initdb' for x in self.calls))
 def fake_launch(self,exe,args,**kw):
  if exe=='pg_ctl':
   (Path(self.m['data'])/'postmaster.pid').write_text('42\n'+self.m['data']+'\n1000\n55432\n')
  return self.fake(exe,args,**kw)
 def test_start_success_attestation_manifest_and_progress(self):
  self.data();events=[]
  c.start(self.m,'synthetic-password',run=self.fake_launch,probe=lambda:True,process_check=lambda *a:None,ready=lambda:True,report=events.append)
  self.assertEqual(self.m['phase'],'RUNNING');self.assertEqual(self.m['pid'],42)
  self.assertEqual(events,['PG_CTL_STARTED','PG_CTL_RETURNED','WAITING_READY','PORT_READY','IDENTITY_CHECK','HBA_CHECK','SERVER_ATTESTED','MANIFEST_UPDATED','START_COMPLETE'])
  self.assertEqual(c.load(Path(self.m['root'])/'manifest.json')['phase'],'RUNNING')
  text=next((Path(self.m['root'])/'evidence').glob('start-*.json')).read_text();self.assertNotIn('synthetic-password',text)
 def test_start_then_attestation_failure_does_not_stop(self):
  self.data()
  def bad(exe,args,**kw):
   out=self.fake_launch(exe,args,**kw)
   if exe=='psql':raise c.Refused('synthetic failed identity')
   return out
  self.fail(lambda:c.start(self.m,'synthetic',run=bad,probe=lambda:False if (Path(self.m['data'])/'postmaster.pid').exists() else True,process_check=lambda *a:None,ready=lambda:True,report=lambda *a:None))
  self.assertEqual(self.m['phase'],'ATTESTATION_FAILED');self.assertTrue((Path(self.m['data'])/'postmaster.pid').exists())
  self.assertEqual(self.m['last_start']['server_observation']['state'],'PROCESS_PRESENT_UNATTESTED')
  self.assertFalse(any('stop' in args or 'kill' in args for exe,args in self.calls))
 def test_start_readiness_timeout_does_not_assume_stopped(self):
  self.data();self.fail(lambda:c.start(self.m,'synthetic',run=self.fake_launch,probe=lambda:False if (Path(self.m['data'])/'postmaster.pid').exists() else True,ready=lambda:False,process_check=lambda *a:None,report=lambda *a:None))
  self.assertEqual(self.m['phase'],'START_FAILED');self.assertEqual(self.m['last_start']['server_observation']['state'],'PROCESS_PRESENT_UNATTESTED')
 def test_start_ctrl_c_records_unknown_and_preserves_server(self):
  self.data()
  def interrupt(exe,args,**kw):
   if exe=='pg_ctl':raise KeyboardInterrupt()
   return self.fake(exe,args,**kw)
  with self.assertRaises(KeyboardInterrupt):c.start(self.m,'synthetic',run=interrupt,probe=lambda:False if self.calls else True,process_check=lambda *a:None,report=lambda *a:None)
  self.assertEqual(self.m['phase'],'START_UNKNOWN');self.assertEqual(self.m['last_start']['server_observation']['state'],'UNKNOWN')
 def test_start_pid_mismatch_during_attestation(self):
  self.data()
  def bad(exe,args,**kw):
   out=self.fake_launch(exe,args,**kw)
   if exe=='psql':v=json.loads(out);v['pid']=99;return json.dumps(v)
   return out
  self.fail(lambda:c.start(self.m,'synthetic',run=bad,probe=lambda:True,ready=lambda:True,process_check=lambda *a:None,report=lambda *a:None))
  self.assertEqual(self.m['phase'],'ATTESTATION_FAILED')
 def test_start_busy_port_no_process_launched(self):
  self.data();self.fail(lambda:c.start(self.m,'synthetic',run=self.fake_launch,probe=lambda:False));self.assertEqual(self.calls,[]);self.assertEqual(self.m['phase'],'CREATED')
 def test_start_existing_pid_file_no_duplicate(self):
  self.running();self.m['phase']='CREATED';self.fail(lambda:c.start(self.m,'synthetic',run=self.fake_launch,probe=lambda:True));self.assertEqual(self.calls,[])
 def test_pgctl_output_is_regular_file_not_pipe(self):
  seen={}
  class Child:
   def wait(child,timeout):seen['timeout']=timeout;return 0
   def communicate(child,*a,**kw):raise AssertionError('Pipe drain must never be used')
   def kill(child):raise AssertionError('Must not kill server tree')
  def launch(args,**kw):
   self.assertNotEqual(kw['stdout'],subprocess.PIPE);self.assertEqual(kw['stderr'],kw['stdout']);self.assertTrue(kw['close_fds']);self.assertNotIn('PGPASSWORD',kw['env'])
   kw['stdout'].write(b'synthetic pg_ctl output');return Child()
  with patch.object(c.subprocess,'Popen',side_effect=launch):out=c.process('pg_ctl',['--version'],password='synthetic-secret')
  self.assertEqual(out,'synthetic pg_ctl output');self.assertEqual(seen['timeout'],45)
 def test_descendant_inherited_file_does_not_need_eof(self):
  child_handle=[]
  class Child:
   def wait(child,timeout):return 0
   def communicate(child,*a,**kw):raise AssertionError('Would wait for inherited pipe EOF')
  def launch(args,**kw):
   import os
   child_handle.append(os.dup(kw['stdout'].fileno()));kw['stdout'].write(b'parent exited');return Child()
  try:
   with patch.object(c.subprocess,'Popen',side_effect=launch):self.assertEqual(c.process('pg_ctl',['--version']),'parent exited')
   self.assertTrue(child_handle)
  finally:
   import os
   for fd in child_handle:os.close(fd)
 def test_pgctl_timeout_never_kills_or_communicates(self):
  class Child:
   def wait(child,timeout):raise subprocess.TimeoutExpired('synthetic',timeout)
   def communicate(child,*a,**kw):raise AssertionError('No pipe drainage')
   def kill(child):raise AssertionError('No automatic kill')
  with patch.object(c.subprocess,'Popen',return_value=Child()):
   with self.assertRaises(c.ProcessFailure):c.process('pg_ctl',['start'])
 def test_pgctl_ctrl_c_never_kills(self):
  class Child:
   def wait(child,timeout):raise KeyboardInterrupt()
   def kill(child):raise AssertionError('No automatic kill')
  with patch.object(c.subprocess,'Popen',return_value=Child()):
   with self.assertRaises(KeyboardInterrupt):c.process('pg_ctl',['start'])
 def test_auxiliary_timeouts_are_bounded(self):
  def command(*args,**kw):
   self.assertEqual(kw['timeout'],10);raise subprocess.TimeoutExpired('synthetic',10)
  with patch.object(c.subprocess,'run',side_effect=command):
   with self.assertRaises(c.ProcessFailure):c.process('pg_controldata',['synthetic'])
 def test_observation_unknown_on_invalid_pid(self):
  self.running();(Path(self.m['data'])/'postmaster.pid').write_text('invalid');self.assertEqual(c.observed_server(self.m,lambda:False,lambda *a:None)['state'],'UNKNOWN')
 def test_approve_controller_requires_review_and_keeps_phase(self):
  self.data();key='database/local/sandbox/control.py';self.m['artifacts'][key]='0'*64;c.save(self.m)
  result=c.approve_controller(self.m,'0'*64,c.digest(c.HERE/'control.py'),self.m['uuid'],run=self.fake,probe=lambda:True)
  self.assertEqual(result['phase'],'CREATED');self.assertEqual(result['system_id'],self.m['system_id']);self.assertEqual(len(result['controller_approvals']),1)
 def test_approve_controller_refuses_wrong_review(self):
  self.data();self.fail(lambda:c.approve_controller(self.m,'0'*64,'1'*64,self.m['uuid'],run=self.fake,probe=lambda:True));self.assertNotIn('controller_approvals',c.load(Path(self.m['root'])/'manifest.json'))
 def test_start_pgctl_timeout_free_port_still_unknown(self):
  self.data()
  def timeout(exe,args,**kw):
   if exe=='pg_ctl':raise c.ProcessFailure('pg_ctl','timeout; server state unknown')
   return self.fake(exe,args,**kw)
  self.fail(lambda:c.start(self.m,'synthetic',run=timeout,probe=lambda:True,process_check=lambda *a:None,report=lambda *a:None))
  self.assertEqual(self.m['last_start']['server_observation']['state'],'UNKNOWN');self.assertTrue(self.m['last_start']['server_observation']['pg_ctl_may_still_be_running'])
 def installation_pair(self):
  a,b=self.comparison_pair();b['extra']['roles'][0][1]=False;m=copy.deepcopy(self.m);m.update(phase='INSTALLED',system_id=b['extra']['identity']['system_id']);return a,b,m
 def test_installation_accepts_only_identified_nologin(self):
  a,b,m=self.installation_pair();c.compare(a,b,role_mode='installation-nologin',sandbox=m);self.assertFalse(b['extra']['roles'][0][1])
 def test_installation_requires_manifest(self):
  a,b,m=self.installation_pair();self.fail(lambda:c.compare(a,b,role_mode='installation-nologin'))
 def test_installation_requires_completed_install_phase(self):
  a,b,m=self.installation_pair();m['phase']='RUNNING';self.fail(lambda:c.compare(a,b,role_mode='installation-nologin',sandbox=m))
 def test_installation_refuses_manifest_uuid_drift(self):
  a,b,m=self.installation_pair();m['uuid']=str(uuid.uuid4());self.fail(lambda:c.compare(a,b,role_mode='installation-nologin',sandbox=m))
 def test_installation_refuses_manifest_system_id_drift(self):
  a,b,m=self.installation_pair();m['system_id']='999';self.fail(lambda:c.compare(a,b,role_mode='installation-nologin',sandbox=m))
 def test_installation_does_not_accept_login_target(self):
  a,b,m=self.installation_pair();b['extra']['roles'][0][1]=True;self.fail(lambda:c.compare(a,b,role_mode='installation-nologin',sandbox=m))
 def test_strict_mode_rejects_nologin(self):
  a,b,m=self.installation_pair();self.fail(lambda:c.compare(a,b))
 def test_reference_must_retain_login(self):
  a,b,m=self.installation_pair();a['extra']['roles'][0][1]=False;self.fail(lambda:c.compare(a,b,role_mode='installation-nologin',sandbox=m))
 def test_admin_attributes_refused_even_if_both_snapshots_match(self):
  for i in range(2,8):
   with self.subTest(attribute=i):
    a,b,m=self.installation_pair();a['extra']['roles'][0][i]=b['extra']['roles'][0][i]=True;self.fail(lambda:c.compare(a,b,role_mode='installation-nologin',sandbox=m))
 def test_unexpected_role_config_or_connections(self):
  for i,v in [(8,10),(9,['search_path=public'])]:
   a,b,m=self.installation_pair();b['extra']['roles'][0][i]=v;self.fail(lambda:c.compare(a,b,role_mode='installation-nologin',sandbox=m))
 def test_wrong_role_name(self):
  a,b,m=self.installation_pair();b['extra']['roles'][0][0]='other';self.fail(lambda:c.compare(a,b,role_mode='installation-nologin',sandbox=m))
 def test_memberships_refused(self):
  a,b,m=self.installation_pair();a['extra']['memberships']=b['extra']['memberships']=[['postgres',c.ROLE,False,True,False]];self.fail(lambda:c.compare(a,b,role_mode='installation-nologin',sandbox=m))
 def test_unapproved_extra_grant_on_both_sides(self):
  a,b,m=self.installation_pair();extra=['ocorrencias','id',c.ROLE,'UPDATE',False];a['extra']['column_grants'].append(extra);b['extra']['column_grants'].append(extra);self.fail(lambda:c.compare(a,b,role_mode='installation-nologin',sandbox=m))
 def test_future_object_grants_refused(self):
  a,b,m=self.installation_pair();a['extra']['default_acl']=b['extra']['default_acl']=[['postgres','sentinela','r',c.ROLE,'SELECT',False]];self.fail(lambda:c.compare(a,b,role_mode='installation-nologin',sandbox=m))
 def test_schema_create_privilege_refused(self):
  a,b,m=self.installation_pair();a['extra']['schema_config']=b['extra']['schema_config']=[['sentinela','postgres',c.ROLE,'CREATE',False]];self.fail(lambda:c.compare(a,b,role_mode='installation-nologin',sandbox=m))
 def test_locale_provider_and_encoding_drift(self):
  for key,value in [('encoding','LATIN1'),('locale',{'datcollate':'C','datctype':'C','datlocprovider':'c','datlocale':None})]:
   a,b=self.comparison_pair();b['extra'][key]=value;self.fail(lambda:c.compare(a,b))
 def test_provider_specific_locale_still_compared(self):
  a,b=self.comparison_pair()
  for side in [a,b]:side['extra']['locale'].update(datlocprovider='i',datlocale='pt-BR')
  c.compare(a,b);b['extra']['locale']['datlocale']='en-US';self.fail(lambda:c.compare(a,b))
 def test_old_snapshot_contract_rejected(self):
  a,b=self.comparison_pair();b['extra']['snapshot_version']=1;self.fail(lambda:c.compare(a,b))
 def test_endpoint_and_shared_cluster_rejected(self):
  for key,value in [('port',5432),('host','remote.invalid'),('system_id','900')]:
   a,b=self.comparison_pair();b['extra']['identity'][key]=value;self.fail(lambda:c.compare(a,b))
 def test_role_exception_does_not_hide_policy_changes(self):
  a,b,m=self.installation_pair();b['catalog']['policies'][0]['qual']='true';self.fail(lambda:c.compare(a,b,role_mode='installation-nologin',sandbox=m))
 def test_invalid_indexes_security_definer_and_rls_rejected(self):
  for section,index,value in [('indexes',2,False),('functions',3,True),('tables',2,False),('triggers',3,'D')]:
   a,b=self.comparison_pair();b['catalog'][section][0]=list(b['catalog'][section][0]);b['catalog'][section][0][index]=value;self.fail(lambda:c.compare(a,b))
 def review_plan(self):
  self.running();names=['database/local/sandbox/control.py','database/local/sandbox/sql/snapshot_extra.sql'];changes=[]
  for i,name in enumerate(names):
   self.m['artifacts'][name]=str(i)*64;changes.append({'artifact':name,'old_sha256':str(i)*64,'new_sha256':c.digest(c.REPO/name)})
  c.save(self.m)
  plan=Path(self.m['root'])/'review.json';plan.write_text(json.dumps({'uuid':self.m['uuid'],'system_id':self.m['system_id'],'manifest_sha256':c.digest(Path(self.m['root'])/'manifest.json'),'changes':changes}))
  return plan
 def approve(self,plan):return c.approve_artifacts(self.m,plan,c.digest(plan),self.m['uuid'],'synthetic-password',run=self.fake,process_check=lambda *a:None)
 def mutate_plan(self,p,change):
  v=json.loads(p.read_text());change(v);p.write_text(json.dumps(v))
 def test_restricted_running_artifact_approval(self):
  p=self.review_plan();before=copy.deepcopy(self.m);result=self.approve(p)
  self.assertEqual(result['phase'],'RUNNING');self.assertEqual(result['system_id'],before['system_id']);self.assertEqual(result['pid'],before['pid']);self.assertEqual(result['runtime_files'],before['runtime_files']);self.assertEqual(len(result['artifact_approvals']),1)
  for file in (Path(self.m['root'])/'evidence').glob('artifact-approval-*.json'):self.assertNotIn('synthetic-password',file.read_text())
 def test_artifact_approval_uuid_mismatch(self):
  p=self.review_plan();self.mutate_plan(p,lambda v:v.update(uuid=str(uuid.uuid4())));self.fail(lambda:self.approve(p))
 def test_artifact_approval_system_id_mismatch(self):
  p=self.review_plan();self.mutate_plan(p,lambda v:v.update(system_id='999'));self.fail(lambda:self.approve(p))
 def test_artifact_approval_stale_manifest(self):
  p=self.review_plan();self.mutate_plan(p,lambda v:v.update(manifest_sha256='f'*64));self.fail(lambda:self.approve(p))
 def test_artifact_approval_old_and_new_hashes(self):
  p=self.review_plan();self.mutate_plan(p,lambda v:v['changes'][0].update(old_sha256='f'*64));self.fail(lambda:self.approve(p))
  self.mutate_plan(p,lambda v:v['changes'][0].update(old_sha256='0'*64,new_sha256='f'*64));self.fail(lambda:self.approve(p))
 def test_artifact_approval_scope_restricted(self):
  p=self.review_plan();self.mutate_plan(p,lambda v:v['changes'][0].update(artifact='database/supabase/baseline/0001_modelo_inicial.sql'));self.fail(lambda:self.approve(p))
 def test_artifact_approval_duplicate_entries(self):
  p=self.review_plan();self.mutate_plan(p,lambda v:v['changes'].__setitem__(1,copy.deepcopy(v['changes'][0])));self.fail(lambda:self.approve(p))
 def test_artifact_approval_unlisted_change(self):
  p=self.review_plan();self.mutate_plan(p,lambda v:v['changes'].pop());self.fail(lambda:self.approve(p))
 def test_artifact_approval_plan_hash_mismatch(self):
  p=self.review_plan();self.fail(lambda:c.approve_artifacts(self.m,p,'f'*64,self.m['uuid'],'synthetic',run=self.fake,process_check=lambda *a:None))
 def test_artifact_approval_stopped_manifest_refused(self):
  p=self.review_plan();self.m['phase']='STOPPED';c.save(self.m);self.mutate_plan(p,lambda v:v.update(manifest_sha256=c.digest(Path(self.m['root'])/'manifest.json')));self.fail(lambda:self.approve(p))
 def test_artifact_approval_bad_identity_does_not_write(self):
  p=self.review_plan();before=c.digest(Path(self.m['root'])/'manifest.json')
  with patch.object(c,'attest',side_effect=c.Refused('synthetic failed identity')):self.fail(lambda:self.approve(p))
  self.assertEqual(c.digest(Path(self.m['root'])/'manifest.json'),before);self.assertEqual(list((Path(self.m['root'])/'evidence').glob('artifact-approval-*')),[])
 def test_pg17_locale_sql_uses_catalog_not_old_gucs(self):
  sql=(c.HERE/'sql/snapshot_extra.sql').read_text()
  for word in ['pg_catalog.pg_database','datcollate','datctype','datlocprovider','datlocale','pg_catalog.pg_encoding_to_char','current_database()']:self.assertIn(word,sql)
  self.assertNotIn("current_setting('lc_collate'",sql);self.assertNotIn("current_setting('lc_ctype'",sql)
 def test_all_sql_guards_and_expected_extra_fixture(self):
  expected=json.loads((c.HERE/'expected.json').read_text());self.assertEqual(expected['fixture_rows'],20);self.assertIn('40000000-0000-4000-8000-000000000005',expected['tables']['mapeamentos_natureza']['invisible_ids'])
  guard=(c.HERE/'sql/guard.sql').read_text();self.assertIn('pg_control_system()',guard);self.assertIn('pg_read_file',guard);self.assertIn('inet_server_port()=55432',guard)
  for n in ['baseline.sql','role.sql','read_only.sql','fixtures.sql','postgis.sql','configure_reader.sql']:self.assertTrue((c.HERE/'sql'/n).read_text().startswith('\\ir guard.sql'))

if __name__=='__main__':unittest.main()
