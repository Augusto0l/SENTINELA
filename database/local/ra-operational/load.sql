INSERT INTO sentinela.regioes_administrativas
 (codigo_interno,codigo_oficial,nome,versao_catalogo,vigencia,limite,
  versao_cartografia,evidencia_referencia_espacial,referencia_cartografica)
SELECT code,NULL,label,'SENTINELA_RA_PUBLICO_2026_11_13_V1',daterange(NULL,NULL,'()'),geom,
 'IDE-DF-2026-11-13','ra-review-2026-11-13-v1; extraction-only; legal validity unknown',metadata
FROM pg_temp.expected_ra ORDER BY code COLLATE "C";
