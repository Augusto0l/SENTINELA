-- Isolated qualification only. No operational privilege or trigger changes.
\set ON_ERROR_STOP on
\ir ../sandbox/sql/guard.sql
BEGIN;
CREATE SCHEMA sentinela_pcdf_lab;
REVOKE ALL ON SCHEMA sentinela_pcdf_lab FROM PUBLIC;
CREATE ROLE sentinela_pcdf_sbx_importer NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
GRANT USAGE ON SCHEMA sentinela,sentinela_pcdf_lab TO sentinela_pcdf_sbx_importer;
INSERT INTO sentinela.usuarios(id,nome_exibicao,perfil,ativo)
VALUES ('71000000-0000-4000-8000-000000000001','Solicitante sintético do ensaio PCDF','Operador',false);

GRANT SELECT,INSERT ON sentinela.extracoes_origem,sentinela.lotes_importacao,
 sentinela.execucoes_importacao,sentinela.linhas_origem,sentinela.linhas_staging,
 sentinela.pendencias_revisao TO sentinela_pcdf_sbx_importer;
GRANT INSERT ON sentinela.eventos_auditoria TO sentinela_pcdf_sbx_importer;
-- A validação de pendências da baseline consulta o perfil, mesmo com responsável nulo.
GRANT SELECT(id,perfil,ativo) ON sentinela.usuarios TO sentinela_pcdf_sbx_importer;
CREATE POLICY pcdf_lab_actor ON sentinela.usuarios FOR SELECT TO sentinela_pcdf_sbx_importer
 USING(id='71000000-0000-4000-8000-000000000001');
GRANT EXECUTE ON FUNCTION sentinela.carimbar_auditoria(),sentinela.validar_vinculos_evento(),
 sentinela.exigir_revisor_administrador(),sentinela.bloquear_autoria_manual_sem_auth()
 TO sentinela_pcdf_sbx_importer;
CREATE POLICY pcdf_lab_extraction ON sentinela.extracoes_origem TO sentinela_pcdf_sbx_importer
 USING(fonte='PCDF-SANDBOX') WITH CHECK(fonte='PCDF-SANDBOX');
CREATE POLICY pcdf_lab_batches ON sentinela.lotes_importacao TO sentinela_pcdf_sbx_importer
 USING(EXISTS(SELECT FROM sentinela.extracoes_origem e WHERE e.id=extracao_id))
 WITH CHECK(EXISTS(SELECT FROM sentinela.extracoes_origem e WHERE e.id=extracao_id)
 AND solicitado_por='71000000-0000-4000-8000-000000000001');
CREATE POLICY pcdf_lab_runs ON sentinela.execucoes_importacao TO sentinela_pcdf_sbx_importer
 USING(EXISTS(SELECT FROM sentinela.lotes_importacao l WHERE l.id=lote_id))
 WITH CHECK(EXISTS(SELECT FROM sentinela.lotes_importacao l WHERE l.id=lote_id)
 AND solicitado_por='71000000-0000-4000-8000-000000000001' AND tentativa=1);
CREATE POLICY pcdf_lab_lines ON sentinela.linhas_origem TO sentinela_pcdf_sbx_importer
 USING(EXISTS(SELECT FROM sentinela.extracoes_origem e WHERE e.id=extracao_id))
 WITH CHECK(EXISTS(SELECT FROM sentinela.extracoes_origem e WHERE e.id=extracao_id));
CREATE POLICY pcdf_lab_staging ON sentinela.linhas_staging TO sentinela_pcdf_sbx_importer
 USING(EXISTS(SELECT FROM sentinela.execucoes_importacao e WHERE e.id=execucao_id))
 WITH CHECK(EXISTS(SELECT FROM sentinela.execucoes_importacao e WHERE e.id=execucao_id)
 AND estado='bloqueada' AND ocorrencia_id IS NULL AND associacao_id IS NULL);
CREATE POLICY pcdf_lab_issues ON sentinela.pendencias_revisao TO sentinela_pcdf_sbx_importer
 USING(EXISTS(SELECT FROM sentinela.linhas_origem l WHERE l.id=pendencias_revisao.linha_origem_id))
 WITH CHECK(EXISTS(SELECT FROM sentinela.linhas_origem l WHERE l.id=pendencias_revisao.linha_origem_id)
 AND status='aberta' AND responsavel_id IS NULL AND ocorrencia_id IS NULL AND associacao_id IS NULL);
