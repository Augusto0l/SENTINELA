-- Executar em transação no clone atestado. Nenhuma função é exposta ao aplicativo.
SET LOCAL search_path=pg_catalog,pg_temp;

DO $guard$
BEGIN
 IF current_database()<>'sentinela_pcdf_local' OR inet_server_addr() IS DISTINCT FROM inet '127.0.0.1'
   OR inet_server_port() IS DISTINCT FROM 55487 OR session_user<>'postgres'
   OR nullif(current_setting('sentinela.geo_clone_uuid',true),'') IS NULL
   OR current_setting('sentinela.sandbox_uuid',true) IS DISTINCT FROM current_setting('sentinela.geo_clone_uuid',true)
   OR current_setting('sentinela.sandbox_uuid',true)='c04244a6-bc8d-4491-98bc-9af8a268d30c'
   OR (SELECT system_identifier::text FROM pg_control_system()) IS DISTINCT FROM current_setting('sentinela.geo_clone_system',true)
   OR current_setting('sentinela.geo_clone_system',true)='7710764288366362848'
   OR NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='local-pcdf-revisao-independente-0001')
 THEN RAISE EXCEPTION 'Clone geográfico atestado obrigatório'; END IF;
END
$guard$;

CREATE SCHEMA sentinela_pcdf_geo;
REVOKE ALL ON SCHEMA sentinela_pcdf_geo FROM PUBLIC;

CREATE TABLE sentinela_pcdf_geo.publicacoes (
 ocorrencia_id uuid PRIMARY KEY REFERENCES sentinela.ocorrencias(id),
 ocorrencia_versao bigint NOT NULL CHECK (ocorrencia_versao>0),
 lote_id uuid NOT NULL REFERENCES sentinela.lotes_importacao(id),
 geometria extensions.geometry(Point,4326) NOT NULL CHECK (NOT extensions.ST_IsEmpty(geometria)
   AND extensions.ST_X(geometria) BETWEEN -180 AND 180 AND extensions.ST_Y(geometria) BETWEEN -90 AND 90),
 origem_sha256 text NOT NULL CHECK (origem_sha256 ~ '^[0-9a-f]{64}$'),
 evidencia_sha256 text NOT NULL CHECK (evidencia_sha256 ~ '^[0-9a-f]{64}$'),
 srid_origem integer NOT NULL CHECK (srid_origem>0),
 versao text NOT NULL CHECK (versao='pcdf-geo-v1')
);
ALTER TABLE sentinela_pcdf_geo.publicacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_pcdf_geo.publicacoes FORCE ROW LEVEL SECURITY;
CREATE POLICY geo_pcdf_leitura ON sentinela_pcdf_geo.publicacoes FOR SELECT TO sentinela_ocorrencias_reader USING (true);
GRANT USAGE ON SCHEMA sentinela_pcdf_geo TO sentinela_ocorrencias_reader;
GRANT SELECT (ocorrencia_id,ocorrencia_versao,geometria) ON sentinela_pcdf_geo.publicacoes TO sentinela_ocorrencias_reader;

CREATE FUNCTION sentinela_pcdf_geo.geojson_poligono(dados jsonb) RETURNS extensions.geometry
LANGUAGE sql STABLE STRICT SET search_path=pg_catalog AS $body$
 SELECT CASE WHEN dados->>'type'='FeatureCollection' AND jsonb_array_length(dados->'features')=1 THEN
   extensions.ST_GeomFromGeoJSON(dados->'features'->0->'geometry') END
$body$;

CREATE FUNCTION sentinela_pcdf_geo.hash_geometria(p extensions.geometry) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $body$
 SELECT encode(sha256(extensions.ST_AsEWKB(extensions.ST_Normalize(p),'XDR')),'hex')
$body$;

