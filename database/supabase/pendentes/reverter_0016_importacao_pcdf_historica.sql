-- Reversao da estrutura antes de novas cargas. Para pausar cargas ja feitas, desabilite a liberacao.
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));

DO $guard$
BEGIN
  IF NOT sentinela_ambiente.vinculado()
     OR NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0016')
     OR EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0016-reversao')
     OR EXISTS (SELECT FROM sentinela.lotes_importacao l JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id
       WHERE x.fonte='PCDF' AND l.competencia BETWEEN '2021-02-01' AND '2026-08-01') THEN
    RAISE EXCEPTION 'Reversao estrutural requer instalacao 0016 sem cargas posteriores a janeiro';
  END IF;
END $guard$;

GRANT CREATE ON SCHEMA sentinela_pcdf_historico TO sentinela_pcdf_historico_owner, sentinela_pcdf_owner;
SET LOCAL ROLE sentinela_pcdf_historico_owner;
DO $receive$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('sentinela_pcdf_historico.receive(uuid,uuid,text,jsonb,bytea)'::regprocedure);
  IF (length(definition)-length(replace(definition,'PERFORM sentinela_pcdf_historico.exigir_confirmacao(p_usuario);','')))/length('PERFORM sentinela_pcdf_historico.exigir_confirmacao(p_usuario);') <> 1 THEN
    RAISE EXCEPTION 'Definicao inesperada do receptor mensal';
  END IF;
  IF (length(definition)-length(replace(definition,$label$'pendente' /* classificacao PCDF v2 a homologar */$label$,'')))/length($label$'pendente' /* classificacao PCDF v2 a homologar */$label$) <> 1 THEN
    RAISE EXCEPTION 'Trecho de classificacao inesperado no receptor mensal';
  END IF;
  definition := replace(definition,$label$'pendente' /* classificacao PCDF v2 a homologar */$label$,$label$CASE WHEN n.id IS NULL THEN 'sem_correspondencia' ELSE 'pendente' END$label$);
  EXECUTE replace(definition,'PERFORM sentinela_pcdf_historico.exigir_confirmacao(p_usuario);','PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,p_conta);');
END $receive$;
RESET ROLE;

SET LOCAL ROLE sentinela_pcdf_owner;
DO $staging$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('sentinela_pcdf_historico.receive_staging(uuid,uuid,text,jsonb,bytea)'::regprocedure);
  IF (length(definition)-length(replace(definition,'PERFORM sentinela_pcdf_historico.exigir_confirmacao(p_usuario);','')))/length('PERFORM sentinela_pcdf_historico.exigir_confirmacao(p_usuario);') <> 1 THEN
    RAISE EXCEPTION 'Definicao inesperada do staging mensal';
  END IF;
  EXECUTE replace(definition,'PERFORM sentinela_pcdf_historico.exigir_confirmacao(p_usuario);','PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,p_conta);');
END $staging$;
RESET ROLE;
REVOKE CREATE ON SCHEMA sentinela_pcdf_historico FROM sentinela_pcdf_historico_owner, sentinela_pcdf_owner;

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
DROP FUNCTION sentinela_pcdf_historico.exigir_confirmacao(uuid);
DROP FUNCTION sentinela_pcdf_historico.pode_confirmar(uuid);
RESET ROLE;
REVOKE CREATE ON SCHEMA sentinela_pcdf_historico FROM sentinela_pcdf_historico_owner;

DROP TABLE sentinela_pcdf_historico.liberacao;
REVOKE EXECUTE ON FUNCTION sentinela_ambiente.ator_importacao() FROM sentinela_pcdf_historico_owner;
DROP POLICY pcdf_janeiro_recibo_arquivado ON sentinela_migracao.auditoria_origem;
REVOKE SELECT ON sentinela_migracao.auditoria_origem FROM sentinela_pcdf_historico_owner;
REVOKE USAGE ON SCHEMA sentinela_migracao FROM sentinela_pcdf_historico_owner;
DELETE FROM sentinela_pcdf_historico.arquivos WHERE competencia BETWEEN '2021-02-01' AND '2026-08-01';
INSERT INTO sentinela.schema_migrations VALUES ('0016-reversao','Reverte estrutura PCDF mensal antes de cargas',DEFAULT);
COMMIT;
