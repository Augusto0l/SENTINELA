INSERT INTO pg_temp.expected_ra(code, label, metadata, geom)
SELECT code, label, metadata,
       extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(geometry),4326))
FROM jsonb_to_recordset($1::jsonb)
 AS source(code text, label text, metadata jsonb, geometry jsonb);
