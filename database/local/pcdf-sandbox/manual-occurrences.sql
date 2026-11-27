-- Local additive migration. Use an attested target and its expected_uuid.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, pg_temp;
SELECT set_config('sentinela.manual_expected_uuid', :'expected_uuid', true);
DO $guard$
BEGIN
  IF current_database() <> 'sentinela_pcdf_local' OR host(inet_server_addr()) <> '127.0.0.1'
    OR inet_server_port() NOT IN (55484,55486)
    OR current_setting('sentinela.sandbox_uuid', true) IS DISTINCT FROM current_setting('sentinela.manual_expected_uuid')
    OR to_regprocedure('sentinela_ocorrencias_local.identidade()') IS NULL
    OR (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace
      AND relkind='r' AND relrowsecurity AND relforcerowsecurity) <> 19
  THEN RAISE EXCEPTION 'Destino local atestado obrigatório'; END IF;
END
$guard$;

CREATE ROLE sentinela_manual_writer NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
CREATE ROLE sentinela_manual_reader NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
CREATE SCHEMA sentinela_ocorrencias_manual;
REVOKE ALL ON SCHEMA sentinela_ocorrencias_manual FROM PUBLIC;
GRANT USAGE ON SCHEMA sentinela_ocorrencias_manual TO sentinela_manual_writer, sentinela_manual_reader,
  sentinela_local_admin, sentinela_local_operator, sentinela_local_analyst;
GRANT USAGE ON SCHEMA sentinela, extensions TO sentinela_manual_writer;
GRANT USAGE ON SCHEMA sentinela TO sentinela_manual_reader;
GRANT USAGE ON TYPE sentinela.texto_obrigatorio TO sentinela_manual_writer;

-- Endereço estruturado e recibo de idempotência da ocorrência existente.
CREATE TABLE sentinela_ocorrencias_manual.cadastros (
  ocorrencia_id uuid PRIMARY KEY REFERENCES sentinela.ocorrencias(id),
  login name NOT NULL,
  ator text NOT NULL CHECK (ator ~ '^[a-f0-9]{64}$'),
  chave uuid NOT NULL,
  digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  endereco jsonb NOT NULL CHECK (jsonb_typeof(endereco)='object'),
  UNIQUE (login, ator, chave)
);
ALTER TABLE sentinela_ocorrencias_manual.cadastros ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_ocorrencias_manual.cadastros FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON sentinela_ocorrencias_manual.cadastros TO sentinela_manual_writer;
GRANT SELECT (ocorrencia_id,endereco) ON sentinela_ocorrencias_manual.cadastros TO sentinela_manual_reader;
CREATE POLICY manual_receipt_write ON sentinela_ocorrencias_manual.cadastros TO sentinela_manual_writer
  USING (login=session_user) WITH CHECK (login=session_user);
CREATE POLICY manual_receipt_read ON sentinela_ocorrencias_manual.cadastros FOR SELECT TO sentinela_manual_reader
  USING (session_user IN ('sentinela_local_admin','sentinela_local_operator','sentinela_local_analyst'));

GRANT SELECT (id,origem,fonte,data_fato,horario_fato,ra_id,local,consolidacao_status,localizacao_status,latitude,longitude,unidade_apuracao)
  ON sentinela.ocorrencias TO sentinela_manual_reader;
GRANT SELECT (id,nome) ON sentinela.regioes_administrativas TO sentinela_manual_reader;
GRANT SELECT (id,descricao_original) ON sentinela.naturezas_criminais TO sentinela_manual_reader;
GRANT SELECT (id,ocorrencia_id,natureza_id,classificacao_status,crime_tentado) ON sentinela.ocorrencia_naturezas TO sentinela_manual_reader;
CREATE POLICY manual_read ON sentinela.ocorrencias FOR SELECT TO sentinela_manual_reader
  USING (ativo AND origem='manual' AND fonte='SENTINELA_MANUAL'
    AND session_user IN ('sentinela_local_admin','sentinela_local_operator','sentinela_local_analyst'));
