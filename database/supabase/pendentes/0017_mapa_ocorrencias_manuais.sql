-- Camada institucional de cadastros manuais no Mapa Criminal.
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  IF NOT sentinela_ambiente.vinculado()
     OR NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0011')
     OR EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0017') THEN
    RAISE EXCEPTION 'A 0017 exige o importador hospedado em uma instalacao vinculada.';
  END IF;
END $pre$;

GRANT CREATE ON SCHEMA sentinela_ocorrencias_manual TO sentinela_manual_writer;
SET LOCAL ROLE sentinela_manual_writer;
CREATE FUNCTION sentinela_ocorrencias_manual.pontos_mapa(p_alvo uuid) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'raCode',p.codigo_interno,
    'latitude',p.latitude,'longitude',p.longitude,'status',p.consolidacao_status)
    ORDER BY (p.id=p_alvo) DESC NULLS LAST,p.data_fato DESC,p.horario_fato DESC,p.id),'[]'::jsonb)
  FROM (
    SELECT o.id,r.codigo_interno,o.latitude,o.longitude,o.consolidacao_status,o.data_fato,o.horario_fato
    FROM sentinela.ocorrencias o
    JOIN sentinela.regioes_administrativas r ON r.id=o.ra_id
    WHERE session_user IN ('sentinela_local_admin','sentinela_local_operator')
      AND sentinela_ambiente.ator_operacional() IS NOT NULL
      AND o.ativo AND o.origem='manual' AND o.fonte='SENTINELA_MANUAL'
      AND (o.consolidacao_status='em_revisao' OR (o.id=p_alvo AND o.consolidacao_status='consolidada'))
      AND o.localizacao_status='validada' AND o.referencia_espacial_confirmada='WGS84; IDE-DF-2026-11-13'
      AND nullif(btrim(o.regra_transformacao),'') IS NOT NULL
      AND o.geometria IS NOT NULL AND extensions.ST_SRID(o.geometria)=4326
      AND extensions.ST_Y(o.geometria)=o.latitude AND extensions.ST_X(o.geometria)=o.longitude
      AND r.vigencia @> o.data_fato AND extensions.ST_Contains(r.limite,o.geometria)
    ORDER BY (o.id=p_alvo) DESC NULLS LAST,o.data_fato DESC,o.horario_fato DESC,o.id
    LIMIT 250
  ) p;
$$;
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.pontos_mapa(uuid)
  FROM PUBLIC, anon, authenticated, service_role, sentinela_local_analyst;
GRANT EXECUTE ON FUNCTION sentinela_ocorrencias_manual.pontos_mapa(uuid)
  TO sentinela_local_admin, sentinela_local_operator;
RESET ROLE;
REVOKE CREATE ON SCHEMA sentinela_ocorrencias_manual FROM sentinela_manual_writer;

INSERT INTO sentinela.schema_migrations VALUES ('0017','Pontos de cadastros manuais no mapa institucional',DEFAULT);
COMMIT;
