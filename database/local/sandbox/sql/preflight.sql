\ir guard.sql
-- Read-only assertions inside the caller's transaction. No role or application DDL here.
DO $preflight$
DECLARE item record;
BEGIN
  IF current_database() <> 'sentinela_rls_sandbox'
    OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
    OR inet_server_port() IS DISTINCT FROM 55432 OR current_user <> 'postgres'
    OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION 'Only the approved local database and local maintenance executor are allowed.';
  END IF;
  IF current_setting('server_version_num')::int < 170011
    OR current_setting('server_version_num')::int >= 180000
    OR current_setting('server_encoding') <> 'UTF8' THEN
    RAISE EXCEPTION 'Expected PostgreSQL 17.11+ (17.x), UTF8.';
  END IF;
  IF obj_description(to_regnamespace('sentinela'),'pg_namespace') IS DISTINCT FROM
    'sentinela:supabase-baseline-v1:logical-0001-0005' THEN
    RAISE EXCEPTION 'Approved baseline marker required.';
  END IF;
  IF (SELECT array_agg(versao ORDER BY versao) FROM sentinela.schema_migrations)
    IS DISTINCT FROM ARRAY['0001','0002','0003','0004','0005']::text[] THEN
    RAISE EXCEPTION 'Expected exactly 0001-0005; no replay, 0006 or fabricated versions.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN ('auth','sentinela_api','sentinela_private'))
    OR EXISTS(SELECT 1 FROM pg_event_trigger) THEN
    RAISE EXCEPTION 'Unexpected Auth/API schema or event trigger: review instead of adapting.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
    WHERE e.extname='postgis' AND n.nspname='extensions' AND split_part(e.extversion,'.',1)::int=3
    AND split_part(e.extversion,'.',2)::int>=3) THEN
    RAISE EXCEPTION 'PostGIS 3.3+ in extensions required.';
  END IF;
  IF (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r') <> 19
    OR (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r'
      AND relrowsecurity AND relforcerowsecurity) <> 19
    OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='sentinela') THEN
    RAISE EXCEPTION 'Expected 19 protected tables and no preexisting policies.';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE connamespace='sentinela'::regnamespace AND contype='f' AND convalidated) <> 34
    OR (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
      WHERE c.relnamespace='sentinela'::regnamespace AND i.indisvalid AND i.indisready) <> 77
    OR (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE c.relnamespace='sentinela'::regnamespace AND NOT t.tgisinternal AND t.tgenabled='O') <> 55
    OR (SELECT count(*) FROM pg_proc WHERE pronamespace='sentinela'::regnamespace AND NOT prosecdef) <> 17 THEN
    RAISE EXCEPTION 'Baseline structural counts changed.';
  END IF;
  IF (SELECT md5(string_agg(conname::text||':'||contype::text||':'||convalidated::text||':'||
      conrelid::regclass::text||':'||pg_get_constraintdef(oid),E'\n' ORDER BY conname,conrelid))
      FROM pg_constraint WHERE connamespace='sentinela'::regnamespace)
      <> '4b5ef7adc546d5850292f4c861630692' THEN
    RAISE EXCEPTION 'Constraint definitions changed, including intentional NOT VALID checks.';
  END IF;
  -- Exact names, types and nullability verified by read-only catalog inspection.
  FOR item IN SELECT * FROM (VALUES
    ('categorias_criminais','id','uuid',true),
    ('categorias_criminais','codigo_interno','sentinela.texto_obrigatorio',false),
    ('categorias_criminais','nome','sentinela.texto_obrigatorio',true),
    ('categorias_criminais','versao_catalogo','sentinela.texto_obrigatorio',true),
    ('categorias_criminais','status','text',true),
    ('categorias_criminais','evidencia_homologacao','text',false),
    ('mapeamentos_natureza','id','uuid',true),
    ('mapeamentos_natureza','natureza_id','uuid',true),
    ('mapeamentos_natureza','versao','sentinela.texto_obrigatorio',true),
    ('mapeamentos_natureza','crime_tentado','boolean',false),
    ('mapeamentos_natureza','categoria_id','uuid',false),
    ('mapeamentos_natureza','status','text',true),
    ('mapeamentos_natureza','evidencia_homologacao','text',false),
    ('naturezas_criminais','id','uuid',true),
    ('naturezas_criminais','fonte','sentinela.texto_obrigatorio',true),
    ('naturezas_criminais','descricao_original','text',true),
    ('naturezas_criminais','categoria_pcdf_original','text',false),
    ('ocorrencia_naturezas','id','uuid',true),
    ('ocorrencia_naturezas','ocorrencia_id','uuid',true),
    ('ocorrencia_naturezas','natureza_id','uuid',true),
    ('ocorrencia_naturezas','origem','text',true),
    ('ocorrencia_naturezas','linha_origem_id','uuid',false),
    ('ocorrencia_naturezas','crime_tentado','boolean',false),
    ('ocorrencia_naturezas','classificacao_status','text',true),
    ('ocorrencia_naturezas','mapeamento_id','uuid',false),
    ('ocorrencia_naturezas','versao','bigint',true),
    ('ocorrencia_naturezas','criado_em','timestamp with time zone',true),
    ('ocorrencia_naturezas','atualizado_em','timestamp with time zone',true),
    ('ocorrencias','id','uuid',true),
    ('ocorrencias','origem','text',true),
    ('ocorrencias','fonte','sentinela.texto_obrigatorio',true),
    ('ocorrencias','ano_registro','text',false),
    ('ocorrencias','unidade_registro','text',false),
    ('ocorrencias','numero_registro','text',false),
    ('ocorrencias','versao_identidade','sentinela.texto_obrigatorio',true),
    ('ocorrencias','identidade_status','text',true),
    ('ocorrencias','evidencia_identidade','text',false),
    ('ocorrencias','data_fato','date',false),
    ('ocorrencias','horario_fato','time(0) without time zone',false),
    ('ocorrencias','ra_id','uuid',false),
    ('ocorrencias','local','text',false),
    ('ocorrencias','flagrante','boolean',false),
    ('ocorrencias','unidade_apuracao','text',false),
    ('ocorrencias','latitude','double precision',false),
    ('ocorrencias','longitude','double precision',false),
    ('ocorrencias','localizacao_status','text',true),
    ('ocorrencias','referencia_espacial_confirmada','text',false),
    ('ocorrencias','regra_transformacao','text',false),
    ('ocorrencias','geometria','extensions.geometry(Point,4326)',false),
    ('ocorrencias','consolidacao_status','text',true),
    ('ocorrencias','ativo','boolean',true),
    ('ocorrencias','versao','bigint',true),
    ('ocorrencias','criado_em','timestamp with time zone',true),
    ('ocorrencias','atualizado_em','timestamp with time zone',true),
    ('regioes_administrativas','id','uuid',true),
    ('regioes_administrativas','codigo_interno','sentinela.texto_obrigatorio',true),
    ('regioes_administrativas','codigo_oficial','text',false),
    ('regioes_administrativas','nome','sentinela.texto_obrigatorio',true),
    ('regioes_administrativas','versao_catalogo','sentinela.texto_obrigatorio',true),
    ('regioes_administrativas','vigencia','daterange',true),
    ('regioes_administrativas','versao_cartografia','text',false),
    ('regioes_administrativas','evidencia_referencia_espacial','text',false),
    ('regioes_administrativas','limite','extensions.geometry(MultiPolygon,4326)',false)
  ) AS expected(table_name,column_name,type_name,required) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      WHERE c.relnamespace='sentinela'::regnamespace AND c.relname=item.table_name
      AND a.attname=item.column_name AND a.attnum>0 AND NOT a.attisdropped
      AND format_type(a.atttypid,a.atttypmod)=item.type_name AND a.attnotnull=item.required) THEN
      RAISE EXCEPTION 'Column/type/nullability drift: %.%',item.table_name,item.column_name;
    END IF;
  END LOOP;
END $preflight$;
