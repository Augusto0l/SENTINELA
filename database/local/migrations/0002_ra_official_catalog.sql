-- Transaction body for the operational executor. The approval marker must be rendered from the verified package.
DO $migration$
BEGIN
IF '__RENDERED_RELEASE__' <> 'local-ra-0002' THEN
 RAISE EXCEPTION 'Render the verified release with the operational executor';
END IF;
CREATE SCHEMA sentinela_ra_catalog;
REVOKE ALL ON SCHEMA sentinela_ra_catalog FROM PUBLIC;
CREATE FUNCTION sentinela_ra_catalog.valid_reference(m jsonb, code text) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_typeof(m)='object'
 AND (SELECT array_agg(k ORDER BY k COLLATE "C") FROM jsonb_object_keys(CASE WHEN jsonb_typeof(m)='object' THEN m ELSE '{}'::jsonb END) k)=
 ARRAY['administrativeNumber','administrativeSource','approvalStatus','contractVersion','extractedOn','ideCode','legalValidityStatus','packageVersion','reviewManifestSha256','sourceHash','sourceId','sourceName','sourceObjectId','validFrom','validTo']::text[]
 AND m->'contractVersion'='1'::jsonb
 AND jsonb_typeof(m->'ideCode')='string' AND m->>'ideCode'=code
 AND jsonb_typeof(m->'sourceObjectId')='string' AND m->>'sourceObjectId' ~ '^[0-9]+$'
 AND jsonb_typeof(m->'sourceName')='string' AND length(btrim(m->>'sourceName'))>0
 AND m->>'sourceId'='https://www.geoservicos.ide.df.gov.br/arcgis/rest/services/Publico/LIMITES/FeatureServer/1'
 AND m->>'sourceHash'='fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553'
 AND m->>'reviewManifestSha256'='4e9b678630e34aa1db4827f40d79f426f645d1142ea4eba689c46fb82f01de3f'
 AND jsonb_typeof(m->'administrativeNumber')='number'
 AND m->>'administrativeNumber' ~ '^([1-9]|[12][0-9]|3[0-7])$'
 AND jsonb_typeof(m->'administrativeSource')='string'
 AND m->>'administrativeSource' ~ '^https://(www[.])?(sinj|economia)[.]df[.]gov[.]br/'
 AND m->>'packageVersion'='ra-public-sandbox-2026-11-13-v2'
 AND m->>'extractedOn'='2026-11-13'
 AND m->>'approvalStatus' IN ('approved','pending')
 AND m->>'legalValidityStatus'='unknown'
 AND m->'validFrom'='null'::jsonb AND m->'validTo'='null'::jsonb,false)
$$;
CREATE FUNCTION sentinela_ra_catalog.approved_reference(code text,label text,m jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT coalesce((__APPROVED_JSON__::jsonb->code)->'metadata'=m
 AND (__APPROVED_JSON__::jsonb->code)->>'name'=label,false)
$$;
REVOKE ALL ON FUNCTION sentinela_ra_catalog.valid_reference(jsonb,text),
 sentinela_ra_catalog.approved_reference(text,text,jsonb) FROM PUBLIC;
ALTER TABLE sentinela.regioes_administrativas ADD COLUMN referencia_cartografica jsonb;
ALTER TABLE sentinela.regioes_administrativas ADD CONSTRAINT ra_reference_official_v1
 CHECK(referencia_cartografica IS NULL OR
 (sentinela_ra_catalog.valid_reference(referencia_cartografica,codigo_interno)
 AND codigo_oficial IS NULL AND lower_inf(vigencia) AND upper_inf(vigencia)));
ALTER TABLE sentinela.regioes_administrativas ADD CONSTRAINT ra_public_reference_required_official_v1
  CHECK(versao_catalogo<>'SENTINELA_RA_PUBLICO_2026_11_13_V1' OR (
 referencia_cartografica IS NOT NULL
 AND sentinela_ra_catalog.approved_reference(codigo_interno,nome,referencia_cartografica)
 AND limite IS NOT NULL
 AND versao_cartografia IS NOT DISTINCT FROM 'IDE-DF-2026-11-13'
 AND evidencia_referencia_espacial IS NOT DISTINCT FROM
  'ra-review-2026-11-13-v1; extraction-only; legal validity unknown'));
GRANT USAGE ON SCHEMA sentinela_ra_catalog TO sentinela_local_reader;
GRANT EXECUTE ON FUNCTION sentinela_ra_catalog.approved_reference(text,text,jsonb) TO sentinela_local_reader;
CREATE POLICY local_reader_regioes_public_official_v1 ON sentinela.regioes_administrativas
 FOR SELECT TO sentinela_local_reader
 USING(versao_catalogo='SENTINELA_RA_PUBLICO_2026_11_13_V1'
 AND sentinela_ra_catalog.approved_reference(codigo_interno,nome,referencia_cartografica));
-- Restrictive gate prevents the existing permissive synthetic policy broadening scope.
CREATE POLICY local_reader_regioes_gate_official_v1 ON sentinela.regioes_administrativas
 AS RESTRICTIVE FOR SELECT TO sentinela_local_reader
 USING(versao_catalogo='SENTINELA_RA_PUBLICO_2026_11_13_V1'
 AND sentinela_ra_catalog.approved_reference(codigo_interno,nome,referencia_cartografica));
INSERT INTO sentinela.schema_migrations(versao,descricao)
VALUES ('local-ra-0002','Catalogo oficial de RAs: referencia cartografica e leitura restrita');
END;
$migration$;
