"""Fail-closed lifecycle for a separately authorized disposable Windows PostgreSQL cluster.
Importing, --help and unit tests never create/start PostgreSQL. No operational endpoint exists here.
"""
from __future__ import annotations
import argparse
import ctypes
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import time
import tempfile
from datetime import datetime, timezone
import uuid

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
BASE = Path(os.environ.get('USERPROFILE', str(Path.home()))) / '.sentinela-local' / 'rls-sandboxes'
BIN = Path(r'C:\Program Files\PostgreSQL\17\bin')
DB = 'sentinela_rls_sandbox'
PORT = 55432
HOST = '127.0.0.1'
ROLE = 'sentinela_local_reader'
BASELINE_HASH = '01617b34fc5d2e90aaecf2060210f13b17bb9c63aac51fd7c0f5f8df97ba82bd'

class Refused(RuntimeError): pass

def require(ok, message):
    if not ok: raise Refused(message)

def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def no_links(path, recursive=False):
    p = Path(path).absolute()
    for item in [p, *p.parents]:
        if item.exists() or item.is_symlink():
            st = item.lstat()
            require(not item.is_symlink() and not (getattr(st, 'st_file_attributes', 0) & 0x400), 'Link/reparse point refused')
    if recursive and p.exists():
        for root, dirs, files in os.walk(p, followlinks=False):
            for name in dirs + files: no_links(Path(root) / name)

def free_port():
    with socket.socket() as s:
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'): s.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try: s.bind((HOST, PORT))
        except OSError: return False
    return True

def environment(password=None):
    e = {k:v for k,v in os.environ.items() if not k.upper().startswith('PG')}
    e.update(PGCONNECT_TIMEOUT='4', PGCLIENTENCODING='UTF8', PGAPPNAME='sentinela-rls-sandbox', LC_ALL='C')
    # No default pgpass reuse, service file, app .env or administrative URI.
    e['PGPASSFILE'] = str(BASE / 'NO_PASSWORD_FILE_ALLOWED')
    if password is not None: e['PGPASSWORD'] = password
    return e

class ProcessFailure(Refused):
    def __init__(self, operation, reason):
        self.operation, self.reason = operation, reason
        super().__init__('Process '+operation+': '+reason+'; raw diagnostics withheld')

TIMEOUTS = {'pg_ctl':45,'pg_controldata':10,'pg_waldump':10,'psql':20,'pg_dump':120,'pg_restore':120,'initdb':120,'postgres':10}

def process(exe, args, password=None, console=False):
    require(exe in TIMEOUTS, 'Unsupported executable')
    command=[str(BIN / (exe + '.exe')), *map(str,args)]
    timeout=TIMEOUTS[exe]
    if exe=='pg_ctl' and '120' in list(map(str,args)):timeout=135
    if exe=='pg_ctl' and not console:
        # A daemon may inherit stdout/stderr. Waiting for PIPE EOF can then outlive
        # pg_ctl itself. Use a regular temporary file and wait ONLY for pg_ctl.
        # It holds no passwords (pg_ctl never needs PGPASSWORD).
        try:
            with tempfile.TemporaryFile(mode='w+b') as output:
                child=subprocess.Popen(command,env=environment(),stdin=subprocess.DEVNULL,
                    stdout=output,stderr=output,close_fds=True,
                    # No attachment to the calling terminal, not merely a new group.
                    creationflags=(subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW) if os.name=='nt' else 0)
                try: code=child.wait(timeout=timeout)
                except subprocess.TimeoutExpired:
                    # Do not kill pg_ctl or its server tree; outcome must be observed.
                    raise ProcessFailure(exe,'timeout; server state unknown') from None
                require(code==0,'Process pg_ctl failed; server state must be checked')
                # Bounded read of a regular file: no EOF wait for descendants.
                output.seek(0);return output.read(1024*1024).decode('utf-8',errors='replace').strip()
        except OSError:raise ProcessFailure(exe,'unavailable') from None
    try:
        r=subprocess.run(command,env=environment(password),capture_output=not console,
            text=True,encoding='utf-8',errors='replace',timeout=timeout,close_fds=True)
    except subprocess.TimeoutExpired:raise ProcessFailure(exe,'timeout') from None
    except OSError:raise ProcessFailure(exe,'unavailable') from None
    require(r.returncode==0,'Process failed: '+exe+'; raw output withheld')
    return '' if console else r.stdout.strip()

PROGRESS = {
 'PASSWORD_READY':'Entrada oculta da senha concluida.',
 'PG_CTL_STARTED':'Executando pg_ctl; nenhuma senha sera exibida.',
 'PG_CTL_RETURNED':'pg_ctl retornou sucesso.',
 'WAITING_READY':'Aguardando disponibilidade na porta exclusiva do sandbox.',
 'PORT_READY':'Porta do sandbox respondeu; identidade ainda nao atestada.',
 'IDENTITY_CHECK':'Validando identidade, PID e system identifier.',
 'HBA_CHECK':'Validando listener e HBA efetivos.',
 'SERVER_ATTESTED':'Servidor iniciado e identidade atestada.',
 'MANIFEST_UPDATED':'Manifesto atualizado para RUNNING.',
 'START_COMPLETE':'Inicializacao concluida.',
 'START_FAILED':'Inicializacao nao confirmada; nenhum servidor foi encerrado automaticamente.',
 'ATTESTATION_FAILED':'Falha de atestacao; o servidor pode continuar executando.',
 'INTERRUPTED':'Interrompido; verificar estado efetivo antes de qualquer nova acao.'}

def progress(event):
    require(event in PROGRESS,'Unsupported progress event')
    print(PROGRESS[event],flush=True)

def wait_ready(timeout=15):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        try:
            with socket.create_connection((HOST,PORT),timeout=0.5):return True
        except OSError:time.sleep(0.2)
    return False

def observed_server(m,probe=free_port,process_check=None):
    # Observation is not attestation; no SQL, password or server control operation.
    try:
        available=probe();present=(Path(m['data'])/'postmaster.pid').exists()
        if not present and available:return {'state':'STOPPED_OBSERVED'}
        if present:
            pid,epoch=pid_file(m)
            (process_check or os_process)(pid,epoch)
            return {'state':'PROCESS_PRESENT_UNATTESTED','pid':pid,'start_epoch':epoch,'port_busy':not available}
        return {'state':'UNKNOWN','port_busy':not available}
    except (Exception,KeyboardInterrupt):return {'state':'UNKNOWN'}


def secret(label):
    require(os.name == 'nt' and sys.stdin.isatty(), 'Use an interactive Windows terminal; never send passwords via chat/arguments')
    value = getpass.win_getpass(label)
    require(bool(value), 'Empty password refused')
    return value

def prerequisites(run=process, probe=free_port):
    for name in ['postgres','initdb','pg_ctl','psql','pg_dump','pg_restore','pg_controldata','pg_waldump']:
        require(re.search(r'\b17\.11\b', run(name,['--version'])), 'PostgreSQL 17.11 binaries required')
    require((BIN.parent/'share/extension/postgis.control').exists(), 'PostGIS unavailable')
    require((BIN.parent/'lib/postgis-3.dll').exists(), 'PostGIS DLL unavailable')
    require(probe(), 'Port 55432 occupied')
    raw = (REPO/'database/supabase/baseline/0001_modelo_inicial.sql').read_text(encoding='utf-8-sig').replace('\r\n','\n').replace('\r','\n')
    require(hashlib.sha256(raw.encode()).hexdigest()==BASELINE_HASH, 'Baseline integrity mismatch')

def save(m):
    root = Path(m['root']); no_links(root)
    temp = root/'manifest.new'
    with temp.open('x',encoding='utf8') as f: json.dump(m,f,indent=2)
    os.replace(temp,root/'manifest.json')

