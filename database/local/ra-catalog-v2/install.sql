-- Template rendered only by run.py into a NEW attested sandbox. Never operational.
\ir __GUARD_PATH__
BEGIN;
CREATE SCHEMA sentinela_ra_lab;
REVOKE ALL ON SCHEMA sentinela_ra_lab FROM PUBLIC;
CREATE FUNCTION sentinela_ra_lab.valid_reference(m jsonb, code text) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_typeof(m)='object'
 AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(m) k)=
 ARRAY['administrativeNumber','administrativeSource','approvalStatus','contractVersion','extractedOn','ideCode','legalValidityStatus','packageVersion','reviewManifestSha256','sourceHash','sourceId','sourceName','sourceObjectId','validFrom','validTo']::text[]
 AND m->'contractVersion'='1'::jsonb
 AND jsonb_typeof(m->'ideCode')='string' AND m->>'ideCode'=code
 AND jsonb_typeof(m->'sourceObjectId')='string' AND m->>'sourceObjectId' ~ '^[0-9]+$'
 AND jsonb_typeof(m->'sourceName')='string' AND length(btrim(m->>'sourceName'))>0
 AND m->>'sourceId'='https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/LIMITES/FeatureServer/1'
 AND m->>'sourceHash'='fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553'
 AND m->>'reviewManifestSha256'='4e9b678630e34aa1db4827f40d79f426f645d1142ea4eba689c46fb82f01de3f'
 AND jsonb_typeof(m->'administrativeNumber')='number'
 AND m->>'administrativeNumber' ~ '^([1-9]|[12][0-9]|3[0-7])$'
 AND jsonb_typeof(m->'administrativeSource')='string'
 AND m->>'administrativeSource' ~ '^https://(www[.])?(sinj|economia)[.]df[.]gov[.]br/'
 AND jsonb_typeof(m->'packageVersion')='string' AND length(btrim(m->>'packageVersion'))>0
 AND m->>'extractedOn'='2026-11-13'
 AND m->>'approvalStatus' IN ('approved','pending')
 AND m->>'legalValidityStatus'='unknown'
 AND m->'validFrom'='null'::jsonb AND m->'validTo'='null'::jsonb,false)
