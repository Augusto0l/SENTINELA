-- Install only in the attested private PCDF database. No hosted migration.
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'sentinela_pcdf_local' OR host(inet_server_addr()) <> '127.0.0.1'
    OR inet_server_port() <> 55484 OR current_setting('sentinela.sandbox_uuid', true) IS NULL
  THEN RAISE EXCEPTION 'PCDF local database required'; END IF;
END
$guard$;

CREATE ROLE sentinela_local_admin LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
CREATE ROLE sentinela_local_operator LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
CREATE ROLE sentinela_local_analyst LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
CREATE ROLE sentinela_pcdf_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
GRANT CONNECT ON DATABASE sentinela_pcdf_local TO sentinela_local_admin, sentinela_local_operator, sentinela_local_analyst;

CREATE SCHEMA sentinela_pcdf_local;
REVOKE ALL ON SCHEMA sentinela_pcdf_local FROM PUBLIC;
GRANT USAGE ON SCHEMA sentinela, sentinela_pcdf_local TO sentinela_pcdf_owner;
GRANT USAGE ON SCHEMA sentinela_pcdf_local TO sentinela_local_admin, sentinela_local_operator;

-- A CSV-only receipt does not imply an XML filename or checksum.
ALTER TABLE sentinela.extracoes_origem ALTER nome_xml DROP NOT NULL, ALTER sha256_xml DROP NOT NULL;
ALTER TABLE sentinela.extracoes_origem ADD CONSTRAINT extracao_xml_ou_csv CHECK (
  (nome_xml IS NOT NULL AND sha256_xml IS NOT NULL)
  OR (nome_xml IS NULL AND sha256_xml IS NULL AND fonte='PCDF' AND metodologia='pcdf-csv-local-v1'
      AND referencia_arquivo ~ '^csv:sha256:[0-9a-f]{64}$'));
CREATE UNIQUE INDEX pcdf_local_csv_recebido ON sentinela.lotes_importacao(sha256_arquivo)
 WHERE versao_contrato='1.0';
CREATE UNIQUE INDEX pcdf_local_auditoria_acao ON sentinela.eventos_auditoria(request_id,acao)
 WHERE servico='pcdf-local';
CREATE UNIQUE INDEX pcdf_local_auditoria_resultado ON sentinela.eventos_auditoria(request_id)
 WHERE servico='pcdf-local' AND acao IN ('staging_pcdf','reenvio_pcdf','falha_pcdf');

INSERT INTO sentinela.usuarios(id,nome_exibicao,perfil,ativo) VALUES
 ('7d5a25df-d61a-43ae-9f09-7be430855aad','Administrador local','Administrador',true),
 ('6ca6f86c-56da-4af8-8249-3291fb263c52','Operador local','Operador',true);

GRANT SELECT ON sentinela.usuarios, sentinela.perfil_permissoes TO sentinela_pcdf_owner;
GRANT SELECT,INSERT ON sentinela.extracoes_origem,sentinela.lotes_importacao,sentinela.execucoes_importacao,
 sentinela.linhas_origem,sentinela.linhas_staging,sentinela.pendencias_revisao,sentinela.eventos_auditoria
 TO sentinela_pcdf_owner;
GRANT EXECUTE ON FUNCTION sentinela.exigir_revisor_administrador(), sentinela.validar_vinculos_evento(),
 sentinela.carimbar_auditoria() TO sentinela_pcdf_owner;

CREATE POLICY pcdf_local_users ON sentinela.usuarios FOR SELECT TO sentinela_pcdf_owner USING (
 (id='7d5a25df-d61a-43ae-9f09-7be430855aad' AND session_user='sentinela_local_admin' AND perfil='Administrador')
 OR (id='6ca6f86c-56da-4af8-8249-3291fb263c52' AND session_user='sentinela_local_operator' AND perfil='Operador'));
CREATE POLICY pcdf_local_permissions ON sentinela.perfil_permissoes FOR SELECT TO sentinela_pcdf_owner
 USING (acao='importar');
CREATE POLICY pcdf_local_extractions ON sentinela.extracoes_origem TO sentinela_pcdf_owner
 USING (fonte='PCDF' AND metodologia='pcdf-csv-local-v1');
CREATE POLICY pcdf_local_lots_read ON sentinela.lotes_importacao FOR SELECT TO sentinela_pcdf_owner
 USING (versao_contrato='1.0' AND EXISTS (SELECT FROM sentinela.extracoes_origem x WHERE x.id=extracao_id));
