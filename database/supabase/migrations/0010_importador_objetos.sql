-- Incremental Supabase ONLY, after 0009. Generated from the installed production DDL
-- (pg_dump --schema-only of the attested local installation), restricted to the objects that the
-- Supabase path does not have. Physical cluster checks are replaced by sentinela_ambiente.vinculado().
-- Includes hosted authorization and ACL ordering adaptations. Validate via a clean migration replay.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL check_function_bodies = false;
SET LOCAL search_path = pg_catalog;
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0009')
    OR NOT sentinela_ambiente.vinculado() THEN
    RAISE EXCEPTION 'Aplicar somente depois da 0009, no banco vinculado.';
  END IF;
END $$;

-- Spatial validation uses PostGIS inside the manual SECURITY DEFINER functions.
GRANT USAGE ON SCHEMA extensions TO sentinela_manual_writer;
DO $$
BEGIN
  IF NOT has_schema_privilege('sentinela_manual_writer','extensions','USAGE') THEN
    RAISE EXCEPTION 'O executor do cadastro manual precisa usar PostGIS no schema extensions.';
  END IF;
END $$;

-- SCHEMA -.sentinela_exclusao
CREATE SCHEMA sentinela_exclusao;




-- SCHEMA -.sentinela_general_accounts
CREATE SCHEMA sentinela_general_accounts;




-- SCHEMA -.sentinela_gestao
CREATE SCHEMA sentinela_gestao;




-- SCHEMA -.sentinela_gestao_autorizacao
CREATE SCHEMA sentinela_gestao_autorizacao;




-- SCHEMA -.sentinela_import_local
CREATE SCHEMA sentinela_import_local;




-- SCHEMA -.sentinela_ocorrencias_analytics
CREATE SCHEMA sentinela_ocorrencias_analytics;




-- SCHEMA -.sentinela_ocorrencias_local
CREATE SCHEMA sentinela_ocorrencias_local;




-- SCHEMA -.sentinela_ocorrencias_manual
CREATE SCHEMA sentinela_ocorrencias_manual;




-- SCHEMA -.sentinela_pcdf_historico
CREATE SCHEMA sentinela_pcdf_historico;




-- SCHEMA -.sentinela_pcdf_local
CREATE SCHEMA sentinela_pcdf_local;




-- SCHEMA -.sentinela_pcdf_revisao
CREATE SCHEMA sentinela_pcdf_revisao;




-- SCHEMA -.sentinela_pessoas
CREATE SCHEMA sentinela_pessoas;




-- REPLACE FUNCTION sentinela.bloquear_autoria_manual_sem_auth()
CREATE OR REPLACE FUNCTION sentinela.bloquear_autoria_manual_sem_auth() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
  IF TG_TABLE_NAME = 'pendencias_revisao' THEN
    IF NEW.status <> 'aberta' OR NEW.responsavel_id IS NOT NULL THEN
      RAISE EXCEPTION 'Atribuicao/decisao manual depende de Auth real.' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.ator_tipo = 'usuario' THEN
    -- Evaluated first: each branch only resolves the schema its own owner may use.
    IF current_user='sentinela_manual_writer' THEN
      IF TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='eventos_auditoria'
        AND NEW.acao IN ('ocorrencia.manual.criada','ocorrencia.manual.editada','ocorrencia.manual.inativada','ocorrencia.manual.consolidada')
        AND NEW.depois->>'operacao'='cadastro-manual'
        AND sentinela_ocorrencias_manual.autor(NEW.usuario_id,NEW.depois->>'conta') IS NOT NULL
      THEN RETURN NEW; END IF;
    ELSIF current_user='sentinela_gestao_owner' AND TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='eventos_auditoria'
      AND NEW.acao='corrigir_associacao' AND NEW.depois->>'operacao'='gestao-importacao'
      AND sentinela_gestao_autorizacao.capacidade(NEW.usuario_id,NEW.depois->>'conta') IS TRUE
    THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Autoria humana de auditoria depende de Auth real.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;




-- REPLACE FUNCTION sentinela.bloquear_correcao_sem_backend()
CREATE OR REPLACE FUNCTION sentinela.bloquear_correcao_sem_backend() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
 IF current_user='sentinela_exclusao_owner' AND session_user='sentinela_local_admin'
    AND sentinela_ambiente.vinculado() AND sentinela_ambiente.vinculado()
    AND TG_TABLE_SCHEMA='sentinela' AND TG_OP='DELETE' AND TG_TABLE_NAME IN ('linhas_staging','pendencias_revisao')
 THEN RETURN NULL; END IF;
 IF current_user='sentinela_manual_writer' AND session_user IN ('sentinela_local_admin','sentinela_local_operator')
    AND sentinela_ambiente.vinculado() AND sentinela_ambiente.vinculado()
    AND TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='ocorrencias' AND TG_OP='UPDATE'
 THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'Correcao bloqueada ate Auth e backend transacional auditado serem implementados.'
    USING ERRCODE = '42501';
END $$;




-- FUNCTION sentinela.descricao_pcdf(text)
CREATE FUNCTION sentinela.descricao_pcdf(text) RETURNS boolean
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    SET search_path TO 'pg_catalog'
    AS $_$SELECT $1 COLLATE "C" = ANY('{"ASSOCIACAO PARA O FIM DE TRAFICO DE SUBSTANCIA ENTORPECENTE","DESCUMPRIR DECISÃO JUDICIAL QUE DEFERE MEDIDAS PROTETIVAS DE URGÊNCIA PREVISTAS NA LEI 11.340/2006",ESTUPRO,"ESTUPRO COLETIVO","ESTUPRO COM RESULTADO MORTE","ESTUPRO CORRETIVO","ESTUPRO DE VULNERÁVEL",FEMINICIDIO,"FURTO DE MOTOCICLETA","FURTO DE VEICULO","FURTO EM COMERCIO","FURTO EM INTERIOR DE VEICULO","FURTO EM RESIDENCIA",HOMICIDIO,LATROCINIO,"LEI MARIA DA PENHA (Lei 11.340/06)","PORTE DE ARMA","PORTE DE SUBSTANCIA ENTORPECENTE PARA CONSUMO PESSOAL","PORTE ILEGAL DE ARMA DE FOGO DE USO PERMITIDO (L.10826/03)","POSSE IRREGULAR DE ARMA DE FOGO DE USO PERMITIDO (L.10826/03)","POSSE OU PORTE ILEGAL DE ARMA DE FOGO DE  USO RESTRITO (L.10826/03)","POSSUIR, DETIVER, FABRICAR OU EMPREGAR ARTEFATO EXPLOSIVO OU INCENDIÁRIO, SEM AUTORIZAÇÃO OU EM DESACORDO COM DETERMINAÇÃO LEGAL OU REGULAMENTAR","ROUBO A BAR","ROUBO A CASA LOTERICA","ROUBO A DROGARIA","ROUBO A PANIFICADORA","ROUBO A SUPERMERCADO E ATACADISTA","ROUBO A TRAILLER","ROUBO A TRANSEUNTE","ROUBO DE VEICULO","ROUBO EM CHÁCARA, SÍTIO OU FAZENDA","ROUBO EM COLETIVO","ROUBO EM OUTROS ESTABELECIMENTOS COMERCIAIS","ROUBO EM PARADA DE ONIBUS","ROUBO EM RESIDENCIA","ROUBO NA PROXIMIDADES DE BANCO","ROUBO NAS PROXIMIDADES DE CAIXA ELETRONICO","TRÁFICO DE DROGAS PREVALECENDO-SE DE FUNÇÃO PÚBLICA","TRÁFICO DE SUBSTANCIA ENTORPECENTE","TRÁFICO INTERNACIONAL DE SUBSTANCIA ENTORPECENTE","TRÁFICO PRIVILEGIADO"}'::text[])$_$;




-- REPLACE FUNCTION sentinela.exigir_historico_correcao()
CREATE OR REPLACE FUNCTION sentinela.exigir_historico_correcao() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$

DECLARE item record; anterior jsonb; novo jsonb;

BEGIN

  IF TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='ocorrencias'
    AND session_user IN ('sentinela_local_admin','sentinela_local_operator') THEN
    IF sentinela_ocorrencias_manual.verificar_evento(OLD,NEW) THEN RETURN NULL; END IF;
  END IF;
  anterior := to_jsonb(OLD);
  novo := to_jsonb(NEW);
  FOR item IN SELECT key, value FROM jsonb_each(novo - ARRAY['versao', 'atualizado_em']) LOOP

    IF item.value IS DISTINCT FROM anterior -> item.key AND NOT EXISTS (

      SELECT 1 FROM sentinela.historico_correcoes h

      WHERE h.transacao_id = pg_current_xact_id() AND h.versao_registro_anterior = OLD.versao

        AND h.campo = item.key AND h.valores_anteriores = anterior -> item.key AND h.valores_novos = item.value

        AND ((TG_TABLE_NAME = 'ocorrencias' AND h.ocorrencia_id = OLD.id)

          OR (TG_TABLE_NAME = 'ocorrencia_naturezas' AND h.associacao_id = OLD.id)

          OR (TG_TABLE_NAME = 'linhas_staging' AND h.staging_id = OLD.id))

    ) THEN

      RAISE EXCEPTION 'Correcao de %.% exige historico correspondente nesta transacao.', TG_TABLE_NAME, item.key

        USING ERRCODE = '23514';

    END IF;

  END LOOP;

  RETURN NULL;

END $$;




-- REPLACE FUNCTION sentinela.impedir_mutacao()
CREATE OR REPLACE FUNCTION sentinela.impedir_mutacao() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
 IF current_user='sentinela_exclusao_owner' AND session_user='sentinela_local_admin'
    AND sentinela_ambiente.vinculado() AND sentinela_ambiente.vinculado()
    AND TG_TABLE_SCHEMA='sentinela' AND TG_OP='DELETE'
    AND TG_TABLE_NAME IN ('extracoes_origem','lotes_importacao','linhas_origem','historico_correcoes','eventos_auditoria')
 THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Objeto % e imutavel: preservar origem/historico e criar nova versao.', TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$;




-- FUNCTION sentinela.pcdf_componente_ausente_v1(uuid, text, text, jsonb)
CREATE FUNCTION sentinela.pcdf_componente_ausente_v1(origem uuid, campo text, regra text, valor jsonb) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog'
    AS $$
 SELECT campo IN ('latitude_geo_original','longitude_geo_original','latitude_utm_original','longitude_utm_original')
    AND regra IN ('ausente','nulo_declarado','vazio_semantico')
    AND EXISTS (
      SELECT FROM sentinela.linhas_staging s WHERE s.linha_origem_id=origem
        AND s.lote_id='84908630-bd04-4a03-923d-616649c8de74'
        AND s.ocorrencia_id IS NULL AND s.associacao_id IS NULL
        AND s.campos_csv->campo IS NOT DISTINCT FROM valor
        AND EXISTS (SELECT FROM jsonb_to_recordset(s.diagnosticos) d(field text,rule text,effect text)
          WHERE d.field='coordenada_status' AND d.rule IN ('ausente','incompleta','invalida','referencia_pendente')
            AND d.effect='bloqueia_dimensao')
    )
$$;




-- REPLACE FUNCTION sentinela.validar_associacao_mapeada()
CREATE OR REPLACE FUNCTION sentinela.validar_associacao_mapeada() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.linha_origem_id IS DISTINCT FROM OLD.linha_origem_id
   OR NEW.origem IS DISTINCT FROM OLD.origem) THEN
  RAISE EXCEPTION 'Proveniencia da associacao e imutavel.' USING ERRCODE='55000';
 END IF;
 IF NEW.mapeamento_id IS NOT NULL AND NOT EXISTS (
   SELECT FROM sentinela.mapeamentos_natureza m JOIN sentinela.categorias_criminais c ON c.id=m.categoria_id
   WHERE m.id=NEW.mapeamento_id AND m.natureza_id=NEW.natureza_id
     AND m.status='homologado' AND c.status='homologada'
     AND m.crime_tentado IS NOT DISTINCT FROM NEW.crime_tentado
 ) THEN RAISE EXCEPTION 'Classificacao exige regra/categoria homologadas e tentativa correspondente.' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (
   SELECT FROM sentinela.ocorrencias o
   LEFT JOIN sentinela.naturezas_criminais n ON n.id=NEW.natureza_id
   WHERE o.id=NEW.ocorrencia_id AND o.origem=NEW.origem AND (
     o.fonte=n.fonte OR (NEW.natureza_id IS NULL AND o.fonte='PCDF' AND o.origem='importacao'
   AND o.versao_identidade='pcdf-tupla-conferida-v1' AND EXISTS (
     SELECT FROM sentinela.linhas_origem l WHERE l.id=NEW.linha_origem_id
     AND sentinela.descricao_pcdf(l.natureza_original) IS DISTINCT FROM true)) OR (o.origem='manual' AND o.fonte='SENTINELA_MANUAL' AND
       n.fonte='PCDF' AND n.categoria_pcdf_original IS NULL AND sentinela.descricao_pcdf(n.descricao_original)))
 ) THEN RAISE EXCEPTION 'Origem/fonte da associacao deve corresponder a ocorrencia e natureza.' USING ERRCODE='23514'; END IF;
 IF NEW.linha_origem_id IS NOT NULL AND NOT EXISTS (
   SELECT FROM sentinela.linhas_origem l JOIN sentinela.extracoes_origem e ON e.id=l.extracao_id
   JOIN sentinela.ocorrencias o ON o.id=NEW.ocorrencia_id
   WHERE l.id=NEW.linha_origem_id AND e.fonte=o.fonte
 ) THEN RAISE EXCEPTION 'Linha original pertence a outra fonte ou nao existe.' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END
$$;




-- FUNCTION sentinela_exclusao.autorizar_jan2021(uuid, uuid, text, text, text)
CREATE FUNCTION sentinela_exclusao.autorizar_jan2021(alvo uuid, p_usuario uuid, p_conta text, p_revisao text, p_backup text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE plano jsonb; v_validade timestamptz;
BEGIN
  PERFORM sentinela_exclusao.exigir_ambiente();
  PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,p_conta);
  PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
  plano:=sentinela_exclusao.plano(alvo);
  IF plano IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002'; END IF;
  IF sentinela_exclusao.revisao(plano) IS DISTINCT FROM p_revisao
    OR NOT sentinela_exclusao.excecao_pontual_jan2021(plano)
  THEN RAISE EXCEPTION USING ERRCODE='40001'; END IF;
  v_validade:=sentinela_gestao_autorizacao.emitir_jan2021(alvo,p_usuario,p_conta,p_revisao,p_backup);
  RETURN jsonb_build_object('id',alvo,'revisao',p_revisao,'validade',v_validade);
END $$;




-- FUNCTION sentinela_exclusao.excecao_pontual_jan2021(jsonb)
CREATE FUNCTION sentinela_exclusao.excecao_pontual_jan2021(plano jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT coalesce(plano->>'id'='a88ac192-edef-4339-8381-106bbd1b391e'
    AND plano->>'competencia'='2021-01' AND plano->>'contrato'='1.0'
    AND plano->'bloqueios'='[{"tipo":"lote_protegido","id":"a88ac192-edef-4339-8381-106bbd1b391e"}]'::jsonb
    AND sentinela_exclusao.revisao(plano)='e7de205ec3812ec78740c4041868f3982e3e964602c1b7a9c61f80d426e0ed71',false)
$$;




-- FUNCTION sentinela_exclusao.excluir(jsonb, text, uuid)
CREATE FUNCTION sentinela_exclusao.excluir(p jsonb, conta text, p_usuario uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE alvo uuid:=(p->>'id')::uuid; chave_geral text;
 espacos constant text:=U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
 motivo text:=btrim(p->>'justificativa',espacos);
 plano jsonb; item record; ids text[]; removidos bigint; comprovante uuid;
BEGIN
 PERFORM sentinela_exclusao.exigir_ambiente();
 PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,conta);
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
 IF p->>'acao' IS DISTINCT FROM 'excluir_lote' OR alvo IS NULL OR p->>'confirmacao' IS DISTINCT FROM alvo::text OR p->'definitiva' IS DISTINCT FROM 'true'::jsonb
 OR jsonb_typeof(p->'justificativa') IS DISTINCT FROM 'string'
 OR NOT coalesce(length(motivo) BETWEEN 1 AND 500,false) OR NOT coalesce(conta~'^[a-f0-9]{64}$',false)
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
 SELECT x.sha256_xml INTO chave_geral FROM sentinela.lotes_importacao l
 JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id WHERE l.id=alvo AND x.fonte='IMPORTACAO-GERAL-LOCAL';
 IF chave_geral IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('general:'||chave_geral,0)); END IF;
 -- Freeze the FK topology from the plan through commit. Existing writers share the intake locks above.
 LOCK TABLE sentinela.extracoes_origem,sentinela.lotes_importacao,sentinela.execucoes_importacao,sentinela.linhas_origem,
   sentinela.linhas_staging,sentinela.pendencias_revisao,sentinela.historico_correcoes,sentinela.eventos_auditoria,
   sentinela_import_local.requests IN SHARE ROW EXCLUSIVE MODE;
 plano:=sentinela_exclusao.plano(alvo);
 IF plano IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002'; END IF;
 IF p->>'revisao' IS DISTINCT FROM sentinela_exclusao.revisao(plano) OR (plano->'bloqueios'<>'[]'::jsonb AND NOT sentinela_exclusao.excecao_pontual_jan2021(plano))
 THEN RAISE EXCEPTION USING ERRCODE='40001'; END IF;

 IF alvo='a88ac192-edef-4339-8381-106bbd1b391e' AND (
        p->>'palavra' IS DISTINCT FROM 'EXCLUIR' OR
        p->>'provaBackup' IS DISTINCT FROM 'fa4ed26293a1e09e49b35963fedd58a37f0f72c29e2bade7386d4bdd96b08108')
      THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
      PERFORM sentinela_gestao_autorizacao.consumir(alvo,p_usuario,conta,p->>'revisao');

 FOR item IN SELECT * FROM (VALUES
   ('auditorias','sentinela.eventos_auditoria','id','uuid'),
   ('correcoes','sentinela.historico_correcoes','id','uuid'),
   ('recibos','sentinela_import_local.requests','request','uuid'),
   ('pendencias','sentinela.pendencias_revisao','id','uuid'),
   ('staging','sentinela.linhas_staging','id','uuid'),
   ('origens','sentinela.linhas_origem','id','uuid'),
   ('execucoes','sentinela.execucoes_importacao','id','uuid'),
   ('lotes','sentinela.lotes_importacao','id','uuid'),
   ('extracoes','sentinela.extracoes_origem','id','uuid')
 ) AS d(grupo,tabela,chave,tipo)
 LOOP
   ids:=ARRAY(SELECT jsonb_array_elements_text(plano->'escopo'->item.grupo));
   IF cardinality(ids)=0 THEN CONTINUE; END IF;
   EXECUTE format('DELETE FROM %s WHERE %I=ANY($1::%s[])',item.tabela,item.chave,item.tipo) USING ids;
   GET DIAGNOSTICS removidos=ROW_COUNT;
   IF removidos<>cardinality(ids) THEN RAISE EXCEPTION USING ERRCODE='40001'; END IF;
 END LOOP;

 INSERT INTO sentinela_exclusao.comprovantes(lote,responsavel,justificativa,quantidades,revisao_autorizada,backup_restaurado)
 VALUES(alvo,p_usuario,motivo,sentinela_exclusao.quantidades(plano),
        CASE WHEN sentinela_exclusao.excecao_pontual_jan2021(plano) THEN p->>'revisao' END,
        CASE WHEN sentinela_exclusao.excecao_pontual_jan2021(plano) THEN p->>'provaBackup' END)
      RETURNING id INTO comprovante;
 RETURN jsonb_build_object('id',alvo,'auditoria',comprovante);
END $_$;




-- FUNCTION sentinela_exclusao.exigir_ambiente()
CREATE FUNCTION sentinela_exclusao.exigir_ambiente() RETURNS void
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
 IF NOT sentinela_ambiente.vinculado() OR NOT sentinela_ambiente.vinculado()
 OR NOT sentinela_ambiente.vinculado() OR session_user<>'sentinela_local_admin'
 OR sentinela_ambiente.instalacao() IS NULL
 OR EXISTS (SELECT FROM unnest(ARRAY[
   'sentinela.extracoes_origem','sentinela.lotes_importacao','sentinela.execucoes_importacao',
   'sentinela.linhas_origem','sentinela.linhas_staging','sentinela.pendencias_revisao',
   'sentinela.historico_correcoes','sentinela.eventos_auditoria','sentinela.ocorrencia_naturezas',
   'sentinela_import_local.requests','sentinela_exclusao.comprovantes'
 ]::regclass[]) t JOIN pg_class c ON c.oid=t WHERE NOT (row_security_active(t) AND c.relrowsecurity AND c.relforcerowsecurity))
 THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
END $$;




-- FUNCTION sentinela_exclusao.historico(integer)
CREATE FUNCTION sentinela_exclusao.historico(pagina integer) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
 PERFORM sentinela_exclusao.exigir_ambiente();
 IF pagina IS NULL OR pagina NOT BETWEEN 1 AND 1000000 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
 RETURN (SELECT jsonb_build_object('pagina',pagina,'total',(SELECT count(*) FROM sentinela_exclusao.comprovantes),
   'itens',coalesce(jsonb_agg(to_jsonb(c) ORDER BY momento DESC,id DESC),'[]')) FROM (
   SELECT * FROM sentinela_exclusao.comprovantes ORDER BY momento DESC,id DESC LIMIT 25 OFFSET (pagina-1)*25
 ) c);
END $$;




-- FUNCTION sentinela_exclusao.plano(uuid)
CREATE FUNCTION sentinela_exclusao.plano(alvo uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
WITH lote AS MATERIALIZED (
 SELECT l.id,l.nome_arquivo,l.competencia,l.versao_contrato,l.extracao_id,x.fonte,l.sha256_arquivo,x.sha256_xml
 FROM sentinela.lotes_importacao l JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id WHERE l.id=alvo
), execucoes AS MATERIALIZED (
 SELECT e.id,e.status FROM sentinela.execucoes_importacao e WHERE e.lote_id=alvo
), staging AS MATERIALIZED (
 SELECT s.id,s.linha_origem_id,s.ocorrencia_id,nullif(s.campos_csv->>'ocorrencia_chave','') AS candidata
 FROM sentinela.linhas_staging s WHERE s.lote_id=alvo
), origens AS MATERIALIZED (
 SELECT DISTINCT linha_origem_id AS id FROM staging
), compartilhadas AS MATERIALIZED (
 SELECT DISTINCT o.id FROM origens o JOIN sentinela.linhas_staging s ON s.linha_origem_id=o.id WHERE s.lote_id<>alvo
), apoio_ativo AS MATERIALIZED (
 SELECT DISTINCT outro.linha_origem_id AS id
 FROM compartilhadas c JOIN sentinela.linhas_staging outro ON outro.linha_origem_id=c.id
 JOIN sentinela.execucoes_importacao e ON e.id=outro.execucao_id
 WHERE outro.lote_id<>alvo AND e.status='concluida'
), exclusivas AS MATERIALIZED (
 SELECT id FROM origens EXCEPT SELECT id FROM compartilhadas
), extracoes AS MATERIALIZED (
 SELECT l.extracao_id AS id FROM lote l WHERE NOT EXISTS (
   SELECT FROM sentinela.lotes_importacao outro WHERE outro.extracao_id=l.extracao_id AND outro.id<>alvo)
), pendencias AS MATERIALIZED (
 SELECT p.id,p.ocorrencia_id FROM sentinela.pendencias_revisao p WHERE p.linha_origem_id IN (SELECT id FROM exclusivas)
), correcoes AS MATERIALIZED (
 SELECT h.id,h.staging_id FROM sentinela.historico_correcoes h
 WHERE h.staging_id IN (SELECT id FROM staging) OR h.pendencia_id IN (SELECT id FROM pendencias)
), recibos AS MATERIALIZED (
 SELECT r.request AS id FROM sentinela_import_local.requests r
 WHERE r.receipt->>'lot'=alvo::text OR r.receipt->>'run' IN (SELECT id::text FROM execucoes)
), eventos_diretos AS MATERIALIZED (
 SELECT a.id,a.ocorrencia_id,a.request_id,a.servico FROM sentinela.eventos_auditoria a
 WHERE a.execucao_id IN (SELECT id FROM execucoes) OR a.linha_origem_id IN (SELECT id FROM exclusivas)
   OR a.pendencia_id IN (SELECT id FROM pendencias) OR a.correcao_id IN (SELECT id FROM correcoes)
   OR a.depois->>'loteId'=alvo::text OR a.depois->>'lot'=alvo::text
   OR a.depois->>'run' IN (SELECT id::text FROM execucoes) OR a.depois->>'stagingId' IN (SELECT id::text FROM staging)
), eventos AS MATERIALIZED (
 SELECT id,ocorrencia_id FROM eventos_diretos
 UNION
 SELECT a.id,a.ocorrencia_id FROM sentinela.eventos_auditoria a
 WHERE (a.servico='pcdf-local' AND a.acao='tentativa_pcdf' AND a.request_id IN (
     SELECT e.request_id FROM eventos_diretos e WHERE e.servico='pcdf-local'))
   OR (a.servico='importacao-geral-local' AND a.request_id IN (SELECT id::text FROM recibos))
), consolidacao AS MATERIALIZED (
 SELECT n.ocorrencia_id AS id FROM sentinela.ocorrencia_naturezas n
 WHERE n.linha_origem_id IN (SELECT id FROM exclusivas)
 OR (n.linha_origem_id IN (SELECT id FROM compartilhadas) AND n.linha_origem_id NOT IN (SELECT id FROM apoio_ativo))
 UNION
 SELECT s.ocorrencia_id FROM staging s WHERE s.ocorrencia_id IS NOT NULL AND NOT EXISTS (
  SELECT FROM sentinela.ocorrencia_naturezas n WHERE n.ocorrencia_id=s.ocorrencia_id AND n.linha_origem_id=s.linha_origem_id
    AND n.linha_origem_id IN (SELECT id FROM apoio_ativo))
 UNION
 SELECT ocorrencia_id FROM pendencias WHERE ocorrencia_id IS NOT NULL
 UNION
 SELECT ocorrencia_id FROM eventos WHERE ocorrencia_id IS NOT NULL
), dependencias AS (
 SELECT 'consolidacao' AS tipo,id::text FROM consolidacao
 UNION ALL SELECT 'execucao_ativa',id::text FROM execucoes WHERE status NOT IN ('concluida','falhou','cancelada')
 UNION ALL SELECT 'origem_sem_lote',o.id::text FROM sentinela.linhas_origem o
   WHERE o.extracao_id IN (SELECT id FROM extracoes) AND o.id NOT IN (SELECT id FROM exclusivas)
 UNION ALL SELECT 'historico_compartilhado',id::text FROM correcoes
   WHERE staging_id IS NULL OR staging_id NOT IN (SELECT id FROM staging)

 UNION ALL SELECT 'dependencia_desconhecida',v FROM sentinela_exclusao.vinculos_inesperados() v
 UNION ALL SELECT 'lote_protegido',id::text FROM lote WHERE fonte='PCDF' AND competencia=DATE '2021-01-01'
 UNION ALL SELECT 'dependencia_desconhecida','Contrato ou origem fora do escopo: '||versao_contrato FROM lote
  WHERE (fonte,versao_contrato) NOT IN (('PCDF','1.0'),('PCDF','2.0'),('IMPORTACAO-GERAL-LOCAL','geral-v1'))
 UNION ALL SELECT 'historico_compartilhado',a.id::text
 FROM sentinela.eventos_auditoria a JOIN eventos e ON e.id=a.id
 WHERE (a.execucao_id IS NOT NULL AND a.execucao_id NOT IN (SELECT id FROM execucoes))
  OR (a.pendencia_id IS NOT NULL AND a.pendencia_id NOT IN (SELECT id FROM pendencias))
  OR (a.correcao_id IS NOT NULL AND a.correcao_id NOT IN (SELECT id FROM correcoes))
  OR (a.linha_origem_id IS NOT NULL AND a.linha_origem_id NOT IN (SELECT id FROM origens))
  OR (a.depois->>'loteId' IS NOT NULL AND a.depois->>'loteId'<>alvo::text)
  OR (a.depois->>'lot' IS NOT NULL AND a.depois->>'lot'<>alvo::text)
  OR (a.depois->>'run' IS NOT NULL AND a.depois->>'run' NOT IN (SELECT id::text FROM execucoes))
  OR (a.depois->>'stagingId' IS NOT NULL AND a.depois->>'stagingId' NOT IN (SELECT id::text FROM staging))
 UNION ALL SELECT 'historico_compartilhado',r.request::text
 FROM sentinela_import_local.requests r CROSS JOIN lote l
 WHERE l.fonte='IMPORTACAO-GERAL-LOCAL'
  AND ((r.request IN (SELECT id FROM recibos) AND
       (r.receipt->>'lot' IS DISTINCT FROM alvo::text OR NOT EXISTS(SELECT FROM execucoes WHERE id::text=r.receipt->>'run')))
    OR (r.receipt IS NULL AND r.metadata->>'sheetKey'=l.sha256_xml))
 UNION ALL SELECT 'historico_compartilhado',a.id::text
 FROM sentinela.eventos_auditoria a CROSS JOIN lote l
 WHERE l.fonte='PCDF' AND a.servico='pcdf-local' AND a.acao='tentativa_pcdf'
  AND a.depois->>'sha256'=l.sha256_arquivo AND a.depois->>'month'=to_char(l.competencia,'YYYY-MM')
  AND a.id NOT IN (SELECT id FROM eventos)
  AND NOT EXISTS (SELECT FROM sentinela.eventos_auditoria b WHERE b.servico=a.servico AND b.request_id=a.request_id
     AND b.acao IN ('staging_pcdf','reenvio_pcdf'))
), escopo AS (
 SELECT 'lotes' AS grupo,id::text FROM lote
 UNION ALL SELECT 'execucoes',id::text FROM execucoes
 UNION ALL SELECT 'staging',id::text FROM staging
 UNION ALL SELECT 'origens',id::text FROM exclusivas
 UNION ALL SELECT 'extracoes',id::text FROM extracoes
 UNION ALL SELECT 'pendencias',id::text FROM pendencias
 UNION ALL SELECT 'correcoes',id::text FROM correcoes
 UNION ALL SELECT 'recibos',id::text FROM recibos
 UNION ALL SELECT 'auditorias',id::text FROM eventos
), grupos AS (
 SELECT nome,coalesce(jsonb_agg(e.id ORDER BY e.id) FILTER (WHERE e.id IS NOT NULL),'[]') AS ids
 FROM unnest(ARRAY['lotes','execucoes','staging','origens','extracoes','pendencias','correcoes','inativacoes',
   'recibos','entregas','aprovacoes','auditorias']) nome LEFT JOIN escopo e ON e.grupo=nome GROUP BY nome
)
SELECT jsonb_build_object('id',l.id,'arquivo',l.nome_arquivo,'competencia',to_char(l.competencia,'YYYY-MM'),
 'contrato',l.versao_contrato,'candidatas',(SELECT count(DISTINCT candidata) FROM staging),
 'compartilhadas',(SELECT count(*) FROM compartilhadas),
 'artefatos',0,
 'escopo',(SELECT jsonb_object_agg(nome,ids) FROM grupos),
 'apoio',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM compartilhadas),
 'bloqueios',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.tipo,d.id),'[]') FROM dependencias d))
FROM lote l
$$;




-- FUNCTION sentinela_exclusao.previa(uuid, uuid, text)
CREATE FUNCTION sentinela_exclusao.previa(alvo uuid, p_usuario uuid, p_conta text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE plano jsonb;
BEGIN
 PERFORM sentinela_exclusao.exigir_ambiente();
 IF sentinela_gestao_autorizacao.capacidade(p_usuario,p_conta) IS DISTINCT FROM true
   THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
 plano:=sentinela_exclusao.plano(alvo);
 RETURN plano - ARRAY['escopo','apoio','artefatos'] || jsonb_build_object(
   'revisao',sentinela_exclusao.revisao(plano),
   'autorizada',sentinela_gestao_autorizacao.lote_aprovado(alvo,p_usuario,sentinela_exclusao.revisao(plano)),
      'dataImportacao',(SELECT criado_em FROM sentinela.lotes_importacao WHERE id=alvo),
      'dependencias',ARRAY(SELECT DISTINCT c.conrelid::regclass::text FROM pg_constraint c
        WHERE c.contype='f' AND c.confrelid IN (
          'sentinela.extracoes_origem'::regclass,'sentinela.lotes_importacao'::regclass,'sentinela.execucoes_importacao'::regclass,
          'sentinela.linhas_origem'::regclass,'sentinela.linhas_staging'::regclass,'sentinela.pendencias_revisao'::regclass,
          'sentinela.historico_correcoes'::regclass,'sentinela.eventos_auditoria'::regclass)
        ORDER BY c.conrelid::regclass::text),
      'excecao',CASE WHEN alvo='a88ac192-edef-4339-8381-106bbd1b391e' THEN jsonb_build_object(
        'elegivel',p_usuario='29e7ec39-192b-4790-9180-3df950969bfc' AND sentinela_exclusao.excecao_pontual_jan2021(plano),
        'validade',sentinela_gestao_autorizacao.validade_jan2021(alvo,p_usuario,sentinela_exclusao.revisao(plano))) END,
   'quantidades',sentinela_exclusao.quantidades(plano),
   'bloqueios',(SELECT coalesce(jsonb_agg(b ORDER BY b.tipo),'[]') FROM (
     SELECT tipo,count(*) AS quantidade,(array_agg(id ORDER BY id))[1:10] AS ids
     FROM jsonb_to_recordset(plano->'bloqueios') AS d(tipo text,id text) WHERE NOT (sentinela_exclusao.excecao_pontual_jan2021(plano) AND sentinela_gestao_autorizacao.lote_aprovado(alvo,p_usuario,sentinela_exclusao.revisao(plano))) GROUP BY tipo
   ) b));
END $$;




-- FUNCTION sentinela_exclusao.quantidades(jsonb)
CREATE FUNCTION sentinela_exclusao.quantidades(plano jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $$
 SELECT jsonb_object_agg(grupo,jsonb_array_length(ids)) || jsonb_build_object('artefatos',plano->'artefatos')
 FROM jsonb_each(plano->'escopo') e(grupo,ids)
$$;




-- FUNCTION sentinela_exclusao.revisao(jsonb)
CREATE FUNCTION sentinela_exclusao.revisao(plano jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $$
 SELECT encode(sha256(convert_to(plano::text,'UTF8')),'hex')
$$;




-- FUNCTION sentinela_exclusao.vinculos_inesperados()
CREATE FUNCTION sentinela_exclusao.vinculos_inesperados() RETURNS SETOF text
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 WITH esperadas(nome,tabela,colunas,alvo,chave) AS (VALUES
  ('eventos_auditoria_correcao_id_fkey','eventos_auditoria','correcao_id','historico_correcoes','id'),
  ('eventos_auditoria_execucao_id_fkey','eventos_auditoria','execucao_id','execucoes_importacao','id'),
  ('eventos_auditoria_linha_origem_id_fkey','eventos_auditoria','linha_origem_id','linhas_origem','id'),
  ('eventos_auditoria_pendencia_id_fkey','eventos_auditoria','pendencia_id','pendencias_revisao','id'),
  ('execucoes_importacao_lote_id_extracao_id_fkey','execucoes_importacao','lote_id, extracao_id','lotes_importacao','id, extracao_id'),
  ('historico_correcoes_pendencia_id_fkey','historico_correcoes','pendencia_id','pendencias_revisao','id'),
  ('historico_correcoes_staging_id_fkey','historico_correcoes','staging_id','linhas_staging','id'),
  ('linhas_origem_extracao_id_fkey','linhas_origem','extracao_id','extracoes_origem','id'),
  ('linhas_staging_execucao_id_lote_id_extracao_id_fkey','linhas_staging','execucao_id, lote_id, extracao_id','execucoes_importacao','id, lote_id, extracao_id'),
  ('linhas_staging_linha_origem_id_extracao_id_fkey','linhas_staging','linha_origem_id, extracao_id','linhas_origem','id, extracao_id'),
  ('lotes_importacao_extracao_id_fkey','lotes_importacao','extracao_id','extracoes_origem','id'),
  ('ocorrencia_naturezas_linha_origem_id_fkey','ocorrencia_naturezas','linha_origem_id','linhas_origem','id'),
  ('pendencias_revisao_linha_origem_id_fkey','pendencias_revisao','linha_origem_id','linhas_origem','id')
 ), atuais AS (
  SELECT c.conname::text AS nome,c.conrelid,pg_get_constraintdef(c.oid) AS definicao
  FROM pg_constraint c
  WHERE c.contype='f' AND c.confrelid IN (
    'sentinela.extracoes_origem'::regclass,'sentinela.lotes_importacao'::regclass,'sentinela.execucoes_importacao'::regclass,
    'sentinela.linhas_origem'::regclass,'sentinela.linhas_staging'::regclass,'sentinela.pendencias_revisao'::regclass,
    'sentinela.historico_correcoes'::regclass,'sentinela.eventos_auditoria'::regclass,
    'sentinela_import_local.requests'::regclass)
 ), contrato AS (
  SELECT nome,format('sentinela.%I',tabela)::regclass::oid AS conrelid,
    format('FOREIGN KEY (%s) REFERENCES sentinela.%I(%s)',colunas,alvo,chave) AS definicao
  FROM esperadas
 ), faltantes AS (SELECT * FROM contrato EXCEPT SELECT * FROM atuais),
 excedentes AS (SELECT * FROM atuais EXCEPT SELECT * FROM contrato)
 SELECT 'Ausente ou alterada: '||nome FROM faltantes
 UNION ALL SELECT conrelid::regclass::text||'.'||nome FROM excedentes
$$;




-- FUNCTION sentinela_gestao.acoes(text, jsonb)
CREATE FUNCTION sentinela_gestao.acoes(area text, pagina jsonb) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT pagina||jsonb_build_object('itens',coalesce(jsonb_agg(
  CASE WHEN a.alvo IS NULL THEN i.item ELSE i.item||jsonb_build_object('acoes',jsonb_build_object(
   'editar',(a.alvo->>'editavel')::boolean,'inativar',false)) END ORDER BY i.ord),'[]'))
 FROM jsonb_array_elements(pagina->'itens') WITH ORDINALITY i(item,ord)
 CROSS JOIN LATERAL (SELECT sentinela_gestao.alvo(area,(i.item->>'id')::uuid) AS alvo OFFSET 0) a;
$$;




-- FUNCTION sentinela_gestao.alvo(text, uuid)
CREATE FUNCTION sentinela_gestao.alvo(p_area text, p_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE campos jsonb;
BEGIN
 IF session_user NOT IN ('sentinela_local_admin','sentinela_local_operator')
 OR (p_area<>'manuais' AND session_user<>'sentinela_local_admin') THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
 IF p_area='importados' THEN
  campos:=sentinela_gestao.associacao(p_id);
  IF campos IS NULL THEN RETURN NULL; END IF;
  RETURN (SELECT campos || jsonb_build_object('id',s.id,'identificacao','Associação '||s.registro_csv,
   'vinculos',(SELECT count(*) FROM sentinela.linhas_staging a WHERE a.lote_id=s.lote_id AND a.execucao_id=s.execucao_id
    AND (a.id=s.id OR (nullif(s.campos_csv->>'ocorrencia_chave','') IS NOT NULL
     AND a.campos_csv->>'ocorrencia_chave'=s.campos_csv->>'ocorrencia_chave'))),
   'versao',NULL,'editavel',s.estado<>'consolidada' AND NOT EXISTS(SELECT FROM sentinela.ocorrencia_naturezas a WHERE a.linha_origem_id=s.linha_origem_id))
   || sentinela_gestao.impacto(NULL,p_id) FROM sentinela.linhas_staging s WHERE s.id=p_id);
 END IF;
 RETURN NULL;
END $$;




-- FUNCTION sentinela_gestao.arquivo(uuid)
CREATE FUNCTION sentinela_gestao.arquivo(p_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT (to_jsonb(l)-ARRAY['linhas_lidas','pendencias_detectadas','sha_xml','extracao_id']) ||
 sentinela_gestao.contagens(execucao,fonte,contrato,linhas_lidas,pendencias_detectadas) ||
 sentinela_gestao.impacto(l.id,NULL) || jsonb_build_object('shaXml',l.sha_xml,
 'manifesto',(SELECT e.depois->>'manifestSha' FROM sentinela.eventos_auditoria e
   WHERE e.servico='pcdf-local' AND e.execucao_id=l.execucao AND e.depois->>'manifestSha' IS NOT NULL ORDER BY e.registrado_em LIMIT 1),
 'pacote',NULL,
 'tentativas',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'numero',e.tentativa,'situacao',e.status,'data',e.criado_em)
   ORDER BY e.tentativa) FROM sentinela.execucoes_importacao e WHERE e.lote_id=l.id),'[]'),
 'historico',coalesce((SELECT jsonb_agg(h.item ORDER BY h.registrado_em DESC,h.id DESC) FROM (
   SELECT e.id,e.registrado_em,jsonb_build_object('acao',e.acao,'data',e.registrado_em,'justificativa',e.justificativa,
    'responsavel',coalesce(e.depois->>'login',u.nome_exibicao)) AS item
   FROM sentinela.eventos_auditoria e LEFT JOIN sentinela.usuarios u ON u.id=e.usuario_id
   WHERE (e.execucao_id IN (SELECT r.id FROM sentinela.execucoes_importacao r WHERE r.lote_id=l.id)
     OR e.depois->>'loteId'=l.id::text OR e.depois->>'lot'=l.id::text)
   ORDER BY e.registrado_em DESC,e.id DESC LIMIT 100
 ) h),'[]'))
 FROM sentinela_gestao.lotes l WHERE l.id=p_id AND session_user IN ('sentinela_local_admin','sentinela_local_operator')
$$;




-- FUNCTION sentinela_gestao.arquivos(jsonb)
CREATE FUNCTION sentinela_gestao.arquivos(p jsonb) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 WITH filtrados AS MATERIALIZED (
 SELECT l.* FROM sentinela_gestao.lotes l
 WHERE session_user IN ('sentinela_local_admin','sentinela_local_operator')
 AND (p->>'busca' IS NULL OR strpos(lower(l.arquivo||' '||l.id::text),lower(p->>'busca'))>0)
 AND (p->>'competencia' IS NULL OR l.competencia=p->>'competencia')
 AND (p->>'situacao' IS NULL OR l.situacao=p->>'situacao')
 AND (p->>'dataInicial' IS NULL OR (l.data AT TIME ZONE 'America/Sao_Paulo')::date>=(p->>'dataInicial')::date)
 AND (p->>'dataFinal' IS NULL OR (l.data AT TIME ZONE 'America/Sao_Paulo')::date<=(p->>'dataFinal')::date)
 ), pagina AS (
 SELECT * FROM filtrados ORDER BY data DESC,id DESC LIMIT 25 OFFSET (greatest(1,(p->>'pagina')::int)-1)*25
 )
 SELECT jsonb_build_object('pagina',(p->>'pagina')::int,'total',(SELECT count(*) FROM filtrados),'itens',coalesce((
 SELECT jsonb_agg((to_jsonb(l)-ARRAY['linhas_lidas','pendencias_detectadas','sha256','bytes','fonte','sha_xml','extracao_id']) ||
 sentinela_gestao.contagens(execucao,fonte,contrato,linhas_lidas,pendencias_detectadas) ORDER BY data DESC,id DESC) FROM pagina l),'[]'))
$$;




-- FUNCTION sentinela_gestao.associacao(uuid)
CREATE FUNCTION sentinela_gestao.associacao(p_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT jsonb_build_object('data',s.derivados_efetivos->>'data','horario',s.derivados_efetivos->>'horario',
 'natureza',nullif(o.natureza_original,''),'local',coalesce(s.derivados_efetivos->>'local',nullif(s.campos_csv->>'local',''))) ||
 coalesce((SELECT e.depois->'campos' FROM sentinela.eventos_auditoria e
 WHERE e.ator_tipo='usuario' AND e.depois->>'operacao'='gestao-importacao' AND e.acao='corrigir_associacao' AND e.depois->>'stagingId'=s.id::text
 ORDER BY e.registrado_em DESC,e.id DESC LIMIT 1),'{}')
 FROM sentinela.linhas_staging s JOIN sentinela.linhas_origem o ON o.id=s.linha_origem_id
 JOIN sentinela.extracoes_origem x ON x.id=s.extracao_id JOIN sentinela.execucoes_importacao r ON r.id=s.execucao_id
 WHERE x.fonte='PCDF' AND s.id=p_id AND r.status='concluida'

$$;




-- FUNCTION sentinela_gestao.contagens(uuid, text, text, bigint, bigint)
CREATE FUNCTION sentinela_gestao.contagens(p_exec uuid, p_fonte text, p_contrato text, p_lidas bigint, p_pendencias bigint) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT jsonb_build_object('recebidos',coalesce(p_lidas,0),'pendencias',coalesce(p_pendencias,0),
 'candidatas',CASE WHEN p_fonte='PCDF' THEN count(DISTINCT nullif(s.campos_csv->>'ocorrencia_chave','')) END,
 'novas',CASE WHEN p_contrato='2.0' THEN count(*) FILTER(WHERE s.derivados_efetivos->>'recepcao' IN ('nova_origem','nova_associacao_candidata_conhecida')) END,
 'reutilizadas',CASE WHEN p_contrato='2.0' THEN count(*) FILTER(WHERE s.derivados_efetivos->>'recepcao'='origem_reutilizada') END)
 FROM sentinela.linhas_staging s WHERE s.execucao_id=p_exec
$$;




-- FUNCTION sentinela_gestao.contexto(text, uuid)
CREATE FUNCTION sentinela_gestao.contexto(area text, alvo uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE resultado jsonb:=sentinela_gestao.alvo(area,alvo); vinculos jsonb;
BEGIN
 IF resultado IS NULL THEN RETURN NULL; END IF;
 IF area='importados' THEN
  RETURN resultado||jsonb_build_object('historico',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id',h.id,'acao',h.acao,'data',h.registrado_em,'justificativa',h.justificativa,'responsavel',h.usuario_id::text,'conta',h.depois->>'conta',
   'antes',h.antes,'depois',h.depois->'campos') ORDER BY h.registrado_em DESC,h.id DESC)
   FROM (SELECT e.* FROM sentinela.eventos_auditoria e WHERE e.ator_tipo='usuario' AND e.depois->>'operacao'='gestao-importacao'
    AND e.acao IN ('corrigir_associacao','inativar_associacao') AND e.depois->>'stagingId'=alvo::text
    ORDER BY e.registrado_em DESC,e.id DESC LIMIT 100) h),'[]'));
 END IF;
 RETURN resultado;
END $$;




-- FUNCTION sentinela_gestao.impacto(uuid, uuid)
CREATE FUNCTION sentinela_gestao.impacto(p_lote uuid, p_staging uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 WITH linhas AS (
  SELECT s.linha_origem_id,s.campos_csv FROM sentinela.linhas_staging s
  WHERE (s.lote_id=p_lote OR s.id=p_staging)
 ), afetadas AS (
  SELECT DISTINCT linha_origem_id FROM linhas
 ), compartilhadas AS (
  SELECT DISTINCT s.linha_origem_id,s.lote_id FROM sentinela.linhas_staging s
  JOIN afetadas a USING(linha_origem_id) JOIN sentinela.execucoes_importacao e ON e.id=s.execucao_id
  WHERE s.lote_id IS DISTINCT FROM p_lote AND s.id IS DISTINCT FROM p_staging AND e.status='concluida'
 ), consolidadas AS (
  SELECT n.id,a.linha_origem_id FROM afetadas a JOIN sentinela.ocorrencia_naturezas n USING(linha_origem_id)
  JOIN sentinela.ocorrencias o ON o.id=n.ocorrencia_id WHERE o.ativo
 )
 SELECT jsonb_build_object('compartilhadas',(SELECT count(DISTINCT linha_origem_id) FROM compartilhadas),
 'lotesRelacionados',(SELECT count(DISTINCT lote_id) FROM compartilhadas),
 'recebidosAfetados',(SELECT count(*) FROM linhas),
 'candidatasAfetadas',(SELECT count(DISTINCT nullif(campos_csv->>'ocorrencia_chave','')) FROM linhas),
 'pendenciasAfetadas',(SELECT count(*) FROM sentinela.pendencias_revisao p JOIN afetadas a ON a.linha_origem_id=p.linha_origem_id
  WHERE NOT EXISTS(SELECT FROM compartilhadas c WHERE c.linha_origem_id=a.linha_origem_id)),
 'vinculosConsolidados',(SELECT count(*) FROM consolidadas),
 'bloqueiaConsolidacao',EXISTS(SELECT FROM consolidadas a
 WHERE NOT EXISTS(SELECT FROM compartilhadas c WHERE c.linha_origem_id=a.linha_origem_id)),
 'revisao',encode(sha256(convert_to(jsonb_build_array(
  (SELECT coalesce(jsonb_agg(linha_origem_id ORDER BY linha_origem_id),'[]') FROM afetadas),
  (SELECT coalesce(jsonb_agg(jsonb_build_array(linha_origem_id,lote_id) ORDER BY linha_origem_id,lote_id),'[]') FROM compartilhadas),
  (SELECT coalesce(jsonb_agg(jsonb_build_array(n.id,o.ativo) ORDER BY n.id),'[]') FROM afetadas a
   JOIN sentinela.ocorrencia_naturezas n USING(linha_origem_id) JOIN sentinela.ocorrencias o ON o.id=n.ocorrencia_id),
  (SELECT e.id FROM sentinela.eventos_auditoria e WHERE e.ator_tipo='usuario' AND e.depois->>'operacao'='gestao-importacao'
   AND e.acao='corrigir_associacao' AND e.depois->>'stagingId'=p_staging::text ORDER BY e.registrado_em DESC,e.id DESC LIMIT 1)
 )::text,'UTF8')),'hex'))
$$;




-- FUNCTION sentinela_gestao.mutar(jsonb, text, uuid)
CREATE FUNCTION sentinela_gestao.mutar(p jsonb, p_conta text, p_usuario uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE alvo uuid:=(p->>'id')::uuid; motivo text:=btrim(p->>'justificativa');
 auditoria uuid:=gen_random_uuid(); contexto jsonb; antes jsonb; depois jsonb; alteracoes jsonb;
 staging sentinela.linhas_staging;
BEGIN
 PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,p_conta);
 IF p->>'acao' IS DISTINCT FROM 'corrigir_associacao' OR alvo IS NULL
    OR jsonb_typeof(p->'justificativa') IS DISTINCT FROM 'string'
    OR NOT coalesce(length(motivo) BETWEEN 1 AND 500,false)
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
  contexto:=sentinela_gestao.alvo('importados',alvo);
  IF contexto IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002'; END IF;
  IF p->>'revisao' IS DISTINCT FROM contexto->>'revisao'
   OR (contexto->>'editavel')::boolean IS DISTINCT FROM true
  THEN RAISE EXCEPTION USING ERRCODE='40001'; END IF;
  SELECT * INTO staging FROM sentinela.linhas_staging WHERE id=alvo;
  IF p?'lote' AND (p->>'lote')::uuid IS DISTINCT FROM staging.lote_id
  THEN RAISE EXCEPTION USING ERRCODE='P0002'; END IF;
  antes:=sentinela_gestao.associacao(alvo);
  depois:=jsonb_build_object('loteId',staging.lote_id,'stagingId',alvo);
   alteracoes:=p->'alteracoes';
   IF jsonb_typeof(alteracoes) IS DISTINCT FROM 'object' OR alteracoes='{}' OR
    (alteracoes-ARRAY['data','horario','natureza','local'])<>'{}'
    OR (alteracoes?'data' AND NOT coalesce(alteracoes->>'data'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND isfinite((alteracoes->>'data')::date),false))
    OR (alteracoes?'horario' AND alteracoes->'horario'<>'null' AND NOT coalesce(alteracoes->>'horario'~'^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$',false))
    OR (alteracoes?'natureza' AND NOT coalesce(jsonb_typeof(alteracoes->'natureza')='string' AND length(btrim(alteracoes->>'natureza')) BETWEEN 1 AND 240,false))
    OR (alteracoes?'local' AND alteracoes->'local'<>'null' AND NOT coalesce(jsonb_typeof(alteracoes->'local')='string' AND length(alteracoes->>'local')<=240,false))
   THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
   IF antes=antes||alteracoes THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
   depois:=depois||jsonb_build_object('campos',antes||alteracoes,'alteracoes',alteracoes);

 INSERT INTO sentinela.eventos_auditoria(id,ator_tipo,usuario_id,acao,linha_origem_id,execucao_id,antes,depois,justificativa,request_id)
 VALUES(auditoria,'usuario',p_usuario,'corrigir_associacao',staging.linha_origem_id,staging.execucao_id,
  antes,depois||jsonb_build_object('operacao','gestao-importacao','conta',p_conta),motivo,auditoria::text);
 RETURN jsonb_build_object('id',alvo,'auditoria',auditoria);
END $_$;




-- FUNCTION sentinela_gestao_autorizacao.capacidade(uuid, text)
CREATE FUNCTION sentinela_gestao_autorizacao.capacidade(p_usuario uuid, p_conta text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT session_user='sentinela_local_admin'
 AND p_usuario=sentinela_ambiente.ator_importacao()
 AND sentinela_ambiente.vinculado()
 AND sentinela_ambiente.vinculado()
 AND NOT pg_is_in_recovery()
 AND EXISTS (
   SELECT FROM sentinela_gestao_autorizacao.release r
   JOIN sentinela_gestao_autorizacao.atores a ON a.usuario=p_usuario
   JOIN sentinela.usuarios u ON u.id=a.usuario AND u.auth_user_id=a.identidade
   WHERE r.aberta AND sentinela_ambiente.vinculado()
      AND r.cluster_uuid=sentinela_ambiente.instalacao()
      AND r.system_id=sentinela_ambiente.sistema()
      AND a.validade>statement_timestamp() AND a.conta=p_conta AND u.ativo AND u.perfil='Administrador'
 )
$$;




-- FUNCTION sentinela_gestao_autorizacao.consumir(uuid, uuid, text, text)
CREATE FUNCTION sentinela_gestao_autorizacao.consumir(p_lote uuid, p_usuario uuid, p_conta text, p_revisao text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
 PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,p_conta);
 DELETE FROM sentinela_gestao_autorizacao.exclusoes
 WHERE lote=p_lote AND usuario=p_usuario AND revisao=p_revisao AND validade>clock_timestamp() AND excecao_jan2021=(p_lote='a88ac192-edef-4339-8381-106bbd1b391e');
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
END $$;




-- FUNCTION sentinela_gestao_autorizacao.emitir_jan2021(uuid, uuid, text, text, text)
CREATE FUNCTION sentinela_gestao_autorizacao.emitir_jan2021(p_lote uuid, p_usuario uuid, p_conta text, p_revisao text, p_backup text) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE v_validade timestamptz;
BEGIN
  PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,p_conta);
  IF p_lote IS DISTINCT FROM 'a88ac192-edef-4339-8381-106bbd1b391e'::uuid
    OR p_usuario IS DISTINCT FROM '29e7ec39-192b-4790-9180-3df950969bfc'::uuid
    OR p_revisao IS DISTINCT FROM 'e7de205ec3812ec78740c4041868f3982e3e964602c1b7a9c61f80d426e0ed71'
    OR p_backup IS DISTINCT FROM 'fa4ed26293a1e09e49b35963fedd58a37f0f72c29e2bade7386d4bdd96b08108'
  THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
  INSERT INTO sentinela_gestao_autorizacao.exclusoes(lote,usuario,revisao,aprovacao,prova_restauracao,validade,excecao_jan2021)
  SELECT p_lote,p_usuario,p_revisao,'Confirmação explícita do Administrador institucional na gestão de importações',
    p_backup,least(clock_timestamp()+interval '15 minutes',a.validade),true
  FROM sentinela_gestao_autorizacao.atores a WHERE a.usuario=p_usuario AND a.validade>clock_timestamp()
  ON CONFLICT(lote) DO UPDATE SET usuario=excluded.usuario,revisao=excluded.revisao,aprovacao=excluded.aprovacao,
    prova_restauracao=excluded.prova_restauracao,validade=excluded.validade,excecao_jan2021=true
  WHERE exclusoes.validade<=clock_timestamp()
  RETURNING validade INTO v_validade;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001'; END IF;
  RETURN v_validade;
END $$;




-- FUNCTION sentinela_gestao_autorizacao.exigir(uuid, text)
CREATE FUNCTION sentinela_gestao_autorizacao.exigir(p_usuario uuid, p_conta text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
 IF current_setting('transaction_read_only')<>'off' OR current_setting('transaction_isolation')<>'read committed'
   THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
 PERFORM FROM sentinela_gestao_autorizacao.release FOR SHARE;
 PERFORM FROM sentinela_gestao_autorizacao.atores WHERE usuario=p_usuario FOR SHARE;
 IF sentinela_gestao_autorizacao.capacidade(p_usuario,p_conta) IS DISTINCT FROM true
   THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
END $$;




-- FUNCTION sentinela_gestao_autorizacao.lote_aprovado(uuid, uuid, text)
CREATE FUNCTION sentinela_gestao_autorizacao.lote_aprovado(p_lote uuid, p_usuario uuid, p_revisao text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT session_user='sentinela_local_admin' AND EXISTS (
   SELECT FROM sentinela_gestao_autorizacao.exclusoes
   WHERE lote=p_lote AND usuario=p_usuario AND revisao=p_revisao AND validade>statement_timestamp() AND excecao_jan2021=(p_lote='a88ac192-edef-4339-8381-106bbd1b391e')
 )
$$;




-- FUNCTION sentinela_gestao_autorizacao.validade_jan2021(uuid, uuid, text)
CREATE FUNCTION sentinela_gestao_autorizacao.validade_jan2021(p_lote uuid, p_usuario uuid, p_revisao text) RETURNS timestamp with time zone
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT validade FROM sentinela_gestao_autorizacao.exclusoes
  WHERE session_user='sentinela_local_admin' AND lote=p_lote AND usuario=p_usuario AND revisao=p_revisao
    AND excecao_jan2021 AND validade>statement_timestamp()
$$;




-- FUNCTION sentinela_import_local.begin_request(uuid, uuid, jsonb, bytea, jsonb)
CREATE FUNCTION sentinela_import_local.begin_request(actor_id uuid, request_id uuid, meta jsonb, content bytea, batch jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE fingerprint text := encode(sha256(convert_to(batch::text,'UTF8')),'hex');
BEGIN
 PERFORM sentinela_import_local.check_actor(actor_id,false);
 IF NOT (meta ?& ARRAY['format','bytes','sha','sheetKey','context','name','headers','sheet'])
  OR meta->>'format' NOT IN ('csv','xlsx') OR (meta->>'bytes')::bigint NOT BETWEEN 1 AND 8388608
  OR meta->>'sha' !~ '^[0-9a-f]{64}$' OR meta->>'sheetKey' !~ '^[0-9a-f]{64}$'
  OR meta->>'context' !~ '^[0-9a-f]{64}$' OR length(meta->>'name') NOT BETWEEN 5 AND 240
  OR jsonb_typeof(meta->'headers') IS DISTINCT FROM 'array'
  OR (meta->>'bytes')::bigint IS DISTINCT FROM octet_length(content)
  OR meta->>'sha' IS DISTINCT FROM encode(sha256(content),'hex') OR fingerprint IS NULL
  OR EXISTS (SELECT FROM jsonb_array_elements_text(meta->'headers') h
    WHERE lower(regexp_replace(h,'[^a-zA-Z0-9]','','g')) IN ('linhaorigemid','linhaxml','abaorigem','versaotratamento'))
  OR meta->>'name' ~* 'pcdf[_ -]*naturezas'
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
 INSERT INTO sentinela_import_local.requests(request,subject,actor,metadata)
 VALUES(request_id,actor_id,CASE session_user WHEN 'sentinela_local_admin' THEN 'Administrador' ELSE 'Operador' END,
   meta || jsonb_build_object('batchHash',fingerprint))
 ON CONFLICT(request) DO NOTHING;
 IF NOT EXISTS (SELECT FROM sentinela_import_local.requests q WHERE q.request=request_id AND q.subject=actor_id
   AND q.metadata->>'sha'=meta->>'sha' AND q.metadata->>'context'=meta->>'context'
   AND q.metadata->>'batchHash'=fingerprint)
 THEN RAISE EXCEPTION USING ERRCODE='23505'; END IF;
 IF FOUND THEN
  INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,depois,justificativa,request_id)
    VALUES('servico','importacao-geral-local','tentativa_importacao_geral',
      jsonb_build_object('subject',actor_id,'sha',meta->>'sha'),'Recepção de arquivo geral',request_id::text);
 END IF;
END $_$;




-- FUNCTION sentinela_import_local.check_actor(uuid, boolean)
CREATE FUNCTION sentinela_import_local.check_actor(subject_id uuid, admin_only boolean) RETURNS void
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
 IF session_user NOT IN ('sentinela_local_admin','sentinela_local_operator')
  OR (admin_only AND session_user<>'sentinela_local_admin')
  OR subject_id IS DISTINCT FROM sentinela_ambiente.ator_importacao()
  OR NOT EXISTS(SELECT FROM sentinela_general_accounts.individuals i WHERE i.subject=subject_id AND i.login=session_user)
 THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
END $$;




-- FUNCTION sentinela_import_local.detail(uuid, integer)
CREATE FUNCTION sentinela_import_local.detail(run_id uuid, first_row integer) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT jsonb_build_object('total',e.linhas_lidas,'headers',x.manifesto->'headers','rows',coalesce((
  SELECT jsonb_agg(page.campos_csv ORDER BY page.registro_csv)
  FROM (SELECT s.campos_csv,s.registro_csv FROM sentinela.linhas_staging s WHERE s.execucao_id=e.id
   ORDER BY s.registro_csv LIMIT 25 OFFSET first_row) page),'[]'::jsonb))
 FROM sentinela.execucoes_importacao e JOIN sentinela.extracoes_origem x ON x.id=e.extracao_id
 WHERE e.id=run_id AND session_user IN ('sentinela_local_admin','sentinela_local_operator');
$$;




-- FUNCTION sentinela_import_local.fail(uuid, uuid)
CREATE FUNCTION sentinela_import_local.fail(actor_id uuid, request_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
 PERFORM sentinela_import_local.check_actor(actor_id,false);
 UPDATE sentinela_import_local.requests SET status='falhou'
 WHERE request=request_id AND subject=actor_id AND status='recebida';
 IF FOUND THEN
  INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,depois,justificativa,request_id)
   VALUES('servico','importacao-geral-local','falha_importacao_geral',jsonb_build_object('subject',actor_id),
    'Gravação em staging não concluída',request_id::text);
 END IF;
END $$;




-- FUNCTION sentinela_import_local.history()
CREATE FUNCTION sentinela_import_local.history() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('request',request,'name',metadata->>'name','format',metadata->>'format',
 'sheet',metadata->>'sheet','actor',actor,'created',created,'status',status,'receipt',receipt) ORDER BY created DESC,request),'[]')
 FROM (SELECT * FROM sentinela_import_local.requests ORDER BY created DESC,request LIMIT 100) q;
$$;




-- FUNCTION sentinela_import_local.receive(uuid, uuid, jsonb)
CREATE FUNCTION sentinela_import_local.receive(actor_id uuid, request_id uuid, batch jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE meta jsonb; summary jsonb := batch->'summary'; amount integer := jsonb_array_length(batch->'rows');
 x uuid; l uuid; e uuid; v_receipt jsonb; copied bigint; problems bigint;
BEGIN
 PERFORM sentinela_import_local.check_actor(actor_id,false);
 SELECT q.metadata,q.receipt INTO meta,v_receipt FROM sentinela_import_local.requests q
   WHERE q.request=request_id AND q.subject=actor_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
 IF meta->>'batchHash' IS DISTINCT FROM encode(sha256(convert_to(batch::text,'UTF8')),'hex')
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
 IF v_receipt IS NOT NULL THEN RETURN v_receipt || '{"replay":true}'; END IF;
 IF amount IS NULL OR amount NOT BETWEEN 1 AND 10000 OR amount IS DISTINCT FROM (summary->>'total')::int
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('general:' || (meta->>'sheetKey'),0));
 SELECT x0.id,l0.id,e0.id INTO x,l,e
 FROM sentinela.extracoes_origem x0 JOIN sentinela.lotes_importacao l0 ON l0.extracao_id=x0.id
 JOIN sentinela.execucoes_importacao e0 ON e0.lote_id=l0.id
 WHERE x0.fonte='IMPORTACAO-GERAL-LOCAL' AND x0.sha256_xml=meta->>'sheetKey';
 IF FOUND THEN
  SELECT q.receipt INTO STRICT v_receipt FROM sentinela_import_local.requests q
   WHERE q.receipt->>'run'=e::text AND q.receipt->>'replay'='false';
  IF NOT EXISTS (SELECT FROM sentinela.extracoes_origem o WHERE o.id=x AND o.manifesto->>'context'=meta->>'context')
  THEN RAISE EXCEPTION USING ERRCODE='23505'; END IF;
  v_receipt := v_receipt || '{"replay":true}';
 ELSE
  INSERT INTO sentinela.extracoes_origem(fonte,nome_xml,sha256_xml,tamanho_bytes,referencia_arquivo,manifesto)
   VALUES ('IMPORTACAO-GERAL-LOCAL',meta->>'name',meta->>'sheetKey',(meta->>'bytes')::bigint,
     'sha256:'||(meta->>'sha'),meta) RETURNING id INTO x;
  INSERT INTO sentinela.lotes_importacao(extracao_id,nome_arquivo,sha256_arquivo,tamanho_bytes,referencia_arquivo,
   versao_contrato,versao_tratamento,competencia,linhas_esperadas,solicitado_por)
   VALUES(x,meta->>'name',meta->>'sha',(meta->>'bytes')::bigint,'sha256:'||(meta->>'sha'),
    'geral-v1','geral-v1',date_trunc('month',current_date::timestamp)::date,amount,actor_id) RETURNING id INTO l;
  INSERT INTO sentinela.execucoes_importacao(lote_id,extracao_id,tentativa,solicitado_por,versao_importador,versao_validacao,
   status,linhas_lidas,linhas_processadas,linhas_bloqueadas,pendencias_detectadas,checkpoint_registro_csv,finalizado_em)
   VALUES(l,x,1,actor_id,'geral-v1','geral-v1','concluida',amount,amount,amount,(summary->>'issues')::bigint,
    amount,clock_timestamp()) RETURNING id INTO e;

  INSERT INTO sentinela.linhas_origem(extracao_id,linha_origem_id,aba_origem,linha_xml,versao_identificador,estrutura_celulas)
   SELECT x,'geral:'||(meta->>'sheetKey')||':'||r.line,meta->>'sheet',r.line,'geral-v1',
    jsonb_build_object('headers',meta->'headers','cells',r.snapshot->'cells')
   FROM jsonb_to_recordset(batch->'rows') r(line bigint,snapshot jsonb);
  INSERT INTO sentinela.linhas_staging(execucao_id,lote_id,extracao_id,linha_origem_id,registro_csv,
    campos_csv,derivados_efetivos,diagnosticos,estado)
   SELECT e,l,x,o.id,row_number() OVER (ORDER BY r.line),r.snapshot,r.normalized,r.snapshot->'issues','bloqueada'
   FROM jsonb_to_recordset(batch->'rows') r(line bigint,snapshot jsonb, normalized jsonb)
   JOIN sentinela.linhas_origem o ON o.extracao_id=x AND o.linha_xml=r.line;
  GET DIAGNOSTICS copied=ROW_COUNT;
  INSERT INTO sentinela.pendencias_revisao(linha_origem_id,campo,regra,versao_regra,valor_original,motivo,tipo,prioridade,efeito)
   SELECT s.linha_origem_id,d.field,'geral-'||d.ord,'geral-v1',
    CASE WHEN d.col > 0 THEN s.campos_csv->'cells'->(d.col-1)->'value' END,
    d.message,CASE WHEN d.field IN ('data','horario') THEN 'datas_horarios'
      WHEN d.field IN ('latitude','longitude') THEN 'coordenadas'
      WHEN d.field IN ('ra','local') THEN 'endereco_ra'
      WHEN d.field='naturezas' THEN 'classificacao' WHEN d.field='duplicata' THEN 'identificacao' ELSE 'proveniencia' END,
    'media',CASE WHEN d.field='duplicata' THEN 'nao_bloqueante' ELSE 'bloqueia_consolidacao' END
   FROM sentinela.linhas_staging s CROSS JOIN LATERAL (
    SELECT j->>'field' AS field,(j->>'column')::int AS col,j->>'message' AS message,n::text AS ord
    FROM jsonb_array_elements(s.diagnosticos) WITH ORDINALITY a(j,n)
    UNION ALL SELECT 'duplicata',NULL,'Possível duplicata da linha '||(s.campos_csv->>'duplicateOf'),'duplicata'
    WHERE s.campos_csv ? 'duplicateOf'
   ) d WHERE s.execucao_id=e;
  GET DIAGNOSTICS problems=ROW_COUNT;
  IF copied<>amount OR problems IS DISTINCT FROM (summary->>'issues')::bigint OR EXISTS (
   SELECT FROM sentinela.linhas_staging s JOIN sentinela.linhas_origem o ON o.id=s.linha_origem_id
   JOIN jsonb_to_recordset(batch->'rows') r(line bigint,snapshot jsonb,normalized jsonb) ON r.line=o.linha_xml
   WHERE s.execucao_id=e AND (s.campos_csv IS DISTINCT FROM r.snapshot
      OR s.derivados_efetivos IS DISTINCT FROM r.normalized OR o.estrutura_celulas->'cells' IS DISTINCT FROM r.snapshot->'cells')
  ) THEN RAISE EXCEPTION USING ERRCODE='23514'; END IF;
  v_receipt := jsonb_build_object('lot',l,'run',e,'persisted',copied,'summary',summary,'replay',false);
 END IF;
 UPDATE sentinela_import_local.requests q SET status='concluida',receipt=v_receipt WHERE q.request=request_id;
 INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,execucao_id,depois,justificativa,request_id)
 VALUES('servico','importacao-geral-local',CASE WHEN (v_receipt->>'replay')::boolean THEN 'reenvio_geral' ELSE 'staging_geral' END,
  e,v_receipt||jsonb_build_object('subject',actor_id),'Conferência do staging geral',request_id::text);
 RETURN v_receipt;
END $$;




-- FUNCTION sentinela_ocorrencias_local.detalhe(text, uuid)
CREATE FUNCTION sentinela_ocorrencias_local.detalhe(modo text, registro uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF modo='importados' THEN
    IF session_user NOT IN ('sentinela_local_admin','sentinela_local_operator') THEN
      RAISE EXCEPTION USING ERRCODE='42501';
    END IF;
    RETURN (SELECT jsonb_build_object('origemId',i.origem_id,'stagingId',i.id,
      'lote',i.lote,'execucao',i.execucao,'arquivo',i.arquivo,'competencia',i.competencia,'ordinal',i.ordinal,
      'situacao',i.situacao,'campos',s.campos_csv,'pendencias',coalesce((
        SELECT jsonb_agg(jsonb_build_object('campo',p.campo,'regra',p.regra,'motivo',CASE WHEN i.lote='84908630-bd04-4a03-923d-616649c8de74'
   OR s.derivados_efetivos ? 'geo' THEN sentinela_pcdf_revisao.motivo(p.campo,p.regra,p.tipo,p.status,p.motivo,s.campos_csv)
   ELSE p.motivo END,
          'prioridade',p.prioridade,'situacao',p.status) ORDER BY p.campo,p.regra,p.id)
        FROM sentinela.pendencias_revisao p WHERE p.linha_origem_id=i.origem_id),'[]'::jsonb))
      FROM sentinela_ocorrencias_local.importados i JOIN sentinela.linhas_staging s ON s.id=i.id
      WHERE i.id=registro);
  ELSIF modo='consolidadas' THEN
    RETURN (SELECT jsonb_build_object('id',o.id,'identificacao',c.identificacao,'fonte',o.fonte,'origem',o.origem,
      'data',c.data,'hora',c.hora,'ra',c.ra,'local',c.local,'localizacaoStatus',CASE WHEN o.versao_identidade='pcdf-tupla-conferida-v1' THEN
   CASE o.localizacao_status WHEN 'validada' THEN 'Localização GEO validada'
     WHEN 'ausente' THEN 'Localização GEO pendente. Coordenadas ausentes.'
     WHEN 'divergente' THEN 'Localização GEO pendente. Coordenadas divergentes.'
     WHEN 'invalida' THEN 'Localização GEO pendente. Coordenadas inválidas.'
     ELSE 'Localização GEO pendente. Referência, par ou validação territorial em revisão.' END
   ELSE o.localizacao_status END,
      'latitude',o.latitude,'longitude',o.longitude,'unidadeApuracao',o.unidade_apuracao,
      'naturezas',coalesce((SELECT jsonb_agg(jsonb_build_object('nome',n.descricao_original,
          'classificacao',a.classificacao_status,'crimeTentado',a.crime_tentado) ORDER BY a.id)
        FROM sentinela.ocorrencia_naturezas a JOIN sentinela.naturezas_criminais n ON n.id=a.natureza_id
        WHERE a.ocorrencia_id=o.id),'[]'::jsonb))
      FROM sentinela_ocorrencias_local.consolidadas c JOIN sentinela.ocorrencias o ON o.id=c.id WHERE o.id=registro);
  END IF;
  RAISE EXCEPTION USING ERRCODE='22023';
END
$$;




-- FUNCTION sentinela_ocorrencias_local.identidade()
CREATE FUNCTION sentinela_ocorrencias_local.identidade() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT jsonb_build_object('system',sentinela_ambiente.sistema(),
   'uuid',sentinela_ambiente.instalacao()::text,
   'started',NULL::text,
   'readonly',current_setting('transaction_read_only'),'db',current_database(),
   'host',NULL::text,'port',NULL::int,'login',session_user,
   'postgis',(SELECT extversion FROM pg_extension WHERE extname='postgis' AND extnamespace='extensions'::regnamespace),
   'version',current_setting('server_version_num'))
 WHERE session_user IN ('sentinela_local_admin','sentinela_local_operator','sentinela_local_analyst')
   AND (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace
      AND relkind='r' AND relrowsecurity AND relforcerowsecurity)=19
   AND NOT EXISTS(SELECT FROM pg_roles r WHERE r.rolname IN (current_user,session_user)
     AND (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolinherit
       OR EXISTS (SELECT FROM pg_auth_members m WHERE m.member=r.oid
          OR (m.roleid=r.oid AND (m.member<>'postgres'::regrole OR m.inherit_option)))))
   AND NOT EXISTS(SELECT FROM pg_class c WHERE c.relnamespace='sentinela'::regnamespace AND c.relkind='r'
     AND (has_table_privilege(c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
       OR has_any_column_privilege(c.oid,'INSERT,UPDATE,REFERENCES')))
$$;




-- FUNCTION sentinela_ocorrencias_local.lista(text, jsonb, integer, text, text)
CREATE FUNCTION sentinela_ocorrencias_local.lista(modo text, filtros jsonb, pagina integer, ordenar text, direcao text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE result jsonb;
BEGIN
  IF modo IS NULL OR modo NOT IN ('importados','consolidadas') OR pagina IS NULL OR pagina NOT BETWEEN 1 AND 1000000
    OR ordenar IS NULL OR ordenar NOT IN ('data','identificacao','ra','competencia')
    OR direcao IS NULL OR direcao NOT IN ('asc','desc')
    OR jsonb_typeof(filtros) IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
  IF modo='importados' AND session_user NOT IN ('sentinela_local_admin','sentinela_local_operator')
  THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;

  -- Only the enumerated relation, column and direction are interpolated. Filters remain bind values.
  EXECUTE format($query$
    WITH filtered AS (
      SELECT p.*
      FROM sentinela_ocorrencias_local.%I p
      WHERE ($1->>'identificacao' IS NULL OR strpos(lower(concat_ws(' ',p.identificacao,p.id::text)),lower($1->>'identificacao'))>0)
        AND ($1->>'lote' IS NULL OR p.lote=($1->>'lote')::uuid)
        AND ($1->>'busca' IS NULL OR strpos(lower(concat_ws(' ',p.identificacao,p.ordinal,p.natureza,p.padronizada,p.ra,p.local,p.id)),
          lower($1->>'busca'))>0)
        AND ($1->>'dataInicial' IS NULL OR p.data>=($1->>'dataInicial')::date)
        AND ($1->>'dataFinal' IS NULL OR p.data<=($1->>'dataFinal')::date)
        AND ($1->>'ra' IS NULL OR p.ra=$1->>'ra')
        AND ($1->>'natureza' IS NULL OR p.natureza=$1->>'natureza')
        AND ($1->>'raId' IS NULL OR EXISTS(SELECT FROM sentinela.ocorrencias o
          WHERE o.id=p.id AND o.ra_id=($1->>'raId')::uuid))
        AND ($1->>'naturezaId' IS NULL OR EXISTS(SELECT FROM sentinela.ocorrencia_naturezas a
          WHERE a.ocorrencia_id=p.id AND (SELECT n.descricao_original COLLATE "C"
   FROM sentinela.naturezas_criminais n WHERE n.id=a.natureza_id) =
   (SELECT n.descricao_original COLLATE "C" FROM sentinela.naturezas_criminais n
     WHERE n.id=($1->>'naturezaId')::uuid)))
        AND ($1->>'competencia' IS NULL OR p.competencia=$1->>'competencia')
        AND ($1->>'situacao' IS NULL OR p.situacao=$1->>'situacao')
    ), page AS (
      SELECT * FROM filtered ORDER BY %I %s NULLS LAST,id LIMIT 25 OFFSET ($2-1)*25
    )
    SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'pagina',$2,'itens',coalesce(
      jsonb_agg(to_jsonb(p) || jsonb_build_object(
        'natureza',CASE WHEN $3='importados' THEN p.natureza ELSE (
          SELECT string_agg(DISTINCT n.descricao_original, ' · ' ORDER BY n.descricao_original)
          FROM sentinela.ocorrencia_naturezas a JOIN sentinela.naturezas_criminais n ON n.id=a.natureza_id
          WHERE a.ocorrencia_id=p.id) END,
        'pendencias',CASE WHEN $3='importados' THEN (SELECT count(*) FROM sentinela.pendencias_revisao
          WHERE linha_origem_id=p.origem_id) END)
      ORDER BY p.%I %s NULLS LAST,p.id),'[]'::jsonb))
    FROM page p
  $query$,modo,ordenar,direcao,ordenar,direcao) INTO result USING filtros,pagina,modo;
  RETURN result;
END
$_$;




-- FUNCTION sentinela_ocorrencias_local.resumo()
CREATE FUNCTION sentinela_ocorrencias_local.resumo() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 WITH permit AS (SELECT session_user IN ('sentinela_local_admin','sentinela_local_operator') AS staging)
 SELECT jsonb_build_object('canImport',staging,
   'recebidas',CASE WHEN staging THEN (SELECT count(*) FROM sentinela_ocorrencias_local.importados) END,
   'consolidadas',(SELECT count(*) FROM sentinela.ocorrencias),
   'pendencias',CASE WHEN staging THEN (SELECT count(*) FROM sentinela.pendencias_revisao) END,
   'competencias',CASE WHEN staging THEN coalesce((SELECT jsonb_agg(m ORDER BY m DESC)
      FROM (SELECT DISTINCT competencia m FROM sentinela_ocorrencias_local.importados) q),'[]'::jsonb) END,
   'rasImportadas',coalesce((SELECT jsonb_agg(v ORDER BY v) FROM (SELECT DISTINCT ra v
      FROM sentinela_ocorrencias_local.importados WHERE ra IS NOT NULL) q),'[]'::jsonb),
   'naturezasImportadas',coalesce((SELECT jsonb_agg(v ORDER BY v) FROM (SELECT DISTINCT natureza v
      FROM sentinela_ocorrencias_local.importados WHERE natureza IS NOT NULL) q),'[]'::jsonb),
   'rasConsolidadas',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'label',r.nome) ORDER BY r.nome,r.id)
      FROM sentinela.regioes_administrativas r WHERE EXISTS(SELECT FROM sentinela.ocorrencias o WHERE o.ra_id=r.id)),'[]'::jsonb),
   'naturezasConsolidadas',coalesce((SELECT jsonb_agg(jsonb_build_object('id',n.id,'label',n.descricao_original)
      ORDER BY n.descricao_original,n.id) FROM (
   SELECT DISTINCT ON (n.descricao_original COLLATE "C") n.id,n.descricao_original
   FROM sentinela.naturezas_criminais n
   WHERE EXISTS (
     SELECT FROM sentinela.ocorrencia_naturezas a JOIN sentinela.naturezas_criminais vinculada ON vinculada.id=a.natureza_id
     WHERE vinculada.descricao_original COLLATE "C"=n.descricao_original COLLATE "C")
   ORDER BY n.descricao_original COLLATE "C",
     (n.fonte='PCDF' AND n.categoria_pcdf_original IS NULL AND sentinela.descricao_pcdf(n.descricao_original)) DESC,n.id
 ) n),'[]'::jsonb))
 FROM permit
$$;




-- FUNCTION sentinela_ocorrencias_manual.acoes(jsonb)
CREATE FUNCTION sentinela_ocorrencias_manual.acoes(pagina jsonb) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT pagina||jsonb_build_object('itens',coalesce(jsonb_agg(CASE WHEN o.id IS NULL THEN i.item ELSE
   i.item||jsonb_build_object('acoes',jsonb_build_object('editar',o.consolidacao_status='em_revisao',
     'inativar',o.consolidacao_status='em_revisao' OR session_user='sentinela_local_admin',
     'consolidar',session_user='sentinela_local_admin' AND o.consolidacao_status='em_revisao'
       AND sentinela_ocorrencias_manual.pendencias_publicacao(o.id)='[]'::jsonb)) END ORDER BY i.ord),'[]'))
 FROM jsonb_array_elements(pagina->'itens') WITH ORDINALITY i(item,ord)
 LEFT JOIN sentinela.ocorrencias o ON o.id=(i.item->>'id')::uuid AND o.ativo AND o.origem='manual'
  AND o.fonte='SENTINELA_MANUAL' AND EXISTS (SELECT FROM sentinela_ocorrencias_manual.cadastros c WHERE c.ocorrencia_id=o.id)
 WHERE session_user IN ('sentinela_local_admin','sentinela_local_operator')
$$;




-- FUNCTION sentinela_ocorrencias_manual.autor(uuid, text)
CREATE FUNCTION sentinela_ocorrencias_manual.autor(p_usuario uuid, p_conta text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
 SELECT u.perfil FROM sentinela.usuarios u CROSS JOIN sentinela_ocorrencias_manual.liberacao r
 WHERE u.id=p_usuario AND u.id=sentinela_ambiente.ator_operacional()
   AND u.ativo AND u.auth_user_id IS NOT NULL AND u.perfil IN ('Administrador','Operador')
   AND session_user=CASE u.perfil WHEN 'Administrador' THEN 'sentinela_local_admin'::name ELSE 'sentinela_local_operator'::name END
   AND r.aberta AND sentinela_ambiente.vinculado() AND sentinela_ambiente.vinculado()
   AND sentinela_ambiente.vinculado() AND NOT pg_is_in_recovery()
   AND r.cluster_uuid=sentinela_ambiente.instalacao()
   AND r.system_id=sentinela_ambiente.sistema()
   AND coalesce(p_conta ~ '^[a-f0-9]{64}$',false)
   AND p_conta=encode(sha256(convert_to('["sentinela-supabase",'||to_json(r.supabase_url)::text||','
     ||to_json(u.auth_user_id::text)::text||']','UTF8')),'hex')
$_$;




-- FUNCTION sentinela_ocorrencias_manual.cadastrar(jsonb, uuid, text)
CREATE FUNCTION sentinela_ocorrencias_manual.cadastrar(b jsonb, k uuid, a text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE
  registro uuid := gen_random_uuid();
  anterior record;
  hash_entrada text := encode(sha256(convert_to(b::text,'UTF8')),'hex');
  ponto extensions.geometry;
  lat float8;
  lon float8;
  ra uuid;
  data_fato date;
  hora_fato time;
  dns timestamp := clock_timestamp() AT TIME ZONE 'America/Sao_Paulo';
BEGIN
  IF session_user NOT IN ('sentinela_local_admin','sentinela_local_operator') THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
  IF k IS NULL OR a IS NULL OR a !~ '^[a-f0-9]{64}$' OR b IS NULL OR jsonb_typeof(b) <> 'object'
    OR (b - ARRAY['data','horario','cep','endereco','bairroOuSetor','numero','complemento','referencia','raId','coordenadas','naturezas','localizacaoConfirmada']) <> '{}'::jsonb
    OR NOT b ?& ARRAY['data','horario','endereco','bairroOuSetor','raId','coordenadas','naturezas']
    OR b->'localizacaoConfirmada' IS DISTINCT FROM 'true'::jsonb
    OR NOT coalesce(b->>'data' ~ '^(19[0-9]{2}|[2-9][0-9]{3})-[0-9]{2}-[0-9]{2}$',false)
    OR NOT coalesce(b->>'horario' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$',false)
    OR NOT coalesce(jsonb_typeof(b->'endereco')='string' AND length(btrim(b->>'endereco')) BETWEEN 1 AND 240,false)
    OR NOT coalesce(jsonb_typeof(b->'bairroOuSetor')='string' AND length(btrim(b->>'bairroOuSetor')) BETWEEN 1 AND 100,false)
    OR (b ? 'cep' AND NOT coalesce(b->>'cep' ~ '^[0-9]{8}$' AND jsonb_typeof(b->'cep')='string',false))
    OR EXISTS (SELECT FROM (VALUES ('numero',24),('complemento',120),('referencia',240)) x(campo,maximo)
      WHERE b ? campo AND NOT coalesce(jsonb_typeof(b->campo)='string' AND length(btrim(b->>campo)) BETWEEN 1 AND maximo,false))
    OR jsonb_typeof(b->'coordenadas') IS DISTINCT FROM 'object' OR jsonb_typeof(b->'naturezas') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;

  -- Serialize retries for the verified local account and request key.
  PERFORM pg_advisory_xact_lock(hashtextextended(session_user::text || a || k::text,0));
  SELECT c.ocorrencia_id,c.digest INTO anterior FROM sentinela_ocorrencias_manual.cadastros c
    WHERE c.login=session_user AND c.ator=a AND c.chave=k;
  IF FOUND THEN
    IF anterior.digest <> hash_entrada THEN RAISE EXCEPTION USING ERRCODE='23505'; END IF;
    RETURN jsonb_build_object('id',anterior.ocorrencia_id,'origem','manual','situacao','em_revisao');
  END IF;

  data_fato := (b->>'data')::date;
  hora_fato := (b->>'horario')::time;
  ra := (b->>'raId')::uuid;
  lat := (b->'coordenadas'->>'latitude')::float8;
  lon := (b->'coordenadas'->>'longitude')::float8;
  IF data_fato + hora_fato > dns OR ra IS NULL OR NOT coalesce(lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180,false)
    OR NOT coalesce(jsonb_typeof(b->'coordenadas'->'latitude')='number' AND jsonb_typeof(b->'coordenadas'->'longitude')='number',false)
    OR (b->'coordenadas') - ARRAY['latitude','longitude'] <> '{}'::jsonb
    OR jsonb_array_length(b->'naturezas') NOT BETWEEN 1 AND 100
    OR EXISTS(SELECT FROM jsonb_array_elements(b->'naturezas') x WHERE jsonb_typeof(x)<>'object'
      OR NOT coalesce(jsonb_typeof(x->'naturezaId')='string',false)
      OR (x - ARRAY['naturezaId','crimeTentado']) <> '{}'::jsonb
      OR NOT coalesce(jsonb_typeof(x->'crimeTentado') IN ('boolean','null'),false))
    OR EXISTS(SELECT FROM jsonb_array_elements(b->'naturezas') x
      GROUP BY (x->>'naturezaId')::uuid,x->'crimeTentado' HAVING count(*)>1)
  THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;

  ponto := extensions.ST_SetSRID(extensions.ST_MakePoint(lon,lat),4326);
  IF (SELECT count(*) FROM sentinela.regioes_administrativas) <> 37
    OR (SELECT count(*) FROM sentinela.regioes_administrativas r WHERE extensions.ST_Covers(r.limite,ponto)) <> 1
    OR NOT EXISTS(SELECT FROM sentinela.regioes_administrativas r WHERE r.id=ra AND r.vigencia @> data_fato
      AND extensions.ST_Contains(r.limite,ponto))
  THEN RAISE EXCEPTION USING ERRCODE='P0002'; END IF;

  IF EXISTS(SELECT FROM jsonb_array_elements(b->'naturezas') x
    WHERE NOT EXISTS(SELECT FROM sentinela.naturezas_criminais n WHERE n.id=(x->>'naturezaId')::uuid))
  THEN RAISE EXCEPTION USING ERRCODE='23503'; END IF;

  INSERT INTO sentinela.ocorrencias(id,origem,fonte,versao_identidade,identidade_status,data_fato,horario_fato,
    ra_id,local,latitude,longitude,localizacao_status,referencia_espacial_confirmada,regra_transformacao,geometria,consolidacao_status)
  VALUES (registro,'manual','SENTINELA_MANUAL','manual-local-v1','manual',data_fato,hora_fato,ra,
    concat_ws(', ',b->>'endereco',b->>'numero',b->>'bairroOuSetor'),lat,lon,'validada',
    'WGS84; IDE-DF-2026-11-13','Coordenada informada em graus decimais; sem transformação',ponto,'em_revisao');

  INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,crime_tentado,classificacao_status)
    SELECT registro,(x->>'naturezaId')::uuid,'manual',(x->>'crimeTentado')::boolean,'pendente'
    FROM jsonb_array_elements(b->'naturezas') x;

  INSERT INTO sentinela_ocorrencias_manual.cadastros VALUES(registro,session_user,a,k,hash_entrada,
    b - ARRAY['data','horario','raId','coordenadas','naturezas','localizacaoConfirmada']);
  INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,ocorrencia_id,depois,justificativa,request_id)
    VALUES('servico','sentinela-manual-local','ocorrencia.manual.criada',registro,
      jsonb_build_object('login',session_user::text,'contaLocal',a,'raId',ra,'naturezas',b->'naturezas',
        'situacao','em_revisao','localizacaoConfirmada',true),
      'Cadastro manual por sessão local autenticada',k::text);
  RETURN jsonb_build_object('id',registro,'origem','manual','situacao','em_revisao');
END $_$;




-- FUNCTION sentinela_ocorrencias_manual.cadastrar_completo(jsonb, uuid, text, uuid)
CREATE FUNCTION sentinela_ocorrencias_manual.cadastrar_completo(b jsonb, k uuid, a text, u uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  registro uuid := gen_random_uuid();
  anterior record;
  hash_entrada text := encode(sha256(convert_to(b::text,'UTF8')),'hex');
  endereco jsonb; crime jsonb; ponto extensions.geometry; lat float8; lon float8; dia date; hora time;
BEGIN
  PERFORM sentinela_ocorrencias_manual.exigir_autor(u,a);
  IF k IS NULL OR NOT sentinela_ocorrencias_manual.payload_valido(b,true) THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(session_user::text||a||k::text,0));
  SELECT c.ocorrencia_id,c.digest INTO anterior FROM sentinela_ocorrencias_manual.cadastros c
   WHERE c.login=session_user AND c.ator=a AND c.chave=k;
  IF FOUND THEN
    IF anterior.digest<>hash_entrada THEN RAISE EXCEPTION USING ERRCODE='23505'; END IF;
    RETURN jsonb_build_object('id',anterior.ocorrencia_id,'origem','manual','situacao','em_revisao');
  END IF;
  dia:=(b->>'data')::date; hora:=(b->>'horario')::time;
  lat:=(b->'coordenadas'->>'latitude')::float8; lon:=(b->'coordenadas'->>'longitude')::float8;
  IF dia+hora > (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo') THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
  IF NOT sentinela_ocorrencias_manual.referencias_validas(b) THEN RAISE EXCEPTION USING ERRCODE='P0002'; END IF;
  ponto:=extensions.ST_SetSRID(extensions.ST_MakePoint(lon,lat),4326);
  SELECT jsonb_object_agg(campo,btrim(valor)) INTO endereco FROM jsonb_each_text(b) e(campo,valor)
   WHERE campo IN ('cep','endereco','bairroOuSetor','numero','complemento','referencia');
  crime:=sentinela_ocorrencias_manual.limpar_crime(b->'dadosCrime');

  INSERT INTO sentinela.ocorrencias(id,origem,fonte,versao_identidade,identidade_status,data_fato,horario_fato,
    ra_id,local,latitude,longitude,localizacao_status,referencia_espacial_confirmada,regra_transformacao,geometria,consolidacao_status)
  VALUES (registro,'manual','SENTINELA_MANUAL','manual-local-v1','manual',dia,hora,(b->>'raId')::uuid,
    concat_ws(', ',endereco->>'endereco',endereco->>'numero',endereco->>'bairroOuSetor'),lat,lon,'validada',
    'WGS84; IDE-DF-2026-11-13','Coordenada informada em graus decimais; sem transformação',ponto,'em_revisao');
  INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,crime_tentado,classificacao_status)
   SELECT registro,(x->>'naturezaId')::uuid,'manual',(x->>'crimeTentado')::boolean,'pendente'
   FROM jsonb_array_elements(b->'naturezas') x;
  INSERT INTO sentinela_ocorrencias_manual.cadastros(ocorrencia_id,login,ator,chave,digest,endereco,dados_crime)
   VALUES (registro,session_user,a,k,hash_entrada,endereco,crime);
  INSERT INTO sentinela.eventos_auditoria(ator_tipo,usuario_id,acao,ocorrencia_id,depois,justificativa,request_id)
   VALUES ('usuario',u,'ocorrencia.manual.criada',registro,
    jsonb_build_object('operacao','cadastro-manual','login',session_user::text,'conta',a,'raId',b->'raId',
      'naturezas',b->'naturezas','data',dia,'horario',hora,'coordenadas',b->'coordenadas','endereco',endereco,
      'dadosCrime',crime,'situacao','em_revisao','localizacaoConfirmada',true),
    'Cadastro manual por sessão institucional autenticada',k::text);
  RETURN jsonb_build_object('id',registro,'origem','manual','situacao','em_revisao');
END $$;




-- FUNCTION sentinela_ocorrencias_manual.catalogo()
CREATE FUNCTION sentinela_ocorrencias_manual.catalogo() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT jsonb_build_object(
   'regioes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'codigo',codigo_interno,'nome',nome) ORDER BY nome)
     FROM sentinela.regioes_administrativas),'[]'::jsonb),
   'naturezas',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'descricao',descricao_original,'codigo',codigo_manual)
     ORDER BY descricao_original,id) FROM sentinela.naturezas_criminais),'[]'::jsonb))
 WHERE session_user IN ('sentinela_local_admin','sentinela_local_operator');
$$;




-- FUNCTION sentinela_ocorrencias_manual.catalogo(text)
CREATE FUNCTION sentinela_ocorrencias_manual.catalogo(termo text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 WITH filtro AS (SELECT coalesce(sentinela_ocorrencias_manual.normalizar_catalogo(termo),'') AS q)
 SELECT jsonb_build_object(
   'regioes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'codigo',codigo_interno,'nome',nome,
     'numeroAdministrativo',referencia_cartografica->'administrativeNumber')
     ORDER BY sentinela_ocorrencias_manual.normalizar_catalogo(nome) COLLATE "C",id)
     FROM sentinela.regioes_administrativas
     WHERE q='' OR strpos(sentinela_ocorrencias_manual.normalizar_catalogo(nome),q)>0
       OR strpos(sentinela_ocorrencias_manual.normalizar_catalogo(codigo_interno),q)>0
       OR strpos(sentinela_ocorrencias_manual.normalizar_catalogo(codigo_oficial),q)>0
       OR referencia_cartografica->>'administrativeNumber'=q),'[]'::jsonb),
   'naturezas',coalesce((SELECT jsonb_agg(jsonb_build_object('id',n.id,'descricao',n.descricao_original,
       'codigo',u.codigo_interno,'codigoOficial',NULL,'situacao',u.situacao)
     ORDER BY sentinela_ocorrencias_manual.normalizar_catalogo(n.descricao_original) COLLATE "C",n.id)
     FROM sentinela_ocorrencias_manual.naturezas_uso_local u JOIN sentinela.naturezas_criminais n ON n.id=u.natureza_id
     WHERE q='' OR strpos(sentinela_ocorrencias_manual.normalizar_catalogo(n.descricao_original),q)>0
       OR strpos(sentinela_ocorrencias_manual.normalizar_catalogo(u.codigo_interno),q)>0),'[]'::jsonb))
 FROM filtro WHERE session_user IN ('sentinela_local_admin','sentinela_local_operator');
$$;




-- FUNCTION sentinela_ocorrencias_manual.contexto(uuid)
CREATE FUNCTION sentinela_ocorrencias_manual.contexto(alvo uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE vinculos jsonb;
BEGIN
 IF session_user NOT IN ('sentinela_local_admin','sentinela_local_operator') THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
 vinculos:=sentinela_ocorrencias_manual.naturezas_ativas(alvo);
 RETURN (SELECT jsonb_build_object('id',o.id,'identificacao',o.id::text,'data',o.data_fato,'horario',o.horario_fato::text,
   'local',o.local,'natureza',NULL,'versao',o.versao::text,'revisao',NULL,'editavel',o.consolidacao_status='em_revisao',
   'compartilhadas',0,'lotesRelacionados',0,'bloqueiaConsolidacao',false,'recebidosAfetados',0,'candidatasAfetadas',0,
   'pendenciasAfetadas',0,'vinculos',jsonb_array_length(vinculos),
   'pendenciasPublicacao',sentinela_ocorrencias_manual.pendencias_publicacao(o.id),
   'manual',c.endereco||jsonb_build_object('data',o.data_fato,'horario',o.horario_fato::text,'raId',o.ra_id,
     'coordenadas',jsonb_build_object('latitude',o.latitude,'longitude',o.longitude),'dadosCrime',c.dados_crime,
     'naturezas',(SELECT coalesce(jsonb_agg(x-'id' ORDER BY ord),'[]') FROM jsonb_array_elements(vinculos) WITH ORDINALITY a(x,ord))))
  FROM sentinela_ocorrencias_manual.cadastros c JOIN sentinela.ocorrencias o ON o.id=c.ocorrencia_id
  WHERE o.id=alvo AND o.ativo AND o.origem='manual' AND o.fonte='SENTINELA_MANUAL');
END $$;




-- FUNCTION sentinela_ocorrencias_manual.detalhe(uuid)
CREATE FUNCTION sentinela_ocorrencias_manual.detalhe(registro uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT jsonb_build_object('id',o.id,'identificacao',o.id::text,'fonte',o.fonte,'origem',o.origem,
   'data',o.data_fato,'hora',o.horario_fato::text,'ra',r.nome,'local',o.local,'situacao',o.consolidacao_status,
   'localizacaoStatus',o.localizacao_status,'localizacaoConfirmada',o.localizacao_status='validada','latitude',o.latitude,'longitude',o.longitude,
   'unidadeApuracao',o.unidade_apuracao,'endereco',c.endereco,
   'naturezas',coalesce((SELECT jsonb_agg(jsonb_build_object('nome',n.descricao_original,
      'classificacao',a.classificacao_status,'crimeTentado',a.crime_tentado) ORDER BY n.descricao_original,a.id)
     FROM sentinela.ocorrencia_naturezas a JOIN sentinela.naturezas_criminais n ON n.id=a.natureza_id
     WHERE a.ocorrencia_id=o.id),'[]'::jsonb))
   || CASE WHEN c.dados_crime='{}' THEN '{}'::jsonb ELSE jsonb_build_object('dadosCrime',c.dados_crime) END
 FROM sentinela_ocorrencias_manual.cadastros c JOIN sentinela.ocorrencias o ON o.id=c.ocorrencia_id
 LEFT JOIN sentinela.regioes_administrativas r ON r.id=o.ra_id
 WHERE o.id=registro AND o.consolidacao_status='em_revisao';
$$;




-- FUNCTION sentinela_ocorrencias_manual.editar(jsonb, text, uuid)
CREATE FUNCTION sentinela_ocorrencias_manual.editar(p jsonb, p_conta text, p_usuario uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE
 alvo uuid; motivo text:=btrim(p->>'justificativa'); auditoria uuid:=gen_random_uuid(); b jsonb:=p->'dados';
 crime jsonb; novo_endereco jsonb; anterior_endereco jsonb; anterior_crime jsonb; vinculos jsonb;
 antes sentinela.ocorrencias; depois sentinela.ocorrencias; dia date; hora time; lat float8; lon float8;
BEGIN
 PERFORM sentinela_ocorrencias_manual.exigir_autor(p_usuario,p_conta);
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p-ARRAY['acao','id','versao','confirmacao','justificativa','dados']<>'{}'
  OR p->>'acao' IS DISTINCT FROM 'editar_manual' OR NOT coalesce(p->>'id' ~* '^[0-9a-f-]{36}$',false)
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
 alvo:=(p->>'id')::uuid;
 IF p->>'confirmacao' IS DISTINCT FROM alvo::text OR NOT coalesce(length(motivo) BETWEEN 1 AND 500,false)
  OR NOT sentinela_ocorrencias_manual.payload_valido(b,false)
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
 SELECT o.* INTO antes FROM sentinela.ocorrencias o JOIN sentinela_ocorrencias_manual.cadastros c ON c.ocorrencia_id=o.id
  WHERE o.id=alvo AND o.ativo AND o.origem='manual' AND o.fonte='SENTINELA_MANUAL' AND o.consolidacao_status='em_revisao'
  FOR UPDATE OF o;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002'; END IF;
 IF p->>'versao' IS DISTINCT FROM antes.versao::text THEN RAISE EXCEPTION USING ERRCODE='40001'; END IF;
 dia:=(b->>'data')::date; hora:=(b->>'horario')::time;
 lat:=(b->'coordenadas'->>'latitude')::float8; lon:=(b->'coordenadas'->>'longitude')::float8;
 IF dia+hora > (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo') OR NOT sentinela_ocorrencias_manual.referencias_validas(b)
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;

 SELECT c.endereco,c.dados_crime INTO anterior_endereco,anterior_crime FROM sentinela_ocorrencias_manual.cadastros c WHERE c.ocorrencia_id=alvo;
 vinculos:=sentinela_ocorrencias_manual.naturezas_ativas(alvo);
 SELECT jsonb_object_agg(chave,btrim(valor)) INTO novo_endereco FROM jsonb_each_text(b) e(chave,valor)
  WHERE chave IN ('cep','endereco','bairroOuSetor','numero','complemento','referencia');
 crime:=sentinela_ocorrencias_manual.limpar_crime(b->'dadosCrime');

 INSERT INTO sentinela_ocorrencias_manual.naturezas_retiradas(associacao_id,auditoria_id)
 SELECT n.id,auditoria FROM sentinela.ocorrencia_naturezas n
 WHERE n.ocorrencia_id=alvo AND n.origem='manual'
   AND NOT EXISTS (SELECT FROM sentinela_ocorrencias_manual.naturezas_retiradas r WHERE r.associacao_id=n.id)
   AND NOT EXISTS (SELECT FROM jsonb_array_elements(b->'naturezas') x WHERE (x->>'naturezaId')::uuid=n.natureza_id
     AND (x->>'crimeTentado')::boolean IS NOT DISTINCT FROM n.crime_tentado);
 INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,crime_tentado,classificacao_status)
 SELECT alvo,(x->>'naturezaId')::uuid,'manual',(x->>'crimeTentado')::boolean,'pendente'
 FROM jsonb_array_elements(b->'naturezas') x WHERE NOT EXISTS (
  SELECT FROM sentinela.ocorrencia_naturezas n WHERE n.ocorrencia_id=alvo AND n.natureza_id=(x->>'naturezaId')::uuid
   AND n.crime_tentado IS NOT DISTINCT FROM (x->>'crimeTentado')::boolean
   AND NOT EXISTS (SELECT FROM sentinela_ocorrencias_manual.naturezas_retiradas r WHERE r.associacao_id=n.id));

 IF (dia,hora,(b->>'raId')::uuid,lat,lon,novo_endereco,crime,vinculos) IS NOT DISTINCT FROM
  (antes.data_fato,antes.horario_fato,antes.ra_id,antes.latitude,antes.longitude,anterior_endereco,anterior_crime,
   sentinela_ocorrencias_manual.naturezas_ativas(alvo))
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
 UPDATE sentinela_ocorrencias_manual.cadastros c SET endereco=novo_endereco,dados_crime=crime WHERE c.ocorrencia_id=alvo;
 UPDATE sentinela.ocorrencias SET data_fato=dia,horario_fato=hora,ra_id=(b->>'raId')::uuid,latitude=lat,longitude=lon,
  geometria=extensions.ST_SetSRID(extensions.ST_MakePoint(lon,lat),4326),
  local=concat_ws(', ',novo_endereco->>'endereco',novo_endereco->>'numero',novo_endereco->>'bairroOuSetor')
  WHERE id=alvo RETURNING * INTO depois;
 INSERT INTO sentinela.eventos_auditoria(id,ator_tipo,usuario_id,acao,ocorrencia_id,antes,depois,justificativa,request_id)
 VALUES (auditoria,'usuario',p_usuario,'ocorrencia.manual.editada',alvo,
  jsonb_build_object('registro',to_jsonb(antes),'endereco',anterior_endereco,'dadosCrime',anterior_crime,'naturezas',vinculos),
  jsonb_build_object('operacao','cadastro-manual','login',session_user::text,'conta',p_conta,'registro',to_jsonb(depois),
   'endereco',novo_endereco,'dadosCrime',crime,'naturezas',sentinela_ocorrencias_manual.naturezas_ativas(alvo),
   'localizacaoConfirmada',true),motivo,auditoria::text);
 RETURN jsonb_build_object('id',alvo,'auditoria',auditoria);
END $_$;




-- FUNCTION sentinela_ocorrencias_manual.exigir_autor(uuid, text)
CREATE FUNCTION sentinela_ocorrencias_manual.exigir_autor(p_usuario uuid, p_conta text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE perfil text;
BEGIN
 IF current_setting('transaction_read_only')<>'off' OR current_setting('transaction_isolation')<>'read committed'
 THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
 perfil:=sentinela_ocorrencias_manual.autor(p_usuario,p_conta);
 IF perfil IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
 RETURN perfil;
END $$;




-- FUNCTION sentinela_ocorrencias_manual.limpar_crime(jsonb)
CREATE FUNCTION sentinela_ocorrencias_manual.limpar_crime(crime jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT coalesce(jsonb_object_agg(campo,CASE WHEN jsonb_typeof(valor)='string' THEN to_jsonb(btrim(valor#>>'{}')) ELSE valor END),'{}')
 FROM jsonb_each(crime) e(campo,valor)
$$;




-- FUNCTION sentinela_ocorrencias_manual.lista(jsonb, integer, text, text)
CREATE FUNCTION sentinela_ocorrencias_manual.lista(f jsonb, pagina integer, ordenar text, direcao text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 WITH itens AS (
   SELECT o.id, o.data_fato AS data, o.horario_fato::text AS hora, r.nome AS ra, o.local, o.consolidacao_status AS situacao
   FROM sentinela_ocorrencias_manual.cadastros c JOIN sentinela.ocorrencias o ON o.id=c.ocorrencia_id
   LEFT JOIN sentinela.regioes_administrativas r ON r.id=o.ra_id
   WHERE o.consolidacao_status='em_revisao'
     AND (f->>'identificacao' IS NULL OR strpos(o.id::text,lower(f->>'identificacao'))>0)
     AND (f->>'dataInicial' IS NULL OR o.data_fato >= (f->>'dataInicial')::date)
     AND (f->>'dataFinal' IS NULL OR o.data_fato <= (f->>'dataFinal')::date)
 ), page AS (
   SELECT i.*, row_number() OVER (ORDER BY
     CASE WHEN ordenar='data' AND direcao='asc' THEN i.data END,
     CASE WHEN ordenar='data' AND direcao='desc' THEN i.data END DESC,
     CASE WHEN ordenar='ra' AND direcao='asc' THEN i.ra END,
     CASE WHEN ordenar='ra' AND direcao='desc' THEN i.ra END DESC,
     CASE WHEN ordenar='identificacao' AND direcao='desc' THEN i.id END DESC,i.id) AS ordem
   FROM itens i ORDER BY ordem LIMIT 25 OFFSET ((greatest(1,pagina)::bigint-1)*25)
 )
 SELECT jsonb_build_object('pagina',pagina,'total',(SELECT count(*) FROM itens),'itens',coalesce(
   (SELECT jsonb_agg((to_jsonb(p)-'ordem') || jsonb_build_object(
     'identificacao',p.id::text,'origem_id',null,'padronizada',null,'lote',null,'arquivo',null,'competencia',null,
     'execucao',null,'ordinal',null,'pendencias',null,
     'natureza',(SELECT string_agg(DISTINCT n.descricao_original,' · ' ORDER BY n.descricao_original)
       FROM sentinela.ocorrencia_naturezas a JOIN sentinela.naturezas_criminais n ON n.id=a.natureza_id
       WHERE a.ocorrencia_id=p.id)) ORDER BY p.ordem) FROM page p),'[]'::jsonb));
$$;




-- FUNCTION sentinela_ocorrencias_manual.naturezas_ativas(uuid)
CREATE FUNCTION sentinela_ocorrencias_manual.naturezas_ativas(alvo uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'naturezaId',n.natureza_id,'crimeTentado',n.crime_tentado)
  ORDER BY n.natureza_id,n.crime_tentado,n.id),'[]')
 FROM sentinela.ocorrencia_naturezas n WHERE n.ocorrencia_id=alvo
  AND NOT EXISTS (SELECT FROM sentinela_ocorrencias_manual.naturezas_retiradas r WHERE r.associacao_id=n.id)
$$;




-- FUNCTION sentinela_ocorrencias_manual.normalizar_catalogo(text)
CREATE FUNCTION sentinela_ocorrencias_manual.normalizar_catalogo(text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
 SELECT lower(regexp_replace(normalize(btrim($1),NFD), U&'[\0300-\036f]', '', 'g'));
$_$;




-- FUNCTION sentinela_ocorrencias_manual.payload_valido(jsonb, boolean)
CREATE FUNCTION sentinela_ocorrencias_manual.payload_valido(b jsonb, criacao boolean) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
 SELECT coalesce(jsonb_typeof(b)='object'
  AND (b-ARRAY['data','horario','cep','endereco','bairroOuSetor','numero','complemento','referencia',
     'raId','coordenadas','naturezas','localizacaoConfirmada','dadosCrime'])='{}'::jsonb
  AND b ?& ARRAY['data','horario','endereco','bairroOuSetor','raId','coordenadas','naturezas','dadosCrime']
  AND (NOT criacao OR b ? 'cep')
  AND b->'localizacaoConfirmada'='true'::jsonb
  AND b->>'data' ~ '^(19[0-9]{2}|[2-9][0-9]{3})-[0-9]{2}-[0-9]{2}$'
  AND b->>'horario' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'
  AND (NOT b ? 'cep' OR (jsonb_typeof(b->'cep')='string' AND b->>'cep' ~ '^[0-9]{8}$'))
  AND NOT EXISTS (SELECT FROM (VALUES ('endereco',240),('bairroOuSetor',100),('numero',24),('complemento',120),('referencia',240)) k(campo,maximo)
    WHERE (b ? k.campo OR k.campo IN ('endereco','bairroOuSetor'))
      AND NOT coalesce(jsonb_typeof(b->k.campo)='string' AND length(btrim(b->>k.campo)) BETWEEN 1 AND k.maximo,false))
  AND jsonb_typeof(b->'coordenadas')='object' AND (b->'coordenadas')-ARRAY['latitude','longitude']='{}'::jsonb
  AND jsonb_typeof(b->'coordenadas'->'latitude')='number' AND jsonb_typeof(b->'coordenadas'->'longitude')='number'
  AND (b->'coordenadas'->>'latitude')::float8 BETWEEN -90 AND 90 AND (b->'coordenadas'->>'longitude')::float8 BETWEEN -180 AND 180
  AND jsonb_typeof(b->'naturezas')='array' AND jsonb_array_length(b->'naturezas') BETWEEN 1 AND 100
  AND NOT EXISTS (SELECT FROM jsonb_array_elements(b->'naturezas') x WHERE jsonb_typeof(x)<>'object'
    OR NOT coalesce(jsonb_typeof(x->'naturezaId')='string' AND x->>'naturezaId' ~* '^[0-9a-f-]{36}$'
      AND jsonb_typeof(x->'crimeTentado') IN ('boolean','null'),false)
    OR (x-ARRAY['naturezaId','crimeTentado'])<>'{}'::jsonb)
  AND NOT EXISTS (SELECT FROM jsonb_array_elements(b->'naturezas') x GROUP BY lower(x->>'naturezaId'),x->'crimeTentado' HAVING count(*)>1)
  AND jsonb_typeof(b->'dadosCrime')='object', false)
$_$;




-- FUNCTION sentinela_ocorrencias_manual.pendencias_publicacao(uuid)
CREATE FUNCTION sentinela_ocorrencias_manual.pendencias_publicacao(alvo uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT coalesce(jsonb_agg(motivo ORDER BY motivo),'[]') FROM sentinela.ocorrencias o
 JOIN sentinela_ocorrencias_manual.cadastros c ON c.ocorrencia_id=o.id
 CROSS JOIN LATERAL (VALUES
  ('identidade',NOT (o.origem='manual' AND o.fonte='SENTINELA_MANUAL' AND o.identidade_status='manual'
     AND o.versao_identidade='manual-local-v1' AND EXISTS (SELECT FROM sentinela.eventos_auditoria e
       WHERE e.ocorrencia_id=o.id AND e.acao='ocorrencia.manual.criada' AND e.ator_tipo='usuario'
         AND e.depois->>'operacao'='cadastro-manual'))),
  ('natureza',NOT (jsonb_array_length(sentinela_ocorrencias_manual.naturezas_ativas(o.id))>0
     AND NOT EXISTS (SELECT FROM jsonb_array_elements(sentinela_ocorrencias_manual.naturezas_ativas(o.id)) x
       WHERE NOT EXISTS (SELECT FROM sentinela_ocorrencias_manual.naturezas_uso_local u WHERE u.natureza_id=(x->>'naturezaId')::uuid)))),
  ('geometria',NOT coalesce(o.localizacao_status='validada' AND o.geometria IS NOT NULL
     AND extensions.ST_SRID(o.geometria)=4326 AND extensions.ST_X(o.geometria)=o.longitude AND extensions.ST_Y(o.geometria)=o.latitude
     AND o.referencia_espacial_confirmada='WGS84; IDE-DF-2026-11-13' AND nullif(btrim(o.regra_transformacao),'') IS NOT NULL
     AND (SELECT count(*) FROM sentinela.regioes_administrativas r WHERE extensions.ST_Covers(r.limite,o.geometria))=1
     AND EXISTS (SELECT FROM sentinela.regioes_administrativas r WHERE r.id=o.ra_id AND r.vigencia @> o.data_fato
       AND extensions.ST_Contains(r.limite,o.geometria)),false)),
  ('dados',NOT coalesce(o.data_fato IS NOT NULL AND o.horario_fato IS NOT NULL
     AND o.data_fato+o.horario_fato <= (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')
     AND c.endereco ?& ARRAY['cep','endereco','bairroOuSetor'] AND c.dados_crime ?& ARRAY['descricao','meio','vitimas','autores'],false)),
  ('pendencias',EXISTS (SELECT FROM sentinela.pendencias_revisao r WHERE r.ocorrencia_id=o.id AND r.status='aberta'))
 ) v(motivo,bloqueia)
 WHERE o.id=alvo AND v.bloqueia
$$;




-- FUNCTION sentinela_ocorrencias_manual.referencias_validas(jsonb)
CREATE FUNCTION sentinela_ocorrencias_manual.referencias_validas(b jsonb) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 WITH p AS (SELECT (b->>'data')::date AS dia,(b->>'raId')::uuid AS ra,
   extensions.ST_SetSRID(extensions.ST_MakePoint((b->'coordenadas'->>'longitude')::float8,(b->'coordenadas'->>'latitude')::float8),4326) AS ponto)
 SELECT (SELECT count(*) FROM sentinela.regioes_administrativas)=37
  AND (SELECT count(*) FROM sentinela.regioes_administrativas r, p WHERE extensions.ST_Covers(r.limite,p.ponto))=1
  AND EXISTS (SELECT FROM sentinela.regioes_administrativas r, p WHERE r.id=p.ra AND r.vigencia @> p.dia
    AND extensions.ST_Contains(r.limite,p.ponto))
  AND NOT EXISTS (SELECT FROM jsonb_array_elements(b->'naturezas') x WHERE NOT EXISTS (
    SELECT FROM sentinela_ocorrencias_manual.naturezas_uso_local u WHERE u.natureza_id=(x->>'naturezaId')::uuid))
 FROM p
$$;




-- FUNCTION sentinela_ocorrencias_manual.transicionar(jsonb, text, uuid)
CREATE FUNCTION sentinela_ocorrencias_manual.transicionar(p jsonb, p_conta text, p_usuario uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE
 acao text:=p->>'acao'; alvo uuid; motivo text:=btrim(p->>'justificativa'); auditoria uuid:=gen_random_uuid();
 perfil text; antes sentinela.ocorrencias; depois sentinela.ocorrencias; bloqueios jsonb;
BEGIN
 perfil:=sentinela_ocorrencias_manual.exigir_autor(p_usuario,p_conta);
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p-ARRAY['acao','id','versao','confirmacao','justificativa']<>'{}'
  OR acao IS NULL OR acao NOT IN ('inativar_manual','consolidar_manual')
  OR NOT coalesce(p->>'id' ~* '^[0-9a-f-]{36}$',false)
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
 alvo:=(p->>'id')::uuid;
 IF p->>'confirmacao' IS DISTINCT FROM alvo::text OR NOT coalesce(length(motivo) BETWEEN 1 AND 500,false)
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
 SELECT o.* INTO antes FROM sentinela.ocorrencias o JOIN sentinela_ocorrencias_manual.cadastros c ON c.ocorrencia_id=o.id
  WHERE o.id=alvo AND o.ativo AND o.origem='manual' AND o.fonte='SENTINELA_MANUAL' FOR UPDATE OF o;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002'; END IF;
 IF p->>'versao' IS DISTINCT FROM antes.versao::text THEN RAISE EXCEPTION USING ERRCODE='40001'; END IF;
 -- Publication is an Administrador review; a published record leaves circulation only by an Administrador.
 IF (acao='consolidar_manual' OR antes.consolidacao_status<>'em_revisao') AND perfil<>'Administrador'
 THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
 IF acao='consolidar_manual' THEN
  IF antes.consolidacao_status<>'em_revisao' THEN RAISE EXCEPTION USING ERRCODE='40001'; END IF;
  bloqueios:=sentinela_ocorrencias_manual.pendencias_publicacao(alvo);
  IF bloqueios<>'[]'::jsonb THEN RAISE EXCEPTION USING ERRCODE='23514', DETAIL=bloqueios::text; END IF;
  UPDATE sentinela.ocorrencias SET consolidacao_status='consolidada' WHERE id=alvo RETURNING * INTO depois;
 ELSE
  UPDATE sentinela.ocorrencias SET ativo=false WHERE id=alvo RETURNING * INTO depois;
 END IF;
 INSERT INTO sentinela.eventos_auditoria(id,ator_tipo,usuario_id,acao,ocorrencia_id,antes,depois,justificativa,request_id)
 VALUES (auditoria,'usuario',p_usuario,
  CASE acao WHEN 'consolidar_manual' THEN 'ocorrencia.manual.consolidada' ELSE 'ocorrencia.manual.inativada' END,alvo,
  jsonb_build_object('registro',to_jsonb(antes)),
  jsonb_build_object('operacao','cadastro-manual','login',session_user::text,'conta',p_conta,'perfil',perfil,
   'registro',to_jsonb(depois),'naturezas',sentinela_ocorrencias_manual.naturezas_ativas(alvo)),motivo,auditoria::text);
 RETURN jsonb_build_object('id',alvo,'auditoria',auditoria);
END $_$;




-- FUNCTION sentinela_ocorrencias_manual.validar_dados()
CREATE FUNCTION sentinela_ocorrencias_manual.validar_dados() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE
  crime jsonb := NEW.dados_crime;
  espacos constant text := U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
  IF jsonb_typeof(crime) IS DISTINCT FROM 'object' OR crime-ARRAY['descricao','meio','vitimas','autores','observacoes']<>'{}'
    OR (NEW.endereco?'cep' AND NOT coalesce(jsonb_typeof(NEW.endereco->'cep')='string' AND NEW.endereco->>'cep'~'^[0-9]{8}$',false))
    OR EXISTS(SELECT FROM (VALUES ('descricao',3000),('observacoes',1500)) k(campo,maximo)
      WHERE crime?k.campo AND NOT coalesce(jsonb_typeof(crime->k.campo)='string'
        AND length(btrim(crime->>k.campo,espacos)) BETWEEN 1 AND k.maximo,false))
    OR (crime?'meio' AND NOT coalesce(crime->>'meio' IN ('arma-de-fogo','arma-branca','forca-fisica','veiculo','outro'),false))
    OR EXISTS(SELECT FROM (VALUES ('vitimas'),('autores')) k(campo) WHERE crime?k.campo AND NOT
      coalesce(jsonb_typeof(crime->k.campo)='number' AND crime->>k.campo~'^[0-9]{1,6}$',false))
  THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
  IF TG_OP='INSERT' THEN
    IF NOT (NEW.endereco?'cep' AND crime ?& ARRAY['descricao','meio','vitimas','autores'])
    THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
  ELSIF (OLD.endereco?'cep' AND NOT NEW.endereco?'cep')
    OR EXISTS(SELECT FROM unnest(ARRAY['descricao','meio','vitimas','autores']) k(campo)
      WHERE OLD.dados_crime?k.campo AND NOT crime?k.campo)
  THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
  RETURN NEW;
END $_$;




-- FUNCTION sentinela_ocorrencias_manual.validar_retirada()
CREATE FUNCTION sentinela_ocorrencias_manual.validar_retirada() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
 IF NOT EXISTS (SELECT FROM sentinela.eventos_auditoria e
   JOIN sentinela.ocorrencia_naturezas n ON n.id=NEW.associacao_id
   WHERE e.id=NEW.auditoria_id AND e.ocorrencia_id=n.ocorrencia_id AND e.acao='ocorrencia.manual.editada'
     AND e.ator_tipo='usuario' AND e.depois->>'operacao'='cadastro-manual' AND e.transacao_id=pg_current_xact_id())
 THEN RAISE EXCEPTION 'Retirada de natureza sem evento de edição auditado' USING ERRCODE='23503'; END IF;
 RETURN NULL;
END $$;




-- Convert geometry inside the definer so the deferred trigger needs no PostGIS
-- privileges for the application login at COMMIT.
CREATE FUNCTION sentinela_ocorrencias_manual.verificar_evento(anterior sentinela.ocorrencias, novo sentinela.ocorrencias) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT sentinela_ambiente.vinculado() AND EXISTS (SELECT FROM sentinela.eventos_auditoria e
  WHERE e.ocorrencia_id=(anterior).id AND e.ator_tipo='usuario' AND e.depois->>'operacao'='cadastro-manual'
    AND e.acao IN ('ocorrencia.manual.editada','ocorrencia.manual.inativada','ocorrencia.manual.consolidada')
    AND e.transacao_id=pg_current_xact_id() AND e.depois->>'login'=session_user::text
    AND e.antes->'registro'=to_jsonb(anterior) AND e.depois->'registro'=to_jsonb(novo))
$$;




-- FUNCTION sentinela_pcdf_historico.coverage()
CREATE FUNCTION sentinela_pcdf_historico.coverage() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT jsonb_agg(jsonb_build_object('key',m->>'month','status',CASE
   WHEN m->>'state'<>'done' THEN 'not_imported' WHEN (m->>'complete')::boolean THEN 'complete' ELSE 'partial' END,
   'through',m->>'through') ORDER BY m->>'month')
 FROM jsonb_array_elements(sentinela_pcdf_historico.status()) m;
$$;




-- FUNCTION sentinela_pcdf_historico.receive(uuid, uuid, text, jsonb, bytea)
CREATE FUNCTION sentinela_pcdf_historico.receive(p_request uuid, p_usuario uuid, p_conta text, p_batch jsonb, p_csv bytea) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE
 input sentinela_pcdf_historico.arquivos%rowtype;
 xml_sha constant text := 'faf82ae0620fa3ecc53bc002d9c2e49b24b6ec0126a44449510d12948dc0a022';
 existing jsonb;
 receipt jsonb;
 result jsonb;
 cohort jsonb;
 lot uuid;
 run uuid;
 extraction uuid;
 previous_extraction uuid;
 total integer;
 links integer;
 review_count integer;
BEGIN
 PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,p_conta);
 PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
 SELECT * INTO input FROM sentinela_pcdf_historico.arquivos WHERE to_char(competencia,'YYYY-MM')=p_batch->>'month';
 IF NOT FOUND OR p_request IS NULL OR input.sha256 IS DISTINCT FROM encode(sha256(p_csv),'hex')
 OR input.sha256 IS DISTINCT FROM p_batch->>'sha256' OR input.bytes IS DISTINCT FROM octet_length(p_csv)
 OR p_batch->>'name' IS DISTINCT FROM 'pcdf_naturezas_'||to_char(input.competencia,'YYYY-MM')||'.csv'
 OR to_jsonb(input.linhas) IS DISTINCT FROM p_batch->'records' OR to_jsonb(input.candidatas) IS DISTINCT FROM p_batch->'candidates'
 OR input.linhas IS DISTINCT FROM jsonb_array_length(p_batch->'rows')
 THEN RAISE EXCEPTION 'Hash, arquivo ou competência fora do inventário histórico' USING ERRCODE='22023'; END IF;
 SELECT m INTO existing FROM jsonb_array_elements(sentinela_pcdf_historico.status()) m WHERE m->>'month'=p_batch->>'month';
 SELECT l.extracao_id INTO previous_extraction FROM sentinela.lotes_importacao l WHERE l.id=(existing->>'lot')::uuid;
 IF existing->>'state'='conflict'
 THEN RETURN jsonb_build_object('conflict','competencia'); END IF;

 IF EXISTS (
   SELECT FROM jsonb_to_recordset(p_batch->'rows') r(raw jsonb)
   WHERE r.raw->>'linha_xml' IS NULL OR r.raw->>'linha_xml' !~ '^[1-9][0-9]*$'
      OR r.raw->>'linha_origem_id' IS DISTINCT FROM encode(sha256(convert_to(
        '["pcdf-linha-v1","'||xml_sha||'","NATUREZAS",'||(r.raw->>'linha_xml')||']','UTF8')),'hex')
 ) THEN RAISE EXCEPTION 'Proveniência XML divergente' USING ERRCODE='22023'; END IF;
 IF existing->>'state'='done' THEN
   IF (SELECT count(*) FROM (
       SELECT r.raw->>'linha_origem_id' FROM jsonb_to_recordset(p_batch->'rows') r(raw jsonb)
       INTERSECT
       SELECT linha_origem_id::text FROM sentinela.linhas_origem WHERE extracao_id=previous_extraction
     ) matches)<>input.linhas
   THEN RETURN jsonb_build_object('conflict','proveniencia'); END IF;
   RETURN existing||jsonb_build_object('replay',true);
 END IF;
 IF input.competencia='2021-01-01' THEN RETURN jsonb_build_object('conflict','competencia'); END IF;
 IF EXISTS (
   SELECT r.raw->>'linha_origem_id' FROM jsonb_to_recordset(p_batch->'rows') r(raw jsonb)
   INTERSECT
   SELECT linha_origem_id::text FROM sentinela.linhas_origem WHERE extracao_id IS DISTINCT FROM previous_extraction
 ) THEN RETURN jsonb_build_object('conflict','proveniencia'); END IF;

 receipt := sentinela_pcdf_historico.receive_staging(p_request,p_usuario,p_conta,p_batch,p_csv);
 IF receipt ? 'conflict' THEN RETURN receipt; END IF;
 lot := (receipt->>'lot')::uuid;
 run := (receipt->>'run')::uuid;
 SELECT l.extracao_id INTO STRICT extraction FROM sentinela.lotes_importacao l WHERE l.id=lot;

 WITH staged AS MATERIALIZED (
   SELECT s.linha_origem_id,s.campos_csv,s.derivados_efetivos AS efetivos,
     o.ano_registro,o.unidade_registro,o.numero_registro,
     o.flagrante,o.unidade_apuracao,o.latitude_geo_original AS lat,o.longitude_geo_original AS lon
   FROM sentinela.linhas_staging s JOIN sentinela.linhas_origem o ON (o.id,o.extracao_id)=(s.linha_origem_id,s.extracao_id)
   WHERE s.lote_id=lot AND s.execucao_id=run AND s.estado='recebida' AND s.ocorrencia_id IS NULL AND s.associacao_id IS NULL
 ), groups AS MATERIALIZED (
   SELECT ano_registro,unidade_registro,numero_registro,array_agg(linha_origem_id ORDER BY linha_origem_id) AS origens,
     bool_and(efetivos->>'chave' IS NOT NULL AND (ano_registro,unidade_registro,numero_registro) IS NOT DISTINCT FROM
       (campos_csv->>'ano_registro',campos_csv->>'unidade_registro',campos_csv->>'numero_registro')) AS identidade,
     bool_or(ano_registro<left(efetivos->>'data',4)) AS ano_incompativel,count(DISTINCT efetivos->>'data') AS datas,
     min(efetivos->>'data')::date AS data_fato,
     CASE WHEN count(DISTINCT efetivos->>'horario')=1 THEN min(efetivos->>'horario')::time END AS horario_fato,
     CASE WHEN count(DISTINCT nullif(campos_csv->>'local',''))=1 THEN min(nullif(campos_csv->>'local','')) END AS local,
     CASE WHEN count(DISTINCT flagrante)=1 THEN CASE min(flagrante) WHEN 'SIM' THEN true WHEN 'NÃO' THEN false END END AS flagrante,
     CASE WHEN count(DISTINCT unidade_apuracao) FILTER (WHERE sentinela_pcdf_revisao.informado(unidade_apuracao))=1
       THEN min(unidade_apuracao) FILTER (WHERE sentinela_pcdf_revisao.informado(unidade_apuracao)) END AS unidade_apuracao,
     CASE WHEN count(DISTINCT jsonb_build_array(lat,lon))=1 THEN min(efetivos->>'geo') ELSE 'divergente' END AS geo
   FROM staged GROUP BY 1,2,3
 ), outside_keys AS MATERIALIZED (
   SELECT btrim(o.ano_registro) COLLATE "C" AS year,btrim(o.unidade_registro) COLLATE "C" AS unit,
       btrim(o.numero_registro) COLLATE "C" AS number
   FROM sentinela.linhas_origem o WHERE o.extracao_id<>extraction
   UNION ALL
   SELECT btrim(o.ano_registro) COLLATE "C",btrim(o.unidade_registro) COLLATE "C",btrim(o.numero_registro) COLLATE "C"
   FROM sentinela.ocorrencias o WHERE o.fonte='PCDF'
 ), collisions AS (
   SELECT DISTINCT o.year,o.unit,o.number FROM outside_keys o JOIN groups g
     ON (o.year,o.unit,o.number)=(btrim(g.ano_registro),btrim(g.unidade_registro),btrim(g.numero_registro))
   UNION
   SELECT btrim(ano_registro) COLLATE "C",btrim(unidade_registro) COLLATE "C",btrim(numero_registro) COLLATE "C"
   FROM groups GROUP BY 1,2,3 HAVING count(*)>1
 )
 SELECT jsonb_agg(to_jsonb(g)||jsonb_build_object('id',gen_random_uuid(),'motivo',CASE
   WHEN NOT g.identidade THEN 'identidade_literal_insuficiente'
   WHEN g.ano_incompativel THEN 'ano_registro_anterior_ao_fato'
   WHEN g.datas>1 THEN 'datas_de_fato_divergentes'
   WHEN k.year IS NOT NULL THEN 'identidade_em_conflito'
   ELSE NULL END)) INTO cohort FROM groups g LEFT JOIN collisions k
     ON (k.year,k.unit,k.number)=(btrim(g.ano_registro),btrim(g.unidade_registro),btrim(g.numero_registro));
 IF cohort IS NULL OR (SELECT sum(jsonb_array_length(g->'origens')) FROM jsonb_array_elements(cohort) g)<>input.linhas
 OR EXISTS (SELECT FROM sentinela.linhas_staging s JOIN sentinela.ocorrencia_naturezas a ON a.linha_origem_id=s.linha_origem_id
   WHERE s.execucao_id=run)
 THEN RAISE EXCEPTION 'Coorte inconsistente ou parcialmente vinculada' USING ERRCODE='23514'; END IF;

 INSERT INTO sentinela.ocorrencias(id,origem,fonte,ano_registro,unidade_registro,numero_registro,versao_identidade,
  identidade_status,evidencia_identidade,data_fato,horario_fato,local,flagrante,unidade_apuracao,localizacao_status,consolidacao_status)
 SELECT c.id,'importacao','PCDF',c.ano_registro,c.unidade_registro,c.numero_registro,'pcdf-tupla-conferida-v1',
  'homologada','Tupla literal conciliada com a origem e o CSV '||input.sha256,c.data_fato,c.horario_fato,c.local,
  c.flagrante,c.unidade_apuracao,CASE WHEN c.geo='incompleta' THEN 'referencia_pendente' ELSE c.geo END,'consolidada'
 FROM jsonb_to_recordset(cohort) c(id uuid,ano_registro text,unidade_registro text,numero_registro text,data_fato date,
  horario_fato time,local text,flagrante boolean,unidade_apuracao text,geo text,motivo text) WHERE c.motivo IS NULL;
 GET DIAGNOSTICS total=ROW_COUNT;

 INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,linha_origem_id,crime_tentado,classificacao_status)
 SELECT c.id,n.id,'importacao',o.id,CASE o.crime_tentado WHEN 'SIM' THEN true WHEN 'NÃO' THEN false END,
  CASE WHEN n.id IS NULL THEN 'sem_correspondencia' ELSE 'pendente' END
 FROM jsonb_to_recordset(cohort) c(id uuid,origens uuid[],motivo text) CROSS JOIN LATERAL unnest(c.origens) r(id)
 JOIN sentinela.linhas_origem o ON o.id=r.id
 LEFT JOIN sentinela.naturezas_criminais n ON n.fonte='PCDF' AND n.categoria_pcdf_original IS NULL
   AND n.descricao_original COLLATE "C"=o.natureza_original COLLATE "C"
 WHERE c.motivo IS NULL;
 GET DIAGNOSTICS links=ROW_COUNT;

 INSERT INTO sentinela.pendencias_revisao(linha_origem_id,campo,regra,versao_regra,valor_original,motivo,tipo,prioridade,efeito)
 SELECT s.linha_origem_id,'ocorrencia_chave',c.motivo,'pcdf-consolidacao-historica-v1',s.campos_csv->'ocorrencia_chave',
  CASE c.motivo WHEN 'ano_registro_anterior_ao_fato' THEN 'Ano de registro anterior ao ano do fato.'
   WHEN 'datas_de_fato_divergentes' THEN 'Datas de fato divergentes para a mesma tupla policial.'
   WHEN 'identidade_em_conflito' THEN 'Tupla policial em conflito com outra origem, lote ou ocorrência.'
   ELSE 'Identidade declarada insuficiente ou divergente da origem.' END,'identificacao','alta','bloqueia_consolidacao'
 FROM jsonb_to_recordset(cohort) c(origens uuid[],motivo text) CROSS JOIN LATERAL unnest(c.origens) r(id)
 JOIN sentinela.linhas_staging s ON s.execucao_id=run AND s.linha_origem_id=r.id WHERE c.motivo IS NOT NULL;
 GET DIAGNOSTICS review_count=ROW_COUNT;
 IF links+review_count<>input.linhas THEN RAISE EXCEPTION 'Vínculos e revisão fora do escopo' USING ERRCODE='23514'; END IF;

 INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,execucao_id,depois,justificativa,request_id)
 VALUES ('servico','sentinela-pcdf','pcdf.consolidacao_historica',run,jsonb_build_object(
   'actor',p_usuario,'lote',lot,'competencia',input.competencia,'csvSha256',input.sha256,'xmlSha256',xml_sha,
   'consolidadas',total,'vinculos',links,'origensEmRevisao',review_count,
   'pendencias',(receipt->>'issues')::integer+review_count,'pontosValidados',0,'versao','pcdf-consolidacao-historica-v1'),
   'Recepção e consolidação do CSV mensal PCDF aprovado pela interface.',p_request::text);
 SELECT m INTO result FROM jsonb_array_elements(sentinela_pcdf_historico.status()) m WHERE m->>'month'=p_batch->>'month';
 IF result->>'state' IS DISTINCT FROM 'done' THEN RAISE EXCEPTION 'Recibo não reconciliado' USING ERRCODE='23514'; END IF;
 RETURN result||jsonb_build_object('replay',false);
END
$_$;




-- FUNCTION sentinela_pcdf_historico.receive_staging(uuid, uuid, text, jsonb, bytea)
CREATE FUNCTION sentinela_pcdf_historico.receive_staging(p_request uuid, p_usuario uuid, p_conta text, p_batch jsonb, p_csv bytea) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE
 version constant text := 'pcdf-csv-avulso-v2';
 file_hash text := encode(sha256(p_csv),'hex');
 month_start date;
 records bigint := jsonb_array_length(p_batch->'rows');
 candidates bigint;
 extraction uuid;
 lot uuid;
 run uuid;
 issues bigint;
 inserted bigint; origin_ids jsonb;
 receipt jsonb;
 meta jsonb;
BEGIN
 PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,p_conta);
 PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
 IF p_request IS NULL OR p_batch->>'month' IS NULL OR p_batch->>'month' !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
   OR p_batch->>'name' IS DISTINCT FROM 'pcdf_naturezas_'||(p_batch->>'month')||'.csv'
   OR file_hash IS NULL OR file_hash IS DISTINCT FROM p_batch->>'sha256'
   OR octet_length(p_csv) NOT BETWEEN 1 AND 16777216
   OR records IS NULL OR records NOT BETWEEN 1 AND 10000 OR to_jsonb(records) IS DISTINCT FROM p_batch->'records'
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
 month_start := ((p_batch->>'month')||'-01')::date;
 SELECT l.id,e.id,e.pendencias_detectadas INTO lot,run,issues
 FROM sentinela.lotes_importacao l JOIN sentinela.execucoes_importacao e ON e.lote_id=l.id
 WHERE l.sha256_arquivo=file_hash AND l.versao_contrato='2.0' AND l.competencia=month_start
   AND e.versao_importador=version AND e.status='concluida';
 IF NOT FOUND THEN
   IF EXISTS (SELECT FROM sentinela.lotes_importacao l WHERE l.competencia=month_start) THEN
     RETURN jsonb_build_object('conflict','competencia');
   END IF;
   SELECT count(DISTINCT (sentinela_pcdf_local.efetivos_csv_v1(r.raw,month_start)->>'chave')),sum(jsonb_array_length(r.diagnostics))
   INTO candidates,issues FROM jsonb_to_recordset(p_batch->'rows') r(raw jsonb,diagnostics jsonb);
   IF to_jsonb(candidates) IS DISTINCT FROM p_batch->'candidates' OR issues IS NULL THEN
     RAISE EXCEPTION USING ERRCODE='22023';
   END IF;
   INSERT INTO sentinela.extracoes_origem(fonte,tamanho_bytes,referencia_arquivo,metodologia,manifesto)
   VALUES ('PCDF',octet_length(p_csv),'csv:sha256:'||file_hash,version,
     jsonb_build_object('proveniencia','declarada_no_csv','utf8',true,'delimitador',';','colunas',26,
       'validacao',version,'inventario','pcdf-inventario-v1','catalogo_ra','ra-review-2026-11-13-v1',
       'candidatas',candidates,'consolidadas',0)) RETURNING id INTO extraction;
   INSERT INTO sentinela.lotes_importacao(extracao_id,nome_arquivo,sha256_arquivo,tamanho_bytes,referencia_arquivo,
     versao_contrato,versao_tratamento,competencia,linhas_esperadas,solicitado_por)
   VALUES (extraction,p_batch->>'name',file_hash,octet_length(p_csv),'csv:sha256:'||file_hash,
     '2.0',version,month_start,records,p_usuario) RETURNING id INTO lot;
   WITH imported_origins AS (INSERT INTO sentinela.linhas_origem(extracao_id,linha_origem_id,aba_origem,linha_xml,versao_identificador,
     ano_registro,unidade_registro,numero_registro,ano_fato,natureza_original,natureza_padronizada_pcdf,
     crime_tentado,cidade_endereco_original,ra_original,area_endereco_original,quadra_endereco_original,
     latitude_geo_original,longitude_geo_original,latitude_utm_original,longitude_utm_original,flagrante,unidade_apuracao)
   SELECT extraction,o.linha_origem_id,'CSV',o.linha_xml,'pcdf-linha-declarada-csv-v2',
     o.ano_registro,o.unidade_registro,o.numero_registro,o.ano_fato,o.natureza_original,o.natureza_padronizada_pcdf,
     o.crime_tentado,o.cidade_endereco_original,o.ra_original,o.area_endereco_original,o.quadra_endereco_original,
     o.latitude_geo_original,o.longitude_geo_original,o.latitude_utm_original,o.longitude_utm_original,o.flagrante,o.unidade_apuracao
   FROM jsonb_to_recordset(p_batch->'rows') r(raw jsonb)
   CROSS JOIN LATERAL jsonb_populate_record(NULL::sentinela.linhas_origem,r.raw) o
   RETURNING id,linha_origem_id)
   SELECT jsonb_object_agg(linha_origem_id,id),count(*) INTO origin_ids,inserted FROM imported_origins;
   IF inserted<>records THEN RAISE EXCEPTION USING ERRCODE='23514'; END IF;
   INSERT INTO sentinela.execucoes_importacao(lote_id,extracao_id,tentativa,solicitado_por,versao_importador,
     versao_validacao,status,linhas_lidas,linhas_processadas,linhas_aptas,pendencias_detectadas,
     checkpoint_registro_csv,checkpoint_detalhes,finalizado_em)
   VALUES (lot,extraction,1,p_usuario,version,version,'concluida',records,records,records,issues,records,
     jsonb_build_object('candidatas',candidates,'consolidadas',0),clock_timestamp()) RETURNING id INTO run;
   INSERT INTO sentinela.linhas_staging(execucao_id,lote_id,extracao_id,linha_origem_id,registro_csv,campos_csv,
     derivados_efetivos,diagnosticos,estado)
   SELECT run,lot,extraction,(origin_ids->>(r.raw->>'linha_origem_id'))::uuid,r.ordinal,r.raw,
     sentinela_pcdf_local.efetivos_csv_v1(r.raw,month_start),
     r.diagnostics,'recebida'
   FROM jsonb_to_recordset(p_batch->'rows') r(ordinal bigint,raw jsonb,diagnostics jsonb)
   
   WHERE r.raw->>'fonte'='PCDF' ;
   GET DIAGNOSTICS inserted=ROW_COUNT;
   IF inserted<>records THEN RAISE EXCEPTION USING ERRCODE='23514'; END IF;
   INSERT INTO sentinela.pendencias_revisao(linha_origem_id,campo,regra,versao_regra,valor_original,motivo,
     tipo,prioridade,efeito,dimensao_afetada)
   SELECT (origin_ids->>(r.raw->>'linha_origem_id'))::uuid,d.field,d.rule,version,r.raw->d.field,d.rule,d.kind,d.priority,
     d.effect,CASE WHEN d.effect='bloqueia_dimensao' THEN d.kind END
   FROM jsonb_to_recordset(p_batch->'rows') r(raw jsonb,diagnostics jsonb)
   CROSS JOIN LATERAL jsonb_to_recordset(r.diagnostics) d(field text,rule text,kind text,priority text,effect text);
   GET DIAGNOSTICS inserted=ROW_COUNT;
   IF inserted<>issues THEN RAISE EXCEPTION USING ERRCODE='23514'; END IF;
 END IF;
 meta := jsonb_build_object('name',p_batch->>'name','month',p_batch->>'month','sha256',file_hash,
   'bytes',octet_length(p_csv),'manifestSha',NULL,'records',records);
 receipt := meta||jsonb_build_object('lot',lot,'run',run,'issues',issues,'replay',extraction IS NULL);
 INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,execucao_id,depois,justificativa,request_id)
 VALUES ('servico','pcdf-local','tentativa_pcdf',run,meta||jsonb_build_object(
   'role','Administrador','actor',p_usuario,'contract','2.0'),'Recepcao de CSV avulso PCDF v2',p_request::text),
 ('servico','pcdf-local',CASE WHEN extraction IS NULL THEN 'reenvio_pcdf' ELSE 'staging_pcdf' END,run,
   receipt||jsonb_build_object('actor',p_usuario,'proveniencia','declarada_no_csv'),
   'Confirmacao institucional do CSV avulso',p_request::text);
 RETURN receipt;
END $_$;




-- FUNCTION sentinela_pcdf_historico.status()
CREATE FUNCTION sentinela_pcdf_historico.status() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT jsonb_agg(jsonb_build_object(
   'month',to_char(a.competencia,'YYYY-MM'),'sha256',a.sha256,'bytes',a.bytes,'records',a.linhas,
   'candidates',a.candidatas,'through',a.cobertura_ate,'complete',a.completa,
   'state',CASE WHEN l.id IS NULL THEN 'missing' WHEN l.sha256_arquivo<>a.sha256 THEN 'conflict'
     WHEN a.competencia='2021-01-01' AND (l.id<>'84908630-bd04-4a03-923d-616649c8de74' OR e.depois IS NULL)
       THEN 'conflict'
     WHEN e.depois IS NULL THEN 'staged' ELSE 'done' END,
   'lot',l.id,'unique',e.depois->'consolidadas','links',e.depois->'vinculos',
   'review',coalesce(e.depois->'origensEmRevisao',e.depois->'identidadeEmRevisao'),
   'issues',CASE WHEN a.competencia='2021-01-01' AND e.depois IS NOT NULL THEN to_jsonb(8091)
     ELSE e.depois->'pendencias' END) ORDER BY a.competencia)
 FROM sentinela_pcdf_historico.arquivos a
 LEFT JOIN LATERAL (
   SELECT l.id,l.sha256_arquivo FROM sentinela.lotes_importacao l JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id
   WHERE l.competencia=a.competencia AND x.fonte='PCDF'
   ORDER BY (l.sha256_arquivo<>a.sha256) DESC,l.id LIMIT 1
 ) l ON true
 LEFT JOIN LATERAL (
   SELECT e.depois FROM sentinela.eventos_auditoria e
   WHERE e.acao=CASE WHEN a.competencia='2021-01-01' THEN 'pcdf.revisao_independente' ELSE 'pcdf.consolidacao_historica' END
     AND e.depois->>'lote'=l.id::text AND e.depois->>'csvSha256'=a.sha256
   LIMIT 1
 ) e ON true;
$$;




SET default_tablespace = '';

SET default_table_access_method = heap;

-- FUNCTION sentinela_pcdf_local.actor()
CREATE FUNCTION sentinela_pcdf_local.actor() RETURNS sentinela.usuarios
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE actor sentinela.usuarios;
BEGIN
  SELECT u.* INTO actor FROM sentinela.usuarios u
  JOIN sentinela.perfil_permissoes p ON p.perfil=u.perfil AND p.acao='importar'
  WHERE u.ativo AND u.id=sentinela_ambiente.ator_importacao();
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
  RETURN actor;
END $$;




-- FUNCTION sentinela_pcdf_local.attempt(uuid, text, jsonb)
CREATE FUNCTION sentinela_pcdf_local.attempt(request uuid, account text, meta jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
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
END $_$;




-- FUNCTION sentinela_pcdf_local.detail(uuid, integer)
CREATE FUNCTION sentinela_pcdf_local.detail(run_id uuid, first_row integer) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  fields text[] := ARRAY['ano_registro','unidade_registro','numero_registro','ocorrencia_chave','ano_fato',
   'data_inicio_fato_original','data','horario','natureza_original','natureza_padronizada_pcdf','crime_tentado',
   'natureza_sentinela_codigo','classificacao_status','versao_mapeamento','cidade_endereco_original','ra_original',
   'area_endereco_original','quadra_endereco_original','ra_codigo','local','latitude_geo_original','longitude_geo_original',
   'latitude_utm_original','longitude_utm_original','latitude','longitude','coordenada_status','flagrante','unidade_apuracao',
   'fonte','linha_origem_id','linha_xml','aba_origem','versao_tratamento'];
BEGIN
  PERFORM sentinela_pcdf_local.actor();
  IF first_row IS NULL OR first_row NOT BETWEEN 0 AND 25000 THEN
    RAISE EXCEPTION USING ERRCODE='22023';
  END IF;

  IF EXISTS (SELECT FROM sentinela.execucoes_importacao e WHERE e.id=run_id
      AND e.versao_importador='pcdf-csv-avulso-v2') THEN
    fields := ARRAY(SELECT name FROM unnest(fields) WITH ORDINALITY AS f(name, position)
      WHERE name NOT IN ('data_inicio_fato_original','natureza_sentinela_codigo','versao_mapeamento',
        'ra_codigo','latitude','longitude','aba_origem','versao_tratamento') ORDER BY position);
  END IF;
  RETURN (SELECT jsonb_build_object('total',e.linhas_lidas,'headers',fields,'rows',coalesce((
    SELECT jsonb_agg(jsonb_build_object('ordinal',s.registro_csv,
      'cells',(SELECT jsonb_agg(s.campos_csv->f.field ORDER BY f.position)
        FROM unnest(fields) WITH ORDINALITY f(field,position)),
      'issues',coalesce((SELECT jsonb_agg(jsonb_build_object('field',d.field,'rule',d.rule))
        FROM jsonb_to_recordset(s.diagnosticos) d(field text,rule text)),'[]'::jsonb))
      ORDER BY s.registro_csv)
    FROM (SELECT registro_csv,campos_csv,diagnosticos FROM sentinela.linhas_staging
      WHERE execucao_id=e.id ORDER BY registro_csv LIMIT 25 OFFSET first_row) s
    ),'[]'::jsonb))
  FROM sentinela.execucoes_importacao e WHERE e.id=run_id AND e.status='concluida');
END $$;




-- FUNCTION sentinela_pcdf_local.efetivos_csv_v1(jsonb, date)
CREATE FUNCTION sentinela_pcdf_local.efetivos_csv_v1(raw jsonb, competencia date) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog'
    AS $_$
 WITH entrada AS (SELECT raw->>'data' AS dia,raw->>'horario' AS hora,raw->>'ocorrencia_chave' AS declarada,
   raw->>'ano_registro' AS ano,raw->>'unidade_registro' AS unidade,raw->>'numero_registro' AS numero),
 dados AS (SELECT *, CASE WHEN dia ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND pg_input_is_valid(dia,'date')
   THEN dia::date END AS data_validada FROM entrada)
 SELECT jsonb_build_object(
   'data',CASE WHEN data_validada>=competencia AND data_validada<competencia+interval '1 month'
       AND left(dia,4)=raw->>'ano_fato' THEN data_validada END,
   'horario',CASE WHEN hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$' THEN hora END,
   'chave',CASE WHEN ano ~ '^[0-9]{4}$' AND ano<>'0000' AND sentinela_pcdf_revisao.informado(unidade)
       AND sentinela_pcdf_revisao.informado(numero) AND pg_input_is_valid(declarada,'jsonb') THEN
     CASE WHEN declarada::jsonb=jsonb_build_array('PCDF',ano,unidade,numero) THEN declarada::jsonb END END,
   'geo',sentinela_pcdf_revisao.estado_geo(raw->>'latitude_geo_original',raw->>'longitude_geo_original'),
   'recepcao','nova_origem') FROM dados
$_$;




-- FUNCTION sentinela_pcdf_local.fail(uuid)
CREATE FUNCTION sentinela_pcdf_local.fail(request uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
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




-- FUNCTION sentinela_pcdf_local.history()
CREATE FUNCTION sentinela_pcdf_local.history() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  PERFORM sentinela_pcdf_local.actor();
  RETURN (SELECT coalesce(jsonb_agg(q.entry ORDER BY q.registrado_em DESC,q.request_id),'[]'::jsonb)
   FROM (SELECT a.registrado_em,a.request_id,
     (a.depois - ARRAY['actor','account']) || jsonb_build_object('request',a.request_id,'at',a.registrado_em,
       'lot',result.depois->'lot','run',result.depois->'run','issues',result.depois->'issues',
       'persisted',coalesce((result.depois->>'records')::bigint,0),
       'status',CASE result.acao WHEN 'staging_pcdf' THEN 'concluida' WHEN 'reenvio_pcdf' THEN 'reenvio'
        WHEN 'falha_pcdf' THEN 'falhou' ELSE 'recebida' END) AS entry
     FROM sentinela.eventos_auditoria a
     LEFT JOIN sentinela.eventos_auditoria result ON result.servico=a.servico AND result.request_id=a.request_id
        AND result.acao IN ('staging_pcdf','reenvio_pcdf','falha_pcdf')
     WHERE a.servico='pcdf-local' AND a.acao='tentativa_pcdf'
     ORDER BY a.registrado_em DESC,a.request_id LIMIT 100) q);
END $$;




-- FUNCTION sentinela_pcdf_local.preflight()
CREATE FUNCTION sentinela_pcdf_local.preflight() RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE actor sentinela.usuarios := sentinela_pcdf_local.actor();
BEGIN
  IF (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace
      AND relkind='r' AND relrowsecurity AND relforcerowsecurity) <> 19
    OR NOT EXISTS (SELECT FROM pg_extension WHERE extname='postgis' AND extnamespace='extensions'::regnamespace)
    OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname=current_user AND NOT (rolcanlogin OR rolsuper OR rolbypassrls
      OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication))
    OR EXISTS (SELECT FROM pg_auth_members m WHERE m.member=current_user::regrole
       OR (m.roleid=current_user::regrole AND (m.member<>'postgres'::regrole OR m.inherit_option)))
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




-- FUNCTION sentinela_pcdf_local.receive(uuid, jsonb, bytea, bytea)
CREATE FUNCTION sentinela_pcdf_local.receive(request uuid, delivery jsonb, content bytea, manifest_bytes bytea) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
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




-- FUNCTION sentinela_pcdf_local.receive_csv(uuid, uuid, text, jsonb, bytea)
CREATE FUNCTION sentinela_pcdf_local.receive_csv(p_request uuid, p_usuario uuid, p_conta text, p_batch jsonb, p_csv bytea) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE
 version constant text := 'pcdf-csv-avulso-v2';
 file_hash text := encode(sha256(p_csv),'hex');
 month_start date;
 records bigint := jsonb_array_length(p_batch->'rows');
 candidates bigint;
 extraction uuid;
 lot uuid;
 run uuid;
 issues bigint;
 inserted bigint;
 receipt jsonb;
 meta jsonb;
BEGIN
 PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,p_conta);
 PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
 IF p_request IS NULL OR p_batch->>'month' IS NULL OR p_batch->>'month' !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
   OR p_batch->>'name' IS DISTINCT FROM 'pcdf_naturezas_'||(p_batch->>'month')||'.csv'
   OR file_hash IS NULL OR file_hash IS DISTINCT FROM p_batch->>'sha256'
   OR octet_length(p_csv) NOT BETWEEN 1 AND 16777216
   OR records IS NULL OR records NOT BETWEEN 1 AND 10000 OR to_jsonb(records) IS DISTINCT FROM p_batch->'records'
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
 month_start := ((p_batch->>'month')||'-01')::date;
 SELECT l.id,e.id,e.pendencias_detectadas INTO lot,run,issues
 FROM sentinela.lotes_importacao l JOIN sentinela.execucoes_importacao e ON e.lote_id=l.id
 WHERE l.sha256_arquivo=file_hash AND l.versao_contrato='2.0' AND l.competencia=month_start
   AND e.versao_importador=version AND e.status='concluida';
 IF NOT FOUND THEN
   IF EXISTS (SELECT FROM sentinela.lotes_importacao l WHERE l.competencia=month_start) THEN
     RETURN jsonb_build_object('conflict','competencia');
   END IF;
   SELECT count(DISTINCT (sentinela_pcdf_local.efetivos_csv_v1(r.raw,month_start)->>'chave')),sum(jsonb_array_length(r.diagnostics))
   INTO candidates,issues FROM jsonb_to_recordset(p_batch->'rows') r(raw jsonb,diagnostics jsonb);
   IF to_jsonb(candidates) IS DISTINCT FROM p_batch->'candidates' OR issues IS NULL THEN
     RAISE EXCEPTION USING ERRCODE='22023';
   END IF;
   INSERT INTO sentinela.extracoes_origem(fonte,tamanho_bytes,referencia_arquivo,metodologia,manifesto)
   VALUES ('PCDF',octet_length(p_csv),'csv:sha256:'||file_hash,version,
     jsonb_build_object('proveniencia','declarada_no_csv','utf8',true,'delimitador',';','colunas',26,
       'validacao',version,'inventario','pcdf-inventario-v1','catalogo_ra','ra-review-2026-11-13-v1',
       'candidatas',candidates,'consolidadas',0)) RETURNING id INTO extraction;
   INSERT INTO sentinela.lotes_importacao(extracao_id,nome_arquivo,sha256_arquivo,tamanho_bytes,referencia_arquivo,
     versao_contrato,versao_tratamento,competencia,linhas_esperadas,solicitado_por)
   VALUES (extraction,p_batch->>'name',file_hash,octet_length(p_csv),'csv:sha256:'||file_hash,
     '2.0',version,month_start,records,p_usuario) RETURNING id INTO lot;
   INSERT INTO sentinela.linhas_origem(extracao_id,linha_origem_id,aba_origem,linha_xml,versao_identificador,
     ano_registro,unidade_registro,numero_registro,ano_fato,natureza_original,natureza_padronizada_pcdf,
     crime_tentado,cidade_endereco_original,ra_original,area_endereco_original,quadra_endereco_original,
     latitude_geo_original,longitude_geo_original,latitude_utm_original,longitude_utm_original,flagrante,unidade_apuracao)
   SELECT extraction,o.linha_origem_id,'CSV',o.linha_xml,'pcdf-linha-declarada-csv-v2',
     o.ano_registro,o.unidade_registro,o.numero_registro,o.ano_fato,o.natureza_original,o.natureza_padronizada_pcdf,
     o.crime_tentado,o.cidade_endereco_original,o.ra_original,o.area_endereco_original,o.quadra_endereco_original,
     o.latitude_geo_original,o.longitude_geo_original,o.latitude_utm_original,o.longitude_utm_original,o.flagrante,o.unidade_apuracao
   FROM jsonb_to_recordset(p_batch->'rows') r(raw jsonb)
   CROSS JOIN LATERAL jsonb_populate_record(NULL::sentinela.linhas_origem,r.raw) o;
   GET DIAGNOSTICS inserted=ROW_COUNT;
   IF inserted<>records THEN RAISE EXCEPTION USING ERRCODE='23514'; END IF;
   INSERT INTO sentinela.execucoes_importacao(lote_id,extracao_id,tentativa,solicitado_por,versao_importador,
     versao_validacao,status,linhas_lidas,linhas_processadas,linhas_aptas,pendencias_detectadas,
     checkpoint_registro_csv,checkpoint_detalhes,finalizado_em)
   VALUES (lot,extraction,1,p_usuario,version,version,'concluida',records,records,records,issues,records,
     jsonb_build_object('candidatas',candidates,'consolidadas',0),clock_timestamp()) RETURNING id INTO run;
   INSERT INTO sentinela.linhas_staging(execucao_id,lote_id,extracao_id,linha_origem_id,registro_csv,campos_csv,
     derivados_efetivos,diagnosticos,estado)
   SELECT run,lot,extraction,o.id,r.ordinal,r.raw,
     sentinela_pcdf_local.efetivos_csv_v1(r.raw,month_start),
     r.diagnostics,'recebida'
   FROM jsonb_to_recordset(p_batch->'rows') r(ordinal bigint,raw jsonb,diagnostics jsonb)
   JOIN sentinela.linhas_origem o ON o.extracao_id=extraction AND o.linha_origem_id=r.raw->>'linha_origem_id'
   WHERE r.raw->>'fonte'='PCDF' ;
   GET DIAGNOSTICS inserted=ROW_COUNT;
   IF inserted<>records THEN RAISE EXCEPTION USING ERRCODE='23514'; END IF;
   INSERT INTO sentinela.pendencias_revisao(linha_origem_id,campo,regra,versao_regra,valor_original,motivo,
     tipo,prioridade,efeito,dimensao_afetada)
   SELECT s.linha_origem_id,d.field,d.rule,version,s.campos_csv->d.field,d.rule,d.kind,d.priority,
     d.effect,CASE WHEN d.effect='bloqueia_dimensao' THEN d.kind END
   FROM sentinela.linhas_staging s
   CROSS JOIN LATERAL jsonb_to_recordset(s.diagnosticos) d(field text,rule text,kind text,priority text,effect text)
   WHERE s.execucao_id=run;
   GET DIAGNOSTICS inserted=ROW_COUNT;
   IF inserted<>issues THEN RAISE EXCEPTION USING ERRCODE='23514'; END IF;
 END IF;
 meta := jsonb_build_object('name',p_batch->>'name','month',p_batch->>'month','sha256',file_hash,
   'bytes',octet_length(p_csv),'manifestSha',NULL,'records',records);
 receipt := meta||jsonb_build_object('lot',lot,'run',run,'issues',issues,'replay',extraction IS NULL);
 INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,execucao_id,depois,justificativa,request_id)
 VALUES ('servico','pcdf-local','tentativa_pcdf',run,meta||jsonb_build_object(
   'role','Administrador','actor',p_usuario,'contract','2.0'),'Recepcao de CSV avulso PCDF v2',p_request::text),
 ('servico','pcdf-local',CASE WHEN extraction IS NULL THEN 'reenvio_pcdf' ELSE 'staging_pcdf' END,run,
   receipt||jsonb_build_object('actor',p_usuario,'proveniencia','declarada_no_csv'),
   'Confirmacao institucional do CSV avulso',p_request::text);
 RETURN receipt;
END $_$;




-- FUNCTION sentinela_pcdf_revisao.decimal_geo(text, integer)
CREATE FUNCTION sentinela_pcdf_revisao.decimal_geo(valor text, limite integer) RETURNS numeric
    LANGUAGE sql IMMUTABLE STRICT
    SET search_path TO 'pg_catalog'
    AS $_$
 SELECT CASE WHEN length(valor)<=16384 AND valor ~ '^[+-]?[0-9]+(\.[0-9]+)?$' THEN
   CASE WHEN abs(valor::numeric)<=limite THEN valor::numeric END END
$_$;




-- FUNCTION sentinela_pcdf_revisao.estado_geo(text, text)
CREATE FUNCTION sentinela_pcdf_revisao.estado_geo(lat text, lon text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $$
 SELECT CASE
   WHEN (sentinela_pcdf_revisao.informado(lat) AND sentinela_pcdf_revisao.decimal_geo(lat,90) IS NULL)
     OR (sentinela_pcdf_revisao.informado(lon) AND sentinela_pcdf_revisao.decimal_geo(lon,180) IS NULL) THEN 'invalida'
   WHEN NOT sentinela_pcdf_revisao.informado(lat) AND NOT sentinela_pcdf_revisao.informado(lon) THEN 'ausente'
   WHEN NOT sentinela_pcdf_revisao.informado(lat) OR NOT sentinela_pcdf_revisao.informado(lon) THEN 'incompleta'
   ELSE 'referencia_pendente' END
$$;




-- FUNCTION sentinela_pcdf_revisao.informado(text)
CREATE FUNCTION sentinela_pcdf_revisao.informado(valor text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $_$
 SELECT coalesce(lower(regexp_replace(valor,'^[[:space:]]+|[[:space:]]+$','','g')) NOT IN
    ('','null','não informado','não informada','nao informado','nao informada','ra 98_não informada'),false)
$_$;




-- FUNCTION sentinela_pcdf_revisao.motivo(text, text, text, text, text, jsonb)
CREATE FUNCTION sentinela_pcdf_revisao.motivo(campo text, regra text, tipo text, status text, motivo text, raw jsonb) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog'
    AS $$
 SELECT CASE
   WHEN status='resolvida' THEN 'Resolvida. '||motivo
   WHEN status='encerrada_sem_solucao' THEN 'Encerrada após revisão. '||motivo
   WHEN tipo='identificacao' THEN 'Revisão humana da identidade policial. '||motivo
   WHEN tipo='datas_horarios' THEN 'Aviso temporal. O valor inconsistente não integra a dimensão correspondente. '||motivo
   WHEN campo='coordenada_status' AND regra NOT IN ('revisao_utm_sem_geo','coordenada_status_divergente')
     AND NOT starts_with(regra,'utm_')
     THEN CASE sentinela_pcdf_revisao.estado_geo(raw->>'latitude_geo_original',raw->>'longitude_geo_original')
       WHEN 'ausente' THEN 'Localização GEO pendente. Latitude e longitude ausentes na origem.'
       WHEN 'incompleta' THEN 'Localização GEO pendente. O par de latitude e longitude está incompleto.'
       WHEN 'invalida' THEN 'Localização GEO pendente. Há um valor inválido no par original.'
       ELSE 'Localização GEO pendente. O par aguarda confirmação da referência espacial.' END
   WHEN campo IN ('latitude_geo_original','longitude_geo_original') THEN 'Revisão da localização GEO. '||motivo
   WHEN tipo='coordenadas' THEN 'Aviso sobre coordenadas de origem. '||motivo
   WHEN tipo='classificacao' THEN 'Aviso de natureza de origem. '||motivo
   WHEN tipo='endereco_ra' THEN 'Aviso de endereço ou referência territorial. '||motivo
   ELSE 'Aviso de qualidade. '||motivo END
$$;




-- FUNCTION sentinela_pcdf_revisao.ponto_geo(text, text, integer, text, extensions.geometry)
CREATE FUNCTION sentinela_pcdf_revisao.ponto_geo(lat text, lon text, srid integer, evidencia text, limite extensions.geometry) RETURNS extensions.geometry
    LANGUAGE plpgsql STABLE STRICT
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE ponto extensions.geometry;
BEGIN
 IF sentinela_pcdf_revisao.estado_geo(lat,lon)<>'referencia_pendente' OR btrim(evidencia)=''
   OR extensions.ST_SRID(limite)<>4326 OR extensions.ST_IsEmpty(limite) OR NOT extensions.ST_IsValid(limite)
   OR extensions.ST_GeometryType(limite) NOT IN ('ST_Polygon','ST_MultiPolygon')
   OR NOT EXISTS (SELECT FROM extensions.spatial_ref_sys r WHERE r.srid=ponto_geo.srid
                  AND r.srtext ~ '^(GEOGCS|GEOGCRS)\[')
 THEN RETURN NULL; END IF;
 ponto := extensions.ST_Transform(extensions.ST_SetSRID(extensions.ST_MakePoint(
   sentinela_pcdf_revisao.decimal_geo(lon,180)::double precision,
   sentinela_pcdf_revisao.decimal_geo(lat,90)::double precision),srid),4326);
 IF extensions.ST_Covers(limite,ponto) THEN RETURN ponto; END IF;
 RETURN NULL;
END $$;




-- FUNCTION sentinela_pessoas.autorizar(uuid, uuid)
CREATE FUNCTION sentinela_pessoas.autorizar(actor uuid, identidade uuid) RETURNS void
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
 IF session_user<>'sentinela_local_admin' OR actor IS DISTINCT FROM sentinela_ambiente.ator_operacional() OR NOT EXISTS (
   SELECT FROM sentinela.usuarios u JOIN sentinela.perfil_permissoes p ON p.perfil=u.perfil
   WHERE u.id=actor AND u.auth_user_id=identidade AND u.ativo AND u.perfil='Administrador' AND p.acao='administrar')
 THEN RAISE EXCEPTION 'Acesso institucional não autorizado' USING ERRCODE='42501'; END IF;
END $$;




-- FUNCTION sentinela_pessoas.criar(uuid, uuid, uuid, text, text, text, text)
CREATE FUNCTION sentinela_pessoas.cadastro_pendente(p_ator uuid, p_identidade uuid, p_alvo uuid,
  p_nome text, p_email text, p_perfil text, p_unidade text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
 SELECT p_ator=sentinela_ambiente.ator_operacional() AND EXISTS (
   SELECT FROM auth.users a
   JOIN sentinela.usuarios u ON u.id=a.id AND u.auth_user_id=a.id
   CROSS JOIN LATERAL (SELECT a.raw_app_meta_data->'sentinela_cadastro_institucional' AS vinculo) m
   WHERE a.id=p_alvo AND a.email=p_email AND NOT u.ativo
     AND u.perfil=p_perfil AND u.nome_exibicao=p_nome
     AND a.raw_app_meta_data->>'sentinela_onboarding'='provisioning'
     AND m.vinculo->>'actor'=p_ator::text AND m.vinculo->>'identity'=p_identidade::text
     AND m.vinculo->>'name'=p_nome AND m.vinculo->>'perfil'=p_perfil
     AND nullif(m.vinculo->>'orgao','') IS NOT DISTINCT FROM p_unidade
 )
$$;
REVOKE ALL ON FUNCTION sentinela_pessoas.cadastro_pendente(uuid,uuid,uuid,text,text,text,text)
 FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sentinela_pessoas.cadastro_pendente(uuid,uuid,uuid,text,text,text,text)
 TO sentinela_pessoas_owner;

CREATE FUNCTION sentinela_pessoas.criar(actor uuid, identidade uuid, alvo uuid, nome text, email text, perfil text, unidade text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE registro jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(743204,22);
 PERFORM sentinela_pessoas.autorizar(actor,identidade);
 IF alvo IS NULL OR NOT coalesce(length(btrim(nome)) BETWEEN 1 AND 160,false)
 OR NOT coalesce(length(email)<=254 AND email=lower(email) AND email ~ '^[^[:space:]@]+@gmail\.com$',false)
 OR NOT coalesce(perfil IN ('Administrador','Operador','Analista'),false)
 THEN RAISE EXCEPTION 'Cadastro inválido' USING ERRCODE='22023'; END IF;

 IF NOT sentinela_pessoas.cadastro_pendente(actor,identidade,alvo,nome,email,perfil,unidade)
 THEN RAISE EXCEPTION 'Provisionamento Auth pendente não encontrado' USING ERRCODE='42501'; END IF;
 SELECT r INTO registro FROM sentinela_pessoas.registros(alvo) r;
 IF EXISTS (SELECT FROM sentinela_pessoas.contatos c WHERE c.usuario=alvo) THEN
   IF registro->>'name'=nome AND registro->>'email'=email AND registro->>'perfil'=perfil
     AND (registro->>'orgao') IS NOT DISTINCT FROM unidade
   THEN RETURN registro; END IF;
   RAISE EXCEPTION 'Usuário já cadastrado' USING ERRCODE='23505';
 END IF;
 IF EXISTS(SELECT FROM sentinela_pessoas.contatos c WHERE lower(c.email)=criar.email)
 THEN RAISE EXCEPTION 'E-mail já cadastrado' USING ERRCODE='23505'; END IF;

 -- Migration 0007 activates this link only after Auth sets the password phase.
 INSERT INTO sentinela_pessoas.contatos(usuario,email,orgao) VALUES (alvo,email,unidade);
 INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,depois,justificativa)
 VALUES ('servico','sentinela-usuarios','usuarios.criar_institucional',
   jsonb_build_object('actor',actor,'alvo',alvo,'perfil',perfil),'Cadastro pela administração institucional');
 RETURN (SELECT r FROM sentinela_pessoas.registros(alvo) r);
END $_$;




-- FUNCTION sentinela_pessoas.editar(uuid, uuid, uuid, text, text, text, text)
CREATE FUNCTION sentinela_pessoas.editar(actor uuid, identidade uuid, alvo uuid, versao text, nome text, contato text, unidade text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE anterior jsonb; posterior jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(743204,22);
 PERFORM sentinela_pessoas.autorizar(actor,identidade);
 IF nome IS NULL OR length(btrim(nome)) NOT BETWEEN 1 AND 160 THEN
   RAISE EXCEPTION 'Nome inválido' USING ERRCODE='22023'; END IF;
 PERFORM FROM sentinela.usuarios WHERE id=alvo AND auth_user_id IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado' USING ERRCODE='P0002'; END IF;
 SELECT r INTO anterior FROM sentinela_pessoas.registros(alvo) r;
 IF anterior->>'version' IS DISTINCT FROM versao THEN RAISE EXCEPTION 'Cadastro alterado' USING ERRCODE='40001'; END IF;
 IF jsonb_build_array(anterior->'name',anterior->'email',anterior->'orgao')=
    jsonb_build_array(btrim(nome),contato,unidade) THEN RETURN anterior; END IF;
 UPDATE sentinela.usuarios SET nome_exibicao=btrim(nome) WHERE id=alvo;
 INSERT INTO sentinela_pessoas.contatos(usuario,email,orgao) VALUES (alvo,contato,unidade)
   ON CONFLICT(usuario) DO UPDATE SET email=excluded.email,orgao=excluded.orgao;
 SELECT r INTO posterior FROM sentinela_pessoas.registros(alvo) r;
 INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,antes,depois,justificativa)
 VALUES ('servico','sentinela-usuarios','usuarios.editar_institucional',
    anterior-'activity'-'version',(posterior-'activity'-'version')||jsonb_build_object('actor',actor,'alvo',alvo),
    'Edição do cadastro institucional pela administração local');
 RETURN (SELECT r FROM sentinela_pessoas.registros(alvo) r);
END $$;




-- FUNCTION sentinela_pessoas.excluir(uuid, uuid, uuid, text, text)
CREATE FUNCTION sentinela_pessoas.excluir(actor uuid, identidade uuid, alvo uuid, email text, etapa text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE u record; e sentinela_pessoas.exclusoes%ROWTYPE; resultado text;
BEGIN
 PERFORM pg_advisory_xact_lock(743204,22);
 PERFORM sentinela_pessoas.autorizar(actor,identidade);
 SELECT * INTO e FROM sentinela_pessoas.exclusoes WHERE usuario=alvo;
 IF e.concluida_em IS NOT NULL THEN
   RETURN jsonb_build_object('complete',true);
 END IF;
 SELECT id,auth_user_id,nome_exibicao,perfil,ativo INTO u FROM sentinela.usuarios WHERE id=alvo;
 IF NOT FOUND OR coalesce(u.auth_user_id,e.identidade_pendente) IS NULL
   OR (u.auth_user_id IS NOT NULL AND e.identidade_pendente IS NOT NULL AND u.auth_user_id<>e.identidade_pendente)
 THEN RAISE EXCEPTION 'Usuário não encontrado' USING ERRCODE='P0002'; END IF;
 IF u.ativo AND u.perfil='Administrador' AND NOT EXISTS (
   SELECT FROM sentinela.usuarios other WHERE other.id<>alvo AND other.ativo AND other.perfil='Administrador' AND other.auth_user_id IS NOT NULL
 ) THEN RAISE EXCEPTION 'Último Administrador ativo' USING ERRCODE='23514'; END IF;
 IF alvo=actor OR coalesce(u.auth_user_id,e.identidade_pendente)=identidade
 THEN RAISE EXCEPTION 'Autoexclusão proibida' USING ERRCODE='42501'; END IF;
 IF etapa='consultar' THEN
   RETURN jsonb_build_object('complete',false,'authId',coalesce(u.auth_user_id,e.identidade_pendente),'name',u.nome_exibicao,'perfil',u.perfil,
     'email',e.email_confirmacao);
 END IF;
 IF NOT coalesce(length(email)<=254 AND email=lower(email) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+$',false)
    OR (e.usuario IS NOT NULL AND email IS DISTINCT FROM e.email_confirmacao)
 THEN RAISE EXCEPTION 'Confirmação de e-mail inválida' USING ERRCODE='22023'; END IF;
 IF etapa='iniciar' THEN
   IF e.usuario IS NOT NULL THEN RETURN jsonb_build_object('complete',false); END IF;
   INSERT INTO sentinela_pessoas.exclusoes(usuario,email_confirmacao,identidade_pendente) VALUES(alvo,email,u.auth_user_id);
   resultado := 'pendente';
 ELSIF e.usuario IS NOT NULL AND etapa='concluir' AND u.auth_user_id IS NULL THEN
   UPDATE sentinela.usuarios SET ativo=false,nome_exibicao='Usuário excluído' WHERE id=alvo;
   UPDATE sentinela_pessoas.contatos SET email=NULL,orgao=NULL WHERE usuario=alvo;
   UPDATE sentinela_pessoas.exclusoes SET email_confirmacao=NULL,identidade_pendente=NULL,concluida_em=clock_timestamp() WHERE usuario=alvo;
   resultado := 'concluida';
 ELSIF e.usuario IS NOT NULL AND etapa='falha' THEN
   resultado := 'falha_parcial';
 ELSE RAISE EXCEPTION 'Etapa de exclusão inválida' USING ERRCODE='22023'; END IF;
 INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,depois,justificativa)
 VALUES ('servico','sentinela-usuarios','usuarios.excluir_institucional',
   jsonb_build_object('actor',actor,'alvo',alvo,'resultado',resultado),'Exclusão administrativa de usuário');
 RETURN jsonb_build_object('complete',resultado='concluida');
END $_$;




-- FUNCTION sentinela_pessoas.listar(uuid, uuid)
CREATE FUNCTION sentinela_pessoas.listar(actor uuid, identidade uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
 PERFORM sentinela_pessoas.autorizar(actor,identidade);
 RETURN (SELECT coalesce(jsonb_agg(r || jsonb_build_object('deletionPending',e.usuario IS NOT NULL)),'[]'::jsonb)
   FROM sentinela_pessoas.registros(NULL) r
   LEFT JOIN sentinela_pessoas.exclusoes e ON e.usuario=(r->>'id')::uuid
   WHERE e.concluida_em IS NULL);
END $$;




-- FUNCTION sentinela_pessoas.registros(uuid)
CREATE FUNCTION sentinela_pessoas.registros(alvo uuid) RETURNS SETOF jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog'
    AS $$
 SELECT jsonb_build_object('id',u.id,'name',u.nome_exibicao,'email',c.email,'orgao',c.orgao,
   'perfil',u.perfil,'ativo',u.ativo,'cadastro',u.criado_em,
   'version',encode(sha256(convert_to(jsonb_build_array(u.nome_exibicao,c.email,c.orgao)::text,'UTF8')),'hex'),
   'activity',coalesce((SELECT jsonb_agg(a.registrado_em ORDER BY a.registrado_em DESC) FROM (
     SELECT registrado_em FROM sentinela.eventos_auditoria
     WHERE acao='usuarios.editar_institucional' AND depois->>'alvo'=u.id::text ORDER BY registrado_em DESC LIMIT 5
   ) a),'[]'::jsonb))
 FROM sentinela.usuarios u LEFT JOIN sentinela_pessoas.contatos c ON c.usuario=u.id
 WHERE alvo IS NULL OR u.id=alvo ORDER BY u.nome_exibicao,u.id
$$;




-- ALTER TABLE sentinela.extracoes_origem
ALTER TABLE sentinela.extracoes_origem ALTER COLUMN nome_xml DROP NOT NULL;
ALTER TABLE sentinela.extracoes_origem ALTER COLUMN sha256_xml DROP NOT NULL;
ALTER TABLE sentinela.extracoes_origem ADD CONSTRAINT extracao_xml_ou_csv CHECK (
CASE
    WHEN (metodologia = 'pcdf-csv-avulso-v2'::text) THEN ((nome_xml IS NULL) AND (sha256_xml IS NULL) AND ((fonte)::text = 'PCDF'::text) AND ((referencia_arquivo)::text ~ '^csv:sha256:[0-9a-f]{64}$'::text) AND (NOT ((manifesto ->> 'proveniencia'::text) IS DISTINCT FROM 'declarada_no_csv'::text)))
    ELSE (((nome_xml IS NOT NULL) AND (sha256_xml IS NOT NULL)) OR ((nome_xml IS NULL) AND (sha256_xml IS NULL) AND ((fonte)::text = 'PCDF'::text) AND (metodologia = 'pcdf-csv-local-v1'::text) AND ((referencia_arquivo)::text ~ '^csv:sha256:[0-9a-f]{64}$'::text)))
END);

-- ALTER TABLE sentinela.naturezas_criminais
ALTER TABLE sentinela.naturezas_criminais ADD COLUMN codigo_manual text;
ALTER TABLE sentinela.naturezas_criminais ADD COLUMN referencia_catalogo_manual jsonb;
ALTER TABLE sentinela.naturezas_criminais ADD CONSTRAINT naturezas_criminais_check CHECK (((codigo_manual IS NULL) OR (((fonte)::text = 'SENTINELA_MANUAL'::text) AND (codigo_manual = btrim(codigo_manual)) AND ((length(codigo_manual) >= 1) AND (length(codigo_manual) <= 80)))));
ALTER TABLE sentinela.naturezas_criminais ADD CONSTRAINT naturezas_criminais_check1 CHECK (((referencia_catalogo_manual IS NULL) OR (((fonte)::text = 'SENTINELA_MANUAL'::text) AND (codigo_manual IS NOT NULL) AND COALESCE(((jsonb_typeof(referencia_catalogo_manual) = 'object'::text) AND ((referencia_catalogo_manual ->> 'situacao'::text) = 'homologada'::text) AND (length(btrim((referencia_catalogo_manual ->> 'fonte'::text))) > 0) AND (length(btrim((referencia_catalogo_manual ->> 'versao'::text))) > 0) AND (length(btrim((referencia_catalogo_manual ->> 'evidencia'::text))) > 0) AND ((referencia_catalogo_manual ->> 'sha256'::text) ~ '^[a-f0-9]{64}$'::text)), false))));

-- ALTER TABLE sentinela.ocorrencia_naturezas
ALTER TABLE sentinela.ocorrencia_naturezas ALTER COLUMN natureza_id DROP NOT NULL;
ALTER TABLE sentinela.ocorrencia_naturezas ADD CONSTRAINT associacao_natureza_ausente_pcdf_ck CHECK (((natureza_id IS NOT NULL) OR ((origem = 'importacao'::text) AND (linha_origem_id IS NOT NULL) AND (mapeamento_id IS NULL) AND (classificacao_status = ANY (ARRAY['pendente'::text, 'sem_correspondencia'::text, 'conflitante'::text])))));

-- ALTER TABLE sentinela.regioes_administrativas
ALTER TABLE sentinela.regioes_administrativas ADD COLUMN referencia_cartografica jsonb;

-- TABLE sentinela_exclusao.comprovantes
CREATE TABLE sentinela_exclusao.comprovantes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lote uuid NOT NULL,
    responsavel uuid NOT NULL,
    justificativa text NOT NULL,
    momento timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    quantidades jsonb NOT NULL,
    revisao_autorizada text,
    backup_restaurado text,
    CONSTRAINT comprovante_pontual_jan2021 CHECK ((((revisao_autorizada IS NULL) AND (backup_restaurado IS NULL)) OR ((lote = 'a88ac192-edef-4339-8381-106bbd1b391e'::uuid) AND (responsavel = '29e7ec39-192b-4790-9180-3df950969bfc'::uuid) AND (revisao_autorizada IS NOT NULL) AND (backup_restaurado IS NOT NULL) AND (revisao_autorizada = 'e7de205ec3812ec78740c4041868f3982e3e964602c1b7a9c61f80d426e0ed71'::text) AND (backup_restaurado = 'fa4ed26293a1e09e49b35963fedd58a37f0f72c29e2bade7386d4bdd96b08108'::text)))),
    CONSTRAINT comprovantes_justificativa_check CHECK (((length(btrim(justificativa)) >= 1) AND (length(btrim(justificativa)) <= 500))),
    CONSTRAINT comprovantes_quantidades_check CHECK ((jsonb_typeof(quantidades) = 'object'::text))
);

ALTER TABLE ONLY sentinela_exclusao.comprovantes FORCE ROW LEVEL SECURITY;




-- TABLE sentinela_general_accounts.individuals
CREATE TABLE sentinela_general_accounts.individuals (
    login name NOT NULL,
    subject uuid NOT NULL
);

ALTER TABLE ONLY sentinela_general_accounts.individuals FORCE ROW LEVEL SECURITY;




-- VIEW sentinela_gestao.lotes
CREATE VIEW sentinela_gestao.lotes AS
 SELECT l.id,
    l.nome_arquivo AS arquivo,
    to_char((l.competencia)::timestamp with time zone, 'YYYY-MM'::text) AS competencia,
    l.versao_contrato AS contrato,
        CASE
            WHEN ((x.fonte)::text = 'PCDF'::text) THEN 'CSV'::text
            ELSE upper((x.manifesto ->> 'format'::text))
        END AS formato,
    COALESCE(e.finalizado_em, e.criado_em, l.criado_em) AS data,
        CASE
            WHEN ((x.fonte)::text = 'PCDF'::text) THEN u.nome_exibicao
            ELSE ( SELECT a.nome_exibicao
               FROM (sentinela.eventos_auditoria h
                 JOIN sentinela.usuarios a ON (((a.id)::text = (h.depois ->> 'subject'::text))))
              WHERE ((h.servico = 'importacao-geral-local'::text) AND ((h.acao)::text = 'staging_geral'::text) AND (h.execucao_id = e.id))
              ORDER BY h.registrado_em
             LIMIT 1)
        END AS responsavel,
        CASE
            WHEN ((e.status = 'concluida'::text) AND (e.pendencias_detectadas > 0)) THEN 'com_pendencias'::text
            WHEN (e.status = ANY (ARRAY['concluida'::text, 'falhou'::text, 'cancelada'::text])) THEN e.status
            ELSE 'em_processamento'::text
        END AS situacao,
    e.id AS execucao,
    e.linhas_lidas,
    e.pendencias_detectadas,
    l.sha256_arquivo AS sha256,
    l.tamanho_bytes AS bytes,
    x.fonte,
        CASE
            WHEN ((x.fonte)::text = 'PCDF'::text) THEN (x.sha256_xml)::text
            ELSE NULL::text
        END AS sha_xml,
    l.extracao_id
   FROM (((sentinela.lotes_importacao l
     JOIN sentinela.extracoes_origem x ON ((x.id = l.extracao_id)))
     LEFT JOIN LATERAL ( SELECT r.id,
            r.lote_id,
            r.extracao_id,
            r.tentativa,
            r.motivo_reprocessamento,
            r.solicitado_por,
            r.versao_importador,
            r.versao_validacao,
            r.versao_mapeamento,
            r.status,
            r.linhas_lidas,
            r.linhas_processadas,
            r.linhas_aptas,
            r.linhas_bloqueadas,
            r.linhas_reenviadas,
            r.ocorrencias_criadas,
            r.associacoes_criadas,
            r.pendencias_detectadas,
            r.erros_detectados,
            r.checkpoint_registro_csv,
            r.checkpoint_detalhes,
            r.falha,
            r.criado_em,
            r.atualizado_em,
            r.finalizado_em
           FROM sentinela.execucoes_importacao r
          WHERE (r.lote_id = l.id)
          ORDER BY r.tentativa DESC
         LIMIT 1) e ON (true))
     LEFT JOIN sentinela.usuarios u ON ((u.id = COALESCE(e.solicitado_por, l.solicitado_por))));




-- TABLE sentinela_gestao_autorizacao.atores
CREATE TABLE sentinela_gestao_autorizacao.atores (
    usuario uuid NOT NULL,
    identidade uuid NOT NULL,
    conta text NOT NULL,
    validade timestamp with time zone NOT NULL,
    CONSTRAINT atores_conta_check CHECK ((conta ~ '^[a-f0-9]{64}$'::text))
);

ALTER TABLE ONLY sentinela_gestao_autorizacao.atores FORCE ROW LEVEL SECURITY;




-- TABLE sentinela_gestao_autorizacao.exclusoes
CREATE TABLE sentinela_gestao_autorizacao.exclusoes (
    lote uuid NOT NULL,
    usuario uuid NOT NULL,
    revisao text NOT NULL,
    aprovacao text NOT NULL,
    prova_restauracao text NOT NULL,
    validade timestamp with time zone NOT NULL,
    excecao_jan2021 boolean DEFAULT false NOT NULL,
    CONSTRAINT exclusao_pontual_jan2021 CHECK (((NOT excecao_jan2021) OR ((lote = 'a88ac192-edef-4339-8381-106bbd1b391e'::uuid) AND (usuario = '29e7ec39-192b-4790-9180-3df950969bfc'::uuid) AND (revisao = 'e7de205ec3812ec78740c4041868f3982e3e964602c1b7a9c61f80d426e0ed71'::text) AND (prova_restauracao = 'fa4ed26293a1e09e49b35963fedd58a37f0f72c29e2bade7386d4bdd96b08108'::text)))),
    CONSTRAINT exclusoes_aprovacao_check CHECK (((length(btrim(aprovacao)) >= 1) AND (length(btrim(aprovacao)) <= 240))),
    CONSTRAINT exclusoes_prova_restauracao_check CHECK (((length(btrim(prova_restauracao)) >= 1) AND (length(btrim(prova_restauracao)) <= 240))),
    CONSTRAINT exclusoes_revisao_check CHECK ((revisao ~ '^[a-f0-9]{64}$'::text))
);

ALTER TABLE ONLY sentinela_gestao_autorizacao.exclusoes FORCE ROW LEVEL SECURITY;




-- TABLE sentinela_gestao_autorizacao.release
CREATE TABLE sentinela_gestao_autorizacao.release (
    singleton boolean DEFAULT true NOT NULL,
    versao text NOT NULL,
    artefato_sha256 text NOT NULL,
    cluster_uuid uuid NOT NULL,
    system_id text NOT NULL,
    porta integer NOT NULL,
    aberta boolean DEFAULT false NOT NULL,
    CONSTRAINT release_artefato_sha256_check CHECK ((artefato_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT release_singleton_check CHECK (singleton),
    CONSTRAINT release_system_id_check CHECK ((system_id ~ '^[0-9]{15,22}$'::text)),
    CONSTRAINT release_versao_check CHECK ((versao = 'local-import-management-0001'::text))
);

ALTER TABLE ONLY sentinela_gestao_autorizacao.release FORCE ROW LEVEL SECURITY;




-- TABLE sentinela_import_local.local_revision
CREATE TABLE sentinela_import_local.local_revision (
    version text NOT NULL
);

ALTER TABLE ONLY sentinela_import_local.local_revision FORCE ROW LEVEL SECURITY;




-- TABLE sentinela_import_local.requests
CREATE TABLE sentinela_import_local.requests (
    request uuid NOT NULL,
    subject uuid NOT NULL,
    actor text NOT NULL,
    created timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    metadata jsonb NOT NULL,
    status text DEFAULT 'recebida'::text NOT NULL,
    receipt jsonb,
    CONSTRAINT requests_actor_check CHECK ((actor = ANY (ARRAY['Administrador'::text, 'Operador'::text]))),
    CONSTRAINT requests_check CHECK (((status = 'concluida'::text) = (receipt IS NOT NULL))),
    CONSTRAINT requests_status_check CHECK ((status = ANY (ARRAY['recebida'::text, 'concluida'::text, 'falhou'::text])))
);

ALTER TABLE ONLY sentinela_import_local.requests FORCE ROW LEVEL SECURITY;




-- VIEW sentinela_ocorrencias_analytics.categorias_criminais
CREATE VIEW sentinela_ocorrencias_analytics.categorias_criminais WITH (security_barrier='true') AS
 SELECT id,
    nome,
    status
   FROM sentinela.categorias_criminais;




-- VIEW sentinela_ocorrencias_analytics.ocorrencia_naturezas
CREATE VIEW sentinela_ocorrencias_analytics.ocorrencia_naturezas WITH (security_barrier='true') AS
 SELECT a.ocorrencia_id,
    a.natureza_id,
    a.mapeamento_id,
    COALESCE(l.natureza_padronizada_pcdf, n.categoria_pcdf_original) AS categoria_pcdf_original,
    a.crime_tentado
   FROM ((sentinela.ocorrencia_naturezas a
     JOIN sentinela.naturezas_criminais n ON ((n.id = a.natureza_id)))
     LEFT JOIN sentinela.linhas_origem l ON ((l.id = a.linha_origem_id)));




-- VIEW sentinela_ocorrencias_analytics.mapeamentos_natureza
CREATE VIEW sentinela_ocorrencias_analytics.mapeamentos_natureza WITH (security_barrier='true') AS
 SELECT id,
    natureza_id,
    categoria_id
   FROM sentinela.mapeamentos_natureza m
  WHERE (EXISTS ( SELECT
           FROM sentinela_ocorrencias_analytics.ocorrencia_naturezas a
          WHERE (a.mapeamento_id = m.id)));




-- VIEW sentinela_ocorrencias_analytics.naturezas_criminais
CREATE VIEW sentinela_ocorrencias_analytics.naturezas_criminais WITH (security_barrier='true') AS
 SELECT id,
    descricao_original,
    (((fonte)::text = 'PCDF'::text) AND (categoria_pcdf_original IS NULL) AND sentinela.descricao_pcdf(descricao_original)) AS catalogo_pcdf
   FROM sentinela.naturezas_criminais n
  WHERE ((((fonte)::text = 'PCDF'::text) AND (categoria_pcdf_original IS NULL) AND sentinela.descricao_pcdf(descricao_original)) OR (EXISTS ( SELECT
           FROM sentinela_ocorrencias_analytics.ocorrencia_naturezas a
          WHERE (a.natureza_id = n.id))));




-- VIEW sentinela_ocorrencias_analytics.ocorrencias
CREATE VIEW sentinela_ocorrencias_analytics.ocorrencias WITH (security_barrier='true') AS
 SELECT id,
    ativo,
    ra_id,
    data_fato,
    horario_fato,
    latitude,
    longitude,
    localizacao_status,
    fonte,
    origem
   FROM sentinela.ocorrencias
  WHERE (ativo AND (consolidacao_status = 'consolidada'::text));




-- TABLE sentinela_ocorrencias_analytics.pcdf_pontos
CREATE TABLE sentinela_ocorrencias_analytics.pcdf_pontos (
    ocorrencia_id uuid NOT NULL,
    versao_ocorrencia bigint NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    geometria extensions.geometry(Point,4326) NOT NULL,
    ra_codigo text NOT NULL,
    origem_sha256 text NOT NULL,
    publicacao_id uuid NOT NULL,
    publicado_em timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT pcdf_pontos_check CHECK (((extensions.st_x(geometria) = longitude) AND (extensions.st_y(geometria) = latitude))),
    CONSTRAINT pcdf_pontos_latitude_check CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision))),
    CONSTRAINT pcdf_pontos_longitude_check CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision))),
    CONSTRAINT pcdf_pontos_origem_sha256_check CHECK ((origem_sha256 ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT pcdf_pontos_versao_ocorrencia_check CHECK ((versao_ocorrencia > 0))
);

ALTER TABLE ONLY sentinela_ocorrencias_analytics.pcdf_pontos FORCE ROW LEVEL SECURITY;




-- VIEW sentinela_ocorrencias_analytics.pontos_pcdf_publicados
CREATE VIEW sentinela_ocorrencias_analytics.pontos_pcdf_publicados WITH (security_barrier='true') AS
 SELECT p.ocorrencia_id AS id,
    p.latitude,
    p.longitude,
    p.ra_codigo
   FROM (sentinela_ocorrencias_analytics.pcdf_pontos p
     JOIN sentinela.ocorrencias o ON ((o.id = p.ocorrencia_id)))
  WHERE (o.ativo AND (o.consolidacao_status = 'consolidada'::text) AND ((o.fonte)::text = 'PCDF'::text) AND (o.origem = 'importacao'::text) AND (o.versao = p.versao_ocorrencia));




-- VIEW sentinela_ocorrencias_analytics.pontos_confirmados
CREATE VIEW sentinela_ocorrencias_analytics.pontos_confirmados WITH (security_barrier='true') AS
 SELECT o.id,
    extensions.st_y(o.geometria) AS latitude,
    extensions.st_x(o.geometria) AS longitude,
    (r.codigo_interno)::text AS ra_codigo
   FROM (sentinela.ocorrencias o
     LEFT JOIN sentinela.regioes_administrativas r ON ((r.id = o.ra_id)))
  WHERE (o.ativo AND (o.consolidacao_status = 'consolidada'::text) AND (o.origem = 'manual'::text) AND ((o.fonte)::text = 'SENTINELA_MANUAL'::text) AND (o.localizacao_status = 'validada'::text) AND (o.referencia_espacial_confirmada = 'WGS84; IDE-DF-2026-11-13'::text) AND (NULLIF(btrim(o.regra_transformacao), ''::text) IS NOT NULL) AND (o.geometria IS NOT NULL) AND (extensions.st_srid(o.geometria) = 4326) AND (extensions.st_y(o.geometria) = o.latitude) AND (extensions.st_x(o.geometria) = o.longitude))
UNION ALL
 SELECT pontos_pcdf_publicados.id,
    pontos_pcdf_publicados.latitude,
    pontos_pcdf_publicados.longitude,
    pontos_pcdf_publicados.ra_codigo
   FROM sentinela_ocorrencias_analytics.pontos_pcdf_publicados;




-- VIEW sentinela_ocorrencias_analytics.regioes_administrativas
CREATE VIEW sentinela_ocorrencias_analytics.regioes_administrativas WITH (security_barrier='true') AS
 SELECT id,
    codigo_interno,
    nome
   FROM sentinela.regioes_administrativas;




-- VIEW sentinela_ocorrencias_local.consolidadas
CREATE VIEW sentinela_ocorrencias_local.consolidadas WITH (security_invoker='true') AS
 SELECT o.id,
    NULL::uuid AS origem_id,
    NULLIF(concat_ws(' / '::text, NULLIF(o.ano_registro, ''::text), NULLIF(o.unidade_registro, ''::text), NULLIF(o.numero_registro, ''::text)), ''::text) AS identificacao,
    o.data_fato AS data,
    (o.horario_fato)::text AS hora,
    NULL::text AS natureza,
    NULL::text AS padronizada,
    r.nome AS ra,
    o.local,
    o.consolidacao_status AS situacao,
    NULL::uuid AS lote,
    NULL::text AS arquivo,
    NULL::text AS competencia,
    NULL::uuid AS execucao,
    NULL::bigint AS ordinal
   FROM (sentinela.ocorrencias o
     LEFT JOIN sentinela.regioes_administrativas r ON ((r.id = o.ra_id)));




-- VIEW sentinela_ocorrencias_local.importados
CREATE VIEW sentinela_ocorrencias_local.importados WITH (security_invoker='true') AS
 SELECT s.id,
    s.linha_origem_id AS origem_id,
    NULLIF(concat_ws(' / '::text, NULLIF(o.ano_registro, ''::text), NULLIF(o.unidade_registro, ''::text), NULLIF(o.numero_registro, ''::text)), ''::text) AS identificacao,
    (((s.derivados_efetivos || COALESCE(c.campos, '{}'::jsonb)) ->> 'data'::text))::date AS data,
    ((s.derivados_efetivos || COALESCE(c.campos, '{}'::jsonb)) ->> 'horario'::text) AS hora,
    COALESCE((c.campos ->> 'natureza'::text), NULLIF(o.natureza_original, ''::text)) AS natureza,
    NULLIF(o.natureza_padronizada_pcdf, ''::text) AS padronizada,
    NULLIF(o.ra_original, ''::text) AS ra,
    ((jsonb_build_object('local', COALESCE((s.derivados_efetivos ->> 'local'::text), NULLIF((s.campos_csv ->> 'local'::text), ''::text))) || COALESCE(c.campos, '{}'::jsonb)) ->> 'local'::text) AS local,
        CASE
            WHEN (EXISTS ( SELECT
               FROM sentinela.ocorrencia_naturezas a
              WHERE (a.linha_origem_id = s.linha_origem_id))) THEN 'consolidada'::text
            WHEN (l.id = '84908630-bd04-4a03-923d-616649c8de74'::uuid) THEN 'recebida'::text
            ELSE s.estado
        END AS situacao,
    l.id AS lote,
    l.nome_arquivo AS arquivo,
    to_char((l.competencia)::timestamp with time zone, 'YYYY-MM'::text) AS competencia,
    s.execucao_id AS execucao,
    s.registro_csv AS ordinal
   FROM (((sentinela.linhas_staging s
     JOIN sentinela.linhas_origem o ON (((o.id = s.linha_origem_id) AND (o.extracao_id = s.extracao_id))))
     JOIN sentinela.lotes_importacao l ON ((l.id = s.lote_id)))
     LEFT JOIN LATERAL ( SELECT (e.depois -> 'campos'::text) AS campos
           FROM sentinela.eventos_auditoria e
          WHERE ((e.ator_tipo = 'usuario'::text) AND ((e.depois ->> 'operacao'::text) = 'gestao-importacao'::text) AND ((e.acao)::text = 'corrigir_associacao'::text) AND ((e.depois ->> 'stagingId'::text) = (s.id)::text))
          ORDER BY e.registrado_em DESC, e.id DESC
         LIMIT 1) c ON (true));




-- TABLE sentinela_ocorrencias_manual.cadastros
CREATE TABLE sentinela_ocorrencias_manual.cadastros (
    ocorrencia_id uuid NOT NULL,
    login name NOT NULL,
    ator text NOT NULL,
    chave uuid NOT NULL,
    digest text NOT NULL,
    endereco jsonb NOT NULL,
    dados_crime jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT cadastros_ator_check CHECK ((ator ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT cadastros_dados_crime_check CHECK ((jsonb_typeof(dados_crime) = 'object'::text)),
    CONSTRAINT cadastros_digest_check CHECK ((digest ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT cadastros_endereco_check CHECK ((jsonb_typeof(endereco) = 'object'::text))
);

ALTER TABLE ONLY sentinela_ocorrencias_manual.cadastros FORCE ROW LEVEL SECURITY;




-- TABLE sentinela_ocorrencias_manual.definicoes_originais
CREATE TABLE sentinela_ocorrencias_manual.definicoes_originais (
    funcao regprocedure NOT NULL,
    definicao text NOT NULL
);

ALTER TABLE ONLY sentinela_ocorrencias_manual.definicoes_originais FORCE ROW LEVEL SECURITY;




-- TABLE sentinela_ocorrencias_manual.liberacao
CREATE TABLE sentinela_ocorrencias_manual.liberacao (
    singleton boolean DEFAULT true NOT NULL,
    porta integer NOT NULL,
    cluster_uuid uuid NOT NULL,
    system_id text NOT NULL,
    supabase_url text NOT NULL,
    aberta boolean NOT NULL,
    CONSTRAINT liberacao_porta_check CHECK ((porta = 5432)),
    CONSTRAINT liberacao_singleton_check CHECK (singleton),
    CONSTRAINT liberacao_supabase_url_check CHECK ((supabase_url ~ '^https://[a-z0-9]{20}\.supabase\.co$'::text))
);

ALTER TABLE ONLY sentinela_ocorrencias_manual.liberacao FORCE ROW LEVEL SECURITY;




-- TABLE sentinela_ocorrencias_manual.naturezas_retiradas
CREATE TABLE sentinela_ocorrencias_manual.naturezas_retiradas (
    associacao_id uuid NOT NULL,
    auditoria_id uuid NOT NULL
);

ALTER TABLE ONLY sentinela_ocorrencias_manual.naturezas_retiradas FORCE ROW LEVEL SECURITY;




-- TABLE sentinela_ocorrencias_manual.naturezas_uso_local
CREATE TABLE sentinela_ocorrencias_manual.naturezas_uso_local (
    natureza_id uuid NOT NULL,
    codigo_interno text NOT NULL,
    situacao text NOT NULL,
    referencia jsonb NOT NULL,
    CONSTRAINT naturezas_uso_local_codigo_interno_check CHECK ((codigo_interno ~ '^PCDF-N-[0-9]{2}$'::text)),
    CONSTRAINT naturezas_uso_local_referencia_check CHECK (((jsonb_typeof(referencia) = 'object'::text) AND (referencia ? 'codigoOficial'::text) AND ((referencia -> 'codigoOficial'::text) = 'null'::jsonb) AND ((referencia ->> 'homologacaoInstitucional'::text) = 'ausente'::text) AND ((referencia ->> 'inventarioSha256'::text) ~ '^[a-f0-9]{64}$'::text) AND ((referencia ->> 'catalogoSha256'::text) ~ '^[a-f0-9]{64}$'::text))),
    CONSTRAINT naturezas_uso_local_situacao_check CHECK ((situacao = 'uso-local-provisorio'::text))
);

ALTER TABLE ONLY sentinela_ocorrencias_manual.naturezas_uso_local FORCE ROW LEVEL SECURITY;




-- TABLE sentinela_pcdf_historico.arquivos
CREATE TABLE sentinela_pcdf_historico.arquivos (
    competencia date NOT NULL,
    sha256 text NOT NULL,
    bytes integer NOT NULL,
    linhas integer NOT NULL,
    candidatas integer NOT NULL,
    cobertura_ate date NOT NULL,
    completa boolean NOT NULL,
    CONSTRAINT arquivos_bytes_check CHECK (((bytes >= 1) AND (bytes <= 16777216))),
    CONSTRAINT arquivos_check CHECK (((candidatas >= 1) AND (candidatas <= linhas))),
    CONSTRAINT arquivos_linhas_check CHECK (((linhas >= 1) AND (linhas <= 10000))),
    CONSTRAINT arquivos_sha256_check CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text))
);

ALTER TABLE ONLY sentinela_pcdf_historico.arquivos FORCE ROW LEVEL SECURITY;




-- TABLE sentinela_pessoas.contatos
CREATE TABLE sentinela_pessoas.contatos (
    usuario uuid NOT NULL,
    email text,
    orgao text,
    CONSTRAINT contatos_email_check CHECK (((email IS NULL) OR ((length(email) <= 254) AND (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'::text)))),
    CONSTRAINT contatos_orgao_check CHECK (((orgao IS NULL) OR ((orgao = btrim(orgao)) AND ((length(orgao) >= 1) AND (length(orgao) <= 160)))))
);

ALTER TABLE ONLY sentinela_pessoas.contatos FORCE ROW LEVEL SECURITY;




-- TABLE sentinela_pessoas.exclusoes
CREATE TABLE sentinela_pessoas.exclusoes (
    usuario uuid NOT NULL,
    email_confirmacao text,
    identidade_pendente uuid,
    concluida_em timestamp with time zone,
    CONSTRAINT exclusoes_check CHECK ((email_confirmacao IS NULL) = (concluida_em IS NOT NULL)
      AND (identidade_pendente IS NULL) = (concluida_em IS NOT NULL))
);

ALTER TABLE ONLY sentinela_pessoas.exclusoes FORCE ROW LEVEL SECURITY;




-- CONSTRAINT sentinela_exclusao.comprovantes comprovantes_lote_key
ALTER TABLE ONLY sentinela_exclusao.comprovantes
    ADD CONSTRAINT comprovantes_lote_key UNIQUE (lote);

-- CONSTRAINT sentinela_exclusao.comprovantes comprovantes_pkey
ALTER TABLE ONLY sentinela_exclusao.comprovantes
    ADD CONSTRAINT comprovantes_pkey PRIMARY KEY (id);

-- CONSTRAINT sentinela_general_accounts.individuals individuals_pkey
ALTER TABLE ONLY sentinela_general_accounts.individuals
    ADD CONSTRAINT individuals_pkey PRIMARY KEY (login, subject);

-- CONSTRAINT sentinela_general_accounts.individuals individuals_subject_key
ALTER TABLE ONLY sentinela_general_accounts.individuals
    ADD CONSTRAINT individuals_subject_key UNIQUE (subject);

-- CONSTRAINT sentinela_gestao_autorizacao.atores atores_conta_key
ALTER TABLE ONLY sentinela_gestao_autorizacao.atores
    ADD CONSTRAINT atores_conta_key UNIQUE (conta);

-- CONSTRAINT sentinela_gestao_autorizacao.atores atores_identidade_key
ALTER TABLE ONLY sentinela_gestao_autorizacao.atores
    ADD CONSTRAINT atores_identidade_key UNIQUE (identidade);

-- CONSTRAINT sentinela_gestao_autorizacao.atores atores_pkey
ALTER TABLE ONLY sentinela_gestao_autorizacao.atores
    ADD CONSTRAINT atores_pkey PRIMARY KEY (usuario);

-- CONSTRAINT sentinela_gestao_autorizacao.exclusoes exclusoes_pkey
ALTER TABLE ONLY sentinela_gestao_autorizacao.exclusoes
    ADD CONSTRAINT exclusoes_pkey PRIMARY KEY (lote);

-- CONSTRAINT sentinela_gestao_autorizacao.release release_pkey
ALTER TABLE ONLY sentinela_gestao_autorizacao.release
    ADD CONSTRAINT release_pkey PRIMARY KEY (singleton);

-- CONSTRAINT sentinela_import_local.local_revision local_revision_pkey
ALTER TABLE ONLY sentinela_import_local.local_revision
    ADD CONSTRAINT local_revision_pkey PRIMARY KEY (version);

-- CONSTRAINT sentinela_import_local.requests requests_pkey
ALTER TABLE ONLY sentinela_import_local.requests
    ADD CONSTRAINT requests_pkey PRIMARY KEY (request);

-- CONSTRAINT sentinela_ocorrencias_analytics.pcdf_pontos pcdf_pontos_pkey
ALTER TABLE ONLY sentinela_ocorrencias_analytics.pcdf_pontos
    ADD CONSTRAINT pcdf_pontos_pkey PRIMARY KEY (ocorrencia_id);

-- CONSTRAINT sentinela_ocorrencias_manual.cadastros cadastros_login_ator_chave_key
ALTER TABLE ONLY sentinela_ocorrencias_manual.cadastros
    ADD CONSTRAINT cadastros_login_ator_chave_key UNIQUE (login, ator, chave);

-- CONSTRAINT sentinela_ocorrencias_manual.cadastros cadastros_pkey
ALTER TABLE ONLY sentinela_ocorrencias_manual.cadastros
    ADD CONSTRAINT cadastros_pkey PRIMARY KEY (ocorrencia_id);

-- CONSTRAINT sentinela_ocorrencias_manual.definicoes_originais definicoes_originais_pkey
ALTER TABLE ONLY sentinela_ocorrencias_manual.definicoes_originais
    ADD CONSTRAINT definicoes_originais_pkey PRIMARY KEY (funcao);

-- CONSTRAINT sentinela_ocorrencias_manual.liberacao liberacao_pkey
ALTER TABLE ONLY sentinela_ocorrencias_manual.liberacao
    ADD CONSTRAINT liberacao_pkey PRIMARY KEY (singleton);

-- CONSTRAINT sentinela_ocorrencias_manual.naturezas_retiradas naturezas_retiradas_pkey
ALTER TABLE ONLY sentinela_ocorrencias_manual.naturezas_retiradas
    ADD CONSTRAINT naturezas_retiradas_pkey PRIMARY KEY (associacao_id);

-- CONSTRAINT sentinela_ocorrencias_manual.naturezas_uso_local naturezas_uso_local_codigo_interno_key
ALTER TABLE ONLY sentinela_ocorrencias_manual.naturezas_uso_local
    ADD CONSTRAINT naturezas_uso_local_codigo_interno_key UNIQUE (codigo_interno);

-- CONSTRAINT sentinela_ocorrencias_manual.naturezas_uso_local naturezas_uso_local_pkey
ALTER TABLE ONLY sentinela_ocorrencias_manual.naturezas_uso_local
    ADD CONSTRAINT naturezas_uso_local_pkey PRIMARY KEY (natureza_id);

-- CONSTRAINT sentinela_pcdf_historico.arquivos arquivos_pkey
ALTER TABLE ONLY sentinela_pcdf_historico.arquivos
    ADD CONSTRAINT arquivos_pkey PRIMARY KEY (competencia);

-- CONSTRAINT sentinela_pcdf_historico.arquivos arquivos_sha256_key
ALTER TABLE ONLY sentinela_pcdf_historico.arquivos
    ADD CONSTRAINT arquivos_sha256_key UNIQUE (sha256);

-- CONSTRAINT sentinela_pessoas.contatos contatos_pkey
ALTER TABLE ONLY sentinela_pessoas.contatos
    ADD CONSTRAINT contatos_pkey PRIMARY KEY (usuario);

-- CONSTRAINT sentinela_pessoas.exclusoes exclusoes_pkey
ALTER TABLE ONLY sentinela_pessoas.exclusoes
    ADD CONSTRAINT exclusoes_pkey PRIMARY KEY (usuario);

-- INDEX sentinela.gestao_correcao_staging_idx
CREATE INDEX gestao_correcao_staging_idx ON sentinela.eventos_auditoria USING btree (((depois ->> 'stagingId'::text)), registrado_em DESC, id DESC) WHERE ((ator_tipo = 'usuario'::text) AND ((depois ->> 'operacao'::text) = 'gestao-importacao'::text) AND ((acao)::text = 'corrigir_associacao'::text));

-- INDEX sentinela.manual_natureza_codigo_normalizado_unico
CREATE UNIQUE INDEX manual_natureza_codigo_normalizado_unico ON sentinela.naturezas_criminais USING btree (sentinela_ocorrencias_manual.normalizar_catalogo(codigo_manual) COLLATE "C") WHERE (((fonte)::text = 'SENTINELA_MANUAL'::text) AND (referencia_catalogo_manual IS NOT NULL));

-- INDEX sentinela.manual_natureza_descricao_unica
CREATE UNIQUE INDEX manual_natureza_descricao_unica ON sentinela.naturezas_criminais USING btree (sentinela_ocorrencias_manual.normalizar_catalogo(descricao_original) COLLATE "C") WHERE (((fonte)::text = 'SENTINELA_MANUAL'::text) AND (referencia_catalogo_manual IS NOT NULL));

-- INDEX sentinela.manual_ra_nome_unico
CREATE UNIQUE INDEX manual_ra_nome_unico ON sentinela.regioes_administrativas USING btree (sentinela_ocorrencias_manual.normalizar_catalogo((nome)::text) COLLATE "C") WHERE ((versao_catalogo)::text = 'SENTINELA_RA_PUBLICO_2026_11_13_V1'::text);

-- INDEX sentinela.manual_ra_numero_unico
CREATE UNIQUE INDEX manual_ra_numero_unico ON sentinela.regioes_administrativas USING btree (((referencia_cartografica ->> 'administrativeNumber'::text))) WHERE ((versao_catalogo)::text = 'SENTINELA_RA_PUBLICO_2026_11_13_V1'::text);

-- INDEX sentinela.natureza_manual_codigo_unico
CREATE UNIQUE INDEX natureza_manual_codigo_unico ON sentinela.naturezas_criminais USING btree (lower(codigo_manual)) WHERE (codigo_manual IS NOT NULL);

-- INDEX sentinela.pcdf_local_auditoria_acao
CREATE UNIQUE INDEX pcdf_local_auditoria_acao ON sentinela.eventos_auditoria USING btree (request_id, acao) WHERE (servico = 'pcdf-local'::text);

-- INDEX sentinela.pcdf_local_auditoria_resultado
CREATE UNIQUE INDEX pcdf_local_auditoria_resultado ON sentinela.eventos_auditoria USING btree (request_id) WHERE ((servico = 'pcdf-local'::text) AND ((acao)::text = ANY (ARRAY['staging_pcdf'::text, 'reenvio_pcdf'::text, 'falha_pcdf'::text])));

-- INDEX sentinela.pcdf_local_csv_recebido
CREATE UNIQUE INDEX pcdf_local_csv_recebido ON sentinela.lotes_importacao USING btree (sha256_arquivo) WHERE ((versao_contrato)::text = '1.0'::text);

-- TRIGGER sentinela_ocorrencias_manual.naturezas_retiradas retirada_exige_auditoria
CREATE CONSTRAINT TRIGGER retirada_exige_auditoria AFTER INSERT ON sentinela_ocorrencias_manual.naturezas_retiradas DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sentinela_ocorrencias_manual.validar_retirada();

-- TRIGGER sentinela_ocorrencias_manual.cadastros validar_dados_manuais
CREATE TRIGGER validar_dados_manuais BEFORE INSERT OR UPDATE OF endereco, dados_crime ON sentinela_ocorrencias_manual.cadastros FOR EACH ROW EXECUTE FUNCTION sentinela_ocorrencias_manual.validar_dados();

-- FK CONSTRAINT sentinela_general_accounts.individuals individuals_subject_fkey
ALTER TABLE ONLY sentinela_general_accounts.individuals
    ADD CONSTRAINT individuals_subject_fkey FOREIGN KEY (subject) REFERENCES sentinela.usuarios(id);

-- FK CONSTRAINT sentinela_import_local.requests requests_subject_fkey
ALTER TABLE ONLY sentinela_import_local.requests
    ADD CONSTRAINT requests_subject_fkey FOREIGN KEY (subject) REFERENCES sentinela_general_accounts.individuals(subject);

-- FK CONSTRAINT sentinela_ocorrencias_manual.cadastros cadastros_ocorrencia_id_fkey
ALTER TABLE ONLY sentinela_ocorrencias_manual.cadastros
    ADD CONSTRAINT cadastros_ocorrencia_id_fkey FOREIGN KEY (ocorrencia_id) REFERENCES sentinela.ocorrencias(id);

-- FK CONSTRAINT sentinela_ocorrencias_manual.naturezas_retiradas naturezas_retiradas_associacao_id_fkey
ALTER TABLE ONLY sentinela_ocorrencias_manual.naturezas_retiradas
    ADD CONSTRAINT naturezas_retiradas_associacao_id_fkey FOREIGN KEY (associacao_id) REFERENCES sentinela.ocorrencia_naturezas(id);

-- FK CONSTRAINT sentinela_ocorrencias_manual.naturezas_uso_local naturezas_uso_local_natureza_id_fkey
ALTER TABLE ONLY sentinela_ocorrencias_manual.naturezas_uso_local
    ADD CONSTRAINT naturezas_uso_local_natureza_id_fkey FOREIGN KEY (natureza_id) REFERENCES sentinela.naturezas_criminais(id);

-- FK CONSTRAINT sentinela_pessoas.contatos contatos_usuario_fkey
ALTER TABLE ONLY sentinela_pessoas.contatos
    ADD CONSTRAINT contatos_usuario_fkey FOREIGN KEY (usuario) REFERENCES sentinela.usuarios(id);

-- FK CONSTRAINT sentinela_pessoas.exclusoes exclusoes_usuario_fkey
ALTER TABLE ONLY sentinela_pessoas.exclusoes
    ADD CONSTRAINT exclusoes_usuario_fkey FOREIGN KEY (usuario) REFERENCES sentinela.usuarios(id);

-- POLICY sentinela.eventos_auditoria exclusao_leitura
CREATE POLICY exclusao_leitura ON sentinela.eventos_auditoria FOR SELECT TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela.execucoes_importacao exclusao_leitura
CREATE POLICY exclusao_leitura ON sentinela.execucoes_importacao FOR SELECT TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela.extracoes_origem exclusao_leitura
CREATE POLICY exclusao_leitura ON sentinela.extracoes_origem FOR SELECT TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela.historico_correcoes exclusao_leitura
CREATE POLICY exclusao_leitura ON sentinela.historico_correcoes FOR SELECT TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela.linhas_origem exclusao_leitura
CREATE POLICY exclusao_leitura ON sentinela.linhas_origem FOR SELECT TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela.linhas_staging exclusao_leitura
CREATE POLICY exclusao_leitura ON sentinela.linhas_staging FOR SELECT TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela.lotes_importacao exclusao_leitura
CREATE POLICY exclusao_leitura ON sentinela.lotes_importacao FOR SELECT TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela.pendencias_revisao exclusao_leitura
CREATE POLICY exclusao_leitura ON sentinela.pendencias_revisao FOR SELECT TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela.eventos_auditoria exclusao_remocao
CREATE POLICY exclusao_remocao ON sentinela.eventos_auditoria FOR DELETE TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela.execucoes_importacao exclusao_remocao
CREATE POLICY exclusao_remocao ON sentinela.execucoes_importacao FOR DELETE TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela.extracoes_origem exclusao_remocao
CREATE POLICY exclusao_remocao ON sentinela.extracoes_origem FOR DELETE TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela.historico_correcoes exclusao_remocao
CREATE POLICY exclusao_remocao ON sentinela.historico_correcoes FOR DELETE TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela.linhas_origem exclusao_remocao
CREATE POLICY exclusao_remocao ON sentinela.linhas_origem FOR DELETE TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela.linhas_staging exclusao_remocao
CREATE POLICY exclusao_remocao ON sentinela.linhas_staging FOR DELETE TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela.lotes_importacao exclusao_remocao
CREATE POLICY exclusao_remocao ON sentinela.lotes_importacao FOR DELETE TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela.pendencias_revisao exclusao_remocao
CREATE POLICY exclusao_remocao ON sentinela.pendencias_revisao FOR DELETE TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela.ocorrencia_naturezas exclusao_vinculos
CREATE POLICY exclusao_vinculos ON sentinela.ocorrencia_naturezas FOR SELECT TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela.eventos_auditoria gestao_audit_read
CREATE POLICY gestao_audit_read ON sentinela.eventos_auditoria FOR SELECT TO sentinela_gestao_owner USING (((servico = ANY (ARRAY['pcdf-local'::text, 'importacao-geral-local'::text])) OR ((ator_tipo = 'usuario'::text) AND ((acao)::text = 'corrigir_associacao'::text) AND ((depois ->> 'operacao'::text) = 'gestao-importacao'::text))));

-- POLICY sentinela.eventos_auditoria gestao_audit_write
CREATE POLICY gestao_audit_write ON sentinela.eventos_auditoria FOR INSERT TO sentinela_gestao_owner WITH CHECK (((ator_tipo = 'usuario'::text) AND ((acao)::text = 'corrigir_associacao'::text) AND ((depois ->> 'operacao'::text) = 'gestao-importacao'::text) AND sentinela_gestao_autorizacao.capacidade(usuario_id, (depois ->> 'conta'::text))));

-- POLICY sentinela.usuarios gestao_autoridade_usuarios
CREATE POLICY gestao_autoridade_usuarios ON sentinela.usuarios FOR SELECT TO sentinela_gestao_autoridade USING ((ativo AND (perfil = 'Administrador'::text) AND (auth_user_id IS NOT NULL)));

-- POLICY sentinela.execucoes_importacao gestao_execucao
CREATE POLICY gestao_execucao ON sentinela.execucoes_importacao FOR SELECT TO sentinela_gestao_owner USING ((EXISTS ( SELECT
   FROM sentinela.lotes_importacao l
  WHERE (l.id = execucoes_importacao.lote_id))));

-- POLICY sentinela.extracoes_origem gestao_extracao
CREATE POLICY gestao_extracao ON sentinela.extracoes_origem FOR SELECT TO sentinela_gestao_owner USING (((fonte)::text = ANY (ARRAY['PCDF'::text, 'IMPORTACAO-GERAL-LOCAL'::text])));

-- POLICY sentinela.lotes_importacao gestao_lote
CREATE POLICY gestao_lote ON sentinela.lotes_importacao FOR SELECT TO sentinela_gestao_owner USING ((EXISTS ( SELECT
   FROM sentinela.extracoes_origem x
  WHERE ((x.id = lotes_importacao.extracao_id) AND (((((x.fonte)::text = 'PCDF'::text) AND ((lotes_importacao.versao_contrato)::text = '1.0'::text)) OR (((x.fonte)::text = 'PCDF'::text) AND ((lotes_importacao.versao_contrato)::text = '2.0'::text))) OR (((x.fonte)::text = 'IMPORTACAO-GERAL-LOCAL'::text) AND ((lotes_importacao.versao_contrato)::text = 'geral-v1'::text)))))));

-- POLICY sentinela.ocorrencia_naturezas gestao_naturezas
CREATE POLICY gestao_naturezas ON sentinela.ocorrencia_naturezas FOR SELECT TO sentinela_gestao_owner USING (true);

-- POLICY sentinela.ocorrencias gestao_ocorrencia
CREATE POLICY gestao_ocorrencia ON sentinela.ocorrencias FOR SELECT TO sentinela_gestao_owner USING (true);

-- POLICY sentinela.linhas_origem gestao_origem
CREATE POLICY gestao_origem ON sentinela.linhas_origem FOR SELECT TO sentinela_gestao_owner USING ((EXISTS ( SELECT
   FROM sentinela.extracoes_origem x
  WHERE (x.id = linhas_origem.extracao_id))));

-- POLICY sentinela.pendencias_revisao gestao_pendencia
CREATE POLICY gestao_pendencia ON sentinela.pendencias_revisao FOR SELECT TO sentinela_gestao_owner USING ((EXISTS ( SELECT
   FROM sentinela.linhas_origem o
  WHERE (o.id = pendencias_revisao.linha_origem_id))));

-- POLICY sentinela.eventos_auditoria gestao_projecao_staging
CREATE POLICY gestao_projecao_staging ON sentinela.eventos_auditoria FOR SELECT TO sentinela_ocorrencias_reader USING (((SESSION_USER = ANY (ARRAY['sentinela_local_admin'::name, 'sentinela_local_operator'::name])) AND (ator_tipo = 'usuario'::text) AND ((depois ->> 'operacao'::text) = 'gestao-importacao'::text) AND ((acao)::text = 'corrigir_associacao'::text)));

-- POLICY sentinela.regioes_administrativas gestao_ra
CREATE POLICY gestao_ra ON sentinela.regioes_administrativas FOR SELECT TO sentinela_gestao_owner USING (true);

-- POLICY sentinela.linhas_staging gestao_staging
CREATE POLICY gestao_staging ON sentinela.linhas_staging FOR SELECT TO sentinela_gestao_owner USING ((EXISTS ( SELECT
   FROM sentinela.lotes_importacao l
  WHERE (l.id = linhas_staging.lote_id))));

-- POLICY sentinela.usuarios gestao_usuarios
CREATE POLICY gestao_usuarios ON sentinela.usuarios FOR SELECT TO sentinela_gestao_owner USING (true);

-- POLICY sentinela.eventos_auditoria historico_audit_insert
CREATE POLICY historico_audit_insert ON sentinela.eventos_auditoria FOR INSERT TO sentinela_pcdf_historico_owner WITH CHECK (((SESSION_USER = 'sentinela_local_admin'::name) AND ((acao)::text = 'pcdf.consolidacao_historica'::text) AND (servico = 'sentinela-pcdf'::text) AND (ator_tipo = 'servico'::text) AND (execucao_id IS NOT NULL)));

-- POLICY sentinela.eventos_auditoria historico_audit_read
CREATE POLICY historico_audit_read ON sentinela.eventos_auditoria FOR SELECT TO sentinela_pcdf_historico_owner USING (((acao)::text = ANY (ARRAY['pcdf.consolidacao_historica'::text, 'pcdf.revisao_independente'::text])));

-- POLICY sentinela.execucoes_importacao historico_execucao
CREATE POLICY historico_execucao ON sentinela.execucoes_importacao FOR SELECT TO sentinela_pcdf_historico_owner USING ((EXISTS ( SELECT
   FROM sentinela.lotes_importacao l
  WHERE (l.id = execucoes_importacao.lote_id))));

-- POLICY sentinela.extracoes_origem historico_extracao
CREATE POLICY historico_extracao ON sentinela.extracoes_origem FOR SELECT TO sentinela_pcdf_historico_owner USING (((fonte)::text = 'PCDF'::text));

-- POLICY sentinela.lotes_importacao historico_lote
CREATE POLICY historico_lote ON sentinela.lotes_importacao FOR SELECT TO sentinela_pcdf_historico_owner USING ((EXISTS ( SELECT
   FROM sentinela.extracoes_origem x
  WHERE (x.id = lotes_importacao.extracao_id))));

-- POLICY sentinela.naturezas_criminais historico_natureza
CREATE POLICY historico_natureza ON sentinela.naturezas_criminais FOR SELECT TO sentinela_pcdf_historico_owner USING (((fonte)::text = 'PCDF'::text));

-- POLICY sentinela.ocorrencias historico_ocorrencia_insert
CREATE POLICY historico_ocorrencia_insert ON sentinela.ocorrencias FOR INSERT TO sentinela_pcdf_historico_owner WITH CHECK (((SESSION_USER = 'sentinela_local_admin'::name) AND ((fonte)::text = 'PCDF'::text) AND (origem = 'importacao'::text) AND ((versao_identidade)::text = 'pcdf-tupla-conferida-v1'::text) AND (consolidacao_status = 'consolidada'::text) AND (ra_id IS NULL) AND (localizacao_status <> 'validada'::text) AND (latitude IS NULL) AND (longitude IS NULL) AND (geometria IS NULL)));

-- POLICY sentinela.ocorrencias historico_ocorrencia_read
CREATE POLICY historico_ocorrencia_read ON sentinela.ocorrencias FOR SELECT TO sentinela_pcdf_historico_owner USING (((fonte)::text = 'PCDF'::text));

-- POLICY sentinela.linhas_origem historico_origem
CREATE POLICY historico_origem ON sentinela.linhas_origem FOR SELECT TO sentinela_pcdf_historico_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND (EXISTS ( SELECT
   FROM sentinela.extracoes_origem x
  WHERE (x.id = linhas_origem.extracao_id)))));

-- POLICY sentinela.pendencias_revisao historico_pendencia_insert
CREATE POLICY historico_pendencia_insert ON sentinela.pendencias_revisao FOR INSERT TO sentinela_pcdf_historico_owner WITH CHECK (((SESSION_USER = 'sentinela_local_admin'::name) AND ((versao_regra)::text = 'pcdf-consolidacao-historica-v1'::text) AND (ocorrencia_id IS NULL) AND (status = 'aberta'::text) AND (tipo = 'identificacao'::text) AND (EXISTS ( SELECT
   FROM sentinela.linhas_origem o
  WHERE (o.id = pendencias_revisao.linha_origem_id)))));

-- POLICY sentinela.pendencias_revisao historico_pendencia_leitor
CREATE POLICY historico_pendencia_leitor ON sentinela.pendencias_revisao FOR SELECT TO sentinela_ocorrencias_reader USING ((((versao_regra)::text = 'pcdf-consolidacao-historica-v1'::text) AND (EXISTS ( SELECT
   FROM sentinela.linhas_origem o
  WHERE (o.id = pendencias_revisao.linha_origem_id)))));

-- POLICY sentinela.linhas_staging historico_staging
CREATE POLICY historico_staging ON sentinela.linhas_staging FOR SELECT TO sentinela_pcdf_historico_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND ((campos_csv ->> 'fonte'::text) = 'PCDF'::text)));

-- POLICY sentinela.ocorrencia_naturezas historico_vinculo_insert
CREATE POLICY historico_vinculo_insert ON sentinela.ocorrencia_naturezas FOR INSERT TO sentinela_pcdf_historico_owner WITH CHECK (((SESSION_USER = 'sentinela_local_admin'::name) AND (origem = 'importacao'::text) AND (linha_origem_id IS NOT NULL) AND (mapeamento_id IS NULL) AND (EXISTS ( SELECT
   FROM sentinela.ocorrencias o
  WHERE (o.id = ocorrencia_naturezas.ocorrencia_id)))));

-- POLICY sentinela.ocorrencia_naturezas historico_vinculo_read
CREATE POLICY historico_vinculo_read ON sentinela.ocorrencia_naturezas FOR SELECT TO sentinela_pcdf_historico_owner USING ((EXISTS ( SELECT
   FROM sentinela.ocorrencias o
  WHERE (o.id = ocorrencia_naturezas.ocorrencia_id))));

-- POLICY sentinela.eventos_auditoria import_audit
CREATE POLICY import_audit ON sentinela.eventos_auditoria FOR INSERT TO sentinela_general_importer WITH CHECK (((ator_tipo = 'servico'::text) AND (servico = 'importacao-geral-local'::text) AND (ocorrencia_id IS NULL) AND (linha_origem_id IS NULL) AND (correcao_id IS NULL) AND ((execucao_id IS NULL) OR (EXISTS ( SELECT
   FROM sentinela.execucoes_importacao e
  WHERE (e.id = eventos_auditoria.execucao_id)))) AND ((pendencia_id IS NULL) OR (EXISTS ( SELECT
   FROM sentinela.pendencias_revisao p
  WHERE (p.id = eventos_auditoria.pendencia_id))))));

-- POLICY sentinela.lotes_importacao import_batches
CREATE POLICY import_batches ON sentinela.lotes_importacao TO sentinela_general_importer USING ((EXISTS ( SELECT
   FROM sentinela.extracoes_origem x
  WHERE (x.id = lotes_importacao.extracao_id)))) WITH CHECK (((solicitado_por = sentinela_ambiente.ator_importacao()) AND (EXISTS ( SELECT
   FROM sentinela.extracoes_origem x
  WHERE (x.id = lotes_importacao.extracao_id)))));

-- POLICY sentinela.extracoes_origem import_extraction
CREATE POLICY import_extraction ON sentinela.extracoes_origem TO sentinela_general_importer USING (((fonte)::text = 'IMPORTACAO-GERAL-LOCAL'::text));

-- POLICY sentinela.pendencias_revisao import_issues
CREATE POLICY import_issues ON sentinela.pendencias_revisao TO sentinela_general_importer USING ((EXISTS ( SELECT
   FROM sentinela.linhas_origem o
  WHERE (o.id = pendencias_revisao.linha_origem_id)))) WITH CHECK (((status = 'aberta'::text) AND (responsavel_id IS NULL) AND (ocorrencia_id IS NULL) AND (associacao_id IS NULL) AND (EXISTS ( SELECT
   FROM sentinela.linhas_origem o
  WHERE (o.id = pendencias_revisao.linha_origem_id)))));

-- POLICY sentinela.linhas_origem import_origin
CREATE POLICY import_origin ON sentinela.linhas_origem TO sentinela_general_importer USING ((EXISTS ( SELECT
   FROM sentinela.extracoes_origem x
  WHERE (x.id = linhas_origem.extracao_id))));

-- POLICY sentinela.execucoes_importacao import_runs
CREATE POLICY import_runs ON sentinela.execucoes_importacao TO sentinela_general_importer USING ((EXISTS ( SELECT
   FROM sentinela.lotes_importacao l
  WHERE (l.id = execucoes_importacao.lote_id)))) WITH CHECK (((tentativa = 1) AND (solicitado_por = sentinela_ambiente.ator_importacao()) AND (EXISTS ( SELECT
   FROM sentinela.lotes_importacao l
  WHERE (l.id = execucoes_importacao.lote_id)))));

-- POLICY sentinela.linhas_staging import_staging
CREATE POLICY import_staging ON sentinela.linhas_staging TO sentinela_general_importer USING ((EXISTS ( SELECT
   FROM sentinela.execucoes_importacao e
  WHERE (e.id = linhas_staging.execucao_id)))) WITH CHECK (((estado = 'bloqueada'::text) AND (ocorrencia_id IS NULL) AND (associacao_id IS NULL) AND (EXISTS ( SELECT
   FROM sentinela.execucoes_importacao e
  WHERE (e.id = linhas_staging.execucao_id)))));

-- POLICY sentinela.eventos_auditoria manual_audit_insert
CREATE POLICY manual_audit_insert ON sentinela.eventos_auditoria FOR INSERT TO sentinela_manual_writer WITH CHECK (((ator_tipo = 'servico'::text) AND (servico = 'sentinela-manual-local'::text) AND (usuario_id IS NULL) AND ((acao)::text = 'ocorrencia.manual.criada'::text) AND ((depois ->> 'login'::text) = (SESSION_USER)::text) AND ((depois -> 'localizacaoConfirmada'::text) = 'true'::jsonb) AND (EXISTS ( SELECT
   FROM sentinela.ocorrencias o
  WHERE (o.id = eventos_auditoria.ocorrencia_id)))));

-- POLICY sentinela.eventos_auditoria manual_audit_read
CREATE POLICY manual_audit_read ON sentinela.eventos_auditoria FOR SELECT TO sentinela_manual_writer USING (((ator_tipo = 'usuario'::text) AND ((depois ->> 'operacao'::text) = 'cadastro-manual'::text)));

-- POLICY sentinela.eventos_auditoria manual_audit_usuario
CREATE POLICY manual_audit_usuario ON sentinela.eventos_auditoria FOR INSERT TO sentinela_manual_writer WITH CHECK (((ator_tipo = 'usuario'::text) AND (servico IS NULL) AND (usuario_id IS NOT NULL) AND ((depois ->> 'operacao'::text) = 'cadastro-manual'::text) AND ((acao)::text = ANY (ARRAY['ocorrencia.manual.criada'::text, 'ocorrencia.manual.editada'::text, 'ocorrencia.manual.inativada'::text, 'ocorrencia.manual.consolidada'::text])) AND ((depois ->> 'login'::text) = (SESSION_USER)::text) AND (sentinela_ocorrencias_manual.autor(usuario_id, (depois ->> 'conta'::text)) IS NOT NULL) AND (EXISTS ( SELECT
   FROM sentinela.ocorrencias o
  WHERE (o.id = eventos_auditoria.ocorrencia_id)))));

-- POLICY sentinela.usuarios manual_autores
CREATE POLICY manual_autores ON sentinela.usuarios FOR SELECT TO sentinela_manual_writer USING ((ativo AND (auth_user_id IS NOT NULL) AND (perfil = ANY (ARRAY['Administrador'::text, 'Operador'::text]))));

-- POLICY sentinela.ocorrencia_naturezas manual_link_insert
CREATE POLICY manual_link_insert ON sentinela.ocorrencia_naturezas FOR INSERT TO sentinela_manual_writer WITH CHECK (((origem = 'manual'::text) AND (linha_origem_id IS NULL) AND (classificacao_status = 'pendente'::text) AND (mapeamento_id IS NULL) AND (EXISTS ( SELECT
   FROM sentinela.ocorrencias o
  WHERE (o.id = ocorrencia_naturezas.ocorrencia_id))) AND (EXISTS ( SELECT
   FROM sentinela.naturezas_criminais n
  WHERE (n.id = ocorrencia_naturezas.natureza_id)))));

-- POLICY sentinela.ocorrencia_naturezas manual_links_writer_read
CREATE POLICY manual_links_writer_read ON sentinela.ocorrencia_naturezas FOR SELECT TO sentinela_manual_writer USING ((EXISTS ( SELECT
   FROM sentinela.ocorrencias o
  WHERE (o.id = ocorrencia_naturezas.ocorrencia_id))));

-- POLICY sentinela.naturezas_criminais manual_nature
CREATE POLICY manual_nature ON sentinela.naturezas_criminais FOR SELECT TO sentinela_manual_writer USING ((((fonte)::text = 'SENTINELA_MANUAL'::text) AND (codigo_manual IS NOT NULL) AND (referencia_catalogo_manual IS NOT NULL)));

-- POLICY sentinela.naturezas_criminais manual_nature_local
CREATE POLICY manual_nature_local ON sentinela.naturezas_criminais FOR SELECT TO sentinela_manual_writer USING ((EXISTS ( SELECT
   FROM sentinela_ocorrencias_manual.naturezas_uso_local u
  WHERE (u.natureza_id = naturezas_criminais.id))));

-- POLICY sentinela.ocorrencias manual_occurrence_insert
CREATE POLICY manual_occurrence_insert ON sentinela.ocorrencias FOR INSERT TO sentinela_manual_writer WITH CHECK (((origem = 'manual'::text) AND ((fonte)::text = 'SENTINELA_MANUAL'::text) AND (identidade_status = 'manual'::text) AND ativo AND (consolidacao_status = 'em_revisao'::text) AND (localizacao_status = 'validada'::text) AND (SESSION_USER = ANY (ARRAY['sentinela_local_admin'::name, 'sentinela_local_operator'::name]))));

-- POLICY sentinela.ocorrencias manual_occurrence_update
CREATE POLICY manual_occurrence_update ON sentinela.ocorrencias FOR UPDATE TO sentinela_manual_writer USING (((origem = 'manual'::text) AND ((fonte)::text = 'SENTINELA_MANUAL'::text) AND (identidade_status = 'manual'::text) AND (SESSION_USER = ANY (ARRAY['sentinela_local_admin'::name, 'sentinela_local_operator'::name])))) WITH CHECK (((origem = 'manual'::text) AND ((fonte)::text = 'SENTINELA_MANUAL'::text) AND (identidade_status = 'manual'::text) AND (localizacao_status = 'validada'::text) AND (SESSION_USER = ANY (ARRAY['sentinela_local_admin'::name, 'sentinela_local_operator'::name]))));

-- POLICY sentinela.ocorrencias manual_occurrence_visible_to_writer
CREATE POLICY manual_occurrence_visible_to_writer ON sentinela.ocorrencias FOR SELECT TO sentinela_manual_writer USING (((origem = 'manual'::text) AND ((fonte)::text = 'SENTINELA_MANUAL'::text)));

-- POLICY sentinela.pendencias_revisao manual_pendencias_leitura
CREATE POLICY manual_pendencias_leitura ON sentinela.pendencias_revisao FOR SELECT TO sentinela_manual_writer USING (((ocorrencia_id IS NOT NULL) AND (EXISTS ( SELECT
   FROM sentinela.ocorrencias o
  WHERE (o.id = pendencias_revisao.ocorrencia_id)))));

-- POLICY sentinela.regioes_administrativas manual_ra
CREATE POLICY manual_ra ON sentinela.regioes_administrativas FOR SELECT TO sentinela_manual_writer USING ((((versao_catalogo)::text = 'SENTINELA_RA_PUBLICO_2026_11_13_V1'::text) AND (versao_cartografia = 'IDE-DF-2026-11-13'::text) AND (limite IS NOT NULL) AND ((referencia_cartografica ->> 'approvalStatus'::text) = 'approved'::text) AND ((referencia_cartografica ->> 'sourceHash'::text) = 'fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553'::text)));

-- POLICY sentinela.ocorrencias manual_read
CREATE POLICY manual_read ON sentinela.ocorrencias FOR SELECT TO sentinela_manual_reader USING ((ativo AND (origem = 'manual'::text) AND ((fonte)::text = 'SENTINELA_MANUAL'::text) AND (SESSION_USER = ANY (ARRAY['sentinela_local_admin'::name, 'sentinela_local_operator'::name, 'sentinela_local_analyst'::name]))));

-- POLICY sentinela.ocorrencia_naturezas manual_read_links
CREATE POLICY manual_read_links ON sentinela.ocorrencia_naturezas FOR SELECT TO sentinela_manual_reader USING (((EXISTS ( SELECT
   FROM sentinela.ocorrencias o
  WHERE (o.id = ocorrencia_naturezas.ocorrencia_id))) AND (NOT (EXISTS ( SELECT
   FROM sentinela_ocorrencias_manual.naturezas_retiradas r
  WHERE (r.associacao_id = ocorrencia_naturezas.id))))));

-- POLICY sentinela.naturezas_criminais manual_read_nature
CREATE POLICY manual_read_nature ON sentinela.naturezas_criminais FOR SELECT TO sentinela_manual_reader USING (true);

-- POLICY sentinela.regioes_administrativas manual_read_ra
CREATE POLICY manual_read_ra ON sentinela.regioes_administrativas FOR SELECT TO sentinela_manual_reader USING (true);

-- POLICY sentinela.categorias_criminais ocorrencias_analytics_category
CREATE POLICY ocorrencias_analytics_category ON sentinela.categorias_criminais FOR SELECT TO sentinela_ocorrencias_reader USING ((status = 'homologada'::text));

-- POLICY sentinela.mapeamentos_natureza ocorrencias_analytics_mapping
CREATE POLICY ocorrencias_analytics_mapping ON sentinela.mapeamentos_natureza FOR SELECT TO sentinela_ocorrencias_reader USING ((status = 'homologado'::text));

-- POLICY sentinela.ocorrencia_naturezas ocorrencias_read_associacoes
CREATE POLICY ocorrencias_read_associacoes ON sentinela.ocorrencia_naturezas FOR SELECT TO sentinela_ocorrencias_reader USING (((EXISTS ( SELECT
   FROM sentinela.ocorrencias o
  WHERE (o.id = ocorrencia_naturezas.ocorrencia_id))) AND (NOT (EXISTS ( SELECT
   FROM sentinela_ocorrencias_manual.naturezas_retiradas r
  WHERE (r.associacao_id = ocorrencia_naturezas.id))))));

-- POLICY sentinela.ocorrencias ocorrencias_read_consolidadas
CREATE POLICY ocorrencias_read_consolidadas ON sentinela.ocorrencias FOR SELECT TO sentinela_ocorrencias_reader USING (((SESSION_USER = ANY (ARRAY['sentinela_local_admin'::name, 'sentinela_local_operator'::name, 'sentinela_local_analyst'::name])) AND ativo AND (consolidacao_status = 'consolidada'::text)));

-- POLICY sentinela.execucoes_importacao ocorrencias_read_execucoes
CREATE POLICY ocorrencias_read_execucoes ON sentinela.execucoes_importacao FOR SELECT TO sentinela_ocorrencias_reader USING (((status = 'concluida'::text) AND ((versao_importador)::text = ANY (ARRAY['pcdf-local-v1'::text, 'pcdf-csv-avulso-v2'::text])) AND (EXISTS ( SELECT
   FROM sentinela.lotes_importacao l
  WHERE (l.id = execucoes_importacao.lote_id)))));

-- POLICY sentinela.extracoes_origem ocorrencias_read_extracoes
CREATE POLICY ocorrencias_read_extracoes ON sentinela.extracoes_origem FOR SELECT TO sentinela_ocorrencias_reader USING (((SESSION_USER = ANY (ARRAY['sentinela_local_admin'::name, 'sentinela_local_operator'::name])) AND ((fonte)::text = 'PCDF'::text) AND (metodologia = ANY (ARRAY['pcdf-csv-local-v1'::text, 'pcdf-csv-avulso-v2'::text]))));

-- POLICY sentinela.lotes_importacao ocorrencias_read_lotes
CREATE POLICY ocorrencias_read_lotes ON sentinela.lotes_importacao FOR SELECT TO sentinela_ocorrencias_reader USING ((((versao_contrato)::text = ANY (ARRAY['1.0'::text, '2.0'::text])) AND (EXISTS ( SELECT
   FROM sentinela.extracoes_origem x
  WHERE (x.id = lotes_importacao.extracao_id)))));

-- POLICY sentinela.naturezas_criminais ocorrencias_read_naturezas
CREATE POLICY ocorrencias_read_naturezas ON sentinela.naturezas_criminais FOR SELECT TO sentinela_ocorrencias_reader USING (true);

-- POLICY sentinela.linhas_origem ocorrencias_read_origem
CREATE POLICY ocorrencias_read_origem ON sentinela.linhas_origem FOR SELECT TO sentinela_ocorrencias_reader USING ((((versao_identificador)::text = ANY (ARRAY['pcdf-linha-v1'::text, 'pcdf-linha-declarada-csv-v2'::text])) AND (EXISTS ( SELECT
   FROM sentinela.extracoes_origem x
  WHERE (x.id = linhas_origem.extracao_id)))));

-- POLICY sentinela.pendencias_revisao ocorrencias_read_pendencias
CREATE POLICY ocorrencias_read_pendencias ON sentinela.pendencias_revisao FOR SELECT TO sentinela_ocorrencias_reader USING ((((versao_regra)::text = ANY (ARRAY['pcdf-local-v1'::text, 'pcdf-csv-avulso-v2'::text])) AND (EXISTS ( SELECT
   FROM sentinela.linhas_origem o
  WHERE (o.id = pendencias_revisao.linha_origem_id)))));

-- POLICY sentinela.regioes_administrativas ocorrencias_read_ra
CREATE POLICY ocorrencias_read_ra ON sentinela.regioes_administrativas FOR SELECT TO sentinela_ocorrencias_reader USING (true);

-- POLICY sentinela.linhas_staging ocorrencias_read_staging
CREATE POLICY ocorrencias_read_staging ON sentinela.linhas_staging FOR SELECT TO sentinela_ocorrencias_reader USING ((EXISTS ( SELECT
   FROM sentinela.execucoes_importacao e
  WHERE (e.id = linhas_staging.execucao_id))));

-- POLICY sentinela.lotes_importacao pcdf_csv_lot_insert
CREATE POLICY pcdf_csv_lot_insert ON sentinela.lotes_importacao FOR INSERT TO sentinela_pcdf_owner WITH CHECK (((SESSION_USER = 'sentinela_local_admin'::name) AND ((versao_contrato)::text = '2.0'::text) AND ((versao_tratamento)::text = 'pcdf-csv-avulso-v2'::text) AND (EXISTS ( SELECT
   FROM sentinela.extracoes_origem x
  WHERE ((x.id = lotes_importacao.extracao_id) AND (x.metodologia = 'pcdf-csv-avulso-v2'::text))))));

-- POLICY sentinela.execucoes_importacao pcdf_csv_run_insert
CREATE POLICY pcdf_csv_run_insert ON sentinela.execucoes_importacao FOR INSERT TO sentinela_pcdf_owner WITH CHECK (((SESSION_USER = 'sentinela_local_admin'::name) AND ((versao_importador)::text = 'pcdf-csv-avulso-v2'::text) AND ((versao_validacao)::text = 'pcdf-csv-avulso-v2'::text) AND (status = 'concluida'::text) AND (tentativa = 1) AND (linhas_aptas = linhas_processadas) AND (linhas_bloqueadas = 0) AND (ocorrencias_criadas = 0) AND (associacoes_criadas = 0) AND (EXISTS ( SELECT
   FROM sentinela.lotes_importacao l
  WHERE ((l.id = execucoes_importacao.lote_id) AND ((l.versao_contrato)::text = '2.0'::text) AND (l.extracao_id = execucoes_importacao.extracao_id) AND (l.solicitado_por = execucoes_importacao.solicitado_por))))));

-- POLICY sentinela.eventos_auditoria pcdf_local_audit
CREATE POLICY pcdf_local_audit ON sentinela.eventos_auditoria TO sentinela_pcdf_owner USING (((ator_tipo = 'servico'::text) AND (servico = 'pcdf-local'::text) AND (ocorrencia_id IS NULL) AND (linha_origem_id IS NULL) AND (pendencia_id IS NULL) AND (correcao_id IS NULL) AND ((execucao_id IS NULL) OR (EXISTS ( SELECT
   FROM sentinela.execucoes_importacao e
  WHERE (e.id = eventos_auditoria.execucao_id))))));

-- POLICY sentinela.extracoes_origem pcdf_local_extractions
CREATE POLICY pcdf_local_extractions ON sentinela.extracoes_origem TO sentinela_pcdf_owner USING ((((fonte)::text = 'PCDF'::text) AND (metodologia = ANY (ARRAY['pcdf-csv-local-v1'::text, 'pcdf-csv-avulso-v2'::text]))));

-- POLICY sentinela.pendencias_revisao pcdf_local_issues
CREATE POLICY pcdf_local_issues ON sentinela.pendencias_revisao TO sentinela_pcdf_owner USING (((status = 'aberta'::text) AND (responsavel_id IS NULL) AND (ocorrencia_id IS NULL) AND (EXISTS ( SELECT
   FROM sentinela.linhas_origem o
  WHERE (o.id = pendencias_revisao.linha_origem_id)))));

-- POLICY sentinela.lotes_importacao pcdf_local_lots_insert
CREATE POLICY pcdf_local_lots_insert ON sentinela.lotes_importacao FOR INSERT TO sentinela_pcdf_owner WITH CHECK ((((versao_contrato)::text = '1.0'::text) AND (EXISTS ( SELECT
   FROM sentinela.extracoes_origem x
  WHERE (x.id = lotes_importacao.extracao_id))) AND (EXISTS ( SELECT
   FROM sentinela.usuarios u
  WHERE ((u.id = lotes_importacao.solicitado_por) AND u.ativo)))));

-- POLICY sentinela.lotes_importacao pcdf_local_lots_read
CREATE POLICY pcdf_local_lots_read ON sentinela.lotes_importacao FOR SELECT TO sentinela_pcdf_owner USING ((((versao_contrato)::text = ANY (ARRAY['1.0'::text, '2.0'::text])) AND (EXISTS ( SELECT
   FROM sentinela.extracoes_origem x
  WHERE (x.id = lotes_importacao.extracao_id)))));

-- POLICY sentinela.linhas_origem pcdf_local_origins
CREATE POLICY pcdf_local_origins ON sentinela.linhas_origem TO sentinela_pcdf_owner USING ((((((versao_identificador)::text = 'pcdf-linha-v1'::text) AND ((aba_origem)::text = 'NATUREZAS'::text)) OR (((versao_identificador)::text = 'pcdf-linha-declarada-csv-v2'::text) AND ((aba_origem)::text = 'CSV'::text))) AND (EXISTS ( SELECT
   FROM sentinela.extracoes_origem x
  WHERE (x.id = linhas_origem.extracao_id)))));

-- POLICY sentinela.perfil_permissoes pcdf_local_permissions
CREATE POLICY pcdf_local_permissions ON sentinela.perfil_permissoes FOR SELECT TO sentinela_pcdf_owner USING ((acao = 'importar'::text));

-- POLICY sentinela.execucoes_importacao pcdf_local_runs_insert
CREATE POLICY pcdf_local_runs_insert ON sentinela.execucoes_importacao FOR INSERT TO sentinela_pcdf_owner WITH CHECK ((((versao_importador)::text = 'pcdf-local-v1'::text) AND (status = 'concluida'::text) AND (tentativa = 1) AND (linhas_aptas = 0) AND (ocorrencias_criadas = 0) AND (associacoes_criadas = 0) AND (EXISTS ( SELECT
   FROM sentinela.lotes_importacao l
  WHERE ((l.id = execucoes_importacao.lote_id) AND (l.extracao_id = execucoes_importacao.extracao_id)))) AND (EXISTS ( SELECT
   FROM sentinela.usuarios u
  WHERE ((u.id = execucoes_importacao.solicitado_por) AND u.ativo)))));

-- POLICY sentinela.execucoes_importacao pcdf_local_runs_read
CREATE POLICY pcdf_local_runs_read ON sentinela.execucoes_importacao FOR SELECT TO sentinela_pcdf_owner USING ((((versao_importador)::text = ANY (ARRAY['pcdf-local-v1'::text, 'pcdf-csv-avulso-v2'::text])) AND (EXISTS ( SELECT
   FROM sentinela.lotes_importacao l
  WHERE (l.id = execucoes_importacao.lote_id)))));

-- POLICY sentinela.linhas_staging pcdf_local_staging
CREATE POLICY pcdf_local_staging ON sentinela.linhas_staging TO sentinela_pcdf_owner USING ((((estado = 'bloqueada'::text) OR ((estado = 'recebida'::text) AND (derivados_efetivos ? 'geo'::text))) AND (ocorrencia_id IS NULL) AND (associacao_id IS NULL) AND (EXISTS ( SELECT
   FROM sentinela.execucoes_importacao e
  WHERE (e.id = linhas_staging.execucao_id)))));

-- POLICY sentinela.usuarios pcdf_local_users
CREATE POLICY pcdf_local_users ON sentinela.usuarios FOR SELECT TO sentinela_pcdf_owner
  USING (ativo AND id=sentinela_ambiente.ator_importacao());

-- POLICY sentinela.linhas_origem pcdf_origem_associacao_visivel
CREATE POLICY pcdf_origem_associacao_visivel ON sentinela.linhas_origem FOR SELECT TO sentinela_ocorrencias_reader USING ((EXISTS ( SELECT
   FROM sentinela.ocorrencia_naturezas a
  WHERE (a.linha_origem_id = linhas_origem.id))));

-- POLICY sentinela.pendencias_revisao pendencias_natureza_original_leitura
CREATE POLICY pendencias_natureza_original_leitura ON sentinela.pendencias_revisao AS RESTRICTIVE FOR SELECT TO sentinela_ocorrencias_reader USING ((NOT ((((campo)::text = 'classificacao_status'::text) AND ((regra)::text = ANY (ARRAY['classificacao_pendente'::text, 'classificacao_nao_verificada'::text]))) OR (((campo)::text = 'natureza_sentinela_codigo'::text) AND ((regra)::text = ANY (ARRAY['mapeamento_a_homologar'::text, 'classificacao_pendente'::text]))) OR (((campo)::text = 'natureza_padronizada_pcdf'::text) AND ((regra)::text = ANY (ARRAY['rotulo_criminal_pendente'::text, 'categoria_fora_do_catalogo'::text]))))));

-- POLICY sentinela.pendencias_revisao pendencias_pcdf_componentes_ausentes_leitura
CREATE POLICY pendencias_pcdf_componentes_ausentes_leitura ON sentinela.pendencias_revisao AS RESTRICTIVE FOR SELECT TO sentinela_ocorrencias_reader USING ((NOT ((tipo = 'coordenadas'::text) AND ((versao_regra)::text = 'pcdf-csv-avulso-v2'::text) AND (status = 'aberta'::text) AND (ocorrencia_id IS NULL) AND (associacao_id IS NULL) AND (efeito = 'bloqueia_dimensao'::text) AND (dimensao_afetada = 'coordenadas'::text) AND sentinela.pcdf_componente_ausente_v1(linha_origem_id, (campo)::text, (regra)::text, valor_original))));

-- POLICY sentinela.eventos_auditoria pessoas_auditoria_escrita
CREATE POLICY pessoas_auditoria_escrita ON sentinela.eventos_auditoria FOR INSERT TO sentinela_pessoas_owner WITH CHECK (((SESSION_USER = 'sentinela_local_admin'::name) AND ((acao)::text = 'usuarios.editar_institucional'::text) AND (ator_tipo = 'servico'::text) AND (servico = 'sentinela-usuarios'::text)));

-- POLICY sentinela.eventos_auditoria pessoas_auditoria_leitura
CREATE POLICY pessoas_auditoria_leitura ON sentinela.eventos_auditoria FOR SELECT TO sentinela_pessoas_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND ((acao)::text = 'usuarios.editar_institucional'::text)));

-- POLICY sentinela.usuarios pessoas_cadastro
CREATE POLICY pessoas_cadastro ON sentinela.usuarios FOR INSERT TO sentinela_pessoas_owner WITH CHECK (((SESSION_USER = 'sentinela_local_admin'::name) AND (id = auth_user_id) AND ativo));

-- POLICY sentinela.eventos_auditoria pessoas_cadastro_auditoria
CREATE POLICY pessoas_cadastro_auditoria ON sentinela.eventos_auditoria FOR INSERT TO sentinela_pessoas_owner WITH CHECK (((SESSION_USER = 'sentinela_local_admin'::name) AND ((acao)::text = 'usuarios.criar_institucional'::text) AND (ator_tipo = 'servico'::text) AND (servico = 'sentinela-usuarios'::text)));

-- POLICY sentinela.usuarios pessoas_edicao
CREATE POLICY pessoas_edicao ON sentinela.usuarios FOR UPDATE TO sentinela_pessoas_owner
 USING (SESSION_USER='sentinela_local_admin' AND (auth_user_id IS NOT NULL OR (NOT ativo AND EXISTS (
   SELECT FROM sentinela_pessoas.exclusoes e WHERE e.usuario=usuarios.id AND e.concluida_em IS NULL))))
 WITH CHECK (SESSION_USER='sentinela_local_admin' AND (auth_user_id IS NOT NULL OR (NOT ativo AND EXISTS (
   SELECT FROM sentinela_pessoas.exclusoes e WHERE e.usuario=usuarios.id AND e.concluida_em IS NULL))));

-- POLICY sentinela.eventos_auditoria pessoas_exclusao_auditoria
CREATE POLICY pessoas_exclusao_auditoria ON sentinela.eventos_auditoria FOR INSERT TO sentinela_pessoas_owner WITH CHECK (((SESSION_USER = 'sentinela_local_admin'::name) AND ((acao)::text = 'usuarios.excluir_institucional'::text) AND (ator_tipo = 'servico'::text) AND (servico = 'sentinela-usuarios'::text)));

-- POLICY sentinela.usuarios pessoas_listagem
CREATE POLICY pessoas_listagem ON sentinela.usuarios FOR SELECT TO sentinela_pessoas_owner
 USING (SESSION_USER='sentinela_local_admin' AND (auth_user_id IS NOT NULL OR (NOT ativo AND EXISTS (
   SELECT FROM sentinela_pessoas.exclusoes e WHERE e.usuario=usuarios.id AND e.concluida_em IS NULL))));

-- POLICY sentinela.perfil_permissoes pessoas_permissoes
CREATE POLICY pessoas_permissoes ON sentinela.perfil_permissoes FOR SELECT TO sentinela_pessoas_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND (acao = 'administrar'::text)));

-- ROW SECURITY sentinela_exclusao.comprovantes
ALTER TABLE sentinela_exclusao.comprovantes ENABLE ROW LEVEL SECURITY;

-- POLICY sentinela_exclusao.comprovantes comprovantes_insercao
CREATE POLICY comprovantes_insercao ON sentinela_exclusao.comprovantes FOR INSERT WITH CHECK (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela_exclusao.comprovantes comprovantes_leitura
CREATE POLICY comprovantes_leitura ON sentinela_exclusao.comprovantes FOR SELECT USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela_general_accounts.individuals import_actor_binding
CREATE POLICY import_actor_binding ON sentinela_general_accounts.individuals FOR SELECT TO sentinela_general_importer USING ((login = SESSION_USER));

-- ROW SECURITY sentinela_general_accounts.individuals
ALTER TABLE sentinela_general_accounts.individuals ENABLE ROW LEVEL SECURITY;

-- POLICY sentinela_gestao_autorizacao.exclusoes aprovacoes_privadas
CREATE POLICY aprovacoes_privadas ON sentinela_gestao_autorizacao.exclusoes TO sentinela_gestao_autoridade USING (true) WITH CHECK (true);

-- ROW SECURITY sentinela_gestao_autorizacao.atores
ALTER TABLE sentinela_gestao_autorizacao.atores ENABLE ROW LEVEL SECURITY;

-- POLICY sentinela_gestao_autorizacao.atores atores_privados
CREATE POLICY atores_privados ON sentinela_gestao_autorizacao.atores TO sentinela_gestao_autoridade USING (true) WITH CHECK (true);

-- ROW SECURITY sentinela_gestao_autorizacao.exclusoes
ALTER TABLE sentinela_gestao_autorizacao.exclusoes ENABLE ROW LEVEL SECURITY;

-- ROW SECURITY sentinela_gestao_autorizacao.release
ALTER TABLE sentinela_gestao_autorizacao.release ENABLE ROW LEVEL SECURITY;

-- POLICY sentinela_gestao_autorizacao.release release_privada
CREATE POLICY release_privada ON sentinela_gestao_autorizacao.release TO sentinela_gestao_autoridade USING (true) WITH CHECK (true);

-- POLICY sentinela_import_local.requests exclusao_leitura
CREATE POLICY exclusao_leitura ON sentinela_import_local.requests FOR SELECT TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela_import_local.requests exclusao_remocao
CREATE POLICY exclusao_remocao ON sentinela_import_local.requests FOR DELETE TO sentinela_exclusao_owner USING (((SESSION_USER = 'sentinela_local_admin'::name) AND sentinela_ambiente.vinculado()));

-- POLICY sentinela_import_local.requests import_requests
CREATE POLICY import_requests ON sentinela_import_local.requests TO sentinela_general_importer USING ((SESSION_USER = ANY (ARRAY['sentinela_local_admin'::name, 'sentinela_local_operator'::name]))) WITH CHECK ((EXISTS ( SELECT
   FROM sentinela_general_accounts.individuals i
  WHERE (i.subject = requests.subject))));

-- ROW SECURITY sentinela_import_local.local_revision
ALTER TABLE sentinela_import_local.local_revision ENABLE ROW LEVEL SECURITY;

-- ROW SECURITY sentinela_import_local.requests
ALTER TABLE sentinela_import_local.requests ENABLE ROW LEVEL SECURITY;

-- ROW SECURITY sentinela_ocorrencias_analytics.pcdf_pontos
ALTER TABLE sentinela_ocorrencias_analytics.pcdf_pontos ENABLE ROW LEVEL SECURITY;

-- POLICY sentinela_ocorrencias_analytics.pcdf_pontos pcdf_pontos_leitura
CREATE POLICY pcdf_pontos_leitura ON sentinela_ocorrencias_analytics.pcdf_pontos FOR SELECT TO sentinela_ocorrencias_reader USING (true);

-- ROW SECURITY sentinela_ocorrencias_manual.cadastros
ALTER TABLE sentinela_ocorrencias_manual.cadastros ENABLE ROW LEVEL SECURITY;

-- ROW SECURITY sentinela_ocorrencias_manual.definicoes_originais
ALTER TABLE sentinela_ocorrencias_manual.definicoes_originais ENABLE ROW LEVEL SECURITY;

-- ROW SECURITY sentinela_ocorrencias_manual.liberacao
ALTER TABLE sentinela_ocorrencias_manual.liberacao ENABLE ROW LEVEL SECURITY;

-- POLICY sentinela_ocorrencias_manual.liberacao manual_liberacao_leitura
CREATE POLICY manual_liberacao_leitura ON sentinela_ocorrencias_manual.liberacao FOR SELECT TO sentinela_manual_writer USING (true);

-- POLICY sentinela_ocorrencias_manual.cadastros manual_receipt_operational_read
CREATE POLICY manual_receipt_operational_read ON sentinela_ocorrencias_manual.cadastros FOR SELECT TO sentinela_manual_writer USING ((SESSION_USER = ANY (ARRAY['sentinela_local_admin'::name, 'sentinela_local_operator'::name])));

-- POLICY sentinela_ocorrencias_manual.cadastros manual_receipt_operational_update
CREATE POLICY manual_receipt_operational_update ON sentinela_ocorrencias_manual.cadastros FOR UPDATE TO sentinela_manual_writer USING (((SESSION_USER = ANY (ARRAY['sentinela_local_admin'::name, 'sentinela_local_operator'::name])) AND (EXISTS ( SELECT
   FROM sentinela.ocorrencias o
  WHERE ((o.id = cadastros.ocorrencia_id) AND o.ativo AND (o.origem = 'manual'::text) AND ((o.fonte)::text = 'SENTINELA_MANUAL'::text) AND (o.consolidacao_status = 'em_revisao'::text)))))) WITH CHECK ((SESSION_USER = ANY (ARRAY['sentinela_local_admin'::name, 'sentinela_local_operator'::name])));

-- POLICY sentinela_ocorrencias_manual.cadastros manual_receipt_read
CREATE POLICY manual_receipt_read ON sentinela_ocorrencias_manual.cadastros FOR SELECT TO sentinela_manual_reader USING ((SESSION_USER = ANY (ARRAY['sentinela_local_admin'::name, 'sentinela_local_operator'::name, 'sentinela_local_analyst'::name])));

-- POLICY sentinela_ocorrencias_manual.cadastros manual_receipt_write
CREATE POLICY manual_receipt_write ON sentinela_ocorrencias_manual.cadastros TO sentinela_manual_writer USING ((login = SESSION_USER)) WITH CHECK ((login = SESSION_USER));

-- POLICY sentinela_ocorrencias_manual.naturezas_retiradas manual_retiradas_insert
CREATE POLICY manual_retiradas_insert ON sentinela_ocorrencias_manual.naturezas_retiradas FOR INSERT TO sentinela_manual_writer WITH CHECK (((SESSION_USER = ANY (ARRAY['sentinela_local_admin'::name, 'sentinela_local_operator'::name])) AND (EXISTS ( SELECT
   FROM (sentinela.ocorrencia_naturezas n
     JOIN sentinela.ocorrencias o ON ((o.id = n.ocorrencia_id)))
  WHERE ((n.id = naturezas_retiradas.associacao_id) AND (n.origem = 'manual'::text) AND (n.linha_origem_id IS NULL) AND o.ativo AND (o.origem = 'manual'::text) AND ((o.fonte)::text = 'SENTINELA_MANUAL'::text) AND (o.consolidacao_status = 'em_revisao'::text))))));

-- POLICY sentinela_ocorrencias_manual.naturezas_retiradas manual_retiradas_leitura
CREATE POLICY manual_retiradas_leitura ON sentinela_ocorrencias_manual.naturezas_retiradas FOR SELECT TO sentinela_manual_reader, sentinela_manual_writer, sentinela_ocorrencias_reader USING (true);

-- POLICY sentinela_ocorrencias_manual.naturezas_uso_local manual_uso_local_leitura
CREATE POLICY manual_uso_local_leitura ON sentinela_ocorrencias_manual.naturezas_uso_local FOR SELECT TO sentinela_manual_reader, sentinela_manual_writer USING (true);

-- ROW SECURITY sentinela_ocorrencias_manual.naturezas_retiradas
ALTER TABLE sentinela_ocorrencias_manual.naturezas_retiradas ENABLE ROW LEVEL SECURITY;

-- ROW SECURITY sentinela_ocorrencias_manual.naturezas_uso_local
ALTER TABLE sentinela_ocorrencias_manual.naturezas_uso_local ENABLE ROW LEVEL SECURITY;

-- ROW SECURITY sentinela_pcdf_historico.arquivos
ALTER TABLE sentinela_pcdf_historico.arquivos ENABLE ROW LEVEL SECURITY;

-- POLICY sentinela_pcdf_historico.arquivos historico_inventario
CREATE POLICY historico_inventario ON sentinela_pcdf_historico.arquivos FOR SELECT TO sentinela_pcdf_historico_owner USING (true);

-- ROW SECURITY sentinela_pessoas.contatos
ALTER TABLE sentinela_pessoas.contatos ENABLE ROW LEVEL SECURITY;

-- ROW SECURITY sentinela_pessoas.exclusoes
ALTER TABLE sentinela_pessoas.exclusoes ENABLE ROW LEVEL SECURITY;

-- POLICY sentinela_pessoas.contatos pessoas_contatos
CREATE POLICY pessoas_contatos ON sentinela_pessoas.contatos TO sentinela_pessoas_owner USING ((SESSION_USER = 'sentinela_local_admin'::name)) WITH CHECK ((SESSION_USER = 'sentinela_local_admin'::name));

-- POLICY sentinela_pessoas.exclusoes pessoas_exclusao_estado
CREATE POLICY pessoas_exclusao_estado ON sentinela_pessoas.exclusoes TO sentinela_pessoas_owner USING ((SESSION_USER = 'sentinela_local_admin'::name)) WITH CHECK ((SESSION_USER = 'sentinela_local_admin'::name));

-- ACL -.SCHEMA sentinela
GRANT USAGE ON SCHEMA sentinela TO sentinela_pcdf_owner;
GRANT USAGE ON SCHEMA sentinela TO sentinela_general_importer;
GRANT USAGE ON SCHEMA sentinela TO sentinela_ocorrencias_reader;
GRANT USAGE ON SCHEMA sentinela TO sentinela_gestao_autoridade;
GRANT USAGE ON SCHEMA sentinela TO sentinela_gestao_owner;
GRANT USAGE ON SCHEMA sentinela TO sentinela_exclusao_owner;
GRANT USAGE ON SCHEMA sentinela TO sentinela_pcdf_historico_owner;
GRANT USAGE ON SCHEMA sentinela TO sentinela_pessoas_owner;
GRANT USAGE ON SCHEMA sentinela TO sentinela_manual_writer;
GRANT USAGE ON SCHEMA sentinela TO sentinela_manual_reader;

-- ACL -.SCHEMA sentinela_exclusao
GRANT USAGE ON SCHEMA sentinela_exclusao TO sentinela_local_admin;

-- ACL -.SCHEMA sentinela_general_accounts
GRANT USAGE ON SCHEMA sentinela_general_accounts TO sentinela_general_importer;

-- ACL -.SCHEMA sentinela_gestao
GRANT USAGE ON SCHEMA sentinela_gestao TO sentinela_local_admin;
GRANT USAGE ON SCHEMA sentinela_gestao TO sentinela_local_operator;
GRANT USAGE ON SCHEMA sentinela_gestao TO sentinela_ocorrencias_reader;

-- ACL -.SCHEMA sentinela_gestao_autorizacao
GRANT USAGE ON SCHEMA sentinela_gestao_autorizacao TO sentinela_gestao_owner;
GRANT USAGE ON SCHEMA sentinela_gestao_autorizacao TO sentinela_local_admin;
GRANT USAGE ON SCHEMA sentinela_gestao_autorizacao TO sentinela_exclusao_owner;
GRANT USAGE ON SCHEMA sentinela_gestao_autorizacao TO sentinela_pcdf_owner;
GRANT USAGE ON SCHEMA sentinela_gestao_autorizacao TO sentinela_pcdf_historico_owner;

-- ACL -.SCHEMA sentinela_import_local
GRANT USAGE ON SCHEMA sentinela_import_local TO sentinela_general_importer;
GRANT USAGE ON SCHEMA sentinela_import_local TO sentinela_local_admin;
GRANT USAGE ON SCHEMA sentinela_import_local TO sentinela_local_operator;
GRANT USAGE ON SCHEMA sentinela_import_local TO sentinela_exclusao_owner;

-- ACL -.SCHEMA sentinela_ocorrencias_analytics
GRANT USAGE ON SCHEMA sentinela_ocorrencias_analytics TO sentinela_local_admin;
GRANT USAGE ON SCHEMA sentinela_ocorrencias_analytics TO sentinela_local_operator;
GRANT USAGE ON SCHEMA sentinela_ocorrencias_analytics TO sentinela_local_analyst;

-- ACL -.SCHEMA sentinela_ocorrencias_local
GRANT USAGE ON SCHEMA sentinela_ocorrencias_local TO sentinela_local_admin;
GRANT USAGE ON SCHEMA sentinela_ocorrencias_local TO sentinela_local_operator;
GRANT USAGE ON SCHEMA sentinela_ocorrencias_local TO sentinela_local_analyst;

-- ACL -.SCHEMA sentinela_ocorrencias_manual
GRANT USAGE ON SCHEMA sentinela_ocorrencias_manual TO sentinela_manual_writer;
GRANT USAGE ON SCHEMA sentinela_ocorrencias_manual TO sentinela_manual_reader;
GRANT USAGE ON SCHEMA sentinela_ocorrencias_manual TO sentinela_local_admin;
GRANT USAGE ON SCHEMA sentinela_ocorrencias_manual TO sentinela_local_operator;
GRANT USAGE ON SCHEMA sentinela_ocorrencias_manual TO sentinela_local_analyst;
GRANT USAGE ON SCHEMA sentinela_ocorrencias_manual TO sentinela_ocorrencias_reader;

-- ACL -.SCHEMA sentinela_pcdf_historico
GRANT USAGE ON SCHEMA sentinela_pcdf_historico TO sentinela_pcdf_historico_owner;
GRANT USAGE ON SCHEMA sentinela_pcdf_historico TO sentinela_pcdf_owner;
GRANT USAGE ON SCHEMA sentinela_pcdf_historico TO sentinela_local_admin;
GRANT USAGE ON SCHEMA sentinela_pcdf_historico TO sentinela_local_operator;
GRANT USAGE ON SCHEMA sentinela_pcdf_historico TO sentinela_local_analyst;

-- ACL -.SCHEMA sentinela_pcdf_local
GRANT USAGE ON SCHEMA sentinela_pcdf_local TO sentinela_pcdf_owner;
GRANT USAGE ON SCHEMA sentinela_pcdf_local TO sentinela_local_admin;
GRANT USAGE ON SCHEMA sentinela_pcdf_local TO sentinela_local_operator;
GRANT USAGE ON SCHEMA sentinela_pcdf_local TO sentinela_pcdf_historico_owner;

-- ACL -.SCHEMA sentinela_pcdf_revisao
GRANT USAGE ON SCHEMA sentinela_pcdf_revisao TO sentinela_pcdf_owner;
GRANT USAGE ON SCHEMA sentinela_pcdf_revisao TO sentinela_ocorrencias_reader;
GRANT USAGE ON SCHEMA sentinela_pcdf_revisao TO sentinela_pcdf_historico_owner;

-- ACL -.SCHEMA sentinela_pessoas
GRANT USAGE ON SCHEMA sentinela_pessoas TO sentinela_pessoas_owner;
GRANT USAGE ON SCHEMA sentinela_pessoas TO sentinela_local_admin;

-- ACL sentinela.TYPE texto_obrigatorio
GRANT ALL ON TYPE sentinela.texto_obrigatorio TO sentinela_manual_writer;

-- ACL sentinela.FUNCTION bloquear_autoria_manual_sem_auth()
REVOKE ALL ON FUNCTION sentinela.bloquear_autoria_manual_sem_auth() FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela.bloquear_autoria_manual_sem_auth() TO sentinela_gestao_owner;
GRANT ALL ON FUNCTION sentinela.bloquear_autoria_manual_sem_auth() TO sentinela_manual_writer;

-- ACL sentinela.FUNCTION carimbar_auditoria()
REVOKE ALL ON FUNCTION sentinela.carimbar_auditoria() FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela.carimbar_auditoria() TO sentinela_pcdf_owner;
GRANT ALL ON FUNCTION sentinela.carimbar_auditoria() TO sentinela_general_importer;
GRANT ALL ON FUNCTION sentinela.carimbar_auditoria() TO sentinela_gestao_owner;
GRANT ALL ON FUNCTION sentinela.carimbar_auditoria() TO sentinela_manual_writer;

-- ACL sentinela.FUNCTION descricao_pcdf(text)
GRANT ALL ON FUNCTION sentinela.descricao_pcdf(text) TO sentinela_pcdf_historico_owner;

-- ACL sentinela.FUNCTION exigir_revisor_administrador()
REVOKE ALL ON FUNCTION sentinela.exigir_revisor_administrador() FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela.exigir_revisor_administrador() TO sentinela_pcdf_owner;
GRANT ALL ON FUNCTION sentinela.exigir_revisor_administrador() TO sentinela_general_importer;

-- ACL sentinela.FUNCTION pcdf_componente_ausente_v1(origem uuid, campo text, regra text, valor jsonb)
REVOKE ALL ON FUNCTION sentinela.pcdf_componente_ausente_v1(origem uuid, campo text, regra text, valor jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela.pcdf_componente_ausente_v1(origem uuid, campo text, regra text, valor jsonb) TO sentinela_ocorrencias_reader;

-- ACL sentinela.FUNCTION validar_associacao_mapeada()
REVOKE ALL ON FUNCTION sentinela.validar_associacao_mapeada() FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela.validar_associacao_mapeada() TO sentinela_manual_writer;

-- ACL sentinela.FUNCTION validar_vinculos_evento()
REVOKE ALL ON FUNCTION sentinela.validar_vinculos_evento() FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela.validar_vinculos_evento() TO sentinela_pcdf_owner;
GRANT ALL ON FUNCTION sentinela.validar_vinculos_evento() TO sentinela_general_importer;
GRANT ALL ON FUNCTION sentinela.validar_vinculos_evento() TO sentinela_gestao_owner;
GRANT ALL ON FUNCTION sentinela.validar_vinculos_evento() TO sentinela_manual_writer;

-- ACL sentinela_exclusao.FUNCTION autorizar_jan2021(alvo uuid, p_usuario uuid, p_conta text, p_revisao text, p_backup text)
REVOKE ALL ON FUNCTION sentinela_exclusao.autorizar_jan2021(alvo uuid, p_usuario uuid, p_conta text, p_revisao text, p_backup text) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_exclusao.autorizar_jan2021(alvo uuid, p_usuario uuid, p_conta text, p_revisao text, p_backup text) TO sentinela_local_admin;

-- ACL sentinela_exclusao.FUNCTION excecao_pontual_jan2021(plano jsonb)
REVOKE ALL ON FUNCTION sentinela_exclusao.excecao_pontual_jan2021(plano jsonb) FROM PUBLIC;

-- ACL sentinela_exclusao.FUNCTION excluir(p jsonb, conta text, p_usuario uuid)
REVOKE ALL ON FUNCTION sentinela_exclusao.excluir(p jsonb, conta text, p_usuario uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_exclusao.excluir(p jsonb, conta text, p_usuario uuid) TO sentinela_local_admin;

-- ACL sentinela_exclusao.FUNCTION exigir_ambiente()
REVOKE ALL ON FUNCTION sentinela_exclusao.exigir_ambiente() FROM PUBLIC;

-- ACL sentinela_exclusao.FUNCTION historico(pagina integer)
REVOKE ALL ON FUNCTION sentinela_exclusao.historico(pagina integer) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_exclusao.historico(pagina integer) TO sentinela_local_admin;

-- ACL sentinela_exclusao.FUNCTION plano(alvo uuid)
REVOKE ALL ON FUNCTION sentinela_exclusao.plano(alvo uuid) FROM PUBLIC;

-- ACL sentinela_exclusao.FUNCTION previa(alvo uuid, p_usuario uuid, p_conta text)
REVOKE ALL ON FUNCTION sentinela_exclusao.previa(alvo uuid, p_usuario uuid, p_conta text) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_exclusao.previa(alvo uuid, p_usuario uuid, p_conta text) TO sentinela_local_admin;

-- ACL sentinela_exclusao.FUNCTION quantidades(plano jsonb)
REVOKE ALL ON FUNCTION sentinela_exclusao.quantidades(plano jsonb) FROM PUBLIC;

-- ACL sentinela_exclusao.FUNCTION revisao(plano jsonb)
REVOKE ALL ON FUNCTION sentinela_exclusao.revisao(plano jsonb) FROM PUBLIC;

-- ACL sentinela_exclusao.FUNCTION vinculos_inesperados()
REVOKE ALL ON FUNCTION sentinela_exclusao.vinculos_inesperados() FROM PUBLIC;

-- ACL sentinela_gestao.FUNCTION acoes(area text, pagina jsonb)
REVOKE ALL ON FUNCTION sentinela_gestao.acoes(area text, pagina jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_gestao.acoes(area text, pagina jsonb) TO sentinela_local_admin;

-- ACL sentinela_gestao.FUNCTION alvo(p_area text, p_id uuid)
REVOKE ALL ON FUNCTION sentinela_gestao.alvo(p_area text, p_id uuid) FROM PUBLIC;

-- ACL sentinela_gestao.FUNCTION arquivo(p_id uuid)
REVOKE ALL ON FUNCTION sentinela_gestao.arquivo(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_gestao.arquivo(p_id uuid) TO sentinela_local_admin;

-- ACL sentinela_gestao.FUNCTION arquivos(p jsonb)
REVOKE ALL ON FUNCTION sentinela_gestao.arquivos(p jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_gestao.arquivos(p jsonb) TO sentinela_local_admin;

-- ACL sentinela_gestao.FUNCTION associacao(p_id uuid)
REVOKE ALL ON FUNCTION sentinela_gestao.associacao(p_id uuid) FROM PUBLIC;

-- ACL sentinela_gestao.FUNCTION contagens(p_exec uuid, p_fonte text, p_contrato text, p_lidas bigint, p_pendencias bigint)
REVOKE ALL ON FUNCTION sentinela_gestao.contagens(p_exec uuid, p_fonte text, p_contrato text, p_lidas bigint, p_pendencias bigint) FROM PUBLIC;

-- ACL sentinela_gestao.FUNCTION contexto(area text, alvo uuid)
REVOKE ALL ON FUNCTION sentinela_gestao.contexto(area text, alvo uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_gestao.contexto(area text, alvo uuid) TO sentinela_local_admin;

-- ACL sentinela_gestao.FUNCTION impacto(p_lote uuid, p_staging uuid)
REVOKE ALL ON FUNCTION sentinela_gestao.impacto(p_lote uuid, p_staging uuid) FROM PUBLIC;

-- ACL sentinela_gestao.FUNCTION mutar(p jsonb, p_conta text, p_usuario uuid)
REVOKE ALL ON FUNCTION sentinela_gestao.mutar(p jsonb, p_conta text, p_usuario uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_gestao.mutar(p jsonb, p_conta text, p_usuario uuid) TO sentinela_local_admin;

-- ACL sentinela_gestao_autorizacao.FUNCTION capacidade(p_usuario uuid, p_conta text)
REVOKE ALL ON FUNCTION sentinela_gestao_autorizacao.capacidade(p_usuario uuid, p_conta text) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_gestao_autorizacao.capacidade(p_usuario uuid, p_conta text) TO sentinela_gestao_owner;
GRANT ALL ON FUNCTION sentinela_gestao_autorizacao.capacidade(p_usuario uuid, p_conta text) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_gestao_autorizacao.capacidade(p_usuario uuid, p_conta text) TO sentinela_exclusao_owner;

-- ACL sentinela_gestao_autorizacao.FUNCTION consumir(p_lote uuid, p_usuario uuid, p_conta text, p_revisao text)
REVOKE ALL ON FUNCTION sentinela_gestao_autorizacao.consumir(p_lote uuid, p_usuario uuid, p_conta text, p_revisao text) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_gestao_autorizacao.consumir(p_lote uuid, p_usuario uuid, p_conta text, p_revisao text) TO sentinela_exclusao_owner;

-- ACL sentinela_gestao_autorizacao.FUNCTION emitir_jan2021(p_lote uuid, p_usuario uuid, p_conta text, p_revisao text, p_backup text)
REVOKE ALL ON FUNCTION sentinela_gestao_autorizacao.emitir_jan2021(p_lote uuid, p_usuario uuid, p_conta text, p_revisao text, p_backup text) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_gestao_autorizacao.emitir_jan2021(p_lote uuid, p_usuario uuid, p_conta text, p_revisao text, p_backup text) TO sentinela_exclusao_owner;

-- ACL sentinela_gestao_autorizacao.FUNCTION exigir(p_usuario uuid, p_conta text)
REVOKE ALL ON FUNCTION sentinela_gestao_autorizacao.exigir(p_usuario uuid, p_conta text) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_gestao_autorizacao.exigir(p_usuario uuid, p_conta text) TO sentinela_gestao_owner;
GRANT ALL ON FUNCTION sentinela_gestao_autorizacao.exigir(p_usuario uuid, p_conta text) TO sentinela_exclusao_owner;
GRANT ALL ON FUNCTION sentinela_gestao_autorizacao.exigir(p_usuario uuid, p_conta text) TO sentinela_pcdf_owner;
GRANT ALL ON FUNCTION sentinela_gestao_autorizacao.exigir(p_usuario uuid, p_conta text) TO sentinela_pcdf_historico_owner;

-- ACL sentinela_gestao_autorizacao.FUNCTION lote_aprovado(p_lote uuid, p_usuario uuid, p_revisao text)
REVOKE ALL ON FUNCTION sentinela_gestao_autorizacao.lote_aprovado(p_lote uuid, p_usuario uuid, p_revisao text) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_gestao_autorizacao.lote_aprovado(p_lote uuid, p_usuario uuid, p_revisao text) TO sentinela_exclusao_owner;

-- ACL sentinela_gestao_autorizacao.FUNCTION validade_jan2021(p_lote uuid, p_usuario uuid, p_revisao text)
REVOKE ALL ON FUNCTION sentinela_gestao_autorizacao.validade_jan2021(p_lote uuid, p_usuario uuid, p_revisao text) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_gestao_autorizacao.validade_jan2021(p_lote uuid, p_usuario uuid, p_revisao text) TO sentinela_exclusao_owner;

-- ACL sentinela_import_local.FUNCTION begin_request(actor_id uuid, request_id uuid, meta jsonb, content bytea, batch jsonb)
REVOKE ALL ON FUNCTION sentinela_import_local.begin_request(actor_id uuid, request_id uuid, meta jsonb, content bytea, batch jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_import_local.begin_request(actor_id uuid, request_id uuid, meta jsonb, content bytea, batch jsonb) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_import_local.begin_request(actor_id uuid, request_id uuid, meta jsonb, content bytea, batch jsonb) TO sentinela_local_operator;

-- ACL sentinela_import_local.FUNCTION check_actor(subject_id uuid, admin_only boolean)
REVOKE ALL ON FUNCTION sentinela_import_local.check_actor(subject_id uuid, admin_only boolean) FROM PUBLIC;

-- ACL sentinela_import_local.FUNCTION detail(run_id uuid, first_row integer)
REVOKE ALL ON FUNCTION sentinela_import_local.detail(run_id uuid, first_row integer) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_import_local.detail(run_id uuid, first_row integer) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_import_local.detail(run_id uuid, first_row integer) TO sentinela_local_operator;

-- ACL sentinela_import_local.FUNCTION fail(actor_id uuid, request_id uuid)
REVOKE ALL ON FUNCTION sentinela_import_local.fail(actor_id uuid, request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_import_local.fail(actor_id uuid, request_id uuid) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_import_local.fail(actor_id uuid, request_id uuid) TO sentinela_local_operator;

-- ACL sentinela_import_local.FUNCTION history()
REVOKE ALL ON FUNCTION sentinela_import_local.history() FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_import_local.history() TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_import_local.history() TO sentinela_local_operator;

-- ACL sentinela_import_local.FUNCTION receive(actor_id uuid, request_id uuid, batch jsonb)
REVOKE ALL ON FUNCTION sentinela_import_local.receive(actor_id uuid, request_id uuid, batch jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_import_local.receive(actor_id uuid, request_id uuid, batch jsonb) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_import_local.receive(actor_id uuid, request_id uuid, batch jsonb) TO sentinela_local_operator;

-- ACL sentinela_ocorrencias_local.FUNCTION detalhe(modo text, registro uuid)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_local.detalhe(modo text, registro uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_local.detalhe(modo text, registro uuid) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_ocorrencias_local.detalhe(modo text, registro uuid) TO sentinela_local_operator;
GRANT ALL ON FUNCTION sentinela_ocorrencias_local.detalhe(modo text, registro uuid) TO sentinela_local_analyst;

-- ACL sentinela_ocorrencias_local.FUNCTION identidade()
REVOKE ALL ON FUNCTION sentinela_ocorrencias_local.identidade() FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_local.identidade() TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_ocorrencias_local.identidade() TO sentinela_local_operator;
GRANT ALL ON FUNCTION sentinela_ocorrencias_local.identidade() TO sentinela_local_analyst;

-- ACL sentinela_ocorrencias_local.FUNCTION lista(modo text, filtros jsonb, pagina integer, ordenar text, direcao text)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_local.lista(modo text, filtros jsonb, pagina integer, ordenar text, direcao text) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_local.lista(modo text, filtros jsonb, pagina integer, ordenar text, direcao text) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_ocorrencias_local.lista(modo text, filtros jsonb, pagina integer, ordenar text, direcao text) TO sentinela_local_operator;
GRANT ALL ON FUNCTION sentinela_ocorrencias_local.lista(modo text, filtros jsonb, pagina integer, ordenar text, direcao text) TO sentinela_local_analyst;

-- ACL sentinela_ocorrencias_local.FUNCTION resumo()
REVOKE ALL ON FUNCTION sentinela_ocorrencias_local.resumo() FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_local.resumo() TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_ocorrencias_local.resumo() TO sentinela_local_operator;
GRANT ALL ON FUNCTION sentinela_ocorrencias_local.resumo() TO sentinela_local_analyst;

-- ACL sentinela_ocorrencias_manual.FUNCTION acoes(pagina jsonb)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.acoes(pagina jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.acoes(pagina jsonb) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.acoes(pagina jsonb) TO sentinela_local_operator;

-- ACL sentinela_ocorrencias_manual.FUNCTION autor(p_usuario uuid, p_conta text)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.autor(p_usuario uuid, p_conta text) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.autor(p_usuario uuid, p_conta text) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.autor(p_usuario uuid, p_conta text) TO sentinela_local_operator;

-- ACL sentinela_ocorrencias_manual.FUNCTION cadastrar(b jsonb, k uuid, a text)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.cadastrar(b jsonb, k uuid, a text) FROM PUBLIC;

-- ACL sentinela_ocorrencias_manual.FUNCTION cadastrar_completo(b jsonb, k uuid, a text, u uuid)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.cadastrar_completo(b jsonb, k uuid, a text, u uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.cadastrar_completo(b jsonb, k uuid, a text, u uuid) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.cadastrar_completo(b jsonb, k uuid, a text, u uuid) TO sentinela_local_operator;

-- ACL sentinela_ocorrencias_manual.FUNCTION catalogo()
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.catalogo() FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.catalogo() TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.catalogo() TO sentinela_local_operator;

-- ACL sentinela_ocorrencias_manual.FUNCTION catalogo(termo text)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.catalogo(termo text) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.catalogo(termo text) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.catalogo(termo text) TO sentinela_local_operator;

-- ACL sentinela_ocorrencias_manual.FUNCTION contexto(alvo uuid)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.contexto(alvo uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.contexto(alvo uuid) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.contexto(alvo uuid) TO sentinela_local_operator;

-- ACL sentinela_ocorrencias_manual.FUNCTION detalhe(registro uuid)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.detalhe(registro uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.detalhe(registro uuid) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.detalhe(registro uuid) TO sentinela_local_operator;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.detalhe(registro uuid) TO sentinela_local_analyst;

-- ACL sentinela_ocorrencias_manual.FUNCTION editar(p jsonb, p_conta text, p_usuario uuid)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.editar(p jsonb, p_conta text, p_usuario uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.editar(p jsonb, p_conta text, p_usuario uuid) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.editar(p jsonb, p_conta text, p_usuario uuid) TO sentinela_local_operator;

-- ACL sentinela_ocorrencias_manual.FUNCTION exigir_autor(p_usuario uuid, p_conta text)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.exigir_autor(p_usuario uuid, p_conta text) FROM PUBLIC;

-- ACL sentinela_ocorrencias_manual.FUNCTION limpar_crime(crime jsonb)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.limpar_crime(crime jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.limpar_crime(crime jsonb) TO sentinela_manual_writer;

-- ACL sentinela_ocorrencias_manual.FUNCTION lista(f jsonb, pagina integer, ordenar text, direcao text)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.lista(f jsonb, pagina integer, ordenar text, direcao text) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.lista(f jsonb, pagina integer, ordenar text, direcao text) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.lista(f jsonb, pagina integer, ordenar text, direcao text) TO sentinela_local_operator;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.lista(f jsonb, pagina integer, ordenar text, direcao text) TO sentinela_local_analyst;

-- ACL sentinela_ocorrencias_manual.FUNCTION naturezas_ativas(alvo uuid)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.naturezas_ativas(alvo uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.naturezas_ativas(alvo uuid) TO sentinela_manual_writer;

-- ACL sentinela_ocorrencias_manual.FUNCTION normalizar_catalogo(text)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.normalizar_catalogo(text) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.normalizar_catalogo(text) TO sentinela_manual_writer;

-- ACL sentinela_ocorrencias_manual.FUNCTION payload_valido(b jsonb, criacao boolean)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.payload_valido(b jsonb, criacao boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.payload_valido(b jsonb, criacao boolean) TO sentinela_manual_writer;

-- ACL sentinela_ocorrencias_manual.FUNCTION pendencias_publicacao(alvo uuid)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.pendencias_publicacao(alvo uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.pendencias_publicacao(alvo uuid) TO sentinela_manual_writer;

-- ACL sentinela_ocorrencias_manual.FUNCTION referencias_validas(b jsonb)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.referencias_validas(b jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.referencias_validas(b jsonb) TO sentinela_manual_writer;

-- ACL sentinela_ocorrencias_manual.FUNCTION transicionar(p jsonb, p_conta text, p_usuario uuid)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.transicionar(p jsonb, p_conta text, p_usuario uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.transicionar(p jsonb, p_conta text, p_usuario uuid) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_ocorrencias_manual.transicionar(p jsonb, p_conta text, p_usuario uuid) TO sentinela_local_operator;

-- ACL sentinela_ocorrencias_manual.FUNCTION validar_dados()
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.validar_dados() FROM PUBLIC;

-- ACL sentinela_ocorrencias_manual.FUNCTION validar_retirada()
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.validar_retirada() FROM PUBLIC;

-- ACL sentinela_ocorrencias_manual.FUNCTION verificar_evento(sentinela.ocorrencias, sentinela.ocorrencias)
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.verificar_evento(sentinela.ocorrencias, sentinela.ocorrencias) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_ocorrencias_manual.verificar_evento(sentinela.ocorrencias, sentinela.ocorrencias)
  TO sentinela_local_admin, sentinela_local_operator;

-- ACL sentinela_pcdf_historico.FUNCTION coverage()
REVOKE ALL ON FUNCTION sentinela_pcdf_historico.coverage() FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pcdf_historico.coverage() TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_pcdf_historico.coverage() TO sentinela_local_operator;
GRANT ALL ON FUNCTION sentinela_pcdf_historico.coverage() TO sentinela_local_analyst;

-- ACL sentinela_pcdf_historico.FUNCTION receive(p_request uuid, p_usuario uuid, p_conta text, p_batch jsonb, p_csv bytea)
REVOKE ALL ON FUNCTION sentinela_pcdf_historico.receive(p_request uuid, p_usuario uuid, p_conta text, p_batch jsonb, p_csv bytea) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pcdf_historico.receive(p_request uuid, p_usuario uuid, p_conta text, p_batch jsonb, p_csv bytea) TO sentinela_local_admin;

-- ACL sentinela_pcdf_historico.FUNCTION receive_staging(p_request uuid, p_usuario uuid, p_conta text, p_batch jsonb, p_csv bytea)
REVOKE ALL ON FUNCTION sentinela_pcdf_historico.receive_staging(p_request uuid, p_usuario uuid, p_conta text, p_batch jsonb, p_csv bytea) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pcdf_historico.receive_staging(p_request uuid, p_usuario uuid, p_conta text, p_batch jsonb, p_csv bytea) TO sentinela_pcdf_historico_owner;

-- ACL sentinela_pcdf_historico.FUNCTION status()
REVOKE ALL ON FUNCTION sentinela_pcdf_historico.status() FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pcdf_historico.status() TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_pcdf_historico.status() TO sentinela_local_operator;

-- ACL sentinela.TABLE usuarios
GRANT SELECT ON TABLE sentinela.usuarios TO sentinela_pcdf_owner;
GRANT SELECT ON TABLE sentinela.usuarios TO sentinela_gestao_owner;

-- ACL sentinela.COLUMN usuarios.id
GRANT SELECT(id) ON TABLE sentinela.usuarios TO sentinela_general_importer;
GRANT SELECT(id) ON TABLE sentinela.usuarios TO sentinela_gestao_autoridade;
GRANT SELECT(id) ON TABLE sentinela.usuarios TO sentinela_pcdf_historico_owner;
GRANT SELECT(id),INSERT(id) ON TABLE sentinela.usuarios TO sentinela_pessoas_owner;
GRANT SELECT(id) ON TABLE sentinela.usuarios TO sentinela_manual_writer;

-- ACL sentinela.COLUMN usuarios.auth_user_id
GRANT SELECT(auth_user_id) ON TABLE sentinela.usuarios TO sentinela_gestao_autoridade;
GRANT SELECT(auth_user_id),INSERT(auth_user_id) ON TABLE sentinela.usuarios TO sentinela_pessoas_owner;
GRANT SELECT(auth_user_id) ON TABLE sentinela.usuarios TO sentinela_manual_writer;

-- ACL sentinela.COLUMN usuarios.nome_exibicao
GRANT SELECT(nome_exibicao),INSERT(nome_exibicao),UPDATE(nome_exibicao) ON TABLE sentinela.usuarios TO sentinela_pessoas_owner;

-- ACL sentinela.COLUMN usuarios.perfil
GRANT SELECT(perfil) ON TABLE sentinela.usuarios TO sentinela_general_importer;
GRANT SELECT(perfil) ON TABLE sentinela.usuarios TO sentinela_gestao_autoridade;
GRANT SELECT(perfil) ON TABLE sentinela.usuarios TO sentinela_pcdf_historico_owner;
GRANT SELECT(perfil),INSERT(perfil) ON TABLE sentinela.usuarios TO sentinela_pessoas_owner;
GRANT SELECT(perfil) ON TABLE sentinela.usuarios TO sentinela_manual_writer;

-- ACL sentinela.COLUMN usuarios.ativo
GRANT SELECT(ativo) ON TABLE sentinela.usuarios TO sentinela_general_importer;
GRANT SELECT(ativo) ON TABLE sentinela.usuarios TO sentinela_gestao_autoridade;
GRANT SELECT(ativo) ON TABLE sentinela.usuarios TO sentinela_pcdf_historico_owner;
GRANT SELECT(ativo),INSERT(ativo),UPDATE(ativo) ON TABLE sentinela.usuarios TO sentinela_pessoas_owner;
GRANT SELECT(ativo) ON TABLE sentinela.usuarios TO sentinela_manual_writer;

-- ACL sentinela.COLUMN usuarios.criado_em
GRANT SELECT(criado_em) ON TABLE sentinela.usuarios TO sentinela_pessoas_owner;

-- ACL sentinela_pcdf_local.FUNCTION actor()
REVOKE ALL ON FUNCTION sentinela_pcdf_local.actor() FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pcdf_local.actor() TO sentinela_pcdf_owner;

-- ACL sentinela_pcdf_local.FUNCTION attempt(request uuid, account text, meta jsonb)
REVOKE ALL ON FUNCTION sentinela_pcdf_local.attempt(request uuid, account text, meta jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pcdf_local.attempt(request uuid, account text, meta jsonb) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_pcdf_local.attempt(request uuid, account text, meta jsonb) TO sentinela_local_operator;

-- ACL sentinela_pcdf_local.FUNCTION detail(run_id uuid, first_row integer)
REVOKE ALL ON FUNCTION sentinela_pcdf_local.detail(run_id uuid, first_row integer) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pcdf_local.detail(run_id uuid, first_row integer) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_pcdf_local.detail(run_id uuid, first_row integer) TO sentinela_local_operator;

-- ACL sentinela_pcdf_local.FUNCTION efetivos_csv_v1(raw jsonb, competencia date)
REVOKE ALL ON FUNCTION sentinela_pcdf_local.efetivos_csv_v1(raw jsonb, competencia date) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pcdf_local.efetivos_csv_v1(raw jsonb, competencia date) TO sentinela_pcdf_owner;

-- ACL sentinela_pcdf_local.FUNCTION fail(request uuid)
REVOKE ALL ON FUNCTION sentinela_pcdf_local.fail(request uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pcdf_local.fail(request uuid) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_pcdf_local.fail(request uuid) TO sentinela_local_operator;

-- ACL sentinela_pcdf_local.FUNCTION history()
REVOKE ALL ON FUNCTION sentinela_pcdf_local.history() FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pcdf_local.history() TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_pcdf_local.history() TO sentinela_local_operator;

-- ACL sentinela_pcdf_local.FUNCTION preflight()
REVOKE ALL ON FUNCTION sentinela_pcdf_local.preflight() FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pcdf_local.preflight() TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_pcdf_local.preflight() TO sentinela_local_operator;

-- ACL sentinela_pcdf_local.FUNCTION receive(request uuid, delivery jsonb, content bytea, manifest_bytes bytea)
REVOKE ALL ON FUNCTION sentinela_pcdf_local.receive(request uuid, delivery jsonb, content bytea, manifest_bytes bytea) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pcdf_local.receive(request uuid, delivery jsonb, content bytea, manifest_bytes bytea) TO sentinela_local_admin;
GRANT ALL ON FUNCTION sentinela_pcdf_local.receive(request uuid, delivery jsonb, content bytea, manifest_bytes bytea) TO sentinela_local_operator;

-- ACL sentinela_pcdf_local.FUNCTION receive_csv(p_request uuid, p_usuario uuid, p_conta text, p_batch jsonb, p_csv bytea)
REVOKE ALL ON FUNCTION sentinela_pcdf_local.receive_csv(p_request uuid, p_usuario uuid, p_conta text, p_batch jsonb, p_csv bytea) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pcdf_local.receive_csv(p_request uuid, p_usuario uuid, p_conta text, p_batch jsonb, p_csv bytea) TO sentinela_local_admin;

-- ACL sentinela_pcdf_revisao.FUNCTION decimal_geo(valor text, limite integer)
REVOKE ALL ON FUNCTION sentinela_pcdf_revisao.decimal_geo(valor text, limite integer) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pcdf_revisao.decimal_geo(valor text, limite integer) TO sentinela_pcdf_owner;
GRANT ALL ON FUNCTION sentinela_pcdf_revisao.decimal_geo(valor text, limite integer) TO sentinela_ocorrencias_reader;

-- ACL sentinela_pcdf_revisao.FUNCTION estado_geo(lat text, lon text)
REVOKE ALL ON FUNCTION sentinela_pcdf_revisao.estado_geo(lat text, lon text) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pcdf_revisao.estado_geo(lat text, lon text) TO sentinela_pcdf_owner;
GRANT ALL ON FUNCTION sentinela_pcdf_revisao.estado_geo(lat text, lon text) TO sentinela_ocorrencias_reader;

-- ACL sentinela_pcdf_revisao.FUNCTION informado(valor text)
REVOKE ALL ON FUNCTION sentinela_pcdf_revisao.informado(valor text) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pcdf_revisao.informado(valor text) TO sentinela_pcdf_owner;
GRANT ALL ON FUNCTION sentinela_pcdf_revisao.informado(valor text) TO sentinela_ocorrencias_reader;
GRANT ALL ON FUNCTION sentinela_pcdf_revisao.informado(valor text) TO sentinela_pcdf_historico_owner;

-- ACL sentinela_pcdf_revisao.FUNCTION motivo(campo text, regra text, tipo text, status text, motivo text, raw jsonb)
REVOKE ALL ON FUNCTION sentinela_pcdf_revisao.motivo(campo text, regra text, tipo text, status text, motivo text, raw jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pcdf_revisao.motivo(campo text, regra text, tipo text, status text, motivo text, raw jsonb) TO sentinela_ocorrencias_reader;

-- ACL sentinela_pcdf_revisao.FUNCTION ponto_geo(lat text, lon text, srid integer, evidencia text, limite extensions.geometry)
REVOKE ALL ON FUNCTION sentinela_pcdf_revisao.ponto_geo(lat text, lon text, srid integer, evidencia text, limite extensions.geometry) FROM PUBLIC;

-- ACL sentinela_pessoas.FUNCTION autorizar(actor uuid, identidade uuid)
REVOKE ALL ON FUNCTION sentinela_pessoas.autorizar(actor uuid, identidade uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pessoas.autorizar(actor uuid, identidade uuid) TO sentinela_pessoas_owner;

-- ACL sentinela_pessoas.FUNCTION criar(actor uuid, identidade uuid, alvo uuid, nome text, email text, perfil text, unidade text)
REVOKE ALL ON FUNCTION sentinela_pessoas.criar(actor uuid, identidade uuid, alvo uuid, nome text, email text, perfil text, unidade text) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pessoas.criar(actor uuid, identidade uuid, alvo uuid, nome text, email text, perfil text, unidade text) TO sentinela_local_admin;

-- ACL sentinela_pessoas.FUNCTION editar(actor uuid, identidade uuid, alvo uuid, versao text, nome text, contato text, unidade text)
REVOKE ALL ON FUNCTION sentinela_pessoas.editar(actor uuid, identidade uuid, alvo uuid, versao text, nome text, contato text, unidade text) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pessoas.editar(actor uuid, identidade uuid, alvo uuid, versao text, nome text, contato text, unidade text) TO sentinela_local_admin;

-- ACL sentinela_pessoas.FUNCTION excluir(actor uuid, identidade uuid, alvo uuid, email text, etapa text)
REVOKE ALL ON FUNCTION sentinela_pessoas.excluir(actor uuid, identidade uuid, alvo uuid, email text, etapa text) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pessoas.excluir(actor uuid, identidade uuid, alvo uuid, email text, etapa text) TO sentinela_local_admin;

-- ACL sentinela_pessoas.FUNCTION listar(actor uuid, identidade uuid)
REVOKE ALL ON FUNCTION sentinela_pessoas.listar(actor uuid, identidade uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pessoas.listar(actor uuid, identidade uuid) TO sentinela_local_admin;

-- ACL sentinela_pessoas.FUNCTION registros(alvo uuid)
REVOKE ALL ON FUNCTION sentinela_pessoas.registros(alvo uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION sentinela_pessoas.registros(alvo uuid) TO sentinela_pessoas_owner;

-- ACL sentinela.COLUMN categorias_criminais.id
GRANT SELECT(id) ON TABLE sentinela.categorias_criminais TO sentinela_ocorrencias_reader;
GRANT SELECT(id) ON TABLE sentinela.categorias_criminais TO sentinela_pcdf_historico_owner;
GRANT SELECT(id) ON TABLE sentinela.categorias_criminais TO sentinela_manual_writer;

-- ACL sentinela.COLUMN categorias_criminais.nome
GRANT SELECT(nome) ON TABLE sentinela.categorias_criminais TO sentinela_ocorrencias_reader;

-- ACL sentinela.COLUMN categorias_criminais.status
GRANT SELECT(status) ON TABLE sentinela.categorias_criminais TO sentinela_ocorrencias_reader;
GRANT SELECT(status) ON TABLE sentinela.categorias_criminais TO sentinela_pcdf_historico_owner;
GRANT SELECT(status) ON TABLE sentinela.categorias_criminais TO sentinela_manual_writer;

-- ACL sentinela.TABLE eventos_auditoria
GRANT SELECT,INSERT ON TABLE sentinela.eventos_auditoria TO sentinela_pcdf_owner;
GRANT INSERT ON TABLE sentinela.eventos_auditoria TO sentinela_general_importer;
GRANT SELECT ON TABLE sentinela.eventos_auditoria TO sentinela_gestao_owner;
GRANT SELECT,DELETE ON TABLE sentinela.eventos_auditoria TO sentinela_exclusao_owner;
GRANT SELECT,INSERT ON TABLE sentinela.eventos_auditoria TO sentinela_pcdf_historico_owner;
GRANT INSERT ON TABLE sentinela.eventos_auditoria TO sentinela_pessoas_owner;

-- ACL sentinela.COLUMN eventos_auditoria.id
GRANT INSERT(id) ON TABLE sentinela.eventos_auditoria TO sentinela_gestao_owner;
GRANT SELECT(id) ON TABLE sentinela.eventos_auditoria TO sentinela_ocorrencias_reader;
GRANT SELECT(id),INSERT(id) ON TABLE sentinela.eventos_auditoria TO sentinela_manual_writer;

-- ACL sentinela.COLUMN eventos_auditoria.ator_tipo
GRANT INSERT(ator_tipo) ON TABLE sentinela.eventos_auditoria TO sentinela_gestao_owner;
GRANT SELECT(ator_tipo) ON TABLE sentinela.eventos_auditoria TO sentinela_ocorrencias_reader;
GRANT SELECT(ator_tipo),INSERT(ator_tipo) ON TABLE sentinela.eventos_auditoria TO sentinela_manual_writer;

-- ACL sentinela.COLUMN eventos_auditoria.usuario_id
GRANT INSERT(usuario_id) ON TABLE sentinela.eventos_auditoria TO sentinela_gestao_owner;
GRANT SELECT(usuario_id),INSERT(usuario_id) ON TABLE sentinela.eventos_auditoria TO sentinela_manual_writer;

-- ACL sentinela.COLUMN eventos_auditoria.servico
GRANT SELECT(servico) ON TABLE sentinela.eventos_auditoria TO sentinela_ocorrencias_reader;
GRANT INSERT(servico) ON TABLE sentinela.eventos_auditoria TO sentinela_manual_writer;

-- ACL sentinela.COLUMN eventos_auditoria.acao
GRANT INSERT(acao) ON TABLE sentinela.eventos_auditoria TO sentinela_gestao_owner;
GRANT SELECT(acao) ON TABLE sentinela.eventos_auditoria TO sentinela_ocorrencias_reader;
GRANT SELECT(acao) ON TABLE sentinela.eventos_auditoria TO sentinela_pessoas_owner;
GRANT SELECT(acao),INSERT(acao) ON TABLE sentinela.eventos_auditoria TO sentinela_manual_writer;

-- ACL sentinela.COLUMN eventos_auditoria.ocorrencia_id
GRANT INSERT(ocorrencia_id) ON TABLE sentinela.eventos_auditoria TO sentinela_gestao_owner;
GRANT SELECT(ocorrencia_id),INSERT(ocorrencia_id) ON TABLE sentinela.eventos_auditoria TO sentinela_manual_writer;

-- ACL sentinela.COLUMN eventos_auditoria.linha_origem_id
GRANT INSERT(linha_origem_id) ON TABLE sentinela.eventos_auditoria TO sentinela_gestao_owner;

-- ACL sentinela.COLUMN eventos_auditoria.execucao_id
GRANT INSERT(execucao_id) ON TABLE sentinela.eventos_auditoria TO sentinela_gestao_owner;

-- ACL sentinela.COLUMN eventos_auditoria.antes
GRANT INSERT(antes) ON TABLE sentinela.eventos_auditoria TO sentinela_gestao_owner;
GRANT SELECT(antes),INSERT(antes) ON TABLE sentinela.eventos_auditoria TO sentinela_manual_writer;

-- ACL sentinela.COLUMN eventos_auditoria.depois
GRANT INSERT(depois) ON TABLE sentinela.eventos_auditoria TO sentinela_gestao_owner;
GRANT SELECT(depois) ON TABLE sentinela.eventos_auditoria TO sentinela_ocorrencias_reader;
GRANT SELECT(depois) ON TABLE sentinela.eventos_auditoria TO sentinela_pessoas_owner;
GRANT SELECT(depois),INSERT(depois) ON TABLE sentinela.eventos_auditoria TO sentinela_manual_writer;

-- ACL sentinela.COLUMN eventos_auditoria.justificativa
GRANT INSERT(justificativa) ON TABLE sentinela.eventos_auditoria TO sentinela_gestao_owner;
GRANT SELECT(justificativa),INSERT(justificativa) ON TABLE sentinela.eventos_auditoria TO sentinela_manual_writer;

-- ACL sentinela.COLUMN eventos_auditoria.request_id
GRANT INSERT(request_id) ON TABLE sentinela.eventos_auditoria TO sentinela_gestao_owner;
GRANT INSERT(request_id) ON TABLE sentinela.eventos_auditoria TO sentinela_manual_writer;

-- ACL sentinela.COLUMN eventos_auditoria.registrado_em
GRANT SELECT(registrado_em) ON TABLE sentinela.eventos_auditoria TO sentinela_ocorrencias_reader;
GRANT SELECT(registrado_em) ON TABLE sentinela.eventos_auditoria TO sentinela_pessoas_owner;
GRANT SELECT(registrado_em) ON TABLE sentinela.eventos_auditoria TO sentinela_manual_writer;

-- ACL sentinela.COLUMN eventos_auditoria.transacao_id
GRANT SELECT(transacao_id) ON TABLE sentinela.eventos_auditoria TO sentinela_manual_writer;

-- ACL sentinela.TABLE execucoes_importacao
GRANT SELECT,INSERT ON TABLE sentinela.execucoes_importacao TO sentinela_pcdf_owner;
GRANT SELECT,INSERT ON TABLE sentinela.execucoes_importacao TO sentinela_general_importer;
GRANT SELECT ON TABLE sentinela.execucoes_importacao TO sentinela_ocorrencias_reader;
GRANT SELECT ON TABLE sentinela.execucoes_importacao TO sentinela_gestao_owner;
GRANT SELECT,DELETE ON TABLE sentinela.execucoes_importacao TO sentinela_exclusao_owner;
GRANT SELECT ON TABLE sentinela.execucoes_importacao TO sentinela_pcdf_historico_owner;

-- ACL sentinela.COLUMN execucoes_importacao.id
GRANT SELECT(id) ON TABLE sentinela.execucoes_importacao TO sentinela_manual_writer;

-- ACL sentinela.COLUMN execucoes_importacao.extracao_id
GRANT SELECT(extracao_id) ON TABLE sentinela.execucoes_importacao TO sentinela_manual_writer;

-- ACL sentinela.TABLE extracoes_origem
GRANT SELECT,INSERT ON TABLE sentinela.extracoes_origem TO sentinela_pcdf_owner;
GRANT SELECT,INSERT ON TABLE sentinela.extracoes_origem TO sentinela_general_importer;
GRANT SELECT ON TABLE sentinela.extracoes_origem TO sentinela_ocorrencias_reader;
GRANT SELECT ON TABLE sentinela.extracoes_origem TO sentinela_gestao_owner;
GRANT SELECT,DELETE ON TABLE sentinela.extracoes_origem TO sentinela_exclusao_owner;
GRANT SELECT ON TABLE sentinela.extracoes_origem TO sentinela_pcdf_historico_owner;

-- ACL sentinela.COLUMN extracoes_origem.id
GRANT SELECT(id) ON TABLE sentinela.extracoes_origem TO sentinela_manual_writer;

-- ACL sentinela.COLUMN extracoes_origem.fonte
GRANT SELECT(fonte) ON TABLE sentinela.extracoes_origem TO sentinela_manual_writer;

-- ACL sentinela.TABLE historico_correcoes
GRANT SELECT,DELETE ON TABLE sentinela.historico_correcoes TO sentinela_exclusao_owner;

-- ACL sentinela.TABLE linhas_origem
GRANT SELECT,INSERT ON TABLE sentinela.linhas_origem TO sentinela_pcdf_owner;
GRANT SELECT,INSERT ON TABLE sentinela.linhas_origem TO sentinela_general_importer;
GRANT SELECT ON TABLE sentinela.linhas_origem TO sentinela_ocorrencias_reader;
GRANT SELECT ON TABLE sentinela.linhas_origem TO sentinela_gestao_owner;
GRANT SELECT,DELETE ON TABLE sentinela.linhas_origem TO sentinela_exclusao_owner;
GRANT SELECT ON TABLE sentinela.linhas_origem TO sentinela_pcdf_historico_owner;

-- ACL sentinela.COLUMN linhas_origem.id
GRANT SELECT(id) ON TABLE sentinela.linhas_origem TO sentinela_manual_writer;

-- ACL sentinela.COLUMN linhas_origem.extracao_id
GRANT SELECT(extracao_id) ON TABLE sentinela.linhas_origem TO sentinela_manual_writer;

-- ACL sentinela.COLUMN linhas_origem.natureza_original
GRANT SELECT(natureza_original) ON TABLE sentinela.linhas_origem TO sentinela_manual_writer;

-- ACL sentinela.TABLE linhas_staging
GRANT SELECT,INSERT ON TABLE sentinela.linhas_staging TO sentinela_pcdf_owner;
GRANT SELECT,INSERT ON TABLE sentinela.linhas_staging TO sentinela_general_importer;
GRANT SELECT ON TABLE sentinela.linhas_staging TO sentinela_ocorrencias_reader;
GRANT SELECT ON TABLE sentinela.linhas_staging TO sentinela_gestao_owner;
GRANT SELECT,DELETE ON TABLE sentinela.linhas_staging TO sentinela_exclusao_owner;
GRANT SELECT ON TABLE sentinela.linhas_staging TO sentinela_pcdf_historico_owner;

-- ACL sentinela.TABLE lotes_importacao
GRANT SELECT,INSERT ON TABLE sentinela.lotes_importacao TO sentinela_pcdf_owner;
GRANT SELECT,INSERT ON TABLE sentinela.lotes_importacao TO sentinela_general_importer;
GRANT SELECT ON TABLE sentinela.lotes_importacao TO sentinela_ocorrencias_reader;
GRANT SELECT ON TABLE sentinela.lotes_importacao TO sentinela_gestao_owner;
GRANT SELECT,DELETE ON TABLE sentinela.lotes_importacao TO sentinela_exclusao_owner;
GRANT SELECT ON TABLE sentinela.lotes_importacao TO sentinela_pcdf_historico_owner;

-- ACL sentinela.COLUMN mapeamentos_natureza.id
GRANT SELECT(id) ON TABLE sentinela.mapeamentos_natureza TO sentinela_ocorrencias_reader;
GRANT SELECT(id) ON TABLE sentinela.mapeamentos_natureza TO sentinela_pcdf_historico_owner;
GRANT SELECT(id) ON TABLE sentinela.mapeamentos_natureza TO sentinela_manual_writer;

-- ACL sentinela.COLUMN mapeamentos_natureza.natureza_id
GRANT SELECT(natureza_id) ON TABLE sentinela.mapeamentos_natureza TO sentinela_ocorrencias_reader;
GRANT SELECT(natureza_id) ON TABLE sentinela.mapeamentos_natureza TO sentinela_pcdf_historico_owner;
GRANT SELECT(natureza_id) ON TABLE sentinela.mapeamentos_natureza TO sentinela_manual_writer;

-- ACL sentinela.COLUMN mapeamentos_natureza.crime_tentado
GRANT SELECT(crime_tentado) ON TABLE sentinela.mapeamentos_natureza TO sentinela_pcdf_historico_owner;
GRANT SELECT(crime_tentado) ON TABLE sentinela.mapeamentos_natureza TO sentinela_manual_writer;

-- ACL sentinela.COLUMN mapeamentos_natureza.categoria_id
GRANT SELECT(categoria_id) ON TABLE sentinela.mapeamentos_natureza TO sentinela_ocorrencias_reader;
GRANT SELECT(categoria_id) ON TABLE sentinela.mapeamentos_natureza TO sentinela_pcdf_historico_owner;
GRANT SELECT(categoria_id) ON TABLE sentinela.mapeamentos_natureza TO sentinela_manual_writer;

-- ACL sentinela.COLUMN mapeamentos_natureza.status
GRANT SELECT(status) ON TABLE sentinela.mapeamentos_natureza TO sentinela_ocorrencias_reader;
GRANT SELECT(status) ON TABLE sentinela.mapeamentos_natureza TO sentinela_pcdf_historico_owner;
GRANT SELECT(status) ON TABLE sentinela.mapeamentos_natureza TO sentinela_manual_writer;

-- ACL sentinela.TABLE naturezas_criminais
GRANT SELECT ON TABLE sentinela.naturezas_criminais TO sentinela_ocorrencias_reader;
GRANT SELECT ON TABLE sentinela.naturezas_criminais TO sentinela_pcdf_historico_owner;

-- ACL sentinela.COLUMN naturezas_criminais.id
GRANT SELECT(id) ON TABLE sentinela.naturezas_criminais TO sentinela_manual_reader;
GRANT SELECT(id) ON TABLE sentinela.naturezas_criminais TO sentinela_manual_writer;

-- ACL sentinela.COLUMN naturezas_criminais.fonte
GRANT SELECT(fonte) ON TABLE sentinela.naturezas_criminais TO sentinela_manual_writer;

-- ACL sentinela.COLUMN naturezas_criminais.descricao_original
GRANT SELECT(descricao_original) ON TABLE sentinela.naturezas_criminais TO sentinela_manual_reader;
GRANT SELECT(descricao_original) ON TABLE sentinela.naturezas_criminais TO sentinela_manual_writer;

-- ACL sentinela.COLUMN naturezas_criminais.categoria_pcdf_original
GRANT SELECT(categoria_pcdf_original) ON TABLE sentinela.naturezas_criminais TO sentinela_manual_writer;

-- ACL sentinela.COLUMN naturezas_criminais.codigo_manual
GRANT SELECT(codigo_manual) ON TABLE sentinela.naturezas_criminais TO sentinela_manual_writer;

-- ACL sentinela.COLUMN naturezas_criminais.referencia_catalogo_manual
GRANT SELECT(referencia_catalogo_manual) ON TABLE sentinela.naturezas_criminais TO sentinela_manual_writer;

-- ACL sentinela.TABLE ocorrencia_naturezas
GRANT SELECT ON TABLE sentinela.ocorrencia_naturezas TO sentinela_ocorrencias_reader;
GRANT SELECT ON TABLE sentinela.ocorrencia_naturezas TO sentinela_gestao_owner;
GRANT SELECT,INSERT ON TABLE sentinela.ocorrencia_naturezas TO sentinela_pcdf_historico_owner;

-- ACL sentinela.COLUMN ocorrencia_naturezas.id
GRANT SELECT(id) ON TABLE sentinela.ocorrencia_naturezas TO sentinela_exclusao_owner;
GRANT SELECT(id) ON TABLE sentinela.ocorrencia_naturezas TO sentinela_manual_reader;
GRANT SELECT(id) ON TABLE sentinela.ocorrencia_naturezas TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencia_naturezas.ocorrencia_id
GRANT SELECT(ocorrencia_id) ON TABLE sentinela.ocorrencia_naturezas TO sentinela_exclusao_owner;
GRANT SELECT(ocorrencia_id) ON TABLE sentinela.ocorrencia_naturezas TO sentinela_manual_reader;
GRANT SELECT(ocorrencia_id),INSERT(ocorrencia_id) ON TABLE sentinela.ocorrencia_naturezas TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencia_naturezas.natureza_id
GRANT SELECT(natureza_id) ON TABLE sentinela.ocorrencia_naturezas TO sentinela_manual_reader;
GRANT SELECT(natureza_id),INSERT(natureza_id) ON TABLE sentinela.ocorrencia_naturezas TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencia_naturezas.origem
GRANT SELECT(origem),INSERT(origem) ON TABLE sentinela.ocorrencia_naturezas TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencia_naturezas.linha_origem_id
GRANT SELECT(linha_origem_id) ON TABLE sentinela.ocorrencia_naturezas TO sentinela_exclusao_owner;
GRANT SELECT(linha_origem_id) ON TABLE sentinela.ocorrencia_naturezas TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencia_naturezas.crime_tentado
GRANT SELECT(crime_tentado) ON TABLE sentinela.ocorrencia_naturezas TO sentinela_manual_reader;
GRANT SELECT(crime_tentado),INSERT(crime_tentado) ON TABLE sentinela.ocorrencia_naturezas TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencia_naturezas.classificacao_status
GRANT SELECT(classificacao_status) ON TABLE sentinela.ocorrencia_naturezas TO sentinela_manual_reader;
GRANT SELECT(classificacao_status),INSERT(classificacao_status) ON TABLE sentinela.ocorrencia_naturezas TO sentinela_manual_writer;

-- ACL sentinela.TABLE ocorrencias
GRANT SELECT ON TABLE sentinela.ocorrencias TO sentinela_ocorrencias_reader;
GRANT SELECT ON TABLE sentinela.ocorrencias TO sentinela_gestao_owner;
GRANT SELECT,INSERT ON TABLE sentinela.ocorrencias TO sentinela_pcdf_historico_owner;
GRANT SELECT ON TABLE sentinela.ocorrencias TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencias.id
GRANT SELECT(id) ON TABLE sentinela.ocorrencias TO sentinela_manual_reader;
GRANT SELECT(id),INSERT(id) ON TABLE sentinela.ocorrencias TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencias.origem
GRANT SELECT(origem) ON TABLE sentinela.ocorrencias TO sentinela_manual_reader;
GRANT SELECT(origem),INSERT(origem) ON TABLE sentinela.ocorrencias TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencias.fonte
GRANT SELECT(fonte) ON TABLE sentinela.ocorrencias TO sentinela_manual_reader;
GRANT SELECT(fonte),INSERT(fonte) ON TABLE sentinela.ocorrencias TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencias.versao_identidade
GRANT SELECT(versao_identidade),INSERT(versao_identidade) ON TABLE sentinela.ocorrencias TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencias.identidade_status
GRANT INSERT(identidade_status) ON TABLE sentinela.ocorrencias TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencias.data_fato
GRANT SELECT(data_fato) ON TABLE sentinela.ocorrencias TO sentinela_manual_reader;
GRANT INSERT(data_fato),UPDATE(data_fato) ON TABLE sentinela.ocorrencias TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencias.horario_fato
GRANT SELECT(horario_fato) ON TABLE sentinela.ocorrencias TO sentinela_manual_reader;
GRANT INSERT(horario_fato),UPDATE(horario_fato) ON TABLE sentinela.ocorrencias TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencias.ra_id
GRANT SELECT(ra_id) ON TABLE sentinela.ocorrencias TO sentinela_manual_reader;
GRANT INSERT(ra_id),UPDATE(ra_id) ON TABLE sentinela.ocorrencias TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencias.local
GRANT SELECT(local) ON TABLE sentinela.ocorrencias TO sentinela_manual_reader;
GRANT INSERT(local),UPDATE(local) ON TABLE sentinela.ocorrencias TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencias.unidade_apuracao
GRANT SELECT(unidade_apuracao) ON TABLE sentinela.ocorrencias TO sentinela_manual_reader;

-- ACL sentinela.COLUMN ocorrencias.latitude
GRANT SELECT(latitude) ON TABLE sentinela.ocorrencias TO sentinela_manual_reader;
GRANT INSERT(latitude),UPDATE(latitude) ON TABLE sentinela.ocorrencias TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencias.longitude
GRANT SELECT(longitude) ON TABLE sentinela.ocorrencias TO sentinela_manual_reader;
GRANT INSERT(longitude),UPDATE(longitude) ON TABLE sentinela.ocorrencias TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencias.localizacao_status
GRANT SELECT(localizacao_status) ON TABLE sentinela.ocorrencias TO sentinela_manual_reader;
GRANT INSERT(localizacao_status) ON TABLE sentinela.ocorrencias TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencias.referencia_espacial_confirmada
GRANT INSERT(referencia_espacial_confirmada) ON TABLE sentinela.ocorrencias TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencias.regra_transformacao
GRANT INSERT(regra_transformacao) ON TABLE sentinela.ocorrencias TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencias.geometria
GRANT INSERT(geometria),UPDATE(geometria) ON TABLE sentinela.ocorrencias TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencias.consolidacao_status
GRANT SELECT(consolidacao_status) ON TABLE sentinela.ocorrencias TO sentinela_manual_reader;
GRANT INSERT(consolidacao_status),UPDATE(consolidacao_status) ON TABLE sentinela.ocorrencias TO sentinela_manual_writer;

-- ACL sentinela.COLUMN ocorrencias.ativo
GRANT UPDATE(ativo) ON TABLE sentinela.ocorrencias TO sentinela_manual_writer;

-- ACL sentinela.TABLE pendencias_revisao
GRANT SELECT,INSERT ON TABLE sentinela.pendencias_revisao TO sentinela_pcdf_owner;
GRANT SELECT,INSERT ON TABLE sentinela.pendencias_revisao TO sentinela_general_importer;
GRANT SELECT ON TABLE sentinela.pendencias_revisao TO sentinela_ocorrencias_reader;
GRANT SELECT ON TABLE sentinela.pendencias_revisao TO sentinela_gestao_owner;
GRANT SELECT,DELETE ON TABLE sentinela.pendencias_revisao TO sentinela_exclusao_owner;
GRANT INSERT ON TABLE sentinela.pendencias_revisao TO sentinela_pcdf_historico_owner;

-- ACL sentinela.COLUMN pendencias_revisao.id
GRANT SELECT(id) ON TABLE sentinela.pendencias_revisao TO sentinela_manual_writer;

-- ACL sentinela.COLUMN pendencias_revisao.ocorrencia_id
GRANT SELECT(ocorrencia_id) ON TABLE sentinela.pendencias_revisao TO sentinela_manual_writer;

-- ACL sentinela.COLUMN pendencias_revisao.status
GRANT SELECT(status) ON TABLE sentinela.pendencias_revisao TO sentinela_manual_writer;

-- ACL sentinela.TABLE perfil_permissoes
GRANT SELECT ON TABLE sentinela.perfil_permissoes TO sentinela_pcdf_owner;
GRANT SELECT ON TABLE sentinela.perfil_permissoes TO sentinela_pessoas_owner;

-- ACL sentinela.TABLE regioes_administrativas
GRANT SELECT ON TABLE sentinela.regioes_administrativas TO sentinela_ocorrencias_reader;
GRANT SELECT ON TABLE sentinela.regioes_administrativas TO sentinela_gestao_owner;

-- ACL sentinela.COLUMN regioes_administrativas.id
GRANT SELECT(id) ON TABLE sentinela.regioes_administrativas TO sentinela_manual_reader;
GRANT SELECT(id) ON TABLE sentinela.regioes_administrativas TO sentinela_manual_writer;

-- ACL sentinela.COLUMN regioes_administrativas.codigo_interno
GRANT SELECT(codigo_interno) ON TABLE sentinela.regioes_administrativas TO sentinela_manual_writer;

-- ACL sentinela.COLUMN regioes_administrativas.codigo_oficial
GRANT SELECT(codigo_oficial) ON TABLE sentinela.regioes_administrativas TO sentinela_manual_writer;

-- ACL sentinela.COLUMN regioes_administrativas.nome
GRANT SELECT(nome) ON TABLE sentinela.regioes_administrativas TO sentinela_manual_reader;
GRANT SELECT(nome) ON TABLE sentinela.regioes_administrativas TO sentinela_manual_writer;

-- ACL sentinela.COLUMN regioes_administrativas.versao_catalogo
GRANT SELECT(versao_catalogo) ON TABLE sentinela.regioes_administrativas TO sentinela_manual_writer;

-- ACL sentinela.COLUMN regioes_administrativas.vigencia
GRANT SELECT(vigencia) ON TABLE sentinela.regioes_administrativas TO sentinela_manual_writer;

-- ACL sentinela.COLUMN regioes_administrativas.versao_cartografia
GRANT SELECT(versao_cartografia) ON TABLE sentinela.regioes_administrativas TO sentinela_manual_writer;

-- ACL sentinela.COLUMN regioes_administrativas.limite
GRANT SELECT(limite) ON TABLE sentinela.regioes_administrativas TO sentinela_manual_writer;

-- ACL sentinela.COLUMN regioes_administrativas.referencia_cartografica
GRANT SELECT(referencia_cartografica) ON TABLE sentinela.regioes_administrativas TO sentinela_manual_writer;

-- ACL sentinela_general_accounts.TABLE individuals
GRANT SELECT ON TABLE sentinela_general_accounts.individuals TO sentinela_general_importer;

-- ACL sentinela_import_local.TABLE requests
GRANT SELECT,INSERT ON TABLE sentinela_import_local.requests TO sentinela_general_importer;
GRANT SELECT,DELETE ON TABLE sentinela_import_local.requests TO sentinela_exclusao_owner;

-- ACL sentinela_import_local.COLUMN requests.status
GRANT UPDATE(status) ON TABLE sentinela_import_local.requests TO sentinela_general_importer;

-- ACL sentinela_import_local.COLUMN requests.receipt
GRANT UPDATE(receipt) ON TABLE sentinela_import_local.requests TO sentinela_general_importer;

-- ACL sentinela_ocorrencias_analytics.TABLE categorias_criminais
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.categorias_criminais TO sentinela_local_admin;
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.categorias_criminais TO sentinela_local_operator;
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.categorias_criminais TO sentinela_local_analyst;

-- ACL sentinela_ocorrencias_analytics.TABLE ocorrencia_naturezas
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.ocorrencia_naturezas TO sentinela_local_admin;
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.ocorrencia_naturezas TO sentinela_local_operator;
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.ocorrencia_naturezas TO sentinela_local_analyst;

-- ACL sentinela_ocorrencias_analytics.TABLE mapeamentos_natureza
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.mapeamentos_natureza TO sentinela_local_admin;
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.mapeamentos_natureza TO sentinela_local_operator;
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.mapeamentos_natureza TO sentinela_local_analyst;

-- ACL sentinela_ocorrencias_analytics.TABLE naturezas_criminais
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.naturezas_criminais TO sentinela_local_admin;
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.naturezas_criminais TO sentinela_local_operator;
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.naturezas_criminais TO sentinela_local_analyst;

-- ACL sentinela_ocorrencias_analytics.TABLE ocorrencias
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.ocorrencias TO sentinela_local_admin;
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.ocorrencias TO sentinela_local_operator;
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.ocorrencias TO sentinela_local_analyst;

-- ACL sentinela_ocorrencias_analytics.TABLE pcdf_pontos
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.pcdf_pontos TO sentinela_ocorrencias_reader;

-- ACL sentinela_ocorrencias_analytics.TABLE pontos_confirmados
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.pontos_confirmados TO sentinela_local_admin;
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.pontos_confirmados TO sentinela_local_operator;
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.pontos_confirmados TO sentinela_local_analyst;

-- ACL sentinela_ocorrencias_analytics.TABLE regioes_administrativas
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.regioes_administrativas TO sentinela_local_admin;
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.regioes_administrativas TO sentinela_local_operator;
GRANT SELECT ON TABLE sentinela_ocorrencias_analytics.regioes_administrativas TO sentinela_local_analyst;

-- ACL sentinela_ocorrencias_manual.TABLE cadastros
GRANT SELECT,INSERT ON TABLE sentinela_ocorrencias_manual.cadastros TO sentinela_manual_writer;

-- ACL sentinela_ocorrencias_manual.COLUMN cadastros.ocorrencia_id
GRANT SELECT(ocorrencia_id) ON TABLE sentinela_ocorrencias_manual.cadastros TO sentinela_manual_reader;

-- ACL sentinela_ocorrencias_manual.COLUMN cadastros.endereco
GRANT SELECT(endereco) ON TABLE sentinela_ocorrencias_manual.cadastros TO sentinela_manual_reader;
GRANT UPDATE(endereco) ON TABLE sentinela_ocorrencias_manual.cadastros TO sentinela_manual_writer;

-- ACL sentinela_ocorrencias_manual.COLUMN cadastros.dados_crime
GRANT SELECT(dados_crime) ON TABLE sentinela_ocorrencias_manual.cadastros TO sentinela_manual_reader;
GRANT UPDATE(dados_crime) ON TABLE sentinela_ocorrencias_manual.cadastros TO sentinela_manual_writer;

-- ACL sentinela_ocorrencias_manual.TABLE liberacao
GRANT SELECT ON TABLE sentinela_ocorrencias_manual.liberacao TO sentinela_manual_writer;

-- ACL sentinela_ocorrencias_manual.TABLE naturezas_retiradas
GRANT SELECT,INSERT ON TABLE sentinela_ocorrencias_manual.naturezas_retiradas TO sentinela_manual_writer;

-- ACL sentinela_ocorrencias_manual.COLUMN naturezas_retiradas.associacao_id
GRANT SELECT(associacao_id) ON TABLE sentinela_ocorrencias_manual.naturezas_retiradas TO sentinela_manual_reader;
GRANT SELECT(associacao_id) ON TABLE sentinela_ocorrencias_manual.naturezas_retiradas TO sentinela_ocorrencias_reader;

-- ACL sentinela_ocorrencias_manual.TABLE naturezas_uso_local
GRANT SELECT ON TABLE sentinela_ocorrencias_manual.naturezas_uso_local TO sentinela_manual_writer;
GRANT SELECT ON TABLE sentinela_ocorrencias_manual.naturezas_uso_local TO sentinela_manual_reader;

-- ACL sentinela_pcdf_historico.TABLE arquivos
GRANT SELECT ON TABLE sentinela_pcdf_historico.arquivos TO sentinela_pcdf_historico_owner;

-- ACL sentinela_pessoas.TABLE contatos
GRANT SELECT,INSERT,UPDATE ON TABLE sentinela_pessoas.contatos TO sentinela_pessoas_owner;

-- ACL sentinela_pessoas.TABLE exclusoes
GRANT SELECT,INSERT,UPDATE ON TABLE sentinela_pessoas.exclusoes TO sentinela_pessoas_owner;

-- DEFAULT ACL -.DEFAULT PRIVILEGES FOR FUNCTIONS
SET LOCAL ROLE sentinela_ocorrencias_reader;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON FUNCTIONS FROM PUBLIC;
RESET ROLE;


--
-- PostgreSQL database dump complete
--
-- Deferred ownership transfers
GRANT CREATE ON SCHEMA sentinela_exclusao TO sentinela_exclusao_owner;
ALTER FUNCTION sentinela_exclusao.autorizar_jan2021(alvo uuid, p_usuario uuid, p_conta text, p_revisao text, p_backup text) OWNER TO sentinela_exclusao_owner;
ALTER FUNCTION sentinela_exclusao.excecao_pontual_jan2021(plano jsonb) OWNER TO sentinela_exclusao_owner;
ALTER FUNCTION sentinela_exclusao.excluir(p jsonb, conta text, p_usuario uuid) OWNER TO sentinela_exclusao_owner;
ALTER FUNCTION sentinela_exclusao.exigir_ambiente() OWNER TO sentinela_exclusao_owner;
ALTER FUNCTION sentinela_exclusao.historico(pagina integer) OWNER TO sentinela_exclusao_owner;
ALTER FUNCTION sentinela_exclusao.plano(alvo uuid) OWNER TO sentinela_exclusao_owner;
ALTER FUNCTION sentinela_exclusao.previa(alvo uuid, p_usuario uuid, p_conta text) OWNER TO sentinela_exclusao_owner;
ALTER FUNCTION sentinela_exclusao.quantidades(plano jsonb) OWNER TO sentinela_exclusao_owner;
ALTER FUNCTION sentinela_exclusao.revisao(plano jsonb) OWNER TO sentinela_exclusao_owner;
ALTER FUNCTION sentinela_exclusao.vinculos_inesperados() OWNER TO sentinela_exclusao_owner;
GRANT CREATE ON SCHEMA sentinela_gestao TO sentinela_gestao_owner;
ALTER FUNCTION sentinela_gestao.acoes(area text, pagina jsonb) OWNER TO sentinela_gestao_owner;
ALTER FUNCTION sentinela_gestao.alvo(p_area text, p_id uuid) OWNER TO sentinela_gestao_owner;
ALTER FUNCTION sentinela_gestao.arquivo(p_id uuid) OWNER TO sentinela_gestao_owner;
ALTER FUNCTION sentinela_gestao.arquivos(p jsonb) OWNER TO sentinela_gestao_owner;
ALTER FUNCTION sentinela_gestao.associacao(p_id uuid) OWNER TO sentinela_gestao_owner;
ALTER FUNCTION sentinela_gestao.contagens(p_exec uuid, p_fonte text, p_contrato text, p_lidas bigint, p_pendencias bigint) OWNER TO sentinela_gestao_owner;
ALTER FUNCTION sentinela_gestao.contexto(area text, alvo uuid) OWNER TO sentinela_gestao_owner;
ALTER FUNCTION sentinela_gestao.impacto(p_lote uuid, p_staging uuid) OWNER TO sentinela_gestao_owner;
ALTER FUNCTION sentinela_gestao.mutar(p jsonb, p_conta text, p_usuario uuid) OWNER TO sentinela_gestao_owner;
GRANT CREATE ON SCHEMA sentinela_gestao_autorizacao TO sentinela_gestao_autoridade;
ALTER FUNCTION sentinela_gestao_autorizacao.capacidade(p_usuario uuid, p_conta text) OWNER TO sentinela_gestao_autoridade;
ALTER FUNCTION sentinela_gestao_autorizacao.consumir(p_lote uuid, p_usuario uuid, p_conta text, p_revisao text) OWNER TO sentinela_gestao_autoridade;
ALTER FUNCTION sentinela_gestao_autorizacao.emitir_jan2021(p_lote uuid, p_usuario uuid, p_conta text, p_revisao text, p_backup text) OWNER TO sentinela_gestao_autoridade;
ALTER FUNCTION sentinela_gestao_autorizacao.exigir(p_usuario uuid, p_conta text) OWNER TO sentinela_gestao_autoridade;
ALTER FUNCTION sentinela_gestao_autorizacao.lote_aprovado(p_lote uuid, p_usuario uuid, p_revisao text) OWNER TO sentinela_gestao_autoridade;
ALTER FUNCTION sentinela_gestao_autorizacao.validade_jan2021(p_lote uuid, p_usuario uuid, p_revisao text) OWNER TO sentinela_gestao_autoridade;
GRANT CREATE ON SCHEMA sentinela_import_local TO sentinela_general_importer;
ALTER FUNCTION sentinela_import_local.begin_request(actor_id uuid, request_id uuid, meta jsonb, content bytea, batch jsonb) OWNER TO sentinela_general_importer;
ALTER FUNCTION sentinela_import_local.check_actor(subject_id uuid, admin_only boolean) OWNER TO sentinela_general_importer;
ALTER FUNCTION sentinela_import_local.detail(run_id uuid, first_row integer) OWNER TO sentinela_general_importer;
ALTER FUNCTION sentinela_import_local.fail(actor_id uuid, request_id uuid) OWNER TO sentinela_general_importer;
ALTER FUNCTION sentinela_import_local.history() OWNER TO sentinela_general_importer;
ALTER FUNCTION sentinela_import_local.receive(actor_id uuid, request_id uuid, batch jsonb) OWNER TO sentinela_general_importer;
GRANT CREATE ON SCHEMA sentinela_ocorrencias_local TO sentinela_ocorrencias_reader;
ALTER FUNCTION sentinela_ocorrencias_local.detalhe(modo text, registro uuid) OWNER TO sentinela_ocorrencias_reader;
ALTER FUNCTION sentinela_ocorrencias_local.identidade() OWNER TO sentinela_ocorrencias_reader;
ALTER FUNCTION sentinela_ocorrencias_local.lista(modo text, filtros jsonb, pagina integer, ordenar text, direcao text) OWNER TO sentinela_ocorrencias_reader;
ALTER FUNCTION sentinela_ocorrencias_local.resumo() OWNER TO sentinela_ocorrencias_reader;
GRANT CREATE ON SCHEMA sentinela_ocorrencias_manual TO sentinela_manual_writer;
ALTER FUNCTION sentinela_ocorrencias_manual.acoes(pagina jsonb) OWNER TO sentinela_manual_writer;
ALTER FUNCTION sentinela_ocorrencias_manual.autor(p_usuario uuid, p_conta text) OWNER TO sentinela_manual_writer;
ALTER FUNCTION sentinela_ocorrencias_manual.cadastrar(b jsonb, k uuid, a text) OWNER TO sentinela_manual_writer;
ALTER FUNCTION sentinela_ocorrencias_manual.cadastrar_completo(b jsonb, k uuid, a text, u uuid) OWNER TO sentinela_manual_writer;
ALTER FUNCTION sentinela_ocorrencias_manual.catalogo() OWNER TO sentinela_manual_writer;
ALTER FUNCTION sentinela_ocorrencias_manual.catalogo(termo text) OWNER TO sentinela_manual_writer;
ALTER FUNCTION sentinela_ocorrencias_manual.contexto(alvo uuid) OWNER TO sentinela_manual_writer;
GRANT CREATE ON SCHEMA sentinela_ocorrencias_manual TO sentinela_manual_reader;
ALTER FUNCTION sentinela_ocorrencias_manual.detalhe(registro uuid) OWNER TO sentinela_manual_reader;
ALTER FUNCTION sentinela_ocorrencias_manual.editar(p jsonb, p_conta text, p_usuario uuid) OWNER TO sentinela_manual_writer;
ALTER FUNCTION sentinela_ocorrencias_manual.exigir_autor(p_usuario uuid, p_conta text) OWNER TO sentinela_manual_writer;
ALTER FUNCTION sentinela_ocorrencias_manual.lista(f jsonb, pagina integer, ordenar text, direcao text) OWNER TO sentinela_manual_reader;
ALTER FUNCTION sentinela_ocorrencias_manual.transicionar(p jsonb, p_conta text, p_usuario uuid) OWNER TO sentinela_manual_writer;
ALTER FUNCTION sentinela_ocorrencias_manual.validar_retirada() OWNER TO sentinela_manual_writer;
ALTER FUNCTION sentinela_ocorrencias_manual.verificar_evento(sentinela.ocorrencias, sentinela.ocorrencias) OWNER TO sentinela_manual_writer;
GRANT CREATE ON SCHEMA sentinela_pcdf_historico TO sentinela_pcdf_historico_owner;
ALTER FUNCTION sentinela_pcdf_historico.coverage() OWNER TO sentinela_pcdf_historico_owner;
ALTER FUNCTION sentinela_pcdf_historico.receive(p_request uuid, p_usuario uuid, p_conta text, p_batch jsonb, p_csv bytea) OWNER TO sentinela_pcdf_historico_owner;
GRANT CREATE ON SCHEMA sentinela_pcdf_historico TO sentinela_pcdf_owner;
ALTER FUNCTION sentinela_pcdf_historico.receive_staging(p_request uuid, p_usuario uuid, p_conta text, p_batch jsonb, p_csv bytea) OWNER TO sentinela_pcdf_owner;
ALTER FUNCTION sentinela_pcdf_historico.status() OWNER TO sentinela_pcdf_historico_owner;
GRANT CREATE ON SCHEMA sentinela_pcdf_local TO sentinela_pcdf_owner;
ALTER FUNCTION sentinela_pcdf_local.attempt(request uuid, account text, meta jsonb) OWNER TO sentinela_pcdf_owner;
ALTER FUNCTION sentinela_pcdf_local.detail(run_id uuid, first_row integer) OWNER TO sentinela_pcdf_owner;
ALTER FUNCTION sentinela_pcdf_local.fail(request uuid) OWNER TO sentinela_pcdf_owner;
ALTER FUNCTION sentinela_pcdf_local.history() OWNER TO sentinela_pcdf_owner;
ALTER FUNCTION sentinela_pcdf_local.preflight() OWNER TO sentinela_pcdf_owner;
ALTER FUNCTION sentinela_pcdf_local.receive(request uuid, delivery jsonb, content bytea, manifest_bytes bytea) OWNER TO sentinela_pcdf_owner;
ALTER FUNCTION sentinela_pcdf_local.receive_csv(p_request uuid, p_usuario uuid, p_conta text, p_batch jsonb, p_csv bytea) OWNER TO sentinela_pcdf_owner;
GRANT CREATE ON SCHEMA sentinela_pessoas TO sentinela_pessoas_owner;
ALTER FUNCTION sentinela_pessoas.criar(actor uuid, identidade uuid, alvo uuid, nome text, email text, perfil text, unidade text) OWNER TO sentinela_pessoas_owner;
ALTER FUNCTION sentinela_pessoas.editar(actor uuid, identidade uuid, alvo uuid, versao text, nome text, contato text, unidade text) OWNER TO sentinela_pessoas_owner;
ALTER FUNCTION sentinela_pessoas.excluir(actor uuid, identidade uuid, alvo uuid, email text, etapa text) OWNER TO sentinela_pessoas_owner;
ALTER FUNCTION sentinela_pessoas.listar(actor uuid, identidade uuid) OWNER TO sentinela_pessoas_owner;
ALTER TABLE sentinela_exclusao.comprovantes OWNER TO sentinela_exclusao_owner;
ALTER VIEW sentinela_gestao.lotes OWNER TO sentinela_gestao_owner;
ALTER TABLE sentinela_gestao_autorizacao.atores OWNER TO sentinela_gestao_autoridade;
ALTER TABLE sentinela_gestao_autorizacao.exclusoes OWNER TO sentinela_gestao_autoridade;
ALTER TABLE sentinela_gestao_autorizacao.release OWNER TO sentinela_gestao_autoridade;
GRANT CREATE ON SCHEMA sentinela_ocorrencias_analytics TO sentinela_ocorrencias_reader;
ALTER VIEW sentinela_ocorrencias_analytics.categorias_criminais OWNER TO sentinela_ocorrencias_reader;
ALTER VIEW sentinela_ocorrencias_analytics.ocorrencia_naturezas OWNER TO sentinela_ocorrencias_reader;
ALTER VIEW sentinela_ocorrencias_analytics.mapeamentos_natureza OWNER TO sentinela_ocorrencias_reader;
ALTER VIEW sentinela_ocorrencias_analytics.naturezas_criminais OWNER TO sentinela_ocorrencias_reader;
ALTER VIEW sentinela_ocorrencias_analytics.ocorrencias OWNER TO sentinela_ocorrencias_reader;
ALTER VIEW sentinela_ocorrencias_analytics.pontos_pcdf_publicados OWNER TO sentinela_ocorrencias_reader;
ALTER VIEW sentinela_ocorrencias_analytics.pontos_confirmados OWNER TO sentinela_ocorrencias_reader;
ALTER VIEW sentinela_ocorrencias_analytics.regioes_administrativas OWNER TO sentinela_ocorrencias_reader;
ALTER VIEW sentinela_ocorrencias_local.consolidadas OWNER TO sentinela_ocorrencias_reader;
ALTER VIEW sentinela_ocorrencias_local.importados OWNER TO sentinela_ocorrencias_reader;
ALTER SCHEMA sentinela_exclusao OWNER TO sentinela_exclusao_owner;
ALTER SCHEMA sentinela_gestao OWNER TO sentinela_gestao_owner;
ALTER SCHEMA sentinela_gestao_autorizacao OWNER TO sentinela_gestao_autoridade;
ALTER SCHEMA sentinela_ocorrencias_analytics OWNER TO sentinela_ocorrencias_reader;
ALTER SCHEMA sentinela_ocorrencias_local OWNER TO sentinela_ocorrencias_reader;
REVOKE CREATE ON SCHEMA sentinela_import_local FROM sentinela_general_importer;
REVOKE CREATE ON SCHEMA sentinela_ocorrencias_manual FROM sentinela_manual_writer;
REVOKE CREATE ON SCHEMA sentinela_ocorrencias_manual FROM sentinela_manual_reader;
REVOKE CREATE ON SCHEMA sentinela_pcdf_historico FROM sentinela_pcdf_historico_owner;
REVOKE CREATE ON SCHEMA sentinela_pcdf_historico FROM sentinela_pcdf_owner;
REVOKE CREATE ON SCHEMA sentinela_pcdf_local FROM sentinela_pcdf_owner;
REVOKE CREATE ON SCHEMA sentinela_pessoas FROM sentinela_pessoas_owner;

-- ACL sentinela_exclusao.TABLE comprovantes (as owner)
SET LOCAL ROLE sentinela_exclusao_owner;
REVOKE ALL ON TABLE sentinela_exclusao.comprovantes FROM sentinela_exclusao_owner;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE sentinela_exclusao.comprovantes TO sentinela_exclusao_owner;
RESET ROLE;

INSERT INTO sentinela.schema_migrations VALUES ('0010','Importador: schemas, funções, RLS e permissões',DEFAULT)
ON CONFLICT DO NOTHING;
COMMIT;
