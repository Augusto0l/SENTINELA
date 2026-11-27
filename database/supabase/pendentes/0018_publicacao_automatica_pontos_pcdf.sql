-- 0018 - Publicacao automatica dos pontos PCDF no Mapa Criminal e no Dashboard. PENDENTE: aplicar com autorizacao.
-- Regra: a mesma da decisao do responsavel de 25/11/2026 (database/release/pcdf-publicar-pontos.psql,
-- local-pcdf-pontos-0001): pares Latitude/Longitude GEO como graus decimais em EPSG:4326, CRS de origem sem
-- comprovacao formal; publica a ocorrencia PCDF ativa e consolidada quando todas as linhas de origem trazem o
-- mesmo par valido e exatamente uma RA oficial cobre o ponto.
-- Antes: o script era manual e so foi executado para janeiro/2021; competencias importadas depois e ocorrencias
-- consolidadas pela revisao ficavam fora de Pontos e Calor. Agora gatilhos de instrucao publicam na mesma transacao
-- da importacao (vinculos inseridos) e da consolidacao/alteracao da ocorrencia. Nenhuma ocorrencia e alterada;
-- em_revisao, inativa, sem par unico valido, fora do DF ou em RA ambigua permanece fora do mapa.
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  IF NOT sentinela_ambiente.vinculado()
     OR NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao = '0011')
     OR EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao = '0018')
     -- Catalog lookups: the migrator has no USAGE on the analytics schema (owned by the reader).
     OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE (n.nspname, c.relname) IN (('sentinela_ocorrencias_analytics', 'pcdf_pontos'),
           ('sentinela_ocorrencias_analytics', 'pontos_pcdf_publicados'), ('sentinela_ocorrencias_manual', 'naturezas_retiradas'))) <> 3
     OR EXISTS (SELECT FROM pg_roles WHERE rolname = 'sentinela_pontos_owner') THEN
    RAISE EXCEPTION '0018 exige a 0011 e a publicacao de pontos instaladas, e ainda nao aplicada.';
  END IF;
END $pre$;

CREATE ROLE sentinela_pontos_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT sentinela_pontos_owner TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
CREATE SCHEMA sentinela_pontos;
REVOKE ALL ON SCHEMA sentinela_pontos FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE, CREATE ON SCHEMA sentinela_pontos TO sentinela_pontos_owner;
GRANT USAGE ON SCHEMA sentinela, sentinela_ocorrencias_manual, extensions TO sentinela_pontos_owner;
GRANT SELECT (id, versao, ativo, consolidacao_status, fonte, origem) ON sentinela.ocorrencias TO sentinela_pontos_owner;
GRANT SELECT (id, ocorrencia_id, linha_origem_id) ON sentinela.ocorrencia_naturezas TO sentinela_pontos_owner;
GRANT SELECT (id, latitude_geo_original, longitude_geo_original) ON sentinela.linhas_origem TO sentinela_pontos_owner;
GRANT SELECT (codigo_interno, limite) ON sentinela.regioes_administrativas TO sentinela_pontos_owner;
GRANT SELECT (associacao_id) ON sentinela_ocorrencias_manual.naturezas_retiradas TO sentinela_pontos_owner;
GRANT INSERT (ator_tipo, servico, acao, depois, justificativa, request_id) ON sentinela.eventos_auditoria TO sentinela_pontos_owner;
-- The reader owns the analytics schema: USAGE for the new owner, and for the migrator only until COMMIT.
SET LOCAL ROLE sentinela_ocorrencias_reader;
GRANT USAGE ON SCHEMA sentinela_ocorrencias_analytics TO sentinela_pontos_owner, SESSION_USER;
RESET ROLE;
GRANT SELECT, INSERT, UPDATE, DELETE ON sentinela_ocorrencias_analytics.pcdf_pontos TO sentinela_pontos_owner;

