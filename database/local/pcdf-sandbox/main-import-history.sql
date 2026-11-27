-- Applied in the same transaction as the shared general-intake migration.
CREATE OR REPLACE FUNCTION sentinela_pcdf_local.history()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
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

CREATE FUNCTION sentinela_pcdf_local.detail(run_id uuid, first_row int)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
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
ALTER FUNCTION sentinela_pcdf_local.detail(uuid,int) OWNER TO sentinela_pcdf_owner;
REVOKE ALL ON FUNCTION sentinela_pcdf_local.detail(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_local.detail(uuid,int) TO sentinela_local_admin,sentinela_local_operator;