def load(file, base=None):
    base=BASE if base is None else base
    no_links(file); m=json.loads(Path(file).read_text(encoding='utf8'))
    try: ident=str(uuid.UUID(m['uuid']))
    except (ValueError,KeyError,TypeError): raise Refused('Invalid manifest UUID') from None
    root=base.resolve()/('rls-sandbox-'+ident)
    require(Path(file).resolve()==root/'manifest.json', 'Unexpected manifest location')
    require(m.get('kind')=='sentinela-rls-disposable-v1' and m.get('host')==HOST and m.get('port')==PORT and m.get('database')==DB, 'Invalid manifest endpoint/purpose')
    require(m.get('root')==str(root) and m.get('data')==str(root/'data'), 'Unexpected paths')
    require(m.get('phase') in ['PREPARED','CREATED','RUNNING','RECOVERY_REQUIRED','INSTALLED','FIXTURES','TESTED','STOPPED','DISCARDED','FAILED','START_FAILED','ATTESTATION_FAILED','START_UNKNOWN'], 'Invalid lifecycle phase')
    no_links(root); return m

def private_directory(root):
    # Fresh DACL only, no SACL requests. Never used against an existing directory.
    script="$ErrorActionPreference='Stop'; $p=$args[0]; $a=New-Object Security.AccessControl.DirectorySecurity; $a.SetAccessRuleProtection($true,$false); foreach($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544')){$r=New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow');$a.AddAccessRule($r)};[IO.Directory]::SetAccessControl($p,$a)"
    # Explicit path is not secret; pass via environment to avoid PowerShell argument ambiguity.
    script=script.replace('$p=$args[0]',"$p=$env:SENTINELA_SANDBOX_PRIVATE_ROOT")
    e=environment();e['SENTINELA_SANDBOX_PRIVATE_ROOT']=str(root)
    r=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',script],env=e,capture_output=True)
    require(r.returncode==0,'Private DACL setup failed; stop and inspect new directory')

def prepare(locale, run=process, probe=free_port):
    prerequisites(run,probe); no_links(BASE)
    require(bool(locale) and len(locale)<100 and not any(c in locale for c in '\r\n\x00'), 'Explicit reference locale required')
    ident=str(uuid.uuid4());root=BASE.resolve()/('rls-sandbox-'+ident)
    require(not root.exists(), 'Existing root refused');root.mkdir(parents=True,exist_ok=False)
    private_directory(root);(root/'evidence').mkdir()
    m=dict(kind='sentinela-rls-disposable-v1',uuid=ident,root=str(root),data=str(root/'data'),host=HOST,port=PORT,database=DB,locale=locale,phase='PREPARED',system_id=None,pid=None,start_epoch=None)
    m['artifacts']={str(p.relative_to(REPO)):digest(p) for p in sorted((HERE/'sql').glob('*.sql'))}
    for p in [HERE/'control.py',HERE/'expected.json',REPO/'database/supabase/tests/catalog_snapshot.sql',REPO/'database/local/hba/sentinela_local_reader.conf']:m['artifacts'][str(p.relative_to(REPO))]=digest(p)
    m['artifacts']['database/supabase/baseline/0001_modelo_inicial.sql']=digest(REPO/'database/supabase/baseline/0001_modelo_inicial.sql')
    m['artifacts']['database/local/security-spec.json']=digest(REPO/'database/local/security-spec.json')
    save(m);return m

def artifacts(m):
    require(bool(m.get('artifacts')), 'Artifact manifest missing')
    for name,h in m['artifacts'].items():
        p=(REPO/name).resolve();require(p.is_relative_to(REPO), 'Artifact escape');require(digest(p)==h,'Reviewed artifact changed')

def approve_controller(m,previous,reviewed,authorization,run=process,probe=free_port):
    # Explicit future authorization only; never called automatically by start.
    require(authorization==m['uuid'],'Explicit UUID approval required')
    require(m['phase'] in ['CREATED','STOPPED'],'Review requires a stopped, previously created cluster')
    require(probe() and not (Path(m['data'])/'postmaster.pid').exists(),'Review refused while process/port may be active')
    keys=[k for k in m['artifacts'] if (REPO/k).resolve()==(HERE/'control.py').resolve()]
    require(len(keys)==1,'Controller artifact entry ambiguous');key=keys[0]
    require(re.fullmatch('[0-9a-f]{64}',previous or '') and re.fullmatch('[0-9a-f]{64}',reviewed or ''),'Exact reviewed hashes required')
    require(m['artifacts'][key]==previous and digest(HERE/'control.py')==reviewed,'Reviewed hashes mismatch')
    require(control_id(m,run)==m['system_id'],'Cluster identity mismatch')
    for name,h in m.get('runtime_files',{}).items():require(digest(Path(m['data'])/name)==h,'Configuration drift')
    proposed=json.loads(json.dumps(m));proposed['artifacts'][key]=reviewed;artifacts(proposed)
    record={'old_sha256':previous,'new_sha256':reviewed,'uuid':m['uuid'],'utc':datetime.now(timezone.utc).isoformat()}
    proposed.setdefault('controller_approvals',[]).append(record)
    evidence=Path(m['root'])/'evidence'/('controller-approval-'+str(uuid.uuid4())+'.json')
    with evidence.open('x',encoding='utf8') as f:json.dump(record,f,indent=2)
    save(proposed);return proposed


REVISION_ALLOWLIST={'database/local/sandbox/control.py','database/local/sandbox/sql/snapshot_extra.sql'}

def approve_artifacts(m,plan,plan_hash,authorization,password,run=process,process_check=None):
    """Future explicit approval, no DDL, no role changes, no start/stop."""
    require(authorization==m['uuid'] and m['phase']=='RUNNING','Explicit RUNNING sandbox UUID required')
    manifest=Path(m['root'])/'manifest.json'
    require(load(manifest)==m,'Manifest changed')
    no_links(plan)
    require(re.fullmatch('[0-9a-f]{64}',plan_hash or '') and digest(plan)==plan_hash,'Reviewed plan hash mismatch')
    review=json.loads(Path(plan).read_text(encoding='utf8'))
    require(isinstance(review,dict) and set(review)=={'uuid','system_id','manifest_sha256','changes'},'Invalid revision plan contract')
    require(review['uuid']==m['uuid'] and review['system_id']==m['system_id'],'Revision plan identity mismatch')
    require(digest(manifest)==review['manifest_sha256'],'Stale revision plan/manifest')
    require(isinstance(review['changes'],list) and 1<=len(review['changes'])<=2,'Invalid revision count')
    proposed=json.loads(json.dumps(m));seen=set()
    for change in review['changes']:
        require(isinstance(change,dict) and set(change)=={'artifact','old_sha256','new_sha256'},'Invalid revision entry')
        name=change['artifact'];require(name in REVISION_ALLOWLIST and name not in seen,'Unapproved/duplicate artifact');seen.add(name)
        require(all(isinstance(change[k],str) and re.fullmatch('[0-9a-f]{64}',change[k]) for k in ['old_sha256','new_sha256']),'Exact hashes required')
        file=REPO/name;no_links(file)
        keys=[k for k in m['artifacts'] if (REPO/k).resolve()==file.resolve()]
        require(len(keys)==1,'Ambiguous manifest artifact');key=keys[0]
        require(m['artifacts'][key]==change['old_sha256'] and digest(file)==change['new_sha256'] and change['old_sha256']!=change['new_sha256'],'Revision hash mismatch')
        proposed['artifacts'][key]=change['new_sha256']
    artifacts(proposed) # Unlisted changes cannot be smuggled into an approval.
    attest(proposed,password,database='postgres',run=run,process_check=process_check or os_process)
    require(digest(manifest)==review['manifest_sha256'] and load(manifest)==m,'Concurrent manifest change')
    require(digest(plan)==plan_hash,'Concurrent plan change');artifacts(proposed)
    record={'uuid':m['uuid'],'system_id':m['system_id'],'utc':datetime.now(timezone.utc).isoformat(),
            'previous_manifest_sha256':review['manifest_sha256'],'plan_sha256':plan_hash,'changes':review['changes'],'server_identity_attested':True}
    proposed.setdefault('artifact_approvals',[]).append(record)
    evidence=Path(m['root'])/'evidence'/('artifact-approval-'+str(uuid.uuid4())+'.json')
    with evidence.open('x',encoding='utf8') as f:json.dump(record,f,indent=2)
    save(proposed);return proposed


