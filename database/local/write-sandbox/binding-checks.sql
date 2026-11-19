\ir ../sandbox/sql/guard.sql
BEGIN;
DO $$
DECLARE r sentinela_geo_lab.bindings%ROWTYPE; failures integer:=0;
BEGIN
 SELECT * INTO STRICT r FROM sentinela_geo_lab.bindings WHERE version='ide-df-bindings-2026-11-13-v1' AND code='RA-I';
 BEGIN INSERT INTO sentinela_geo_lab.bindings SELECT r.*; RAISE EXCEPTION 'Duplicate accepted'; EXCEPTION WHEN unique_violation THEN failures:=failures+1; END;
 BEGIN INSERT INTO sentinela_geo_lab.bindings VALUES(r.version,'ffffffff-ffff-4fff-8fff-ffffffffffff','UNKNOWN','0','approved','test'); RAISE EXCEPTION 'Unknown identity accepted'; EXCEPTION WHEN foreign_key_violation THEN failures:=failures+1; END;
 INSERT INTO sentinela_geo_lab.binding_versions SELECT 'test-constraint',source_id,source_hash,scope,extracted_on,valid_from,valid_to,temporal_basis FROM sentinela_geo_lab.binding_versions WHERE version=r.version;
 BEGIN INSERT INTO sentinela_geo_lab.bindings VALUES('test-constraint',r.ra_id,'UNKNOWN','0','approved','test'); RAISE EXCEPTION 'Unknown code accepted'; EXCEPTION WHEN foreign_key_violation THEN failures:=failures+1; WHEN unique_violation THEN RAISE EXCEPTION 'Test unexpectedly hit uniqueness before FK'; END;
 BEGIN UPDATE sentinela_geo_lab.bindings SET evidence='forged' WHERE false; RAISE EXCEPTION 'Mutable binding'; EXCEPTION WHEN insufficient_privilege THEN failures:=failures+1; END;
 BEGIN DELETE FROM sentinela_geo_lab.binding_versions WHERE false; RAISE EXCEPTION 'Mutable version'; EXCEPTION WHEN insufficient_privilege THEN failures:=failures+1; END;
 BEGIN INSERT INTO sentinela_geo_lab.binding_versions VALUES('bad-time','https://example.org',repeat('0',64),'sandbox',current_date,current_date,NULL,'extraction-only'); RAISE EXCEPTION 'Invented validity accepted'; EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 IF failures<>6 THEN RAISE EXCEPTION 'Incomplete constraint checks'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: six constraint and immutable-history rejection checks';