CREATE POLICY pcdf_lab_audit ON sentinela.eventos_auditoria FOR INSERT TO sentinela_pcdf_sbx_importer
 WITH CHECK(ator_tipo='servico' AND servico='pcdf-sandbox' AND acao='staging_pcdf'
 AND EXISTS(SELECT FROM sentinela.execucoes_importacao e WHERE e.id=execucao_id)
 AND ocorrencia_id IS NULL AND linha_origem_id IS NULL AND pendencia_id IS NULL AND correcao_id IS NULL);

CREATE FUNCTION sentinela_pcdf_lab.stage(batch jsonb, xml_sha text, xml_size bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
 actor constant uuid := '71000000-0000-4000-8000-000000000001';
 extraction uuid;
 lot uuid;
 run uuid;
 records bigint := jsonb_array_length(batch->'rows');
 issues bigint;
 candidates bigint;
BEGIN
 IF current_user<>'sentinela_pcdf_sbx_importer' OR current_database()<>'sentinela_rls_sandbox'
 OR inet_server_port()<>55432 OR host(inet_server_addr())<>'127.0.0.1'
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Disposable PCDF stage only'; END IF;
 -- ponytail: serialize staging, promotion and review in the lab; partition locks if measured throughput requires it.
 PERFORM pg_advisory_xact_lock(hashtextextended('pcdf-sandbox:promotion',0));
 INSERT INTO sentinela.extracoes_origem(fonte,nome_xml,sha256_xml,tamanho_bytes,referencia_arquivo)
 VALUES ('PCDF-SANDBOX','synthetic.xml',xml_sha,xml_size,'sandbox-evidence/synthetic.xml')
 ON CONFLICT (fonte,sha256_xml) DO NOTHING;
 SELECT id INTO STRICT extraction FROM sentinela.extracoes_origem
 WHERE fonte='PCDF-SANDBOX' AND sha256_xml=xml_sha AND tamanho_bytes=xml_size;
 SELECT l.id,e.id INTO lot,run FROM sentinela.lotes_importacao l
 JOIN sentinela.execucoes_importacao e ON e.lote_id=l.id
 WHERE l.extracao_id=extraction AND l.sha256_arquivo=batch->>'sha256';
 IF FOUND THEN
   IF NOT EXISTS(SELECT FROM sentinela.lotes_importacao
     WHERE id=lot AND competencia=((batch->>'month')||'-01')::date
     AND tamanho_bytes=(batch->>'size')::bigint AND linhas_esperadas=records)
   THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='Replay context mismatch'; END IF;
   RETURN jsonb_build_object('replay',true,'lot',lot,'run',run);
 END IF;
 SELECT coalesce(sum(jsonb_array_length(r.diagnostics)),0),count(DISTINCT r.derived->'candidate')
 FILTER(WHERE r.derived->'candidate'<>'null'::jsonb)
 INTO issues,candidates
 FROM jsonb_to_recordset(batch->'rows') r(derived jsonb,diagnostics jsonb);
 INSERT INTO sentinela.lotes_importacao(extracao_id,nome_arquivo,sha256_arquivo,tamanho_bytes,
   referencia_arquivo,versao_contrato,versao_tratamento,competencia,linhas_esperadas,solicitado_por)
 VALUES (extraction,'pcdf_naturezas_'||(batch->>'month')||'.csv',batch->>'sha256',(batch->>'size')::bigint,
   'sandbox-evidence/'||(batch->>'sha256')||'.csv','candidato-pcdf-v1',
   coalesce(batch->>'treatment','sem-registros'),((batch->>'month')||'-01')::date,records,actor)
 RETURNING id INTO lot;
 INSERT INTO sentinela.execucoes_importacao(lote_id,extracao_id,tentativa,solicitado_por,
   versao_importador,versao_validacao,status,linhas_lidas,linhas_processadas,linhas_bloqueadas,
   pendencias_detectadas,checkpoint_registro_csv,finalizado_em)
 VALUES(lot,extraction,1,actor,'pcdf-sandbox-v1','pcdf-candidato-v1','concluida',records,
   records,records,issues,records,clock_timestamp())
 RETURNING id INTO run;
 INSERT INTO sentinela.linhas_origem(extracao_id,linha_origem_id,aba_origem,linha_xml,versao_identificador,
   ano_registro,unidade_registro,numero_registro,ano_fato,data_inicio_fato_original,flagrante,natureza_original,
   crime_tentado,natureza_padronizada_pcdf,cidade_endereco_original,ra_original,area_endereco_original,
   quadra_endereco_original,latitude_geo_original,longitude_geo_original,latitude_utm_original,
   longitude_utm_original,unidade_apuracao)
 SELECT extraction,raw->>'linha_origem_id',raw->>'aba_origem',(raw->>'linha_xml')::bigint,'csv-sandbox',
   raw->>'ano_registro',raw->>'unidade_registro',raw->>'numero_registro',raw->>'ano_fato',
   raw->>'data_inicio_fato_original',raw->>'flagrante',raw->>'natureza_original',raw->>'crime_tentado',
   raw->>'natureza_padronizada_pcdf',raw->>'cidade_endereco_original',raw->>'ra_original',
   raw->>'area_endereco_original',raw->>'quadra_endereco_original',raw->>'latitude_geo_original',
   raw->>'longitude_geo_original',raw->>'latitude_utm_original',raw->>'longitude_utm_original',raw->>'unidade_apuracao'
 FROM jsonb_to_recordset(batch->'rows') r(raw jsonb);
 INSERT INTO sentinela.linhas_staging(execucao_id,lote_id,extracao_id,linha_origem_id,registro_csv,
   campos_csv,derivados_efetivos,diagnosticos,estado)
 SELECT run,lot,extraction,l.id,r.ordinal,r.raw,r.derived,r.diagnostics,'bloqueada'
 FROM jsonb_to_recordset(batch->'rows') r(ordinal bigint,raw jsonb,derived jsonb,diagnostics jsonb)
 JOIN sentinela.linhas_origem l ON l.extracao_id=extraction AND l.linha_origem_id=r.raw->>'linha_origem_id';
 INSERT INTO sentinela.pendencias_revisao(linha_origem_id,campo,regra,versao_regra,valor_original,
   motivo,tipo,prioridade,efeito,dimensao_afetada)
 SELECT s.linha_origem_id,d.field,d.rule,'pcdf-candidato-v1',s.campos_csv->d.field,
   d.rule,d.kind,d.priority,d.effect,CASE WHEN d.effect='bloqueia_dimensao' THEN d.kind END
 FROM sentinela.linhas_staging s
 CROSS JOIN LATERAL jsonb_to_recordset(s.diagnosticos) d(field text,rule text,kind text,priority text,effect text)
 WHERE s.execucao_id=run;
 INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,execucao_id,depois,justificativa)
 VALUES('servico','pcdf-sandbox','staging_pcdf',run,jsonb_build_object('records',records,'issues',issues),
 'Recebimento e staging sintético');
 RETURN jsonb_build_object('replay',false,'lot',lot,'run',run,'records',records,'issues',issues,'candidates',candidates);