def control_id(m,run=process):
    no_links(m['data'],True)
    output=run('pg_controldata',[m['data']]);match=re.search(r'Database system identifier:\s*(\d+)',output)
    require(match is not None,'System identifier unavailable');return match.group(1)

def create(m,run=process):
    require(m['phase']=='PREPARED','Creation phase refused');artifacts(m);prerequisites(run)
    data=Path(m['data']);no_links(data);require(not data.exists() and not data.is_symlink(),'Existing data directory refused')
    try:
        run('initdb',['-D',data,'-U','postgres','-W','--auth=scram-sha-256','--encoding=UTF8','--locale='+m['locale']],console=True)
        require((data/'PG_VERSION').read_text().strip()=='17','Unexpected PG_VERSION')
        m['system_id']=control_id(m,run)
        # Server-readable identity independent of connection arguments.
        (data/'sentinela-sandbox.json').write_text(json.dumps({k:m[k] for k in ['kind','uuid','system_id','data','port','database']}),encoding='utf8')
        (data/'postgresql.auto.conf').write_text("listen_addresses='127.0.0.1'\nport=55432\npassword_encryption='scram-sha-256'\nlog_statement='none'\nlog_min_error_statement='panic'\nlog_parameter_max_length_on_error=0\nsentinela.sandbox_uuid='"+m['uuid']+"'\n",encoding='utf8')
        fragment=(REPO/'database/local/hba/sentinela_local_reader.conf').read_text().replace('sentinela_dev_operacional',DB)
        (data/'pg_hba.conf').write_text(fragment+"\nhost all postgres 127.0.0.1/32 scram-sha-256\nhost all all 0.0.0.0/0 reject\nhost all all ::/0 reject\n",encoding='utf8')
        m['runtime_files']={name:digest(data/name) for name in ['postgresql.conf','postgresql.auto.conf','pg_hba.conf','pg_ident.conf','sentinela-sandbox.json']}
        m['phase']='CREATED';save(m)
    except Exception:
        m['phase']='FAILED';save(m);raise

IDENTITY_SQL="""SELECT json_build_object('database',current_database(),'user',current_user,'host',host(inet_server_addr()),'port',inet_server_port(),'data',current_setting('data_directory'),'uuid',current_setting('sentinela.sandbox_uuid',true),'system_id',(SELECT system_identifier::text FROM pg_control_system()),'start_epoch',extract(epoch from pg_postmaster_start_time())::bigint,'pid',split_part(pg_read_file('postmaster.pid'),E'\\n',1)::int,'listen',current_setting('listen_addresses'),'hba_file',current_setting('hba_file'),'hba_errors',(SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL),'trust_rules',(SELECT count(*) FROM pg_hba_file_rules WHERE auth_method='trust'),'marker',pg_read_file('sentinela-sandbox.json')::json,'external_tablespaces',(SELECT count(*) FROM pg_tablespace WHERE pg_tablespace_location(oid)<>''))"""

def psql(m,password,sql=None,file=None,role='postgres',database=None,run=process):
    require(m['port']==PORT and m['database']==DB and m['host']==HOST,'Operational/remote endpoint forbidden')
    require(database in [None,DB,'postgres'] and role in ['postgres',ROLE],'Unexpected database/role refused')
    args=['-X','-w','-h',HOST,'-p',str(PORT),'-U',role,'-d',database or DB,'-v','ON_ERROR_STOP=1','-qAt','-v','VERBOSITY=sqlstate']
    for key,val in [('sandbox_uuid',m['uuid']),('sandbox_systemid',m['system_id']),('sandbox_data',m['data']),('sandbox_start',m.get('start_epoch') or 0)]:args+=['-v',key+'='+str(val)]
    args+=['-f',str(file)] if file else ['-c',sql]
    return run('psql',args,password=password)

def pid_file(m):
    lines=(Path(m['data'])/'postmaster.pid').read_text().splitlines()
    require(len(lines)>=4,'Invalid postmaster.pid')
    require(Path(lines[1]).resolve()==Path(m['data']).resolve() and int(lines[3])==PORT,'PID file endpoint/path mismatch')
    return int(lines[0]),int(lines[2])

def os_process(pid,start):
    require(os.name=='nt','Windows process attestation required')
    from ctypes import wintypes
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD];kernel.OpenProcess.restype=wintypes.HANDLE
    handle=kernel.OpenProcess(0x1000,False,pid)
    if not handle:raise Refused('Process unavailable; winerror='+str(ctypes.get_last_error()))
    try:
        kernel.QueryFullProcessImageNameW.argtypes=[wintypes.HANDLE,wintypes.DWORD,wintypes.LPWSTR,ctypes.POINTER(wintypes.DWORD)]
        size=wintypes.DWORD(32768);buf=ctypes.create_unicode_buffer(size.value)
        require(kernel.QueryFullProcessImageNameW(handle,0,buf,ctypes.byref(size))!=0,'Process image unavailable')
        require(Path(buf.value).resolve()==(BIN/'postgres.exe').resolve(),'PID is not approved postgres binary')
        times=[wintypes.FILETIME() for _ in range(4)]
        kernel.GetProcessTimes.argtypes=[wintypes.HANDLE,*[ctypes.POINTER(wintypes.FILETIME)]*4]
        require(kernel.GetProcessTimes(handle,*[ctypes.byref(t) for t in times])!=0,'Process start unavailable')
        epoch=((times[0].dwHighDateTime<<32)|times[0].dwLowDateTime)/10000000-11644473600
        require(abs(epoch-start)<5,'PID recycled/start mismatch')
    finally:
        kernel.CloseHandle.argtypes=[wintypes.HANDLE];kernel.CloseHandle(handle)

def attest(m,password,database=None,run=process,process_check=os_process,report=None):
    require(control_id(m,run)==m['system_id'],'Control file identity mismatch')
    require(bool(m.get('runtime_files')),'Runtime configuration evidence missing')
    for name,h in m['runtime_files'].items():require(digest(Path(m['data'])/name)==h,'Runtime configuration changed')
    pid,start=pid_file(m)
    if m.get('pid') is not None:require(pid==m['pid'] and start==m['start_epoch'],'PID/start identity mismatch')
    process_check(pid,start)
    i=json.loads(psql(m,password,sql=IDENTITY_SQL,database=database,run=run))
    if report:report('HBA_CHECK')
    require(i['listen']==HOST and Path(i['hba_file']).resolve()==Path(m['data']).resolve()/'pg_hba.conf' and i['hba_errors']==0 and i['trust_rules']==0,'Unsafe listener/HBA')
    require(i['database']==(database or DB) and i['user']=='postgres' and i['host']==HOST and i['port']==PORT,'Server endpoint mismatch')
    require(Path(i['data']).resolve()==Path(m['data']).resolve() and i['system_id']==m['system_id'] and i['uuid']==m['uuid'] and i['pid']==pid and abs(i['start_epoch']-start)<3 and i['external_tablespaces']==0,'Server identity mismatch')
    require(isinstance(i['marker'],dict),'Invalid server marker')
    require(all(i['marker'].get(k)==m[k] for k in ['kind','uuid','system_id','data','port','database']),'Server marker mismatch')
    return pid,start

