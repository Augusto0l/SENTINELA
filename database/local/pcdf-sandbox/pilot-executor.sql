-- Install only through the attested local pilot controller.
BEGIN;
DO $guard$
BEGIN
  IF session_user <> 'postgres' OR current_database() <> 'sentinela_pcdf_piloto'
     OR inet_server_port() <> 55481 OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
     OR nullif(current_setting('sentinela.sandbox_uuid', true), '') IS NULL
     OR EXISTS (SELECT FROM pg_database WHERE datname NOT IN
       ('postgres','template0','template1','sentinela_pcdf_piloto')) THEN
    RAISE EXCEPTION 'Dedicated local PCDF pilot required';
  END IF;
END $guard$;

CREATE ROLE pcdf_pilot_executor NOLOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE pcdf_pilot_writer NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT pcdf_pilot_service TO pcdf_pilot_executor WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
REVOKE CONNECT ON DATABASE postgres, template0, template1 FROM PUBLIC;
ALTER ROLE pcdf_pilot_executor SET log_min_error_statement = 'panic';
ALTER ROLE pcdf_pilot_executor SET log_error_verbosity = 'terse';
ALTER ROLE pcdf_pilot_executor SET log_statement = 'none';
ALTER ROLE pcdf_pilot_executor SET log_min_duration_statement = -1;

CREATE SCHEMA sentinela_pcdf_pilot;
REVOKE ALL ON SCHEMA sentinela_pcdf_pilot FROM PUBLIC;
GRANT USAGE ON SCHEMA sentinela_pcdf_pilot TO pcdf_pilot_writer, pcdf_pilot_service;

-- Only postgres may enroll a trust anchor or materialize a verified institutional release.
CREATE TABLE sentinela_pcdf_pilot.target (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  cluster uuid NOT NULL,
  institutional_key sentinela.sha256
);
INSERT INTO sentinela_pcdf_pilot.target(cluster) VALUES (current_setting('sentinela.sandbox_uuid')::uuid);

CREATE TABLE sentinela_pcdf_pilot.release (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  manifesto sentinela.sha256 NOT NULL,
  csv sentinela.sha256 NOT NULL,
  xml sentinela.sha256 NOT NULL,
  payload sentinela.sha256 NOT NULL,
  approval_record sentinela.sha256 NOT NULL,
  release_record sentinela.sha256 NOT NULL,
  key_pin sentinela.sha256 NOT NULL,
  reference text NOT NULL CHECK (reference ~ '^[A-Za-z0-9._/-]{1,128}$'),
  operator_name text NOT NULL CHECK (length(btrim(operator_name)) BETWEEN 1 AND 128),
  actor uuid NOT NULL REFERENCES sentinela.usuarios(id),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > starts_at)
);
CREATE TABLE sentinela_pcdf_pilot.fixture_release (LIKE sentinela_pcdf_pilot.release INCLUDING ALL);
ALTER TABLE sentinela_pcdf_pilot.release ADD CHECK (
  actor <> '71000000-0000-4000-8000-000000000081'
  AND csv = 'e202df3622fbd5f0b4ae53e7a8f435bce9ad58ff30a43a3c248ce2d369fd3770');
ALTER TABLE sentinela_pcdf_pilot.fixture_release ADD CHECK (
  actor = '71000000-0000-4000-8000-000000000081');
REVOKE ALL ON ALL TABLES IN SCHEMA sentinela_pcdf_pilot FROM PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA sentinela_pcdf_pilot TO pcdf_pilot_writer;

GRANT USAGE ON SCHEMA sentinela TO pcdf_pilot_writer;
GRANT SELECT, INSERT ON sentinela.extracoes_origem, sentinela.lotes_importacao,
  sentinela.execucoes_importacao, sentinela.linhas_origem, sentinela.linhas_staging,
  sentinela.eventos_auditoria TO pcdf_pilot_writer;
GRANT INSERT ON sentinela.pendencias_revisao TO pcdf_pilot_writer;
GRANT SELECT(id, ativo, perfil) ON sentinela.usuarios TO pcdf_pilot_writer;

