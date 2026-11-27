\set ON_ERROR_STOP on
BEGIN;
SELECT current_database() = 'postgres'
  AND inet_server_addr() = '127.0.0.1'::inet
  AND inet_server_port() = :'fixture_port'::integer
  AND (SELECT system_identifier::text FROM pg_control_system()) = :'fixture_system'
  AS fixture_verified
\gset
\if :fixture_verified
\else
  SELECT 1 / 0;
\endif

INSERT INTO sentinela.regioes_administrativas(codigo_interno,nome,versao_catalogo,vigencia,
  limite,versao_cartografia,evidencia_referencia_espacial)
VALUES ('RA-VINCULO','Território B','fixture',daterange(NULL,NULL),
  extensions.ST_Multi(extensions.ST_MakeEnvelope(-47,-16,-46,-15,4326)),'fixture','fixture');

INSERT INTO sentinela.ocorrencias(id,origem,fonte,versao_identidade,ra_id,data_fato,horario_fato,
  localizacao_status,consolidacao_status,ativo)
SELECT ('40000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'importacao','PCDF','fixture',
  CASE WHEN i=1 THEN (SELECT id FROM sentinela.regioes_administrativas WHERE codigo_interno='RA-VINCULO') END,
  DATE '2021-01-01'+((i-1)%31),make_time((i-1)%24,0,0),'referencia_pendente',
  CASE WHEN i=100001 THEN 'em_revisao' ELSE 'consolidada' END,i<>100003
FROM generate_series(1,100003) i;

INSERT INTO sentinela.ocorrencias(id,origem,fonte,versao_identidade,identidade_status,ra_id,data_fato,horario_fato,
  localizacao_status,consolidacao_status,latitude,longitude,geometria,referencia_espacial_confirmada,regra_transformacao)
VALUES ('40000000-0000-4000-8000-000000100004','manual','SENTINELA_MANUAL','fixture','manual',
  (SELECT id FROM sentinela.regioes_administrativas WHERE codigo_interno='RA-TESTE'),DATE '2021-01-01',TIME '00:00',
  'validada','consolidada',-15.80,-47.90,extensions.ST_SetSRID(extensions.ST_MakePoint(-47.90,-15.80),4326),
  'WGS84; IDE-DF-2026-11-13','fixture');

INSERT INTO sentinela_ocorrencias_analytics.pcdf_pontos(
  ocorrencia_id,versao_ocorrencia,latitude,longitude,geometria,ra_codigo,origem_sha256,publicacao_id)
SELECT ('40000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,CASE WHEN i=100002 THEN 2 ELSE 1 END,
  lat,lon,extensions.ST_SetSRID(extensions.ST_MakePoint(lon,lat),4326),'RA-TESTE',
  repeat('f',64),'90000000-0000-4000-8000-000000000001'
FROM generate_series(1,100003) i
CROSS JOIN LATERAL (SELECT
  CASE WHEN i<=2 THEN -15.80 ELSE -15.83+((i*131)%641)*0.0001 END AS lat,
  CASE WHEN i<=2 THEN -47.90 ELSE -47.93+((i*23)%601)*0.0001 END AS lon) position;

INSERT INTO sentinela.naturezas_criminais(id,fonte,descricao_original,categoria_pcdf_original) VALUES
  ('50000000-0000-4000-8000-000000000001','PCDF','Natureza A de ensaio','Categoria A de ensaio'),
  ('50000000-0000-4000-8000-000000000002','PCDF','Natureza B de ensaio','Categoria B de ensaio');
INSERT INTO sentinela.extracoes_origem(id,fonte,nome_xml,sha256_xml,tamanho_bytes,referencia_arquivo)
VALUES ('60000000-0000-4000-8000-000000000001','PCDF','fixture.xml',repeat('a',64),1,'fixture');
INSERT INTO sentinela.linhas_origem(id,extracao_id,linha_origem_id,aba_origem,linha_xml,versao_identificador,
  natureza_original,natureza_padronizada_pcdf)
SELECT ('70000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'60000000-0000-4000-8000-000000000001',
  lpad(to_hex(i),64,'0'),'NATUREZAS',i,'fixture',
  CASE WHEN i<=5000 THEN 'Natureza A de ensaio' ELSE 'Natureza B de ensaio' END,
  CASE WHEN i<=5000 THEN 'Categoria A de ensaio' ELSE 'Categoria B de ensaio' END
FROM generate_series(1,7500) i;
INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,linha_origem_id)
SELECT ('40000000-0000-4000-8000-'||lpad((CASE WHEN linha_xml<=5000 THEN linha_xml ELSE (linha_xml-5000)*2-1 END)::text,12,'0'))::uuid,
  CASE WHEN linha_xml<=5000 THEN '50000000-0000-4000-8000-000000000001'::uuid ELSE '50000000-0000-4000-8000-000000000002'::uuid END,
  'importacao',id
FROM sentinela.linhas_origem WHERE extracao_id='60000000-0000-4000-8000-000000000001';

COMMIT;
ANALYZE;