END;
$$;
REVOKE ALL ON FUNCTION sentinela_pcdf_lab.stage(jsonb,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_lab.stage(jsonb,text,bigint) TO sentinela_pcdf_sbx_importer;

CREATE FUNCTION sentinela_pcdf_lab.review(p_tipo text, p_prioridade text, p_limite integer)
RETURNS TABLE (id uuid,tipo text,prioridade text,campo text,motivo text,status text,valor_original jsonb)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF current_user<>'sentinela_pcdf_sbx_importer' OR current_database()<>'sentinela_rls_sandbox'
 OR inet_server_port()<>55432 OR host(inet_server_addr())<>'127.0.0.1'
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Disposable PCDF review only'; END IF;
 IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 100
 OR p_tipo NOT IN ('identificacao','datas_horarios','classificacao','endereco_ra','coordenadas','informacoes_policiais','proveniencia')
 OR p_prioridade NOT IN ('alta','media','baixa')
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid review filter'; END IF;
 RETURN QUERY SELECT p.id,p.tipo,p.prioridade,p.campo::text,p.motivo::text,p.status,p.valor_original
 FROM sentinela.pendencias_revisao p
 WHERE (p_tipo IS NULL OR p.tipo=p_tipo) AND (p_prioridade IS NULL OR p.prioridade=p_prioridade)
 ORDER BY CASE p.prioridade WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,p.detectada_em,p.id
 LIMIT p_limite;
END;
$$;
REVOKE ALL ON FUNCTION sentinela_pcdf_lab.review(text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_lab.review(text,text,integer) TO sentinela_pcdf_sbx_importer;
COMMIT;
