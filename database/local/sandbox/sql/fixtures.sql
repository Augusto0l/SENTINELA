\ir guard.sql
-- SANDBOX ONLY. Explicit COMMIT variant. No trigger/constraint is disabled.
-- Real authenticated readers cannot see these uncommitted rows from another connection.
-- Requires explicit authorization and server identity attestation.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = pg_catalog;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM sentinela.regioes_administrativas) OR EXISTS(SELECT 1 FROM sentinela.categorias_criminais)
 OR EXISTS(SELECT 1 FROM sentinela.naturezas_criminais) OR EXISTS(SELECT 1 FROM sentinela.mapeamentos_natureza)
 OR EXISTS(SELECT 1 FROM sentinela.ocorrencias) OR EXISTS(SELECT 1 FROM sentinela.ocorrencia_naturezas)
 THEN RAISE EXCEPTION 'Fixture tables must be empty; no overwrite'; END IF;
END $$;

SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF current_database()<>'sentinela_rls_sandbox'
    OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
    OR inet_server_port() IS DISTINCT FROM 55432 OR current_user<>'postgres'
    OR NOT EXISTS(SELECT 1 FROM sentinela.schema_migrations WHERE versao='local-read-0001') THEN
    RAISE EXCEPTION 'Expected authorized local test database with read migration.';
  END IF;
  IF EXISTS(SELECT 1 FROM sentinela.ocorrencias WHERE fonte IN ('SENTINELA_TESTE_LOCAL_V1','SENTINELA_TESTE_NEGATIVO_V1'))
    OR EXISTS(SELECT 1 FROM sentinela.regioes_administrativas WHERE versao_catalogo='SENTINELA_TESTE_LOCAL_V1') THEN
    RAISE EXCEPTION 'Fixture scope occupied. No upsert, cleanup or overwrite is allowed.';
  END IF;
END $$;
INSERT INTO sentinela.regioes_administrativas(id,codigo_interno,nome,versao_catalogo,vigencia)
VALUES ('10000000-0000-4000-8000-000000000001','TESTE-RA','Regiao SINTETICA, sem cartografia oficial',
        'SENTINELA_TESTE_LOCAL_V1',daterange('2020-01-01','2030-01-01','[)'));
INSERT INTO sentinela.categorias_criminais(id,nome,versao_catalogo,status,evidencia_homologacao)
VALUES ('20000000-0000-4000-8000-000000000001','Categoria SINTETICA','SENTINELA_TESTE_LOCAL_V1',
        'homologada','Somente fixture sintetica; nao homologacao oficial'),
       ('20000000-0000-4000-8000-000000000002','Categoria PENDENTE SINTETICA','SENTINELA_TESTE_LOCAL_V1',
        'pendente',NULL),
       ('20000000-0000-4000-8000-000000000003','Categoria OUTRA VERSAO SINTETICA','SENTINELA_TESTE_NEGATIVO_V1',
        'homologada','Somente fixture negativa sintetica');
INSERT INTO sentinela.regioes_administrativas(id,codigo_interno,nome,versao_catalogo,vigencia)
VALUES ('10000000-0000-4000-8000-000000000002','TESTE-RA-NEGATIVA','Regiao NEGATIVA SINTETICA',
        'SENTINELA_TESTE_NEGATIVO_V1',daterange('2020-01-01','2030-01-01','[)'));
INSERT INTO sentinela.naturezas_criminais(id,fonte,descricao_original,categoria_pcdf_original)
VALUES ('30000000-0000-4000-8000-000000000001','SENTINELA_TESTE_LOCAL_V1','Natureza SINTETICA','Categoria original SINTETICA'),
       ('30000000-0000-4000-8000-000000000002','SENTINELA_TESTE_NEGATIVO_V1','Natureza NEGATIVA SINTETICA',NULL);
INSERT INTO sentinela.mapeamentos_natureza(id,natureza_id,versao,categoria_id,status,evidencia_homologacao)
VALUES ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
        'SENTINELA_TESTE_LOCAL_V1','20000000-0000-4000-8000-000000000001','homologado','Mapeamento SINTETICO de teste');
INSERT INTO sentinela.mapeamentos_natureza(id,natureza_id,versao,crime_tentado,categoria_id,status,evidencia_homologacao)
VALUES
 ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',
  'SENTINELA_TESTE_LOCAL_V1',true,NULL,'pendente',NULL),
 ('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001',
  'SENTINELA_TESTE_NEGATIVO_V1',NULL,'20000000-0000-4000-8000-000000000001','homologado','Fixture de outra versao'),
 ('40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000001',
  'SENTINELA_TESTE_LOCAL_V1',false,'20000000-0000-4000-8000-000000000002','homologado','Fixture com categoria pendente');
-- Missing geometry is intentional: these fixtures certify access, not spatial/business acceptance.
-- RA boundary stays NULL; no synthetic polygon is represented as official cartography.
INSERT INTO sentinela.ocorrencias(id,origem,fonte,versao_identidade,identidade_status,
  data_fato,horario_fato,ra_id,local,consolidacao_status,ativo)
VALUES
 ('50000000-0000-4000-8000-000000000001','manual','SENTINELA_TESTE_LOCAL_V1','TESTE-V1','manual',
  '2026-01-01','12:00','10000000-0000-4000-8000-000000000001','Endereco SINTETICO visivel','consolidada',true),
 ('50000000-0000-4000-8000-000000000002','manual','SENTINELA_TESTE_LOCAL_V1','TESTE-V1','manual',
  '2026-01-01','12:00',NULL,'Endereco SINTETICO inativo','consolidada',false),
 ('50000000-0000-4000-8000-000000000003','manual','SENTINELA_TESTE_LOCAL_V1','TESTE-V1','manual',
  '2026-01-01','12:00',NULL,'Endereco SINTETICO em revisao','em_revisao',true),
 ('50000000-0000-4000-8000-000000000004','manual','SENTINELA_TESTE_NEGATIVO_V1','TESTE-V1','manual',
  '2026-01-01','12:00',NULL,'Endereco SINTETICO de outra fonte','consolidada',true);
INSERT INTO sentinela.ocorrencia_naturezas(id,ocorrencia_id,natureza_id,origem,classificacao_status,mapeamento_id)
VALUES
 ('60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','manual','mapeada','40000000-0000-4000-8000-000000000001'),
 ('60000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','manual','pendente',NULL),
 ('60000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','manual','pendente',NULL),
 ('60000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000002','manual','pendente',NULL);
-- Deliberate extension: 19 original rows + 1 negative transitive nature mapping = 20.
INSERT INTO sentinela.mapeamentos_natureza(id,natureza_id,versao,categoria_id,status,evidencia_homologacao)
VALUES ('40000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000002',
'SENTINELA_TESTE_LOCAL_V1','20000000-0000-4000-8000-000000000001','homologado','Mapeamento SINTETICO natureza invisivel');

SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;