def start(m,password,run=process,probe=free_port,process_check=os_process,ready=wait_ready,report=progress):
    require(m['phase'] in ['CREATED','STOPPED','RECOVERY_REQUIRED'],'Start phase refused')
    recovering=m['phase']=='RECOVERY_REQUIRED'
    before=json.loads(json.dumps(m))
    require(m['host']==HOST and m['port']==PORT and m['database']==DB,'Operational/remote endpoint forbidden')
    if recovering:
        stopped_state(m,run=run)
        require(digest(m['recovery_copy'])==m['reconciliations'][-1]['copy_record_sha256'],'Physical copy record changed')
        verify_physical_copy(m,Path(m['recovery_copy']),run=run)
    else:require(not (Path(m['data'])/'postmaster.pid').exists(),'Existing PID file: inspect instead of starting twice')
    require(probe(),'Port occupied');artifacts(m)
    require(control_id(m,run)==m['system_id'],'Cluster identity changed')
    require(bool(m.get('runtime_files')),'Configuration evidence missing')
    for name,h in m['runtime_files'].items():require(digest(Path(m['data'])/name)==h,'Runtime configuration changed')
    events=[];launched=False;attesting=False
    def step(event):
        events.append({'event':event,'utc':datetime.now(timezone.utc).isoformat()});report(event)
    evidence=Path(m['root'])/'evidence'/('start-'+str(uuid.uuid4())+'.json')
    try:
        step('PG_CTL_STARTED');launched=True
        run('pg_ctl',['-D',m['data'],'-l',str(Path(m['root'])/'evidence/server.log'),'-t','120' if recovering else '30','-w','start'])
        step('PG_CTL_RETURNED');step('WAITING_READY')
        require(ready(),'Readiness deadline exceeded; actual server state requires inspection')
        step('PORT_READY');attesting=True;step('IDENTITY_CHECK')
        pid,epoch=attest(dict(m,pid=None,start_epoch=None),password,database='postgres',run=run,process_check=process_check,report=step)
        step('SERVER_ATTESTED')
        m.update(pid=pid,start_epoch=epoch,phase='RUNNING',last_start={'result':'PASS','server_observation':'ATTESTED_RUNNING','recovery_start':recovering})
        save(m);step('MANIFEST_UPDATED');step('START_COMPLETE')
    except (Exception,KeyboardInterrupt) as error:
        # Never call stop/kill/terminate here. Even a timed-out pg_ctl may have
        # successfully created a postmaster, so inspect independently.
        observation=observed_server(m,probe,process_check) if launched else {'state':'UNKNOWN'}
        ctl_confirmed=any(e['event']=='PG_CTL_RETURNED' for e in events)
        if launched and not ctl_confirmed and (isinstance(error,KeyboardInterrupt) or isinstance(error,ProcessFailure) and 'timeout' in error.reason):
            observation['pg_ctl_may_still_be_running']=True
            if observation['state']=='STOPPED_OBSERVED':observation['state']='UNKNOWN'
        event='INTERRUPTED' if isinstance(error,KeyboardInterrupt) else ('ATTESTATION_FAILED' if attesting else 'START_FAILED')
        m['phase']='START_UNKNOWN' if event=='INTERRUPTED' else event
        m['last_start']={'result':event,'server_observation':observation,
            'exception_type':type(error).__name__,'process_reason':error.reason if isinstance(error,ProcessFailure) else None}
        failure_result=json.loads(json.dumps(m['last_start']))
        if recovering:
            # Do not claim a new lifecycle state until authenticated attestation.
            m.clear();m.update(before)
        try:
            if not recovering:save(m)
        except (Exception,KeyboardInterrupt):pass # Evidence may be all that can be preserved.
        try:step(event)
        except (Exception,KeyboardInterrupt):pass
        raise
    finally:
        # Only fixed events and observed metadata: never passwords/raw output/argv.
        record={'events':events,'result':failure_result if 'failure_result' in locals() else m.get('last_start',{'result':'UNKNOWN'}),'recovery_start':recovering}
        try:
            with evidence.open('x',encoding='utf8') as f:json.dump(record,f,indent=2)
        except (Exception,KeyboardInterrupt):pass


def install(m,password,run=process,process_check=os_process):
    require(m['phase']=='RUNNING','Install phase refused');artifacts(m);attest(m,password,database='postgres',run=run,process_check=process_check)
    try:
        psql(m,password,file=HERE/'sql/create_database.sql',database='postgres',run=run)
        for name in ['postgis.sql','baseline.sql','role.sql','read_only.sql']:
            attest(m,password,run=run,process_check=process_check)
            psql(m,password,file=HERE/'sql'/name,run=run)
        m['phase']='INSTALLED';save(m)
    except Exception:
        m['phase']='FAILED';save(m);raise

def snapshot(m,password,run=process,process_check=os_process):
    attest(m,password,run=run,process_check=process_check)
    catalog=json.loads(psql(m,password,file=REPO/'database/supabase/tests/catalog_snapshot.sql',run=run))
    extra=json.loads(psql(m,password,file=HERE/'sql/snapshot_extra.sql',run=run))
    return {'catalog':catalog,'extra':extra}

def canonical(v):
    if isinstance(v,dict):return {k:canonical(v[k]) for k in sorted(v)}
    if isinstance(v,list):return [canonical(x) for x in v]
    return v

