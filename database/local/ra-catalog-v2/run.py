"""One new isolated catalog v2 cluster. No operational or hosted connection."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[2]
sys.path.insert(0,str(REPO/'database/local/backup'))
import recover as b
c=b.c

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute',action='store_true')
    b.require(parser.parse_args().execute,'Explicit execution required')
    payload=json.loads((HERE/'payload.json').read_text(encoding='utf8'))
    package=json.loads((HERE/'manifest.json').read_text(encoding='utf8'))
    for name,sha in package['files'].items():
        b.require(b.digest(HERE/name)==sha,'Experimental artifact drift')
    source=REPO/'public/data/cartography/ras-ide-2026-11-13.geojson'
    b.require(b.digest(source)==payload['sourceHash'],'Source hash mismatch')
    b.require(c.free_port(),'Sandbox port occupied; no server will be stopped')
    previous={str(p):c.digest(p) for p in c.BASE.glob('rls-sandbox-*/manifest.json')}
    m=c.prepare('Portuguese_Brazil.1252')
    for p in [*HERE.glob('*'),REPO/'database/local/backup/recover.py',REPO/'database/local/backup/private_pipe.py']:
        if p.is_file():m['artifacts'][str(p.relative_to(REPO))]=c.digest(p)
    c.save(m)
    evidence=Path(m['root'])/'evidence'
    admin=secrets.token_urlsafe(40);reader=secrets.token_urlsafe(40)
    commands=b.Commands();run=b.bootstrap_runner(commands,admin)
    report={'result':'RUNNING','uuid':m['uuid'],'operational_connections':0,'stages':[]}
    def mark(stage):
        report['stages'].append(stage);print(stage,flush=True)
    def sql(text):
        def stdin_run(exe,args,password=None,console=False):
            return commands.call(exe,args,password=password,input=text)
        c.attest(m,admin,database='postgres' if m['phase']=='RUNNING' else None,run=run)
        return c.psql(m,admin,file='-',run=stdin_run)
    try:
        c.create(m,run=run)
        hba=Path(m['data'])/'pg_hba.conf'
        hba.write_bytes(b'host sentinela_rls_sandbox sentinela_local_reader 127.0.0.1/32 scram-sha-256\n'+hba.read_bytes())
        m['runtime_files']['pg_hba.conf']=c.digest(hba);c.save(m)
        c.start(m,admin,run=run);c.install(m,admin,run=run);mark('new_cluster_baseline_read_policies_attested')
        approved={r['code']:{'name':r['name'],'metadata':r['metadata']} for r in payload['entries']}
        template=(HERE/'install.sql').read_text(encoding='utf8')
        literal="'"+json.dumps(approved,ensure_ascii=False).replace("'","''")+"'"
        rendered=template.replace('__APPROVED_JSON__',literal).replace('__GUARD_PATH__',"'"+(c.HERE/'sql/guard.sql').as_posix()+"'")
        file=evidence/'install-v2.sql';file.write_text(rendered,encoding='utf8')
        c.psql(m,admin,file=file,run=run);mark('incremental_jsonb_constraints_policies_installed')
        raw="'"+source.read_text(encoding='utf8').replace("'","''")+"'"
        checks="""BEGIN;
CREATE TEMP TABLE pinned_source(payload text);
INSERT INTO pinned_source VALUES(__SOURCE__);
DO $$ DECLARE raw text; v jsonb; before_ids jsonb; BEGIN
 SELECT payload INTO raw FROM pinned_source;
 BEGIN
  PERFORM sentinela_ra_lab.load_catalog(raw,5);
  RAISE EXCEPTION USING ERRCODE='P1002',MESSAGE='Failure injection ignored';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL; END;
 IF (SELECT count(*) FROM sentinela.regioes_administrativas)<>0 THEN RAISE EXCEPTION 'Partial load escaped rollback'; END IF;
 v:=sentinela_ra_lab.load_catalog(raw);
 IF v<>jsonb_build_object('inserted',37,'reused',0) THEN RAISE EXCEPTION 'First load mismatch'; END IF;
 SELECT jsonb_object_agg(codigo_interno,id) INTO before_ids FROM sentinela.regioes_administrativas;
 v:=sentinela_ra_lab.load_catalog(raw);
 IF v<>jsonb_build_object('inserted',0,'reused',37) OR before_ids IS DISTINCT FROM
 (SELECT jsonb_object_agg(codigo_interno,id) FROM sentinela.regioes_administrativas)
 THEN RAISE EXCEPTION 'UUID/idempotency mismatch'; END IF;
 BEGIN PERFORM sentinela_ra_lab.load_catalog(raw||' '); RAISE EXCEPTION USING ERRCODE='P1002',MESSAGE='Source drift accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
