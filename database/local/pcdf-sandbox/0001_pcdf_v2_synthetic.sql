-- Apply only after direct.sql in a disposable qualification cluster on port 55488.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $guard$
BEGIN
  IF current_database() <> 'sentinela_pcdf_local'
     OR inet_server_addr() IS DISTINCT FROM inet '127.0.0.1'
     OR inet_server_port() IS DISTINCT FROM 55488
     OR nullif(current_setting('sentinela.sandbox_uuid', true), '') IS NULL
  THEN RAISE EXCEPTION 'PCDF synthetic qualification database required'; END IF;
END
$guard$;

-- An administrator approves a verified envelope and projection independently of the upload role.
CREATE TABLE sentinela_pcdf_local.aprovacoes_pacote (
  digest sentinela.sha256 PRIMARY KEY,
  contrato text NOT NULL CHECK (contrato IN ('1.0', '2.0')),
  xml_sha256 sentinela.sha256 NOT NULL,
  projecao_sha256 sentinela.sha256 NOT NULL,
  aprovado_por name NOT NULL DEFAULT session_user,
  aprovado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE sentinela_pcdf_local.entregas_pacote (
  digest sentinela.sha256 PRIMARY KEY REFERENCES sentinela_pcdf_local.aprovacoes_pacote(digest),
  nomes text[] NOT NULL,
  artefatos bytea[] NOT NULL,
  execucao_id uuid REFERENCES sentinela.execucoes_importacao(id),
  resultado jsonb NOT NULL,
  recebido_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (cardinality(nomes) = cardinality(artefatos)),
  CHECK ((execucao_id IS NULL) = coalesce(resultado ? 'reason', false))
);
ALTER TABLE sentinela_pcdf_local.aprovacoes_pacote ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_pcdf_local.aprovacoes_pacote FORCE ROW LEVEL SECURITY;
ALTER TABLE sentinela_pcdf_local.entregas_pacote ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_pcdf_local.entregas_pacote FORCE ROW LEVEL SECURITY;
CREATE POLICY aprovacoes_leitura ON sentinela_pcdf_local.aprovacoes_pacote FOR SELECT TO sentinela_pcdf_owner USING (true);
CREATE POLICY entregas_receptor ON sentinela_pcdf_local.entregas_pacote TO sentinela_pcdf_owner USING (true);
GRANT SELECT ON sentinela_pcdf_local.aprovacoes_pacote TO sentinela_pcdf_owner;
GRANT SELECT, INSERT ON sentinela_pcdf_local.entregas_pacote TO sentinela_pcdf_owner;

CREATE UNIQUE INDEX pcdf_local_resultado_v2 ON sentinela.eventos_auditoria(request_id)
 WHERE servico='pcdf-local' AND acao IN ('staging_pcdf_v2','reenvio_pcdf_v2','revisao_pcdf_v2');

-- Extends only this synthetic installation. The owner still cannot promote or update domain records.
ALTER POLICY pcdf_local_lots_read ON sentinela.lotes_importacao
 USING (versao_contrato IN ('1.0', '2.0') AND EXISTS (SELECT FROM sentinela.extracoes_origem x WHERE x.id=extracao_id));
ALTER POLICY pcdf_local_lots_insert ON sentinela.lotes_importacao WITH CHECK (
 versao_contrato IN ('1.0', '2.0') AND EXISTS (SELECT FROM sentinela.extracoes_origem x WHERE x.id=extracao_id)
 AND EXISTS (SELECT FROM sentinela.usuarios u WHERE u.id=solicitado_por AND u.ativo));
ALTER POLICY pcdf_local_runs_read ON sentinela.execucoes_importacao
 USING (versao_importador IN ('pcdf-local-v1', 'pcdf-local-v2') AND EXISTS (SELECT FROM sentinela.lotes_importacao l WHERE l.id=lote_id));
ALTER POLICY pcdf_local_runs_insert ON sentinela.execucoes_importacao WITH CHECK (
 versao_importador IN ('pcdf-local-v1', 'pcdf-local-v2') AND status='concluida' AND tentativa=1 AND linhas_aptas=0
 AND ocorrencias_criadas=0 AND associacoes_criadas=0
 AND EXISTS (SELECT FROM sentinela.lotes_importacao l WHERE l.id=lote_id AND l.extracao_id=execucoes_importacao.extracao_id)
 AND EXISTS (SELECT FROM sentinela.usuarios u WHERE u.id=solicitado_por AND u.ativo));
ALTER POLICY pcdf_local_staging ON sentinela.linhas_staging USING (
 estado IN ('bloqueada', 'reenviada') AND ocorrencia_id IS NULL AND associacao_id IS NULL
 AND EXISTS (SELECT FROM sentinela.execucoes_importacao e WHERE e.id=execucao_id));

CREATE FUNCTION sentinela_pcdf_local.pacote_digest(nomes text[], artefatos bytea[])
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,pg_temp AS $$
 SELECT encode(sha256(convert_to('pcdf-pacote-v1' || chr(10) ||
  string_agg(nome || ' ' || octet_length(bytes) || ' ' || encode(sha256(bytes),'hex'), chr(10) ORDER BY nome COLLATE "C"),
  'UTF8')), 'hex')
 FROM unnest(nomes, artefatos) p(nome, bytes)
$$;

CREATE FUNCTION sentinela_pcdf_local.staging_pacote(p_request uuid, p_account text, p_contract text,
 p_delivery jsonb, p_names text[], p_parts bytea[])
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  actor sentinela.usuarios;
  batch jsonb := p_delivery->'batch';
  source_data jsonb := p_delivery->'source';
  csv_name text := batch->>'name';
  xml_hash text := source_data->>'sha256';
  treatment text := batch->>'treatment';
  month_start date := ((batch->>'month') || '-01')::date;
  csv_hash text := encode(sha256(p_parts[array_position(p_names, csv_name)]),'hex');
  manifest_hash text := encode(sha256(p_parts[array_position(p_names, 'manifesto.json')]),'hex');
  package_hash text;
  expected_names text[];
  approval sentinela_pcdf_local.aprovacoes_pacote;
  previous sentinela_pcdf_local.entregas_pacote;
  old_lot sentinela.lotes_importacao;
  original_keys text[] := ARRAY['ano_registro','unidade_registro','numero_registro','ano_fato','data_inicio_fato_original',
    'flagrante','natureza_original','crime_tentado','natureza_padronizada_pcdf','cidade_endereco_original','ra_original',
    'area_endereco_original','quadra_endereco_original','latitude_geo_original','longitude_geo_original',
    'latitude_utm_original','longitude_utm_original','unidade_apuracao'];
  plan jsonb;
  meta jsonb;
  result jsonb;
  reason text;
  extraction uuid;
  lot uuid;
  run uuid;
  records int := jsonb_array_length(batch->'rows');
  reused int;
  issues int;
  staged int;
  writer_version text := CASE p_contract WHEN '1.0' THEN 'pcdf-local-v1' ELSE 'pcdf-local-v2' END;
  replay boolean := false;
BEGIN
  IF current_database() <> 'sentinela_pcdf_local' OR inet_server_addr() IS DISTINCT FROM inet '127.0.0.1'
    OR inet_server_port() IS DISTINCT FROM 55488 OR nullif(current_setting('sentinela.sandbox_uuid', true), '') IS NULL
  THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
  IF current_setting('transaction_isolation') <> 'read committed'
  THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
  IF NOT row_security_active('sentinela_pcdf_local.aprovacoes_pacote'::regclass)
     OR NOT row_security_active('sentinela_pcdf_local.entregas_pacote'::regclass)
  THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
  actor := sentinela_pcdf_local.actor();
  IF p_request IS NULL OR NOT coalesce(p_account ~ '^[a-f0-9]{64}$',false)
    OR NOT coalesce(p_contract IN ('1.0','2.0') AND records BETWEEN 1 AND 10000
      AND csv_name='pcdf_naturezas_' || (batch->>'month') || '.csv'
      AND csv_name ~ '^pcdf_naturezas_[0-9]{4}-(0[1-9]|1[0-2])\.csv$'
      AND treatment ~ '^[A-Za-z0-9._-]{1,128}$' AND xml_hash ~ '^[a-f0-9]{64}$'
      AND source_data->>'aba'='NATUREZAS' AND length(source_data->>'nome') BETWEEN 1 AND 256
      AND (source_data->>'bytes')::bigint > 0, false)
  THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
  expected_names := CASE p_contract WHEN '1.0' THEN ARRAY['manifesto.json',csv_name]
    ELSE ARRAY['manifesto.json',csv_name,'pendencias_temporais.jsonl','proveniencia.jsonl','sha256sums.txt','validacao.md'] END;
  IF cardinality(p_parts) IS DISTINCT FROM cardinality(expected_names)
    OR p_names IS DISTINCT FROM expected_names
    OR EXISTS (SELECT FROM unnest(p_names,p_parts) p(nome,bytes) WHERE bytes IS NULL OR octet_length(bytes) >
      CASE nome WHEN 'manifesto.json' THEN 1048576 WHEN 'validacao.md' THEN 1048576
        WHEN 'sha256sums.txt' THEN 16384 ELSE 16777216 END)
    OR csv_hash IS NULL OR manifest_hash IS NULL OR octet_length(p_parts[2]) NOT BETWEEN 1 AND 16777216
    OR octet_length(p_parts[1]) NOT BETWEEN 1 AND 1048576
    OR csv_hash IS DISTINCT FROM batch->>'sha256' OR manifest_hash IS DISTINCT FROM p_delivery->>'manifestSha'
    OR octet_length(p_parts[2]) IS DISTINCT FROM (batch->>'size')::int
  THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;

  package_hash := sentinela_pcdf_local.pacote_digest(p_names,p_parts);
  SELECT * INTO approval FROM sentinela_pcdf_local.aprovacoes_pacote WHERE digest=package_hash;
  IF NOT FOUND OR approval.contrato IS DISTINCT FROM p_contract OR approval.xml_sha256 IS DISTINCT FROM xml_hash
    OR approval.projecao_sha256 IS DISTINCT FROM encode(sha256(convert_to(p_delivery::text,'UTF8')),'hex')
  THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;

  -- Same lock as the legacy receiver. All lookups below must see the committed winner of a race.
  PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
  IF p_contract='1.0' THEN
    SELECT depois INTO STRICT meta FROM sentinela.eventos_auditoria WHERE servico='pcdf-local'
      AND request_id=p_request::text AND acao='tentativa_pcdf' AND depois->>'actor'=actor.id::text;
    IF NOT coalesce(meta @> jsonb_build_object('name',csv_name,'month',batch->>'month','sha256',csv_hash,
      'bytes',octet_length(p_parts[2]),'manifestSha',manifest_hash,'records',records,'account',p_account),false)
      OR EXISTS (SELECT FROM sentinela.eventos_auditoria WHERE servico='pcdf-local' AND request_id=p_request::text AND acao<>'tentativa_pcdf')
    THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
  ELSE
    meta := jsonb_build_object('name',csv_name,'month',batch->>'month','sha256',csv_hash,
      'bytes',octet_length(p_parts[2]),'manifestSha',manifest_hash,'records',records,
      'quarantine',p_delivery->'quarantine');
  END IF;

  SELECT * INTO previous FROM sentinela_pcdf_local.entregas_pacote WHERE digest=package_hash;
  IF FOUND THEN
    result := previous.resultado;
    run := previous.execucao_id;
    reason := result->>'reason';
    replay := reason IS NULL;
  ELSE
    SELECT id INTO extraction FROM sentinela.extracoes_origem WHERE fonte='PCDF' AND sha256_xml=xml_hash;
    IF extraction IS NOT NULL AND NOT EXISTS (SELECT FROM sentinela.extracoes_origem WHERE id=extraction
      AND nome_xml=source_data->>'nome' AND tamanho_bytes=(source_data->>'bytes')::bigint)
    THEN reason := 'extracao_divergente'; END IF;

    -- Compare the 18 original strings, with no trim or NULL coercion.
    WITH incoming AS (
      SELECT r.raw,r.derived,r.diagnostics,r.ordinal,r.raw->>'linha_origem_id' AS line_id,
        (r.raw->>'linha_xml')::bigint AS pos, (SELECT jsonb_object_agg(k, (r.raw || coalesce(r.origin,'{}'::jsonb))->k)
          FROM unnest(original_keys) k) AS originals
      FROM jsonb_to_recordset(batch->'rows') r(raw jsonb, derived jsonb, diagnostics jsonb, ordinal int, origin jsonb)
    )
    SELECT jsonb_agg(to_jsonb(i) || jsonb_build_object('existing',o.id,'conflict',o.id IS NOT NULL AND
      (o.extracao_id IS DISTINCT FROM extraction OR o.linha_origem_id IS DISTINCT FROM i.line_id OR o.linha_xml IS DISTINCT FROM i.pos
        OR NOT to_jsonb(o) @> i.originals)) ORDER BY i.ordinal) INTO plan
    FROM incoming i
    LEFT JOIN sentinela.linhas_origem o ON o.linha_origem_id=i.line_id
      OR (o.extracao_id=extraction AND o.aba_origem='NATUREZAS' AND o.linha_xml=i.pos);

    IF EXISTS (SELECT FROM jsonb_array_elements(plan) r WHERE
        r->>'line_id' IS DISTINCT FROM encode(sha256(convert_to(format('["pcdf-linha-v1","%s","NATUREZAS",%s]',
          xml_hash,r->>'pos'),'UTF8')),'hex')
        OR NOT coalesce((r->>'pos')::bigint > 0 AND (r->>'ordinal')::int BETWEEN 1 AND records,false)
        OR EXISTS (SELECT FROM jsonb_each(r->'originals') v WHERE jsonb_typeof(v.value) <> 'string'))
    THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT FROM jsonb_array_elements(plan) r WHERE r @> '{"conflict":true}') THEN
      reason := coalesce(reason,'origem_divergente_ou_avulsa');
    ELSIF jsonb_array_length(plan) <> records
      OR (SELECT count(DISTINCT (r->>'ordinal')) FROM jsonb_array_elements(plan) r) <> records
      OR (SELECT count(DISTINCT (r->>'line_id')) FROM jsonb_array_elements(plan) r) <> records
      OR (SELECT count(DISTINCT (r->>'pos')) FROM jsonb_array_elements(plan) r) <> records
    THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;


    -- Only the authenticated v1 envelope may adopt a byte-identical legacy receipt.
    SELECT l.* INTO old_lot FROM sentinela.lotes_importacao l WHERE l.sha256_arquivo=csv_hash
      AND (l.extracao_id=extraction OR (p_contract='1.0' AND l.versao_contrato='1.0'));
    IF FOUND AND reason IS NULL THEN
      IF p_contract='1.0' AND old_lot.versao_contrato='1.0' AND old_lot.extracao_id=extraction
        AND old_lot.referencia_arquivo='csv:sha256:'||csv_hash AND old_lot.competencia=month_start
        AND old_lot.tamanho_bytes=octet_length(p_parts[2]) AND old_lot.versao_tratamento=treatment
        AND old_lot.linhas_esperadas=records THEN
        SELECT e.id,e.pendencias_detectadas INTO run,issues FROM sentinela.execucoes_importacao e
        WHERE e.lote_id=old_lot.id AND e.status='concluida' AND e.tentativa=1
          AND e.linhas_lidas=records
          AND (SELECT count(*) FROM sentinela.linhas_staging s
            JOIN jsonb_array_elements(plan) r ON (r->>'ordinal')::int=s.registro_csv
              AND (r->>'existing')::uuid=s.linha_origem_id AND r->'raw'=s.campos_csv
            WHERE s.execucao_id=e.id)=records;
      END IF;
      IF run IS NULL THEN reason := 'csv_ja_recebido_com_outro_vinculo';
      ELSE
        lot := old_lot.id;
        reused := records;
        replay := true;
      END IF;
    END IF;

    IF reason IS NOT NULL THEN
      result := jsonb_build_object('reason',reason);
    ELSE
      IF NOT replay THEN
        IF extraction IS NULL THEN
          INSERT INTO sentinela.extracoes_origem(fonte,nome_xml,sha256_xml,tamanho_bytes,referencia_arquivo,metodologia)
          VALUES ('PCDF',source_data->>'nome',xml_hash,(source_data->>'bytes')::bigint,'xml:sha256:'||xml_hash,'pcdf-csv-local-v1')
          RETURNING id INTO extraction;
        END IF;
        INSERT INTO sentinela.lotes_importacao(extracao_id,nome_arquivo,sha256_arquivo,tamanho_bytes,referencia_arquivo,
          versao_contrato,versao_tratamento,competencia,linhas_esperadas,solicitado_por)
        VALUES (extraction,csv_name,csv_hash,octet_length(p_parts[2]),'pcdf-pacote:sha256:'||package_hash,
          p_contract,treatment,month_start,records,actor.id) RETURNING id INTO lot;

        INSERT INTO sentinela.linhas_origem(extracao_id,linha_origem_id,aba_origem,linha_xml,versao_identificador,
          ano_registro,unidade_registro,numero_registro,ano_fato,data_inicio_fato_original,natureza_original,
          natureza_padronizada_pcdf,crime_tentado,cidade_endereco_original,ra_original,area_endereco_original,
          quadra_endereco_original,latitude_geo_original,longitude_geo_original,latitude_utm_original,
          longitude_utm_original,flagrante,unidade_apuracao)
        SELECT extraction,r->>'line_id','NATUREZAS',(r->>'pos')::bigint,'pcdf-linha-v1',
          o.ano_registro,o.unidade_registro,o.numero_registro,o.ano_fato,o.data_inicio_fato_original,o.natureza_original,
          o.natureza_padronizada_pcdf,o.crime_tentado,o.cidade_endereco_original,o.ra_original,o.area_endereco_original,
          o.quadra_endereco_original,o.latitude_geo_original,o.longitude_geo_original,o.latitude_utm_original,
          o.longitude_utm_original,o.flagrante,o.unidade_apuracao
        FROM jsonb_array_elements(plan) r
        CROSS JOIN LATERAL jsonb_populate_record(NULL::sentinela.linhas_origem,r->'originals') o
        WHERE r->>'existing' IS NULL;
        GET DIAGNOSTICS staged=ROW_COUNT;
        reused := records - staged;
        SELECT coalesce(sum(jsonb_array_length(r->'diagnostics')),0) INTO issues FROM jsonb_array_elements(plan) r;

        INSERT INTO sentinela.execucoes_importacao(lote_id,extracao_id,tentativa,solicitado_por,versao_importador,
          versao_validacao,status,linhas_lidas,linhas_processadas,linhas_bloqueadas,linhas_reenviadas,pendencias_detectadas,
          checkpoint_registro_csv,finalizado_em)
        VALUES (lot,extraction,1,actor.id,writer_version,writer_version,'concluida',
          records,records,records-reused,reused,issues,records,clock_timestamp()) RETURNING id INTO run;

        WITH known_candidates AS MATERIALIZED (
          SELECT DISTINCT s.derivados_efetivos->'candidate' AS candidate FROM sentinela.linhas_staging s
          WHERE s.extracao_id=extraction AND jsonb_typeof(s.derivados_efetivos->'candidate')='array'
        )
        INSERT INTO sentinela.linhas_staging(execucao_id,lote_id,extracao_id,linha_origem_id,registro_csv,
          campos_csv,derivados_efetivos,diagnosticos,estado)
        SELECT run,lot,extraction,o.id,(r->>'ordinal')::bigint,r->'raw',
          r->'derived' || jsonb_build_object('recepcao',CASE WHEN r->>'existing' IS NOT NULL THEN 'origem_reutilizada'
            WHEN k.candidate IS NOT NULL THEN 'nova_associacao_candidata_conhecida' ELSE 'nova_origem' END),
          r->'diagnostics',CASE WHEN r->>'existing' IS NULL THEN 'bloqueada' ELSE 'reenviada' END
        FROM jsonb_array_elements(plan) r
        JOIN sentinela.linhas_origem o ON o.extracao_id=extraction AND o.linha_origem_id=r->>'line_id'
        LEFT JOIN known_candidates k ON k.candidate=r->'derived'->'candidate';
        GET DIAGNOSTICS staged=ROW_COUNT;
        IF staged <> records THEN RAISE EXCEPTION USING ERRCODE='23514'; END IF;

        INSERT INTO sentinela.pendencias_revisao(linha_origem_id,campo,regra,versao_regra,valor_original,motivo,
          tipo,prioridade,efeito,dimensao_afetada)
        SELECT s.linha_origem_id,d.field,d.rule,writer_version,
          coalesce(s.campos_csv->d.field, to_jsonb(o)->d.field),d.rule,d.kind,d.priority,d.effect,
          CASE WHEN d.effect='bloqueia_dimensao' THEN d.kind END
        FROM sentinela.linhas_staging s JOIN sentinela.linhas_origem o ON o.id=s.linha_origem_id
        CROSS JOIN LATERAL jsonb_to_recordset(s.diagnosticos) d(field text,rule text,kind text,priority text,effect text)
        WHERE s.execucao_id=run
        ON CONFLICT (ocorrencia_id,linha_origem_id,campo,regra,versao_regra) DO NOTHING;
      END IF;
      result := jsonb_build_object('lot',lot,'run',run,'issues',issues,'records',records,'reused',reused);
    END IF;
    INSERT INTO sentinela_pcdf_local.entregas_pacote(digest,nomes,artefatos,execucao_id,resultado)
    VALUES (package_hash,p_names,p_parts,run,result);
  END IF;

  INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,execucao_id,depois,justificativa,request_id)
  VALUES ('servico','pcdf-local',CASE
    WHEN p_contract='1.0' AND reason IS NOT NULL THEN 'falha_pcdf'
    WHEN p_contract='1.0' AND replay THEN 'reenvio_pcdf'
    WHEN p_contract='1.0' THEN 'staging_pcdf'
    WHEN reason IS NOT NULL THEN 'revisao_pcdf_v2'
    WHEN replay THEN 'reenvio_pcdf_v2' ELSE 'staging_pcdf_v2' END,
    run, meta || result || jsonb_build_object('actor',actor.id,'account',p_account,'contrato',p_contract,'digest',package_hash),
    'Recepção sintética PCDF com proveniência verificada',p_request::text);
  RETURN result || jsonb_build_object('replay',replay);
