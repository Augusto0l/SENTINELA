WITH expected_ra AS (
 SELECT code, label, metadata,
        extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(geometry),4326)) AS geom
 FROM jsonb_to_recordset($1::jsonb)
 AS source(code text, label text, metadata jsonb, geometry jsonb)
)
SELECT count(*)::int AS total,
 count(*) FILTER (WHERE e.code IS NOT NULL AND
     r.versao_catalogo = 'SENTINELA_RA_PUBLICO_2026_11_13_V1'
     AND r.codigo_oficial IS NULL AND r.nome = e.label
     AND r.referencia_cartografica = e.metadata
     AND extensions.ST_AsEWKB(r.limite) = extensions.ST_AsEWKB(e.geom)
     AND r.versao_cartografia = 'IDE-DF-2026-11-13'
     AND r.evidencia_referencia_espacial = 'ra-review-2026-11-13-v1; extraction-only; legal validity unknown'
     AND lower_inf(r.vigencia) AND upper_inf(r.vigencia))::int AS matched
FROM sentinela.regioes_administrativas r
LEFT JOIN expected_ra e ON e.code = r.codigo_interno;