COMMIT;""".replace('__SOURCE__',raw)
        sql(checks);mark('37_persistent_uuids_idempotency_rollback_source_rejection')
        # CHECK probes run as installer in subtransactions. No immutable original row is edited.
        sql("""DO $$ DECLARE ref jsonb; bad jsonb; k text; BEGIN
 SELECT referencia_cartografica INTO ref FROM sentinela.regioes_administrativas WHERE codigo_interno='RA-I';
 FOR k IN SELECT unnest(ARRAY['sourceId','sourceHash','reviewManifestSha256','sourceObjectId','administrativeNumber','validFrom','legalValidityStatus','sourceName','extra']) LOOP
  bad:=CASE k WHEN 'extra' THEN ref||'{"extra":true}'::jsonb ELSE jsonb_set(ref,ARRAY[k],'false'::jsonb) END;
  BEGIN
   INSERT INTO sentinela.regioes_administrativas(codigo_interno,nome,versao_catalogo,vigencia,referencia_cartografica)
   VALUES('RA-I','SYNTHETIC INVALID','NEGATIVE_INVALID',daterange(NULL,NULL,'()'),bad);
   RAISE EXCEPTION USING ERRCODE='P1002',MESSAGE='Invalid reference accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
 END LOOP;
 BEGIN
 INSERT INTO sentinela.regioes_administrativas(codigo_interno,nome,versao_catalogo,vigencia,referencia_cartografica)
 SELECT codigo_interno,nome,versao_catalogo,vigencia,referencia_cartografica FROM sentinela.regioes_administrativas LIMIT 1;
 RAISE EXCEPTION USING ERRCODE='P1002',MESSAGE='Duplicate accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
-- Three explicitly synthetic negative rows remain only in this preserved disposable cluster.
INSERT INTO sentinela.regioes_administrativas(codigo_interno,nome,versao_catalogo,vigencia,referencia_cartografica)
SELECT 'NEGATIVE-PENDING','SYNTHETIC PENDING','SENTINELA_RA_PUBLICO_2026_11_13_V1',vigencia,
 jsonb_set(jsonb_set(referencia_cartografica,'{ideCode}','"NEGATIVE-PENDING"'),'{approvalStatus}','"pending"')
 FROM sentinela.regioes_administrativas WHERE codigo_interno='RA-I';
INSERT INTO sentinela.regioes_administrativas(codigo_interno,nome,versao_catalogo,vigencia,referencia_cartografica)
SELECT codigo_interno,'SYNTHETIC WRONG VERSION','NEGATIVE_VERSION',vigencia,referencia_cartografica
 FROM sentinela.regioes_administrativas WHERE codigo_interno='RA-I';
INSERT INTO sentinela.regioes_administrativas(codigo_interno,nome,versao_catalogo,vigencia)
VALUES('NEGATIVE-LEGACY','SYNTHETIC LEGACY OR','SENTINELA_TESTE_LOCAL_V1',daterange(NULL,NULL,'()'));""")
        mark('strict_metadata_duplicate_checks_and_three_hidden_fixtures')
        # New disposable role only. Password passes through stdin, never an argv or SQL file.
        sql("ALTER ROLE sentinela_local_reader LOGIN PASSWORD '"+reader+"';")
        export=json.loads(c.psql(m,admin,sql="""SELECT jsonb_agg(jsonb_build_object('id',id,'code',codigo_interno,'name',nome,'metadata',referencia_cartografica,
 'lat',extensions.ST_Y(extensions.ST_PointOnSurface(limite)),'lon',extensions.ST_X(extensions.ST_PointOnSurface(limite)),
 'boundaryLat',extensions.ST_Y(extensions.ST_StartPoint(extensions.ST_ExteriorRing(extensions.ST_GeometryN(limite,1)))) ,
 'boundaryLon',extensions.ST_X(extensions.ST_StartPoint(extensions.ST_ExteriorRing(extensions.ST_GeometryN(limite,1))))))
 FROM sentinela.regioes_administrativas WHERE versao_catalogo='SENTINELA_RA_PUBLICO_2026_11_13_V1' AND codigo_interno<>'NEGATIVE-PENDING';""",run=run))
        env={k:v for k,v in c.environment().items() if not any(x in k.upper() for x in ['SUPABASE','DATABASE_URL','READER_URL'])}
        p=subprocess.run(['node','--experimental-strip-types',str(HERE/'qualify.mjs')],input=json.dumps({'password':reader,'rows':export}),env=env,
                         capture_output=True,text=True,encoding='utf8',timeout=120)
        result=json.loads(p.stdout);(evidence/'native-get-tests.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
        b.require(p.returncode==0 and result.get('result')=='PASS','Native qualification failed; sanitized evidence retained')
        report.update(result='PASS',qualification=result,system_id=m['system_id'],package=payload['version'],approved_rows=37,total_rows_with_negative_fixtures=40)
        mark('native_reader_http_get_territory_and_security_passed')
    except (Exception,KeyboardInterrupt) as e:
        report.update(result='FAIL',error=type(e).__name__);raise
    finally:
        if m.get('phase') in ['RUNNING','INSTALLED']:
            try:c.stop(m,admin,run=run)
            except Exception:report['stop']='UNCONFIRMED'
        report['sandbox_final']=m['phase']
        report['events']=commands.events
        report['historical_manifests_preserved']=all(c.digest(Path(p))==h for p,h in previous.items())
        (evidence/'completion.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
        print('Evidence: '+str(evidence),flush=True)

if __name__=='__main__':
    try:main()
    except (Exception,KeyboardInterrupt) as e:
        print('FAIL: '+type(e).__name__+'; no retry; private evidence retained',flush=True);sys.exit(1)
