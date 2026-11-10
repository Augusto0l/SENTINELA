-- Read-only, owner-independent application catalog snapshot.
-- Extensions themselves, owners, OIDs and application timestamps are not compared.
SET search_path = pg_catalog;
SELECT jsonb_build_object(
  'tables', (SELECT jsonb_agg(jsonb_build_array(c.relname,c.relrowsecurity,c.relforcerowsecurity) ORDER BY c.relname)
    FROM pg_class c WHERE c.relnamespace='sentinela'::regnamespace AND c.relkind='r'),
  'columns', (SELECT jsonb_agg(jsonb_build_array(c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),
    a.attnotnull,pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated) ORDER BY c.relname,a.attnum)
    FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE c.relnamespace='sentinela'::regnamespace AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped),
  'constraints', (SELECT jsonb_agg(jsonb_build_array(coalesce(c.relname,t.typname),k.conname,k.contype,
    pg_get_constraintdef(k.oid),k.convalidated,k.condeferrable,k.condeferred)
    ORDER BY coalesce(c.relname,t.typname),k.conname)
    FROM pg_constraint k LEFT JOIN pg_class c ON c.oid=k.conrelid LEFT JOIN pg_type t ON t.oid=k.contypid
    WHERE k.connamespace='sentinela'::regnamespace),
  'domains', (SELECT jsonb_agg(jsonb_build_array(t.typname,format_type(t.typbasetype,t.typtypmod),t.typnotnull,t.typdefault)
    ORDER BY t.typname) FROM pg_type t WHERE t.typnamespace='sentinela'::regnamespace AND t.typtype='d'),
  'indexes', (SELECT jsonb_agg(jsonb_build_array(c.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready)
    ORDER BY c.relname) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relnamespace='sentinela'::regnamespace),
  'triggers', (SELECT jsonb_agg(jsonb_build_array(c.relname,t.tgname,pg_get_triggerdef(t.oid),t.tgenabled)
    ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE c.relnamespace='sentinela'::regnamespace AND NOT t.tgisinternal),
  'functions', (SELECT jsonb_agg(jsonb_build_array(p.proname,pg_get_function_identity_arguments(p.oid),
    pg_get_functiondef(p.oid),p.prosecdef,p.proconfig) ORDER BY p.proname,pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p WHERE p.pronamespace='sentinela'::regnamespace),
  'policies', (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname),'[]'::jsonb)
    FROM pg_policies p WHERE p.schemaname='sentinela'),
  'table_external_acl', (SELECT coalesce(jsonb_agg(jsonb_build_array(c.relname,a.grantee::regrole::text,a.privilege_type)
    ORDER BY c.relname,a.grantee,a.privilege_type),'[]'::jsonb)
    FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE c.relnamespace='sentinela'::regnamespace AND c.relkind IN ('r','S') AND a.grantee<>c.relowner),
  'function_external_acl', (SELECT coalesce(jsonb_agg(jsonb_build_array(p.proname,a.grantee::regrole::text,a.privilege_type)
    ORDER BY p.proname,a.grantee,a.privilege_type),'[]'::jsonb)
    FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.pronamespace='sentinela'::regnamespace AND a.grantee<>p.proowner),
  'schema_external_acl', (SELECT coalesce(jsonb_agg(jsonb_build_array(a.grantee::regrole::text,a.privilege_type)
    ORDER BY a.grantee,a.privilege_type),'[]'::jsonb)
    FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
    WHERE n.nspname='sentinela' AND a.grantee<>n.nspowner)
);
