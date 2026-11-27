-- Install only on the disposable management cluster.
BEGIN;
SET LOCAL search_path=pg_catalog,pg_temp;
SET LOCAL lock_timeout='5s';
SELECT set_config('sentinela.gestao_expected_uuid', :'expected_uuid', true);
DO $$
BEGIN
 IF current_database()<>'sentinela_pcdf_local' OR inet_server_addr() IS DISTINCT FROM inet '127.0.0.1'
 OR inet_server_port() IS DISTINCT FROM 55488 OR nullif(current_setting('sentinela.sandbox_uuid',true),'') IS NULL
 OR current_setting('sentinela.sandbox_uuid',true) IS DISTINCT FROM current_setting('sentinela.gestao_expected_uuid')
 OR to_regprocedure('sentinela_gestao.mutar(jsonb,text)') IS NULL
 OR to_regprocedure('sentinela_ocorrencias_manual.catalogo(text)') IS NULL
 THEN RAISE EXCEPTION 'Destino sintético atestado e catálogo manual são obrigatórios'; END IF;
END $$;

ALTER TABLE sentinela_ocorrencias_manual.cadastros ADD COLUMN dados_crime jsonb NOT NULL DEFAULT '{}'
 CHECK (jsonb_typeof(dados_crime)='object');
GRANT SELECT (endereco,dados_crime) ON sentinela_ocorrencias_manual.cadastros TO sentinela_gestao_owner;
GRANT SELECT (dados_crime) ON sentinela_ocorrencias_manual.cadastros TO sentinela_manual_reader;
GRANT UPDATE (endereco,dados_crime) ON sentinela_ocorrencias_manual.cadastros TO sentinela_gestao_owner;
CREATE POLICY gestao_cadastros_update ON sentinela_ocorrencias_manual.cadastros FOR UPDATE TO sentinela_gestao_owner
 USING (session_user IN ('sentinela_local_admin','sentinela_local_operator') AND EXISTS(
  SELECT FROM sentinela.ocorrencias o WHERE id=ocorrencia_id AND o.ativo AND o.origem='manual'
  AND o.fonte='SENTINELA_MANUAL' AND o.consolidacao_status='em_revisao'))
 WITH CHECK (session_user IN ('sentinela_local_admin','sentinela_local_operator') AND EXISTS(
  SELECT FROM sentinela.ocorrencias o WHERE id=ocorrencia_id AND o.ativo AND o.origem='manual'
  AND o.fonte='SENTINELA_MANUAL' AND o.consolidacao_status='em_revisao'));
GRANT UPDATE (ra_id,local,latitude,longitude,geometria) ON sentinela.ocorrencias TO sentinela_gestao_owner;
GRANT INSERT (ocorrencia_id,natureza_id,origem,crime_tentado,classificacao_status)
 ON sentinela.ocorrencia_naturezas TO sentinela_gestao_owner;
GRANT SELECT (id,fonte) ON sentinela.naturezas_criminais TO sentinela_gestao_owner;
CREATE POLICY gestao_catalogo_manual ON sentinela.naturezas_criminais FOR SELECT TO sentinela_gestao_owner
 USING (fonte='SENTINELA_MANUAL');
GRANT EXECUTE ON FUNCTION sentinela_ocorrencias_manual.catalogo(text),sentinela.validar_associacao_mapeada()
 TO sentinela_gestao_owner;
CREATE POLICY gestao_manual_insert ON sentinela.ocorrencia_naturezas FOR INSERT TO sentinela_gestao_owner
 WITH CHECK (session_user IN ('sentinela_local_admin','sentinela_local_operator') AND origem='manual'
 AND linha_origem_id IS NULL AND classificacao_status='pendente' AND mapeamento_id IS NULL
 AND EXISTS(SELECT FROM sentinela.ocorrencias o WHERE id=ocorrencia_id AND o.ativo AND o.origem='manual'
  AND o.fonte='SENTINELA_MANUAL' AND o.consolidacao_status='em_revisao')
 AND EXISTS(SELECT FROM jsonb_array_elements(sentinela_ocorrencias_manual.catalogo(NULL)->'naturezas') n
  WHERE n->>'id'=natureza_id::text));