CREATE POLICY pcdf_pilot_extraction ON sentinela.extracoes_origem TO pcdf_pilot_writer
  USING (fonte = CASE session_user WHEN 'pcdf_pilot_executor' THEN 'PCDF'
                    WHEN 'pcdf_pilot_qualification' THEN 'PCDF-PILOTO-ENSAIO' END);
CREATE POLICY pcdf_pilot_lot ON sentinela.lotes_importacao TO pcdf_pilot_writer
  USING (EXISTS (SELECT FROM sentinela.extracoes_origem e WHERE e.id = extracao_id));
CREATE POLICY pcdf_pilot_run ON sentinela.execucoes_importacao TO pcdf_pilot_writer
  USING (EXISTS (SELECT FROM sentinela.lotes_importacao l WHERE l.id = lote_id));
CREATE POLICY pcdf_pilot_origin ON sentinela.linhas_origem TO pcdf_pilot_writer
  USING (EXISTS (SELECT FROM sentinela.extracoes_origem e WHERE e.id = extracao_id));
CREATE POLICY pcdf_pilot_staging ON sentinela.linhas_staging TO pcdf_pilot_writer
  USING (EXISTS (SELECT FROM sentinela.execucoes_importacao e WHERE e.id = execucao_id));
CREATE POLICY pcdf_pilot_issue ON sentinela.pendencias_revisao FOR INSERT TO pcdf_pilot_writer
  WITH CHECK (ocorrencia_id IS NULL AND associacao_id IS NULL AND responsavel_id IS NULL
    AND status = 'aberta' AND EXISTS (SELECT FROM sentinela.linhas_origem o
      WHERE o.id = pendencias_revisao.linha_origem_id));
CREATE POLICY pcdf_pilot_audit ON sentinela.eventos_auditoria TO pcdf_pilot_writer
  USING (ator_tipo = 'servico'
    AND servico = CASE session_user WHEN 'pcdf_pilot_executor' THEN 'pcdf-piloto'
                    WHEN 'pcdf_pilot_qualification' THEN 'pcdf-piloto-ensaio' END
    AND ocorrencia_id IS NULL AND linha_origem_id IS NULL AND pendencia_id IS NULL AND correcao_id IS NULL);
CREATE POLICY pcdf_pilot_actor ON sentinela.usuarios FOR SELECT TO pcdf_pilot_writer
  USING (id = CASE session_user
    WHEN 'pcdf_pilot_executor' THEN (SELECT actor FROM sentinela_pcdf_pilot.release)
    WHEN 'pcdf_pilot_qualification' THEN '71000000-0000-4000-8000-000000000081'::uuid END);

\ir receiver-stage.sql
GRANT USAGE ON SCHEMA sentinela_pcdf_stage TO pcdf_pilot_writer;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_stage.stage(jsonb,uuid,uuid,text,text,text) TO pcdf_pilot_writer;

CREATE FUNCTION sentinela_pcdf_pilot.authorized_delivery(document jsonb, request uuid)
RETURNS sentinela_pcdf_pilot.release LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  allowed sentinela_pcdf_pilot.release%ROWTYPE;
  target sentinela_pcdf_pilot.target%ROWTYPE;