-- The owner is reachable only through its SECURITY DEFINER functions; the policies stay limited to what they read/write.
CREATE POLICY pontos_ocorrencias ON sentinela.ocorrencias FOR SELECT TO sentinela_pontos_owner
  USING (fonte = 'PCDF' AND origem = 'importacao');
CREATE POLICY pontos_vinculos ON sentinela.ocorrencia_naturezas FOR SELECT TO sentinela_pontos_owner
  USING (origem = 'importacao');
CREATE POLICY pontos_origem ON sentinela.linhas_origem FOR SELECT TO sentinela_pontos_owner USING (true);
CREATE POLICY pontos_ra ON sentinela.regioes_administrativas FOR SELECT TO sentinela_pontos_owner USING (true);
CREATE POLICY pontos_retiradas ON sentinela_ocorrencias_manual.naturezas_retiradas FOR SELECT TO sentinela_pontos_owner USING (true);
CREATE POLICY pontos_auditoria ON sentinela.eventos_auditoria FOR INSERT TO sentinela_pontos_owner
  WITH CHECK (ator_tipo = 'servico' AND servico = 'sentinela-pcdf-geo' AND acao = 'pcdf.publicacao_pontos');
CREATE POLICY pontos_publicacao ON sentinela_ocorrencias_analytics.pcdf_pontos FOR ALL TO sentinela_pontos_owner
  USING (true) WITH CHECK (true);

