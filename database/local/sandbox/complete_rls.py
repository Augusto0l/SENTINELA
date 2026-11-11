"""One-shot authorized RLS qualification in a NEW disposable cluster only.

Never recovers, replaces or deletes an existing cluster. initdb uses an exclusive
private bootstrap file removed in finally; encrypted verifier goes to psql stdin.
"""
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
from datetime import datetime, timezone
import control as c

OLD = 'a8aaa34d-98a0-43aa-9a15-ddbdf0dd375a'
CONTROL_HASH = 'ee4cf011654d35cba6467399a2dc9f4f27dbb31a80e4139678feef9e2c88ebea'
SNAPSHOT_HASH = '14a5df87024e068eb282e8ce199e79092c8114e3a0b8c6ec23d7cf67187ad82c'


def verifier(password, salt=None):
    salt=secrets.token_bytes(16) if salt is None else salt
    salted=hashlib.pbkdf2_hmac('sha256',password.encode('ascii'),salt,4096)
    client=hmac.digest(salted,b'Client Key','sha256')
    server=hmac.digest(salted,b'Server Key','sha256')
    enc=lambda x:base64.b64encode(x).decode('ascii')
    return 'SCRAM-SHA-256$4096:'+enc(salt)+'$'+enc(hashlib.sha256(client).digest())+':'+enc(server)


def operational_snapshot():
    # Separate explicitly read-only endpoint, no app .env and no inherited PG flags.
    env={k:v for k,v in os.environ.items() if not k.upper().startswith('PG')}
    env.update(PGCONNECT_TIMEOUT='4',PGCLIENTENCODING='UTF8',PGAPPNAME='sentinela-reference-read-only')
    def read(sql):
        p=subprocess.run([str(c.BIN/'psql.exe'),'-X','-w','-h','127.0.0.1','-p','5432','-U','postgres','-d','sentinela_dev_operacional','-v','ON_ERROR_STOP=1','-qAt'],
            input='BEGIN READ ONLY;\n'+sql+'\nROLLBACK;\n',env=env,capture_output=True,text=True,encoding='utf8',timeout=30)
        c.require(p.returncode==0,'Operational read-only reference unavailable; no password fallback')
        return json.loads(p.stdout)
    i=read("SELECT json_build_array(current_database(),host(inet_server_addr()),inet_server_port(),current_setting('server_version_num'),(SELECT system_identifier::text FROM pg_control_system()));")
    c.require(i==['sentinela_dev_operacional','127.0.0.1',5432,'170011','7702156035351602692'],'Operational reference identity mismatch')
    snap={'catalog':read((c.REPO/'database/supabase/tests/catalog_snapshot.sql').read_text()),
          'extra':read((c.HERE/'sql/snapshot_extra.sql').read_text())}
    parts=[]
    for table,*_ in snap['catalog']['tables']:
        c.require(re.fullmatch('[a-z_]+',table),'Unexpected operational identifier')
        parts.append("SELECT jsonb_build_object('table','"+table+"','rows',count(*),'fingerprint',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),''))) AS x FROM sentinela."+table+' t')
    fingerprints=read("SELECT jsonb_agg(x ORDER BY x->>'table') FROM ("+' UNION ALL '.join(parts)+') AS inventory;')
    return snap,fingerprints


class SecureRun:
    def __init__(self,password):self.password=password;self.last_failure=None
    def __call__(self,exe,args,password=None,console=False):
        if exe=='initdb' and console:
            root=Path(args[args.index('-D')+1]).parent;c.no_links(root)
            c.require(root.is_relative_to(c.BASE.resolve()),'Bootstrap secret outside private sandbox')
            secret=root/('bootstrap-'+secrets.token_hex(16)+'.secret')
            try:
                with secret.open('x',encoding='ascii') as f:f.write(self.password+'\n')
                safe=[a for a in args if a!='-W']+['--pwfile='+str(secret)]
                p=subprocess.run([str(c.BIN/'initdb.exe'),*map(str,safe)],
                    env=c.environment(),capture_output=True,text=True,encoding='utf8',errors='replace',timeout=120)
            finally:
                # Only the exclusive file created here; never a pre-existing file.
                if secret.exists():secret.unlink()
        elif exe=='psql':
            p=subprocess.run([str(c.BIN/'psql.exe'),*map(str,args)],env=c.environment(password),capture_output=True,text=True,encoding='utf8',errors='replace',timeout=30)
        else:return c.process(exe,args,password=password,console=console)
        if p.returncode:
            codes=re.findall(r'\b[0-9A-Z]{5}\b',p.stderr)
            self.last_failure={'operation':exe,'exit_code':p.returncode,'sqlstates':[x for x in codes if re.search('[0-9]',x)],'sanitized_message':p.stderr.replace(self.password,'<secret>')[-1200:]}
            raise c.Refused('Secure subprocess failed: '+exe+'; diagnostic codes only: '+','.join(self.last_failure['sqlstates']))
        return p.stdout.strip()


