\set ON_ERROR_STOP on
BEGIN;

SELECT current_database() = 'mapa_pontos_clone'
  AND inet_server_addr() = '127.0.0.1'::inet
  AND inet_server_port() = :'clone_port'::integer
  AND (SELECT system_identifier::text FROM pg_control_system()) = :'clone_system'
  AS clone_verified
\gset
\if :clone_verified
\else
  \echo 'O leitor espacial só pode ser instalado no clone de ensaio atestado.'
  SELECT 1 / 0;
\endif

CREATE INDEX pcdf_pontos_geometria_gist
  ON sentinela_ocorrencias_analytics.pcdf_pontos USING gist (geometria);

-- Resolve PostGIS inside the function using its existing NOLOGIN owner.
GRANT USAGE ON SCHEMA extensions TO sentinela_ocorrencias_reader;

CREATE FUNCTION sentinela_ocorrencias_analytics.pontos_no_enquadramento(
    oeste double precision, sul double precision, leste double precision, norte double precision)
RETURNS TABLE(id uuid, latitude double precision, longitude double precision, ra_codigo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $query$
  WITH envelope AS MATERIALIZED (
    SELECT extensions.ST_MakeEnvelope(oeste,sul,leste,norte,4326) AS geom
    WHERE oeste >= -180 AND leste <= 180 AND sul >= -85 AND norte <= 85 AND oeste < leste AND sul < norte
  ), candidates AS MATERIALIZED (
    SELECT o.id FROM sentinela.ocorrencias o CROSS JOIN envelope e
    WHERE o.origem='manual' AND o.fonte='SENTINELA_MANUAL' AND o.geometria IS NOT NULL
      AND extensions.ST_Intersects(o.geometria,e.geom)
    UNION
    SELECT p.ocorrencia_id FROM sentinela_ocorrencias_analytics.pcdf_pontos p CROSS JOIN envelope e
    WHERE extensions.ST_Intersects(p.geometria,e.geom)
  )
  SELECT p.id,p.latitude,p.longitude,p.ra_codigo
  FROM candidates c JOIN sentinela_ocorrencias_analytics.pontos_confirmados p USING(id)
$query$;

ALTER FUNCTION sentinela_ocorrencias_analytics.pontos_no_enquadramento(double precision,double precision,double precision,double precision)
  OWNER TO sentinela_ocorrencias_reader;
REVOKE ALL ON FUNCTION sentinela_ocorrencias_analytics.pontos_no_enquadramento(double precision,double precision,double precision,double precision)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_ocorrencias_analytics.pontos_no_enquadramento(double precision,double precision,double precision,double precision)
  TO sentinela_local_admin,sentinela_local_operator,sentinela_local_analyst;

COMMIT;
