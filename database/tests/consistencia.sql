-- Regressao LOCAL, fixtures sinteticas somente, tudo revertido ao final.
-- Executar com psql -X -v ON_ERROR_STOP=1, superusuario de banco descartavel.
DO $$
BEGIN
  IF current_database() !~ '^sentinela_model_test(_[a-z0-9]+)?$'
    OR coalesce(host(inet_server_addr()), '127.0.0.1') NOT IN ('127.0.0.1', '::1') THEN
    RAISE EXCEPTION 'Teste permitido apenas em banco local sentinela_model_test[_sufixo].';
  END IF;
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'Fixtures exigem superusuario LOCAL para testar depois o papel sem BYPASSRLS.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sentinela_teste_sem_acesso') THEN
    RAISE EXCEPTION 'Role de teste ja existe; usar instancia descartavel limpa.';
  END IF;
END $$;
BEGIN;
CREATE TEMP TABLE teste_contexto (id integer);
CREATE FUNCTION pg_temp.esperar_erro(comando text, estado text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE ocorreu boolean := false; codigo text;
BEGIN
  BEGIN
    EXECUTE comando;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS codigo = RETURNED_SQLSTATE;
    IF codigo <> estado THEN
      RAISE EXCEPTION 'Esperado SQLSTATE %, recebido %: %', estado, codigo, SQLERRM;
    END IF;
    ocorreu := true;
  END;
  IF NOT ocorreu THEN RAISE EXCEPTION 'Operacao indevida foi aceita: %', comando; END IF;
END $$;

-- Isolamento EXCLUSIVO das fixtures pelo superusuario do banco local descartavel.
-- DDL transacional: nao ha flag/bypass de autenticacao disponivel para a aplicacao.
-- Testes de travas e auditoria ficam em bloco proprio abaixo, com protecoes reativadas.
ALTER TABLE sentinela.ocorrencias DISABLE TRIGGER escrita_correcao_bloqueada;
ALTER TABLE sentinela.ocorrencia_naturezas DISABLE TRIGGER escrita_correcao_bloqueada;
ALTER TABLE sentinela.linhas_staging DISABLE TRIGGER escrita_correcao_bloqueada;
ALTER TABLE sentinela.pendencias_revisao DISABLE TRIGGER escrita_correcao_bloqueada;
ALTER TABLE sentinela.historico_correcoes DISABLE TRIGGER escrita_correcao_bloqueada;
ALTER TABLE sentinela.ocorrencias DISABLE TRIGGER correcao_exige_historico;
ALTER TABLE sentinela.ocorrencia_naturezas DISABLE TRIGGER correcao_exige_historico;
ALTER TABLE sentinela.linhas_staging DISABLE TRIGGER correcao_exige_historico;
ALTER TABLE sentinela.pendencias_revisao DISABLE TRIGGER pendencia_exige_evento;

DO $$
DECLARE
  admin_id uuid; operador_id uuid; extracao_id uuid; lote_id uuid; execucao_id uuid;
  linha_id uuid; linha2_id uuid; natureza_id uuid; o1 uuid; o2 uuid; a1 uuid; p1 uuid; r1 uuid;
  classe_id uuid; mapa_id uuid;
BEGIN
  IF (SELECT count(*) FROM sentinela.schema_migrations) <> 5 THEN
    RAISE EXCEPTION 'Baseline incompleta';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'sentinela' AND c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)) THEN
    RAISE EXCEPTION 'Tabela sem RLS ENABLE/FORCE';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'sentinela') THEN
    RAISE EXCEPTION 'Baseline nao deve liberar policies';
  END IF;
  IF EXISTS (SELECT 1 FROM sentinela.perfil_permissoes
    WHERE acao = 'corrigir_central' AND perfil <> 'Administrador') THEN
    RAISE EXCEPTION 'Correcao indevidamente atribuida';
  END IF;
  INSERT INTO sentinela.usuarios(nome_exibicao, perfil, ativo)
    VALUES ('TESTE SINTETICO ADMIN', 'Administrador', true) RETURNING id INTO admin_id;
  INSERT INTO sentinela.usuarios(nome_exibicao, perfil, ativo)
    VALUES ('TESTE SINTETICO OPERADOR', 'Operador', true) RETURNING id INTO operador_id;
  INSERT INTO sentinela.extracoes_origem(fonte, nome_xml, sha256_xml, tamanho_bytes, referencia_arquivo)
    VALUES ('TESTE_SINTETICO', 'fixture.xml', repeat('a',64), 1, 'fixture-local') RETURNING id INTO extracao_id;
  INSERT INTO sentinela.lotes_importacao(extracao_id, nome_arquivo, sha256_arquivo, tamanho_bytes,
    referencia_arquivo, versao_contrato, versao_tratamento, competencia, solicitado_por)
    VALUES (extracao_id, 'fixture.csv', repeat('b',64), 1, 'fixture-local', 'teste', 'teste', '2021-01-01', operador_id)
    RETURNING id INTO lote_id;
  PERFORM pg_temp.esperar_erro(format(
    'INSERT INTO sentinela.lotes_importacao SELECT gen_random_uuid(), extracao_id, nome_arquivo, sha256_arquivo,
    tamanho_bytes, referencia_arquivo, versao_contrato, versao_tratamento, competencia, linhas_esperadas,
    solicitado_por, criado_em FROM sentinela.lotes_importacao WHERE id = %L', lote_id), '23505');
  INSERT INTO sentinela.execucoes_importacao(lote_id, extracao_id, tentativa, solicitado_por, versao_importador, versao_validacao)
    VALUES (lote_id, extracao_id, 1, operador_id, 'teste', 'teste') RETURNING id INTO execucao_id;
  PERFORM pg_temp.esperar_erro(format(
    'INSERT INTO sentinela.execucoes_importacao(lote_id,extracao_id,tentativa,motivo_reprocessamento,solicitado_por,versao_importador,versao_validacao)
    VALUES (%L,%L,2,''teste'',%L,''teste'',''teste'')', lote_id, extracao_id, operador_id), '23505');
  PERFORM pg_temp.esperar_erro(format(
    'UPDATE sentinela.execucoes_importacao SET linhas_processadas = 1 WHERE id = %L', execucao_id), '23514');
  INSERT INTO sentinela.linhas_origem(extracao_id, linha_origem_id, aba_origem, linha_xml, versao_identificador,
    numero_registro, natureza_original) VALUES (extracao_id, 'TESTE:LINHA:1', 'TESTE', 2, 'teste', '00001', 'TESTE NATUREZA')
    RETURNING id INTO linha_id;
  INSERT INTO sentinela.linhas_origem(extracao_id, linha_origem_id, aba_origem, linha_xml, versao_identificador)
    VALUES (extracao_id, 'TESTE:LINHA:2', 'TESTE', 3, 'teste') RETURNING id INTO linha2_id;
  PERFORM pg_temp.esperar_erro(format('UPDATE sentinela.linhas_origem SET numero_registro = ''1'' WHERE id = %L', linha_id), '55000');
  PERFORM pg_temp.esperar_erro('TRUNCATE sentinela.eventos_auditoria', '55000');
  INSERT INTO sentinela.linhas_staging(execucao_id,lote_id,extracao_id,linha_origem_id,registro_csv,campos_csv)
    VALUES (execucao_id,lote_id,extracao_id,linha_id,1,'{"numero_registro":"00001"}');
  PERFORM pg_temp.esperar_erro(format(
    'UPDATE sentinela.linhas_staging SET campos_csv = ''{}'' WHERE execucao_id = %L', execucao_id), '55000');
  PERFORM pg_temp.esperar_erro(format(
    'INSERT INTO sentinela.linhas_staging(execucao_id,lote_id,extracao_id,linha_origem_id,registro_csv,campos_csv)
    VALUES (%L,%L,gen_random_uuid(),%L,2,''{}'')',execucao_id,lote_id,linha2_id), '23503');
  INSERT INTO sentinela.naturezas_criminais(fonte,descricao_original,categoria_pcdf_original)
    VALUES ('TESTE_SINTETICO','TESTE NATUREZA','TESTE CATEGORIA') RETURNING id INTO natureza_id;
  INSERT INTO sentinela.ocorrencias(origem,fonte,ano_registro,unidade_registro,numero_registro,versao_identidade)
    VALUES ('importacao','TESTE_SINTETICO','2021','TESTE','00001','candidata-teste') RETURNING id INTO o1;
  -- A mesma candidata nao causa merge nem UNIQUE prematuro.
  INSERT INTO sentinela.ocorrencias(origem,fonte,ano_registro,unidade_registro,numero_registro,versao_identidade)
    VALUES ('importacao','TESTE_SINTETICO','2021','TESTE','00001','candidata-teste') RETURNING id INTO o2;
  INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,linha_origem_id,crime_tentado)
    VALUES (o1,natureza_id,'importacao',linha_id,true) RETURNING id INTO a1;
  INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,linha_origem_id,crime_tentado)
    VALUES (o1,natureza_id,'importacao',linha2_id,false);
  IF (SELECT count(*) FROM sentinela.ocorrencia_naturezas WHERE ocorrencia_id = o1) <> 2 THEN
    RAISE EXCEPTION 'Multiplicidade perdida';
  END IF;
  PERFORM pg_temp.esperar_erro(format(
    'INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,linha_origem_id)
    VALUES (%L,%L,''importacao'',%L)', o2, natureza_id, linha_id), '23505');
  PERFORM pg_temp.esperar_erro(format(
    'UPDATE sentinela.linhas_staging SET ocorrencia_id=%L,associacao_id=%L WHERE execucao_id=%L',o2,a1,execucao_id), '23503');
  INSERT INTO sentinela.categorias_criminais(nome,versao_catalogo) VALUES ('TESTE CATEGORIA','teste') RETURNING id INTO classe_id;
  INSERT INTO sentinela.mapeamentos_natureza(natureza_id,versao,crime_tentado)
    VALUES (natureza_id,'teste',true) RETURNING id INTO mapa_id;
  PERFORM pg_temp.esperar_erro(format(
    'UPDATE sentinela.ocorrencia_naturezas SET classificacao_status=''mapeada'',mapeamento_id=%L WHERE id=%L',mapa_id,a1), '23514');
  INSERT INTO sentinela.categorias_criminais(nome,versao_catalogo,status,evidencia_homologacao)
    VALUES ('TESTE CATEGORIA','teste-2','homologada','APENAS FIXTURE') RETURNING id INTO classe_id;
  INSERT INTO sentinela.mapeamentos_natureza(natureza_id,versao,crime_tentado,categoria_id,status,evidencia_homologacao)
    VALUES (natureza_id,'teste-2',true,classe_id,'homologado','APENAS FIXTURE') RETURNING id INTO mapa_id;
  UPDATE sentinela.ocorrencia_naturezas SET classificacao_status='mapeada',mapeamento_id=mapa_id WHERE id=a1;
  PERFORM pg_temp.esperar_erro(format(
    'UPDATE sentinela.ocorrencias SET latitude=''NaN''::float8,localizacao_status=''referencia_pendente'' WHERE id=%L',o1), '23514');
  PERFORM pg_temp.esperar_erro(format(
    'UPDATE sentinela.ocorrencias SET localizacao_status=''validada'' WHERE id=%L',o1), '23514');
  UPDATE sentinela.ocorrencias SET latitude=-15.8,longitude=-47.8,localizacao_status='referencia_pendente' WHERE id=o1;
  IF (SELECT geometria FROM sentinela.ocorrencias WHERE id=o1) IS NOT NULL THEN
    RAISE EXCEPTION 'Geometria inventada';
  END IF;
  INSERT INTO sentinela.regioes_administrativas(codigo_interno,nome,versao_catalogo,vigencia,versao_cartografia,
    evidencia_referencia_espacial,limite) VALUES ('TESTE','TESTE REGIAO','teste','[2021-01-01,2022-01-01)',
    'fixture','fixture sintetica WGS84',public.ST_GeomFromText('MULTIPOLYGON(((-48 -16,-47 -16,-47 -15,-48 -15,-48 -16)))',4326))
    RETURNING id INTO r1;
  UPDATE sentinela.ocorrencias SET ra_id=r1,data_fato='2021-01-10',localizacao_status='validada',
    referencia_espacial_confirmada='fixture sintetica WGS84',regra_transformacao='fixture identidade',
    geometria=public.ST_SetSRID(public.ST_MakePoint(-47.8,-15.8),4326) WHERE id=o1;
  IF sentinela.avaliar_pertencimento_territorial(o1) <> 'compativel' THEN RAISE EXCEPTION 'Pertencimento incorreto'; END IF;
  UPDATE sentinela.ocorrencias SET longitude=-46,geometria=public.ST_SetSRID(public.ST_MakePoint(-46,-15.8),4326) WHERE id=o1;
  IF sentinela.avaliar_pertencimento_territorial(o1) <> 'divergente' THEN RAISE EXCEPTION 'Divergencia nao detectada'; END IF;
  INSERT INTO sentinela.pendencias_revisao(ocorrencia_id,campo,regra,versao_regra,motivo,tipo,prioridade,efeito)
    VALUES (o1,'local','teste','teste','TESTE AUSENCIA','endereco_ra','baixa','nao_bloqueante') RETURNING id INTO p1;
  INSERT INTO sentinela.pendencias_revisao(ocorrencia_id,campo,regra,versao_regra,motivo,tipo,prioridade,efeito,dimensao_afetada)
    VALUES (o1,'ra','teste','teste','TESTE DIVERGENCIA','endereco_ra','media','bloqueia_dimensao','territorial');
  IF (SELECT count(*) FROM sentinela.pendencias_revisao WHERE ocorrencia_id=o1) <> 2 THEN
    RAISE EXCEPTION 'Pendencias multiplas perdidas';
  END IF;
  PERFORM pg_temp.esperar_erro(format(
    'UPDATE sentinela.pendencias_revisao SET status=''resolvida'',responsavel_id=%L,encerrada_em=now() WHERE id=%L',admin_id,p1), '23514');
  PERFORM pg_temp.esperar_erro(format(
    'UPDATE sentinela.pendencias_revisao SET responsavel_id=%L WHERE id=%L',operador_id,p1), '42501');
  UPDATE sentinela.pendencias_revisao SET status='encerrada_sem_solucao',responsavel_id=admin_id,
    justificativa='TESTE SEM INFORMACAO DISPONIVEL',encerrada_em=clock_timestamp() WHERE id=p1;
  IF (SELECT local FROM sentinela.ocorrencias WHERE id=o1) IS NOT NULL THEN
    RAISE EXCEPTION 'Encerramento inventou endereco';
  END IF;
  PERFORM pg_temp.esperar_erro(format(
    'INSERT INTO sentinela.historico_correcoes(ocorrencia_id,campo,valores_anteriores,valores_novos,
    responsavel_id,justificativa,versao_registro_anterior,versao_validacao,resultado_reavaliacao)
    VALUES (%L,''local'',''null'',''null'',%L,''TESTE'',1,''teste'',''{}'')',o1,operador_id), '42501');
  INSERT INTO sentinela.historico_correcoes(ocorrencia_id,campo,valores_anteriores,valores_novos,
    responsavel_id,justificativa,versao_registro_anterior,versao_validacao,resultado_reavaliacao)
    VALUES (o1,'local','null','null',admin_id,'TESTE SINTETICO',1,'teste','{}');
  PERFORM pg_temp.esperar_erro('UPDATE sentinela.historico_correcoes SET justificativa=''APAGAR HISTORICO''','55000');
  RAISE NOTICE 'Fixtures: identidade, associacoes, idempotencia, localizacao, revisao e imutabilidade verificadas.';
END $$;

ALTER TABLE sentinela.ocorrencias ENABLE TRIGGER correcao_exige_historico;
ALTER TABLE sentinela.ocorrencia_naturezas ENABLE TRIGGER correcao_exige_historico;
ALTER TABLE sentinela.linhas_staging ENABLE TRIGGER correcao_exige_historico;
ALTER TABLE sentinela.pendencias_revisao ENABLE TRIGGER pendencia_exige_evento;

-- Testar integridade e auditoria em modo imediato para nao ocultar falhas no ROLLBACK.
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
  o1 uuid; o2 uuid; origem uuid; outra_origem uuid; a1 uuid; p1 uuid; p2 uuid; ps uuid;
  admin_id uuid; novo_admin uuid; s1 uuid; registro sentinela.ocorrencias%ROWTYPE;
  pend_antes jsonb; pend_depois jsonb; correcao_id uuid;
BEGIN
  SELECT id INTO o1 FROM sentinela.ocorrencias WHERE longitude = -46;
  SELECT id INTO o2 FROM sentinela.ocorrencias WHERE id <> o1;
  SELECT a.id,a.linha_origem_id INTO a1,origem FROM sentinela.ocorrencia_naturezas a
    WHERE a.ocorrencia_id=o1 AND a.crime_tentado;
  SELECT id INTO outra_origem FROM sentinela.linhas_origem WHERE id<>origem;
  SELECT id INTO admin_id FROM sentinela.usuarios WHERE perfil='Administrador';
  SELECT id INTO s1 FROM sentinela.linhas_staging WHERE linha_origem_id=origem;
  SELECT id INTO p1 FROM sentinela.pendencias_revisao WHERE status='encerrada_sem_solucao';

  -- Identidade e transferencias: a trava de Auth esta isolada, as protecoes reais estao ativas.
  PERFORM pg_temp.esperar_erro(format('UPDATE sentinela.ocorrencias SET fonte=''OUTRA'' WHERE id=%L',o1),'55000');
  PERFORM pg_temp.esperar_erro(format('UPDATE sentinela.ocorrencias SET numero_registro=''1'' WHERE id=%L',o1),'55000');
  PERFORM pg_temp.esperar_erro(format('UPDATE sentinela.ocorrencias SET versao_identidade=''outra'' WHERE id=%L',o1),'55000');
  PERFORM pg_temp.esperar_erro(format('UPDATE sentinela.ocorrencias SET origem=''manual'',identidade_status=''manual'' WHERE id=%L',o1),'55000');
  PERFORM pg_temp.esperar_erro(format('UPDATE sentinela.ocorrencia_naturezas SET ocorrencia_id=%L WHERE id=%L',o2,a1),'55000');

  INSERT INTO sentinela.pendencias_revisao(ocorrencia_id,campo,regra,versao_regra,motivo,tipo,prioridade,efeito)
    VALUES(o2,'local','teste-vinculos','teste','FIXTURE','endereco_ra','baixa','nao_bloqueante') RETURNING id INTO p2;
  INSERT INTO sentinela.pendencias_revisao(linha_origem_id,campo,regra,versao_regra,motivo,tipo,prioridade,efeito)
    VALUES(origem,'local','teste-vinculos','teste','FIXTURE','endereco_ra','baixa','nao_bloqueante') RETURNING id INTO ps;
  PERFORM pg_temp.esperar_erro(format(
    'INSERT INTO sentinela.pendencias_revisao(ocorrencia_id,linha_origem_id,associacao_id,campo,regra,versao_regra,motivo,tipo,prioridade,efeito)
    VALUES(%L,%L,%L,''local'',''teste'',''teste'',''FIXTURE'',''endereco_ra'',''baixa'',''nao_bloqueante'')',o2,origem,a1),'23503');
  PERFORM pg_temp.esperar_erro(format('UPDATE sentinela.pendencias_revisao SET ocorrencia_id=%L WHERE id=%L',o1,p2),'55000');
  PERFORM pg_temp.esperar_erro(format(
    'INSERT INTO sentinela.pendencias_revisao(ocorrencia_id,linha_origem_id,associacao_id,campo,regra,versao_regra,motivo,tipo,prioridade,efeito)
    VALUES(%L,%L,%L,''local'',''teste-linha'',''teste'',''FIXTURE'',''endereco_ra'',''baixa'',''nao_bloqueante'')',o1,outra_origem,a1),'23503');
  PERFORM pg_temp.esperar_erro(format('UPDATE sentinela.linhas_staging SET ocorrencia_id=%L WHERE id=%L',o2,s1),'23514');
  INSERT INTO sentinela.pendencias_revisao(ocorrencia_id,linha_origem_id,associacao_id,campo,regra,versao_regra,motivo,tipo,prioridade,efeito)
    VALUES(o1,origem,a1,'local','teste-tripla','teste','FIXTURE','endereco_ra','baixa','nao_bloqueante');

  SELECT * INTO registro FROM sentinela.ocorrencias WHERE id=o1;
  PERFORM pg_temp.esperar_erro(format(
    'INSERT INTO sentinela.historico_correcoes(ocorrencia_id,pendencia_id,campo,valores_anteriores,valores_novos,
    responsavel_id,justificativa,versao_registro_anterior,versao_validacao,resultado_reavaliacao)
    VALUES(%L,%L,''local'',''null'',''"FIXTURE"'',%L,''FIXTURE'',%s,''teste'',''{}'')',o1,p2,admin_id,registro.versao),'23514');
  PERFORM pg_temp.esperar_erro(format(
    'INSERT INTO sentinela.historico_correcoes(staging_id,pendencia_id,campo,valores_anteriores,valores_novos,
    responsavel_id,justificativa,versao_registro_anterior,versao_validacao,resultado_reavaliacao)
    VALUES(%L,%L,''local'',''null'',''"FIXTURE"'',%L,''FIXTURE'',1,''teste'',''{}'')',s1,p2,admin_id),'23514');
  PERFORM pg_temp.esperar_erro(format(
    'INSERT INTO sentinela.historico_correcoes(associacao_id,pendencia_id,campo,valores_anteriores,valores_novos,
    responsavel_id,justificativa,versao_registro_anterior,versao_validacao,resultado_reavaliacao)
    VALUES(%L,%L,''local'',''null'',''"FIXTURE"'',%L,''FIXTURE'',1,''teste'',''{}'')',a1,p2,admin_id),'23514');

  -- Historico obrigatorio: ausente, de outra versao ou com valores errados nao autoriza a alteracao.
  PERFORM pg_temp.esperar_erro(format('UPDATE sentinela.ocorrencias SET local=''SEM HISTORICO'' WHERE id=%L',o1),'23514');
  INSERT INTO sentinela.historico_correcoes(ocorrencia_id,campo,valores_anteriores,valores_novos,responsavel_id,
    justificativa,versao_registro_anterior,versao_validacao,resultado_reavaliacao)
    VALUES(o1,'local','null','"FIXTURE"',admin_id,'FIXTURE versao errada',registro.versao+1,'teste','{}');
  PERFORM pg_temp.esperar_erro(format('UPDATE sentinela.ocorrencias SET local=''FIXTURE'' WHERE id=%L',o1),'23514');
  INSERT INTO sentinela.historico_correcoes(ocorrencia_id,campo,valores_anteriores,valores_novos,responsavel_id,
    justificativa,versao_registro_anterior,versao_validacao,resultado_reavaliacao)
    VALUES(o1,'local','"VALOR ANTERIOR INCORRETO"','"OUTRO"',admin_id,'FIXTURE valores errados',registro.versao,'teste','{}');
  PERFORM pg_temp.esperar_erro(format('UPDATE sentinela.ocorrencias SET local=''OUTRO'' WHERE id=%L',o1),'23514');
  INSERT INTO sentinela.historico_correcoes(ocorrencia_id,pendencia_id,campo,valores_anteriores,valores_novos,responsavel_id,
    justificativa,versao_registro_anterior,versao_validacao,resultado_reavaliacao,transacao_id,corrigido_em)
    VALUES(o1,ps,'local','null','"FIXTURE"',admin_id,'FIXTURE correta',registro.versao,'teste','{}','1'::xid8,'2000-01-01')
    RETURNING id INTO correcao_id;
  IF NOT EXISTS(SELECT 1 FROM sentinela.historico_correcoes h WHERE h.id=correcao_id
    AND h.transacao_id=pg_current_xact_id() AND h.corrigido_em>'2000-01-01') THEN
    RAISE EXCEPTION 'Cliente conseguiu forjar carimbo transacional/temporal';
  END IF;
  UPDATE sentinela.ocorrencias SET local='FIXTURE' WHERE id=o1;
  PERFORM pg_temp.esperar_erro(format(
    'INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,ocorrencia_id,pendencia_id,justificativa)
    VALUES(''servico'',''FIXTURE'',''FIXTURE'',%L,%L,''FIXTURE'')',o1,p2),'23514');
  PERFORM pg_temp.esperar_erro(format('UPDATE sentinela.ocorrencias SET local=''OUTRO VALOR'' WHERE id=%L',o1),'23514');

  -- Autoria historica permanece valida, mesmo apos desativacao e perda do perfil.
  INSERT INTO sentinela.usuarios(nome_exibicao,perfil,ativo) VALUES('NOVO ADMIN TESTE','Administrador',true) RETURNING id INTO novo_admin;
  UPDATE sentinela.usuarios SET ativo=false,perfil='Analista' WHERE id=admin_id;
  SELECT to_jsonb(p) INTO pend_antes FROM sentinela.pendencias_revisao p WHERE p.id=p1;
  -- Evento construido com a mesma transicao e versao; nao precisa de revisor historico ativo.
  pend_depois := jsonb_set(pend_antes,'{motivo}','"FIXTURE REAVALIADA"');
  -- Trigger de versao usa clock_timestamp; capturar NEW via RETURNING e inserir evento antes do COMMIT.
  SET CONSTRAINTS ALL DEFERRED;
  UPDATE sentinela.pendencias_revisao SET motivo='FIXTURE REAVALIADA' WHERE id=p1 RETURNING to_jsonb(pendencias_revisao) INTO pend_depois;
  INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,pendencia_id,antes,depois,justificativa)
    VALUES('servico','FIXTURE','reavaliacao',p1,pend_antes,pend_depois,'FIXTURE');
  SET CONSTRAINTS ALL IMMEDIATE;
  IF NOT EXISTS(SELECT 1 FROM sentinela.pendencias_revisao WHERE id=p1 AND responsavel_id=admin_id) THEN
    RAISE EXCEPTION 'Autoria historica foi perdida';
  END IF;
  PERFORM pg_temp.esperar_erro(format('UPDATE sentinela.pendencias_revisao SET motivo=''SEM EVENTO'' WHERE id=%L',p1),'23514');
  PERFORM pg_temp.esperar_erro(format('UPDATE sentinela.pendencias_revisao SET responsavel_id=%L WHERE id=%L',admin_id,p2),'42501');
  -- Permitir nova atribuicao a outro Administrador ativo, com evento na mesma transacao.
  SELECT to_jsonb(p) INTO pend_antes FROM sentinela.pendencias_revisao p WHERE p.id=p2;
  SET CONSTRAINTS ALL DEFERRED;
  UPDATE sentinela.pendencias_revisao SET responsavel_id=novo_admin,status='em_analise' WHERE id=p2 RETURNING to_jsonb(pendencias_revisao) INTO pend_depois;
  INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,pendencia_id,antes,depois,justificativa)
    VALUES('servico','FIXTURE','fixture atribuicao',p2,pend_antes,pend_depois,'FIXTURE sob manutencao local');
  SET CONSTRAINTS ALL IMMEDIATE;
END $$;

-- Reativar as travas e comprovar que UUID/GUC nao substituem Auth real, mesmo como superusuario.
ALTER TABLE sentinela.ocorrencias ENABLE TRIGGER escrita_correcao_bloqueada;
ALTER TABLE sentinela.ocorrencia_naturezas ENABLE TRIGGER escrita_correcao_bloqueada;
ALTER TABLE sentinela.linhas_staging ENABLE TRIGGER escrita_correcao_bloqueada;
ALTER TABLE sentinela.pendencias_revisao ENABLE TRIGGER escrita_correcao_bloqueada;
ALTER TABLE sentinela.historico_correcoes ENABLE TRIGGER escrita_correcao_bloqueada;
DO $$
DECLARE admin_id uuid; alvo uuid;
BEGIN
  SELECT id INTO admin_id FROM sentinela.usuarios WHERE ativo AND perfil='Administrador';
  SELECT id INTO alvo FROM sentinela.ocorrencias LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  PERFORM set_config('app.usuario_id',admin_id::text,true);
  PERFORM pg_temp.esperar_erro('UPDATE sentinela.ocorrencias SET local=''FORJADO''','42501');
  PERFORM pg_temp.esperar_erro('DELETE FROM sentinela.ocorrencias','42501');
  PERFORM pg_temp.esperar_erro('UPDATE sentinela.ocorrencia_naturezas SET crime_tentado=true','42501');
  PERFORM pg_temp.esperar_erro('UPDATE sentinela.linhas_staging SET derivados_efetivos=''{}''','42501');
  PERFORM pg_temp.esperar_erro('UPDATE sentinela.pendencias_revisao SET motivo=''FORJADO''','42501');
  PERFORM pg_temp.esperar_erro(format(
    'INSERT INTO sentinela.historico_correcoes(ocorrencia_id,campo,valores_anteriores,valores_novos,responsavel_id,
    justificativa,versao_registro_anterior,versao_validacao,resultado_reavaliacao)
    VALUES(%L,''local'',''null'',''"FORJADO"'',%L,''FORJADO'',1,''teste'',''{}'')',alvo,admin_id),'42501');
  PERFORM pg_temp.esperar_erro(format(
    'INSERT INTO sentinela.eventos_auditoria(ator_tipo,usuario_id,acao,justificativa)
    VALUES(''usuario'',%L,''FORJADO'',''FORJADO'')',admin_id),'42501');
  PERFORM pg_temp.esperar_erro(format(
    'INSERT INTO sentinela.pendencias_revisao(ocorrencia_id,campo,regra,versao_regra,motivo,tipo,prioridade,efeito,status,responsavel_id)
    VALUES(%L,''local'',''forjada'',''teste'',''FORJADO'',''endereco_ra'',''baixa'',''nao_bloqueante'',''em_analise'',%L)',alvo,admin_id),'42501');
END $$;

-- Confirmar acesso negado mesmo quando SELECT e explicitamente concedido a role sem BYPASSRLS.
CREATE ROLE sentinela_teste_sem_acesso NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA sentinela TO sentinela_teste_sem_acesso;
GRANT SELECT ON ALL TABLES IN SCHEMA sentinela TO sentinela_teste_sem_acesso;
GRANT INSERT ON sentinela.ocorrencias TO sentinela_teste_sem_acesso;
SET LOCAL ROLE sentinela_teste_sem_acesso;
DO $$
DECLARE bloqueado boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM sentinela.ocorrencias) OR EXISTS (SELECT 1 FROM sentinela.usuarios) THEN
    RAISE EXCEPTION 'RLS fechado vazou registros';
  END IF;
  BEGIN
    INSERT INTO sentinela.ocorrencias(origem,fonte,versao_identidade,identidade_status)
      VALUES ('manual','TESTE_SINTETICO','teste','manual');
  EXCEPTION WHEN insufficient_privilege THEN bloqueado := true;
  END;
  IF NOT bloqueado THEN RAISE EXCEPTION 'RLS fechado permitiu INSERT'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
