-- Metadata only; no table data, password, role secrets or persistent operations.
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SELECT jsonb_build_object(
 'identity',jsonb_build_object('database',current_database(),'host',host(inet_server_addr()),'port',inet_server_port(),'executor',current_user,'version',current_setting('server_version'),'readonly',current_setting('transaction_read_only')),
 'extensions',(SELECT jsonb_agg(jsonb_build_array(e.extname,e.extversion,n.nspname) ORDER BY e.extname) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace),
 'types',(SELECT jsonb_agg(jsonb_build_array(t.typname,t.typtype,format_type(t.typbasetype,t.typtypmod),t.typnotnull,t.typdefault,
  (SELECT coalesce(jsonb_agg(pg_get_constraintdef(k.oid,true) ORDER BY k.conname),'[]') FROM pg_constraint k WHERE k.contypid=t.oid)) ORDER BY t.typname)
  FROM pg_type t WHERE t.typnamespace='sentinela'::regnamespace AND t.typtype='d'),
 'tables',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relowner::regrole::text,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='sentinela' AND c.relkind='r'),
 'columns',(SELECT jsonb_agg(jsonb_build_array(c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE c.relnamespace='sentinela'::regnamespace AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(c.relname,k.conname,k.contype,k.convalidated,pg_get_constraintdef(k.oid,true)) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE c.relnamespace='sentinela'::regnamespace),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(c.relname,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid)) ORDER BY c.relname) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relnamespace='sentinela'::regnamespace),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true)) ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='sentinela'::regnamespace AND NOT t.tgisinternal),
 'functions',(SELECT jsonb_agg(jsonb_build_array(p.proname,pg_get_function_identity_arguments(p.oid),p.proowner::regrole::text,p.prosecdef,p.proacl::text,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')) ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p WHERE p.pronamespace='sentinela'::regnamespace),
 'policies',(SELECT jsonb_agg(jsonb_build_array(tablename,policyname,permissive,roles,cmd,qual,with_check) ORDER BY tablename,policyname) FROM pg_policies WHERE schemaname='sentinela'),
 'column_grants',(SELECT jsonb_agg(jsonb_build_array(c.relname,a.attname,x.grantee::regrole::text,x.privilege_type,x.is_grantable) ORDER BY c.relname,a.attname,x.grantee::regrole::text,x.privilege_type) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE c.relnamespace='sentinela'::regnamespace),
 'reader',(SELECT jsonb_build_object('login',rolcanlogin,'superuser',rolsuper,'bypassrls',rolbypassrls,'createdb',rolcreatedb,'createrole',rolcreaterole,'replication',rolreplication,'inherit',rolinherit,'limit',rolconnlimit) FROM pg_roles WHERE rolname='sentinela_local_reader'),
 'memberships',(SELECT coalesce(jsonb_agg(jsonb_build_array(a.rolname,b.rolname,m.admin_option) ORDER BY a.rolname,b.rolname),'[]') FROM pg_auth_members m JOIN pg_roles a ON a.oid=m.roleid JOIN pg_roles b ON b.oid=m.member WHERE a.rolname='sentinela_local_reader' OR b.rolname='sentinela_local_reader'),
 'schema_acl',(SELECT jsonb_agg(jsonb_build_array(n.nspname,n.nspowner::regrole::text,n.nspacl::text) ORDER BY n.nspname) FROM pg_namespace n WHERE n.nspname IN ('sentinela','extensions','sentinela_api','sentinela_private','sentinela_geo_lab')),
 'defaults',(SELECT coalesce(jsonb_agg(jsonb_build_array(d.defaclrole::regrole::text,n.nspname,d.defaclobjtype,d.defaclacl::text) ORDER BY d.defaclrole,n.nspname,d.defaclobjtype),'[]') FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname='sentinela'),
 'ra_dependencies',(SELECT jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid,true)) ORDER BY conrelid::regclass::text,conname) FROM pg_constraint WHERE contype='f' AND confrelid='sentinela.regioes_administrativas'::regclass),
 'binding_structures',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname) ORDER BY n.nspname,c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND (c.relname IN ('bindings','binding_versions','catalog_geometries','catalog_loads') OR n.nspname='sentinela_geo_lab'))
);
COMMIT;
