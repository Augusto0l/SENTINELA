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

CREATE FUNCTION sentinela_pcdf_receiver_fixture.stage(delivery jsonb, request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  actor constant uuid := '71000000-0000-4000-8000-000000000009';
  source_data jsonb := delivery->'source';
  batch jsonb := delivery->'batch';
  extraction uuid;
  lot uuid;
  run uuid;
  month date := ((batch->>'month') || '-01')::date;
  treatment text := batch->>'treatment';
  records bigint := jsonb_array_length(batch->'rows');
  issues bigint;
  receipt jsonb;
BEGIN
  IF current_user <> 'pcdf_receiver_fixture'
     OR current_database() <> 'sentinela_rls_sandbox'
     OR inet_server_port() <> 55432 OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
     OR nullif(current_setting('sentinela.sandbox_uuid', true), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Disposable PCDF receiver only';
  END IF;
  IF treatment IS DISTINCT FROM 'pcdf-receptor-fixture-v1' OR records IS NULL OR records > 10000
     OR (batch->>'size')::bigint NOT BETWEEN 1 AND 16777216
     OR NOT EXISTS (SELECT FROM sentinela.eventos_auditoria
       WHERE request_id = request::text AND acao = 'tentativa_iniciada'
         AND depois->>'sha256' = batch->>'sha256' AND depois->>'manifesto_sha256' = delivery->>'manifestSha')
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Delivery outside qualification scope'; END IF;

  -- ponytail: serialize qualified staging until throughput justifies narrower locks.
  PERFORM pg_advisory_xact_lock(hashtextextended('pcdf-receiver-qualification-v1', 0));
  INSERT INTO sentinela.extracoes_origem(fonte, nome_xml, sha256_xml, tamanho_bytes,
    referencia_arquivo, manifesto)
  VALUES ('PCDF-RECEPTOR-TESTE', source_data->>'nome', source_data->>'sha256',
    (source_data->>'bytes')::bigint, 'sha256:' || (source_data->>'sha256'),
    jsonb_build_object('sha256', delivery->>'manifestSha', 'conteudo', delivery->'manifest'))
  ON CONFLICT (fonte, sha256_xml) DO NOTHING;
  SELECT id INTO STRICT extraction FROM sentinela.extracoes_origem
  WHERE sha256_xml = source_data->>'sha256';
  IF NOT EXISTS (SELECT FROM sentinela.extracoes_origem
    WHERE id = extraction AND tamanho_bytes = (source_data->>'bytes')::bigint
      AND manifesto->>'sha256' = delivery->>'manifestSha')
  THEN RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Extraction context diverges'; END IF;

  SELECT l.id, e.id INTO lot, run
  FROM sentinela.lotes_importacao l
  JOIN sentinela.execucoes_importacao e ON e.lote_id = l.id AND e.status = 'concluida'
  WHERE l.extracao_id = extraction AND l.sha256_arquivo = batch->>'sha256';
  IF FOUND THEN
    IF NOT EXISTS (SELECT FROM sentinela.lotes_importacao
      WHERE id = lot AND competencia = month AND versao_tratamento = treatment
        AND tamanho_bytes = (batch->>'size')::bigint AND linhas_esperadas = records)
    THEN RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Replay context diverges'; END IF;
    receipt := jsonb_build_object('replay', true, 'lot', lot, 'run', run, 'records', records);
  ELSE
    IF EXISTS (SELECT FROM sentinela.lotes_importacao
      WHERE extracao_id = extraction AND competencia = month)
    THEN RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Monthly partition already registered'; END IF;

    INSERT INTO sentinela.lotes_importacao(extracao_id, nome_arquivo, sha256_arquivo,
      tamanho_bytes, referencia_arquivo, versao_contrato, versao_tratamento, competencia,
      linhas_esperadas, solicitado_por)
    VALUES (extraction, 'pcdf_naturezas_' || (batch->>'month') || '.csv', batch->>'sha256',
      (batch->>'size')::bigint, 'sha256:' || (batch->>'sha256'), '1.0', treatment, month, records, actor)
    RETURNING id INTO lot;

    INSERT INTO sentinela.linhas_origem(extracao_id, linha_origem_id, aba_origem, linha_xml,
      versao_identificador,
      ano_registro, unidade_registro, numero_registro, ano_fato, data_inicio_fato_original, natureza_original,
      natureza_padronizada_pcdf, crime_tentado, cidade_endereco_original, ra_original, area_endereco_original, quadra_endereco_original,
      latitude_geo_original, longitude_geo_original, latitude_utm_original, longitude_utm_original, flagrante, unidade_apuracao)
    SELECT extraction, raw->>'linha_origem_id', raw->>'aba_origem', (raw->>'linha_xml')::bigint,
      'pcdf-linha-v1',
      raw->>'ano_registro', raw->>'unidade_registro', raw->>'numero_registro',
      raw->>'ano_fato', raw->>'data_inicio_fato_original', raw->>'natureza_original',
      raw->>'natureza_padronizada_pcdf', raw->>'crime_tentado', raw->>'cidade_endereco_original',
      raw->>'ra_original', raw->>'area_endereco_original', raw->>'quadra_endereco_original',
      raw->>'latitude_geo_original', raw->>'longitude_geo_original', raw->>'latitude_utm_original',
      raw->>'longitude_utm_original', raw->>'flagrante', raw->>'unidade_apuracao'
    FROM jsonb_to_recordset(batch->'rows') r(raw jsonb);
    -- The source indexes reject a position or ID already bound to another delivery.
    -- This statement and all other inserts in the month are rolled back together.

    WITH incoming AS MATERIALIZED (
      SELECT r.*, derived->'candidate' AS candidate,
        jsonb_build_array(raw->>'data_inicio_fato_original', raw->>'ra_original', raw->>'local') AS context
      FROM jsonb_to_recordset(batch->'rows') r(ordinal bigint, raw jsonb, derived jsonb, diagnostics jsonb)
    ), conflicting AS (
      SELECT candidate FROM incoming WHERE candidate <> 'null'::jsonb
      GROUP BY candidate HAVING count(DISTINCT context) > 1
      UNION
      SELECT DISTINCT s.derivados_efetivos->'candidate'
      FROM sentinela.linhas_staging s JOIN incoming i ON i.candidate = s.derivados_efetivos->'candidate'
      WHERE i.candidate <> 'null'::jsonb
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal', ordinal, 'raw', raw,
      'derived', derived, 'diagnostics', diagnostics || CASE WHEN c.candidate IS NULL THEN '[]'::jsonb
      ELSE '[{"field":"ocorrencia_chave","kind":"identificacao","rule":"chave_candidata_conflitante","priority":"alta","effect":"bloqueia_consolidacao"}]'::jsonb END)
      ORDER BY ordinal), '[]'::jsonb) INTO batch
    FROM incoming i LEFT JOIN conflicting c USING (candidate);

    SELECT coalesce(sum(jsonb_array_length(r.diagnostics)), 0) INTO issues
    FROM jsonb_to_recordset(batch) r(diagnostics jsonb);
    INSERT INTO sentinela.execucoes_importacao(lote_id, extracao_id, tentativa, solicitado_por,
      versao_importador, versao_validacao, status, linhas_lidas, linhas_processadas,
      linhas_bloqueadas, pendencias_detectadas, checkpoint_registro_csv, finalizado_em)
    VALUES (lot, extraction, 1, actor, 'pcdf-receptor-v1', 'manifesto-v1', 'concluida',
      records, records, records, issues, records, clock_timestamp()) RETURNING id INTO run;

    INSERT INTO sentinela.linhas_staging(execucao_id, lote_id, extracao_id, linha_origem_id, registro_csv,
      campos_csv, derivados_efetivos, diagnosticos, estado)
    SELECT run, lot, extraction, o.id, r.ordinal, r.raw, r.derived, r.diagnostics, 'bloqueada'
    FROM jsonb_to_recordset(batch) r(ordinal bigint, raw jsonb, derived jsonb, diagnostics jsonb)
    JOIN sentinela.linhas_origem o ON o.extracao_id = extraction AND o.linha_origem_id = r.raw->>'linha_origem_id';

    INSERT INTO sentinela.pendencias_revisao(linha_origem_id, campo, regra, versao_regra,
      valor_original, motivo, tipo, prioridade, efeito, dimensao_afetada)
    SELECT s.linha_origem_id, d.field, d.rule, 'manifesto-v1', s.campos_csv->d.field,
      d.rule, d.kind, d.priority, d.effect, CASE WHEN d.effect = 'bloqueia_dimensao' THEN d.kind END
    FROM sentinela.linhas_staging s
    CROSS JOIN LATERAL jsonb_to_recordset(s.diagnosticos) d(field text, rule text, kind text, priority text, effect text)
    WHERE s.execucao_id = run;

    receipt := jsonb_build_object('replay', false, 'lot', lot, 'run', run, 'records', records, 'issues', issues);
  END IF;
  INSERT INTO sentinela.eventos_auditoria(ator_tipo, servico, acao, execucao_id, depois, justificativa, request_id)
  VALUES ('servico', 'pcdf-receptor-fixture',
    CASE WHEN (receipt->>'replay')::boolean THEN 'reenvio_pcdf' ELSE 'staging_pcdf' END,
    run, receipt, 'Recepção sintética de competência atestada', request::text);
  RETURN receipt;
END;
$$;
REVOKE ALL ON FUNCTION sentinela_pcdf_receiver_fixture.stage(jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_receiver_fixture.stage(jsonb, uuid) TO pcdf_receiver_fixture;
COMMIT;
