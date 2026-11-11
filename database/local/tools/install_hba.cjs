// One-off local maintenance helper. Never uses application .env or a remote connection.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const QUERIES={"globals":"SELECT jsonb_build_object('identity',jsonb_build_array(current_database(),host(inet_server_addr()),inet_server_port(),current_user,current_setting('server_version'),current_setting('server_encoding')),'postgis',(SELECT jsonb_build_array(e.extversion,n.nspname) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='postgis'),'databases',(SELECT jsonb_agg(jsonb_build_array(oid,datname,datdba,datallowconn,datistemplate,datacl) ORDER BY oid) FROM pg_database),'roles',(SELECT jsonb_agg(to_jsonb(r)-'rolpassword' ORDER BY oid) FROM pg_roles r),'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor),'[]'::jsonb) FROM pg_auth_members m),'defaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY oid),'[]'::jsonb) FROM pg_default_acl d),'ledger',(SELECT jsonb_agg(to_jsonb(s) ORDER BY versao) FROM sentinela.schema_migrations s),'event_triggers',(SELECT count(*) FROM pg_event_trigger),'active_sessions',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state='active'),'marker',obj_description('sentinela'::regnamespace,'pg_namespace'),'column_grants',(SELECT coalesce(jsonb_agg(jsonb_build_array(c.relname,a.attname,x.grantee,x.privilege_type,x.is_grantable) ORDER BY c.relname,a.attname,x.grantee,x.privilege_type),'[]'::jsonb) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE c.relnamespace='sentinela'::regnamespace),'occurrences',(SELECT count(*) FROM sentinela.ocorrencias))","role":"SELECT jsonb_build_object('name',r.rolname,'oid',r.oid,'login',r.rolcanlogin,'superuser',r.rolsuper,'bypassrls',r.rolbypassrls,'createdb',r.rolcreatedb,'createrole',r.rolcreaterole,'replication',r.rolreplication,'inherit',r.rolinherit,'connection_limit',r.rolconnlimit,'config',r.rolconfig,'password_is_null',(SELECT rolpassword IS NULL FROM pg_authid WHERE oid=r.oid),'memberships',(SELECT count(*) FROM pg_auth_members WHERE roleid=r.oid OR member=r.oid),'dependencies',(SELECT count(*) FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r.oid)) FROM pg_roles r WHERE rolname='sentinela_local_reader'","server":"SELECT jsonb_build_object('identity',jsonb_build_array(current_database(),host(inet_server_addr()),inet_server_port(),current_user,current_setting('server_version')),'hba_file',current_setting('hba_file'),'data_directory',current_setting('data_directory'),'listen_addresses',current_setting('listen_addresses'),'backend_pid',pg_backend_pid(),'rules',(SELECT jsonb_agg(to_jsonb(h) ORDER BY rule_number) FROM pg_hba_file_rules h))"};
const TARGET='C:/Program Files/PostgreSQL/17/data/pg_hba.conf';
const PSQL='C:/Program Files/PostgreSQL/17/bin/psql.exe';
const BASE=['-X','-w','-h','127.0.0.1','-p','5432','-U','postgres','-d','sentinela_dev_operacional','-v','ON_ERROR_STOP=1','-qAt'];
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=m=>{throw Error(m)};
function powershell(command){
 const {runPowerShell}=require('./atomic_replace.cjs');
 return runPowerShell("$value = & { "+command+" }; @{ok=$true;value=($value -join [Environment]::NewLine)} | ConvertTo-Json -Compress",'metadata').value.trim();
}

