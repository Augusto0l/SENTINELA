-- SENTINELA | Tratamento automático e auditado das pendências PCDF v2 por competência.
--
-- Reaproveita a regra homologada em janeiro/2021 (clone-pcdf-coordenadas-ausencia-0001): observações de
-- ausência que repetem um estado geográfico já registrado saem da revisão funcional, sem apagar a pendência
-- nem alterar status, original PCDF, snapshot do staging ou o estado `geo_*`. Em revisão independente
-- (fev/2021 em diante) o receptor registra a ausência do par UTM como `coordenada_status/utm_ausente`,
-- sempre ao lado do estado GEO bloqueante da mesma associação.
--
-- Mecanismo permanente: `sentinela_pcdf_historico.tratar_lote` registra, por lote e versão do conjunto de
-- regras, estado, contagens, SHA-256 da coorte, evidência e executor, e grava o evento de auditoria. O
-- importador o chama depois de cada confirmação mensal; falhas ficam como `falha_recuperavel` e são
-- retomadas. A projeção vale somente para as pendências da coorte registrada (`tratamento_pendencias`).
--
-- Classificação, Região Administrativa, endereço e georreferência não têm regra homologada nesta versão:
-- o tratamento registra o motivo e mantém as pendências abertas.
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));

DO $pre$
BEGIN
  IF NOT sentinela_ambiente.vinculado()
     OR NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0016')
     OR EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='0019')
     OR to_regclass('sentinela_pcdf_historico.tratamentos') IS NOT NULL
     OR to_regprocedure('sentinela.pcdf_componente_ausente_v1(uuid,text,text,jsonb)') IS NULL
     OR to_regprocedure('sentinela_pcdf_historico.status()') IS NULL
     OR NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='sentinela' AND tablename='pendencias_revisao'
                    AND policyname='pendencias_pcdf_componentes_ausentes_leitura' AND permissive='RESTRICTIVE')
     OR (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace
         AND relkind='r' AND relrowsecurity AND relforcerowsecurity) <> 19 THEN
    RAISE EXCEPTION 'A 0019 exige a importacao mensal 0016, a regra de janeiro e RLS forcada nas 19 tabelas.';
  END IF;
END $pre$;

-- 1. Ledger persistente por competência e versão do conjunto de regras.
GRANT CREATE ON SCHEMA sentinela_pcdf_historico TO sentinela_pcdf_historico_owner;
GRANT USAGE ON SCHEMA sentinela_pcdf_historico TO sentinela_ocorrencias_reader;
GRANT REFERENCES ON sentinela.lotes_importacao, sentinela.usuarios, sentinela.pendencias_revisao TO sentinela_pcdf_historico_owner;
SET LOCAL ROLE sentinela_pcdf_historico_owner;
CREATE TABLE sentinela_pcdf_historico.tratamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL REFERENCES sentinela.lotes_importacao(id),
  competencia date NOT NULL,
  versao_regra text NOT NULL CHECK (versao_regra ~ '^pcdf-tratamento-v[0-9]+$'),
  estado text NOT NULL CHECK (estado IN ('processando','concluido','concluido_com_pendencias','falha_recuperavel')),
  processo text NOT NULL CHECK (processo IN ('importacao-automatica','retomada','retroativo-0019','reprocessamento')),
  tentativas integer NOT NULL DEFAULT 1 CHECK (tentativas > 0),
  executor text NOT NULL,
  usuario_id uuid REFERENCES sentinela.usuarios(id),
  pendencias_fisicas integer CHECK (pendencias_fisicas >= 0),
  pendencias_antes integer CHECK (pendencias_antes >= 0),
  tratadas integer CHECK (tratadas >= 0),
  restantes integer CHECK (restantes >= 0),
  sha256_tratadas text CHECK (sha256_tratadas ~ '^[0-9a-f]{64}$'),
  evidencia jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidencia) = 'object'),
  erro text CHECK (erro IS NULL OR length(erro) <= 200),
  iniciado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  concluido_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (lote_id, versao_regra),
  CHECK ((estado IN ('concluido','concluido_com_pendencias'))
         = (concluido_em IS NOT NULL AND sha256_tratadas IS NOT NULL AND restantes IS NOT NULL)),
  CHECK (estado <> 'concluido' OR restantes = 0),
  CHECK (estado <> 'concluido_com_pendencias' OR restantes > 0),
  CHECK (estado <> 'falha_recuperavel' OR erro IS NOT NULL)
);
ALTER TABLE sentinela_pcdf_historico.tratamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_pcdf_historico.tratamentos FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sentinela_pcdf_historico.tratamentos FROM PUBLIC, anon, authenticated, service_role,
  sentinela_local_admin, sentinela_local_operator, sentinela_local_analyst;