CREATE POLICY pcdf_local_lots_insert ON sentinela.lotes_importacao FOR INSERT TO sentinela_pcdf_owner
 WITH CHECK (versao_contrato='1.0' AND EXISTS (SELECT FROM sentinela.extracoes_origem x WHERE x.id=extracao_id)
 AND EXISTS (SELECT FROM sentinela.usuarios u WHERE u.id=solicitado_por AND u.ativo));
CREATE POLICY pcdf_local_runs_read ON sentinela.execucoes_importacao FOR SELECT TO sentinela_pcdf_owner
 USING (versao_importador='pcdf-local-v1' AND EXISTS (SELECT FROM sentinela.lotes_importacao l WHERE l.id=lote_id));
CREATE POLICY pcdf_local_runs_insert ON sentinela.execucoes_importacao FOR INSERT TO sentinela_pcdf_owner
 WITH CHECK (versao_importador='pcdf-local-v1' AND status='concluida' AND tentativa=1 AND linhas_aptas=0
 AND ocorrencias_criadas=0 AND associacoes_criadas=0
 AND EXISTS (SELECT FROM sentinela.lotes_importacao l WHERE l.id=lote_id AND l.extracao_id=execucoes_importacao.extracao_id)
 AND EXISTS (SELECT FROM sentinela.usuarios u WHERE u.id=solicitado_por AND u.ativo));
CREATE POLICY pcdf_local_origins ON sentinela.linhas_origem TO sentinela_pcdf_owner USING (
 versao_identificador='pcdf-linha-v1' AND aba_origem='NATUREZAS'
 AND EXISTS (SELECT FROM sentinela.extracoes_origem x WHERE x.id=extracao_id));
CREATE POLICY pcdf_local_staging ON sentinela.linhas_staging TO sentinela_pcdf_owner USING (
 estado='bloqueada' AND ocorrencia_id IS NULL AND associacao_id IS NULL
 AND EXISTS (SELECT FROM sentinela.execucoes_importacao e WHERE e.id=execucao_id));
CREATE POLICY pcdf_local_issues ON sentinela.pendencias_revisao TO sentinela_pcdf_owner USING (
 status='aberta' AND responsavel_id IS NULL AND ocorrencia_id IS NULL
 AND EXISTS (SELECT FROM sentinela.linhas_origem o WHERE o.id=pendencias_revisao.linha_origem_id));
CREATE POLICY pcdf_local_audit ON sentinela.eventos_auditoria TO sentinela_pcdf_owner USING (
 ator_tipo='servico' AND servico='pcdf-local' AND ocorrencia_id IS NULL AND linha_origem_id IS NULL
 AND pendencia_id IS NULL AND correcao_id IS NULL
 AND (execucao_id IS NULL OR EXISTS (SELECT FROM sentinela.execucoes_importacao e WHERE e.id=execucao_id)));

CREATE FUNCTION sentinela_pcdf_local.actor()
RETURNS sentinela.usuarios LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor sentinela.usuarios;
BEGIN
  SELECT u.* INTO actor FROM sentinela.usuarios u
  JOIN sentinela.perfil_permissoes p ON p.perfil=u.perfil AND p.acao='importar' WHERE u.ativo;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
  RETURN actor;
END $$;

CREATE FUNCTION sentinela_pcdf_local.preflight()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor sentinela.usuarios := sentinela_pcdf_local.actor();
BEGIN
  IF (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace
      AND relkind='r' AND relrowsecurity AND relforcerowsecurity) <> 19
    OR NOT EXISTS (SELECT FROM pg_extension WHERE extname='postgis' AND extversion='3.6.2')
    OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname=current_user AND NOT (rolcanlogin OR rolsuper OR rolbypassrls
      OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication))
    OR EXISTS (SELECT FROM pg_auth_members m WHERE current_user::regrole IN (m.roleid,m.member))
    OR EXISTS (SELECT FROM unnest(ARRAY['usuarios','perfil_permissoes','extracoes_origem','lotes_importacao',
       'execucoes_importacao','linhas_origem','linhas_staging','pendencias_revisao','eventos_auditoria']) t
      WHERE NOT row_security_active(('sentinela.' || t)::regclass))
    OR NOT has_table_privilege(current_user,'sentinela.eventos_auditoria','INSERT')
    OR NOT has_table_privilege(current_user,'sentinela.linhas_origem','INSERT')
    OR NOT has_table_privilege(current_user,'sentinela.linhas_staging','INSERT')
    OR has_table_privilege(current_user,'sentinela.ocorrencias','INSERT,UPDATE,DELETE,TRUNCATE')
  THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
  RETURN actor.perfil;
END $$;

