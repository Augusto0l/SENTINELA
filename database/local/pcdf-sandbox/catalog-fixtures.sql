\ir ../sandbox/sql/guard.sql
BEGIN;
INSERT INTO sentinela.categorias_criminais(id,nome,versao_catalogo,status,evidencia_homologacao)
VALUES('73000000-0000-4000-8000-000000000001','Categoria de ensaio','pcdf-sandbox-v1','homologada','Fixture');
INSERT INTO sentinela.naturezas_criminais(fonte,descricao_original,categoria_pcdf_original)
VALUES('PCDF-SANDBOX','Natureza de ensaio A','Categoria de ensaio'),
      ('PCDF-SANDBOX','Natureza de ensaio B','Categoria de ensaio'),
      ('PCDF-SANDBOX','Natureza sem regra','Categoria de ensaio');
INSERT INTO sentinela.mapeamentos_natureza(natureza_id,versao,crime_tentado,categoria_id,status,evidencia_homologacao)
SELECT id,'pcdf-sandbox-v1',false,'73000000-0000-4000-8000-000000000001','homologado','Fixture'
FROM sentinela.naturezas_criminais WHERE fonte='PCDF-SANDBOX'
AND descricao_original IN ('Natureza de ensaio A','Natureza de ensaio B');
COMMIT;