def compare(left,right,role_mode='strict',sandbox=None):
    """v2 reference(left=operational) vs sandbox(right). No blanket role normalization."""
    require(role_mode in ['strict','installation-nologin'],'Unknown role comparison mode')
    required_catalog={'tables','columns','constraints','domains','indexes','triggers','functions','policies','table_external_acl','function_external_acl','schema_external_acl'}
    required_extra={'snapshot_version','identity','database','encoding','locale','postgis','ledger','column_grants','database_acl','default_acl','column_collation','roles','memberships','schema_config','object_acl','function_acl'}
    for side in [left,right]:
        require(isinstance(side,dict) and set(side)=={'catalog','extra'} and set(side['catalog'])==required_catalog and set(side['extra'])==required_extra,'Incomplete/unexpected v2 snapshot fields')
        c=side['catalog'];e=side['extra']
        require(e['snapshot_version']==2,'Snapshot v2 required; regenerate older references')
        require(e['encoding']=='UTF8' and isinstance(e['locale'],dict) and set(e['locale'])=={'datcollate','datctype','datlocprovider','datlocale'},'Invalid encoding/locale contract')
        loc=e['locale'];require(all(isinstance(loc[k],str) and loc[k] for k in ['datcollate','datctype']),'Missing locale')
        require(loc['datlocprovider'] in ['c','i','b'],'Unknown locale provider')
        require(loc['datlocale'] is None if loc['datlocprovider']=='c' else isinstance(loc['datlocale'],str) and bool(loc['datlocale']),'Invalid provider locale')
        require(e['postgis']==['3.6.2','extensions'],'PostGIS version/schema mismatch')
        require(len(c['tables'])==19 and all(t[1] is True and t[2] is True for t in c['tables']) and len(c['indexes'])==77 and all(i[2] is True and i[3] is True for i in c['indexes']) and len(c['triggers'])==55 and all(t[3]=='O' for t in c['triggers']) and len(c['functions'])==17 and all(f[3] is False for f in c['functions']) and sum(x[2]=='p' for x in c['constraints'])==19 and sum(x[2]=='f' for x in c['constraints'])==34 and all(x[4] is True for x in c['constraints'] if x[2]=='f') and sum(x[2]=='c' and x[4] is False for x in c['constraints'])==2 and len(c['policies'])==6,'Structural count/invariant mismatch')
        require([r['versao'] for r in e['ledger']]==['0001','0002','0003','0004','0005','local-read-0001'],'Unexpected ledger')
        require(isinstance(e['roles'],list) and len(e['roles'])==1,'Exactly one approved reader role required')
        r=e['roles'][0]
        require(len(r)==10 and r[0]==ROLE and isinstance(r[1],bool) and all(v is False for v in r[2:8]) and r[8]==5 and r[9] is None,'Unsafe role attributes/configuration')
        require(e['memberships']==[],'Reader memberships are forbidden')
        spec=json.loads((REPO/'database/local/security-spec.json').read_text())
        expected=sorted((t,col,ROLE,'SELECT',False) for t,cols in spec['grants'].items() for col in cols)
        require(sorted(tuple(x) for x in e['column_grants'])==expected,'Unexpected column privileges')
        require(c['table_external_acl']==[] and c['function_external_acl']==[] and c['schema_external_acl']==[[ROLE,'USAGE']],'Unexpected broad table/function/schema grants')
        require(all(a[0]=='postgres' and a[0]==a[3] for a in e['default_acl']),'Unexpected future-object privileges')
        require(all(a[0]=='postgres' and a[1] in ['CONNECT','CREATE','TEMPORARY'] or a==[ROLE,'CONNECT',False] for a in e['database_acl']),'Unexpected database privileges')
        require(all(a[0]=='sentinela' and a[1]=='postgres' and (a[2]=='postgres' or a[2:]==[ROLE,'USAGE',False]) for a in e['schema_config']),'Unexpected schema ownership/privileges')
        for owner_field in ['object_acl','function_acl']:
            for acl in e[owner_field]:
                # table: name,owner,grantee,priv,grantable; function includes args.
                require(acl[-4]=='postgres' and acl[-4]==acl[-3],'Unexpected ownership/external object/function grant')
        require(all(p['cmd']=='SELECT' and p['roles']==[ROLE] and p['permissive']=='PERMISSIVE' for p in c['policies']),'Unexpected policy command/role/kind')
    op=left['extra'];target=right['extra']
    def identity(e,host,port,database):
        i=e['identity']
        require(set(i)=={'host','port','system_id','sandbox_uuid','data','server_version_num','user'},'Incomplete server-derived identity')
        require(e['database']==database and i['host']==host and i['port']==port and i['server_version_num']==170011 and i['user']=='postgres','Unexpected snapshot endpoint/version/executor')
        require(re.fullmatch('[0-9]+',i['system_id'] or '') is not None and isinstance(i['data'],str) and bool(i['data']),'Missing server identity')
    identity(op,HOST,5432,'sentinela_dev_operacional');identity(target,HOST,PORT,DB)
    require(op['identity']['sandbox_uuid'] in [None,''] and op['identity']['system_id']!=target['identity']['system_id'] and Path(op['identity']['data']).resolve()!=Path(target['identity']['data']).resolve(),'Shared/unexpected cluster identity')
    try: require(str(uuid.UUID(target['identity']['sandbox_uuid']))==target['identity']['sandbox_uuid'],'Noncanonical sandbox UUID')
    except (ValueError,TypeError,AttributeError):raise Refused('Invalid sandbox UUID') from None
    require(op['roles'][0][1] is True,'Operational reference must retain LOGIN')
    if role_mode=='installation-nologin':
        require(sandbox is not None and sandbox['phase']=='INSTALLED','NOLOGIN exception requires identified INSTALLED sandbox manifest')
        require(target['roles'][0][1] is False,'Installation reader must remain NOLOGIN')
    else:require(target['roles'][0][1] is True,'Strict comparison requires authenticated LOGIN role')
    if sandbox is not None:
        require(sandbox['host']==HOST and sandbox['port']==PORT and sandbox['database']==DB,'Unexpected manifest endpoint')
        require(target['identity']['sandbox_uuid']==sandbox['uuid'] and target['identity']['system_id']==sandbox['system_id'] and Path(target['identity']['data']).resolve()==Path(sandbox['data']).resolve(),'Snapshot does not match identified manifest')
    # Only endpoint identity, database name, ledger timestamps and the specifically
    # approved installation LOGIN difference are normalized. Everything else compares.
    def normalized(s):
        s=json.loads(json.dumps(s));s['extra']['database']=DB;s['extra']['identity']='VERIFIED_DISTINCT_LOCAL_CLUSTERS'
        s['extra']['ledger']=[{'versao':r['versao'],'descricao':r['descricao']} for r in s['extra']['ledger']]
        if role_mode=='installation-nologin':s['extra']['roles'][0][1]=False
        return canonical(s)
    a,b=normalized(left),normalized(right);differences=[]
    for section in ['catalog','extra']:
        for key in set(a[section])|set(b[section]):
            if a[section].get(key)!=b[section].get(key):differences.append(section+'.'+key)
    require(not differences,'Structural drift: '+','.join(sorted(differences)))


def fixtures(m,password,reference,run=process,process_check=os_process):
    require(m['phase']=='INSTALLED','Fixture phase refused');artifacts(m)
    compare(reference,snapshot(m,password,run,process_check))
    try:
        psql(m,password,file=HERE/'sql/fixtures.sql',run=run)
        m['phase']='FIXTURES';save(m)
    except Exception:
        m['phase']='FAILED';save(m);raise

def test(m,admin,reader,reference,run=process,process_check=os_process):
    require(m['phase']=='FIXTURES','Test phase refused');artifacts(m)
    report=[]
    def scenario(name,fn):
        try:fn();report.append({'scenario':name,'result':'PASS'})
        except Exception:report.append({'scenario':name,'result':'FAIL'});raise
    try:
        scenario('structural_definitions_before',lambda:compare(reference,snapshot(m,admin,run,process_check)))
        scenario('all_synthetic_rows_and_attributes',lambda:psql(m,admin,file=HERE/'sql/fixture_attestation.sql',run=run))
        # Every authorization probe uses a fresh directly authenticated reader, never SET ROLE.
        scenario('six_policies_exact_UUIDs_and_relationships',lambda:psql(m,reader,file=HERE/'sql/rls.sql',role=ROLE,run=run))
        scenario('permission_denials',lambda:psql(m,reader,file=HERE/'sql/permissions.sql',role=ROLE,run=run))
        for host,db,label in [(HOST,'postgres','other_database'),('::1',DB,'ipv6')]:
            def denied(host=host,db=db):
                try:
                    args=['-X','-w','-h',host,'-p',str(PORT),'-U',ROLE,'-d',db,'-v','ON_ERROR_STOP=1','-qAt','-c','SELECT 1']
                    # Separate refusal checker never exposes raw libpq errors.
                    refusal(args,reader)
                except Refused:raise
            scenario(label,denied)
        scenario('structural_definitions_after',lambda:compare(reference,snapshot(m,admin,run,process_check)))
        m['phase']='TESTED';save(m)
    finally:
        (Path(m['root'])/'evidence/test-report.json').write_text(json.dumps({'result':'PASS' if len(report)==7 and all(r['result']=='PASS' for r in report) else 'FAIL','scenarios':report,'row_filtering_tested':any(r['scenario']=='six_policies_exact_UUIDs_and_relationships' and r['result']=='PASS' for r in report)},indent=2))
    return report

