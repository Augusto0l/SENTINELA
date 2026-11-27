\ir ../sandbox/sql/guard.sql
BEGIN;
INSERT INTO sentinela.naturezas_criminais(fonte,descricao_original)
VALUES('PCDF-SANDBOX','FURTO DE VEICULO'),('PCDF-SANDBOX','ESTUPRO');
COMMIT;