BEGIN
  SELECT * INTO STRICT target FROM sentinela_pcdf_pilot.target;
  IF current_user <> 'pcdf_pilot_writer' OR current_database() <> 'sentinela_pcdf_piloto'
     OR inet_server_port() <> 55481 OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
     OR current_setting('sentinela.sandbox_uuid', true) IS DISTINCT FROM target.cluster::text
     OR request IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Pilot destination or executor refused';
  END IF;

  IF session_user = 'pcdf_pilot_executor' THEN
    SELECT * INTO allowed FROM sentinela_pcdf_pilot.release WHERE key_pin = target.institutional_key;
    IF document->'batch'->>'month' IS DISTINCT FROM '2021-01'
       OR document->'batch'->>'size' IS DISTINCT FROM '2948416'
       OR jsonb_array_length(document->'batch'->'rows') IS DISTINCT FROM 6393
       OR document->'batch'->>'treatment' = 'pcdf-receptor-fixture-v1' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Pilot delivery outside scope';
    END IF;
  ELSIF session_user = 'pcdf_pilot_qualification'
    AND target.institutional_key IS NULL
    AND NOT EXISTS (SELECT FROM sentinela_pcdf_pilot.release)
    AND EXISTS (SELECT FROM pg_roles WHERE rolname='pcdf_pilot_executor' AND NOT rolcanlogin)
    AND document->'batch'->>'month' = '2026-08'
    AND document->'batch'->>'treatment' = 'pcdf-receptor-fixture-v1' THEN
    SELECT * INTO allowed FROM sentinela_pcdf_pilot.fixture_release;
  END IF;

  IF allowed.reference IS NULL OR clock_timestamp() < allowed.starts_at OR clock_timestamp() >= allowed.expires_at
     OR NOT EXISTS (SELECT FROM sentinela.usuarios WHERE id=allowed.actor AND ativo AND perfil='Operador')
     OR allowed.manifesto IS DISTINCT FROM document->>'manifestSha'
     OR allowed.csv IS DISTINCT FROM document->'batch'->>'sha256'
     OR allowed.xml IS DISTINCT FROM document->'source'->>'sha256'
     OR allowed.payload IS DISTINCT FROM encode(sha256(convert_to(document::text,'UTF8')),'hex') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Verified authorization required';
  END IF;
  RETURN allowed;
END;
$$;

CREATE FUNCTION sentinela_pcdf_pilot.record_attempt(document jsonb, request uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  allowed sentinela_pcdf_pilot.release%ROWTYPE;
  service text := CASE session_user WHEN 'pcdf_pilot_executor' THEN 'pcdf-piloto' ELSE 'pcdf-piloto-ensaio' END;
  details jsonb;
BEGIN
  allowed := sentinela_pcdf_pilot.authorized_delivery(document, request);
  details := jsonb_build_object('sha256',allowed.csv,'manifesto_sha256',allowed.manifesto,'xml_sha256',allowed.xml,
    'autorizacao',allowed.reference,'operador',allowed.operator_name,'login',session_user,
    'autorizacao_sha256',allowed.release_record);
  PERFORM pg_advisory_xact_lock(hashtextextended(request::text, 0));
  IF EXISTS (SELECT FROM sentinela.eventos_auditoria WHERE servico = service
      AND request_id = request::text AND acao = 'tentativa_iniciada') THEN
    IF NOT EXISTS (SELECT FROM sentinela.eventos_auditoria WHERE servico = service
        AND request_id = request::text AND acao = 'tentativa_iniciada' AND depois = details) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Request context differs';
    END IF;
    RETURN;
  END IF;
  INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,depois,justificativa,request_id)
    VALUES ('servico',service,'tentativa_iniciada',details,'Tentativa de recepção PCDF',request::text);
END;
$$;

