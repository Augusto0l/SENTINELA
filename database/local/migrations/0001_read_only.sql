-- LOCAL ONLY. No Auth emulation, no role creation, no password, no fixture inserts.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog;
SELECT pg_advisory_xact_lock(743204,23);
\ir ../sql/preflight.sql
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM pg_roles WHERE rolname='sentinela_local_reader';
  IF NOT FOUND THEN RAISE EXCEPTION 'Create the explicitly approved NOLOGIN role first.'; END IF;
  IF r.rolcanlogin OR r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole
    OR r.rolreplication OR r.rolinherit OR r.rolconnlimit<>5 OR r.rolconfig IS NOT NULL THEN
    RAISE EXCEPTION 'Expected an unconfigured, restricted NOLOGIN role.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=r.oid OR member=r.oid)
    OR EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r.oid) THEN
    RAISE EXCEPTION 'Existing memberships, ownership or ACL dependencies require review.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,
      acldefault('r',c.relowner))) a WHERE c.relnamespace='sentinela'::regnamespace
      AND c.relkind='r' AND a.grantee<>c.relowner)
    OR EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      WHERE c.relnamespace='sentinela'::regnamespace AND a.attacl IS NOT NULL) THEN
    RAISE EXCEPTION 'Unexpected preexisting application grants.';
  END IF;
END $$;
REVOKE CONNECT, TEMPORARY ON DATABASE sentinela_dev_operacional FROM PUBLIC;
GRANT CONNECT ON DATABASE sentinela_dev_operacional TO sentinela_local_reader;
GRANT USAGE ON SCHEMA sentinela TO sentinela_local_reader;
GRANT SELECT (id, origem, fonte, ano_registro, unidade_registro, numero_registro, versao_identidade, identidade_status, data_fato, horario_fato, ra_id, local, latitude, longitude, localizacao_status, consolidacao_status, ativo, versao, criado_em, atualizado_em)
  ON sentinela.ocorrencias TO sentinela_local_reader;
GRANT SELECT (id, ocorrencia_id, natureza_id, origem, crime_tentado, classificacao_status, mapeamento_id)
  ON sentinela.ocorrencia_naturezas TO sentinela_local_reader;
GRANT SELECT (id, fonte, descricao_original, categoria_pcdf_original)
  ON sentinela.naturezas_criminais TO sentinela_local_reader;
GRANT SELECT (id, codigo_interno, nome, versao_catalogo, status)
  ON sentinela.categorias_criminais TO sentinela_local_reader;
GRANT SELECT (id, natureza_id, versao, crime_tentado, categoria_id, status)
  ON sentinela.mapeamentos_natureza TO sentinela_local_reader;
GRANT SELECT (id, codigo_interno, codigo_oficial, nome, versao_catalogo, vigencia)
  ON sentinela.regioes_administrativas TO sentinela_local_reader;

CREATE POLICY local_reader_ocorrencias ON sentinela.ocorrencias
  FOR SELECT TO sentinela_local_reader
  USING (fonte='SENTINELA_TESTE_LOCAL_V1' AND ativo AND consolidacao_status='consolidada');
CREATE POLICY local_reader_associacoes ON sentinela.ocorrencia_naturezas
  FOR SELECT TO sentinela_local_reader
  USING (EXISTS(SELECT 1 FROM sentinela.ocorrencias o WHERE o.id=ocorrencia_naturezas.ocorrencia_id));
CREATE POLICY local_reader_naturezas ON sentinela.naturezas_criminais
  FOR SELECT TO sentinela_local_reader USING (fonte='SENTINELA_TESTE_LOCAL_V1');
CREATE POLICY local_reader_categorias ON sentinela.categorias_criminais
  FOR SELECT TO sentinela_local_reader
  USING (versao_catalogo='SENTINELA_TESTE_LOCAL_V1' AND status='homologada');
CREATE POLICY local_reader_mapeamentos ON sentinela.mapeamentos_natureza
  FOR SELECT TO sentinela_local_reader
  USING (versao='SENTINELA_TESTE_LOCAL_V1' AND status='homologado'
    AND EXISTS(SELECT 1 FROM sentinela.naturezas_criminais n WHERE n.id=mapeamentos_natureza.natureza_id)
    AND EXISTS(SELECT 1 FROM sentinela.categorias_criminais c WHERE c.id=mapeamentos_natureza.categoria_id));
CREATE POLICY local_reader_regioes ON sentinela.regioes_administrativas
  FOR SELECT TO sentinela_local_reader USING (versao_catalogo='SENTINELA_TESTE_LOCAL_V1');
-- No function, sequence, type, extensions schema, DDL, future-object or write grants.
-- All 19 tables keep ENABLE/FORCE RLS and every trigger/constraint stays unchanged.
INSERT INTO sentinela.schema_migrations(versao,descricao)
VALUES ('local-read-0001','Leitura local restrita a fixtures sinteticas aprovadas');
COMMIT;
