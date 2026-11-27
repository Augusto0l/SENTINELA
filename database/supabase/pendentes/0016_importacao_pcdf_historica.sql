-- SENTINELA | Habilitacao exclusiva do historico mensal PCDF v2.
-- Inventario: docs/desenvolvimento/pcdf-inventario-mensal-2021-2026.csv.
-- A liberacao nasce fechada. O procedimento de corte registra a prova de backup.
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));

DO $pre$
BEGIN
  IF NOT sentinela_ambiente.vinculado()
     OR NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0011')
     OR EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0016')
     OR (SELECT count(*) FROM sentinela_pcdf_historico.arquivos) <> 1
     OR (SELECT count(*) FROM sentinela_pcdf_historico.arquivos a
         JOIN sentinela.lotes_importacao l ON l.competencia=a.competencia AND l.sha256_arquivo=a.sha256
         JOIN sentinela_migracao.auditoria_origem e ON e.acao='pcdf.revisao_independente'
          AND e.depois->>'lote'=l.id::text AND e.depois->>'csvSha256'=a.sha256
         WHERE a.competencia='2021-01-01' AND a.sha256='91fa79f88988d1540e81f438e0fb470cea07a0809ac60387577fbdf0be9d6a00'
           AND a.linhas=6393 AND l.id='84908630-bd04-4a03-923d-616649c8de74'
           AND e.depois->>'consolidadas'='6090' AND e.depois->>'vinculos'='6392') <> 1
     OR EXISTS (SELECT FROM sentinela.lotes_importacao l
          JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id
          WHERE x.fonte='PCDF' AND l.competencia BETWEEN '2021-02-01' AND '2026-08-01')
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='sentinela_pcdf_historico.status()'::regprocedure)
        IS DISTINCT FROM 'b8d92572f805af25a07ad1522da427fa'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='sentinela_pcdf_historico.receive(uuid,uuid,text,jsonb,bytea)'::regprocedure)
        IS DISTINCT FROM 'f95ead10fc232febf510d6b13b4a3c3c'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='sentinela_pcdf_historico.receive_staging(uuid,uuid,text,jsonb,bytea)'::regprocedure)
        IS DISTINCT FROM 'ffb9d7d9ace324e4c9afd0b9b1409fb1' THEN
    RAISE EXCEPTION 'Instalacao, inventario ou receptores divergem do pre-voo institucional da 0016';
  END IF;
END $pre$;

INSERT INTO sentinela_pcdf_historico.arquivos
  (competencia,sha256,bytes,linhas,candidatas,cobertura_ate,completa)