GRANT SELECT ON sentinela_pcdf_historico.tratamentos TO sentinela_ocorrencias_reader;
CREATE POLICY tratamento_dono ON sentinela_pcdf_historico.tratamentos
  FOR ALL TO sentinela_pcdf_historico_owner USING (true) WITH CHECK (true);
CREATE POLICY tratamento_leitor ON sentinela_pcdf_historico.tratamentos
  FOR SELECT TO sentinela_ocorrencias_reader USING (estado IN ('concluido','concluido_com_pendencias'));

CREATE FUNCTION sentinela_pcdf_historico.proteger_tratamento() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP <> 'UPDATE' OR OLD.estado IN ('concluido','concluido_com_pendencias')
     OR NEW.lote_id <> OLD.lote_id OR NEW.versao_regra <> OLD.versao_regra OR NEW.competencia <> OLD.competencia THEN
    RAISE EXCEPTION 'Tratamento concluido e imutavel' USING ERRCODE = '55000';
  END IF;
  NEW.atualizado_em := clock_timestamp();
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION sentinela_pcdf_historico.proteger_tratamento() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER tratamento_protegido BEFORE UPDATE OR DELETE ON sentinela_pcdf_historico.tratamentos
  FOR EACH ROW EXECUTE FUNCTION sentinela_pcdf_historico.proteger_tratamento();
CREATE TRIGGER tratamento_sem_truncate BEFORE TRUNCATE ON sentinela_pcdf_historico.tratamentos
  FOR EACH STATEMENT EXECUTE FUNCTION sentinela_pcdf_historico.proteger_tratamento();

-- Coorte auditada de cada tratamento: somente estas pendências saem da revisão funcional.
CREATE TABLE sentinela_pcdf_historico.tratamento_pendencias (
  pendencia_id uuid PRIMARY KEY REFERENCES sentinela.pendencias_revisao(id),
  tratamento_id uuid NOT NULL REFERENCES sentinela_pcdf_historico.tratamentos(id),
  regra text NOT NULL CHECK (regra = 'pcdf-utm-ausente-informativo-v1')
);
CREATE INDEX tratamento_pendencias_tratamento_idx ON sentinela_pcdf_historico.tratamento_pendencias (tratamento_id);
ALTER TABLE sentinela_pcdf_historico.tratamento_pendencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_pcdf_historico.tratamento_pendencias FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sentinela_pcdf_historico.tratamento_pendencias FROM PUBLIC, anon, authenticated, service_role,
  sentinela_local_admin, sentinela_local_operator, sentinela_local_analyst;
GRANT SELECT ON sentinela_pcdf_historico.tratamento_pendencias TO sentinela_ocorrencias_reader;
CREATE POLICY coorte_dono ON sentinela_pcdf_historico.tratamento_pendencias
  FOR ALL TO sentinela_pcdf_historico_owner USING (true) WITH CHECK (true);
CREATE POLICY coorte_leitor ON sentinela_pcdf_historico.tratamento_pendencias
  FOR SELECT TO sentinela_ocorrencias_reader USING (true);
CREATE FUNCTION sentinela_pcdf_historico.proteger_coorte() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Coorte de tratamento imutavel' USING ERRCODE = '55000';
END
$$;
REVOKE ALL ON FUNCTION sentinela_pcdf_historico.proteger_coorte() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER coorte_protegida BEFORE UPDATE OR DELETE ON sentinela_pcdf_historico.tratamento_pendencias
  FOR EACH ROW EXECUTE FUNCTION sentinela_pcdf_historico.proteger_coorte();
