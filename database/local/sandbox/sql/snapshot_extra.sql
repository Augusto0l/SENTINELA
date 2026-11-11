-- Read-only; suitable for separately approved operational reference export too.
SET search_path=pg_catalog;
SELECT jsonb_build_object(
'snapshot_version',2,
'database',current_database(),
'identity',jsonb_build_object('host',host(inet_server_addr()),'port',inet_server_port(),
 'system_id',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()),
 'sandbox_uuid',current_setting('sentinela.sandbox_uuid',true),'data',current_setting('data_directory'),
 'server_version_num',current_setting('server_version_num')::integer,'user',current_user),
'encoding',(SELECT pg_catalog.pg_encoding_to_char(d.encoding) FROM pg_catalog.pg_database d WHERE d.datname=current_database()),
'locale',(SELECT jsonb_build_object('datcollate',d.datcollate,'datctype',d.datctype,
 'datlocprovider',d.datlocprovider,'datlocale',d.datlocale)
 FROM pg_catalog.pg_database d WHERE d.datname=current_database()),
'postgis',(SELECT jsonb_build_array(e.extversion,n.nspname) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='postgis'),
'ledger',(SELECT jsonb_agg(to_jsonb(s) ORDER BY versao) FROM sentinela.schema_migrations s),
'column_grants',(SELECT coalesce(jsonb_agg(jsonb_build_array(c.relname,a.attname,x.grantee::regrole::text,x.privilege_type,x.is_grantable) ORDER BY c.relname,a.attname,x.grantee::regrole::text,x.privilege_type),'[]') FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE c.relnamespace='sentinela'::regnamespace),
'database_acl',(SELECT jsonb_agg(jsonb_build_array(x.grantee::regrole::text,x.privilege_type,x.is_grantable) ORDER BY x.grantee::regrole::text,x.privilege_type) FROM pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) x WHERE d.datname=current_database()),
'default_acl',(SELECT coalesce(jsonb_agg(jsonb_build_array(d.defaclrole::regrole::text,n.nspname,d.defaclobjtype,x.grantee::regrole::text,x.privilege_type,x.is_grantable) ORDER BY d.defaclrole::regrole::text,n.nspname,d.defaclobjtype,x.grantee::regrole::text,x.privilege_type),'[]') FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace CROSS JOIN LATERAL aclexplode(d.defaclacl) x WHERE n.nspname='sentinela'),
'column_collation',(SELECT jsonb_agg(jsonb_build_array(c.relname,a.attname,n.nspname,co.collname) ORDER BY c.relname,a.attname) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_collation co ON co.oid=a.attcollation JOIN pg_namespace n ON n.oid=co.collnamespace WHERE c.relnamespace='sentinela'::regnamespace AND a.attnum>0 AND NOT a.attisdropped),
'roles',(SELECT jsonb_agg(jsonb_build_array(rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,rolinherit,rolconnlimit,rolconfig)) FROM pg_roles WHERE rolname='sentinela_local_reader'),
'schema_config',(SELECT jsonb_agg(jsonb_build_array(n.nspname,n.nspowner::regrole::text,x.grantee::regrole::text,x.privilege_type,x.is_grantable) ORDER BY n.nspname,x.grantee::regrole::text,x.privilege_type) FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) x WHERE n.nspname='sentinela'),
'object_acl',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relowner::regrole::text,x.grantee::regrole::text,x.privilege_type,x.is_grantable) ORDER BY c.relname,x.grantee::regrole::text,x.privilege_type) FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x WHERE c.relnamespace='sentinela'::regnamespace AND c.relkind='r'),
'function_acl',(SELECT jsonb_agg(jsonb_build_array(p.proname,pg_get_function_identity_arguments(p.oid),p.proowner::regrole::text,x.grantee::regrole::text,x.privilege_type,x.is_grantable) ORDER BY p.proname,pg_get_function_identity_arguments(p.oid),x.grantee::regrole::text,x.privilege_type) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x WHERE p.pronamespace='sentinela'::regnamespace),
'memberships',(SELECT coalesce(jsonb_agg(jsonb_build_array(a.rolname,b.rolname,m.admin_option,m.inherit_option,m.set_option) ORDER BY a.rolname,b.rolname),'[]') FROM pg_auth_members m JOIN pg_roles a ON a.oid=m.roleid JOIN pg_roles b ON b.oid=m.member WHERE a.rolname='sentinela_local_reader' OR b.rolname='sentinela_local_reader'));
