BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, pg_temp;
SELECT set_config('sentinela.manual_expected_uuid', :'expected_uuid', true);
DO $guard$
BEGIN
  IF current_database() <> 'sentinela_pcdf_local' OR host(inet_server_addr()) <> '127.0.0.1'
    OR inet_server_port() NOT IN (55484,55486)
    OR current_setting('sentinela.sandbox_uuid',true) IS DISTINCT FROM current_setting('sentinela.manual_expected_uuid')
    OR NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='local-manual-0002')
    OR (SELECT count(*) FROM pg_class WHERE oid IN ('sentinela.regioes_administrativas'::regclass,
       'sentinela.naturezas_criminais'::regclass) AND relrowsecurity AND relforcerowsecurity) <> 2
  THEN RAISE EXCEPTION 'Destino local atestado e local-manual-0002 são obrigatórios'; END IF;
END
$guard$;

ALTER TABLE sentinela.regioes_administrativas ADD COLUMN IF NOT EXISTS referencia_cartografica jsonb;
ALTER TABLE sentinela.naturezas_criminais ADD COLUMN referencia_catalogo_manual jsonb
  CHECK (referencia_catalogo_manual IS NULL OR (
    fonte='SENTINELA_MANUAL' AND codigo_manual IS NOT NULL
    AND coalesce(jsonb_typeof(referencia_catalogo_manual)='object'
      AND referencia_catalogo_manual->>'situacao'='homologada'
      AND length(btrim(referencia_catalogo_manual->>'fonte')) > 0
      AND length(btrim(referencia_catalogo_manual->>'versao')) > 0
      AND length(btrim(referencia_catalogo_manual->>'evidencia')) > 0
      AND referencia_catalogo_manual->>'sha256' ~ '^[a-f0-9]{64}$', false)
  ));

CREATE FUNCTION sentinela_ocorrencias_manual.normalizar_catalogo(text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog,pg_temp AS $$
 SELECT lower(regexp_replace(normalize(btrim($1),NFD), U&'[\0300-\036f]', '', 'g'));
$$;
REVOKE EXECUTE ON FUNCTION sentinela_ocorrencias_manual.normalizar_catalogo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_ocorrencias_manual.normalizar_catalogo(text) TO sentinela_manual_writer;

CREATE UNIQUE INDEX manual_ra_nome_unico ON sentinela.regioes_administrativas
  (sentinela_ocorrencias_manual.normalizar_catalogo(nome) COLLATE "C")
  WHERE versao_catalogo='SENTINELA_RA_PUBLICO_2026_11_13_V1';
CREATE UNIQUE INDEX manual_ra_numero_unico ON sentinela.regioes_administrativas
  ((referencia_cartografica->>'administrativeNumber'))
  WHERE versao_catalogo='SENTINELA_RA_PUBLICO_2026_11_13_V1';
CREATE UNIQUE INDEX manual_natureza_descricao_unica ON sentinela.naturezas_criminais
  (sentinela_ocorrencias_manual.normalizar_catalogo(descricao_original) COLLATE "C")
  WHERE fonte='SENTINELA_MANUAL' AND referencia_catalogo_manual IS NOT NULL;
CREATE UNIQUE INDEX manual_natureza_codigo_normalizado_unico ON sentinela.naturezas_criminais
  (sentinela_ocorrencias_manual.normalizar_catalogo(codigo_manual) COLLATE "C")
  WHERE fonte='SENTINELA_MANUAL' AND referencia_catalogo_manual IS NOT NULL;

GRANT SELECT (codigo_oficial,referencia_cartografica) ON sentinela.regioes_administrativas TO sentinela_manual_writer;
GRANT SELECT (referencia_catalogo_manual) ON sentinela.naturezas_criminais TO sentinela_manual_writer;
ALTER POLICY manual_ra ON sentinela.regioes_administrativas TO sentinela_manual_writer
  USING (versao_catalogo='SENTINELA_RA_PUBLICO_2026_11_13_V1' AND versao_cartografia='IDE-DF-2026-11-13'
    AND limite IS NOT NULL AND referencia_cartografica->>'approvalStatus'='approved'
    AND referencia_cartografica->>'sourceHash'='fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553');
ALTER POLICY manual_nature ON sentinela.naturezas_criminais TO sentinela_manual_writer
  USING (fonte='SENTINELA_MANUAL' AND codigo_manual IS NOT NULL AND referencia_catalogo_manual IS NOT NULL);

CREATE FUNCTION sentinela_ocorrencias_manual.catalogo(termo text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 WITH filtro AS (SELECT coalesce(sentinela_ocorrencias_manual.normalizar_catalogo(termo),'') AS q)
 SELECT jsonb_build_object(
   'regioes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'codigo',codigo_interno,'nome',nome,
     'numeroAdministrativo',referencia_cartografica->'administrativeNumber')
     ORDER BY sentinela_ocorrencias_manual.normalizar_catalogo(nome) COLLATE "C",id)
     FROM sentinela.regioes_administrativas
     WHERE q='' OR strpos(sentinela_ocorrencias_manual.normalizar_catalogo(nome),q)>0
       OR strpos(sentinela_ocorrencias_manual.normalizar_catalogo(codigo_interno),q)>0
       OR strpos(sentinela_ocorrencias_manual.normalizar_catalogo(codigo_oficial),q)>0
       OR referencia_cartografica->>'administrativeNumber'=q),'[]'::jsonb),
   'naturezas',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'descricao',descricao_original,'codigo',codigo_manual)
     ORDER BY sentinela_ocorrencias_manual.normalizar_catalogo(descricao_original) COLLATE "C",id)
     FROM sentinela.naturezas_criminais
     WHERE q='' OR strpos(sentinela_ocorrencias_manual.normalizar_catalogo(descricao_original),q)>0
       OR strpos(sentinela_ocorrencias_manual.normalizar_catalogo(codigo_manual),q)>0),'[]'::jsonb))
 FROM filtro WHERE session_user IN ('sentinela_local_admin','sentinela_local_operator');
$$;
ALTER FUNCTION sentinela_ocorrencias_manual.catalogo(text) OWNER TO sentinela_manual_writer;
REVOKE EXECUTE ON FUNCTION sentinela_ocorrencias_manual.catalogo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_ocorrencias_manual.catalogo(text) TO sentinela_local_admin,sentinela_local_operator;

INSERT INTO sentinela.schema_migrations(versao,descricao)
VALUES ('local-manual-0003','Procedência, elegibilidade e busca dos catálogos manuais');
COMMIT;
