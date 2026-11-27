-- Install after synthetic occurrence management 0003 on the attested disposable cluster.
BEGIN;
SET LOCAL search_path=pg_catalog,pg_temp;
SET LOCAL lock_timeout='5s';
SELECT set_config('sentinela.manual_expected_uuid', :'expected_uuid', true);
DO $$
BEGIN
  IF current_database()<>'sentinela_pcdf_local' OR inet_server_addr() IS DISTINCT FROM inet '127.0.0.1'
    OR inet_server_port() IS DISTINCT FROM 55488 OR nullif(current_setting('sentinela.sandbox_uuid',true),'') IS NULL
    OR current_setting('sentinela.sandbox_uuid',true) IS DISTINCT FROM current_setting('sentinela.manual_expected_uuid')
    OR to_regprocedure('sentinela_gestao.editar_manual(jsonb,text)') IS NULL
    OR to_regprocedure('sentinela_ocorrencias_manual.catalogo(text)') IS NULL
  THEN RAISE EXCEPTION 'Destino sintético atestado, edição manual 0003 e catálogo são obrigatórios'; END IF;
END $$;

CREATE FUNCTION sentinela_ocorrencias_manual.validar_dados() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
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
END $$;
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.validar_dados() FROM PUBLIC;
CREATE TRIGGER validar_dados_manuais BEFORE INSERT OR UPDATE OF endereco,dados_crime
 ON sentinela_ocorrencias_manual.cadastros FOR EACH ROW EXECUTE FUNCTION sentinela_ocorrencias_manual.validar_dados();

CREATE FUNCTION sentinela_ocorrencias_manual.cadastrar_completo(b jsonb, k uuid, a text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  registro uuid := gen_random_uuid();
  anterior record;
  hash_entrada text := encode(sha256(convert_to(b::text,'UTF8')),'hex');
  endereco jsonb;
  crime jsonb := b->'dadosCrime';
  ponto extensions.geometry;
  lat float8;
  lon float8;
  ra uuid;
  data_fato date;
  hora_fato time;
  dns timestamp := clock_timestamp() AT TIME ZONE 'America/Sao_Paulo';
BEGIN
  IF session_user NOT IN ('sentinela_local_admin','sentinela_local_operator')
    OR current_database()<>'sentinela_pcdf_local' OR inet_server_addr() IS DISTINCT FROM inet '127.0.0.1'
    OR inet_server_port() IS DISTINCT FROM 55488 OR current_setting('transaction_isolation')<>'read committed'
    OR nullif(current_setting('sentinela.sandbox_uuid',true),'') IS NULL
  THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
  IF k IS NULL OR a IS NULL OR a !~ '^[a-f0-9]{64}$' OR b IS NULL OR jsonb_typeof(b) <> 'object'
    OR (b - ARRAY['data','horario','cep','endereco','bairroOuSetor','numero','complemento','referencia','raId','coordenadas','naturezas','localizacaoConfirmada','dadosCrime']) <> '{}'::jsonb
    OR NOT b ?& ARRAY['data','horario','cep','endereco','bairroOuSetor','raId','coordenadas','naturezas','dadosCrime']
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

  SELECT jsonb_object_agg(campo,btrim(valor)) INTO endereco
    FROM jsonb_each_text(b) e(campo,valor)
    WHERE campo IN ('cep','endereco','bairroOuSetor','numero','complemento','referencia');
  IF jsonb_typeof(crime) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_object_agg(campo,CASE WHEN jsonb_typeof(valor)='string' THEN to_jsonb(btrim(valor#>>'{}')) ELSE valor END),'{}')
    INTO crime FROM jsonb_each(crime) e(campo,valor);

  INSERT INTO sentinela.ocorrencias(id,origem,fonte,versao_identidade,identidade_status,data_fato,horario_fato,
    ra_id,local,latitude,longitude,localizacao_status,referencia_espacial_confirmada,regra_transformacao,geometria,consolidacao_status)
  VALUES (registro,'manual','SENTINELA_MANUAL','manual-local-v1','manual',data_fato,hora_fato,ra,
    concat_ws(', ',endereco->>'endereco',endereco->>'numero',endereco->>'bairroOuSetor'),lat,lon,'validada',
    'WGS84; IDE-DF-2026-11-13','Coordenada informada em graus decimais; sem transformação',ponto,'em_revisao');

  INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,crime_tentado,classificacao_status)
    SELECT registro,(x->>'naturezaId')::uuid,'manual',(x->>'crimeTentado')::boolean,'pendente'
    FROM jsonb_array_elements(b->'naturezas') x;

  INSERT INTO sentinela_ocorrencias_manual.cadastros(ocorrencia_id,login,ator,chave,digest,endereco,dados_crime)
    VALUES(registro,session_user,a,k,hash_entrada,endereco,crime);
  INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,ocorrencia_id,depois,justificativa,request_id)
    VALUES('servico','sentinela-manual-local','ocorrencia.manual.criada',registro,
      jsonb_build_object('login',session_user::text,'contaLocal',a,'raId',ra,'naturezas',b->'naturezas',
        'data',data_fato,'horario',hora_fato,'coordenadas',b->'coordenadas','endereco',endereco,'dadosCrime',crime,
        'situacao','em_revisao','localizacaoConfirmada',true),
      'Cadastro manual por sessão local autenticada',k::text);
  RETURN jsonb_build_object('id',registro,'origem','manual','situacao','em_revisao');
END $$;

CREATE OR REPLACE FUNCTION sentinela_ocorrencias_manual.detalhe(registro uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
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

ALTER FUNCTION sentinela_ocorrencias_manual.cadastrar_completo(jsonb,uuid,text) OWNER TO sentinela_manual_writer;
REVOKE ALL ON FUNCTION sentinela_ocorrencias_manual.cadastrar_completo(jsonb,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_ocorrencias_manual.cadastrar_completo(jsonb,uuid,text)
 TO sentinela_local_admin,sentinela_local_operator;
REVOKE EXECUTE ON FUNCTION sentinela_ocorrencias_manual.cadastrar(jsonb,uuid,text)
 FROM sentinela_local_admin,sentinela_local_operator;
COMMIT;
