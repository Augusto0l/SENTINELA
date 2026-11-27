"""New isolated PostGIS qualification; no operational or Supabase connection."""
import argparse
import importlib.util
import hashlib
import json
from pathlib import Path
import secrets
import subprocess
import sys

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('mutation_runner', HERE / 'run-mutations.py')
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)
c = helpers.c
SOURCE = c.REPO / 'public/data/cartography/ras-ide-2026-11-13.geojson'
SOURCE_HASH = 'fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--bindings', action='store_true')
    parser.add_argument('--catalog', action='store_true', help='Qualify transactional first-insert UUID catalog loader')
    parser.add_argument('--preoperational', action='store_true', help='Capture baseline metadata for later authenticated comparison')
    args = parser.parse_args()
    c.require(not args.catalog or args.bindings, '--catalog requires --bindings')
    c.require(not args.preoperational or args.catalog, '--preoperational requires --catalog')
    c.require(args.execute and c.digest(SOURCE) == SOURCE_HASH, 'Explicit execution and pinned source required')
    c.require(c.digest(c.HERE / 'control.py') == helpers.CONTROL_HASH, 'Lifecycle drift')
    previous = {str(p): c.digest(p) for p in c.BASE.glob('rls-sandbox-*/manifest.json')}
    m = c.prepare('Portuguese_Brazil.1252')
    m.update(purpose='sentinela-write-sandbox-v1', mutation_revision=2)
    for name in ['setup.sql','mutations.sql','geography.sql','qualify-geography.mjs','service.ts','mutation-contracts.ts','run-geography.py']:
        p = HERE / name
        m['artifacts'][str(p.relative_to(c.REPO))] = c.digest(p)
    m['artifacts'][str(SOURCE.relative_to(c.REPO))] = c.digest(SOURCE)
    validator = c.REPO / 'src/data/territorial-validation.ts'
    m['artifacts'][str(validator.relative_to(c.REPO))] = c.digest(validator)
    if args.bindings:
        for name in ['bindings.sql','binding-checks.sql','qualify-bindings.mjs'] + (['catalog.sql','catalog-checks.sql','qualify-catalog.mjs','catalog-source.mjs','preoperational-snapshot.sql','compare-preoperational.mjs'] if args.catalog else []):
            p = HERE / name
            m['artifacts'][str(p.relative_to(c.REPO))] = c.digest(p)
        for name in ['public/data/cartography/ra-bindings-synthetic.json','public/data/cartography/ra-bindings.json','src/data/ra-bindings.ts']:
            m['artifacts'][name] = c.digest(c.REPO / name)
    c.save(m)
    evidence = Path(m['root']) / 'evidence'
    report = {'uuid': m['uuid'], 'stages': [], 'source_sha256': SOURCE_HASH, 'operational_connections': 0}
    admin = secrets.token_urlsafe(40)
    runner = helpers.PrivateRun(admin)

    def record(stage, result='PASS'):
        report.update(system_id=m['system_id'], phase=m['phase'])
        report['stages'].append({'stage': stage, 'result': result})
        (evidence / 'geography-completion.json').write_text(json.dumps(report, indent=2), encoding='utf8')
        print(stage + ': ' + result, flush=True)

    def stdin_sql(script):
        def execute(exe, arguments, **kwargs):
            p = subprocess.run([str(c.BIN / 'psql.exe'), *map(str, arguments)], input="\\set VERBOSITY default\n" + script,
                               env=c.environment(admin), capture_output=True, text=True, encoding='utf8', timeout=60)
            if p.returncode:
                runner.last_failure = {'operation': 'sandbox_geo_sql', 'message': p.stderr.replace(admin, '<secret>')[-1600:]}
            c.require(p.returncode == 0, 'Private geographic SQL failed; sanitized evidence retained')
            return p.stdout.strip()
        return c.psql(m, admin, file='-', run=execute)

    try:
        c.create(m, run=runner)
        hba = Path(m['data']) / 'pg_hba.conf'
        hba.write_bytes(b'host sentinela_rls_sandbox sentinela_sbx_admin,sentinela_sbx_operator,sentinela_sbx_analyst,sentinela_local_reader 127.0.0.1/32 scram-sha-256\n' + hba.read_bytes())
        m['runtime_files']['pg_hba.conf'] = c.digest(hba)
        c.save(m)
        c.start(m, admin, run=runner)
        c.install(m, admin, run=runner)
        if args.preoperational:
            baseline=json.loads(c.psql(m,admin,file=HERE / 'preoperational-snapshot.sql',run=runner))
            (evidence/'preoperational-baseline.json').write_text(json.dumps({'snapshot':baseline,'scope':'sandbox-baseline-only'},indent=2),encoding='utf8')
            record('readonly_baseline_metadata_captured_no_operational_parity_claim')
        c.psql(m, admin, file=HERE / 'setup.sql', run=runner)
        c.psql(m, admin, file=HERE / 'mutations.sql', run=runner)
        c.psql(m, admin, file=HERE / 'geography.sql', run=runner)
        raw = SOURCE.read_text(encoding='utf8').replace("'", "''")
        script = "BEGIN;\nCREATE TEMP TABLE source_features AS SELECT value AS f FROM jsonb_array_elements('" + raw + "'::jsonb->'features');\n"
        script += """INSERT INTO sentinela.regioes_administrativas(id,codigo_interno,nome,versao_catalogo,vigencia,limite,versao_cartografia,evidencia_referencia_espacial)
SELECT overlay(overlay(md5(f->'properties'->>'ra_codigo') placing '5' from 13 for 1) placing '8' from 17 for 1)::uuid,f->'properties'->>'ra_codigo',f->'properties'->>'ra_nome','SENTINELA_WRITE_SANDBOX_V1',daterange(NULL,NULL,'()'),
extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON((f->'geometry')::text),4326)),
'IDE-DF-2026-11-13','Snapshot publico IDE/DF; UUID tecnico exclusivo do sandbox; vigencia legal nao inferida' FROM source_features;
INSERT INTO sentinela_geo_lab.regions SELECT f->'properties'->>'ra_codigo',f->'properties'->>'ra_nome',
extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON((f->'geometry')::text),4326)),overlay(overlay(md5(f->'properties'->>'ra_codigo') placing '5' from 13 for 1) placing '8' from 17 for 1)::uuid FROM source_features;
COMMIT;"""
        if args.catalog:
            c.psql(m,admin,file=HERE / 'bindings.sql',run=runner)
            c.psql(m,admin,file=HERE / 'catalog.sql',run=runner)
            raw = SOURCE.read_bytes().decode('utf8').replace("'", "''")
            checks_file = (HERE / 'catalog-checks.sql').as_posix()
            catalog_result=stdin_sql("CREATE TEMP TABLE raw_catalog(payload text); INSERT INTO raw_catalog VALUES('"+raw+"');\n\\i '"+checks_file+"'\n")
            report['catalog_load']=catalog_result
            record('canonical_catalog_idempotency_uuid_preservation_and_rollback')
        else:
            stdin_sql(script)
        audit = json.loads(c.psql(m, admin, sql="""SELECT json_build_object('count',count(*),'valid',bool_and(extensions.ST_IsValid(geom)),
 'invalid',json_agg(json_build_array(code,extensions.ST_IsValidReason(geom))) FILTER(WHERE NOT extensions.ST_IsValid(geom)),
 'overlap_pairs',(SELECT count(*) FROM sentinela_geo_lab.regions a JOIN sentinela_geo_lab.regions b ON a.code<b.code AND a.geom OPERATOR(extensions.&&) b.geom WHERE extensions.ST_Area(extensions.ST_Intersection(a.geom,b.geom))>1e-15),
 'rings',(SELECT sum(extensions.ST_NRings(geom)) FROM sentinela_geo_lab.regions),
 'overlap_details',(SELECT json_agg(json_build_object('a',a.code,'b',b.code,'area_m2',extensions.ST_Area(extensions.ST_Transform(extensions.ST_Intersection(a.geom,b.geom),31983)))) FROM sentinela_geo_lab.regions a JOIN sentinela_geo_lab.regions b ON a.code<b.code AND a.geom OPERATOR(extensions.&&) b.geom WHERE extensions.ST_Area(extensions.ST_Intersection(a.geom,b.geom))>1e-15),
 'srid',min(extensions.ST_SRID(geom))) FROM sentinela_geo_lab.regions;""", run=runner))
        report['geometry_audit'] = audit
        record('untouched_official_geometry_import')
        c.require(audit['count'] == 37 and audit['valid'] and audit['srid'] == 4326, 'Source topology must be valid without repair')
        cases = json.loads(c.psql(m, admin, sql="""SELECT json_agg(x ORDER BY x->>'name') FROM (
 SELECT json_build_object('name','interior_'||code,'code',code,'ra_id',ra_id,'lat',extensions.ST_Y(extensions.ST_PointOnSurface(geom)),
 'lon',extensions.ST_X(extensions.ST_PointOnSurface(geom)),'expected','consistent','edit_id','61000000-0000-4000-8000-000000000001') AS x FROM sentinela_geo_lab.regions
 UNION ALL SELECT json_build_object('name','boundary_'||code,'code',code,'lat',extensions.ST_Y(extensions.ST_StartPoint(extensions.ST_ExteriorRing(extensions.ST_GeometryN(geom,1)))),'lon',extensions.ST_X(extensions.ST_StartPoint(extensions.ST_ExteriorRing(extensions.ST_GeometryN(geom,1)))),'expected','boundary_ambiguous') FROM sentinela_geo_lab.regions
 UNION ALL SELECT json_build_object('name','outside_zero','code','RA-I','lat',0,'lon',0,'expected','outside_df')
 UNION ALL SELECT json_build_object('name','missing_coordinates','code','RA-I','lat',NULL,'lon',NULL,'expected','invalid_coordinate')
 UNION ALL SELECT json_build_object('name','overlap_'||a.code||'_'||b.code,'code',a.code,
 'lat',extensions.ST_Y(extensions.ST_PointOnSurface(extensions.ST_Intersection(a.geom,b.geom))),
 'lon',extensions.ST_X(extensions.ST_PointOnSurface(extensions.ST_Intersection(a.geom,b.geom))),'expected','boundary_ambiguous')
 FROM sentinela_geo_lab.regions a JOIN sentinela_geo_lab.regions b ON a.code<b.code AND a.geom OPERATOR(extensions.&&) b.geom WHERE extensions.ST_Area(extensions.ST_Intersection(a.geom,b.geom))>1e-15) s;""", run=runner))
        chosen = next(x for x in cases if x['name'].startswith('interior_'))
        for entry in [dict(chosen, name='mismatch_selected_ra', code='UNKNOWN', expected='reference_pending'), dict(chosen, name='wrong_ra', code=next(x['code'] for x in cases if x.get('code') != chosen['code'] and x['name'].startswith('interior_')), expected='ra_mismatch')]:
            cases.append(entry)
        fixture = """INSERT INTO sentinela.ocorrencias(id,origem,fonte,versao_identidade,identidade_status,data_fato,horario_fato,ra_id,local,latitude,longitude,localizacao_status,consolidacao_status)
 VALUES('61000000-0000-4000-8000-000000000001','manual','SENTINELA_WRITE_SANDBOX_V1','SANDBOX-MANUAL-V1','manual','2026-11-13','12:00:00',
 'RA_ID','SINTETICO: ponto interior derivado de PostGIS',LAT,LON,'referencia_pendente','consolidada');
 INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,classificacao_status) VALUES('61000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','manual','pendente');"""
        stdin_sql(fixture.replace('RA_ID', chosen['ra_id']).replace('LAT', str(chosen['lat'])).replace('LON', str(chosen['lon'])))
        stdin_sql("INSERT INTO sentinela.ocorrencias(id,origem,fonte,versao_identidade,identidade_status,localizacao_status) VALUES('61000000-0000-4000-8000-000000000002','importacao','SYNTHETIC-IMPORT-NOT-PCDF','SYNTHETIC-V1','candidata','ausente');")
        c.require(c.psql(m,admin,sql="SELECT latitude IS NULL AND longitude IS NULL AND localizacao_status='ausente' FROM sentinela.ocorrencias WHERE id='61000000-0000-4000-8000-000000000002';",run=runner)=='t','Incomplete synthetic import changed')
        record('incomplete_synthetic_import_preserved_without_invented_coordinates')
        password = secrets.token_urlsafe(40)
        stdin_sql("ALTER ROLE sentinela_sbx_admin PASSWORD '" + helpers.verifier(password) + "';")
        config = {'manifest': str(Path(m['root']) / 'manifest.json'), 'expectedUUID': m['uuid'], 'credentials': {'Administrador': {'user': 'sentinela_sbx_admin', 'password': password}, 'Operador': {'user': 'sentinela_sbx_operator', 'password': ''}}}
        env = {k: v for k, v in c.environment().items() if not any(x in k.upper() for x in ['SUPABASE','DATABASE_URL','READER_URL'])}
        env.update(NODE_ENV='development', SENTINELA_SANDBOX_WRITE='1')
        p = subprocess.run(['node','--experimental-strip-types',str(HERE / 'qualify-geography.mjs')], input=json.dumps({'config':config,'cases':cases}), env=env,capture_output=True,text=True,encoding='utf8',timeout=120)
        try: result = json.loads(p.stdout)
        except ValueError: result = {'result':'FAIL','stage':'child_protocol'}
        (evidence / 'geography-tests.json').write_text(json.dumps(result,indent=2),encoding='utf8')
        (evidence / 'geography-cases.json').write_text(json.dumps(cases,indent=2),encoding='utf8')
        c.require(p.returncode == 0 and result.get('result') == 'PASS','Geographic qualification failed')
        record('javascript_postgis_parity_and_real_writes')
        if args.bindings:
            if not args.catalog: c.psql(m, admin, file=HERE / 'bindings.sql', run=runner)
            mapping = json.loads((c.REPO / 'public/data/cartography/ra-bindings-synthetic.json').read_text(encoding='utf8'))
            features = json.loads(SOURCE.read_text(encoding='utf8'))['features']
            for f in ([] if args.catalog else features):
                prop = f['properties']
                stdin_sql("UPDATE sentinela_geo_lab.regions SET source_object_id='" + str(prop['objectid']) + "' WHERE code='" + prop['ra_codigo'] + "';")
            if args.catalog:
                identities=json.loads(c.psql(m,admin,sql="SELECT json_object_agg(code,ra_id) FROM sentinela_geo_lab.regions;",run=runner))
                for row in mapping['entries']:
                    row['raId']=identities[row['code']]
                    row['evidence']='Installer pinned source code and feature ID; sandbox-generated persistent UUID'
                (evidence/'catalog-bindings.json').write_text(json.dumps(mapping,ensure_ascii=False,indent=2),encoding='utf8')
            versions = [] if args.catalog else [mapping]
            import copy
            for revision in ['test-pending','test-source','test-update']:
                v = copy.deepcopy(mapping);v['version'] = revision
                if revision == 'test-pending':
                    for row in v['entries']: row['status'] = 'pending'
                if revision == 'test-source': v['sourceId'] = 'https://invalid.example/'
                if revision == 'test-update': v['sourceHash'] = '0' * 64
                versions.append(v)
            for v in versions:
                raw_mapping = json.dumps(v,ensure_ascii=False).replace("'", "''")
                stdin_sql("BEGIN; CREATE TEMP TABLE mapping_document AS SELECT '" + raw_mapping + "'::jsonb AS d; " + """
INSERT INTO sentinela_geo_lab.binding_versions SELECT d->>'version',d->>'sourceId',d->>'sourceHash',d->>'scope',(d->>'extractedOn')::date,(d->>'validFrom')::date,(d->>'validTo')::date,d->>'temporalBasis' FROM mapping_document;
INSERT INTO sentinela_geo_lab.bindings SELECT d->>'version',(e->>'raId')::uuid,e->>'code',e->>'sourceObjectId',e->>'status',e->>'evidence' FROM mapping_document CROSS JOIN LATERAL jsonb_array_elements(d->'entries') e; COMMIT;""")
            constraint_result=c.psql(m,admin,file=HERE / 'binding-checks.sql',run=runner)
            report['binding_constraints']=constraint_result
            record('binding_constraints_and_immutable_versions')
            p = subprocess.run(['node','--experimental-strip-types',str(HERE / 'qualify-bindings.mjs')], input=json.dumps({'config':config,'cases':cases,'mapping':mapping}),env=env,capture_output=True,text=True,encoding='utf8',timeout=120)
            try: binding_result=json.loads(p.stdout)
            except ValueError: binding_result={'result':'FAIL','stage':'child_protocol'}
            (evidence/'bindings-tests.json').write_text(json.dumps(binding_result,indent=2),encoding='utf8')
            c.require(p.returncode==0 and binding_result.get('result')=='PASS','UUID binding qualification failed')
            record('versioned_uuid_binding_parity_and_real_writes')
            if args.catalog:
                reader_password=secrets.token_urlsafe(40)
                stdin_sql("ALTER ROLE sentinela_local_reader LOGIN PASSWORD '"+helpers.verifier(reader_password)+"';")
                payload={'password':reader_password,'mapping':mapping}
                p=subprocess.run(['node','--experimental-strip-types',str(HERE/'qualify-catalog.mjs')],input=json.dumps(payload),env=env,capture_output=True,text=True,encoding='utf8',timeout=60)
                try: catalog_api=json.loads(p.stdout)
                except ValueError: catalog_api={'result':'FAIL','stage':'child_protocol'}
                (evidence/'catalog-get-tests.json').write_text(json.dumps(catalog_api,indent=2),encoding='utf8')
                c.require(p.returncode==0 and catalog_api.get('result')=='PASS','Native catalog GET qualification failed')
                record('native_reader_get_contract_rls_and_least_privilege')
                report['catalog_final']=json.loads(c.psql(m,admin,sql="""SELECT json_build_object(
 'catalog_rows',(SELECT count(*) FROM sentinela_geo_lab.regions),'unique_ids',(SELECT count(DISTINCT ra_id) FROM sentinela_geo_lab.regions),
 'approved',(SELECT count(*) FROM sentinela_geo_lab.bindings WHERE version='ide-df-bindings-2026-11-13-v1' AND status='approved'),
 'geometry_history',(SELECT count(*) FROM sentinela_geo_lab.catalog_geometries),
 'orphans',(SELECT count(*) FROM sentinela_geo_lab.bindings b LEFT JOIN sentinela.regioes_administrativas r ON r.id=b.ra_id WHERE r.id IS NULL),
 'baseline_rls',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='sentinela' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity),
 'ledger',(SELECT json_agg(versao ORDER BY versao) FROM sentinela.schema_migrations));""",run=runner))
                c.require(report['catalog_final']['catalog_rows']==37 and report['catalog_final']['unique_ids']==37 and report['catalog_final']['approved']==37 and report['catalog_final']['geometry_history']==37 and report['catalog_final']['orphans']==0 and report['catalog_final']['baseline_rls']==19,'Canonical final invariants diverged')
                c.require(all(c.digest(c.REPO / path)==digest for path,digest in m['artifacts'].items()),'Artifacts changed during qualification')

        invariant = c.psql(m,admin,sql="""SELECT count(*)=EXPECTED_COUNT AND bool_and(new_version=old_version+1 AND actor='sentinela_sbx_admin') FROM sentinela_write_lab.mutation_history;""".replace("EXPECTED_COUNT", "2" if args.bindings else "1"),run=runner)
        c.require(invariant == 't','Audit or rollback invariant failed')
        c.require(all(c.digest(Path(p)) == h for p,h in previous.items()),'Previous manifests changed')
        record('audit_rollback_and_prior_clusters_preserved')
    except BaseException:
        record('failed_or_interrupted','FAIL')
        if runner.last_failure: (evidence/'geography-failure.json').write_text(json.dumps(runner.last_failure),encoding='utf8')
        raise
    finally:
        try:
            c.attest(m,admin,database='postgres');c.stop(m,admin);record('identified_cluster_stopped')
        except (Exception,KeyboardInterrupt): record('requires_state_inspection','UNKNOWN')
        runner.password=None
        print('Evidence: '+str(evidence/'geography-completion.json'),flush=True)


if __name__=='__main__':
    try: main()
    except (Exception,KeyboardInterrupt) as error:
        print('FAIL: '+type(error).__name__+'; evidence retained; no automatic retry',flush=True);raise SystemExit(1)