CREATE TRIGGER coorte_sem_truncate BEFORE TRUNCATE ON sentinela_pcdf_historico.tratamento_pendencias
  FOR EACH STATEMENT EXECUTE FUNCTION sentinela_pcdf_historico.proteger_coorte();
RESET ROLE;

-- 2. Leitura mínima para o dono calcular as coortes e gravar a auditoria do tratamento.
GRANT SELECT ON sentinela.pendencias_revisao TO sentinela_pcdf_historico_owner;
CREATE POLICY tratamento_pendencia_leitura ON sentinela.pendencias_revisao
  FOR SELECT TO sentinela_pcdf_historico_owner USING (versao_regra = 'pcdf-csv-avulso-v2');
CREATE POLICY tratamento_staging_leitura ON sentinela.linhas_staging
  FOR SELECT TO sentinela_pcdf_historico_owner USING (campos_csv->>'fonte' = 'PCDF');
CREATE POLICY tratamento_auditoria_escrita ON sentinela.eventos_auditoria
  FOR INSERT TO sentinela_pcdf_historico_owner
  WITH CHECK (ator_tipo = 'servico' AND servico = 'sentinela-pcdf-tratamento'
              AND acao IN ('pcdf.tratamento.concluido','pcdf.tratamento.falha'));
CREATE POLICY tratamento_auditoria_leitura ON sentinela.eventos_auditoria
  FOR SELECT TO sentinela_pcdf_historico_owner
  USING (servico = 'sentinela-pcdf-tratamento' AND acao IN ('pcdf.tratamento.concluido','pcdf.tratamento.falha'));