-- Keep each former link and its foreign keys. An added pair receives a new link if it was previously retired.
CREATE TABLE sentinela_gestao.naturezas_inativadas (
 associacao_id uuid PRIMARY KEY REFERENCES sentinela.ocorrencia_naturezas(id),
 auditoria_id uuid NOT NULL REFERENCES sentinela.eventos_auditoria(id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE sentinela_gestao.naturezas_inativadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_gestao.naturezas_inativadas FORCE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA sentinela_gestao TO sentinela_manual_reader;
GRANT SELECT (associacao_id) ON sentinela_gestao.naturezas_inativadas TO sentinela_manual_reader,sentinela_ocorrencias_reader;
GRANT SELECT,INSERT ON sentinela_gestao.naturezas_inativadas TO sentinela_gestao_owner;
CREATE POLICY gestao_naturezas_inativadas_read ON sentinela_gestao.naturezas_inativadas
 FOR SELECT TO sentinela_gestao_owner,sentinela_manual_reader,sentinela_ocorrencias_reader
 USING (session_user IN ('sentinela_local_admin','sentinela_local_operator','sentinela_local_analyst'));
CREATE POLICY gestao_naturezas_inativadas_insert ON sentinela_gestao.naturezas_inativadas
 FOR INSERT TO sentinela_gestao_owner WITH CHECK (
 session_user IN ('sentinela_local_admin','sentinela_local_operator') AND EXISTS(
  SELECT FROM sentinela.ocorrencia_naturezas n JOIN sentinela.ocorrencias o ON o.id=n.ocorrencia_id
  WHERE n.id=associacao_id AND n.origem='manual' AND n.linha_origem_id IS NULL AND o.ativo
  AND o.origem='manual' AND o.fonte='SENTINELA_MANUAL' AND o.consolidacao_status='em_revisao'));
ALTER POLICY manual_read_links ON sentinela.ocorrencia_naturezas USING (
 EXISTS(SELECT FROM sentinela.ocorrencias o WHERE o.id=ocorrencia_id)
 AND NOT EXISTS(SELECT FROM sentinela_gestao.naturezas_inativadas i WHERE i.associacao_id=ocorrencia_naturezas.id));
ALTER POLICY ocorrencias_read_associacoes ON sentinela.ocorrencia_naturezas USING (
 EXISTS(SELECT FROM sentinela.ocorrencias o WHERE o.id=ocorrencia_naturezas.ocorrencia_id)
 AND NOT EXISTS(SELECT FROM sentinela_gestao.naturezas_inativadas i WHERE i.associacao_id=ocorrencia_naturezas.id));

CREATE OR REPLACE FUNCTION sentinela_ocorrencias_manual.detalhe(registro uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('id',o.id,'identificacao',o.id::text,'fonte',o.fonte,'origem',o.origem,
   'data',o.data_fato,'hora',o.horario_fato::text,'ra',r.nome,'local',o.local,'situacao',o.consolidacao_status,
   'localizacaoStatus',o.localizacao_status,'latitude',o.latitude,'longitude',o.longitude,
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

SET LOCAL ROLE sentinela_gestao_owner;

CREATE FUNCTION sentinela_gestao.naturezas_ativas(alvo uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'naturezaId',n.natureza_id,'crimeTentado',n.crime_tentado)
  ORDER BY n.natureza_id,n.crime_tentado,n.id),'[]')
 FROM sentinela.ocorrencia_naturezas n WHERE n.ocorrencia_id=alvo
 AND NOT EXISTS(SELECT FROM sentinela_gestao.naturezas_inativadas i WHERE i.associacao_id=n.id);
$$;

CREATE FUNCTION sentinela_gestao.contexto(area text,alvo uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE resultado jsonb:=sentinela_gestao.alvo(area,alvo); vinculos jsonb;
BEGIN
 IF resultado IS NULL THEN RETURN NULL; END IF;
 IF area='manuais' THEN
  vinculos:=sentinela_gestao.naturezas_ativas(alvo);
  RETURN (SELECT resultado||jsonb_build_object('vinculos',jsonb_array_length(vinculos),
   'manual',c.endereco||jsonb_build_object('data',o.data_fato,'horario',o.horario_fato,'raId',o.ra_id,
   'coordenadas',jsonb_build_object('latitude',o.latitude,'longitude',o.longitude),'dadosCrime',c.dados_crime,
   'naturezas',(SELECT coalesce(jsonb_agg(x-'id' ORDER BY ord),'[]') FROM jsonb_array_elements(vinculos) WITH ORDINALITY a(x,ord))))
   FROM sentinela_ocorrencias_manual.cadastros c JOIN sentinela.ocorrencias o ON o.id=c.ocorrencia_id WHERE o.id=alvo);
 ELSIF area='importados' THEN
  RETURN resultado||jsonb_build_object('historico',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id',h.id,'acao',h.acao,'data',h.registrado_em,'justificativa',h.justificativa,'responsavel',h.depois->>'login','conta',h.depois->>'conta',
   'antes',h.antes,'depois',h.depois->'campos') ORDER BY h.registrado_em DESC,h.id DESC)
   FROM (SELECT e.* FROM sentinela.eventos_auditoria e WHERE e.servico='ocorrencias-gestao-local'
    AND e.acao IN ('corrigir_associacao','inativar_associacao') AND e.depois->>'stagingId'=alvo::text
    ORDER BY e.registrado_em DESC,e.id DESC LIMIT 100) h),'[]'));
 END IF;
 RETURN resultado;