def refusal(args,password):
    r=subprocess.run([str(BIN/'psql.exe'),*args],env=environment(password),capture_output=True,text=True,timeout=15)
    require(r.returncode!=0,'Forbidden connection unexpectedly succeeded')
    if args[args.index('-h')+1]=='::1':
        require(args[args.index('-p')+1]==str(PORT),'Unexpected refusal endpoint')
        # IPv4-only server has no IPv6 socket, so no HBA exchange is possible.
        with socket.socket(socket.AF_INET6,socket.SOCK_STREAM) as s:
            s.settimeout(2)
            code=s.connect_ex(('::1',PORT))
            require(code!=0,'IPv6 connection unexpectedly succeeded')
        if code not in (10061,111):
            # Windows timed connect_ex may return WSAEWOULDBLOCK (10035).
            # Do not treat a client error alone as proof: corroborate OS listeners.
            script="$ErrorActionPreference='Stop';$l=@(Get-NetTCPConnection -State Listen | Where-Object LocalPort -eq 55432);@{ipv6=@($l|Where-Object {$_.LocalAddress -match ':'}).Count;ipv4=@($l|Where-Object LocalAddress -eq '127.0.0.1').Count}|ConvertTo-Json -Compress"
            proof=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',script],env=environment(),capture_output=True,text=True,timeout=10)
            require(proof.returncode==0,'IPv6 OS listener observation unavailable')
            observed=json.loads(proof.stdout)
            require(observed=={'ipv6':0,'ipv4':1},'IPv6 listener/ambiguous connectivity; refusal unproven')
    else:require('pg_hba.conf' in r.stderr and re.search('reject|rejeit',r.stderr,re.I),'Expected explicit HBA rejection')

def backup(m,password,run=process,process_check=os_process):
    attest(m,password,run=run,process_check=process_check)
    p=Path(m['root'])/'evidence'/('backup-'+str(uuid.uuid4())+'.dump')
    run('pg_dump',['-h',HOST,'-p',str(PORT),'-U','postgres','-d',DB,'-w','-Fc','-f',str(p)],password=password)
    run('pg_restore',['--list',str(p)])
    run('pg_restore',['--file',os.devnull,str(p)])
    record={'file':p.name,'sha256':digest(p),'bytes':p.stat().st_size,'restoration_tested':False}
    (p.with_suffix('.json')).write_text(json.dumps(record,indent=2));return record

def verify_backup(m,record,run=process):
    no_links(record)
    require(Path(record).resolve().parent==Path(m['root']).resolve()/'evidence','Backup record outside private evidence')
    r=json.loads(Path(record).read_text());name=r['file']
    require(re.fullmatch(r'backup-[0-9a-f-]{36}\.dump',name) is not None,'Unexpected backup name')
    p=Path(m['root'])/'evidence'/name;no_links(p)
    require(p.stat().st_size==r['bytes'] and digest(p)==r['sha256'],'Backup integrity mismatch; no recovery attempted')
    run('pg_restore',['--list',str(p)]);run('pg_restore',['--file',os.devnull,str(p)])
    return {'integrity':'PASS','restoration_tested':False}


def stop(m,password,run=process,probe=free_port,process_check=os_process):
    require(m['phase'] in ['RUNNING','INSTALLED','FIXTURES','TESTED','FAILED','START_FAILED','ATTESTATION_FAILED','START_UNKNOWN'],'Stop phase refused')
    attest(m,password,database='postgres',run=run,process_check=process_check)
    run('pg_ctl',['-D',m['data'],'-m','fast','-w','stop'])
    require(probe() and not (Path(m['data'])/'postmaster.pid').exists(),'Stop not confirmed')
    m['phase']='STOPPED';save(m)

def discard(m,authorization,run=process,probe=free_port):
    require(authorization==m['uuid'],'Explicit UUID authorization required')
    require(m['phase']=='STOPPED','Stop and attest cluster first')
    # Reload identity from disk; never trust caller-supplied deletion targets.
    actual=load(Path(m['root'])/'manifest.json');require(actual==m,'Manifest changed')
    no_links(m['data'],True)
    require(Path(m['data']).resolve()==Path(m['root']).resolve()/'data','Deletion path mismatch')
    require((Path(m['data'])/'PG_VERSION').read_text().strip()=='17','Invalid data directory')
    require(control_id(m,run)==m['system_id'],'Wrong system identifier')
    marker=json.loads((Path(m['data'])/'sentinela-sandbox.json').read_text())
    require(all(marker.get(k)==m[k] for k in ['kind','uuid','system_id','data','port','database']),'Marker mismatch')
    require(not list((Path(m['data'])/'pg_tblspc').iterdir()),'External tablespace refused')
    require(probe() and not (Path(m['data'])/'postmaster.pid').exists(),'Running/occupied endpoint refused')
    shutil.rmtree(m['data']) # Only this verified exclusive data path, never root/evidence.
    require(not Path(m['data']).exists(),'Discard not confirmed');m['phase']='DISCARDED';save(m)

def windows_observation(m):
    """Fail closed: unavailable WMI/token information is never absence proof."""
    require(os.name=='nt','Windows observation required')
    from ctypes import wintypes
    k=ctypes.WinDLL('kernel32',use_last_error=True)
    k.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD];k.OpenProcess.restype=wintypes.HANDLE
    h=k.OpenProcess(0x1000,False,m['pid'])
    if h:
        k.CloseHandle.argtypes=[wintypes.HANDLE];k.CloseHandle(h)
        raise Refused('Registered PID active or reused')
    require(ctypes.get_last_error()==87,'PID absence unknown; access denied is not absence')
    script="""$ErrorActionPreference='Stop';
$p=@(Get-CimInstance Win32_Process -Filter \"Name='postgres.exe' OR Name='pg_ctl.exe' OR Name='initdb.exe'\" | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine);
$l=@(Get-NetTCPConnection -State Listen | Where-Object LocalPort -eq 55432 | Select-Object OwningProcess);
@{processes=$p;listeners=$l}|ConvertTo-Json -Depth 5 -Compress"""
    r=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',script],
        capture_output=True,text=True,timeout=15,env=environment())
    require(r.returncode==0,'Process inventory unavailable; no reconciliation')
    o=json.loads(r.stdout);require(not o['listeners'] and free_port(),'Listener present')
    rows=o['processes'];ids={p['ProcessId'] for p in rows if p['ExecutablePath'] and p['CommandLine']}
    for p in rows:
        require(p['ExecutablePath'] and p['CommandLine'],'Incomplete process inventory')
        cmd=p['CommandLine'].casefold()
        require(str(Path(m['data'])).casefold() not in cmd and m['uuid'].casefold() not in cmd,
                'Associated sandbox process present')
        require(Path(p['ExecutablePath']).name.lower()=='postgres.exe','Concurrent PostgreSQL maintenance')
        # An orphan without an inspectable -D root is ambiguous, even on another port.
        require(p['ParentProcessId'] in ids or re.search(r'(?:^|[\s\"])-D(?:\s|\")',cmd,re.I),
                'Unattributed PostgreSQL process')
    return {'registered_pid_absent':True,'associated_processes_absent':True,'port_free':True}


