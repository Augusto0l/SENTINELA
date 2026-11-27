-- Incremental extension for an attested disposable cluster only.
\ir ../sandbox/sql/guard.sql
BEGIN;
SET LOCAL search_path=pg_catalog;

CREATE TABLE sentinela_write_lab.individuals (
  login name PRIMARY KEY CHECK (login IN ('sentinela_sbx_admin','sentinela_sbx_operator')),
  subject uuid NOT NULL UNIQUE
);
CREATE TABLE sentinela_write_lab.occurrence_versions (
  occurrence_id uuid NOT NULL REFERENCES sentinela.ocorrencias(id),
  version bigint NOT NULL CHECK (version > 0),
  subject uuid NOT NULL REFERENCES sentinela_write_lab.individuals(subject),
  audit_id uuid NOT NULL UNIQUE,
  operation text NOT NULL CHECK (operation IN ('create','edit','inactivate')),
  address text,
  district text,
  position extensions.geometry(Point,4326),
  tx xid8 NOT NULL DEFAULT pg_current_xact_id(),
  PRIMARY KEY (occurrence_id,version),
  CHECK ((address IS NULL AND district IS NULL) OR
    (address IS NOT NULL AND district IS NOT NULL AND
     length(btrim(address)) BETWEEN 1 AND 240 AND length(btrim(district)) BETWEEN 1 AND 100))
);
ALTER TABLE sentinela_write_lab.individuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_write_lab.individuals FORCE ROW LEVEL SECURITY;
ALTER TABLE sentinela_write_lab.occurrence_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_write_lab.occurrence_versions FORCE ROW LEVEL SECURITY;
GRANT SELECT ON sentinela_write_lab.individuals TO sentinela_sbx_mutator;
GRANT SELECT, INSERT ON sentinela_write_lab.occurrence_versions TO sentinela_sbx_mutator;
GRANT SELECT (id,ocorrencia_id,servico,acao,transacao_id)
  ON sentinela.eventos_auditoria TO sentinela_sbx_mutator;
CREATE POLICY isolated_individual ON sentinela_write_lab.individuals FOR SELECT TO sentinela_sbx_mutator
  USING (login=session_user);
CREATE POLICY isolated_create_audit ON sentinela.eventos_auditoria FOR SELECT TO sentinela_sbx_mutator
  USING (servico=session_user AND acao='sandbox.cadastro' AND transacao_id=pg_current_xact_id());
CREATE POLICY isolated_version_read ON sentinela_write_lab.occurrence_versions FOR SELECT TO sentinela_sbx_mutator
  USING (EXISTS (SELECT FROM sentinela.ocorrencias o WHERE o.id=occurrence_id));
CREATE POLICY isolated_version_insert ON sentinela_write_lab.occurrence_versions FOR INSERT TO sentinela_sbx_mutator
  WITH CHECK (tx=pg_current_xact_id() AND EXISTS (SELECT FROM sentinela_write_lab.individuals i WHERE i.subject=occurrence_versions.subject));

CREATE FUNCTION sentinela_write_lab.record_version(
  p_subject uuid,p_id uuid,p_version bigint,p_audit uuid,p_operation text,p_address text,p_district text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; row_now sentinela.ocorrencias%ROWTYPE;
        prior sentinela_write_lab.occurrence_versions%ROWTYPE;
BEGIN
  SELECT subject INTO actor FROM sentinela_write_lab.individuals WHERE login=session_user;
  IF actor IS NULL OR actor IS DISTINCT FROM p_subject THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Isolated account binding mismatch';
  END IF;
  -- Replay returns the original creation receipt, with no second history entry.
  IF p_operation='create' THEN
    SELECT * INTO prior FROM sentinela_write_lab.occurrence_versions v
    WHERE v.occurrence_id=p_id AND v.version=p_version AND v.audit_id=p_audit AND v.subject=actor
      AND v.operation='create';
    IF FOUND THEN
      IF prior.address IS DISTINCT FROM p_address OR prior.district IS DISTINCT FROM p_district THEN
        RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='Idempotency conflict';
      END IF;
      RETURN;
    END IF;
  END IF;
  SELECT * INTO row_now FROM sentinela.ocorrencias WHERE id=p_id AND versao=p_version;
  IF NOT FOUND OR NOT (
    (p_operation='create' AND p_version=1 AND EXISTS (
      SELECT FROM sentinela.eventos_auditoria e WHERE e.id=p_audit AND e.ocorrencia_id=p_id AND e.transacao_id=pg_current_xact_id()))
    OR (p_operation IN ('edit','inactivate') AND EXISTS (
      SELECT FROM sentinela_write_lab.mutation_history h WHERE h.id=p_audit AND h.occurrence_id=p_id
      AND h.actor=session_user AND h.tx=pg_current_xact_id() AND h.new_version=p_version AND h.operation=p_operation))
  ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Matching in-transaction audit required'; END IF;
  IF p_operation='inactivate' THEN
    SELECT address,district INTO p_address,p_district FROM sentinela_write_lab.occurrence_versions
      WHERE occurrence_id=p_id ORDER BY version DESC LIMIT 1;
  END IF;
  INSERT INTO sentinela_write_lab.occurrence_versions(occurrence_id,version,subject,audit_id,operation,address,district,position)
  VALUES(p_id,p_version,actor,p_audit,p_operation,p_address,p_district,
    CASE WHEN row_now.latitude IS NOT NULL AND row_now.longitude IS NOT NULL THEN
      extensions.ST_SetSRID(extensions.ST_MakePoint(row_now.longitude,row_now.latitude),4326) END);
END $$;
ALTER FUNCTION sentinela_write_lab.record_version(uuid,uuid,bigint,uuid,text,text,text) OWNER TO sentinela_sbx_mutator;
REVOKE ALL ON FUNCTION sentinela_write_lab.record_version(uuid,uuid,bigint,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_write_lab.record_version(uuid,uuid,bigint,uuid,text,text,text)
  TO sentinela_sbx_admin,sentinela_sbx_operator;
COMMIT;
