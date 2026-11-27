-- Run only after the guarded receiver-staging-fixture.sql install.
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'sentinela_rls_sandbox' OR inet_server_port() <> 55432
     OR current_user <> 'postgres' OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
     OR nullif(current_setting('sentinela.sandbox_uuid', true), '') IS NULL THEN
    RAISE EXCEPTION 'Synthetic service requires its disposable cluster';
  END IF;
END $guard$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE sentinela_rls_sandbox TO pcdf_fixture_login;
GRANT USAGE ON SCHEMA sentinela_pcdf_receiver_fixture TO pcdf_fixture_login;

CREATE TABLE sentinela_pcdf_receiver_fixture.approved_delivery (
  manifesto sentinela.sha256 PRIMARY KEY,
  csv sentinela.sha256 NOT NULL,
  xml sentinela.sha256 NOT NULL,
  payload sentinela.sha256 NOT NULL
);
REVOKE ALL ON sentinela_pcdf_receiver_fixture.approved_delivery FROM PUBLIC;
GRANT SELECT ON sentinela_pcdf_receiver_fixture.approved_delivery TO pcdf_receiver_fixture;

CREATE FUNCTION sentinela_pcdf_receiver_fixture.record_attempt(document jsonb, request uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF session_user <> 'pcdf_fixture_login' OR inet_server_port() <> 55432 OR NOT EXISTS (
    SELECT FROM sentinela_pcdf_receiver_fixture.approved_delivery a
    WHERE a.manifesto = document->>'manifesto_sha256' AND a.csv = document->>'sha256'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Synthetic delivery is not approved';
  END IF;
  INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,depois,justificativa,request_id)
    VALUES ('servico','pcdf-receptor-fixture','tentativa_iniciada',
      jsonb_build_object('sha256',document->>'sha256','manifesto_sha256',document->>'manifesto_sha256',
        'login',session_user),'Ensaio de servico PCDF',request::text);
END;
$$;

CREATE FUNCTION sentinela_pcdf_receiver_fixture.receive_fixture(delivery jsonb, request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF session_user <> 'pcdf_fixture_login' OR inet_server_port() <> 55432 OR NOT EXISTS (
    SELECT FROM sentinela_pcdf_receiver_fixture.approved_delivery a
    WHERE a.manifesto = delivery->>'manifestSha' AND a.csv = delivery->'batch'->>'sha256'
      AND a.xml = delivery->'source'->>'sha256'
      AND a.payload = encode(sha256(convert_to(delivery::text,'UTF8')),'hex')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Synthetic delivery is not approved';
  END IF;
  RETURN sentinela_pcdf_receiver_fixture.stage(delivery, request);
END;
$$;

ALTER FUNCTION sentinela_pcdf_receiver_fixture.record_attempt(jsonb,uuid) OWNER TO pcdf_receiver_fixture;
ALTER FUNCTION sentinela_pcdf_receiver_fixture.receive_fixture(jsonb,uuid) OWNER TO pcdf_receiver_fixture;
REVOKE ALL ON FUNCTION sentinela_pcdf_receiver_fixture.record_attempt(jsonb,uuid),
  sentinela_pcdf_receiver_fixture.receive_fixture(jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_receiver_fixture.record_attempt(jsonb,uuid),
  sentinela_pcdf_receiver_fixture.receive_fixture(jsonb,uuid) TO pcdf_fixture_login;
COMMIT;