def stopped_state(m,run=process,observe=windows_observation):
    """Read-only observation, not a promise that no process can start later."""
    require(load(Path(m['root'])/'manifest.json')==m,'Manifest changed')
    require(m['phase'] in ['RUNNING','RECOVERY_REQUIRED'],'Reconciliation phase refused')
    d=Path(m['data']);no_links(d,True)
    require((d/'PG_VERSION').read_text().strip()=='17','Invalid PG_VERSION')
    require(not list((d/'pg_tblspc').iterdir()),'External tablespaces refused')
    marker=json.loads((d/'sentinela-sandbox.json').read_text())
    require(all(marker.get(k)==m[k] for k in ['uuid','system_id','data','port','database','kind']),'Marker mismatch')
    for name,h in m['runtime_files'].items():require(digest(d/name)==h,'Runtime drift')
    pid,epoch=pid_file(m)
    require((pid,epoch)==(m['pid'],m['start_epoch']),'Residual PID mismatch')
    lines=(d/'postmaster.pid').read_text().splitlines()
    require(len(lines)>=4 and Path(lines[1]).resolve()==d.resolve() and int(lines[3])==PORT,'Residual PID endpoint mismatch')
    observation=observe(m)
    require(all(observation.get(k) is True for k in ['registered_pid_absent','associated_processes_absent','port_free']), 'Absence not proven')
    raw=run('pg_controldata',[d]);require(control_id(m,run)==m['system_id'],'System identifier mismatch')
    def field(label):
        match=re.search(r'^'+re.escape(label)+r':\s*(.*?)\s*$',raw,re.M)
        require(match is not None,'Control field missing');return match.group(1)
    require(field('Database cluster state')=='in production','Expected unclean shutdown')
    segment=field("Latest checkpoint's REDO WAL file");redo=field("Latest checkpoint's REDO location")
    require(re.fullmatch(r'[0-9A-F]{24}',segment) and re.fullmatch(r'[0-9A-F]+/[0-9A-F]+',redo),'Invalid WAL identity')
    wal=d/'pg_wal'/segment
    require(wal.is_file() and wal.stat().st_size==int(field('Bytes per WAL segment')),'Required WAL missing/incomplete')
    output=run('pg_waldump',['-p',d/'pg_wal','-s',redo,'-n','1',segment])
    require(bool(output),'REDO record unreadable')
    return {'pid':pid,'start_epoch':epoch,'control_state':'in production','redo':redo,
            'wal_segment':segment,'wal_sha256':digest(wal),'observation':observation}


def file_inventory(root):
    """Sizes, hashes, timestamps, attributes and DACL/owner/group, never SACL."""
    root=Path(root);no_links(root,True)
    script="""$ErrorActionPreference='Stop';$p=$env:SENTINELA_INVENTORY_ROOT;
$s=[Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group;
@(@(Get-Item -LiteralPath $p)+@(Get-ChildItem -LiteralPath $p -Recurse -Force) | ForEach-Object {
$a=if($_.PSIsContainer){[IO.Directory]::GetAccessControl($_.FullName,$s)}else{[IO.File]::GetAccessControl($_.FullName,$s)};
@{path=$_.FullName.Substring($p.Length);acl=$a.GetSecurityDescriptorSddlForm($s)}})|ConvertTo-Json -Depth 4 -Compress"""
    e=environment();e['SENTINELA_INVENTORY_ROOT']=str(root)
    r=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',script],env=e,capture_output=True,text=True,timeout=60)
    require(r.returncode==0,'Metadata inventory failed')
    acls={x['path'].lstrip('\\/'):x['acl'] for x in json.loads(r.stdout)}
    result={}
    for p in [root,*sorted(root.rglob('*'))]:
        key=str(p.relative_to(root)) if p!=root else '';s=p.stat()
        require(key in acls,'Incomplete ACL inventory')
        result[key]={'directory':p.is_dir(),'bytes':s.st_size if p.is_file() else None,
            'sha256':digest(p) if p.is_file() else None,'mtime_ns':s.st_mtime_ns,
            'attributes':getattr(s,'st_file_attributes',0),'acl':acls[key]}
    return result


def copy_location(m,record):
    record=Path(record);no_links(record)
    parent=record.parent
    require(parent.parent.resolve()==BASE.resolve() and re.fullmatch('recovery-copy-[0-9a-f-]{36}',parent.name)
            and record.name=='copy.json','Unexpected physical copy path')
    require(parent.resolve()!=Path(m['root']).resolve(),'Copy overlaps original')
    return parent


def physical_copy(m,authorization,manifest_hash,run=process,observe=windows_observation,inventory=file_inventory):
    require(authorization==m['uuid'],'Explicit UUID required')
    source=Path(m['root']);require(digest(source/'manifest.json')==manifest_hash,'Manifest hash mismatch')
    artifacts(m);stopped_state(m,run,observe)
    before=inventory(source)
    require(shutil.disk_usage(BASE).free>sum(x['bytes'] or 0 for x in before.values())+64*1024*1024,'Insufficient copy space')
    target=BASE/('recovery-copy-'+str(uuid.uuid4()));no_links(target)
    target.mkdir(exist_ok=False);private_directory(target)
    # Destination root must be new. robocopy never receives /MIR, /PURGE or /MOVE.
    payload=target/'payload'
    r=subprocess.run(['robocopy.exe',str(source),str(payload),'/E','/COPY:DATS','/DCOPY:DAT','/XJ','/R:0','/W:0','/NFL','/NDL','/NJH','/NJS','/NP'],
        env=environment(),capture_output=True,timeout=300)
    require(r.returncode in (0,1),'Physical copy failed/ambiguous; preserve destination')
    stopped_state(m,run,observe)
    require(before==inventory(source)==inventory(payload),'Physical copy size/hash/ACL/metadata mismatch')
    record={'kind':'sentinela-stopped-copy-v1','uuid':m['uuid'],'system_id':m['system_id'],
        'source':str(source),'manifest_sha256':manifest_hash,'inventory':before,
        'utc':datetime.now(timezone.utc).isoformat()}
    path=target/'copy.json'
    with path.open('x',encoding='utf8') as f:json.dump(record,f,indent=2)
    return path


def verify_physical_copy(m,record,run=process,inventory=file_inventory):
    parent=copy_location(m,record);r=json.loads(Path(record).read_text())
    require(r['kind']=='sentinela-stopped-copy-v1' and r['uuid']==m['uuid'] and r['system_id']==m['system_id']
            and Path(r['source']).resolve()==Path(m['root']).resolve(),'Copy identity mismatch')
    require(inventory(parent/'payload')==r['inventory'],'Copy incomplete or changed')
    current=inventory(Path(m['data']))
    expected={str(Path(k).relative_to('data')) if k!='data' else '':v for k,v in r['inventory'].items() if k=='data' or k.startswith('data'+os.sep)}
    require(current==expected,'Data changed since stopped copy')
    original=json.loads((parent/'payload/manifest.json').read_text())
    require(digest(parent/'payload/manifest.json')==r['manifest_sha256'] and original['artifacts']==m['artifacts']
            and original['runtime_files']==m['runtime_files'],'Copy review mismatch')
    return r


def reconcile(m,authorization,manifest_hash,record,run=process,observe=windows_observation):
    require(authorization==m['uuid'] and m['phase']=='RUNNING','Explicit stale RUNNING UUID required')
    manifest=Path(m['root'])/'manifest.json';require(digest(manifest)==manifest_hash,'Manifest hash mismatch')
    artifacts(m);state=stopped_state(m,run,observe);verify_physical_copy(m,record,run)
    proposed=json.loads(json.dumps(m));proposed.update(phase='RECOVERY_REQUIRED',recovery_copy=str(Path(record).resolve()))
    audit={'uuid':m['uuid'],'system_id':m['system_id'],'previous_manifest_sha256':manifest_hash,
        'old_phase':m['phase'],'new_phase':'RECOVERY_REQUIRED','state':state,
        'copy_record_sha256':digest(record),'utc':datetime.now(timezone.utc).isoformat()}
    proposed.setdefault('reconciliations',[]).append(audit)
    evidence=Path(m['root'])/'evidence'/('reconcile-'+str(uuid.uuid4()))
    evidence.mkdir(exist_ok=False)
    # Intent is durable BEFORE manifest replacement. Failure preserves all evidence.
    (evidence/'before.json').write_bytes(manifest.read_bytes())
    (evidence/'proposed.json').write_text(json.dumps(proposed,indent=2),encoding='utf8')
    stopped_state(m,run,observe)
    require(digest(manifest)==manifest_hash,'Concurrent manifest change')
    artifacts(m);verify_physical_copy(m,record,run)
    save(proposed)
    require(load(manifest)==proposed,'Reconciliation write not confirmed')
    (evidence/'after.json').write_bytes(manifest.read_bytes())
    return proposed