-- Publishes (or withdraws) the points of the given occurrences; NULL = every active consolidated PCDF occurrence.
-- Runs inside large import transactions whose new rows are not yet in the statistics: hash joins avoid quadratic
-- nested loops (the spatial RA test still uses the GiST index, its only plan).
CREATE FUNCTION sentinela_pontos.publicar(p_ocorrencias uuid[]) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET enable_nestloop = off AS $fn$
DECLARE v_publicacao uuid := gen_random_uuid(); v_publicados integer; v_retirados integer; v_ids uuid[] := p_ocorrencias;
BEGIN
  IF v_ids IS NOT NULL AND cardinality(v_ids) = 0 THEN RETURN 0; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pontos-pcdf', 0));
  -- An explicit id list keeps one plan shape (a nullable "all" predicate degraded the generic plan ~50x).
  IF v_ids IS NULL THEN
    v_ids := ARRAY(SELECT o.id FROM sentinela.ocorrencias o WHERE o.fonte = 'PCDF' AND o.origem = 'importacao');
  END IF;
  WITH alvo AS MATERIALIZED (
    SELECT o.id, o.versao, o.ativo AND o.consolidacao_status = 'consolidada' AS consolidada
    FROM sentinela.ocorrencias o
    WHERE o.fonte = 'PCDF' AND o.origem = 'importacao' AND o.id = ANY (v_ids)
  ), pares AS MATERIALIZED (
    SELECT a.ocorrencia_id AS id, count(*) AS origens, count(*) FILTER (WHERE v.valida) AS validas,
      count(DISTINCT (v.lat, v.lon)) FILTER (WHERE v.valida) AS distintos,
      min(v.lat) FILTER (WHERE v.valida) AS lat, min(v.lon) FILTER (WHERE v.valida) AS lon,
      encode(sha256(convert_to(string_agg(l.id::text || ':' || coalesce(l.latitude_geo_original, '') || ','
        || coalesce(l.longitude_geo_original, ''), '|' ORDER BY l.id), 'UTF8')), 'hex') AS origem_sha256
    FROM alvo t
    JOIN sentinela.ocorrencia_naturezas a ON a.ocorrencia_id = t.id
    JOIN sentinela.linhas_origem l ON l.id = a.linha_origem_id
    CROSS JOIN LATERAL (SELECT btrim(l.latitude_geo_original) ~ '^-?[0-9]{1,3}(\.[0-9]{1,15})?$'
        AND btrim(l.longitude_geo_original) ~ '^-?[0-9]{1,3}(\.[0-9]{1,15})?$' AS valida) f
    CROSS JOIN LATERAL (SELECT f.valida, CASE WHEN f.valida THEN btrim(l.latitude_geo_original)::numeric END AS lat,
        CASE WHEN f.valida THEN btrim(l.longitude_geo_original)::numeric END AS lon) v
    WHERE t.consolidada
      AND NOT EXISTS (SELECT FROM sentinela_ocorrencias_manual.naturezas_retiradas r WHERE r.associacao_id = a.id)
    GROUP BY a.ocorrencia_id
  ), candidatos AS MATERIALIZED (
    SELECT t.id, t.versao, p.lat::float8 AS latitude, p.lon::float8 AS longitude, p.origem_sha256,
      extensions.ST_SetSRID(extensions.ST_MakePoint(p.lon::float8, p.lat::float8), 4326) AS ponto
    FROM alvo t JOIN pares p ON p.id = t.id
    WHERE p.origens = p.validas AND p.distintos = 1 AND p.lat BETWEEN -90 AND 90 AND p.lon BETWEEN -180 AND 180
  ), elegiveis AS MATERIALIZED (
    SELECT c.*, min(r.codigo_interno::text) AS ra
    FROM candidatos c JOIN sentinela.regioes_administrativas r ON extensions.ST_Covers(r.limite, c.ponto)
    GROUP BY c.id, c.versao, c.latitude, c.longitude, c.origem_sha256, c.ponto
    HAVING count(*) = 1
  ), retirados AS (
    DELETE FROM sentinela_ocorrencias_analytics.pcdf_pontos p
    USING alvo t LEFT JOIN elegiveis e ON e.id = t.id WHERE p.ocorrencia_id = t.id AND e.id IS NULL
    RETURNING 1
  ), publicados AS (
    INSERT INTO sentinela_ocorrencias_analytics.pcdf_pontos
      (ocorrencia_id, versao_ocorrencia, latitude, longitude, geometria, ra_codigo, origem_sha256, publicacao_id)
    SELECT e.id, e.versao, e.latitude, e.longitude, e.ponto, e.ra, e.origem_sha256, v_publicacao FROM elegiveis e
    ON CONFLICT (ocorrencia_id) DO UPDATE SET versao_ocorrencia = excluded.versao_ocorrencia, latitude = excluded.latitude,
      longitude = excluded.longitude, geometria = excluded.geometria, ra_codigo = excluded.ra_codigo,
      origem_sha256 = excluded.origem_sha256, publicacao_id = excluded.publicacao_id, publicado_em = clock_timestamp()
    WHERE (pcdf_pontos.versao_ocorrencia, pcdf_pontos.latitude, pcdf_pontos.longitude, pcdf_pontos.ra_codigo, pcdf_pontos.origem_sha256)
      IS DISTINCT FROM (excluded.versao_ocorrencia, excluded.latitude, excluded.longitude, excluded.ra_codigo, excluded.origem_sha256)
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM publicados), (SELECT count(*) FROM retirados) INTO v_publicados, v_retirados;
  IF v_publicados + v_retirados > 0 THEN
    INSERT INTO sentinela.eventos_auditoria(ator_tipo, servico, acao, depois, justificativa, request_id)
    VALUES ('servico', 'sentinela-pcdf-geo', 'pcdf.publicacao_pontos', jsonb_build_object('publicacao', v_publicacao,
      'automatica', true, 'escopo', CASE WHEN p_ocorrencias IS NULL THEN 'todas' ELSE 'ocorrencias' END,
      'ocorrencias', coalesce(cardinality(p_ocorrencias), 0), 'publicados', v_publicados, 'retirados', v_retirados,
      'crsDestino', 'EPSG:4326', 'crsOrigem', 'graus decimais assumidos como WGS84/SIRGAS2000; sem comprovação formal'),
      'Publicação automática de pontos PCDF pela regra da decisão do responsável de 25/11/2026', v_publicacao);
  END IF;
  RETURN v_publicados;
END $fn$;

