SELECT
 (SELECT array_agg(versao ORDER BY versao COLLATE "C") FROM sentinela.schema_migrations) AS ledger,
 to_regnamespace('sentinela_ra_catalog') IS NOT NULL AS installed,
 EXISTS (
   SELECT FROM pg_attribute WHERE attrelid = 'sentinela.regioes_administrativas'::regclass
   AND attname = 'referencia_cartografica' AND NOT attisdropped
 ) AS has_reference,
 (
   SELECT count(*) = 2 AND bool_and(convalidated AND contype = 'c')
   FROM pg_constraint WHERE conrelid = 'sentinela.regioes_administrativas'::regclass
   AND conname IN ('ra_reference_official_v1', 'ra_public_reference_required_official_v1')
 ) AS reference_checks,
 (SELECT count(*)::int FROM sentinela.regioes_administrativas) AS total,
 (SELECT count(DISTINCT codigo_interno)::int FROM sentinela.regioes_administrativas) AS distinct_codes,
 (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'sentinela') AS policies,
 (
   SELECT count(*) = 2 AND count(*) FILTER (WHERE NOT polpermissive) = 1
   FROM pg_policy WHERE polrelid = 'sentinela.regioes_administrativas'::regclass
   AND polcmd = 'r' AND polroles = ARRAY['sentinela_local_reader'::regrole::oid]
   AND ((polname = 'local_reader_regioes_public_official_v1' AND polpermissive)
     OR (polname = 'local_reader_regioes_gate_official_v1' AND NOT polpermissive))
   AND pg_get_expr(polqual, polrelid) LIKE '%sentinela_ra_catalog.approved_reference%'
   AND pg_get_expr(polqual, polrelid) LIKE '%SENTINELA_RA_PUBLICO_2026_11_13_V1%'
 ) AS official_policies,
 (
   SELECT count(*) = 19 AND bool_and(relrowsecurity AND relforcerowsecurity)
   FROM pg_class WHERE relnamespace = 'sentinela'::regnamespace AND relkind = 'r'
 ) AND NOT row_security_active('sentinela.regioes_administrativas'::regclass)
 AND EXISTS (
   SELECT FROM pg_roles r WHERE rolname = 'sentinela_local_reader'
   AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)
   AND NOT EXISTS (SELECT FROM pg_auth_members WHERE member = r.oid OR roleid = r.oid)
 ) AND EXISTS (
   SELECT FROM pg_constraint
   WHERE conrelid = 'sentinela.regioes_administrativas'::regclass
     AND contype = 'u' AND convalidated
     AND pg_get_constraintdef(oid) = 'UNIQUE (codigo_interno, versao_catalogo)'
 ) AND EXISTS (
   SELECT FROM pg_trigger
   WHERE tgrelid = 'sentinela.regioes_administrativas'::regclass
     AND tgname = 'imutavel' AND tgenabled = 'O'
 ) AND EXISTS (
   SELECT FROM pg_policy WHERE polrelid = 'sentinela.regioes_administrativas'::regclass
   AND polname = 'local_reader_regioes' AND polcmd = 'r' AND polpermissive
   AND polroles = ARRAY['sentinela_local_reader'::regrole::oid]
   AND pg_get_expr(polqual, polrelid) =
       '((versao_catalogo)::text = ''SENTINELA_TESTE_LOCAL_V1''::text)'
 ) AND NOT has_any_column_privilege('sentinela_local_reader','sentinela.regioes_administrativas','INSERT,UPDATE')
   AND NOT has_table_privilege('sentinela_local_reader','sentinela.regioes_administrativas','DELETE,TRUNCATE')
   AND NOT has_column_privilege('sentinela_local_reader','sentinela.regioes_administrativas','limite','SELECT')
   AND NOT has_table_privilege('sentinela_local_reader','sentinela.schema_migrations','SELECT')
 AS protected;
