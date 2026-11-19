-- Legitimate INSERT fixtures; never UPDATE review records into eligible states.
\ir ../sandbox/sql/guard.sql
BEGIN;
DO $$ BEGIN
 IF current_user<>'postgres' OR current_database()<>'sentinela_rls_sandbox' OR inet_server_port()<>55432
 OR EXISTS(SELECT FROM sentinela.ocorrencias WHERE id::text LIKE '51000000-%')
 THEN RAISE EXCEPTION 'Fresh synthetic fixture scope required'; END IF;
END $$;
-- Consolidation and spatial validation are distinct fields in the baseline.
-- These synthetic manual rows are consolidated but NOT official cartography:
-- geometry NULL, reference pending. Mutation scope preserves that limitation.
INSERT INTO sentinela.ocorrencias(id,origem,fonte,versao_identidade,identidade_status,data_fato,horario_fato,
 ra_id,local,latitude,longitude,localizacao_status,consolidacao_status,ativo)
SELECT ('51000000-0000-4000-8000-00000000000'||i)::uuid,'manual','SENTINELA_WRITE_SANDBOX_V1',
 'SANDBOX-MANUAL-V1','manual','2026-11-11','12:00:00','11000000-0000-4000-8000-000000000001',
 'Fixture SINTETICA independente '||i,-15.79,-47.88,'referencia_pendente',
 CASE WHEN i=3 THEN 'em_revisao' ELSE 'consolidada' END,i<>4 FROM generate_series(1,6) i;
INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,crime_tentado,classificacao_status)
SELECT ('51000000-0000-4000-8000-00000000000'||i)::uuid,'31000000-0000-4000-8000-000000000001',
 'manual',NULL,'pendente' FROM generate_series(1,6) i;
INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,crime_tentado,classificacao_status)
VALUES('51000000-0000-4000-8000-000000000005','31000000-0000-4000-8000-000000000002','manual',true,'pendente');
-- Explicit fault injection only in the disposable qualification database.
ALTER TABLE sentinela_write_lab.mutation_history ADD CONSTRAINT synthetic_audit_failure
 CHECK(reason<>'SYNTHETIC_AUDIT_FAILURE');
COMMIT;
