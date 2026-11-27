-- Migration aditiva. Instalar com o UUID do manifesto atestado (psql -v expected_uuid=...).
BEGIN;
SELECT set_config('sentinela.ocorrencias_expected_uuid', :'expected_uuid', true);
DO $guard$
BEGIN
  IF current_database() <> 'sentinela_pcdf_local' OR host(inet_server_addr()) <> '127.0.0.1'
    OR inet_server_port() NOT IN (55484,55486)
    OR current_setting('sentinela.sandbox_uuid',true) IS DISTINCT FROM current_setting('sentinela.ocorrencias_expected_uuid')
    OR to_regprocedure('sentinela_pcdf_local.detail(uuid,integer)') IS NULL
  THEN RAISE EXCEPTION 'Cluster local de importação atestado obrigatório'; END IF;
END
$guard$;

CREATE ROLE sentinela_ocorrencias_reader NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
CREATE SCHEMA sentinela_ocorrencias_local AUTHORIZATION sentinela_ocorrencias_reader;
REVOKE ALL ON SCHEMA sentinela_ocorrencias_local FROM PUBLIC;
GRANT USAGE ON SCHEMA sentinela_ocorrencias_local TO sentinela_local_admin,sentinela_local_operator,sentinela_local_analyst;
GRANT USAGE ON SCHEMA sentinela TO sentinela_ocorrencias_reader;
GRANT SELECT ON sentinela.extracoes_origem,sentinela.lotes_importacao,sentinela.execucoes_importacao,
  sentinela.linhas_origem,sentinela.linhas_staging,sentinela.pendencias_revisao,sentinela.ocorrencias,
  sentinela.ocorrencia_naturezas,sentinela.naturezas_criminais,sentinela.regioes_administrativas
  TO sentinela_ocorrencias_reader;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO sentinela_ocorrencias_reader;

-- O acesso a origem/staging segue os logins que já podiam consultar o detalhe PCDF.
CREATE POLICY ocorrencias_read_extracoes ON sentinela.extracoes_origem FOR SELECT TO sentinela_ocorrencias_reader
  USING (session_user IN ('sentinela_local_admin','sentinela_local_operator')
    AND fonte='PCDF' AND metodologia='pcdf-csv-local-v1');
CREATE POLICY ocorrencias_read_lotes ON sentinela.lotes_importacao FOR SELECT TO sentinela_ocorrencias_reader
  USING (versao_contrato='1.0' AND EXISTS (SELECT FROM sentinela.extracoes_origem x WHERE x.id=lotes_importacao.extracao_id));
CREATE POLICY ocorrencias_read_execucoes ON sentinela.execucoes_importacao FOR SELECT TO sentinela_ocorrencias_reader
  USING (status='concluida' AND versao_importador='pcdf-local-v1'
    AND EXISTS (SELECT FROM sentinela.lotes_importacao l WHERE l.id=execucoes_importacao.lote_id));
CREATE POLICY ocorrencias_read_origem ON sentinela.linhas_origem FOR SELECT TO sentinela_ocorrencias_reader
  USING (versao_identificador='pcdf-linha-v1' AND EXISTS (SELECT FROM sentinela.extracoes_origem x WHERE x.id=linhas_origem.extracao_id));
CREATE POLICY ocorrencias_read_staging ON sentinela.linhas_staging FOR SELECT TO sentinela_ocorrencias_reader
  USING (EXISTS (SELECT FROM sentinela.execucoes_importacao e WHERE e.id=linhas_staging.execucao_id));
CREATE POLICY ocorrencias_read_pendencias ON sentinela.pendencias_revisao FOR SELECT TO sentinela_ocorrencias_reader
  USING (versao_regra='pcdf-local-v1' AND EXISTS (SELECT FROM sentinela.linhas_origem o WHERE o.id=pendencias_revisao.linha_origem_id));
CREATE POLICY ocorrencias_read_consolidadas ON sentinela.ocorrencias FOR SELECT TO sentinela_ocorrencias_reader
  USING (session_user IN ('sentinela_local_admin','sentinela_local_operator','sentinela_local_analyst')
    AND ativo AND consolidacao_status='consolidada');
CREATE POLICY ocorrencias_read_associacoes ON sentinela.ocorrencia_naturezas FOR SELECT TO sentinela_ocorrencias_reader
  USING (EXISTS (SELECT FROM sentinela.ocorrencias o WHERE o.id=ocorrencia_naturezas.ocorrencia_id));
CREATE POLICY ocorrencias_read_naturezas ON sentinela.naturezas_criminais FOR SELECT TO sentinela_ocorrencias_reader USING (true);
CREATE POLICY ocorrencias_read_ra ON sentinela.regioes_administrativas FOR SELECT TO sentinela_ocorrencias_reader USING (true);