-- 3. Evidência objetiva da regra (avaliada com o escopo de quem chama).
CREATE FUNCTION sentinela.pcdf_utm_ausente_evidencia_v1(origem uuid, campo text, regra text, valor jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $body$
 SELECT campo = 'coordenada_status' AND regra = 'utm_ausente'
    AND EXISTS (
      SELECT FROM sentinela.linhas_staging s WHERE s.linha_origem_id = origem
        AND s.ocorrencia_id IS NULL AND s.associacao_id IS NULL
        AND upper(btrim(coalesce(s.campos_csv->>'latitude_utm_original',''))) IN ('','NULL')
        AND upper(btrim(coalesce(s.campos_csv->>'longitude_utm_original',''))) IN ('','NULL')
        AND s.campos_csv->'coordenada_status' IS NOT DISTINCT FROM valor
        AND EXISTS (SELECT FROM jsonb_to_recordset(s.diagnosticos) d(field text, rule text, effect text)
          WHERE d.field = 'coordenada_status'
            AND d.rule IN ('geo_ausente','geo_incompleta','geo_invalida','geo_referencia_pendente')
            AND d.effect = 'bloqueia_dimensao')
    )
$body$;
ALTER FUNCTION sentinela.pcdf_utm_ausente_evidencia_v1(uuid,text,text,jsonb) COST 1000;

REVOKE ALL ON FUNCTION sentinela.pcdf_utm_ausente_evidencia_v1(uuid,text,text,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sentinela.pcdf_utm_ausente_evidencia_v1(uuid,text,text,jsonb) TO sentinela_pcdf_historico_owner;
GRANT EXECUTE ON FUNCTION sentinela.pcdf_componente_ausente_v1(uuid,text,text,jsonb) TO sentinela_pcdf_historico_owner;

CREATE POLICY pendencias_pcdf_utm_ausente_leitura ON sentinela.pendencias_revisao AS RESTRICTIVE
  FOR SELECT TO sentinela_ocorrencias_reader USING (NOT (
    tipo = 'coordenadas' AND versao_regra = 'pcdf-csv-avulso-v2' AND status = 'aberta'
    AND ocorrencia_id IS NULL AND associacao_id IS NULL AND efeito = 'nao_bloqueante'
    AND campo = 'coordenada_status' AND regra = 'utm_ausente'
    AND EXISTS (SELECT FROM sentinela_pcdf_historico.tratamento_pendencias c WHERE c.pendencia_id = id)
  ));

-- 4. Funções do tratamento (dono sem login, sem BYPASSRLS).
SET LOCAL ROLE sentinela_pcdf_historico_owner;

CREATE FUNCTION sentinela_pcdf_historico.executor_valido() RETURNS boolean
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT session_user IN ('sentinela_local_admin','postgres') AND NOT pg_is_in_recovery()
$$;

CREATE FUNCTION sentinela_pcdf_historico.iniciar_tratamento(p_lote uuid, p_processo text) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  versao constant text := 'pcdf-tratamento-v1';
  linha sentinela_pcdf_historico.tratamentos;
  competencia_lote date;
BEGIN
  IF NOT sentinela_pcdf_historico.executor_valido()
     OR p_processo NOT IN ('importacao-automatica','retomada','reprocessamento') THEN
    RAISE EXCEPTION 'Tratamento PCDF indisponivel' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-tratamento:' || p_lote::text, 0));
  SELECT l.competencia INTO competencia_lote FROM sentinela.lotes_importacao l WHERE l.id = p_lote;
  IF competencia_lote IS NULL THEN RAISE EXCEPTION 'Lote PCDF inexistente' USING ERRCODE = '22023'; END IF;
  SELECT * INTO linha FROM sentinela_pcdf_historico.tratamentos WHERE lote_id = p_lote AND versao_regra = versao;
  IF linha.estado IN ('concluido','concluido_com_pendencias') THEN
    RETURN jsonb_build_object('lote', p_lote, 'estado', linha.estado, 'replay', true);
  END IF;
  INSERT INTO sentinela_pcdf_historico.tratamentos AS t
    (lote_id, competencia, versao_regra, estado, processo, executor, usuario_id)
  VALUES (p_lote, competencia_lote, versao, 'processando', p_processo, session_user, sentinela_ambiente.ator_importacao())
  ON CONFLICT (lote_id, versao_regra) DO UPDATE
    SET estado = 'processando', processo = excluded.processo, tentativas = t.tentativas + 1,
        executor = excluded.executor, usuario_id = excluded.usuario_id, erro = NULL, iniciado_em = clock_timestamp();
  RETURN jsonb_build_object('lote', p_lote, 'estado', 'processando', 'replay', false);
END
$$;

CREATE FUNCTION sentinela_pcdf_historico.tratar_lote(p_lote uuid, p_processo text) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  versao constant text := 'pcdf-tratamento-v1';
  lote sentinela.lotes_importacao;
  linha sentinela_pcdf_historico.tratamentos;
  v_fisicas integer; v_janeiro integer; v_classificacao integer; v_tratadas integer; v_restantes integer;
  v_ids jsonb; v_assinatura text; v_por_tipo jsonb; v_evidencia jsonb; v_ator uuid; v_estado text; v_tratamento uuid;
BEGIN
  IF NOT sentinela_pcdf_historico.executor_valido()
     OR p_processo NOT IN ('importacao-automatica','retomada','retroativo-0019','reprocessamento') THEN
    RAISE EXCEPTION 'Tratamento PCDF indisponivel' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-tratamento:' || p_lote::text, 0));
  SELECT * INTO lote FROM sentinela.lotes_importacao l WHERE l.id = p_lote;
  IF lote.id IS NULL OR lote.versao_contrato <> '2.0' OR lote.versao_tratamento <> 'pcdf-csv-avulso-v2'
     OR NOT EXISTS (SELECT FROM jsonb_array_elements(sentinela_pcdf_historico.status()) m
                    WHERE m->>'lot' = p_lote::text AND m->>'state' = 'done') THEN
    RAISE EXCEPTION 'Lote PCDF nao consolidado ou fora do contrato v2' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO linha FROM sentinela_pcdf_historico.tratamentos WHERE lote_id = p_lote AND versao_regra = versao;
  IF linha.estado IN ('concluido','concluido_com_pendencias') THEN
    RETURN jsonb_build_object('lote', p_lote, 'competencia', to_char(lote.competencia,'YYYY-MM'),
      'estado', linha.estado, 'tratadas', linha.tratadas, 'restantes', linha.restantes, 'replay', true);
  END IF;

  WITH p AS MATERIALIZED (
    SELECT p.id, p.tipo, p.campo::text campo, p.regra::text regra, p.efeito, p.dimensao_afetada, p.status,
      p.linha_origem_id, p.valor_original, p.ocorrencia_id, p.associacao_id
    FROM sentinela.pendencias_revisao p JOIN sentinela.linhas_staging s USING (linha_origem_id)
    WHERE s.lote_id = p_lote AND p.versao_regra = 'pcdf-csv-avulso-v2'
  ), marcadas AS MATERIALIZED (
    SELECT p.*,
      (p.tipo = 'coordenadas' AND p.status = 'aberta' AND p.ocorrencia_id IS NULL AND p.associacao_id IS NULL
        AND p.efeito = 'bloqueia_dimensao' AND p.dimensao_afetada = 'coordenadas'
        AND sentinela.pcdf_componente_ausente_v1(p.linha_origem_id, p.campo, p.regra, p.valor_original)) AS janeiro,
      ((p.campo = 'classificacao_status' AND p.regra IN ('classificacao_pendente','classificacao_nao_verificada'))
        OR (p.campo = 'natureza_sentinela_codigo' AND p.regra IN ('mapeamento_a_homologar','classificacao_pendente'))
        OR (p.campo = 'natureza_padronizada_pcdf' AND p.regra IN ('rotulo_criminal_pendente','categoria_fora_do_catalogo'))) AS classificacao,
      (p.tipo = 'coordenadas' AND p.status = 'aberta' AND p.ocorrencia_id IS NULL AND p.associacao_id IS NULL
        AND p.efeito = 'nao_bloqueante'
        AND sentinela.pcdf_utm_ausente_evidencia_v1(p.linha_origem_id, p.campo, p.regra, p.valor_original)
        AND EXISTS (SELECT FROM p g WHERE g.linha_origem_id = p.linha_origem_id AND g.status = 'aberta'
          AND g.tipo = 'coordenadas' AND g.campo = 'coordenada_status'
          AND g.regra IN ('geo_ausente','geo_incompleta','geo_invalida','geo_referencia_pendente')
          AND g.efeito = 'bloqueia_dimensao' AND g.dimensao_afetada = 'coordenadas')) AS utm
    FROM p
  )
  SELECT count(*), count(*) FILTER (WHERE janeiro), count(*) FILTER (WHERE classificacao AND NOT janeiro),
    count(*) FILTER (WHERE utm),
    coalesce(jsonb_agg(id ORDER BY id) FILTER (WHERE utm), '[]'::jsonb),
    encode(sha256(convert_to(coalesce(string_agg(id::text, ',' ORDER BY id) FILTER (WHERE utm), ''), 'UTF8')), 'hex'),
    (SELECT coalesce(jsonb_object_agg(tipo, n), '{}'::jsonb) FROM (
       SELECT m.tipo, count(*) n FROM marcadas m
       WHERE m.status IN ('aberta','em_analise') AND NOT (m.janeiro OR m.classificacao OR m.utm) GROUP BY m.tipo) q)
  INTO v_fisicas, v_janeiro, v_classificacao, v_tratadas, v_ids, v_assinatura, v_por_tipo
  FROM marcadas;

  v_restantes := v_fisicas - v_janeiro - v_classificacao - v_tratadas;
  v_estado := CASE WHEN v_restantes > 0 THEN 'concluido_com_pendencias' ELSE 'concluido' END;
  v_ator := sentinela_ambiente.ator_importacao();
  v_evidencia := jsonb_build_object(
    'sha256Arquivo', lote.sha256_arquivo, 'restantesPorTipo', v_por_tipo,
    'regras', jsonb_build_object(
      'componentesAusentesJaneiro', jsonb_build_object('versao', 'clone-pcdf-coordenadas-ausencia-0001',
        'aplicada', v_janeiro > 0, 'projetadas', v_janeiro),
      'utmAusenteInformativo', jsonb_build_object('versao', 'pcdf-utm-ausente-informativo-v1',
        'regraOrigem', 'clone-pcdf-coordenadas-ausencia-0001', 'aplicada', true, 'tratadas', v_tratadas,
        'sha256Pendencias', v_assinatura),
      'classificacao', jsonb_build_object('aplicada', false, 'pendentesOcultas', v_classificacao,
        'motivo', CASE WHEN to_regnamespace('sentinela_classificacao') IS NULL
          THEN 'Catalogo PCDF v2 nao instalado' ELSE 'Aplicada pelo fluxo da classificacao com versao homologada ativa' END),
      'regiaoAdministrativa', jsonb_build_object('aplicada', false,
        'motivo', 'Sem equivalencia historica homologada; RA 32 aprovada com ressalva'),
      'endereco', jsonb_build_object('aplicada', false, 'motivo', 'Sem regra de normalizacao homologada'),
      'geografia', jsonb_build_object('aplicada', false, 'motivo', 'CRS de origem PCDF nao confirmado')));

  INSERT INTO sentinela_pcdf_historico.tratamentos AS t
    (lote_id, competencia, versao_regra, estado, processo, executor, usuario_id, pendencias_fisicas,
     pendencias_antes, tratadas, restantes, sha256_tratadas, evidencia, concluido_em)
  VALUES (p_lote, lote.competencia, versao, v_estado, p_processo, session_user, v_ator, v_fisicas,
     v_fisicas - v_janeiro - v_classificacao, v_tratadas, v_restantes, v_assinatura, v_evidencia, clock_timestamp())
  ON CONFLICT (lote_id, versao_regra) DO UPDATE
    SET estado = excluded.estado, processo = excluded.processo, executor = excluded.executor,
        usuario_id = excluded.usuario_id, pendencias_fisicas = excluded.pendencias_fisicas,
        pendencias_antes = excluded.pendencias_antes, tratadas = excluded.tratadas,
        restantes = excluded.restantes, sha256_tratadas = excluded.sha256_tratadas,
        evidencia = excluded.evidencia, erro = NULL, concluido_em = excluded.concluido_em
  RETURNING id INTO v_tratamento;

  INSERT INTO sentinela_pcdf_historico.tratamento_pendencias (pendencia_id, tratamento_id, regra)
  SELECT value::uuid, v_tratamento, 'pcdf-utm-ausente-informativo-v1' FROM jsonb_array_elements_text(v_ids);

  INSERT INTO sentinela.eventos_auditoria(ator_tipo, servico, acao, antes, depois, justificativa)
  VALUES ('servico', 'sentinela-pcdf-tratamento', 'pcdf.tratamento.concluido',
    jsonb_build_object('pendenciasFisicas', v_fisicas, 'pendenciasFuncionais', v_fisicas - v_janeiro - v_classificacao),
    jsonb_build_object('lote', p_lote, 'competencia', to_char(lote.competencia,'YYYY-MM'), 'versao', versao,
      'processo', p_processo, 'executor', session_user, 'usuario', v_ator, 'estado', v_estado,
      'pendencias', v_ids, 'sha256Pendencias', v_assinatura, 'tratadas', v_tratadas, 'restantes', v_restantes,
      'evidencia', v_evidencia, 'historicoPreservado', true, 'statusAlterado', false),
    'Tratamento PCDF automatico: regras homologadas aplicadas; pendencias sem evidencia permanecem abertas');

  RETURN jsonb_build_object('lote', p_lote, 'competencia', to_char(lote.competencia,'YYYY-MM'),
    'estado', v_estado, 'tratadas', v_tratadas, 'restantes', v_restantes, 'replay', false);
END
$$;

CREATE FUNCTION sentinela_pcdf_historico.registrar_falha_tratamento(p_lote uuid, p_erro text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  versao constant text := 'pcdf-tratamento-v1';
  competencia_lote date;
  motivo constant text := left(coalesce(nullif(regexp_replace(p_erro, '[^A-Za-z0-9_.: -]', '', 'g'), ''), 'falha'), 200);
BEGIN
  IF NOT sentinela_pcdf_historico.executor_valido() THEN
    RAISE EXCEPTION 'Tratamento PCDF indisponivel' USING ERRCODE = '42501';
  END IF;
  SELECT l.competencia INTO competencia_lote FROM sentinela.lotes_importacao l WHERE l.id = p_lote;
  IF competencia_lote IS NULL THEN RETURN; END IF;
  INSERT INTO sentinela_pcdf_historico.tratamentos AS t
    (lote_id, competencia, versao_regra, estado, processo, executor, usuario_id, erro)
  VALUES (p_lote, competencia_lote, versao, 'falha_recuperavel', 'importacao-automatica', session_user,
          sentinela_ambiente.ator_importacao(), motivo)
  ON CONFLICT (lote_id, versao_regra) DO UPDATE SET estado = 'falha_recuperavel', erro = excluded.erro
    WHERE t.estado NOT IN ('concluido','concluido_com_pendencias');
  INSERT INTO sentinela.eventos_auditoria(ator_tipo, servico, acao, depois, justificativa)
  VALUES ('servico', 'sentinela-pcdf-tratamento', 'pcdf.tratamento.falha',
    jsonb_build_object('lote', p_lote, 'competencia', to_char(competencia_lote,'YYYY-MM'), 'versao', versao,
      'erro', motivo, 'executor', session_user),
    'Tratamento automatico interrompido; competencia aguardando retomada');
END
$$;

-- Lotes consolidados sem tratamento concluído na versão atual (ordem cronológica).
CREATE FUNCTION sentinela_pcdf_historico.lotes_pendentes_tratamento() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(array_agg((m->>'lot')::uuid ORDER BY m->>'month'), '{}')
  FROM jsonb_array_elements(sentinela_pcdf_historico.status()) m
  WHERE m->>'state' = 'done' AND sentinela_pcdf_historico.executor_valido()
    AND NOT EXISTS (SELECT FROM sentinela_pcdf_historico.tratamentos t
      WHERE t.lote_id = (m->>'lot')::uuid AND t.versao_regra = 'pcdf-tratamento-v1'
        AND (t.estado IN ('concluido','concluido_com_pendencias')
             OR (t.estado = 'processando' AND t.atualizado_em > clock_timestamp() - interval '10 minutes')))
$$;

-- Situação por competência para o Histórico de Importações.
CREATE FUNCTION sentinela_pcdf_historico.situacao_tratamento() RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'month', m->>'month', 'lot', m->>'lot',
    'state', CASE WHEN t.id IS NULL THEN 'aguardando'
      WHEN t.estado = 'processando' AND t.atualizado_em <= clock_timestamp() - interval '10 minutes' THEN 'falha_recuperavel'
      ELSE t.estado END,
    'version', t.versao_regra, 'treated', t.tratadas, 'remaining', t.restantes, 'before', t.pendencias_antes,
    'attempts', t.tentativas, 'updatedAt', t.atualizado_em) ORDER BY m->>'month'), '[]'::jsonb)
  FROM jsonb_array_elements(sentinela_pcdf_historico.status()) m
  LEFT JOIN sentinela_pcdf_historico.tratamentos t
    ON t.lote_id = (m->>'lot')::uuid AND t.versao_regra = 'pcdf-tratamento-v1'
  WHERE m->>'state' = 'done' AND session_user IN ('sentinela_local_admin','sentinela_local_operator','postgres')
