-- The deferred history trigger serializes geometry under the authenticated writer.
DO $guard$
BEGIN
  IF current_database()<>'sentinela_sprint4_homologacao' OR session_user<>'sprint4_migration'
     OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1' OR inet_server_port() IS DISTINCT FROM 55473
     OR current_setting('server_version_num')<>'170011'
     OR sentinela_homologacao.system_identifier()<>'7709847064550752852'
     OR (SELECT array_agg(versao ORDER BY versao) FROM sentinela.schema_migrations) IS DISTINCT FROM
       ARRAY['0001','0002','0003','0004','0005','homolog-persist-0001','homolog-persist-0002','homolog-persist-0003']
  THEN RAISE EXCEPTION 'Destino de homologacao recusado'; END IF;
END;
$guard$;
GRANT USAGE ON SCHEMA extensions TO s4_hom_admin_write,s4_hom_operator_write;
GRANT SELECT(srid,auth_name,auth_srid) ON extensions.spatial_ref_sys TO s4_hom_admin_write,s4_hom_operator_write;
INSERT INTO sentinela.schema_migrations(versao,descricao)
VALUES ('homolog-persist-0004','Metadados PostGIS para a serializacao diferida do historico');