CREATE FUNCTION sentinela_pcdf_pilot.receive(document jsonb, request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  allowed sentinela_pcdf_pilot.release%ROWTYPE;
  service text := CASE session_user WHEN 'pcdf_pilot_executor' THEN 'pcdf-piloto' ELSE 'pcdf-piloto-ensaio' END;
  source text := CASE session_user WHEN 'pcdf_pilot_executor' THEN 'PCDF' ELSE 'PCDF-PILOTO-ENSAIO' END;
  receipt jsonb;
BEGIN
  allowed := sentinela_pcdf_pilot.authorized_delivery(document, request);
  PERFORM pg_advisory_xact_lock(hashtextextended(request::text, 0));
  IF NOT EXISTS (SELECT FROM sentinela.eventos_auditoria WHERE servico = service
      AND request_id = request::text AND acao = 'tentativa_iniciada'
      AND depois->>'autorizacao_sha256' = allowed.release_record) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Audited attempt required';
  END IF;
  SELECT depois - 'autorizacao' INTO receipt FROM sentinela.eventos_auditoria WHERE servico = service
    AND request_id = request::text AND acao IN ('staging_pcdf','reenvio_pcdf')
    AND depois->>'autorizacao' = allowed.reference;
  IF FOUND THEN
    RETURN receipt;
  END IF;
  RETURN sentinela_pcdf_stage.stage(document, request, allowed.actor, source, service, allowed.reference);
END;
$$;

CREATE FUNCTION sentinela_pcdf_pilot.reconcile(document jsonb, request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  allowed sentinela_pcdf_pilot.release%ROWTYPE;
  service text := CASE session_user WHEN 'pcdf_pilot_executor' THEN 'pcdf-piloto' ELSE 'pcdf-piloto-ensaio' END;
  run uuid;
  result jsonb;
  originals constant text[] := ARRAY['ano_registro','unidade_registro','numero_registro','ano_fato',
    'data_inicio_fato_original','natureza_original','natureza_padronizada_pcdf','crime_tentado',
    'cidade_endereco_original','ra_original','area_endereco_original','quadra_endereco_original',
    'latitude_geo_original','longitude_geo_original','latitude_utm_original','longitude_utm_original',
    'flagrante','unidade_apuracao'];
BEGIN
  allowed := sentinela_pcdf_pilot.authorized_delivery(document, request);
  SELECT event.execucao_id INTO run FROM sentinela.eventos_auditoria event
  WHERE event.servico = service AND event.request_id = request::text
    AND event.acao IN ('staging_pcdf','reenvio_pcdf') AND event.depois->>'autorizacao' = allowed.reference
    AND EXISTS (SELECT FROM sentinela.eventos_auditoria attempt WHERE attempt.servico = service
      AND attempt.request_id = request::text AND attempt.acao = 'tentativa_iniciada'
      AND attempt.depois->>'autorizacao_sha256' = allowed.release_record);
  IF run IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Audited receipt required';
  END IF;
  WITH expected AS (
    SELECT * FROM jsonb_to_recordset(document->'batch'->'rows') r(ordinal bigint, raw jsonb)
  ), staged AS (
    SELECT s.registro_csv, s.campos_csv, s.estado, o.linha_origem_id, o.aba_origem, o.linha_xml, to_jsonb(o) AS origin
    FROM sentinela.linhas_staging s JOIN sentinela.linhas_origem o ON o.id=s.linha_origem_id
    WHERE s.execucao_id=run
  )
  SELECT jsonb_build_object('rows',count(staged.registro_csv),'distinctIds',count(DISTINCT linha_origem_id),
    'fields',34,'originals',cardinality(originals),
    'fieldDifferences',count(*) FILTER (WHERE raw IS DISTINCT FROM campos_csv),
    'originalDifferences',count(*) FILTER (WHERE EXISTS (
      SELECT FROM unnest(originals) k WHERE raw->k IS DISTINCT FROM origin->k)),
    'provenanceDifferences',count(*) FILTER (WHERE raw->>'linha_origem_id' IS DISTINCT FROM linha_origem_id
      OR raw->>'aba_origem' IS DISTINCT FROM aba_origem OR raw->>'linha_xml' IS DISTINCT FROM linha_xml::text),
    'unblocked',count(*) FILTER (WHERE estado IS DISTINCT FROM 'bloqueada'),
    'attemptAudited',true,'receiptAudited',true)
  INTO result FROM expected FULL JOIN staged ON ordinal=registro_csv;
  RETURN result;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sentinela_pcdf_pilot FROM PUBLIC;
ALTER FUNCTION sentinela_pcdf_pilot.record_attempt(jsonb,uuid) OWNER TO pcdf_pilot_writer;
ALTER FUNCTION sentinela_pcdf_pilot.receive(jsonb,uuid) OWNER TO pcdf_pilot_writer;
ALTER FUNCTION sentinela_pcdf_pilot.reconcile(jsonb,uuid) OWNER TO pcdf_pilot_writer;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_pilot.authorized_delivery(jsonb,uuid) TO pcdf_pilot_writer;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_pilot.record_attempt(jsonb,uuid), sentinela_pcdf_pilot.receive(jsonb,uuid),
  sentinela_pcdf_pilot.reconcile(jsonb,uuid) TO pcdf_pilot_service;
COMMIT;
