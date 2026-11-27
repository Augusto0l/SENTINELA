-- Reversão compensatória da 0012. Só usar depois da aplicação da 0012 e por decisão autorizada.
-- sentinela.schema_migrations é imutável: a 0012 permanece registrada e esta reversão entra como 0013.
-- Restaura a definição de sentinela_pcdf_historico.status() da 0010 e remove a leitura do arquivo.
-- Nenhum evento de auditoria é tocado.
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE sentinela_0012_rev ON COMMIT DROP AS SELECT
  (SELECT count(*) FROM sentinela.eventos_auditoria) AS viva,
  (SELECT count(*) FROM sentinela_migracao.auditoria_origem) AS arquivada,
  (SELECT proacl::text FROM pg_proc WHERE oid='sentinela_pcdf_historico.status()'::regprocedure) AS acl;

DO $pre$
BEGIN
  IF (SELECT max(versao) FROM sentinela.schema_migrations) IS DISTINCT FROM '0012' OR NOT sentinela_ambiente.vinculado() THEN
    RAISE EXCEPTION 'Reversão exige a 0012 como última migration na instalação vinculada.';
  END IF;
END $pre$;

GRANT CREATE ON SCHEMA sentinela_pcdf_historico TO sentinela_pcdf_historico_owner;
SET LOCAL ROLE sentinela_pcdf_historico_owner;
CREATE OR REPLACE FUNCTION sentinela_pcdf_historico.status() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT jsonb_agg(jsonb_build_object(
   'month',to_char(a.competencia,'YYYY-MM'),'sha256',a.sha256,'bytes',a.bytes,'records',a.linhas,
   'candidates',a.candidatas,'through',a.cobertura_ate,'complete',a.completa,
   'state',CASE WHEN l.id IS NULL THEN 'missing' WHEN l.sha256_arquivo<>a.sha256 THEN 'conflict'
     WHEN a.competencia='2021-01-01' AND (l.id<>'84908630-bd04-4a03-923d-616649c8de74' OR e.depois IS NULL)
       THEN 'conflict'
     WHEN e.depois IS NULL THEN 'staged' ELSE 'done' END,
   'lot',l.id,'unique',e.depois->'consolidadas','links',e.depois->'vinculos',
   'review',coalesce(e.depois->'origensEmRevisao',e.depois->'identidadeEmRevisao'),
   'issues',CASE WHEN a.competencia='2021-01-01' AND e.depois IS NOT NULL THEN to_jsonb(8091)
     ELSE e.depois->'pendencias' END) ORDER BY a.competencia)
 FROM sentinela_pcdf_historico.arquivos a
 LEFT JOIN LATERAL (
   SELECT l.id,l.sha256_arquivo FROM sentinela.lotes_importacao l JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id
   WHERE l.competencia=a.competencia AND x.fonte='PCDF'
   ORDER BY (l.sha256_arquivo<>a.sha256) DESC,l.id LIMIT 1
 ) l ON true
 LEFT JOIN LATERAL (
   SELECT e.depois FROM sentinela.eventos_auditoria e
   WHERE e.acao=CASE WHEN a.competencia='2021-01-01' THEN 'pcdf.revisao_independente' ELSE 'pcdf.consolidacao_historica' END
     AND e.depois->>'lote'=l.id::text AND e.depois->>'csvSha256'=a.sha256
   LIMIT 1
 ) e ON true;
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA sentinela_pcdf_historico FROM sentinela_pcdf_historico_owner;

DROP POLICY pcdf_revisao_arquivada_read ON sentinela_migracao.auditoria_origem;
REVOKE SELECT ON TABLE sentinela_migracao.auditoria_origem FROM sentinela_pcdf_historico_owner;
REVOKE USAGE ON SCHEMA sentinela_migracao FROM sentinela_pcdf_historico_owner;


DO $post$
DECLARE antes record;
BEGIN
  SELECT * INTO antes FROM sentinela_0012_rev;
  IF (SELECT count(*) FROM sentinela.eventos_auditoria) <> antes.viva
     OR (SELECT count(*) FROM sentinela_migracao.auditoria_origem) <> antes.arquivada
     OR (SELECT proacl::text FROM pg_proc WHERE oid='sentinela_pcdf_historico.status()'::regprocedure) IS DISTINCT FROM antes.acl
     OR has_schema_privilege('sentinela_pcdf_historico_owner','sentinela_migracao','USAGE')
     OR has_schema_privilege('sentinela_pcdf_historico_owner','sentinela_pcdf_historico','CREATE')
     OR EXISTS (SELECT FROM pg_policies WHERE schemaname='sentinela_migracao')
     OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='sentinela_pcdf_historico.status()'::regprocedure)
          IS DISTINCT FROM 'sentinela_pcdf_historico_owner' THEN
    RAISE EXCEPTION 'Reversão da 0012 divergente.';
  END IF;
END $post$;

INSERT INTO sentinela.schema_migrations VALUES ('0013','Reverte leitura PCDF da auditoria arquivada',DEFAULT);
COMMIT;