CREATE FUNCTION sentinela_pcdf_local.attempt(request uuid, account text, meta jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor sentinela.usuarios := sentinela_pcdf_local.actor();
BEGIN
  IF account IS NULL OR account !~ '^[0-9a-f]{64}$' OR request IS NULL
    OR NOT coalesce(meta ?& ARRAY['name','month','sha256','bytes','manifestSha','records'],false)
    OR meta->>'name' IS DISTINCT FROM 'pcdf_naturezas_' || (meta->>'month') || '.csv'
    OR NOT coalesce(meta->>'sha256' ~ '^[0-9a-f]{64}$' AND meta->>'month' ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
     AND (meta->>'bytes')::bigint BETWEEN 1 AND 16777216 AND (meta->>'records')::bigint BETWEEN 1 AND 10000
     AND (meta->>'manifestSha' IS NULL OR meta->>'manifestSha' ~ '^[0-9a-f]{64}$'),false)
  THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
  INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,depois,justificativa,request_id)
  VALUES ('servico','pcdf-local','tentativa_pcdf',meta || jsonb_build_object('actor',actor.id,
    'role',actor.perfil,'account',account),'Confirmacao pela interface ou API',request::text);
END $$;

CREATE FUNCTION sentinela_pcdf_local.receive(request uuid, delivery jsonb, content bytea, manifest_bytes bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  actor sentinela.usuarios := sentinela_pcdf_local.actor();
  meta jsonb;
  batch jsonb := delivery->'batch';
  source_data jsonb := delivery->'source';
  file_hash text := encode(sha256(content),'hex');
  manifest_hash text := encode(sha256(manifest_bytes),'hex');
  month_start date := ((batch->>'month') || '-01')::date;
  records bigint := jsonb_array_length(batch->'rows');
  extraction uuid;
  lot uuid;
  run uuid;
  original_count bigint;
  staging_count bigint;
  issues bigint;
  receipt jsonb;
  history_metadata jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
  SELECT depois INTO STRICT meta FROM sentinela.eventos_auditoria
   WHERE servico='pcdf-local' AND request_id=request::text AND acao='tentativa_pcdf' AND depois->>'actor'=actor.id::text;
  IF EXISTS (SELECT FROM sentinela.eventos_auditoria WHERE servico='pcdf-local' AND request_id=request::text
     AND acao<>'tentativa_pcdf')
    OR file_hash IS NULL OR file_hash IS DISTINCT FROM meta->>'sha256' OR file_hash IS DISTINCT FROM batch->>'sha256'
    OR octet_length(content) IS DISTINCT FROM (meta->>'bytes')::int OR batch->'size' IS DISTINCT FROM meta->'bytes'
    OR manifest_hash IS DISTINCT FROM meta->>'manifestSha' OR manifest_hash IS DISTINCT FROM delivery->>'manifestSha'
    OR batch->'name' IS DISTINCT FROM meta->'name' OR batch->'month' IS DISTINCT FROM meta->'month'
    OR records IS DISTINCT FROM (meta->>'records')::bigint
    OR (manifest_bytes IS NOT NULL AND (octet_length(manifest_bytes) NOT BETWEEN 1 AND 1048576
        OR convert_from(manifest_bytes,'UTF8')::jsonb IS DISTINCT FROM delivery->'manifest'
        OR delivery->'manifest'->'fonte' IS DISTINCT FROM source_data))
    OR (manifest_bytes IS NULL AND (source_data IS DISTINCT FROM 'null'::jsonb
        OR delivery->'manifest' IS DISTINCT FROM 'null'::jsonb))
  THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;

  SELECT l.id,e.id,e.pendencias_detectadas INTO lot,run,issues
  FROM sentinela.lotes_importacao l JOIN sentinela.execucoes_importacao e ON e.lote_id=l.id AND e.status='concluida'
  WHERE l.sha256_arquivo=file_hash;
  IF FOUND THEN
    IF NOT EXISTS (SELECT FROM sentinela.lotes_importacao WHERE id=lot AND competencia=month_start
      AND linhas_esperadas=records AND tamanho_bytes=octet_length(content) AND versao_tratamento=batch->>'treatment')
    THEN RAISE EXCEPTION USING ERRCODE='23505'; END IF;
    receipt := jsonb_build_object('lot',lot,'run',run,'records',records,'issues',issues,'replay',true);
  ELSE
    IF manifest_bytes IS NOT NULL THEN
      INSERT INTO sentinela.extracoes_origem(fonte,nome_xml,sha256_xml,tamanho_bytes,referencia_arquivo,metodologia)
      VALUES ('PCDF',source_data->>'nome',source_data->>'sha256',(source_data->>'bytes')::bigint,
       'xml:sha256:' || (source_data->>'sha256'),'pcdf-csv-local-v1')
      ON CONFLICT (fonte,sha256_xml) DO NOTHING;
      SELECT id INTO extraction FROM sentinela.extracoes_origem
       WHERE sha256_xml=source_data->>'sha256' AND nome_xml=source_data->>'nome'
       AND tamanho_bytes=(source_data->>'bytes')::bigint;
      IF extraction IS NULL OR EXISTS (SELECT FROM sentinela.lotes_importacao
          WHERE extracao_id=extraction AND competencia=month_start)
      THEN RAISE EXCEPTION USING ERRCODE='23505'; END IF;
    ELSE
      INSERT INTO sentinela.extracoes_origem(fonte,tamanho_bytes,referencia_arquivo,metodologia)
      VALUES ('PCDF',octet_length(content),'csv:sha256:' || file_hash,'pcdf-csv-local-v1') RETURNING id INTO extraction;
    END IF;

    INSERT INTO sentinela.lotes_importacao(extracao_id,nome_arquivo,sha256_arquivo,tamanho_bytes,
     referencia_arquivo,versao_contrato,versao_tratamento,competencia,linhas_esperadas,solicitado_por)
    VALUES (extraction,batch->>'name',file_hash,octet_length(content),
     'csv:sha256:' || file_hash,'1.0',batch->>'treatment',month_start,records,actor.id) RETURNING id INTO lot;

    INSERT INTO sentinela.linhas_origem(extracao_id,linha_origem_id,aba_origem,linha_xml,versao_identificador,
     ano_registro,unidade_registro,numero_registro,ano_fato,data_inicio_fato_original,natureza_original,
     natureza_padronizada_pcdf,crime_tentado,cidade_endereco_original,ra_original,area_endereco_original,
     quadra_endereco_original,latitude_geo_original,longitude_geo_original,latitude_utm_original,
     longitude_utm_original,flagrante,unidade_apuracao)
    SELECT extraction,o.linha_origem_id,o.aba_origem,o.linha_xml,'pcdf-linha-v1',
     o.ano_registro,o.unidade_registro,o.numero_registro,o.ano_fato,o.data_inicio_fato_original,o.natureza_original,
     o.natureza_padronizada_pcdf,o.crime_tentado,o.cidade_endereco_original,o.ra_original,o.area_endereco_original,
     o.quadra_endereco_original,o.latitude_geo_original,o.longitude_geo_original,o.latitude_utm_original,
     o.longitude_utm_original,o.flagrante,o.unidade_apuracao
    FROM jsonb_to_recordset(batch->'rows') r(raw jsonb)
    CROSS JOIN LATERAL jsonb_populate_record(NULL::sentinela.linhas_origem,r.raw) o;
    GET DIAGNOSTICS original_count=ROW_COUNT;

    SELECT sum(jsonb_array_length(r.diagnostics)) INTO issues
     FROM jsonb_to_recordset(batch->'rows') r(diagnostics jsonb);
    INSERT INTO sentinela.execucoes_importacao(lote_id,extracao_id,tentativa,solicitado_por,versao_importador,
     versao_validacao,status,linhas_lidas,linhas_processadas,linhas_bloqueadas,pendencias_detectadas,checkpoint_registro_csv,finalizado_em)
    VALUES (lot,extraction,1,actor.id,'pcdf-local-v1','pcdf-local-v1','concluida',
     records,records,records,issues,records,clock_timestamp()) RETURNING id INTO run;

    INSERT INTO sentinela.linhas_staging(execucao_id,lote_id,extracao_id,linha_origem_id,registro_csv,
     campos_csv,derivados_efetivos,diagnosticos,estado)
    SELECT run,lot,extraction,o.id,r.ordinal,r.raw,r.derived,r.diagnostics,'bloqueada'
    FROM jsonb_to_recordset(batch->'rows') r(ordinal bigint,raw jsonb,derived jsonb,diagnostics jsonb)
    JOIN sentinela.linhas_origem o ON o.extracao_id=extraction AND o.linha_origem_id=r.raw->>'linha_origem_id';
    GET DIAGNOSTICS staging_count=ROW_COUNT;
    IF original_count <> records OR staging_count <> records THEN RAISE EXCEPTION USING ERRCODE='23514'; END IF;

    INSERT INTO sentinela.pendencias_revisao(linha_origem_id,campo,regra,versao_regra,valor_original,motivo,
     tipo,prioridade,efeito,dimensao_afetada)
    SELECT s.linha_origem_id,d.field,d.rule,'pcdf-local-v1',s.campos_csv->d.field,d.rule,d.kind,d.priority,
     d.effect,CASE WHEN d.effect='bloqueia_dimensao' THEN d.kind END
    FROM sentinela.linhas_staging s
    CROSS JOIN LATERAL jsonb_to_recordset(s.diagnosticos) d(field text,rule text,kind text,priority text,effect text)
    WHERE s.execucao_id=run;
    GET DIAGNOSTICS staging_count=ROW_COUNT;
    IF staging_count <> issues THEN RAISE EXCEPTION USING ERRCODE='23514'; END IF;
    receipt := jsonb_build_object('lot',lot,'run',run,'records',records,'issues',issues,'replay',false);
  END IF;

  history_metadata := meta - ARRAY['actor','role','account'] || receipt;
  INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,execucao_id,depois,justificativa,request_id)
  VALUES ('servico','pcdf-local',CASE WHEN (receipt->>'replay')::boolean THEN 'reenvio_pcdf' ELSE 'staging_pcdf' END,
   run,history_metadata || jsonb_build_object('actor',actor.id,'account',meta->>'account','manifesto',delivery->'manifest',
     'proveniencia',CASE WHEN manifest_bytes IS NULL THEN 'identidade_declarada_no_csv' ELSE 'identidade_conferida_com_manifesto' END),
   'Recepcao em origem e staging',request::text);
  RETURN history_metadata;
