-- Run inside the transaction opened by install.mjs. Independent of sandbox and operational migrations.
DO $guard$
BEGIN
  IF current_database() <> 'sentinela_sprint4_homologacao'
     OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1' OR inet_server_port() IS DISTINCT FROM 55473
     OR session_user <> 'sprint4_migration' OR current_user <> session_user
     OR current_setting('cluster_name') <> 'sentinela-sprint4-homologacao'
     OR current_setting('listen_addresses') <> '127.0.0.1'
     OR current_setting('server_version_num') <> '170011'
     OR (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) <> '7709847064550752852'
     OR NOT EXISTS (SELECT FROM pg_extension WHERE extname='postgis' AND extversion='3.6.2'
                     AND extnamespace='extensions'::regnamespace) THEN
    RAISE EXCEPTION 'Destino de homologacao recusado';
  END IF;
END;
$guard$;
SELECT pg_advisory_xact_lock(743204, 41);

DO $baseline$
BEGIN
  IF (SELECT array_agg(versao ORDER BY versao) FROM sentinela.schema_migrations)
       IS DISTINCT FROM ARRAY['0001','0002','0003','0004','0005']
     OR (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r'
           AND relrowsecurity AND relforcerowsecurity AND relowner=current_user::regrole) <> 19
     OR EXISTS (SELECT FROM pg_policy WHERE polrelid IN
           (SELECT oid FROM pg_class WHERE relnamespace='sentinela'::regnamespace))
     OR (SELECT array_agg(conname::text ORDER BY conname) FROM pg_constraint
           WHERE connamespace='sentinela'::regnamespace AND NOT convalidated) IS DISTINCT FROM
           ARRAY['correcao_nova_transacao_ck','evento_novo_transacao_ck']
     OR EXISTS (SELECT FROM sentinela.regioes_administrativas)
     OR EXISTS (SELECT FROM sentinela.ocorrencias)
     OR EXISTS (SELECT FROM pg_roles WHERE rolname IN
           ('sprint4_homolog_admin_read','sprint4_homolog_operator_read','sprint4_homolog_analyst_read'))
     OR EXISTS (SELECT FROM pg_database WHERE datallowconn AND NOT datistemplate AND datname NOT IN
           ('postgres','sentinela_sprint4_homologacao','sentinela_sprint4_restore')) THEN
    RAISE EXCEPTION 'Baseline ou inventario inesperado';
  END IF;
END;
$baseline$;

CREATE SCHEMA sentinela_homologacao;
REVOKE ALL ON SCHEMA sentinela_homologacao FROM PUBLIC;

ALTER TABLE sentinela.regioes_administrativas ADD COLUMN referencia_cartografica jsonb;
ALTER TABLE sentinela.regioes_administrativas ADD CONSTRAINT ra_homologacao_referencia_ck
  CHECK (versao_catalogo <> 'SENTINELA_RA_PUBLICO_2026_11_13_V1' OR (
    codigo_oficial IS NULL AND lower_inf(vigencia) AND upper_inf(vigencia) AND limite IS NOT NULL
    AND versao_cartografia IS NOT DISTINCT FROM 'IDE-DF-2026-11-13'
    AND coalesce(referencia_cartografica @> jsonb_build_object(
      'ideCode',codigo_interno,'packageVersion','ra-public-sandbox-2026-11-13-v2',
      'approvalStatus','approved','legalValidityStatus','unknown','validFrom',NULL,'validTo',NULL,
      'sourceHash','fd13e671d7660ba6fe2703ff69ba82e8ccb30e7cbc09f2887bfcdd4c69d28553',
      'extractedOn','2026-11-13'),false)
  ));

INSERT INTO sentinela.regioes_administrativas
  (id,codigo_interno,nome,versao_catalogo,vigencia,limite,versao_cartografia,
   evidencia_referencia_espacial,referencia_cartografica)
SELECT id,code,label,'SENTINELA_RA_PUBLICO_2026_11_13_V1',daterange(NULL,NULL,'()'),
  extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(geometry),4326)),
  'IDE-DF-2026-11-13','ra-review-2026-11-13-v1; extraction-only; legal validity unknown',metadata