const literal=p=>"'"+p.replace(/'/g,"''")+"'";
function security(p){
 return powershell("$ErrorActionPreference='Stop'; $s=[Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group; [IO.File]::GetAccessControl("+literal(p)+",$s).GetSecurityDescriptorSddlForm($s)");
}
function otherConfigurations(){
 const out={};for(const n of ['postgresql.conf','postgresql.auto.conf','pg_ident.conf']){
 const p=path.join(path.dirname(TARGET),n);out[n]=fs.existsSync(p)?digest(fs.readFileSync(p)):null;}return out;
}
class Admin {
 constructor(){
  this.env={...process.env};for(const k of Object.keys(this.env))if(k.startsWith('PG')&&!['PGPASSFILE'].includes(k))delete this.env[k];
  Object.assign(this.env,{PGCLIENTENCODING:'UTF8',PGCONNECT_TIMEOUT:'5',PGAPPNAME:'sentinela-hba-controlled-maintenance',PGOPTIONS:'-c statement_timeout=15000 -c default_transaction_read_only=on'});
  this.child=spawn(PSQL,BASE,{env:this.env,windowsHide:true,stdio:['pipe','pipe','pipe']});this.buffer='';this.waiting=null;
  this.child.stdout.on('data',chunk=>{this.buffer+=chunk.toString('utf8');let at;
   while((at=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,at).replace(/\r$/,'');this.buffer=this.buffer.slice(at+1);
    if(!this.waiting)continue;if(line===this.waiting.marker){const w=this.waiting;this.waiting=null;clearTimeout(w.timer);w.resolve(w.lines.join('\n').trim());}else this.waiting.lines.push(line);}});
  this.child.stderr.on('data',()=>{}); // Never print libpq payloads or credentials.
  this.child.on('error',()=>this.reject('Administrative local process failed.'));
  this.child.on('exit',()=>this.reject('Administrative session ended unexpectedly.'));
 }
 reject(message){if(this.waiting){const w=this.waiting;this.waiting=null;clearTimeout(w.timer);w.reject(Error(message));}}
 query(q){
  if(this.waiting)fail('Concurrent maintenance query refused.');
  return new Promise((resolve,reject)=>{const marker='SENTINELA_DONE_'+crypto.randomUUID().replaceAll('-','');
   const timer=setTimeout(()=>{this.reject('Local read-only query timed out.');this.child.kill();},25000);
   this.waiting={marker,timer,resolve,reject,lines:[]};
   this.child.stdin.write('BEGIN READ ONLY; '+q+'; COMMIT;\n\\echo '+marker+'\n');
  }).then(text=>JSON.parse(text));
 }
 close(){if(this.child.exitCode===null)this.child.stdin.end('\\q\n');}
}
async function snapshot(admin){
 const server=await admin.query(QUERIES.server),globals=await admin.query(QUERIES.globals),role=await admin.query(QUERIES.role);
 const catalog=await admin.query(fs.readFileSync('database/supabase/tests/catalog_snapshot.sql','utf8'));
 return {server,globals,role,catalog};
}
function validate(s){
 if(!equal(s.server.identity,['sentinela_dev_operacional','127.0.0.1',5432,'postgres','17.11']))fail('Unexpected administrative endpoint.');
 if(path.resolve(s.server.hba_file).toLowerCase()!==path.resolve(TARGET).toLowerCase()||
    path.resolve(s.server.data_directory).toLowerCase()!==path.dirname(path.resolve(TARGET)).toLowerCase())fail('Unexpected local cluster or HBA path.');
 const r=s.role;
 if(!r||['login','superuser','bypassrls','createdb','createrole','replication','inherit'].some(k=>r[k]!==false)||
    !r.password_is_null||r.connection_limit!==5||r.memberships!==0)fail('Reader role state changed.');
 if(!equal(s.globals.postgis,['3.6.2','extensions'])||
    !equal(s.globals.ledger.map(x=>x.versao),['0001','0002','0003','0004','0005','local-read-0001'])||
    s.catalog.policies.length!==6||s.globals.column_grants.length!==48||s.globals.event_triggers!==0)fail('Database baseline/read-layer state changed.');
 if(s.server.rules.some(r=>r.error!==null))fail('HBA contains parser errors.');
 const spec=JSON.parse(fs.readFileSync('database/local/security-spec.json','utf8'));
 const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 for(const [k,h]of Object.entries(spec.structural_sha256))if(digest(JSON.stringify(canonical(s.catalog[k])))!==h)fail('Baseline structural drift: '+k);
}
const normalizedRules=rs=>rs.map(({line_number,rule_number,...r})=>r);
async function unchanged(admin,before){
 const after=await snapshot(admin);validate(after);
 if(after.server.backend_pid!==before.server.backend_pid)fail('Preexisting administrative session was lost.');
 if(after.server.listen_addresses!==before.server.listen_addresses)fail('Listener configuration changed.');
 for(const k of ['globals','role','catalog'])if(!equal(after[k],before[k]))fail('Database/role/ACL state changed: '+k);
 return after;
}
// Reviewed atomic primitive lives outside ignored tmp; imports have no side effects.
const { controlledReplace, metadata, sameMetadata } = require('./atomic_replace.cjs');
function atomicReplace(bytes, backup, expectedOriginal, expectedCandidate){
 return controlledReplace({target:TARGET,backup,candidate:bytes,
   originalHash:expectedOriginal,candidateHash:expectedCandidate});
}

const expectedPrefix=[
 ['local','all',null,null,'reject'],['local','replication',null,null,'reject'],
 ['host','sentinela_dev_operacional','127.0.0.1','255.255.255.255','scram-sha-256'],
 ['host','all','0.0.0.0','0.0.0.0','reject'],['host','all','::','::','reject'],
 ['host','replication','0.0.0.0','0.0.0.0','reject'],['host','replication','::','::','reject']
];
function prefixValid(rules){
 const prefix=rules.slice(0,7);
 if(prefix.length!==7)fail('HBA prefix missing.');
 prefix.forEach((r,i)=>{if(!equal([r.type,r.database[0],r.address,r.netmask,r.auth_method],expectedPrefix[i])||
   !equal(r.user_name,['sentinela_local_reader'])||r.database.length!==1||r.options!==null||r.error!==null)fail('HBA prefix differs from approved rules.');});
 if(rules.filter(r=>r.user_name.includes('sentinela_local_reader')).length!==7)fail('Duplicate reader HBA block.');
}
function singleConnection(role,database,host='127.0.0.1'){
 const args=[...BASE];args[args.indexOf('-U')+1]=role;args[args.indexOf('-d')+1]=database;args[args.indexOf('-h')+1]=host;
 return spawnSync(PSQL,[...args,'-c','SELECT json_build_array(current_database(),current_user,host(inet_server_addr()),inet_server_port())'],
  {encoding:'utf8',windowsHide:true,timeout:15000,env:{...process.env,PGCONNECT_TIMEOUT:'5'}});
}
async function main(){
 const mode=process.argv[2];if(!['prepare','install'].includes(mode))fail('Use prepare or install.');
 const admin=new Admin();let attempted=false,before,dir,manifest,original,candidate,acl,configs,initialMetadata;
 try{
  before=await snapshot(admin);validate(before);
  if(before.server.rules.some(r=>r.user_name.includes('sentinela_local_reader')))fail('Reader rules already exist.');
  if(fs.lstatSync(TARGET).isSymbolicLink())fail('Linked HBA refused.');
  fs.accessSync(TARGET,fs.constants.R_OK|fs.constants.W_OK);
  if(mode==='prepare'){
   const privateRoot=path.join(process.env.USERPROFILE,'.sentinela-local');
   dir=path.join(privateRoot,'hba-'+new Date().toISOString().replaceAll(':','-')+'-'+crypto.randomUUID());
   const result=spawnSync('python',['database/local/tools/prepare_hba.py','--source',TARGET,'--output-dir',dir],{encoding:'utf8',windowsHide:true});
   if(result.status!==0)fail('Versioned HBA preparation failed; active file untouched.');
   manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
   original=fs.readFileSync(path.join(dir,'pg_hba.original.conf'));candidate=fs.readFileSync(path.join(dir,'pg_hba.candidate.conf'));
   acl=security(TARGET);configs=otherConfigurations();
   if(digest(original)!==manifest.original_sha256||digest(fs.readFileSync(TARGET))!==manifest.original_sha256||
      digest(candidate)!==manifest.candidate_sha256||!candidate.subarray(candidate.length-original.length).equals(original))fail('Backup/candidate verification failed.');
   const prefix=fs.readFileSync('database/local/hba/sentinela_local_reader.conf');
   if(!candidate.equals(Buffer.concat([prefix,Buffer.from('\n'),original])))fail('Candidate contains unexpected edits.');
   fs.writeFileSync(path.join(dir,'preflight.json'),JSON.stringify({before,acl,configs,fragment_sha256:digest(prefix)}),{flag:'wx',mode:0o600});
   console.log(JSON.stringify({stage:'PREPARED_NOT_INSTALLED',backupDirectory:dir,originalSHA256:manifest.original_sha256,candidateSHA256:manifest.candidate_sha256,originalBytesPreserved:true,originalRules:before.server.rules.length,addedRules:7,ntfsWriteCheck:true}));
   return;
  }
  dir=process.argv[3];if(!dir)fail('Prepared private directory required.');
  const saved=JSON.parse(fs.readFileSync(path.join(dir,'preflight.json'),'utf8'));
  manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  original=fs.readFileSync(path.join(dir,'pg_hba.original.conf'));candidate=fs.readFileSync(path.join(dir,'pg_hba.candidate.conf'));
  acl=saved.acl;configs=saved.configs;
  if(!equal(before.globals,saved.before.globals)||!equal(before.role,saved.before.role)||!equal(before.catalog,saved.before.catalog)||
     !equal(normalizedRules(before.server.rules),normalizedRules(saved.before.server.rules)))fail('Preflight changed since candidate review.');
  if(digest(original)!==manifest.original_sha256||digest(fs.readFileSync(TARGET))!==manifest.original_sha256||
     digest(candidate)!==manifest.candidate_sha256||security(TARGET)!==acl||!equal(configs,otherConfigurations()))fail('Original/candidate/configuration changed; installation refused.');
  const prefix=fs.readFileSync('database/local/hba/sentinela_local_reader.conf');
  if(digest(prefix)!==saved.fragment_sha256||!candidate.equals(Buffer.concat([prefix,Buffer.from('\n'),original])))fail('Approved prefix changed.');
  const started=new Date();
  initialMetadata=metadata(TARGET); attempted=true; atomicReplace(candidate,path.join(dir,'pg_hba.original.conf'),manifest.original_sha256,manifest.candidate_sha256);
  if(digest(fs.readFileSync(TARGET))!==manifest.candidate_sha256||security(TARGET)!==acl)fail('Installed file hash or NTFS descriptor differs.');
  const after=await unchanged(admin,before);prefixValid(after.server.rules);
  if(!equal(normalizedRules(after.server.rules.slice(7)),normalizedRules(before.server.rules)))fail('Other HBA rules changed.');
  if(!equal(configs,otherConfigurations()))fail('Other PostgreSQL configuration changed.');
  const fresh=singleConnection('postgres','sentinela_dev_operacional');
  if(fresh.status!==0||!equal(JSON.parse(fresh.stdout.trim()),['sentinela_dev_operacional','postgres','127.0.0.1',5432]))fail('Fresh administrative connection failed.');
  const rejected=[];
  for(const [database,host]of [['postgres','127.0.0.1'],['sentinela_dev_operacional','::1']]){
   const result=singleConnection('sentinela_local_reader',database,host);
   if(result.status===0||!result.stderr.includes('pg_hba.conf')||!/reject|rejeit/i.test(result.stderr))fail('Expected explicit HBA rejection was not confirmed.');
   rejected.push({database,host,rejectedByHBA:true});
  }
  await unchanged(admin,before);
  if(digest(fs.readFileSync(path.join(dir,'pg_hba.original.conf')))!==manifest.original_sha256)fail('Original backup changed.');
  const evidence={result:'PASS',startedUTC:started.toISOString(),finishedUTC:new Date().toISOString(),startedSaoPaulo:started.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),activeHba:TARGET,backupDirectory:dir,originalSHA256:manifest.original_sha256,installedSHA256:manifest.candidate_sha256,originalRulesPreserved:before.server.rules.length,addedRules:7,totalRules:after.server.rules.length,parserErrors:0,ntfsDescriptorUnchanged:true,existingAdministrativeSessionPreserved:true,newAdministrativeConnection:true,negativeProbes:rejected,reloadPerformed:false,serviceRestarted:false,listenAddressesUnchanged:true,role:after.role,ledger:after.globals.ledger.map(x=>x.versao),policies:after.catalog.policies.length,columnGrants:after.globals.column_grants.length,clusterMetadataUnchanged:true};
  fs.writeFileSync(path.join(dir,'installation-result.json'),JSON.stringify(evidence,null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify(evidence));
 }catch(error){
  let restoration='NOT_NEEDED_OR_NOT_ATTEMPTED';
  try{
   if(attempted){
    const live=digest(fs.readFileSync(TARGET));
    if(live!==manifest.candidate_sha256&&live!==manifest.original_sha256)fail('Concurrent HBA edits; automatic overwrite refused.');
    if(error.evidence && !['ORIGINAL_CONFIRMED','ORIGINAL_RESTORED_AND_VERIFIED'].includes(error.evidence.recovery))fail('Atomic recovery did not confirm original; manual review required.');
    if(!sameMetadata(initialMetadata,metadata(TARGET)))fail('Metadata drift; automatic recovery refused.');
    if(live!==manifest.original_sha256){
     // Unknown metadata or concurrent state is never overwritten by the outer handler.
     if(security(TARGET)!==acl)fail('Concurrent metadata change; recovery refused.');
     const recoveryBackup=path.join(dir,'pg_hba.candidate.conf');
     atomicReplace(original,recoveryBackup,manifest.candidate_sha256,manifest.original_sha256);
    }
    if(digest(fs.readFileSync(TARGET))!==manifest.original_sha256||security(TARGET)!==acl)fail('Restoration bytes/NTFS mismatch.');
    const restored=await unchanged(admin,before);
    if(!equal(normalizedRules(restored.server.rules),normalizedRules(before.server.rules)))fail('Restored rules not confirmed.');
    const fresh=singleConnection('postgres','sentinela_dev_operacional');
    if(fresh.status!==0)fail('Restored administrative connection not confirmed.');
    restoration='ORIGINAL_RESTORED_AND_VERIFIED';
   }
  }catch{restoration='RESTORATION_NOT_FULLY_CONFIRMED_MANUAL_REVIEW_REQUIRED';}
  console.log(JSON.stringify({result:'FAILED',diagnostic:error.message,atomicEvidence:error.evidence?{recovery:error.evidence.recovery,diagnostics:error.evidence.diagnostics,temporaryFileCount:error.evidence.temporaryFiles.length}:null,restoration,backupDirectory:dir??null}));process.exitCode=1;
 }finally{admin.close();}
}
if(require.main===module)main().catch(()=>{console.error('Controlled local HBA operation failed; no credentials printed.');process.exitCode=1;});


module.exports={main};
