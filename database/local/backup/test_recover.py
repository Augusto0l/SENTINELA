import copy
import json
from pathlib import Path
import secrets
import subprocess
import unittest
from unittest.mock import patch,MagicMock
import recover as r

class RecoveryTests(unittest.TestCase):
    def identity(self):
        return dict(host='127.0.0.1',port=5432,database='sentinela_dev_operacional',executor='postgres',
          system_id=r.SYSTEM_ID,readonly='on',bypass=True,rls_active=False,version='17.11',postgis='3.6.2',
          locale=dict(provider='c',collate='Portuguese_Brazil.1252',ctype='Portuguese_Brazil.1252',encoding='UTF8'))
    def fixture(self,content):
        p=Path('tmp')/('backup-test-'+secrets.token_hex(10));p.mkdir(parents=True)
        f=p/'synthetic.dump';f.write_bytes(content);return f
    def test_authorized_identity(self):
        r.check_source(self.identity(),'postgres')
    def test_wrong_endpoint_system_or_executor(self):
        for key,value in [('host','remote.invalid'),('port',55432),('database','postgres'),('system_id','0'),('executor','other')]:
            with self.subTest(key=key):
                i=self.identity();i[key]=value
                with self.assertRaises(RuntimeError):r.check_source(i,'postgres')
    def test_rls_filtered_account_cannot_make_complete_backup(self):
        for key,value in [('bypass',False),('rls_active',True),('readonly','off')]:
            i=self.identity();i[key]=value
            with self.assertRaises(RuntimeError):r.check_source(i,'postgres')
    def test_incompatible_version(self):
        i=self.identity();i['version']='18.0'
        with self.assertRaises(RuntimeError):r.check_source(i,'postgres')
    def test_missing_extension(self):
        i=self.identity();i['postgis']=None
        with self.assertRaises(RuntimeError):r.check_source(i,'postgres')
    def test_locale_not_silently_adapted(self):
        i=self.identity();i['locale']['provider']='i'
        with self.assertRaises(RuntimeError):r.check_source(i,'postgres')
    def test_missing_empty_wrong_hash_or_header(self):
        for content in [b'',b'INVALID']:
            f=self.fixture(content)
            with self.assertRaises(RuntimeError):r.validate_archive(f,r.digest(f),lambda *a:'')
        f=self.fixture(b'PGDMPsynthetic')
        with self.assertRaises(RuntimeError):r.validate_archive(f,'0'*64,lambda *a:'')
        with self.assertRaises(RuntimeError):r.validate_archive(f.parent/'absent.dump','0'*64,lambda *a:'')
    def test_archive_requires_toc_and_full_read(self):
        f=self.fixture(b'PGDMPsynthetic');calls=[]
        def run(exe,args):calls.append((exe,args));return 'synthetic toc'
        r.validate_archive(f,r.digest(f),run)
        self.assertEqual(calls[0][1][0],'--list');self.assertEqual(calls[1][1][:2],['--file','NUL'])
    def test_truncated_full_stream_failure_not_hidden(self):
        f=self.fixture(b'PGDMPsynthetic')
        def run(exe,args):
            if args[0]=='--file':raise RuntimeError('Synthetic incomplete stream')
            return 'TOC readable'
        with self.assertRaises(RuntimeError):r.validate_archive(f,r.digest(f),run)
    def test_role_adaptation_only_login_and_no_acl_drift(self):
        a={'identity':{},'reader':{'login':True,'bypassrls':False},'tables':[['table','postgres',True,True,[['reader','SELECT']]]]}
        b=copy.deepcopy(a);b['reader']['login']=False
        self.assertEqual(r.compare_metadata(a,b),[])
        b['reader']['bypassrls']=True;self.assertIn('reader_attributes',r.compare_metadata(a,b))
        b=copy.deepcopy(a);b['tables'][0][4].append(['reader','INSERT']);self.assertIn('tables',r.compare_metadata(a,b))
    def test_permission_error_sanitized_no_secret_logged(self):
        child=MagicMock();child.pid=12345;child.returncode=1;child.communicate.return_value=('','ERROR: permission denied, SYNTHETIC_SECRET')
        commands=r.Commands()
        with patch.object(r.subprocess,'Popen',return_value=child):
            with self.assertRaises(RuntimeError) as error:commands.call('pg_restore',[],password='SYNTHETIC_SECRET')
        self.assertNotIn('SYNTHETIC_SECRET',str(error.exception));self.assertNotIn('SYNTHETIC_SECRET',json.dumps(commands.events))
        self.assertTrue(commands.events[0]['diagnostic']['permission_denied'])
    def test_timeout_or_interrupt_only_owned_utility_tree(self):
        for error in [subprocess.TimeoutExpired('synthetic',1),KeyboardInterrupt()]:
            child=MagicMock();child.pid=424242;child.communicate.side_effect=error
            with patch.object(r.subprocess,'Popen',return_value=child),patch.object(r.subprocess,'run') as kill:
                with self.assertRaises(RuntimeError):r.Commands().call('pg_restore',[])
                self.assertEqual(kill.call_args.args[0],['taskkill.exe','/PID','424242','/T','/F'])
    def test_bootstrap_password_only_in_private_pipe(self):
        pipe=MagicMock();pipe.name=r'\\.\pipe\synthetic-local';pipe.delivered=True;pipe.error=None
        commands=MagicMock();commands.call.return_value='ok'
        with patch.object(r,'PasswordPipe',return_value=pipe):
            r.bootstrap_runner(commands,'SYNTHETIC_SECRET')('initdb',['-D','synthetic-target','-W'])
        rendered=json.dumps(commands.call.call_args.args)
        self.assertNotIn('SYNTHETIC_SECRET',rendered);self.assertNotIn('-W',commands.call.call_args.args[1])
        self.assertIn('--pwfile='+pipe.name,commands.call.call_args.args[1]);pipe.close.assert_called_once()
    @unittest.skipUnless(r.os.name=='nt','Windows private pipe only')
    def test_actual_private_pipe_memory_delivery(self):
        secret='synthetic-'+secrets.token_hex(16);pipe=r.PasswordPipe(secret)
        try:
            with open(pipe.name,'rb') as f:self.assertEqual(f.readline().decode().strip(),secret)
            pipe.thread.join(timeout=2);self.assertTrue(pipe.delivered);self.assertIsNone(pipe.error)
        finally:pipe.close()

if __name__=='__main__':unittest.main(verbosity=2)