VALUES
  ('2021-02-01', 'da6ee640e44b627198deb253cbdb5d078f5af2f877d4a97b2fb092aac459fa8c', 2236837, 5490, 5221, '2021-02-28', true),
  ('2021-03-01', '4b2d55c7080833bdd003fa000a823089ac9cfec9cc718d4e1bdf759bf061a56c', 2243960, 5496, 5205, '2021-03-31', true),
  ('2021-04-01', '064d23ae5aef875edb02c3545ce6d4a8f6c2cda83c2f4e33db8634d4c1db3153', 2282546, 5606, 5322, '2021-04-30', true),
  ('2021-05-01', 'ed8ae89d3431ff541a1391e31f0413ce630cc554ddc56563938e46cca954965e', 2341617, 5721, 5431, '2021-05-31', true),
  ('2021-06-01', '762a21d7281808103d2ab642ca38a4674a976e6c41d01d8b51c04cb2868e31a6', 2260469, 5536, 5240, '2021-06-30', true),
  ('2021-07-01', 'fe1f74f92478beabf18704fb8399650fa6fd94c9d9375c7af278d2d835d99857', 2267356, 5524, 5264, '2021-07-31', true),
  ('2021-08-01', 'ec587f4cf8e8a963bdc4c2a4fc4ffbe4a417d2f94501b85054c943861d96b962', 2310034, 5628, 5330, '2021-08-31', true),
  ('2021-09-01', '17222effc149237e07e3af140ac09ee63f788d82eebe44e7e02c106523a8044d', 2396540, 5822, 5549, '2021-09-30', true),
  ('2021-10-01', '043f3db388179841cbb4f9fa7be546aa1d3136de0a5c2d7cf6a550c5249a6851', 2599387, 6332, 6043, '2021-10-31', true),
  ('2021-11-01', '18a0a0225e2c3c730ca20c80476eea89431414ccdfeaa0ea67bed3963b515a5d', 2452406, 5974, 5686, '2021-11-30', true),
  ('2021-12-01', 'b9985f9e91599f453c9db164d5c030d33be67a845e01cf95aebc18c429ca9a5d', 2363137, 5737, 5464, '2021-12-31', true),
  ('2022-01-01', '8ac8fc547ba4026ce0cc7158e07653e99ae2c2ee65012e2be429661bca9dc63c', 2320189, 5642, 5366, '2022-01-31', true),
  ('2022-02-01', '6ad01d44e2fce9800a55cebae59f86f395a80225aff290db26c0cd6a186e5a24', 2181549, 5270, 5059, '2022-02-28', true),
  ('2022-03-01', '33360ca9044cc739470880765abf116b71de2b0ee78d2de7e8b6bb62ebb58cfb', 2640483, 6371, 6054, '2022-03-31', true),
  ('2022-04-01', '87ce58033a4ab8066609cefacd0e632a33e8b4d40f05646d41f81ef20af9e5b1', 2576606, 6227, 5959, '2022-04-30', true),
  ('2022-05-01', '1ff8ca2f8f7651c9710dea1170d2273842f2b3543912426948d89485c81470ab', 2484990, 5998, 5753, '2022-05-31', true),
  ('2022-06-01', '865bba13880e268946eaf31edf09b1ea880d1f4f09bb4b9e9a6d9c5b9e394980', 2429532, 5847, 5558, '2022-06-30', true),
  ('2022-07-01', '1d64b6a5c666d2d8ec7b2744c1912366e9e37580087e0ebde6a4b92032ce6736', 2497056, 6031, 5773, '2022-07-31', true),
  ('2022-08-01', '2e6c1747722a5ec5d99cdc4d61179041a57dc6d00c5f98374faa34725a568817', 2571142, 6169, 5833, '2022-08-31', true),
  ('2022-09-01', '17929db1a5ae6261a127d1a69816119bfcb4f63bf437d082042d749b692bbd51', 2302635, 5551, 5315, '2022-09-30', true),
  ('2022-10-01', 'ecd13a773b04219f7c3bc911c949acce9e91f6cc75acb0ca8a2b8880f96d25c4', 2560907, 6152, 5846, '2022-10-31', true),
  ('2022-11-01', '02a9c238952c93d8ad495d14286a6df37437f775220311f079f2cea1c2a14ee8', 2270358, 5467, 5227, '2022-11-30', true),
  ('2022-12-01', '23dd990864917f7b7b803aa880fdccba4839332a7076af97bd0358f42e96c2d9', 2362909, 5664, 5369, '2022-12-31', true),
  ('2023-01-01', '1388f2a67fb49be3760725c75f421f952393ad99aa818437caab10b939f6cfc8', 2443002, 5868, 5565, '2023-01-31', true),
  ('2023-02-01', 'e49473ea72cbded89960d25dd435d540fcb5579d07deaeed29c162caca67985f', 2248620, 5393, 5091, '2023-02-28', true),
  ('2023-03-01', 'cf8f774467769afc57db9ee3d08bedf77a4d59eff15491b75e562a474f189c1d', 2572016, 6191, 5860, '2023-03-31', true),
  ('2023-04-01', '3cad41af9eeabc318c4a1abbc6c7707236c251abd4b5491af14efff7008dcdb3', 2356495, 5644, 5341, '2023-04-30', true),
  ('2023-05-01', 'eee989c3f09070a22e191b829785f33f04b3eb7195f6b76f2043609d9163428a', 2311660, 5538, 5203, '2023-05-31', true),
  ('2023-06-01', '84525bf5ae63979969f487eba319f9ded849c07b48eaf2c215b70ef9c4204aa5', 2171197, 5206, 4921, '2023-06-30', true),
  ('2023-07-01', 'bebde5aa21e8322a52d46ac3576066409aab26e598d5eb22a1838789c0daca16', 2183148, 5219, 4947, '2023-07-31', true),
  ('2023-08-01', '4a53f9e51c706ae3650817888762438594e9187364533de9169e6939f4a79a97', 2365065, 5655, 5313, '2023-08-31', true),
  ('2023-09-01', 'd59846312e918b21a954f2f31cfab700ed585e8c2db16741cc111648c386f928', 2277262, 5426, 5130, '2023-09-30', true),
  ('2023-10-01', '01b2f5291e823fa837bb6c558619cf2f7260d8c724dac97081c7385d7a862457', 2393105, 5701, 5396, '2023-10-31', true),
  ('2023-11-01', 'c86117a6e00be124b8f034887667885d939f9346161fc10b71986ca273cc951e', 2366255, 5615, 5297, '2023-11-30', true),
  ('2023-12-01', '3a0c7ebd4ab06bec8d89bb9d37e92bb2d81255058b508060949d601ecbc38631', 2442677, 5625, 5303, '2023-12-31', true),
  ('2024-01-01', '7bfd9ccbb29337ac1e0a9f4ad941f8ce068d67f5c9232fbf3ee9ff976c0f1608', 2462006, 5620, 5275, '2024-01-31', true),
  ('2024-02-01', '004628e1daae0d6d01bcc6d3c41ded0b781163c8695578cf4497a4d1db041db2', 2213992, 5057, 4746, '2024-02-29', true),
  ('2024-03-01', '6691d5729ba7e24e59fbbed276c7aef21f828a55666009e8a43b871a47748d03', 2399809, 5465, 5139, '2024-03-31', true),
  ('2024-04-01', '5aed3c1be36e726cbad927efc42d4bc286f3f23ffaa18bdc5d2ac0608f3f3039', 2357268, 5390, 5079, '2024-04-30', true),
  ('2024-05-01', '1c7a00ac33cbd65a7f051aa6ccdfc421755d5b3e1d5036a713450c2032f83bec', 2439323, 5561, 5260, '2024-05-31', true),
  ('2024-06-01', '0f99cfc95af0eb903434f3fc23c5874a56dfbc030407d5477285a84f84a9d6d7', 2278296, 5188, 4909, '2024-06-30', true),
  ('2024-07-01', 'e3fa24278f62351cb1649f2fbc591b1c40226e21e463e15e173d59f5a7655342', 2184300, 4965, 4693, '2024-07-31', true),
  ('2024-08-01', '9a0fc09250f3fd0045045c480c7e26b11c9a73391eae618e7871cd839813c643', 2380606, 5412, 5120, '2024-08-31', true),
  ('2024-09-01', 'e513aef7a46ae8d0fa5d3b2b434afe799184738b086463f31002818e49188970', 2397470, 5437, 5150, '2024-09-30', true),
  ('2024-10-01', '0f34dbc6029aae7588faccac05e2756211ccc2112da332a5486f429345459e8b', 2385224, 5405, 5125, '2024-10-31', true),
  ('2024-11-01', 'fdb4a6abeb1d84221d18b4084b21e4c9a77c7040afc12631be42431743711fc2', 2283999, 5198, 4923, '2024-11-30', true),
  ('2024-12-01', '02a02d303adabd7c319c6f084d9038244110ff8fc73b5c2f33ad631e08674e6e', 2282664, 5169, 4917, '2024-12-31', true),
  ('2025-01-01', '56e679b949c7e67b2128a8cd55956a5bd31753600497c44cd5439d8db1d98693', 2454322, 5596, 5263, '2025-01-31', true),
  ('2025-02-01', 'e3ca66ea3a252f49d115969ebd0db2c28d5f52db10a52868d2e6fa2f75c21b63', 2221589, 5047, 4755, '2025-02-28', true),
  ('2025-03-01', '145a0c25e170283a55cbd59982bdc72f9d341af69f4402cbd5fb9ebfad9ca4cd', 2576487, 5844, 5505, '2025-03-31', true),
  ('2025-04-01', '10a0ce9692f32dd2a226e47fa054718e62c836ef76c8cda90da9fb4331b34144', 2422904, 5503, 5206, '2025-04-30', true),
  ('2025-05-01', '2b64cb32e8900ce60edf0131c8ef4c6cabe6844da418530fb545d623cc39231b', 2333716, 5307, 5006, '2025-05-31', true),
  ('2025-06-01', '95e88c7d752df57b7d92e1b17bc1a533be3d720d169ea5e57bf0c32c1bcfa9ea', 2235589, 5070, 4786, '2025-06-30', true),
  ('2025-07-01', '8f22b1f909f916af814e23f6af4f16a1dd79ad8b6458f43eb81e2fa84cb57720', 2175464, 4917, 4641, '2025-07-31', true),
  ('2025-08-01', '285d26e88e0ed22ad1746b142a5c8ce3902081984f49fb2c7e1d384d864f0e2b', 2241367, 5055, 4725, '2025-08-31', true),
  ('2025-09-01', '3b14c12511f2ab878e2dcb2398b3e3399248407834b9b5e911ceaa2f9e807d95', 2184858, 4934, 4620, '2025-09-30', true),
  ('2025-10-01', 'e490b5b05e791a0672dcdfb2f65af96cf91b56d562564b4d5dfec1d0e6b7dadc', 2339893, 5277, 4933, '2025-10-31', true),
  ('2025-11-01', '1c6dd95b22df2c2736e6e6f69815a838d6c30127f9e2d15f7da476b82cb5eef3', 2322698, 5255, 4943, '2025-11-30', true),
  ('2025-12-01', '8689e84e2ec939d6dbb5f9faa2c24a93a8a433211e0768115a3c79cd83910b5d', 2325229, 5240, 4923, '2025-12-31', true),
  ('2026-01-01', '9753259f25eb9befc773a4b51bb94b98cf7eee6ad1deba8500a24e58cc59cd69', 2288720, 5209, 4878, '2026-01-31', true),
  ('2026-02-01', '00e9b6879e94bca8816fc041c77e862489004fadbed0eb0500967cb76f9c9ce3', 2003126, 4537, 4261, '2026-02-28', true),
  ('2026-03-01', '811e7ee344a839bc4b3637e07d94c19ebb74d3493ba5b4cbe42aa0d0736c0361', 2270332, 5112, 4767, '2026-03-31', true),
  ('2026-04-01', 'e3dad4e587722a95dac2fa4be6218076a2229103a24af20e344ba915d3d6e200', 2256188, 5078, 4744, '2026-04-30', true),
  ('2026-05-01', '493fda6837f1b7cd5a94348277c9611c0d051a5603c510d83ea85e3690766402', 2160887, 4871, 4524, '2026-05-31', true),
  ('2026-06-01', '2b25e319573aba5a1bbe3b89a975bb4064934c3701fd9deb752d96e5e5903a09', 1941105, 4370, 4077, '2026-06-30', true),
  ('2026-07-01', 'f36a671bb46ddb7d33c88459583c02e82c47626867718a1ce3975c56308faeaf', 1952023, 4399, 4099, '2026-07-31', true),
  ('2026-08-01', 'e37e8b888ee5fdad4fd6bbd697c27f2092491f61727214804b463b07c94319a1', 1090000, 2443, 2265, '2026-08-18', false);