CREATE POLICY manual_read_links ON sentinela.ocorrencia_naturezas FOR SELECT TO sentinela_manual_reader
  USING (EXISTS(SELECT FROM sentinela.ocorrencias o WHERE o.id=ocorrencia_id));
CREATE POLICY manual_read_ra ON sentinela.regioes_administrativas FOR SELECT TO sentinela_manual_reader USING (true);
CREATE POLICY manual_read_nature ON sentinela.naturezas_criminais FOR SELECT TO sentinela_manual_reader USING (true);

GRANT SELECT (id,origem,fonte) ON sentinela.ocorrencias TO sentinela_manual_writer;
GRANT INSERT (id,origem,fonte,versao_identidade,identidade_status,data_fato,horario_fato,ra_id,local,latitude,
  longitude,localizacao_status,referencia_espacial_confirmada,regra_transformacao,geometria,consolidacao_status)
  ON sentinela.ocorrencias TO sentinela_manual_writer;
GRANT SELECT (id,codigo_interno,nome,vigencia,limite,versao_catalogo,versao_cartografia)
  ON sentinela.regioes_administrativas TO sentinela_manual_writer;
GRANT SELECT (id,fonte,descricao_original) ON sentinela.naturezas_criminais TO sentinela_manual_writer;
GRANT INSERT (ocorrencia_id,natureza_id,origem,crime_tentado,classificacao_status)
  ON sentinela.ocorrencia_naturezas TO sentinela_manual_writer;
GRANT INSERT (ator_tipo,servico,acao,ocorrencia_id,depois,justificativa,request_id)
  ON sentinela.eventos_auditoria TO sentinela_manual_writer;
GRANT SELECT (id,natureza_id,categoria_id,status,crime_tentado) ON sentinela.mapeamentos_natureza TO sentinela_manual_writer;
GRANT SELECT (id,status) ON sentinela.categorias_criminais TO sentinela_manual_writer;
GRANT SELECT (id,extracao_id) ON sentinela.linhas_origem,sentinela.execucoes_importacao TO sentinela_manual_writer;
GRANT SELECT (id,fonte) ON sentinela.extracoes_origem TO sentinela_manual_writer;
GRANT SELECT (ocorrencia_id,linha_origem_id) ON sentinela.ocorrencia_naturezas TO sentinela_manual_writer;
GRANT EXECUTE ON FUNCTION sentinela.validar_associacao_mapeada(),sentinela.carimbar_auditoria(),
  sentinela.validar_vinculos_evento(),sentinela.bloquear_autoria_manual_sem_auth() TO sentinela_manual_writer;
CREATE POLICY manual_ra ON sentinela.regioes_administrativas FOR SELECT TO sentinela_manual_writer
  USING (versao_catalogo='SENTINELA_RA_PUBLICO_2026_11_13_V1' AND versao_cartografia='IDE-DF-2026-11-13' AND limite IS NOT NULL);
CREATE POLICY manual_nature ON sentinela.naturezas_criminais FOR SELECT TO sentinela_manual_writer USING (fonte='SENTINELA_MANUAL');
CREATE POLICY manual_occurrence_visible_to_writer ON sentinela.ocorrencias FOR SELECT TO sentinela_manual_writer
  USING (origem='manual' AND fonte='SENTINELA_MANUAL');
CREATE POLICY manual_occurrence_insert ON sentinela.ocorrencias FOR INSERT TO sentinela_manual_writer WITH CHECK (
  origem='manual' AND fonte='SENTINELA_MANUAL' AND identidade_status='manual' AND ativo
  AND consolidacao_status='em_revisao' AND localizacao_status='validada'
  AND session_user IN ('sentinela_local_admin','sentinela_local_operator'));
CREATE POLICY manual_link_insert ON sentinela.ocorrencia_naturezas FOR INSERT TO sentinela_manual_writer WITH CHECK (
  origem='manual' AND linha_origem_id IS NULL AND classificacao_status='pendente' AND mapeamento_id IS NULL
  AND EXISTS(SELECT FROM sentinela.ocorrencias o WHERE o.id=ocorrencia_id)
  AND EXISTS(SELECT FROM sentinela.naturezas_criminais n WHERE n.id=natureza_id));