-- Import: links are inserted after the occurrence, so the publication follows the inserted links.
CREATE FUNCTION sentinela_pontos.apos_vinculos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
BEGIN
  PERFORM sentinela_pontos.publicar(ARRAY(SELECT DISTINCT n.ocorrencia_id FROM novos n WHERE n.origem = 'importacao'));
  RETURN NULL;
END $fn$;
-- Consolidation, approval, inactivation or any new version of a PCDF occurrence republishes (or withdraws) its point.
CREATE FUNCTION sentinela_pontos.apos_ocorrencias() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
BEGIN
  PERFORM sentinela_pontos.publicar(ARRAY(SELECT n.id FROM novos n WHERE n.fonte = 'PCDF' AND n.origem = 'importacao'));
  RETURN NULL;
END $fn$;

REVOKE ALL ON FUNCTION sentinela_pontos.publicar(uuid[]), sentinela_pontos.apos_vinculos(), sentinela_pontos.apos_ocorrencias()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sentinela_pontos.publicar(uuid[]) TO sentinela_pontos_owner;
-- Triggers are created while the migrator still owns the functions (CREATE TRIGGER checks EXECUTE).
CREATE TRIGGER pontos_pcdf_vinculos AFTER INSERT ON sentinela.ocorrencia_naturezas
  REFERENCING NEW TABLE AS novos FOR EACH STATEMENT EXECUTE FUNCTION sentinela_pontos.apos_vinculos();
CREATE TRIGGER pontos_pcdf_ocorrencias AFTER UPDATE ON sentinela.ocorrencias
  REFERENCING NEW TABLE AS novos FOR EACH STATEMENT EXECUTE FUNCTION sentinela_pontos.apos_ocorrencias();
ALTER FUNCTION sentinela_pontos.publicar(uuid[]) OWNER TO sentinela_pontos_owner;
ALTER FUNCTION sentinela_pontos.apos_vinculos() OWNER TO sentinela_pontos_owner;
ALTER FUNCTION sentinela_pontos.apos_ocorrencias() OWNER TO sentinela_pontos_owner;
REVOKE CREATE ON SCHEMA sentinela_pontos FROM sentinela_pontos_owner;

-- Catch-up: publishes the competences already consolidated without points; January stays idempotent.
SET LOCAL ROLE sentinela_pontos_owner;
SELECT sentinela_pontos.publicar(NULL);
RESET ROLE;

DO $post$
BEGIN
  IF EXISTS (SELECT ocorrencia_id FROM sentinela_ocorrencias_analytics.pcdf_pontos GROUP BY 1 HAVING count(*) > 1)
     OR EXISTS (SELECT FROM sentinela_ocorrencias_analytics.pcdf_pontos p JOIN sentinela.ocorrencias o ON o.id = p.ocorrencia_id
                WHERE NOT (o.ativo AND o.consolidacao_status = 'consolidada' AND o.fonte = 'PCDF' AND o.origem = 'importacao'))
     OR (SELECT count(*) FROM pg_class WHERE relnamespace = 'sentinela'::regnamespace AND relkind = 'r' AND relrowsecurity AND relforcerowsecurity) <> 19
     OR EXISTS (SELECT FROM pg_roles WHERE rolname = 'sentinela_pontos_owner' AND (rolcanlogin OR rolbypassrls OR rolsuper OR rolinherit))
     OR has_function_privilege('sentinela_local_analyst', 'sentinela_pontos.publicar(uuid[])', 'EXECUTE')
     OR has_function_privilege('sentinela_local_admin', 'sentinela_pontos.publicar(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'Pos-condicoes da 0018 divergentes.';
  END IF;
END $post$;
SET LOCAL ROLE sentinela_ocorrencias_reader;
REVOKE USAGE ON SCHEMA sentinela_ocorrencias_analytics FROM SESSION_USER;
RESET ROLE;
INSERT INTO sentinela.schema_migrations VALUES ('0018','Publicacao automatica dos pontos PCDF no mapa',DEFAULT);
COMMIT;