GRANT USAGE ON SCHEMA sentinela_migracao TO sentinela_pcdf_historico_owner;
GRANT SELECT ON sentinela_migracao.auditoria_origem TO sentinela_pcdf_historico_owner;
CREATE POLICY pcdf_janeiro_recibo_arquivado ON sentinela_migracao.auditoria_origem
  FOR SELECT TO sentinela_pcdf_historico_owner
  USING (acao='pcdf.revisao_independente' AND depois->>'lote'='84908630-bd04-4a03-923d-616649c8de74');

CREATE TABLE sentinela_pcdf_historico.liberacao (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  instalacao uuid NOT NULL,
  backup_sha256 text NOT NULL CHECK (backup_sha256 ~ '^[0-9a-f]{64}$'),
  verificado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  habilitada boolean NOT NULL DEFAULT false
);
ALTER TABLE sentinela_pcdf_historico.liberacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_pcdf_historico.liberacao FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sentinela_pcdf_historico.liberacao FROM PUBLIC, anon, authenticated, service_role,
  sentinela_local_admin, sentinela_local_operator, sentinela_local_analyst;
GRANT SELECT ON sentinela_pcdf_historico.liberacao TO sentinela_pcdf_historico_owner;
CREATE POLICY pcdf_liberacao_leitura ON sentinela_pcdf_historico.liberacao
  FOR SELECT TO sentinela_pcdf_historico_owner USING (true);