CREATE POLICY manual_audit_insert ON sentinela.eventos_auditoria FOR INSERT TO sentinela_manual_writer WITH CHECK (
  ator_tipo='servico' AND servico='sentinela-manual-local' AND usuario_id IS NULL AND acao='ocorrencia.manual.criada'
  AND (depois->>'login')=session_user::text AND depois->'localizacaoConfirmada'='true'::jsonb
  AND EXISTS(SELECT FROM sentinela.ocorrencias o WHERE o.id=ocorrencia_id));

CREATE FUNCTION sentinela_ocorrencias_manual.catalogo() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object(
   'regioes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'codigo',codigo_interno,'nome',nome) ORDER BY nome)
     FROM sentinela.regioes_administrativas),'[]'::jsonb),
   'naturezas',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'descricao',descricao_original) ORDER BY descricao_original)
     FROM sentinela.naturezas_criminais),'[]'::jsonb))
 WHERE session_user IN ('sentinela_local_admin','sentinela_local_operator');
$$;

CREATE FUNCTION sentinela_ocorrencias_manual.cadastrar(b jsonb, k uuid, a text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
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
END $$;

CREATE FUNCTION sentinela_ocorrencias_manual.lista(f jsonb, pagina integer, ordenar text, direcao text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
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

CREATE FUNCTION sentinela_ocorrencias_manual.detalhe(registro uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('id',o.id,'identificacao',o.id::text,'fonte',o.fonte,'origem',o.origem,
   'data',o.data_fato,'hora',o.horario_fato::text,'ra',r.nome,'local',o.local,'situacao',o.consolidacao_status,
   'localizacaoStatus',o.localizacao_status,'latitude',o.latitude,'longitude',o.longitude,
   'unidadeApuracao',o.unidade_apuracao,'endereco',c.endereco,
   'naturezas',coalesce((SELECT jsonb_agg(jsonb_build_object('nome',n.descricao_original,
       'classificacao',a.classificacao_status,'crimeTentado',a.crime_tentado) ORDER BY n.descricao_original,a.id)
     FROM sentinela.ocorrencia_naturezas a JOIN sentinela.naturezas_criminais n ON n.id=a.natureza_id
     WHERE a.ocorrencia_id=o.id),'[]'::jsonb))
 FROM sentinela_ocorrencias_manual.cadastros c JOIN sentinela.ocorrencias o ON o.id=c.ocorrencia_id
 LEFT JOIN sentinela.regioes_administrativas r ON r.id=o.ra_id
 WHERE o.id=registro AND o.consolidacao_status='em_revisao';
$$;

ALTER FUNCTION sentinela_ocorrencias_manual.catalogo() OWNER TO sentinela_manual_writer;
ALTER FUNCTION sentinela_ocorrencias_manual.cadastrar(jsonb,uuid,text) OWNER TO sentinela_manual_writer;
ALTER FUNCTION sentinela_ocorrencias_manual.lista(jsonb,integer,text,text) OWNER TO sentinela_manual_reader;
ALTER FUNCTION sentinela_ocorrencias_manual.detalhe(uuid) OWNER TO sentinela_manual_reader;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sentinela_ocorrencias_manual FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_ocorrencias_manual.catalogo(),sentinela_ocorrencias_manual.cadastrar(jsonb,uuid,text)
  TO sentinela_local_admin,sentinela_local_operator;
GRANT EXECUTE ON FUNCTION sentinela_ocorrencias_manual.lista(jsonb,integer,text,text),sentinela_ocorrencias_manual.detalhe(uuid)
  TO sentinela_local_admin,sentinela_local_operator,sentinela_local_analyst;
INSERT INTO sentinela.schema_migrations(versao,descricao) VALUES ('local-manual-0001','Cadastro manual local, transacional e em revisão');
COMMIT;
