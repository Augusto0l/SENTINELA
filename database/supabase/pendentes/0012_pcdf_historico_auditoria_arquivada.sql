-- PROPOSTA. NÃO APLICADA. Exige autorização expressa de escrita no Supabase institucional (hcmqsqfbrynpfjvmuqdb).
--
-- Problema: sentinela_pcdf_historico.status() só procura o evento 'pcdf.revisao_independente' em
-- sentinela.eventos_auditoria. Na migração, o evento original de 2021-01 foi preservado sem alteração em
-- sentinela_migracao.auditoria_origem. Por isso o lote migrado legítimo aparece como 'conflict'.
--
-- Correção: o dono da função (sentinela_pcdf_historico_owner) passa a ler, no arquivo, somente eventos
-- 'pcdf.revisao_independente'. É o mesmo modelo da policy historico_audit_read em sentinela.eventos_auditoria.
-- Nenhum evento é inserido, alterado ou removido. O RLS continua forçado. Os papéis da aplicação
-- (anon, authenticated, service_role, sentinela_local_*) continuam sem acesso ao schema sentinela_migracao.
-- A auditoria ativa tem precedência; o arquivo só é consultado quando não existe evento ativo correspondente.
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE sentinela_0012_antes ON COMMIT DROP AS SELECT
  (SELECT count(*) FROM sentinela.eventos_auditoria) AS viva,
  (SELECT count(*) FROM sentinela_migracao.auditoria_origem) AS arquivada,
  (SELECT count(*) FROM sentinela_migracao.comprovantes_origem) AS comprovantes,
  (SELECT proacl::text FROM pg_proc WHERE oid='sentinela_pcdf_historico.status()'::regprocedure) AS acl;

DO $pre$
BEGIN
  IF (SELECT max(versao) FROM sentinela.schema_migrations) IS DISTINCT FROM '0011'
     OR NOT sentinela_ambiente.vinculado() THEN
    RAISE EXCEPTION '0012 exige a migration 0011 na instalação vinculada.';
  END IF;
  IF (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela_migracao'::regnamespace
      AND relkind='r' AND relrowsecurity AND relforcerowsecurity) <> 2 THEN
    RAISE EXCEPTION 'Arquivo de auditoria sem RLS forçada.';
  END IF;
  -- Exatamente um evento arquivado corresponde ao lote migrado de 2021-01, e nenhum evento ativo.
  IF (SELECT count(*) FROM sentinela_pcdf_historico.arquivos a
        JOIN sentinela.lotes_importacao l ON l.competencia=a.competencia AND l.sha256_arquivo=a.sha256
        JOIN sentinela_migracao.auditoria_origem e ON e.acao='pcdf.revisao_independente'
          AND e.depois->>'lote'=l.id::text AND e.depois->>'csvSha256'=a.sha256
      WHERE a.competencia='2021-01-01' AND l.id='84908630-bd04-4a03-923d-616649c8de74') <> 1
     OR EXISTS (SELECT FROM sentinela.eventos_auditoria WHERE acao='pcdf.revisao_independente') THEN
    RAISE EXCEPTION 'Estado da revisão PCDF 2021-01 diverge do inventário de pré-implantação.';
  END IF;
END $pre$;

-- Leitura estreita do arquivo para o dono da função de status. Sem INSERT/UPDATE/DELETE/TRUNCATE.
GRANT USAGE ON SCHEMA sentinela_migracao TO sentinela_pcdf_historico_owner;
GRANT SELECT ON TABLE sentinela_migracao.auditoria_origem TO sentinela_pcdf_historico_owner;
CREATE POLICY pcdf_revisao_arquivada_read ON sentinela_migracao.auditoria_origem
  FOR SELECT TO sentinela_pcdf_historico_owner
  USING (acao::text = 'pcdf.revisao_independente');

-- Mesma assinatura, dono e grants (CREATE OR REPLACE preserva ambos). Só o LATERAL do evento muda.
-- O instalador tem SET, sem INHERIT, no papel dono. Como na 0010, o CREATE no schema é temporário.
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
   SELECT ev.depois FROM (
     SELECT e.depois, 0 AS origem FROM sentinela.eventos_auditoria e
     WHERE e.acao=CASE WHEN a.competencia='2021-01-01' THEN 'pcdf.revisao_independente' ELSE 'pcdf.consolidacao_historica' END
       AND e.depois->>'lote'=l.id::text AND e.depois->>'csvSha256'=a.sha256
     UNION ALL
     -- Evento original preservado na migração institucional; apenas revisões independentes são legíveis.
     SELECT e.depois, 1 FROM sentinela_migracao.auditoria_origem e
     WHERE a.competencia='2021-01-01' AND e.acao='pcdf.revisao_independente'
       AND e.depois->>'lote'=l.id::text AND e.depois->>'csvSha256'=a.sha256
   ) ev ORDER BY ev.origem LIMIT 1
 ) e ON true;
$$;
-- O instalador não tem EXECUTE em status(); a conferência roda como o papel dono.
DO $resultado$
BEGIN
  IF (SELECT m->>'state' FROM jsonb_array_elements(sentinela_pcdf_historico.status()) m WHERE m->>'month'='2021-01')
       IS DISTINCT FROM 'done' THEN
    RAISE EXCEPTION 'status() não reconheceu a revisão arquivada de 2021-01.';
  END IF;
END $resultado$;
RESET ROLE;
REVOKE CREATE ON SCHEMA sentinela_pcdf_historico FROM sentinela_pcdf_historico_owner;

DO $post$
DECLARE antes record;
BEGIN
  SELECT * INTO antes FROM sentinela_0012_antes;
  IF (SELECT count(*) FROM sentinela.eventos_auditoria) <> antes.viva
     OR (SELECT count(*) FROM sentinela_migracao.auditoria_origem) <> antes.arquivada
     OR (SELECT count(*) FROM sentinela_migracao.comprovantes_origem) <> antes.comprovantes THEN
    RAISE EXCEPTION 'A correção não pode alterar auditoria ativa ou arquivada.';
  END IF;
  IF EXISTS (SELECT FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role',
        'sentinela_local_admin','sentinela_local_operator','sentinela_local_analyst')
      AND (has_schema_privilege(r.oid,'sentinela_migracao','USAGE')
        OR has_table_privilege(r.oid,'sentinela_migracao.auditoria_origem','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
        OR has_table_privilege(r.oid,'sentinela_migracao.comprovantes_origem','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')))
     OR has_table_privilege('sentinela_pcdf_historico_owner','sentinela_migracao.auditoria_origem','INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_table_privilege('sentinela_pcdf_historico_owner','sentinela_migracao.comprovantes_origem','SELECT')
     OR (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela_migracao'::regnamespace
         AND relkind='r' AND relrowsecurity AND relforcerowsecurity) <> 2
     OR has_schema_privilege('sentinela_pcdf_historico_owner','sentinela_pcdf_historico','CREATE')
     OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='sentinela_pcdf_historico.status()'::regprocedure)
          IS DISTINCT FROM 'sentinela_pcdf_historico_owner'
     OR (SELECT proacl::text FROM pg_proc WHERE oid='sentinela_pcdf_historico.status()'::regprocedure)
          IS DISTINCT FROM antes.acl THEN
    RAISE EXCEPTION 'Privilégios do arquivo de auditoria divergentes após 0012.';
  END IF;
END $post$;

INSERT INTO sentinela.schema_migrations VALUES ('0012','PCDF historico reconhece auditoria arquivada',DEFAULT);
COMMIT;
