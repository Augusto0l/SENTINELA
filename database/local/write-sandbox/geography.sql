-- Experimental only; full untouched geometry from the pinned IDE/DF snapshot.
\ir ../sandbox/sql/guard.sql
BEGIN;
CREATE SCHEMA sentinela_geo_lab;
REVOKE ALL ON SCHEMA sentinela_geo_lab FROM PUBLIC;
CREATE TABLE sentinela_geo_lab.regions(code text PRIMARY KEY,name text NOT NULL,
 geom extensions.geometry(MultiPolygon,4326) NOT NULL,ra_id uuid UNIQUE NOT NULL REFERENCES sentinela.regioes_administrativas(id));
CREATE INDEX regions_spatial ON sentinela_geo_lab.regions USING gist(geom);
ALTER TABLE sentinela_geo_lab.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_geo_lab.regions FORCE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA sentinela_geo_lab TO sentinela_sbx_owner,sentinela_sbx_mutator,sentinela_sbx_admin,sentinela_sbx_operator,sentinela_sbx_analyst;
GRANT SELECT ON sentinela_geo_lab.regions TO sentinela_sbx_owner,sentinela_sbx_mutator;
CREATE POLICY region_functions ON sentinela_geo_lab.regions FOR SELECT TO sentinela_sbx_owner,sentinela_sbx_mutator USING(true);
CREATE FUNCTION sentinela_geo_lab.validate(lat float8,lon float8,code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pt extensions.geometry; hits text[]; edge boolean;
BEGIN
 IF current_database()<>'sentinela_rls_sandbox' OR inet_server_port()<>55432 OR host(inet_server_addr())<>'127.0.0.1' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Isolated geographic sandbox required'; END IF;
 IF lat IS NULL OR lon IS NULL OR NOT(lat BETWEEN -90 AND 90) OR NOT(lon BETWEEN -180 AND 180) THEN RETURN jsonb_build_object('status','invalid_coordinate','matches','[]'::jsonb); END IF;
 IF NOT EXISTS(SELECT FROM sentinela_geo_lab.regions) OR EXISTS(SELECT FROM sentinela_geo_lab.regions WHERE NOT extensions.ST_IsValid(geom)) THEN RETURN jsonb_build_object('status','cartography_unavailable','matches','[]'::jsonb); END IF;
 pt:=extensions.ST_SetSRID(extensions.ST_MakePoint(lon,lat),4326);
 SELECT coalesce(array_agg(r.code ORDER BY r.code),ARRAY[]::text[]) INTO hits FROM sentinela_geo_lab.regions r WHERE extensions.ST_Contains(r.geom,pt) OR extensions.ST_DWithin(extensions.ST_Boundary(r.geom),pt,1e-10);
 SELECT EXISTS(SELECT FROM sentinela_geo_lab.regions r WHERE extensions.ST_DWithin(extensions.ST_Boundary(r.geom),pt,1e-10)) INTO edge;
 RETURN jsonb_build_object('status',CASE WHEN edge OR cardinality(hits)>1 THEN 'boundary_ambiguous'
 WHEN cardinality(hits)=0 THEN 'outside_df' WHEN code IS NULL OR NOT EXISTS(SELECT FROM sentinela_geo_lab.regions r WHERE r.code=validate.code) THEN 'reference_pending'
 WHEN hits[1]<>code THEN 'ra_mismatch' ELSE 'consistent' END,'matches',to_jsonb(hits));
END $$;
ALTER FUNCTION sentinela_geo_lab.validate(float8,float8,text) OWNER TO sentinela_sbx_mutator;
REVOKE ALL ON FUNCTION sentinela_geo_lab.validate(float8,float8,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_geo_lab.validate(float8,float8,text) TO sentinela_sbx_owner,sentinela_sbx_admin,sentinela_sbx_operator,sentinela_sbx_analyst;
CREATE FUNCTION sentinela_geo_lab.gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE selected text;result jsonb;
BEGIN
 IF NEW.origem='importacao' THEN RETURN NEW; END IF;
 SELECT code INTO selected FROM sentinela_geo_lab.regions WHERE ra_id=NEW.ra_id;
 result:=sentinela_geo_lab.validate(NEW.latitude,NEW.longitude,selected);
 IF result->>'status'<>'consistent' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Geographic validation pending or rejected'; END IF;
 -- Do not fabricate full validation of source/classification or change original coordinates.
 RETURN NEW;
END $$;
ALTER FUNCTION sentinela_geo_lab.gate() OWNER TO sentinela_sbx_mutator;
REVOKE ALL ON FUNCTION sentinela_geo_lab.gate() FROM PUBLIC;
CREATE TRIGGER geographic_consistency BEFORE INSERT OR UPDATE ON sentinela.ocorrencias FOR EACH ROW EXECUTE FUNCTION sentinela_geo_lab.gate();
COMMIT;