def configure_reader(m,admin,reader):
    c.artifacts(m);c.attest(m,admin)
    c.require(m['phase']=='INSTALLED','Reader preparation phase refused')
    # Verifier and plaintext never enter argv or a disk SQL file. psql receives stdin.
    script=(c.HERE/'sql/guard.sql').read_text()+"\nBEGIN;\nSELECT 1/(coalesce((SELECT NOT rolcanlogin AND rolpassword IS NULL FROM pg_authid WHERE rolname='sentinela_local_reader'),false)::integer);\n"
    script+="ALTER ROLE sentinela_local_reader PASSWORD '"+verifier(reader)+"' LOGIN;\nCOMMIT;\n"
    def run(exe,args,**kw):
        p=subprocess.run([str(c.BIN/'psql.exe'),*map(str,args)],input=script,env=c.environment(admin),capture_output=True,text=True,encoding='utf8',timeout=30)
        c.require(p.returncode==0,'Sandbox reader configuration failed; secret diagnostics withheld')
        return p.stdout.strip()
    # -f - reads stdin, with the normal guard variables and identity controls.
    c.psql(m,admin,file='-',run=run)


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--execute',action='store_true')
    args=parser.parse_args();c.require(args.execute,'No action: --execute required')
    c.require(c.digest(c.HERE/'control.py')==CONTROL_HASH and c.digest(c.HERE/'sql/snapshot_extra.sql')==SNAPSHOT_HASH,'Reviewed controller/snapshot mismatch')
    old=c.BASE/('rls-sandbox-'+OLD)/'manifest.json';old_hash=c.digest(old)
    reference,original_rows=operational_snapshot()
    locale=reference['extra']['locale']
    c.require(locale['datlocprovider']=='c' and locale['datcollate']==locale['datctype'],'Unsupported locale; no silent adaptation')
    # Explicit architecture decision recorded before cluster creation.
    m=c.prepare(locale['datcollate'])
    m['artifacts'][str((c.HERE/'complete_rls.py').relative_to(c.REPO))]=c.digest(c.HERE/'complete_rls.py');c.save(m)
    evidence=Path(m['root'])/'evidence';steps=[];runner=None
    def record(stage,result='PASS'):
        steps.append({'stage':stage,'result':result,'utc':datetime.now(timezone.utc).isoformat()})
        (evidence/'completion.json').write_text(json.dumps({'decision':'NEW_CLUSTER_PRESERVE_OLD','uuid':m['uuid'],'system_id':m['system_id'],'port':c.PORT,'steps':steps},indent=2),encoding='utf8')
        print(stage+': '+result,flush=True)
    record('decision_new_cluster')
    (evidence/'operational-before.json').write_text(json.dumps(reference,indent=2),encoding='utf8')
    (evidence/'operational-row-fingerprints-before.json').write_text(json.dumps(original_rows,indent=2),encoding='utf8')
    admin=secrets.token_urlsafe(40);reader=secrets.token_urlsafe(40);runner=SecureRun(admin)
    try:
        c.create(m,run=runner);record('create')
        c.start(m,admin,run=runner);record('start')
        c.attest(m,admin,database='postgres');record('verify')
        c.install(m,admin,run=runner);record('install')
        snap=c.snapshot(m,admin,run=runner)
        c.compare(reference,snap,role_mode='installation-nologin',sandbox=m);record('compare_nologin')
        (evidence/'installed.json').write_text(json.dumps(snap,indent=2),encoding='utf8')
        configure_reader(m,admin,reader)
        snap=c.snapshot(m,admin,run=runner);c.compare(reference,snap,sandbox=m);record('compare_login')
        c.backup(m,admin);record('pre_fixture_backup')
        c.fixtures(m,admin,reference,run=runner);record('fixtures')
        c.test(m,admin,reader,reference,run=runner);record('rls_and_permissions')
        sets={}
        for table in json.loads((c.REPO/'database/local/security-spec.json').read_text())['grants']:
            sets[table]=json.loads(c.psql(m,reader,sql="SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) FROM sentinela."+table,role=c.ROLE,run=runner))
        (evidence/'observed-reader-uuid-sets.json').write_text(json.dumps(sets,indent=2),encoding='utf8')
        after,final_rows=operational_snapshot();c.require(after==reference and final_rows==original_rows,'Operational reference/data changed')
        (evidence/'operational-after.json').write_text(json.dumps(after,indent=2),encoding='utf8')
        (evidence/'operational-row-fingerprints-after.json').write_text(json.dumps(final_rows,indent=2),encoding='utf8')
        c.require(c.digest(old)==old_hash,'Original sandbox manifest changed')
        record('operational_and_old_preserved')
        c.stop(m,admin);record('stop')
        print('PASS qualification; manifest: '+str(Path(m['root'])/'manifest.json'),flush=True)
    except BaseException:
        record('interrupted_or_failed','FAIL')
        if runner.last_failure:(evidence/'failure-codes.json').write_text(json.dumps(runner.last_failure),encoding='utf8')
        # Stop only after fresh authenticated identity proof. Unknown outcome stays untouched.
        try:
            c.attest(m,admin,database='postgres');c.stop(m,admin);record('identified_failure_shutdown')
        except (Exception,KeyboardInterrupt):record('server_state_requires_inspection','UNKNOWN')
        raise
    finally:
        admin=reader=None;runner.password=None


if __name__=='__main__':
    try:main()
    except (Exception,KeyboardInterrupt) as e:
        # Never print traceback, input, credentials, SQL or environment.
        print('FAIL '+type(e).__name__+': '+(str(e) if isinstance(e,c.Refused) else 'details withheld; preserve evidence'),flush=True)
        raise SystemExit(1)
