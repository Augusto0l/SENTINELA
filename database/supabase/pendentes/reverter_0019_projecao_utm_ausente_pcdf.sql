-- Reversão compensatória da 0019: as ausências UTM voltam à revisão funcional e o tratamento automático
-- deixa de ser executável. Preserva pendências, o ledger de tratamentos, os eventos e o histórico das
-- migrations; registra a reversão em auditoria. O importador detecta a ausência do privilégio e segue sem
-- tratamento automático.
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));

DO $pre$
BEGIN
  IF NOT sentinela_ambiente.vinculado()
     OR NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0019')
     OR EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='reverter-0019')
     OR NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='sentinela' AND tablename='pendencias_revisao'
                    AND policyname='pendencias_pcdf_utm_ausente_leitura') THEN
    RAISE EXCEPTION 'A reversao exige a 0019 aplicada e ainda nao revertida.';
  END IF;
END $pre$;

DROP POLICY pendencias_pcdf_utm_ausente_leitura ON sentinela.pendencias_revisao;

SET LOCAL ROLE sentinela_pcdf_historico_owner;
REVOKE EXECUTE ON FUNCTION sentinela_pcdf_historico.iniciar_tratamento(uuid,text),
  sentinela_pcdf_historico.tratar_lote(uuid,text), sentinela_pcdf_historico.registrar_falha_tratamento(uuid,text),
  sentinela_pcdf_historico.lotes_pendentes_tratamento() FROM sentinela_local_admin, postgres;
RESET ROLE;

INSERT INTO sentinela.eventos_auditoria(ator_tipo, servico, acao, antes, depois, justificativa)
SELECT 'servico', 'sentinela-pcdf', 'pcdf.tratamento.revertido',
  jsonb_build_object('eventos', coalesce(jsonb_agg(id ORDER BY registrado_em, id), '[]'::jsonb)),
  jsonb_build_object('versao', 'pcdf-tratamento-v1',
    'pendenciasReabertas', coalesce(sum(jsonb_array_length(depois->'pendencias')), 0), 'historicoPreservado', true),
  'Reversão compensatória do tratamento PCDF automático; pendências voltam à revisão funcional'
FROM sentinela.eventos_auditoria WHERE acao = 'pcdf.tratamento.concluido';

INSERT INTO sentinela.schema_migrations VALUES
  ('reverter-0019', 'Reversao do tratamento automatico das pendencias PCDF', DEFAULT);
COMMIT;