FROM jsonb_to_recordset(current_setting('sentinela.homolog_catalog')::jsonb)
  AS source(id uuid,code text,label text,metadata jsonb,geometry jsonb)
ORDER BY code COLLATE "C";

SET LOCAL password_encryption = 'scram-sha-256';
DO $readers$
DECLARE login_name text; login_password text;
BEGIN
  FOREACH login_name IN ARRAY ARRAY[
    'sprint4_homolog_admin_read','sprint4_homolog_operator_read','sprint4_homolog_analyst_read']
  LOOP
    login_password := current_setting('sentinela.homolog_passwords')::jsonb->>login_name;
    IF login_password IS NULL OR login_password !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'Credencial de leitura ausente ou invalida';
    END IF;
    EXECUTE format('CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5 PASSWORD %L',login_name,login_password);
    EXECUTE format('ALTER ROLE %I IN DATABASE sentinela_sprint4_homologacao
      SET default_transaction_read_only=on',login_name);
  END LOOP;
END;
$readers$;

-- The readers only have CONNECT on the attested database inside this cluster.
REVOKE CONNECT, TEMPORARY ON DATABASE postgres, template1 FROM PUBLIC;
REVOKE ALL ON DATABASE sentinela_sprint4_homologacao FROM PUBLIC;
GRANT CONNECT ON DATABASE sentinela_sprint4_homologacao TO
  sprint4_homolog_admin_read,sprint4_homolog_operator_read,sprint4_homolog_analyst_read;
GRANT USAGE ON SCHEMA sentinela, sentinela_homologacao TO
  sprint4_homolog_admin_read,sprint4_homolog_operator_read,sprint4_homolog_analyst_read;

GRANT SELECT (id,origem,fonte,ano_registro,unidade_registro,numero_registro,identidade_status,
  data_fato,horario_fato,ra_id,local,latitude,longitude,localizacao_status,consolidacao_status,
  ativo,versao,criado_em,atualizado_em) ON sentinela.ocorrencias TO
  sprint4_homolog_admin_read,sprint4_homolog_operator_read,sprint4_homolog_analyst_read;
GRANT SELECT (id,ocorrencia_id,natureza_id,crime_tentado,classificacao_status,mapeamento_id)
  ON sentinela.ocorrencia_naturezas TO
  sprint4_homolog_admin_read,sprint4_homolog_operator_read,sprint4_homolog_analyst_read;
GRANT SELECT (id,descricao_original,categoria_pcdf_original) ON sentinela.naturezas_criminais TO
  sprint4_homolog_admin_read,sprint4_homolog_operator_read,sprint4_homolog_analyst_read;
GRANT SELECT (id,codigo_interno,nome,status) ON sentinela.categorias_criminais TO
  sprint4_homolog_admin_read,sprint4_homolog_operator_read,sprint4_homolog_analyst_read;
GRANT SELECT (id,natureza_id,categoria_id) ON sentinela.mapeamentos_natureza TO
  sprint4_homolog_admin_read,sprint4_homolog_operator_read,sprint4_homolog_analyst_read;
GRANT SELECT (id,codigo_interno,nome) ON sentinela.regioes_administrativas TO
  sprint4_homolog_admin_read,sprint4_homolog_operator_read,sprint4_homolog_analyst_read;

CREATE POLICY homolog_ra_read ON sentinela.regioes_administrativas FOR SELECT TO
  sprint4_homolog_admin_read,sprint4_homolog_operator_read,sprint4_homolog_analyst_read
  USING (versao_catalogo='SENTINELA_RA_PUBLICO_2026_11_13_V1');
-- Keep criminal data closed until dedicated synthetic fixture and authoring policies are reviewed.
-- Column grants above let the existing queries establish empty results under forced RLS.

INSERT INTO sentinela.schema_migrations (versao,descricao)
VALUES ('homolog-persist-0001','Catalogo cartografico atestado e primeira leitura da homologacao privada');
