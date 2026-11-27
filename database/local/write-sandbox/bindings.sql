\ir ../sandbox/sql/guard.sql
BEGIN;
ALTER TABLE sentinela_geo_lab.regions ADD COLUMN source_object_id text;
ALTER TABLE sentinela_geo_lab.regions ADD CONSTRAINT source_identity UNIQUE(code,source_object_id);
CREATE TABLE sentinela_geo_lab.binding_versions(
 version text PRIMARY KEY,source_id text NOT NULL,source_hash text NOT NULL CHECK(source_hash~'^[a-f0-9]{64}$'),
 scope text NOT NULL CHECK(scope IN ('operational','sandbox')),extracted_on date NOT NULL,valid_from date,valid_to date,
 temporal_basis text NOT NULL CHECK(temporal_basis IN ('extraction-only','documented-validity')),
 CHECK((temporal_basis='extraction-only' AND valid_from IS NULL AND valid_to IS NULL) OR (temporal_basis='documented-validity' AND valid_from IS NOT NULL AND (valid_to IS NULL OR valid_to>valid_from))));
CREATE TABLE sentinela_geo_lab.bindings(
 version text NOT NULL REFERENCES sentinela_geo_lab.binding_versions(version),ra_id uuid NOT NULL REFERENCES sentinela.regioes_administrativas(id),
 code text NOT NULL REFERENCES sentinela_geo_lab.regions(code),source_object_id text NOT NULL,
 status text NOT NULL CHECK(status IN ('approved','pending','unmapped','conflict')),evidence text NOT NULL CHECK(length(btrim(evidence))>0),
 PRIMARY KEY(version,ra_id),UNIQUE(version,code),FOREIGN KEY(code,source_object_id) REFERENCES sentinela_geo_lab.regions(code,source_object_id));
ALTER TABLE sentinela_geo_lab.binding_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_geo_lab.binding_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE sentinela_geo_lab.bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_geo_lab.bindings FORCE ROW LEVEL SECURITY;
GRANT SELECT ON sentinela_geo_lab.binding_versions,sentinela_geo_lab.bindings TO sentinela_sbx_mutator;
CREATE POLICY version_function ON sentinela_geo_lab.binding_versions FOR SELECT TO sentinela_sbx_mutator USING(true);
CREATE POLICY binding_function ON sentinela_geo_lab.bindings FOR SELECT TO sentinela_sbx_mutator USING(true);
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON sentinela_geo_lab.binding_versions FOR EACH STATEMENT EXECUTE FUNCTION sentinela_write_lab.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON sentinela_geo_lab.bindings FOR EACH STATEMENT EXECUTE FUNCTION sentinela_write_lab.immutable();
CREATE FUNCTION sentinela_geo_lab.validate_uuid(lat float8,lon float8,ra uuid,revision text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE binding record;classification jsonb;
BEGIN
 classification:=sentinela_geo_lab.validate(lat,lon,NULL);
 IF classification->>'status' IN ('invalid_coordinate','cartography_unavailable','outside_df','boundary_ambiguous') THEN RETURN classification; END IF;
 SELECT b.* INTO binding FROM sentinela_geo_lab.bindings b JOIN sentinela_geo_lab.binding_versions v USING(version)
 WHERE b.ra_id=ra AND b.version=revision AND b.status='approved' AND v.scope='sandbox'
 AND v.source_id='https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/LIMITES/FeatureServer/1'
 AND v.source_hash='fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553';
 IF NOT FOUND THEN RETURN classification; END IF;
 RETURN sentinela_geo_lab.validate(lat,lon,binding.code);
END $$;
ALTER FUNCTION sentinela_geo_lab.validate_uuid(float8,float8,uuid,text) OWNER TO sentinela_sbx_mutator;
REVOKE ALL ON FUNCTION sentinela_geo_lab.validate_uuid(float8,float8,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_geo_lab.validate_uuid(float8,float8,uuid,text) TO sentinela_sbx_admin,sentinela_sbx_operator,sentinela_sbx_analyst;
CREATE OR REPLACE FUNCTION sentinela_geo_lab.gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 IF NEW.origem='importacao' THEN RETURN NEW; END IF;
 result:=sentinela_geo_lab.validate_uuid(NEW.latitude,NEW.longitude,NEW.ra_id,'ide-df-bindings-2026-11-13-v1');
 IF result->>'status'<>'consistent' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Approved versioned UUID binding required'; END IF;
 RETURN NEW;
END $$;
COMMIT;
