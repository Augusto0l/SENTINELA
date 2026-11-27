-- Revision pcdf-receiver-fixture-0001. Apply only to an attested disposable cluster.
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'sentinela_rls_sandbox'
     OR inet_server_port() <> 55432 OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
     OR nullif(current_setting('sentinela.sandbox_uuid', true), '') IS NULL THEN
    RAISE EXCEPTION 'Disposable PCDF receiver only';
  END IF;
END
$guard$;

CREATE ROLE pcdf_receiver_fixture NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
CREATE SCHEMA sentinela_pcdf_receiver_fixture;
REVOKE ALL ON SCHEMA sentinela_pcdf_receiver_fixture FROM PUBLIC;
GRANT USAGE ON SCHEMA sentinela, sentinela_pcdf_receiver_fixture TO pcdf_receiver_fixture;

INSERT INTO sentinela.usuarios(id, nome_exibicao, perfil, ativo)
VALUES ('71000000-0000-4000-8000-000000000009', 'Serviço de ensaio PCDF', 'Operador', true);

GRANT SELECT, INSERT ON sentinela.extracoes_origem, sentinela.lotes_importacao,
  sentinela.execucoes_importacao, sentinela.linhas_origem, sentinela.linhas_staging,
  sentinela.eventos_auditoria TO pcdf_receiver_fixture;
GRANT INSERT ON sentinela.pendencias_revisao TO pcdf_receiver_fixture;
-- The revision trigger plans this query even with no reviewer assigned.
-- Forced RLS grants this role no visible user rows.
GRANT SELECT(id, ativo, perfil) ON sentinela.usuarios TO pcdf_receiver_fixture;

CREATE POLICY pcdf_receiver_extraction ON sentinela.extracoes_origem TO pcdf_receiver_fixture
  USING (fonte = 'PCDF-RECEPTOR-TESTE');
CREATE POLICY pcdf_receiver_lot ON sentinela.lotes_importacao TO pcdf_receiver_fixture
  USING (solicitado_por = '71000000-0000-4000-8000-000000000009'
    AND EXISTS (SELECT FROM sentinela.extracoes_origem e WHERE e.id = extracao_id));
CREATE POLICY pcdf_receiver_run ON sentinela.execucoes_importacao TO pcdf_receiver_fixture
  USING (solicitado_por = '71000000-0000-4000-8000-000000000009'
    AND EXISTS (SELECT FROM sentinela.lotes_importacao l WHERE l.id = lote_id));
CREATE POLICY pcdf_receiver_origin ON sentinela.linhas_origem TO pcdf_receiver_fixture
  USING (EXISTS (SELECT FROM sentinela.extracoes_origem e WHERE e.id = extracao_id));
CREATE POLICY pcdf_receiver_staging ON sentinela.linhas_staging TO pcdf_receiver_fixture
  USING (EXISTS (SELECT FROM sentinela.execucoes_importacao e WHERE e.id = execucao_id));
CREATE POLICY pcdf_receiver_issue ON sentinela.pendencias_revisao FOR INSERT TO pcdf_receiver_fixture
  WITH CHECK (ocorrencia_id IS NULL AND associacao_id IS NULL AND responsavel_id IS NULL
    AND status = 'aberta' AND EXISTS (SELECT FROM sentinela.linhas_origem o
      WHERE o.id = pendencias_revisao.linha_origem_id));
CREATE POLICY pcdf_receiver_audit ON sentinela.eventos_auditoria TO pcdf_receiver_fixture
  USING (ator_tipo = 'servico' AND servico = 'pcdf-receptor-fixture'
    AND ocorrencia_id IS NULL AND linha_origem_id IS NULL AND pendencia_id IS NULL AND correcao_id IS NULL);

\ir receiver-stage.sql
GRANT USAGE ON SCHEMA sentinela_pcdf_stage TO pcdf_receiver_fixture;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_stage.stage(jsonb,uuid,uuid,text,text,text)
  TO pcdf_receiver_fixture;

CREATE FUNCTION sentinela_pcdf_receiver_fixture.stage(delivery jsonb, request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF current_user <> 'pcdf_receiver_fixture'
     OR current_database() <> 'sentinela_rls_sandbox'
     OR inet_server_port() <> 55432 OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
     OR nullif(current_setting('sentinela.sandbox_uuid', true), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Disposable PCDF receiver only';
  END IF;

  IF delivery->'batch'->>'treatment' IS DISTINCT FROM 'pcdf-receptor-fixture-v1' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Delivery outside qualification scope';
  END IF;
  RETURN sentinela_pcdf_stage.stage(delivery, request, '71000000-0000-4000-8000-000000000009',
    'PCDF-RECEPTOR-TESTE', 'pcdf-receptor-fixture', NULL);
END;
$$;
REVOKE ALL ON FUNCTION sentinela_pcdf_receiver_fixture.stage(jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_receiver_fixture.stage(jsonb, uuid) TO pcdf_receiver_fixture;
COMMIT;