END $$;

ALTER FUNCTION sentinela_pcdf_local.receive(uuid,jsonb,bytea,bytea) RENAME TO receive_v1_legacy;
REVOKE ALL ON FUNCTION sentinela_pcdf_local.receive_v1_legacy(uuid,jsonb,bytea,bytea)
 FROM PUBLIC,sentinela_local_admin,sentinela_local_operator;

CREATE FUNCTION sentinela_pcdf_local.receive(p_request uuid, p_delivery jsonb, p_csv bytea, p_manifest bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  names text[] := ARRAY['manifesto.json',p_delivery->'batch'->>'name'];
  parts bytea[] := ARRAY[p_manifest,p_csv];
  meta jsonb;
  outcome jsonb;
BEGIN
  -- Decide under the same lock as staging so a concurrent approved receipt cannot become a legacy replay.
  PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
  IF p_manifest IS NULL OR NOT EXISTS (SELECT FROM sentinela_pcdf_local.aprovacoes_pacote
    WHERE digest=sentinela_pcdf_local.pacote_digest(names,parts) AND contrato='1.0') THEN
    IF EXISTS (
      SELECT FROM sentinela_pcdf_local.entregas_pacote p
      JOIN sentinela.execucoes_importacao e ON e.id=p.execucao_id
      JOIN sentinela.lotes_importacao l ON l.id=e.lote_id
      WHERE l.versao_contrato='1.0' AND l.sha256_arquivo=encode(sha256(p_csv),'hex')
    ) THEN RAISE EXCEPTION USING ERRCODE='23505'; END IF;
    RETURN sentinela_pcdf_local.receive_v1_legacy(p_request,p_delivery,p_csv,p_manifest);
  END IF;
  SELECT depois INTO STRICT meta FROM sentinela.eventos_auditoria WHERE servico='pcdf-local'
    AND request_id=p_request::text AND acao='tentativa_pcdf';
  outcome := sentinela_pcdf_local.staging_pacote(p_request,meta->>'account','1.0',p_delivery,names,parts);
  IF outcome ? 'reason' THEN RETURN '{"review":true}'::jsonb; END IF;
  RETURN (meta - ARRAY['actor','role','account']) || (outcome - 'reused');
END $$;

CREATE FUNCTION sentinela_pcdf_local.receive_v2(p_request uuid, p_account text,
 p_delivery jsonb, p_names text[], p_parts bytea[])
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT sentinela_pcdf_local.staging_pacote(p_request,p_account,'2.0',p_delivery,p_names,p_parts)
$$;

ALTER FUNCTION sentinela_pcdf_local.pacote_digest(text[],bytea[]) OWNER TO sentinela_pcdf_owner;
ALTER FUNCTION sentinela_pcdf_local.staging_pacote(uuid,text,text,jsonb,text[],bytea[]) OWNER TO sentinela_pcdf_owner;
ALTER FUNCTION sentinela_pcdf_local.receive(uuid,jsonb,bytea,bytea) OWNER TO sentinela_pcdf_owner;
ALTER FUNCTION sentinela_pcdf_local.receive_v2(uuid,text,jsonb,text[],bytea[]) OWNER TO sentinela_pcdf_owner;
REVOKE ALL ON FUNCTION sentinela_pcdf_local.pacote_digest(text[],bytea[]),
 sentinela_pcdf_local.staging_pacote(uuid,text,text,jsonb,text[],bytea[]),
 sentinela_pcdf_local.receive(uuid,jsonb,bytea,bytea),
 sentinela_pcdf_local.receive_v2(uuid,text,jsonb,text[],bytea[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_local.receive(uuid,jsonb,bytea,bytea),
 sentinela_pcdf_local.receive_v2(uuid,text,jsonb,text[],bytea[]) TO sentinela_local_admin,sentinela_local_operator;
COMMIT;
