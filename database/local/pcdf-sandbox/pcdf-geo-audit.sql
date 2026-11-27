-- Triagem dos números originais em uma malha angular. As geometrias desta consulta são descartadas.
WITH perimetro AS MATERIALIZED (SELECT sentinela_pcdf_geo.geojson_poligono($2::jsonb) AS g),
 ras AS MATERIALIZED (
   SELECT f->'properties'->>'ra_codigo' AS codigo,extensions.ST_GeomFromGeoJSON(f->'geometry') AS g
   FROM jsonb_array_elements($3::jsonb->'features') f
 ), linhas AS MATERIALIZED (
   SELECT s.campos_csv->>'ocorrencia_chave' AS chave,l.id,l.latitude_geo_original AS lat_original,
     l.longitude_geo_original AS lon_original,
     sentinela_pcdf_revisao.decimal_geo(l.latitude_geo_original,90) AS lat,
     sentinela_pcdf_revisao.decimal_geo(l.longitude_geo_original,180) AS lon,
     sentinela_pcdf_revisao.estado_geo(l.latitude_geo_original,l.longitude_geo_original) AS estado,
     n.ocorrencia_id IS NOT NULL AS consolidada
   FROM sentinela.linhas_staging s JOIN sentinela.linhas_origem l ON l.id=s.linha_origem_id
   LEFT JOIN sentinela.ocorrencia_naturezas n ON n.linha_origem_id=l.id
   WHERE s.lote_id=$1::uuid
 ), pares AS MATERIALIZED (
   SELECT lat,lon,count(*) AS associacoes,count(DISTINCT chave) AS chaves,
     extensions.ST_SetSRID(extensions.ST_MakePoint(lon::float8,lat::float8),4326) AS p
   FROM linhas WHERE estado='referencia_pendente' GROUP BY lat,lon
 ), por_chave AS MATERIALIZED (
   SELECT chave,count(*) AS associacoes,count(*) FILTER (WHERE estado='referencia_pendente') AS completos,
     count(DISTINCT (lat,lon)) FILTER (WHERE estado='referencia_pendente') AS pares_distintos
   FROM linhas GROUP BY chave
 ), situacao AS MATERIALIZED (
   SELECT p.*,extensions.ST_Covers(d.g,p.p) AS no_df,
      t.coberturas,t.interiores,t.codigo
   FROM pares p CROSS JOIN perimetro d CROSS JOIN LATERAL (
      SELECT count(*) AS coberturas,count(*) FILTER (WHERE extensions.ST_Contains(r.g,p.p)) AS interiores,min(codigo) AS codigo
      FROM ras r WHERE extensions.ST_Covers(r.g,p.p)
   ) t
 ), precisao AS (
   SELECT scale(lat) AS latitude,scale(lon) AS longitude,count(*) AS associacoes
   FROM linhas WHERE estado='referencia_pendente' GROUP BY 1,2
 ), por_ra AS (
   SELECT codigo,sum(associacoes) AS associacoes FROM situacao WHERE coberturas=1 AND interiores=1 GROUP BY codigo
 )
SELECT jsonb_build_object(
  'associacoes',(SELECT count(*) FROM linhas),'chaves',(SELECT count(*) FROM por_chave),
  'porEstado',(SELECT jsonb_object_agg(estado,total) FROM (SELECT estado,count(*) AS total FROM linhas GROUP BY estado) e),
  'chavesComPar',(SELECT count(*) FROM por_chave WHERE completos>0),
  'chavesParesDivergentes',(SELECT count(*) FROM por_chave WHERE pares_distintos>1),
  'chavesCompletoEAusente',(SELECT count(*) FROM por_chave WHERE completos>0 AND completos<associacoes),
  'assocEmRevisaoComPar',(SELECT count(*) FROM linhas WHERE NOT consolidada AND estado='referencia_pendente'),
  'paresDistintos',(SELECT count(*) FROM pares),'paresRepetidos',(SELECT count(*) FROM pares WHERE associacoes>1),
  'paresCompartilhadosPorChaves',(SELECT count(*) FROM pares WHERE chaves>1),
  'chavesEmParesCompartilhados',(SELECT count(DISTINCT l.chave) FROM linhas l JOIN pares p USING(lat,lon) WHERE p.chaves>1),
  'maxChavesMesmoPar',(SELECT max(chaves) FROM pares),
  'intervalos',(SELECT jsonb_build_object('latInferior',floor(min(lat)*1000)/1000,'latSuperior',ceil(max(lat)*1000)/1000,
      'lonInferior',floor(min(lon)*1000)/1000,'lonSuperior',ceil(max(lon)*1000)/1000) FROM pares),
  'perimetro',(SELECT jsonb_build_object('valido',extensions.ST_IsValid(g),'srid',extensions.ST_SRID(g),
      'sha256EWKB',sentinela_pcdf_geo.hash_geometria(g)) FROM perimetro),
  'foraPerimetroAssociacoes',(SELECT coalesce(sum(associacoes),0) FROM situacao WHERE NOT no_df),
  'foraPerimetroPares',(SELECT count(*) FROM situacao WHERE NOT no_df),
  'semCoberturaRA',(SELECT coalesce(sum(associacoes),0) FROM situacao WHERE coberturas=0),
  'coberturaRAAmbigua',(SELECT coalesce(sum(associacoes),0) FROM situacao WHERE coberturas>1 OR coberturas=1 AND interiores=0),
  'distribuicaoRA',(SELECT jsonb_object_agg(codigo,associacoes) FROM por_ra),
  'precisaoDecimal',(SELECT jsonb_agg(to_jsonb(p) ORDER BY latitude,longitude) FROM precisao p),
  'estadosConsolidados',(SELECT jsonb_object_agg(estado,total) FROM (
     SELECT estado,count(*) AS total FROM sentinela_pcdf_geo.propor($1::uuid,NULL,NULL) GROUP BY estado) e)
) AS auditoria;