$$;
REVOKE ALL ON FUNCTION sentinela_pcdf_historico.executor_valido(),
  sentinela_pcdf_historico.iniciar_tratamento(uuid,text), sentinela_pcdf_historico.tratar_lote(uuid,text),
  sentinela_pcdf_historico.registrar_falha_tratamento(uuid,text),
  sentinela_pcdf_historico.lotes_pendentes_tratamento(), sentinela_pcdf_historico.situacao_tratamento()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_historico.iniciar_tratamento(uuid,text),
  sentinela_pcdf_historico.tratar_lote(uuid,text), sentinela_pcdf_historico.registrar_falha_tratamento(uuid,text),
  sentinela_pcdf_historico.lotes_pendentes_tratamento() TO sentinela_local_admin, postgres;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_historico.situacao_tratamento()
  TO sentinela_local_admin, sentinela_local_operator, postgres;

RESET ROLE;
REVOKE CREATE ON SCHEMA sentinela_pcdf_historico FROM sentinela_pcdf_historico_owner;

-- 5. Tratamento retroativo das competências já consolidadas, em ordem cronológica, com coortes conferidas.
--    O executor técnico registrado é o session_user (postgres); o código roda com o papel dono.
SET LOCAL ROLE sentinela_pcdf_historico_owner;
DO $retro$
DECLARE
  esperado constant jsonb := '{
    "2021-01": [0, null, 26714],
    "2021-02": [4737, "428be915caaa4e0bd15c40d6e51fc8ce705541bf1a3b656349538b83e09610cc", 13593],
    "2021-03": [4773, "d8fa92a6198bbe38168d6c674b68c99b5169f849464b433fba44d58eb99cefbb", 13616],
    "2021-04": [4916, "f4cc905e4ce81413db145b51de21464e585fe7ed02f384998f47ff34c6ff9319", 13871],
    "2021-05": [4891, "41190895f4c4ef5b7fab53c12101ab39dab917c0a27e285e33fb5c69de8f1542", 14232],
    "2021-06": [4773, "d9c4b4a5ec3967b25eb1e01b2dd267b97369f40dab0835224e50e1fbe34da2f3", 13695],
    "2021-07": [4708, "9da701c4b1c62ecc794c14914fc18e75414642d3e4c8af65f61a7b734286e121", 13812],
    "2021-08": [4801, "34c2f560d134c11c66cc88c46ab5175880f81fa0f4f97cb1b5ed5b4517c5d403", 14092],
    "2021-09": [5019, "1acd349f274c6739d56b4471c97df818953222b100fd9552315b1f5830d54f30", 14438],
    "2021-10": [5446, "01eeb79ce7cd6da1ecda1acc526ac311cdaaa42d14c815c9891c0e4edefd9a68", 15553],
    "2021-11": [5137, "43aaee374290ea252adb33ad42d3c71d1de6cc2cff35ba74a110db7e41f261b7", 14959]
  }';
  lote uuid;
  linha sentinela_pcdf_historico.tratamentos;
  vazio constant text := encode(sha256(''::bytea), 'hex');