-- Uma ocorrência só entra no lote quando todos os seus vínculos de origem pertencem à coorte.
CREATE FUNCTION sentinela_pcdf_geo.coorte(lote uuid)
RETURNS TABLE (id uuid, data_fato date, ra_id uuid, lat numeric, lon numeric, estado text, origem_sha text)
LANGUAGE sql STABLE SET search_path=pg_catalog AS $body$
 WITH escopo AS MATERIALIZED (
   SELECT DISTINCT s.linha_origem_id FROM sentinela.linhas_staging s WHERE s.lote_id=lote
 ), candidatas AS MATERIALIZED (
   SELECT DISTINCT a.ocorrencia_id FROM sentinela.ocorrencia_naturezas a JOIN escopo e USING(linha_origem_id)
 ), brutos AS MATERIALIZED (
   SELECT o.id,o.data_fato,o.ra_id,l.id AS origem,e.linha_origem_id IS NOT NULL AS no_lote,
     sentinela_pcdf_revisao.decimal_geo(l.latitude_geo_original,90) AS lat,
     sentinela_pcdf_revisao.decimal_geo(l.longitude_geo_original,180) AS lon,
     sentinela_pcdf_revisao.estado_geo(l.latitude_geo_original,l.longitude_geo_original) AS estado
   FROM candidatas c JOIN sentinela.ocorrencias o ON o.id=c.ocorrencia_id
   JOIN sentinela.ocorrencia_naturezas a ON a.ocorrencia_id=o.id
   LEFT JOIN escopo e ON e.linha_origem_id=a.linha_origem_id
   LEFT JOIN sentinela.linhas_origem l ON l.id=a.linha_origem_id
   WHERE o.ativo AND o.origem='importacao' AND o.fonte='PCDF' AND o.identidade_status='homologada'
     AND o.consolidacao_status='consolidada'
 )
 SELECT b.id,b.data_fato,b.ra_id,min(b.lat),min(b.lon),
   CASE WHEN NOT bool_and(no_lote) THEN 'origem_fora_do_lote'
        WHEN count(DISTINCT b.estado)<>1 OR count(DISTINCT (b.lat,b.lon))<>1 THEN 'divergente'
        ELSE min(b.estado) END,
   encode(sha256(convert_to(string_agg(DISTINCT b.origem::text,',' ORDER BY b.origem::text),'UTF8')),'hex')
 FROM brutos b GROUP BY b.id,b.data_fato,b.ra_id
$body$;

CREATE FUNCTION sentinela_pcdf_geo.transformar(lat numeric,lon numeric,srid integer) RETURNS extensions.geometry
LANGUAGE sql STABLE STRICT SET search_path=pg_catalog AS $body$
 SELECT CASE WHEN abs(lat)<=90 AND abs(lon)<=180 THEN extensions.ST_Transform(
   extensions.ST_SetSRID(extensions.ST_MakePoint(lon::float8,lat::float8),srid),4326) END
$body$;

