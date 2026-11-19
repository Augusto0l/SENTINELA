-- Installer-only prototype. Never apply to the operational database.
\ir ../sandbox/sql/guard.sql
BEGIN;
DO $$ BEGIN
 IF (SELECT array_agg(versao ORDER BY versao) FROM sentinela.schema_migrations)
  <> ARRAY['0001','0002','0003','0004','0005','local-read-0001']::text[]
 OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='sentinela' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity)<>19
 OR NOT EXISTS(SELECT FROM pg_attribute WHERE attrelid='sentinela.regioes_administrativas'::regclass
  AND attname='id' AND atttypid='uuid'::regtype AND attnotnull AND NOT attisdropped)
 OR (SELECT extversion FROM pg_extension WHERE extname='postgis') IS DISTINCT FROM '3.6.2'
 THEN RAISE EXCEPTION 'Canonical catalog baseline dependency mismatch'; END IF;
END $$;
CREATE TABLE sentinela_geo_lab.catalog_loads(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_hash text NOT NULL,
 inserted integer NOT NULL,reused integer NOT NULL,executor name NOT NULL DEFAULT session_user,
 loaded_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE sentinela_geo_lab.catalog_loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_geo_lab.catalog_loads FORCE ROW LEVEL SECURITY;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON sentinela_geo_lab.catalog_loads
 FOR EACH STATEMENT EXECUTE FUNCTION sentinela_write_lab.immutable();
-- The baseline RA row is immutable. Future geometry revisions belong here,
-- never in an UPDATE of the original RA identity or first boundary.
CREATE TABLE sentinela_geo_lab.catalog_geometries(
 version text NOT NULL,ra_id uuid NOT NULL,code text NOT NULL,
 geom extensions.geometry(MultiPolygon,4326) NOT NULL CHECK(extensions.ST_IsValid(geom) AND NOT extensions.ST_IsEmpty(geom)),
 PRIMARY KEY(version,ra_id),UNIQUE(version,code),
 FOREIGN KEY(version,ra_id) REFERENCES sentinela_geo_lab.bindings(version,ra_id));
ALTER TABLE sentinela_geo_lab.catalog_geometries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_geo_lab.catalog_geometries FORCE ROW LEVEL SECURITY;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON sentinela_geo_lab.catalog_geometries
 FOR EACH STATEMENT EXECUTE FUNCTION sentinela_write_lab.immutable();
CREATE FUNCTION sentinela_geo_lab.load_catalog(raw_source text,fail_after integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
<<catalog_load>>
DECLARE source jsonb; f jsonb; g extensions.geometry; r sentinela.regioes_administrativas%ROWTYPE;
 code text; label text; object_id text; inserted integer:=0; reused integer:=0; processed integer:=0;
 version constant text:='ide-df-bindings-2026-11-13-v1';
 source_hash constant text:='fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553';
BEGIN
 IF session_user<>'postgres' OR current_user<>'postgres' OR current_database()<>'sentinela_rls_sandbox'
 OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55432 THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Attested sandbox installer only'; END IF;
 IF encode(sha256(convert_to(raw_source,'UTF8')),'hex') IS DISTINCT FROM source_hash THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Pinned source hash required'; END IF;
 source:=raw_source::jsonb;
 IF source->>'type'<>'FeatureCollection' OR jsonb_array_length(source->'features')<>37
 OR (SELECT count(DISTINCT value->'properties'->>'ra_codigo') FROM jsonb_array_elements(source->'features'))<>37 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unique complete canonical source required'; END IF;
 -- Serialize catalog changes; no ON CONFLICT overwrite of an identity.
 LOCK TABLE sentinela.regioes_administrativas,sentinela_geo_lab.regions,
 sentinela_geo_lab.binding_versions,sentinela_geo_lab.bindings IN SHARE ROW EXCLUSIVE MODE;
 IF EXISTS(SELECT FROM sentinela_geo_lab.binding_versions v WHERE v.version=catalog_load.version AND
 (v.source_hash<>catalog_load.source_hash OR v.scope<>'sandbox' OR v.source_id<>'https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/LIMITES/FeatureServer/1'
 OR v.extracted_on<>'2026-11-13'::date OR v.temporal_basis<>'extraction-only' OR v.valid_from IS NOT NULL OR v.valid_to IS NOT NULL)) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Existing mapping version conflicts'; END IF;
 INSERT INTO sentinela_geo_lab.binding_versions
 SELECT version,'https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/LIMITES/FeatureServer/1',source_hash,'sandbox','2026-11-13',NULL,NULL,'extraction-only'
 WHERE NOT EXISTS(SELECT FROM sentinela_geo_lab.binding_versions v WHERE v.version=catalog_load.version);
 FOR f IN SELECT value FROM jsonb_array_elements(source->'features') ORDER BY value->'properties'->>'ra_codigo' LOOP
  code:=f->'properties'->>'ra_codigo'; label:=f->'properties'->>'ra_nome';object_id:=f->'properties'->>'objectid';
  g:=extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON((f->'geometry')::text),4326));
  IF NOT extensions.ST_IsValid(g) OR extensions.ST_IsEmpty(g) THEN RAISE EXCEPTION 'Invalid source geometry'; END IF;
  IF (SELECT count(*) FROM sentinela.regioes_administrativas t WHERE t.codigo_interno=code)>1 THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Ambiguous existing administrative identity'; END IF;
  SELECT * INTO r FROM sentinela.regioes_administrativas t WHERE t.codigo_interno=code;
  IF FOUND THEN
   IF r.nome<>label OR r.codigo_oficial IS DISTINCT FROM code OR r.versao_catalogo<>'SENTINELA_WRITE_SANDBOX_V1'
   OR r.versao_cartografia IS DISTINCT FROM 'IDE-DF-2026-11-13'
   OR r.evidencia_referencia_espacial IS DISTINCT FROM 'IDE-DF pinned canonical sandbox; extraction-only; no legal validity'
   OR r.vigencia<>daterange(NULL,NULL,'()') OR r.limite IS NULL
   OR extensions.ST_AsEWKB(r.limite)<>extensions.ST_AsEWKB(g) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Existing catalog identity conflicts; no overwrite'; END IF;
   reused:=reused+1;
  ELSE
   INSERT INTO sentinela.regioes_administrativas(codigo_interno,codigo_oficial,nome,versao_catalogo,vigencia,limite,versao_cartografia,evidencia_referencia_espacial)
   VALUES(code,code,label,'SENTINELA_WRITE_SANDBOX_V1',daterange(NULL,NULL,'()'),g,'IDE-DF-2026-11-13',
    'IDE-DF pinned canonical sandbox; extraction-only; no legal validity') RETURNING * INTO r;
   inserted:=inserted+1;
  END IF;
  IF EXISTS(SELECT FROM sentinela_geo_lab.regions t WHERE t.code=catalog_load.code AND
   (t.ra_id<>r.id OR t.source_object_id IS DISTINCT FROM object_id OR t.name<>label OR extensions.ST_AsEWKB(t.geom)<>extensions.ST_AsEWKB(g))) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Existing geometry binding conflicts'; END IF;
  INSERT INTO sentinela_geo_lab.regions SELECT code,label,g,r.id,object_id
   WHERE NOT EXISTS(SELECT FROM sentinela_geo_lab.regions t WHERE t.code=catalog_load.code);
  IF EXISTS(SELECT FROM sentinela_geo_lab.bindings b WHERE b.version=catalog_load.version AND (b.ra_id=r.id OR b.code=catalog_load.code)
   AND (b.ra_id<>r.id OR b.code<>catalog_load.code OR b.source_object_id<>object_id OR b.status<>'approved'
   OR b.evidence<>'Installer pinned source code and feature ID; sandbox-generated persistent UUID')) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Existing UUID mapping conflicts'; END IF;
  INSERT INTO sentinela_geo_lab.bindings SELECT version,r.id,code,object_id,'approved',
   'Installer pinned source code and feature ID; sandbox-generated persistent UUID'
   WHERE NOT EXISTS(SELECT FROM sentinela_geo_lab.bindings b WHERE b.version=catalog_load.version AND b.ra_id=r.id);
  IF EXISTS(SELECT FROM sentinela_geo_lab.catalog_geometries t WHERE t.version=catalog_load.version AND t.ra_id=r.id
   AND (t.code<>catalog_load.code OR extensions.ST_AsEWKB(t.geom)<>extensions.ST_AsEWKB(g))) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Historical geometry conflicts'; END IF;
  INSERT INTO sentinela_geo_lab.catalog_geometries SELECT version,r.id,code,g
   WHERE NOT EXISTS(SELECT FROM sentinela_geo_lab.catalog_geometries t WHERE t.version=catalog_load.version AND t.ra_id=r.id);
  processed:=processed+1;
  IF processed=fail_after THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='Synthetic intermediate failure'; END IF;
 END LOOP;
 INSERT INTO sentinela_geo_lab.catalog_loads(source_hash,inserted,reused) VALUES(source_hash,inserted,reused);
 RETURN jsonb_build_object('inserted',inserted,'reused',reused,'approved',processed,'scope','sandbox');
END $$;
REVOKE ALL ON FUNCTION sentinela_geo_lab.load_catalog(text,integer) FROM PUBLIC;
-- Existing 48 column grants unchanged. This additional policy exists only here.
CREATE POLICY sandbox_canonical_catalog ON sentinela.regioes_administrativas FOR SELECT TO sentinela_local_reader
 USING(versao_catalogo='SENTINELA_WRITE_SANDBOX_V1' AND
 evidencia_referencia_espacial='IDE-DF pinned canonical sandbox; extraction-only; no legal validity');
COMMIT;