GRANT EXECUTE ON FUNCTION sentinela_ambiente.ator_importacao() TO sentinela_pcdf_historico_owner;

GRANT CREATE ON SCHEMA sentinela_pcdf_historico TO sentinela_pcdf_historico_owner;
SET LOCAL ROLE sentinela_pcdf_historico_owner;
CREATE OR REPLACE FUNCTION sentinela_pcdf_historico.status() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 SELECT jsonb_agg(jsonb_build_object(
   'month',to_char(a.competencia,'YYYY-MM'),'sha256',a.sha256,'bytes',a.bytes,'records',a.linhas,
   'candidates',a.candidatas,'through',a.cobertura_ate,'complete',a.completa,
   'state',CASE WHEN l.id IS NULL THEN 'missing' WHEN l.sha256_arquivo<>a.sha256 THEN 'conflict'
     WHEN a.competencia='2021-01-01' AND (l.id<>'84908630-bd04-4a03-923d-616649c8de74' OR e.depois IS NULL)
       THEN 'conflict'
     WHEN e.depois IS NULL THEN 'staged' ELSE 'done' END,
   'lot',l.id,'unique',e.depois->'consolidadas','links',e.depois->'vinculos',
   'review',coalesce(e.depois->'origensEmRevisao',e.depois->'identidadeEmRevisao'),
   'issues',CASE WHEN a.competencia='2021-01-01' AND e.depois IS NOT NULL THEN to_jsonb(8091)
     ELSE e.depois->'pendencias' END) ORDER BY a.competencia)
 FROM sentinela_pcdf_historico.arquivos a
 LEFT JOIN LATERAL (
   SELECT l.id,l.sha256_arquivo FROM sentinela.lotes_importacao l JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id
   WHERE l.competencia=a.competencia AND x.fonte='PCDF'
   ORDER BY (l.sha256_arquivo<>a.sha256) DESC,l.id LIMIT 1
 ) l ON true
 LEFT JOIN LATERAL (
   SELECT candidato.depois FROM (
   SELECT e.depois, 0 AS prioridade, e.id::text FROM sentinela.eventos_auditoria e
   WHERE e.acao=CASE WHEN a.competencia='2021-01-01' THEN 'pcdf.revisao_independente' ELSE 'pcdf.consolidacao_historica' END
     AND e.depois->>'lote'=l.id::text AND e.depois->>'csvSha256'=a.sha256
   UNION ALL
   SELECT e.depois, 1, e.id::text FROM sentinela_migracao.auditoria_origem e
   WHERE a.competencia='2021-01-01' AND e.acao='pcdf.revisao_independente'
     AND e.depois->>'lote'=l.id::text AND e.depois->>'csvSha256'=a.sha256
   ) candidato ORDER BY candidato.prioridade,candidato.id LIMIT 1
 ) e ON true;