CREATE FUNCTION sentinela_pcdf_geo.atestar(lote uuid,ref jsonb,limite extensions.geometry) RETURNS integer
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $body$
DECLARE srid_origem integer; tolerancia double precision;
BEGIN
 IF ref IS NULL THEN RETURN NULL; END IF;
 IF jsonb_typeof(ref) IS DISTINCT FROM 'object'
   OR EXISTS (SELECT FROM unnest(ARRAY['datum','documento','metodo','precisao','transformacoes','perimetro','controles_documento']) AS f(chave)
       WHERE jsonb_typeof(ref->f.chave) IS DISTINCT FROM 'string' OR nullif(btrim(ref->>f.chave),'') IS NULL)
   OR coalesce(ref->>'documento_sha256','') !~ '^[0-9a-f]{64}$'
   OR coalesce(ref->>'controles_sha256','') !~ '^[0-9a-f]{64}$'
   OR ref->>'ordem' IS DISTINCT FROM 'latitude,longitude' OR ref->>'unidade' IS DISTINCT FROM 'grau'
   OR coalesce(ref->>'epsg','') !~ '^[1-9][0-9]{0,5}$'
   OR coalesce(ref->>'tolerancia_m','') !~ '^[0-9]{1,4}(\.[0-9]{1,6})?$'
   OR jsonb_typeof(ref->'controles') IS DISTINCT FROM 'array'
   OR NOT EXISTS (SELECT FROM sentinela.lotes_importacao l JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id
          WHERE l.id=lote AND x.fonte='PCDF' AND l.sha256_arquivo=ref->>'sha256_csv'
            AND (x.sha256_xml=ref->>'sha256_xml' OR (
              -- O CSV avulso não registrou o SHA do XML. Esta exceção se limita à conciliação literal já atestada.
              x.sha256_xml IS NULL AND l.id='84908630-bd04-4a03-923d-616649c8de74'
              AND l.sha256_arquivo='91fa79f88988d1540e81f438e0fb470cea07a0809ac60387577fbdf0be9d6a00'
              AND ref->>'sha256_xml'='faf82ae0620fa3ecc53bc002d9c2e49b24b6ec0126a44449510d12948dc0a022')))
 THEN RAISE EXCEPTION 'Evidência geográfica ausente, incompatível ou de outro lote'; END IF;
 srid_origem := (ref->>'epsg')::integer;
 tolerancia := (ref->>'tolerancia_m')::double precision;
 IF tolerancia<=0 OR NOT EXISTS (SELECT FROM extensions.spatial_ref_sys s WHERE s.srid=srid_origem
       AND s.auth_name='EPSG' AND s.auth_srid=s.srid AND s.srtext ~ '^(GEOGCS|GEOGCRS)\[')
   OR limite IS NULL OR extensions.ST_SRID(limite)<>4326 OR extensions.ST_IsEmpty(limite)
   OR extensions.ST_GeometryType(limite) NOT IN ('ST_Polygon','ST_MultiPolygon') OR NOT extensions.ST_IsValid(limite)
   OR sentinela_pcdf_geo.hash_geometria(limite) IS DISTINCT FROM ref->>'perimetro_ewkb_sha256'
 THEN RAISE EXCEPTION 'CRS geográfico angular ou perímetro homologado inválido'; END IF;

 IF NOT (WITH entradas AS MATERIALIZED (
            SELECT sentinela_pcdf_revisao.decimal_geo(c.lat,90) AS lat,sentinela_pcdf_revisao.decimal_geo(c.lon,180) AS lon,
              sentinela_pcdf_revisao.decimal_geo(c.lat_alvo,90) AS lat_alvo,sentinela_pcdf_revisao.decimal_geo(c.lon_alvo,180) AS lon_alvo
            FROM jsonb_to_recordset(ref->'controles') c(lat text,lon text,lat_alvo text,lon_alvo text)
          ), pontos AS MATERIALIZED (
            SELECT sentinela_pcdf_geo.transformar(lat,lon,srid_origem) AS p,
              sentinela_pcdf_geo.transformar(lat_alvo,lon_alvo,4326) AS alvo FROM entradas
          )
          SELECT count(DISTINCT p)>=2 AND count(DISTINCT alvo)>=2 AND bool_and(coalesce(
            extensions.ST_Covers(limite,alvo) AND extensions.ST_DWithin(p::extensions.geography,alvo::extensions.geography,tolerancia),false))
          FROM pontos)
 THEN RAISE EXCEPTION 'Controles independentes insuficientes ou fora da tolerância'; END IF;
 RETURN srid_origem;
END
$body$;