SET LOCAL ROLE sentinela_ocorrencias_reader;
SET LOCAL search_path TO pg_catalog, pg_temp;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE VIEW sentinela_ocorrencias_local.importados WITH (security_invoker=true) AS
 SELECT s.id, s.linha_origem_id AS origem_id,
   nullif(concat_ws(' / ',nullif(o.ano_registro,''),nullif(o.unidade_registro,''),nullif(o.numero_registro,'')),'') AS identificacao,
   (s.derivados_efetivos->>'data')::date AS data, s.derivados_efetivos->>'horario' AS hora,
   nullif(o.natureza_original,'') AS natureza, nullif(o.natureza_padronizada_pcdf,'') AS padronizada,
   nullif(o.ra_original,'') AS ra, coalesce(s.derivados_efetivos->>'local',nullif(s.campos_csv->>'local','')) AS local,
   s.estado AS situacao, l.id AS lote, l.nome_arquivo AS arquivo, to_char(l.competencia,'YYYY-MM') AS competencia,
   s.execucao_id AS execucao, s.registro_csv AS ordinal
 FROM sentinela.linhas_staging s
 JOIN sentinela.linhas_origem o ON (o.id,o.extracao_id)=(s.linha_origem_id,s.extracao_id)
 JOIN sentinela.lotes_importacao l ON l.id=s.lote_id;

CREATE VIEW sentinela_ocorrencias_local.consolidadas WITH (security_invoker=true) AS
 SELECT o.id, null::uuid AS origem_id,
   nullif(concat_ws(' / ',nullif(o.ano_registro,''),nullif(o.unidade_registro,''),nullif(o.numero_registro,'')),'') AS identificacao,
   o.data_fato AS data, o.horario_fato::text AS hora, null::text AS natureza, null::text AS padronizada,
   r.nome AS ra, o.local, o.consolidacao_status AS situacao, null::uuid AS lote, null::text AS arquivo,
   null::text AS competencia, null::uuid AS execucao, null::bigint AS ordinal
 FROM sentinela.ocorrencias o LEFT JOIN sentinela.regioes_administrativas r ON r.id=o.ra_id;

CREATE FUNCTION sentinela_ocorrencias_local.identidade()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('system',(SELECT system_identifier::text FROM pg_control_system()),
   'uuid',current_setting('sentinela.sandbox_uuid',true),
   'started',extract(epoch FROM pg_postmaster_start_time())::bigint::text,
   'readonly',current_setting('transaction_read_only'),'db',current_database(),
   'host',host(inet_server_addr()),'port',inet_server_port(),'login',session_user,
   'postgis',(SELECT extversion FROM pg_extension WHERE extname='postgis' AND extnamespace='extensions'::regnamespace),
   'version',current_setting('server_version_num'))
 WHERE session_user IN ('sentinela_local_admin','sentinela_local_operator','sentinela_local_analyst')
   AND (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace
      AND relkind='r' AND relrowsecurity AND relforcerowsecurity)=19
   AND NOT EXISTS(SELECT FROM pg_roles r WHERE r.rolname IN (current_user,session_user)
     AND (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolinherit
       OR EXISTS (SELECT FROM pg_auth_members m WHERE r.oid IN (m.roleid,m.member))))
   AND NOT EXISTS(SELECT FROM pg_class c WHERE c.relnamespace='sentinela'::regnamespace AND c.relkind='r'
     AND (has_table_privilege(c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
       OR has_any_column_privilege(c.oid,'INSERT,UPDATE,REFERENCES')))
$$;

CREATE FUNCTION sentinela_ocorrencias_local.resumo()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
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
      ORDER BY n.descricao_original,n.id) FROM sentinela.naturezas_criminais n
      WHERE EXISTS(SELECT FROM sentinela.ocorrencia_naturezas a WHERE a.natureza_id=n.id)),'[]'::jsonb))
 FROM permit
$$;

CREATE FUNCTION sentinela_ocorrencias_local.lista(modo text, filtros jsonb, pagina integer, ordenar text, direcao text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
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
          WHERE a.ocorrencia_id=p.id AND a.natureza_id=($1->>'naturezaId')::uuid))
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
$$;

CREATE FUNCTION sentinela_ocorrencias_local.detalhe(modo text, registro uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF modo='importados' THEN
    IF session_user NOT IN ('sentinela_local_admin','sentinela_local_operator') THEN
      RAISE EXCEPTION USING ERRCODE='42501';
    END IF;
    RETURN (SELECT jsonb_build_object('origemId',i.origem_id,'stagingId',i.id,
      'lote',i.lote,'execucao',i.execucao,'arquivo',i.arquivo,'competencia',i.competencia,'ordinal',i.ordinal,
      'situacao',i.situacao,'campos',s.campos_csv,'pendencias',coalesce((
        SELECT jsonb_agg(jsonb_build_object('campo',p.campo,'regra',p.regra,'motivo',p.motivo,
          'prioridade',p.prioridade,'situacao',p.status) ORDER BY p.campo,p.regra,p.id)
        FROM sentinela.pendencias_revisao p WHERE p.linha_origem_id=i.origem_id),'[]'::jsonb))
      FROM sentinela_ocorrencias_local.importados i JOIN sentinela.linhas_staging s ON s.id=i.id
      WHERE i.id=registro);
  ELSIF modo='consolidadas' THEN
    RETURN (SELECT jsonb_build_object('id',o.id,'identificacao',c.identificacao,'fonte',o.fonte,'origem',o.origem,
      'data',c.data,'hora',c.hora,'ra',c.ra,'local',c.local,'localizacaoStatus',o.localizacao_status,
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

RESET ROLE;
GRANT EXECUTE ON FUNCTION sentinela_ocorrencias_local.identidade(),sentinela_ocorrencias_local.resumo(),
  sentinela_ocorrencias_local.lista(text,jsonb,integer,text,text),sentinela_ocorrencias_local.detalhe(text,uuid)
  TO sentinela_local_admin,sentinela_local_operator,sentinela_local_analyst;
COMMIT;
