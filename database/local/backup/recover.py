"""Authorized local logical backup, then restore ONLY into a new attested cluster."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import queue
import re
import secrets
import shutil
import subprocess
import sys
import threading
from datetime import datetime, timezone

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / 'database/local/sandbox'))
import control as c
from private_pipe import PasswordPipe

SYSTEM_ID = '7702156035351602692'
BACKUPS = Path('D:/Backups/SENTINELA')
TABLES = ['categorias_criminais','eventos_auditoria','execucoes_importacao','extracoes_origem',
 'historico_correcoes','linhas_origem','linhas_staging','lotes_importacao','mapeamentos_natureza',
 'naturezas_criminais','ocorrencia_naturezas','ocorrencias','pendencias_revisao','perfil_permissoes',
 'perfis','permissoes','regioes_administrativas','schema_migrations','usuarios']

def require(value, message):
    if not value: raise RuntimeError(message)

def digest(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for part in iter(lambda:f.read(1024*1024),b''): h.update(part)
    return h.hexdigest()

def validate_archive(path, expected, run):
    require(Path(path).is_file() and Path(path).stat().st_size>5,'Missing or empty archive')
    require(digest(path)==expected,'Archive SHA-256 mismatch')
    with Path(path).open('rb') as f: require(f.read(5)==b'PGDMP','Custom archive required')
    toc=run('pg_restore',['--list',str(path)])
    run('pg_restore',['--file','NUL',str(path)])
    return toc

def clean_env(password=None, source=False):
    e=c.environment(password)
    e['PGAPPNAME']='sentinela-local-backup-readonly' if source else 'sentinela-isolated-restore'
    if source:
        e['PGOPTIONS']='-c default_transaction_read_only=on -c statement_timeout=60000 -c search_path=pg_catalog'
        if password is None:
            pgpass=Path(os.environ.get('APPDATA',''))/'postgresql/pgpass.conf'
            require(pgpass.is_file() and not pgpass.resolve().is_relative_to(REPO),'Private pgpass unavailable')
            e['PGPASSFILE']=str(pgpass)
    return e

def diagnostic(stderr):
    # Native codes/object categories only; never SQL, row details or raw records.
    text=stderr.lower()
    return {'permission_denied':'permission denied' in text or 'permiss' in text,
            'existing_objects':'already exists' in text or 'ja existe' in text,
            'incomplete_archive':'end of file' in text or 'input file is too short' in text,
            'missing_role':'role ' in text and ('does not exist' in text or 'existe' in text),
            'missing_extension':'extension' in text and ('not available' in text or 'could not' in text),
            'error_lines':sum('error' in s.lower() or 'erro' in s.lower() for s in stderr.splitlines())}

class Commands:
    def __init__(self, source_password=None):
        self.source_password=source_password
        self.events=[]
    def call(self, exe, args, password=None, source=False, input=None, timeout=180):
        require(exe in ['psql','pg_dump','pg_restore','initdb'],'Unexpected executable')
        command=[str(c.BIN/(exe+'.exe')),*map(str,args)]
        child=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
            env=clean_env(self.source_password if source else password,source),text=True,encoding='utf8',errors='replace',
            creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        try:stdout,stderr=child.communicate(input=input,timeout=timeout)
        except (subprocess.TimeoutExpired,KeyboardInterrupt):
            # Only this owned utility tree, never a server or unrelated process.
            subprocess.run(['taskkill.exe','/PID',str(child.pid),'/T','/F'],capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW)
            raise RuntimeError('Owned utility timeout/interruption: '+exe) from None
        p=subprocess.CompletedProcess(command,child.returncode,stdout,stderr)
        self.events.append({'tool':exe,'exit_code':p.returncode,'warnings':'warning:' in p.stderr.lower() or 'aviso:' in p.stderr.lower(),
                            'diagnostic':diagnostic(p.stderr) if p.returncode else {}})
        require(p.returncode==0,'Subprocess failed: '+exe+'; diagnostics sanitized')
        for secret in [password,self.source_password]:
            require(not secret or secret not in p.stdout,'Secret unexpectedly returned; output suppressed')
        return p.stdout.strip()

class ReadSession:
    def __init__(self, role, commands):
        require(re.fullmatch(r'[a-z_][a-z0-9_]{0,62}',role),'Invalid existing executor name')
        self.p=subprocess.Popen([str(c.BIN/'psql.exe'),'-X','-w','-qAt','-h','127.0.0.1','-p','5432',
          '-U',role,'-d','sentinela_dev_operacional','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],
          stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
          env=clean_env(commands.source_password,True),text=True,encoding='utf8',
          creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        self.lines=queue.Queue()
        def read():
            for line in self.p.stdout: self.lines.put(line)
            self.lines.put(None)
        threading.Thread(target=read,daemon=True).start()
        self.p.stdin.write('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL search_path=pg_catalog;\n');self.p.stdin.flush()
    def query(self, sql):
        self.p.stdin.write(sql.rstrip(';')+';\n');self.p.stdin.flush()
        try: line=self.lines.get(timeout=65)
        except queue.Empty: raise RuntimeError('Read-only query timeout') from None
        require(line is not None,'Read-only session unavailable; no authentication retry')
        return json.loads(line)
    def close(self):
        if self.p.poll() is None:
            try:self.p.stdin.write('ROLLBACK;\n\\q\n');self.p.stdin.flush();self.p.stdin.close()
            except (BrokenPipeError,OSError):pass
            try:self.p.wait(timeout=10)
            except subprocess.TimeoutExpired:raise RuntimeError('Source read session requires inspection') from None

IDENTITY="""SELECT jsonb_build_object('host',host(inet_server_addr()),'port',inet_server_port(),
 'database',current_database(),'executor',current_user,'version',current_setting('server_version'),
 'readonly',current_setting('transaction_read_only'),'system_id',(SELECT system_identifier::text FROM pg_control_system()),
 'bypass',(SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user),
 'rls_active',row_security_active('sentinela.regioes_administrativas'::regclass),
 'postgis',(SELECT extversion FROM pg_extension WHERE extname='postgis'),
 'size',pg_database_size(current_database()),'locale',(SELECT jsonb_build_object('collate',datcollate,'ctype',datctype,'provider',datlocprovider,'encoding',pg_encoding_to_char(encoding)) FROM pg_database WHERE datname=current_database()))"""

def check_source(i, role):
    require(i['host']=='127.0.0.1' and i['port']==5432 and i['database']=='sentinela_dev_operacional'
      and i['executor']==role and i['system_id']==SYSTEM_ID and i['readonly']=='on','Source identity mismatch')
    require(i['bypass'] and not i['rls_active'],'Complete backup requires an already authorized RLS-exempt account')
    require(i['version']=='17.11' and i['postgis']=='3.6.2','Source version mismatch')
    require(i['locale']['provider']=='c' and i['locale']['collate']==i['locale']['ctype'] and i['locale']['encoding']=='UTF8','Unsupported locale; no silent adaptation')

def metadata_sql():
    s=(REPO/'database/local/write-sandbox/preoperational-snapshot.sql').read_text(encoding='utf8')
    sql=s[s.index('SELECT jsonb_build_object('):s.rindex('COMMIT;')].strip().rstrip(';')
    # Explicit owner-only ACL and NULL/default ACL have the same effective rights.
    return sql.replace('c.relacl::text',"(SELECT jsonb_agg(jsonb_build_array(x.grantee::regrole::text,x.grantor::regrole::text,x.privilege_type,x.is_grantable) ORDER BY x.grantee::regrole::text,x.grantor::regrole::text,x.privilege_type) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x)")

def data_sql():
    # Fixed known tables only; returns hashes/counts, never actual records.
    parts=[]
    for name in TABLES:
        row="encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')"
        parts.append("SELECT '"+name+"' AS name,count(*) AS n,encode(sha256(convert_to(coalesce(string_agg("+row+",'' ORDER BY "+row+"),''),'UTF8')),'hex') AS sha FROM sentinela."+name+" t")
    return "SELECT jsonb_object_agg(name,jsonb_build_object('count',n,'sha256',sha)) FROM ("+' UNION ALL '.join(parts)+') x'

def compare_metadata(source, restored):
    differences=[]
    for key in source:
        if key in ['identity','reader']:continue
        if source[key]!=restored.get(key):differences.append(key)
    # Clone reader remains NOLOGIN with no password; all other attributes must match.
    a=dict(source['reader']);b=dict(restored['reader']);a['login']=False
    if a!=b:differences.append('reader_attributes')
    return differences

def bootstrap_runner(commands, admin):
    def run(exe,args,password=None,console=False):
        if exe=='initdb':
            if '-D' not in args:return c.process(exe,args)
            pipe=PasswordPipe(admin)
            try:
                output=commands.call(exe,[a for a in args if a!='-W']+['--pwfile='+pipe.name,'--no-clean'],password=None)
                require(pipe.delivered and not pipe.error,'Private password delivery failed')
                return output
            finally:pipe.close()
        if exe=='psql':return commands.call(exe,args,password=password)
        return c.process(exe,args,password=password,console=console)
    return run

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute',action='store_true');parser.add_argument('--authorized-account',required=True)
    args=parser.parse_args();require(args.execute,'Explicit execution required')
    role=args.authorized_account
    commands=Commands(os.environ.pop('SENTINELA_LOCAL_BACKUP_PASSWORD',None))
    for exe in ['psql','pg_dump','pg_restore','initdb']:
        version=subprocess.run([str(c.BIN/(exe+'.exe')),'--version'],capture_output=True,text=True).stdout
        require(re.search(r'\b17\.11\b',version),'PostgreSQL 17.11 tools required')
    session=None;m=None;admin=None;report=None;destination=None
    try:
        session=ReadSession(role,commands);identity=session.query(IDENTITY);check_source(identity,role)
        inventory=session.query("SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,t.relname,t.relkind) ORDER BY n.nspname,t.relname),'[]') FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname!~'^pg_' AND n.nspname<>'information_schema' AND t.relkind IN ('r','p','f','m','S') AND NOT EXISTS(SELECT FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=t.oid AND d.deptype='e')")
        require(inventory==[['sentinela',t,'r'] for t in sorted(TABLES)],'Additional user objects require expanded recovery qualification; no silent exclusion')
        clone_free=shutil.disk_usage(c.BASE).free
        require(clone_free>identity['size']*3+1024*1024*1024,'Insufficient isolated-cluster space')
        require(BACKUPS.is_dir(),'Backup parent absent');c.no_links(BACKUPS)
        backup_free=shutil.disk_usage(BACKUPS).free
        require(backup_free>identity['size']*3+512*1024*1024,'Insufficient backup space')
        destination=BACKUPS/('LOCAL-PRE-RA-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+secrets.token_hex(8))
        destination.mkdir(exist_ok=False);c.private_directory(destination)
        report={'result':'RUNNING','source':identity,'startedAt':datetime.now(timezone.utc).isoformat(),
                'authorization':{'existing_account':role,'scope':'read-only backup and global checks'},'events':commands.events,'inventory':inventory,
                'free_space_before':{'backup':backup_free,'sandbox':clone_free}}
        before=session.query(metadata_sql());data=session.query(data_sql())
        globals_result=session.query("SELECT jsonb_build_object('catalog_total',(SELECT count(*) FROM sentinela.regioes_administrativas),'distinct_codes',(SELECT count(DISTINCT codigo_interno) FROM sentinela.regioes_administrativas),'duplicate_code_groups',(SELECT count(*) FROM (SELECT codigo_interno FROM sentinela.regioes_administrativas GROUP BY codigo_interno HAVING count(*)>1) s),'ledger',(SELECT jsonb_agg(versao ORDER BY versao) FROM sentinela.schema_migrations),'active_status','not applicable: no active column in schema')")
        snapshot=session.query("SELECT to_jsonb(pg_export_snapshot())")
        archive=destination/'database.dump'
        commands.call('pg_dump',['-w','-h','127.0.0.1','-p','5432','-U',role,'-d','sentinela_dev_operacional',
            '--format=custom','--compress=gzip:6','--lock-wait-timeout=10000','--snapshot='+snapshot,'--file',str(archive)],source=True)
        sha=digest(archive);toc=validate_archive(archive,sha,commands.call)
        failure_tests=[]
        try:validate_archive(archive,'0'*64,commands.call)
        except RuntimeError:failure_tests.append({'name':'wrong_sha256','result':'PASS'})
        else:raise RuntimeError('Wrong hash was accepted')
        for name,content in [('bad-header',b'INVALID'+archive.read_bytes()[7:]),('truncated',archive.read_bytes()[:archive.stat().st_size//2])]:
            derivative=destination/(name+'.dump')
            with derivative.open('xb') as f:f.write(content)
            try:validate_archive(derivative,digest(derivative),commands.call)
            except RuntimeError:failure_tests.append({'name':name,'result':'PASS','scope':'derived file only; original preserved'})
            else:raise RuntimeError('Invalid archive accepted: '+name)
        session.close();session=None
        report.update(backup={'path':str(archive),'format':'custom','size':archive.stat().st_size,'sha256':sha,'consistent_exported_snapshot':True,'toc_entries':sum(bool(re.match(r'^\d+;',x)) for x in toc.splitlines())},global_checks=globals_result,failure_tests=failure_tests)
        (destination/'source-metadata.json').write_text(json.dumps(before,indent=2),encoding='utf8')
        (destination/'source-data-hashes.json').write_text(json.dumps(data,indent=2),encoding='utf8')
        (destination/'archive-list.txt').write_text(toc,encoding='utf8')
        previous={str(p):c.digest(p) for p in c.BASE.glob('rls-sandbox-*/manifest.json')}
        m=c.prepare(identity['locale']['collate']);admin=secrets.token_urlsafe(40)
        for p in [Path(__file__),Path(__file__).with_name('private_pipe.py'),REPO/'database/local/write-sandbox/preoperational-snapshot.sql']:
            m['artifacts'][str(p.relative_to(REPO))]=c.digest(p)
        c.save(m);run=bootstrap_runner(commands,admin)
        c.create(m,run=run);require(m['system_id']!=SYSTEM_ID,'Restore cluster must differ');c.start(m,admin,run=run)
        c.attest(m,admin,database='postgres')
        existing=c.psql(m,admin,database='postgres',sql="SELECT count(*) FROM pg_database WHERE datname='sentinela_rls_sandbox';",run=run)
        require(existing=='0','Restore database already exists')
        c.psql(m,admin,database='postgres',sql='CREATE DATABASE sentinela_rls_sandbox TEMPLATE template0;',run=run)
        # The complete source metadata names only postgres and this known technical reader.
        c.psql(m,admin,sql='CREATE ROLE sentinela_local_reader NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT CONNECTION LIMIT 5;',run=run)
        c.attest(m,admin)
        commands.call('pg_restore',['-w','-h','127.0.0.1','-p','55432','-U','postgres','-d','sentinela_rls_sandbox',
            '--exit-on-error','--single-transaction',str(archive)],password=admin)
        restored=json.loads(c.psql(m,admin,sql=metadata_sql(),run=run))
        restored_data=json.loads(c.psql(m,admin,sql=data_sql(),run=run))
        (destination/'restored-metadata.json').write_text(json.dumps(restored,indent=2),encoding='utf8')
        (destination/'restored-data-hashes.json').write_text(json.dumps(restored_data,indent=2),encoding='utf8')
        differences=compare_metadata(before,restored)
        require(not differences,'Restored structural drift: '+','.join(differences))
        require(data==restored_data,'Restored data count/hash mismatch')
        # A second restore must refuse existing objects and roll back this owned
        # disposable destination; no --clean, DROP or operational destination.
        try:
            commands.call('pg_restore',['-w','-h','127.0.0.1','-p','55432','-U','postgres','-d','sentinela_rls_sandbox',
                '--exit-on-error','--single-transaction',str(archive)],password=admin)
        except RuntimeError:
            require(commands.events[-1]['exit_code']!=0,'Restore failure not observed')
            require(restored==json.loads(c.psql(m,admin,sql=metadata_sql(),run=run)) and restored_data==json.loads(c.psql(m,admin,sql=data_sql(),run=run)),'Failed restore changed destination')
            failure_tests.append({'name':'native_restore_error_atomic_rollback','result':'PASS'})
        else:raise RuntimeError('Unexpected restore accepted over existing objects')
        require(digest(archive)==sha,'Original backup changed during validation')
        require(all(c.digest(Path(p))==h for p,h in previous.items()),'Historical manifests changed')
        require(all(c.digest(REPO/path)==h for path,h in m['artifacts'].items()),'Recovery artifacts changed during execution')
        session=ReadSession(role,commands);check_source(session.query(IDENTITY),role)
        require(before==session.query(metadata_sql()) and data==session.query(data_sql()),'Source state changed; inspect concurrent activity')
        session.close();session=None
        report.update(result='PASS',restore={'uuid':m['uuid'],'system_id':m['system_id'],'database':c.DB,'port':c.PORT,
            'structural_differences':differences,'table_data_hashes_equal':True,'role_adaptation':'reader NOLOGIN; no password copied'},source_state_preserved=True)
        (destination/'restored-metadata.json').write_text(json.dumps(restored,indent=2),encoding='utf8')
    except BaseException as error:
        if report is not None:report.update(result='FAIL',failure_type=type(error).__name__,failure=str(error) if isinstance(error,RuntimeError) else 'Sanitized failure; no retry')
        raise
    finally:
        if session is not None:session.close()
        if m is not None and admin is not None:
            try:c.attest(m,admin,database='postgres');c.stop(m,admin);report['sandbox_final']='STOPPED'
            except Exception:report['sandbox_final']='UNKNOWN; inspect before any action'
        if report is not None:
            report['finishedAt']=datetime.now(timezone.utc).isoformat()
            text=json.dumps(report,indent=2);(destination/'report.json').write_text(text,encoding='utf8')
            (destination/'report-sha256.txt').write_text(hashlib.sha256(text.encode()).hexdigest(),encoding='ascii')
            print(json.dumps({'result':report['result'],'report':str(destination/'report.json'),'sandbox_final':report.get('sandbox_final')}),flush=True)

if __name__=='__main__':
    try:main()
    except (Exception,KeyboardInterrupt) as error:
        print('FAIL: '+type(error).__name__+'; evidence retained; no automatic retry',flush=True);sys.exit(1)