def approve_recovery_artifacts(m,plan,plan_hash,authorization,run=process,observe=windows_observation):
    """Stopped-only bootstrap; not an authenticated live-server approval."""
    require(authorization==m['uuid'] and m['phase']=='RUNNING','Explicit stale RUNNING UUID required')
    manifest=Path(m['root'])/'manifest.json';no_links(plan)
    require(digest(plan)==plan_hash,'Plan hash mismatch')
    review=json.loads(Path(plan).read_text());previous=digest(manifest)
    require(set(review)=={'uuid','system_id','manifest_sha256','changes'} and review['uuid']==m['uuid']
            and review['system_id']==m['system_id'] and review['manifest_sha256']==previous,'Stale/invalid recovery review')
    require(1<=len(review['changes'])<=2,'Review scope refused')
    proposed=json.loads(json.dumps(m));seen=set()
    for change in review['changes']:
        require(set(change)=={'artifact','old_sha256','new_sha256'},'Invalid review entry')
        name=change['artifact'];require(name in REVISION_ALLOWLIST and name not in seen,'Review scope refused');seen.add(name)
        keys=[k for k in m['artifacts'] if (REPO/k).resolve()==(REPO/name).resolve()]
        require(len(keys)==1 and all(re.fullmatch('[0-9a-f]{64}',change[k]) for k in ['old_sha256','new_sha256']),'Invalid hashes')
        key=keys[0];no_links(REPO/name)
        require(m['artifacts'][key]==change['old_sha256'] and digest(REPO/name)==change['new_sha256']
                and change['old_sha256']!=change['new_sha256'],'Review hashes mismatch')
        proposed['artifacts'][key]=change['new_sha256']
    artifacts(proposed);stopped_state(m,run,observe)
    require(digest(manifest)==previous and digest(plan)==plan_hash,'Concurrent review change')
    audit={'uuid':m['uuid'],'system_id':m['system_id'],'previous_manifest_sha256':previous,
        'plan_sha256':plan_hash,'changes':review['changes'],'utc':datetime.now(timezone.utc).isoformat(),
        'attestation':'STOPPED_FILES_AND_OS_ONLY','authenticated_server':False}
    proposed.setdefault('recovery_artifact_approvals',[]).append(audit)
    evidence=Path(m['root'])/'evidence'/('recovery-approval-'+str(uuid.uuid4())+'.json')
    with evidence.open('x',encoding='utf8') as f:json.dump(audit,f,indent=2)
    artifacts(proposed);save(proposed);return proposed


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('command',choices=['approve-recovery-artifacts','copy-stopped','reconcile','approve-artifacts','approve-controller','prepare','create','start','verify','install','snapshot','compare','configure-reader','fixtures','test','backup','verify-backup','stop','discard'])
    p.add_argument('--manifest-sha256')
    p.add_argument('--role-mode',choices=['strict','installation-nologin'],default='strict');p.add_argument('--sandbox-manifest',type=Path);p.add_argument('--revision-plan',type=Path);p.add_argument('--plan-sha256');p.add_argument('--previous-sha256');p.add_argument('--reviewed-sha256');p.add_argument('--backup-record',type=Path);p.add_argument('--manifest',type=Path);p.add_argument('--locale');p.add_argument('--reference',type=Path);p.add_argument('--authorize');p.add_argument('--execute',action='store_true')
    a=p.parse_args()
    if a.command=='compare':
        require(a.reference and a.manifest,'Provide snapshot files with --reference and --manifest')
        compare(json.loads(a.reference.read_text()),json.loads(a.manifest.read_text()),role_mode=a.role_mode,sandbox=load(a.sandbox_manifest) if a.sandbox_manifest else None);print('PASS structural comparison');return
    require(a.execute,'No operation executed: explicit --execute required')
    if a.command=='prepare':m=prepare(a.locale);print('PREPARED '+str(Path(m['root'])/'manifest.json'));return
    require(a.manifest is not None,'Manifest required');m=load(a.manifest)
    if a.command=='approve-recovery-artifacts':
        require(a.revision_plan is not None,'Revision plan required')
        approve_recovery_artifacts(m,a.revision_plan,a.plan_sha256,a.authorize);print('PASS stopped artifact review; no start/reconciliation');return
    if a.command=='copy-stopped':
        print('PASS physical copy: '+str(physical_copy(m,a.authorize,a.manifest_sha256)));return
    if a.command=='reconcile':
        require(a.backup_record is not None,'Physical copy record required')
        reconcile(m,a.authorize,a.manifest_sha256,a.backup_record);print('PASS RECOVERY_REQUIRED; server not started');return
    if a.command=='approve-controller':
        approve_controller(m,a.previous_sha256,a.reviewed_sha256,a.authorize);print('PASS: controller approval recorded; cluster remains stopped');return
    if a.command=='approve-artifacts':
        require(a.revision_plan is not None,'Reviewed revision plan required')
        password=secret('Sandbox administrator password (hidden): ');progress('PASSWORD_READY')
        approve_artifacts(m,a.revision_plan,a.plan_sha256,a.authorize,password);print('PASS: reviewed artifacts approved; cluster identity/phase preserved');return
    if a.command=='create':create(m);return
    if a.command=='discard':discard(m,a.authorize);return
    if a.command=='verify-backup':
        require(a.backup_record is not None,'Backup record required');print(json.dumps(verify_backup(m,a.backup_record)));return
    password=secret('Sandbox administrator password (hidden): ')
    progress('PASSWORD_READY')
    if a.command=='start':start(m,password)
    elif a.command=='verify':attest(m,password,database='postgres');print('PASS identity')
    elif a.command=='install':install(m,password)
    elif a.command=='configure-reader':
        require(m['phase']=='INSTALLED','Reader setup phase refused');artifacts(m);attest(m,password)
        args=['-X','-w','-h',HOST,'-p',str(PORT),'-U','postgres','-d',DB,'-v','ON_ERROR_STOP=1']
        for k,v in [('sandbox_uuid',m['uuid']),('sandbox_systemid',m['system_id']),('sandbox_data',m['data']),('sandbox_start',m.get('start_epoch') or 0)]:args+=['-v',k+'='+str(v)]
        process('psql',args+['-f',str(HERE/'sql/configure_reader.sql')],password=password,console=True)
    elif a.command=='snapshot':
        s=snapshot(m,password);f=Path(m['root'])/'evidence'/('snapshot-'+str(uuid.uuid4())+'.json');f.write_text(json.dumps(s,indent=2));print('Snapshot saved in private evidence directory')
    elif a.command=='fixtures':
        require(a.reference is not None,'Reviewed operational reference snapshot required');fixtures(m,password,json.loads(a.reference.read_text()))
    elif a.command=='test':
        require(a.reference is not None,'Reference required');reader=secret('Sandbox reader password (hidden): ');test(m,password,reader,json.loads(a.reference.read_text()))
    elif a.command=='backup':backup(m,password)
    elif a.command=='stop':stop(m,password)
    password=None

if __name__=='__main__':
    try:main()
    except KeyboardInterrupt: print('STOPPED: result may be unknown; preserve evidence and verify identity before any action.',file=sys.stderr);sys.exit(130)
    except Refused as e: print('FAIL: '+str(e)+'; no automatic retry or cleanup.',file=sys.stderr);sys.exit(1)
    except (OSError,ValueError,KeyError,TypeError):print('FAIL: invalid/unavailable sandbox state; raw diagnostics withheld.',file=sys.stderr);sys.exit(1)