$$;
CREATE FUNCTION sentinela_ra_lab.approved_reference(code text,label text,m jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT coalesce((__APPROVED_JSON__::jsonb->code)->'metadata'=m
 AND (__APPROVED_JSON__::jsonb->code)->>'name'=label,false)
$$;
REVOKE ALL ON FUNCTION sentinela_ra_lab.valid_reference(jsonb,text),
 sentinela_ra_lab.approved_reference(text,text,jsonb) FROM PUBLIC;
ALTER TABLE sentinela.regioes_administrativas ADD COLUMN referencia_cartografica jsonb;
ALTER TABLE sentinela.regioes_administrativas ADD CONSTRAINT ra_reference_v2
 CHECK(referencia_cartografica IS NULL OR
 (sentinela_ra_lab.valid_reference(referencia_cartografica,codigo_interno)
 AND codigo_oficial IS NULL AND lower_inf(vigencia) AND upper_inf(vigencia)));
ALTER TABLE sentinela.regioes_administrativas ADD CONSTRAINT ra_public_reference_required_v2
 CHECK(versao_catalogo<>'SENTINELA_RA_PUBLICO_2026_11_13_V1' OR referencia_cartografica IS NOT NULL);
GRANT USAGE ON SCHEMA sentinela_ra_lab TO sentinela_local_reader;
GRANT EXECUTE ON FUNCTION sentinela_ra_lab.approved_reference(text,text,jsonb) TO sentinela_local_reader;
CREATE POLICY local_reader_regioes_public_v2 ON sentinela.regioes_administrativas
 FOR SELECT TO sentinela_local_reader
 USING(versao_catalogo='SENTINELA_RA_PUBLICO_2026_11_13_V1'
 AND sentinela_ra_lab.approved_reference(codigo_interno,nome,referencia_cartografica));
-- Restrictive gate prevents the existing permissive synthetic policy broadening scope.
CREATE POLICY local_reader_regioes_gate_v2 ON sentinela.regioes_administrativas
 AS RESTRICTIVE FOR SELECT TO sentinela_local_reader
 USING(versao_catalogo='SENTINELA_RA_PUBLICO_2026_11_13_V1'
 AND sentinela_ra_lab.approved_reference(codigo_interno,nome,referencia_cartografica));
CREATE FUNCTION sentinela_ra_lab.load_catalog(raw_source text, fail_after integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE rows constant jsonb:=__APPROVED_JSON__::jsonb; entry record; f jsonb;
 r sentinela.regioes_administrativas%ROWTYPE; g extensions.geometry;
 inserted integer:=0; reused integer:=0; processed integer:=0;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres'
 OR current_database()<>'sentinela_rls_sandbox' OR inet_server_port()<>55432
 OR host(inet_server_addr())<>'127.0.0.1' THEN RAISE EXCEPTION 'Sandbox installer only'; END IF;
 IF encode(sha256(convert_to(raw_source,'UTF8')),'hex')<>'fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553'
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Pinned source required'; END IF;
 LOCK TABLE sentinela.regioes_administrativas IN SHARE ROW EXCLUSIVE MODE;
 FOR entry IN SELECT * FROM jsonb_each(rows) ORDER BY key LOOP
  SELECT value INTO STRICT f FROM jsonb_array_elements(raw_source::jsonb->'features')
   WHERE value->'properties'->>'ra_codigo'=entry.key;
  IF f->'properties'->>'objectid'<>entry.value->'metadata'->>'sourceObjectId'
   OR f->'properties'->>'ra_nome'<>entry.value->'metadata'->>'sourceName'
   THEN RAISE EXCEPTION 'Source identity mismatch'; END IF;
  g:=extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON((f->'geometry')::text),4326));
  SELECT * INTO r FROM sentinela.regioes_administrativas
   WHERE codigo_interno=entry.key AND versao_catalogo='SENTINELA_RA_PUBLICO_2026_11_13_V1';
  IF FOUND THEN
   IF r.codigo_oficial IS NOT NULL OR r.nome<>entry.value->>'name'
    OR r.referencia_cartografica IS DISTINCT FROM entry.value->'metadata'
    OR extensions.ST_AsEWKB(r.limite) IS DISTINCT FROM extensions.ST_AsEWKB(g)
    OR r.versao_cartografia IS DISTINCT FROM 'IDE-DF-2026-11-13'
    OR r.evidencia_referencia_espacial IS DISTINCT FROM 'ra-review-2026-11-13-v1; extraction-only; legal validity unknown'
    OR NOT lower_inf(r.vigencia) OR NOT upper_inf(r.vigencia)
   THEN RAISE EXCEPTION 'Immutable catalog conflict'; END IF;
   reused:=reused+1;
  ELSE
   INSERT INTO sentinela.regioes_administrativas
    (codigo_interno,codigo_oficial,nome,versao_catalogo,vigencia,limite,versao_cartografia,evidencia_referencia_espacial,referencia_cartografica)
   VALUES(entry.key,NULL,entry.value->>'name','SENTINELA_RA_PUBLICO_2026_11_13_V1',daterange(NULL,NULL,'()'),g,
    'IDE-DF-2026-11-13','ra-review-2026-11-13-v1; extraction-only; legal validity unknown',entry.value->'metadata');
   inserted:=inserted+1;
  END IF;
  processed:=processed+1;
  IF processed=fail_after THEN RAISE EXCEPTION 'Injected rollback test'; END IF;
 END LOOP;
 RETURN jsonb_build_object('inserted',inserted,'reused',reused);
END $$;
REVOKE ALL ON FUNCTION sentinela_ra_lab.load_catalog(text,integer) FROM PUBLIC;
COMMIT;
