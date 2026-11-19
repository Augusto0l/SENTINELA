-- Caller supplies TEMP raw_catalog(payload text) from the pinned local file.
\ir ../sandbox/sql/guard.sql
BEGIN;
DO $$
DECLARE raw text; result jsonb; before_state jsonb; after_state jsonb; f jsonb; preserved uuid; ids jsonb;
BEGIN
 SELECT payload INTO STRICT raw FROM raw_catalog;
 SELECT jsonb_build_array((SELECT count(*) FROM sentinela.regioes_administrativas),
 (SELECT count(*) FROM sentinela_geo_lab.regions),(SELECT count(*) FROM sentinela_geo_lab.bindings),
 (SELECT count(*) FROM sentinela_geo_lab.binding_versions),(SELECT count(*) FROM sentinela_geo_lab.catalog_loads)) INTO before_state;
 BEGIN PERFORM sentinela_geo_lab.load_catalog(raw,5); RAISE EXCEPTION USING ERRCODE='P1002',MESSAGE='Failure injection ignored';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL; END;
 SELECT jsonb_build_array((SELECT count(*) FROM sentinela.regioes_administrativas),
 (SELECT count(*) FROM sentinela_geo_lab.regions),(SELECT count(*) FROM sentinela_geo_lab.bindings),
 (SELECT count(*) FROM sentinela_geo_lab.binding_versions),(SELECT count(*) FROM sentinela_geo_lab.catalog_loads)) INTO after_state;
 IF before_state<>after_state THEN RAISE EXCEPTION 'Intermediate failure did not roll back'; END IF;
 BEGIN
  result:=sentinela_geo_lab.load_catalog(raw);
  IF result->>'inserted'<>'37' OR result->>'reused'<>'0' THEN RAISE EXCEPTION 'Initial empty load failed'; END IF;
  RAISE EXCEPTION USING ERRCODE='P1001',MESSAGE='Rollback empty-load scenario';
 EXCEPTION WHEN SQLSTATE 'P1001' THEN NULL; END;
 -- Conflict fixture is inserted in its own subtransaction; immutable catalog rows are never updated.
 BEGIN
  f:=raw::jsonb->'features'->0;
  INSERT INTO sentinela.regioes_administrativas(codigo_interno,codigo_oficial,nome,versao_catalogo,vigencia)
  VALUES(f->'properties'->>'ra_codigo',f->'properties'->>'ra_codigo','Synthetic conflicting name','SENTINELA_WRITE_SANDBOX_V1',daterange(NULL,NULL,'()'));
  BEGIN PERFORM sentinela_geo_lab.load_catalog(raw); RAISE EXCEPTION 'Conflicting name accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE EXCEPTION USING ERRCODE='P1001',MESSAGE='Rollback name conflict fixture';
 EXCEPTION WHEN SQLSTATE 'P1001' THEN NULL; END;
 -- Independently preexisting UUID, never copied from deterministic UI fixtures.
 f:=raw::jsonb->'features'->0;
 INSERT INTO sentinela.regioes_administrativas(codigo_interno,codigo_oficial,nome,versao_catalogo,vigencia,limite,versao_cartografia,evidencia_referencia_espacial)
 VALUES(f->'properties'->>'ra_codigo',f->'properties'->>'ra_codigo',f->'properties'->>'ra_nome','SENTINELA_WRITE_SANDBOX_V1',daterange(NULL,NULL,'()'),
 extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON((f->'geometry')::text),4326)),
 'IDE-DF-2026-11-13','IDE-DF pinned canonical sandbox; extraction-only; no legal validity') RETURNING id INTO preserved;
 result:=sentinela_geo_lab.load_catalog(raw);
 IF result->>'inserted'<>'36' OR result->>'reused'<>'1' THEN RAISE EXCEPTION 'Preexisting scenario failed'; END IF;
 IF NOT EXISTS(SELECT FROM sentinela_geo_lab.regions WHERE ra_id=preserved AND code=f->'properties'->>'ra_codigo') THEN RAISE EXCEPTION 'UUID replaced'; END IF;
 SELECT jsonb_object_agg(code,ra_id) INTO ids FROM sentinela_geo_lab.regions;
 result:=sentinela_geo_lab.load_catalog(raw);
 IF result->>'inserted'<>'0' OR result->>'reused'<>'37' OR ids<>(SELECT jsonb_object_agg(code,ra_id) FROM sentinela_geo_lab.regions) THEN RAISE EXCEPTION 'Idempotency failed'; END IF;
 -- Source edits (including invalid/duplicate codes) must fail at the hash boundary.
 BEGIN PERFORM sentinela_geo_lab.load_catalog(replace(raw,'RA-I','UNKNOWN')); RAISE EXCEPTION 'Invalid code accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM sentinela_geo_lab.load_catalog(replace(raw,'RA-II"','RA-I"')); RAISE EXCEPTION 'Duplicate code accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM sentinela_geo_lab.load_catalog(raw||' '); RAISE EXCEPTION 'Changed hash accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  UPDATE sentinela_geo_lab.regions SET ra_id='11000000-0000-4000-8000-000000000001' WHERE ra_id=preserved;
  BEGIN PERFORM sentinela_geo_lab.load_catalog(raw); RAISE EXCEPTION 'Conflicting binding accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE EXCEPTION USING ERRCODE='P1001',MESSAGE='Restore conflicting binding';
 EXCEPTION WHEN SQLSTATE 'P1001' THEN NULL; END;
 IF ids<>(SELECT jsonb_object_agg(code,ra_id) FROM sentinela_geo_lab.regions) THEN RAISE EXCEPTION 'Conflict recovery changed IDs'; END IF;
 IF (SELECT count(*) FROM sentinela_geo_lab.catalog_loads)<>2 THEN RAISE EXCEPTION 'Receipts not atomic'; END IF;
END $$;
COMMIT;
SELECT json_build_object('result','PASS','checks',11,'catalog',37,'inserted_final',36,'preserved_preexisting',1,
 'second_inserted',0,'second_reused',37,'source_mutations','rejected at SHA-256 boundary');