END $$;

CREATE FUNCTION sentinela_pcdf_local.fail(request uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor sentinela.usuarios := sentinela_pcdf_local.actor();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
  INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,depois,justificativa,request_id)
  SELECT 'servico','pcdf-local','falha_pcdf',a.depois,'Transacao de recepcao revertida',request::text
  FROM sentinela.eventos_auditoria a WHERE a.servico='pcdf-local' AND a.request_id=request::text
    AND a.acao='tentativa_pcdf' AND a.depois->>'actor'=actor.id::text
    AND NOT EXISTS(SELECT FROM sentinela.eventos_auditoria b WHERE b.servico=a.servico
       AND b.request_id=a.request_id AND b.acao<>'tentativa_pcdf');
END $$;

CREATE FUNCTION sentinela_pcdf_local.history()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  PERFORM sentinela_pcdf_local.actor();
  RETURN (SELECT coalesce(jsonb_agg(q.entry ORDER BY q.registrado_em DESC,q.request_id),'[]'::jsonb)
   FROM (SELECT a.registrado_em,a.request_id,
     (a.depois - ARRAY['actor','account']) || jsonb_build_object('request',a.request_id,'at',a.registrado_em,
       'lot',result.depois->'lot','status',CASE result.acao WHEN 'staging_pcdf' THEN 'concluida'
        WHEN 'reenvio_pcdf' THEN 'reenvio' WHEN 'falha_pcdf' THEN 'falhou' ELSE 'recebida' END) AS entry
     FROM sentinela.eventos_auditoria a
     LEFT JOIN sentinela.eventos_auditoria result ON result.servico=a.servico AND result.request_id=a.request_id
        AND result.acao IN ('staging_pcdf','reenvio_pcdf','falha_pcdf')
     WHERE a.servico='pcdf-local' AND a.acao='tentativa_pcdf'
     ORDER BY a.registrado_em DESC,a.request_id LIMIT 100) q);
END $$;

ALTER FUNCTION sentinela_pcdf_local.preflight() OWNER TO sentinela_pcdf_owner;
ALTER FUNCTION sentinela_pcdf_local.attempt(uuid,text,jsonb) OWNER TO sentinela_pcdf_owner;
ALTER FUNCTION sentinela_pcdf_local.receive(uuid,jsonb,bytea,bytea) OWNER TO sentinela_pcdf_owner;
ALTER FUNCTION sentinela_pcdf_local.fail(uuid) OWNER TO sentinela_pcdf_owner;
ALTER FUNCTION sentinela_pcdf_local.history() OWNER TO sentinela_pcdf_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sentinela_pcdf_local FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_local.actor() TO sentinela_pcdf_owner;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_local.preflight(),sentinela_pcdf_local.attempt(uuid,text,jsonb),
 sentinela_pcdf_local.receive(uuid,jsonb,bytea,bytea),sentinela_pcdf_local.fail(uuid),sentinela_pcdf_local.history()
 TO sentinela_local_admin,sentinela_local_operator;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO sentinela_local_admin,sentinela_local_operator;
COMMIT;