END $$;

CREATE FUNCTION sentinela_gestao.acoes(area text,pagina jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT pagina||jsonb_build_object('itens',coalesce(jsonb_agg(
  CASE WHEN a.alvo IS NULL THEN i.item ELSE i.item||jsonb_build_object('acoes',jsonb_build_object(
   'editar',(a.alvo->>'editavel')::boolean,'inativar',NOT (a.alvo->>'bloqueiaConsolidacao')::boolean)) END ORDER BY i.ord),'[]'))
 FROM jsonb_array_elements(pagina->'itens') WITH ORDINALITY i(item,ord)
 CROSS JOIN LATERAL (SELECT sentinela_gestao.alvo(area,(i.item->>'id')::uuid) AS alvo OFFSET 0) a;
$$;

CREATE FUNCTION sentinela_gestao.editar_manual(p jsonb,p_conta text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
 alvo uuid:=(p->>'id')::uuid; motivo text:=btrim(p->>'justificativa'); auditoria uuid:=gen_random_uuid();
 b jsonb:=p->'dados'; crime jsonb:=b->'dadosCrime'; catalogo jsonb; novo_endereco jsonb; anterior_endereco jsonb;
 anterior_crime jsonb; vinculos jsonb; antes sentinela.ocorrencias; depois sentinela.ocorrencias;
 dia date; hora time; ra uuid; lat float8; lon float8; ponto extensions.geometry;
BEGIN
 IF session_user NOT IN ('sentinela_local_admin','sentinela_local_operator') THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p-ARRAY['acao','id','versao','confirmacao','justificativa','dados']<>'{}'
 OR alvo IS NULL OR p->>'confirmacao' IS DISTINCT FROM alvo::text
 OR NOT coalesce(length(motivo) BETWEEN 1 AND 500 AND p_conta~'^[a-f0-9]{64}$',false)
 OR jsonb_typeof(b) IS DISTINCT FROM 'object'
 OR b-ARRAY['data','horario','cep','endereco','bairroOuSetor','numero','complemento','referencia',
  'raId','coordenadas','naturezas','localizacaoConfirmada','dadosCrime']<>'{}'
 OR NOT b ?& ARRAY['data','horario','endereco','bairroOuSetor','raId','coordenadas','naturezas']
 OR b->'localizacaoConfirmada' IS DISTINCT FROM 'true'::jsonb
 OR NOT coalesce(b->>'data'~'^(19[0-9]{2}|[2-9][0-9]{3})-[0-9]{2}-[0-9]{2}$'
  AND b->>'horario'~'^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$',false)
 OR (b?'cep' AND NOT coalesce(jsonb_typeof(b->'cep')='string' AND b->>'cep'~'^[0-9]{8}$',false))
 OR EXISTS(SELECT FROM (VALUES ('endereco',240),('bairroOuSetor',100),('numero',24),('complemento',120),('referencia',240)) k(campo,maximo)
  WHERE (b?k.campo OR k.campo IN ('endereco','bairroOuSetor'))
  AND NOT coalesce(jsonb_typeof(b->k.campo)='string' AND length(btrim(b->>k.campo)) BETWEEN 1 AND k.maximo,false))
 OR jsonb_typeof(b->'coordenadas') IS DISTINCT FROM 'object'
 OR (b->'coordenadas')-ARRAY['latitude','longitude']<>'{}'
 OR NOT coalesce(jsonb_typeof(b->'coordenadas'->'latitude')='number'
  AND jsonb_typeof(b->'coordenadas'->'longitude')='number',false)
 OR jsonb_typeof(b->'naturezas') IS DISTINCT FROM 'array'
 OR jsonb_typeof(crime) IS DISTINCT FROM 'object' OR crime-ARRAY['descricao','meio','vitimas','autores','observacoes']<>'{}'
 OR EXISTS(SELECT FROM (VALUES ('descricao',3000),('observacoes',1500)) k(campo,maximo)
  WHERE crime?k.campo AND NOT coalesce(jsonb_typeof(crime->k.campo)='string'
   AND length(btrim(crime->>k.campo)) BETWEEN 1 AND k.maximo,false))
 OR (crime?'meio' AND NOT coalesce(crime->>'meio' IN ('arma-de-fogo','arma-branca','forca-fisica','veiculo','outro'),false))
 OR EXISTS(SELECT FROM (VALUES ('vitimas'),('autores')) k(campo) WHERE crime?k.campo AND NOT
  coalesce(jsonb_typeof(crime->k.campo)='number' AND crime->>k.campo~'^[0-9]{1,6}$',false))
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;

 SELECT o.* INTO antes FROM sentinela.ocorrencias o JOIN sentinela_ocorrencias_manual.cadastros c ON c.ocorrencia_id=o.id
  WHERE o.id=alvo AND o.ativo AND o.origem='manual' AND o.fonte='SENTINELA_MANUAL' AND o.consolidacao_status='em_revisao' FOR UPDATE OF o;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002'; END IF;
 IF p->>'versao' IS DISTINCT FROM antes.versao::text THEN RAISE EXCEPTION USING ERRCODE='40001'; END IF;

 dia:=(b->>'data')::date; hora:=(b->>'horario')::time; ra:=(b->>'raId')::uuid;
 lat:=(b->'coordenadas'->>'latitude')::float8; lon:=(b->'coordenadas'->>'longitude')::float8;
 IF dia+hora > (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo') OR ra IS NULL
 OR NOT (lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180)
 OR jsonb_array_length(b->'naturezas') NOT BETWEEN 1 AND 100
 OR EXISTS(SELECT FROM jsonb_array_elements(b->'naturezas') x WHERE jsonb_typeof(x)<>'object'
  OR NOT coalesce(jsonb_typeof(x->'naturezaId')='string' AND jsonb_typeof(x->'crimeTentado') IN ('boolean','null'),false)
  OR x-ARRAY['naturezaId','crimeTentado']<>'{}')
 OR EXISTS(SELECT FROM jsonb_array_elements(b->'naturezas') x GROUP BY (x->>'naturezaId')::uuid,x->'crimeTentado' HAVING count(*)>1)
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;

 catalogo:=sentinela_ocorrencias_manual.catalogo(NULL);
 ponto:=extensions.ST_SetSRID(extensions.ST_MakePoint(lon,lat),4326);
 IF jsonb_array_length(catalogo->'regioes') IS DISTINCT FROM 37
 OR (SELECT count(*) FROM sentinela.regioes_administrativas r JOIN jsonb_array_elements(catalogo->'regioes') a
  ON r.id=(a->>'id')::uuid WHERE extensions.ST_Covers(r.limite,ponto))<>1
 OR NOT EXISTS(SELECT FROM sentinela.regioes_administrativas r JOIN jsonb_array_elements(catalogo->'regioes') a ON r.id=(a->>'id')::uuid
  WHERE r.id=ra AND r.vigencia @> dia AND extensions.ST_Contains(r.limite,ponto))
 OR EXISTS(SELECT FROM jsonb_array_elements(b->'naturezas') x WHERE NOT EXISTS(
  SELECT FROM jsonb_array_elements(catalogo->'naturezas') n WHERE (n->>'id')::uuid=(x->>'naturezaId')::uuid))
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;

 SELECT c.endereco,c.dados_crime INTO anterior_endereco,anterior_crime
 FROM sentinela_ocorrencias_manual.cadastros c WHERE c.ocorrencia_id=alvo;
 vinculos:=sentinela_gestao.naturezas_ativas(alvo);
 SELECT jsonb_object_agg(chave,btrim(valor)) INTO novo_endereco FROM jsonb_each_text(b) e(chave,valor)
 WHERE chave IN ('cep','endereco','bairroOuSetor','numero','complemento','referencia');
 SELECT coalesce(jsonb_object_agg(k,CASE WHEN jsonb_typeof(v)='string' THEN to_jsonb(btrim(v#>>'{}')) ELSE v END),'{}')
 INTO crime FROM jsonb_each(crime) e(k,v);

 INSERT INTO sentinela_gestao.naturezas_inativadas(associacao_id,auditoria_id)
 SELECT n.id,auditoria FROM sentinela.ocorrencia_naturezas n
 WHERE n.ocorrencia_id=alvo AND n.origem='manual'
 AND NOT EXISTS(SELECT FROM sentinela_gestao.naturezas_inativadas i WHERE i.associacao_id=n.id)
 AND NOT EXISTS(SELECT FROM jsonb_array_elements(b->'naturezas') x WHERE (x->>'naturezaId')::uuid=n.natureza_id
  AND (x->>'crimeTentado')::boolean IS NOT DISTINCT FROM n.crime_tentado);

 INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,crime_tentado,classificacao_status)
 SELECT alvo,(x->>'naturezaId')::uuid,'manual',(x->>'crimeTentado')::boolean,'pendente'
 FROM jsonb_array_elements(b->'naturezas') x WHERE NOT EXISTS(
  SELECT FROM sentinela.ocorrencia_naturezas n WHERE n.ocorrencia_id=alvo AND n.natureza_id=(x->>'naturezaId')::uuid
  AND n.crime_tentado IS NOT DISTINCT FROM (x->>'crimeTentado')::boolean
  AND NOT EXISTS(SELECT FROM sentinela_gestao.naturezas_inativadas i WHERE i.associacao_id=n.id));

 IF (dia,hora,ra,lat,lon,novo_endereco,crime,vinculos) IS NOT DISTINCT FROM
  (antes.data_fato,antes.horario_fato,antes.ra_id,antes.latitude,antes.longitude,anterior_endereco,anterior_crime,sentinela_gestao.naturezas_ativas(alvo))
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
 UPDATE sentinela_ocorrencias_manual.cadastros c SET endereco=novo_endereco,dados_crime=crime WHERE c.ocorrencia_id=alvo;
 UPDATE sentinela.ocorrencias SET data_fato=dia,horario_fato=hora,ra_id=ra,latitude=lat,longitude=lon,geometria=ponto,
  local=concat_ws(', ',novo_endereco->>'endereco',novo_endereco->>'numero',novo_endereco->>'bairroOuSetor')
  WHERE id=alvo RETURNING * INTO depois;
 INSERT INTO sentinela.eventos_auditoria(id,ator_tipo,servico,acao,ocorrencia_id,antes,depois,justificativa,request_id)
 VALUES(auditoria,'servico','ocorrencias-gestao-local','editar_manual',alvo,
  jsonb_build_object('registro',to_jsonb(antes),'endereco',anterior_endereco,'dadosCrime',anterior_crime,'naturezas',vinculos),
  jsonb_build_object('registro',to_jsonb(depois),'endereco',novo_endereco,'dadosCrime',crime,'naturezas',sentinela_gestao.naturezas_ativas(alvo),
   'localizacaoConfirmada',true,'login',session_user::text,'conta',p_conta),motivo,auditoria::text);
 RETURN jsonb_build_object('id',alvo,'auditoria',auditoria);
END $$;

ALTER FUNCTION sentinela_gestao.mutar(jsonb,text) RENAME TO mutar_v2;
REVOKE EXECUTE ON FUNCTION sentinela_gestao.mutar_v2(jsonb,text) FROM sentinela_local_admin,sentinela_local_operator;
CREATE FUNCTION sentinela_gestao.mutar(p jsonb,p_conta text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p->>'acao' IS DISTINCT FROM 'editar_manual' THEN RETURN sentinela_gestao.mutar_v2(p,p_conta); END IF;
 IF current_database()<>'sentinela_pcdf_local' OR inet_server_addr() IS DISTINCT FROM inet '127.0.0.1'
 OR inet_server_port() IS DISTINCT FROM 55488 OR current_setting('transaction_isolation')<>'read committed'
 THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
 RETURN sentinela_gestao.editar_manual(p,p_conta);
END $$;

CREATE OR REPLACE FUNCTION sentinela_gestao.verificar_evento(anterior jsonb,novo jsonb) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT inet_server_port()=55488 AND EXISTS(SELECT FROM sentinela.eventos_auditoria e
 WHERE e.ocorrencia_id=(anterior->>'id')::uuid AND e.servico='ocorrencias-gestao-local'
 AND e.transacao_id=pg_current_xact_id() AND e.depois->>'login'=session_user::text
 AND ((e.acao='editar_manual' AND e.antes->'registro'=anterior AND e.depois->'registro'=novo)
  OR (e.acao IN ('inativar_manual','inativar_consolidada') AND e.antes=anterior AND e.depois-ARRAY['login','conta']=novo)))
$$;

RESET ROLE;
GRANT EXECUTE ON FUNCTION sentinela_gestao.contexto(text,uuid),sentinela_gestao.acoes(text,jsonb),
 sentinela_gestao.mutar(jsonb,text) TO sentinela_local_admin,sentinela_local_operator;
COMMIT;