CREATE FUNCTION sentinela_pcdf_geo.propor(lote uuid,ref jsonb,limite extensions.geometry)
RETURNS TABLE (id uuid, estado text, ra_estado text, geometria extensions.geometry, origem_sha text)
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $body$
DECLARE srid integer := sentinela_pcdf_geo.atestar(lote,ref,limite);
BEGIN
 RETURN QUERY WITH pontos AS MATERIALIZED (
   SELECT c.*,CASE WHEN c.estado='referencia_pendente' THEN sentinela_pcdf_geo.transformar(c.lat,c.lon,srid) END AS p
   FROM sentinela_pcdf_geo.coorte(lote) c
 ), dentro AS MATERIALIZED (
   SELECT p.*,CASE WHEN p.p IS NOT NULL THEN extensions.ST_Covers(limite,p.p) END AS no_df FROM pontos p
 ), decisoes AS (
   SELECT d.*,CASE WHEN NOT coalesce(d.no_df,false) THEN NULL
      WHEN r.contagem>1 OR r.contagem=1 AND NOT r.interior THEN 'ra_ambigua'
      WHEN d.ra_id IS NOT NULL AND NOT coalesce(r.corresponde,false) THEN 'ra_incompativel'
      WHEN d.ra_id IS NOT NULL THEN 'ra_confirmada'
      WHEN r.contagem=1 THEN 'ra_candidata_sem_vinculo'
      ELSE 'ra_sem_vinculo' END AS ra
   FROM dentro d LEFT JOIN LATERAL (
     SELECT count(*) AS contagem,bool_or(extensions.ST_Contains(r.limite,d.p)) AS interior,
       bool_or(r.id=d.ra_id AND extensions.ST_Contains(r.limite,d.p)) AS corresponde
     FROM sentinela.regioes_administrativas r WHERE d.no_df AND r.vigencia @> d.data_fato
       AND extensions.ST_Covers(r.limite,d.p)
   ) r ON true
 )
 SELECT d.id,CASE WHEN d.p IS NULL THEN d.estado WHEN NOT d.no_df THEN 'fora_df'
                  WHEN d.ra IN ('ra_ambigua','ra_incompativel') THEN d.ra ELSE 'elegivel' END,
   d.ra,CASE WHEN d.no_df AND d.ra NOT IN ('ra_ambigua','ra_incompativel') THEN d.p END,d.origem_sha
 FROM decisoes d;
END
$body$;

CREATE FUNCTION sentinela_pcdf_geo.assinatura(lote uuid,ref jsonb,limite extensions.geometry) RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog AS $body$
 SELECT encode(sha256(convert_to(jsonb_build_array('pcdf-geo-v1',lote,ref,
    coalesce(jsonb_agg(jsonb_build_array(p.id,p.estado,p.ra_estado,p.origem_sha,
       sentinela_pcdf_geo.hash_geometria(p.geometria)) ORDER BY p.id),'[]'::jsonb))::text,'UTF8')),'hex')
 FROM sentinela_pcdf_geo.propor(lote,ref,limite) p
$body$;

