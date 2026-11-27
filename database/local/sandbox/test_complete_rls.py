"""No PostgreSQL execution: generated secret transport and opt-in guards."""
import hashlib
import hmac
import base64
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
import complete_rls as r


class CompletionTests(unittest.TestCase):
    def test_scram_verifier_matches_password_and_individual_salt(self):
        password='synthetic-only-password'
        v=r.verifier(password,b'0123456789abcdef')
        self.assertNotIn(password,v)
        head,parameters,keys=v.split('$')
        self.assertEqual(head,'SCRAM-SHA-256')
        iterations,salt=parameters.split(':')
        salted=hashlib.pbkdf2_hmac('sha256',password.encode(),base64.b64decode(salt),int(iterations))
        stored,server=map(base64.b64decode,keys.split(':'))
        self.assertEqual(stored,hashlib.sha256(hmac.digest(salted,b'Client Key','sha256')).digest())
        self.assertEqual(server,hmac.digest(salted,b'Server Key','sha256'))
        self.assertNotEqual(r.verifier(password),r.verifier(password))

    def test_initdb_secret_private_exclusive_removed_not_args_or_env(self):
        seen={}
        def run(args,**kw):
            seen.update(args=args,**kw)
            return type('Result',(),dict(returncode=0,stdout='',stderr=''))()
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(r.c,'BASE',Path(temp)),patch.object(r.subprocess,'run',side_effect=run):r.SecureRun('synthetic-only')('initdb',['-D',str(Path(temp)/'data'),'-W'],console=True)
            self.assertEqual(list(Path(temp).glob('*.secret')),[])
        self.assertTrue(any(x.startswith('--pwfile=') for x in seen['args']));self.assertNotIn('-W',seen['args'])
        self.assertNotIn('synthetic-only',str(seen['args']))
        self.assertNotIn('PGPASSWORD',seen['env'])

    def test_failed_subprocess_never_repeats_raw_secret(self):
        result=type('Result',(),dict(returncode=1,stdout='',stderr='ERROR: 42501 synthetic-only'))()
        with patch.object(r.subprocess,'run',return_value=result):
            with self.assertRaises(r.c.Refused) as error:r.SecureRun('synthetic-only')('psql',[],password='synthetic-only')
        self.assertNotIn('synthetic-only',str(error.exception));self.assertIn('42501',str(error.exception))

    def test_requires_execute_before_any_read_or_write(self):
        with patch('sys.argv',['complete_rls.py']),patch.object(r,'operational_snapshot',side_effect=AssertionError('No action')):
            with self.assertRaises(r.c.Refused):r.main()

    def test_ipv6_refusal_requires_no_listener_not_merely_auth_error(self):
        args=['-h','::1','-p','55432']
        result=type('Result',(),dict(returncode=1,stderr='connection refused'))()
        with patch.object(r.c.subprocess,'run',return_value=result),patch.object(r.c.socket,'socket') as sock:
            sock.return_value.__enter__.return_value.connect_ex.return_value=10061
            r.c.refusal(args,'synthetic')
            sock.return_value.__enter__.return_value.connect_ex.return_value=0
            with self.assertRaises(r.c.Refused):r.c.refusal(args,'synthetic')

    def test_windows_wouldblock_requires_independent_listener_proof(self):
        failed=type('Result',(),dict(returncode=1,stderr='connection failed'))()
        proof=type('Result',(),dict(returncode=0,stdout='{"ipv6":0,"ipv4":1}'))()
        with patch.object(r.c.subprocess,'run',side_effect=[failed,proof]),patch.object(r.c.socket,'socket') as sock:
            sock.return_value.__enter__.return_value.connect_ex.return_value=10035
            r.c.refusal(['-h','::1','-p','55432'],'synthetic')

    def test_windows_wouldblock_with_ipv6_listener_is_failure(self):
        failed=type('Result',(),dict(returncode=1,stderr='connection failed'))()
        proof=type('Result',(),dict(returncode=0,stdout='{"ipv6":1,"ipv4":1}'))()
        with patch.object(r.c.subprocess,'run',side_effect=[failed,proof]),patch.object(r.c.socket,'socket') as sock:
            sock.return_value.__enter__.return_value.connect_ex.return_value=10035
            with self.assertRaises(r.c.Refused):r.c.refusal(['-h','::1','-p','55432'],'synthetic')


if __name__=='__main__':unittest.main()