$$;

CREATE FUNCTION sentinela_pcdf_historico.pode_confirmar(p_usuario uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(session_user='sentinela_local_admin'
    AND p_usuario=sentinela_ambiente.ator_importacao()
    AND NOT pg_is_in_recovery()
    AND EXISTS (SELECT FROM sentinela_pcdf_historico.liberacao r
      WHERE r.singleton AND r.habilitada AND r.instalacao=sentinela_ambiente.instalacao()
        AND r.verificado_em<=statement_timestamp())
    AND (SELECT count(*) FROM sentinela_pcdf_historico.arquivos
         WHERE competencia BETWEEN '2021-01-01' AND '2026-08-01')=68
    AND EXISTS (SELECT FROM jsonb_array_elements(sentinela_pcdf_historico.status()) m
      WHERE m->>'month'='2021-01' AND m->>'state'='done'), false)
$$;

CREATE FUNCTION sentinela_pcdf_historico.exigir_confirmacao(p_usuario uuid) RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NOT sentinela_pcdf_historico.pode_confirmar(p_usuario) THEN
    RAISE EXCEPTION 'Confirmacao mensal PCDF indisponivel' USING ERRCODE='42501';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION sentinela_pcdf_historico.pode_confirmar(uuid),
  sentinela_pcdf_historico.exigir_confirmacao(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_historico.pode_confirmar(uuid) TO sentinela_local_admin, sentinela_pcdf_owner;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_historico.exigir_confirmacao(uuid) TO sentinela_pcdf_owner;

DO $check$
BEGIN
  IF (SELECT count(*) FROM jsonb_array_elements(sentinela_pcdf_historico.status()) m
        WHERE m->>'state'='missing') <> 67
     OR (SELECT m->>'state' FROM jsonb_array_elements(sentinela_pcdf_historico.status()) m
         WHERE m->>'month'='2021-01') IS DISTINCT FROM 'done' THEN
    RAISE EXCEPTION 'Inventario instalado nao confere com o recibo original de janeiro';
  END IF;
END $check$;
RESET ROLE;

GRANT CREATE ON SCHEMA sentinela_pcdf_historico TO sentinela_pcdf_historico_owner, sentinela_pcdf_owner;
SET LOCAL ROLE sentinela_pcdf_historico_owner;
DO $receive$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('sentinela_pcdf_historico.receive(uuid,uuid,text,jsonb,bytea)'::regprocedure);
  IF (length(definition)-length(replace(definition,'PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,p_conta);','')))/length('PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,p_conta);') <> 1 THEN
    RAISE EXCEPTION 'Definicao inesperada do receptor mensal';
  END IF;
  IF (length(definition)-length(replace(definition,$label$CASE WHEN n.id IS NULL THEN 'sem_correspondencia' ELSE 'pendente' END$label$,'')))/length($label$CASE WHEN n.id IS NULL THEN 'sem_correspondencia' ELSE 'pendente' END$label$) <> 1 THEN
    RAISE EXCEPTION 'Trecho de classificacao inesperado no receptor mensal';
  END IF;
  definition := replace(definition,$label$CASE WHEN n.id IS NULL THEN 'sem_correspondencia' ELSE 'pendente' END$label$,$label$'pendente' /* classificacao PCDF v2 a homologar */$label$);
  EXECUTE replace(definition,'PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,p_conta);','PERFORM sentinela_pcdf_historico.exigir_confirmacao(p_usuario);');
END $receive$;
RESET ROLE;

SET LOCAL ROLE sentinela_pcdf_owner;
DO $staging$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('sentinela_pcdf_historico.receive_staging(uuid,uuid,text,jsonb,bytea)'::regprocedure);
  IF (length(definition)-length(replace(definition,'PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,p_conta);','')))/length('PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,p_conta);') <> 1 THEN
    RAISE EXCEPTION 'Definicao inesperada do staging mensal';
  END IF;
  EXECUTE replace(definition,'PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,p_conta);','PERFORM sentinela_pcdf_historico.exigir_confirmacao(p_usuario);');
END $staging$;
RESET ROLE;
REVOKE CREATE ON SCHEMA sentinela_pcdf_historico FROM sentinela_pcdf_historico_owner, sentinela_pcdf_owner;

INSERT INTO sentinela.schema_migrations VALUES ('0016','Importacao mensal PCDF v2 em producao',DEFAULT);
COMMIT;