CREATE FUNCTION sentinela_pcdf_geo.publicar(lote uuid,ref jsonb,limite extensions.geometry,assinatura_aprovada text)
RETURNS bigint LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $body$
DECLARE total bigint; conflito boolean; ref_sha text := encode(sha256(convert_to(ref::text,'UTF8')),'hex');
BEGIN
 IF inet_server_port() IS DISTINCT FROM 55487 OR session_user<>'postgres'
   OR nullif(current_setting('sentinela.geo_clone_uuid',true),'') IS NULL
   OR current_setting('sentinela.sandbox_uuid',true) IS DISTINCT FROM current_setting('sentinela.geo_clone_uuid',true)
   OR current_setting('sentinela.sandbox_uuid',true)='c04244a6-bc8d-4491-98bc-9af8a268d30c'
   OR (SELECT system_identifier::text FROM pg_control_system()) IS DISTINCT FROM current_setting('sentinela.geo_clone_system',true)
   OR current_setting('sentinela.geo_clone_system',true)='7710764288366362848'
 THEN RAISE EXCEPTION 'Publicação restrita ao clone atestado'; END IF;
 IF ref IS NULL OR coalesce(assinatura_aprovada,'') !~ '^[0-9a-f]{64}$' THEN
   RAISE EXCEPTION 'Publicação exige evidência e assinatura aprovada'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
 LOCK TABLE sentinela.ocorrencias, sentinela.ocorrencia_naturezas, sentinela.linhas_staging,
   sentinela.linhas_origem, sentinela.lotes_importacao, sentinela.extracoes_origem, sentinela.regioes_administrativas IN SHARE MODE;
 LOCK TABLE sentinela_pcdf_geo.publicacoes IN SHARE ROW EXCLUSIVE MODE;
 IF sentinela_pcdf_geo.assinatura(lote,ref,limite) IS DISTINCT FROM assinatura_aprovada THEN
   RAISE EXCEPTION 'Proposta diverge da assinatura aprovada'; END IF;
 WITH proposta AS MATERIALIZED (SELECT * FROM sentinela_pcdf_geo.propor(lote,ref,limite) p WHERE p.estado='elegivel')
 SELECT EXISTS (SELECT FROM sentinela_pcdf_geo.publicacoes g WHERE g.lote_id=lote AND NOT EXISTS (
     SELECT FROM proposta p WHERE p.id=g.ocorrencia_id
       AND p.origem_sha=g.origem_sha256 AND g.evidencia_sha256=ref_sha
       AND sentinela_pcdf_geo.hash_geometria(p.geometria)=sentinela_pcdf_geo.hash_geometria(g.geometria)))
   OR EXISTS (SELECT FROM proposta p
     LEFT JOIN sentinela_pcdf_geo.publicacoes g ON g.ocorrencia_id=p.id
     JOIN sentinela.ocorrencias o ON o.id=p.id
     WHERE g.lote_id<>lote OR o.geometria IS NOT NULL OR g.ocorrencia_versao<>o.versao)
 INTO conflito;
 IF conflito THEN RAISE EXCEPTION 'Publicação anterior exige revisão; substituição automática proibida'; END IF;

 INSERT INTO sentinela_pcdf_geo.publicacoes(ocorrencia_id,ocorrencia_versao,lote_id,geometria,origem_sha256,evidencia_sha256,srid_origem,versao)
 SELECT p.id,o.versao,lote,p.geometria,p.origem_sha,ref_sha,(ref->>'epsg')::integer,'pcdf-geo-v1'
 FROM sentinela_pcdf_geo.propor(lote,ref,limite) p JOIN sentinela.ocorrencias o ON o.id=p.id WHERE p.estado='elegivel'
 ON CONFLICT (ocorrencia_id) DO NOTHING;
 GET DIAGNOSTICS total=ROW_COUNT;
 IF total>0 THEN
   INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,depois,justificativa)
   VALUES ('servico','sentinela-pcdf-geo','pcdf.geo.publicacao_clone',jsonb_build_object('lote',lote,'total',total,
    'versao','pcdf-geo-v1','evidenciaSha256',ref_sha,'propostaSha256',assinatura_aprovada,'referencia',ref->>'documento',
    'documentoSha256',ref->>'documento_sha256','controlesSha256',ref->>'controles_sha256',
    'perimetroSha256',ref->>'perimetro_ewkb_sha256','epsgOrigem',(ref->>'epsg')::integer,'epsgAlvo',4326),
    'Publicação experimental com evidência, controles e perímetro atestados');
 END IF;
 RETURN total;
END
$body$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sentinela_pcdf_geo FROM PUBLIC;

-- A versão corrente publica apenas a geometria aprovada; a RA continua sendo o vínculo validado da ocorrência.
DO $projection$
BEGIN
 IF to_regclass('sentinela_ocorrencias_analytics.pontos_pcdf_publicados') IS NOT NULL THEN
   CREATE OR REPLACE VIEW sentinela_ocorrencias_analytics.pontos_pcdf_publicados WITH (security_barrier=true) AS
    SELECT o.id,extensions.ST_Y(g.geometria) AS latitude,extensions.ST_X(g.geometria) AS longitude
    FROM sentinela.ocorrencias o JOIN sentinela_pcdf_geo.publicacoes g
      ON g.ocorrencia_id=o.id AND g.ocorrencia_versao=o.versao
    WHERE o.ativo AND o.consolidacao_status='consolidada' AND o.origem='importacao' AND o.fonte='PCDF';
 ELSE
   CREATE OR REPLACE VIEW sentinela_ocorrencias_analytics.ocorrencias WITH (security_barrier=true) AS
    SELECT o.id,o.ativo,o.ra_id,o.data_fato,o.horario_fato,coalesce(extensions.ST_Y(g.geometria),o.latitude) AS latitude,
      coalesce(extensions.ST_X(g.geometria),o.longitude) AS longitude,
      CASE WHEN g.ocorrencia_id IS NOT NULL THEN 'validada' ELSE o.localizacao_status END AS localizacao_status
    FROM sentinela.ocorrencias o LEFT JOIN sentinela_pcdf_geo.publicacoes g ON g.ocorrencia_id=o.id AND g.ocorrencia_versao=o.versao
    WHERE o.ativo AND o.consolidacao_status='consolidada';
 END IF;
END $projection$;