BEGIN
  IF (SELECT count(*) FROM jsonb_array_elements(sentinela_pcdf_historico.status()) m WHERE m->>'state' = 'done') <> 11 THEN
    RAISE EXCEPTION 'Competencias consolidadas divergem do pre-voo da 0019.';
  END IF;
  FOREACH lote IN ARRAY sentinela_pcdf_historico.lotes_pendentes_tratamento() LOOP
    PERFORM sentinela_pcdf_historico.tratar_lote(lote, 'retroativo-0019');
    SELECT * INTO linha FROM sentinela_pcdf_historico.tratamentos t WHERE t.lote_id = lote;
    IF esperado->to_char(linha.competencia,'YYYY-MM') IS NULL
       OR linha.tratadas <> (esperado->to_char(linha.competencia,'YYYY-MM')->>0)::int
       OR linha.pendencias_fisicas <> (esperado->to_char(linha.competencia,'YYYY-MM')->>2)::int
       OR linha.sha256_tratadas <> coalesce(esperado->to_char(linha.competencia,'YYYY-MM')->>1, vazio) THEN
      RAISE EXCEPTION 'Coorte retroativa de % divergente.', to_char(linha.competencia,'YYYY-MM');
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM sentinela_pcdf_historico.tratamentos WHERE estado IN ('concluido','concluido_com_pendencias')) <> 11
     OR (SELECT sum(tratadas) FROM sentinela_pcdf_historico.tratamentos) <> 49201
     OR (SELECT count(*) FROM sentinela_pcdf_historico.tratamento_pendencias) <> 49201
     OR (SELECT sum(restantes) FROM sentinela_pcdf_historico.tratamentos) <> 100751
     OR (SELECT count(*) FROM sentinela.eventos_auditoria WHERE acao = 'pcdf.tratamento.concluido') <> 11
     OR (SELECT count(*) FROM sentinela.pendencias_revisao) <> 168575
     OR EXISTS (SELECT FROM sentinela.pendencias_revisao WHERE status <> 'aberta') THEN
    RAISE EXCEPTION 'Tratamento retroativo fora do escopo da 0019.';
  END IF;
END $retro$;
RESET ROLE;

INSERT INTO sentinela.schema_migrations VALUES
  ('0019', 'Tratamento automatico auditado das pendencias PCDF v2 por competencia', DEFAULT);
COMMIT;
