BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = sentinela, public, pg_catalog;

CREATE FUNCTION sentinela.impedir_mutacao()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Objeto % e imutavel: preservar origem/historico e criar nova versao.', TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$;

CREATE FUNCTION sentinela.atualizar_versao()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  NEW.versao := OLD.versao + 1;
  NEW.atualizado_em := clock_timestamp();
  RETURN NEW;
END $$;

CREATE FUNCTION sentinela.proteger_snapshot_staging()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['derivados_efetivos', 'diagnosticos', 'estado', 'versao',
      'atualizado_em', 'ocorrencia_id', 'associacao_id']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['derivados_efetivos', 'diagnosticos', 'estado', 'versao',
      'atualizado_em', 'ocorrencia_id', 'associacao_id']) THEN
    RAISE EXCEPTION 'Proveniencia e campos CSV do staging sao imutaveis.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION sentinela.validar_associacao_mapeada()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.linha_origem_id IS DISTINCT FROM OLD.linha_origem_id
    OR NEW.origem IS DISTINCT FROM OLD.origem) THEN
    RAISE EXCEPTION 'Proveniencia da associacao e imutavel.' USING ERRCODE = '55000';
  END IF;
  IF NEW.mapeamento_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sentinela.mapeamentos_natureza m
    JOIN sentinela.categorias_criminais c ON c.id = m.categoria_id
    WHERE m.id = NEW.mapeamento_id AND m.natureza_id = NEW.natureza_id
      AND m.status = 'homologado' AND c.status = 'homologada'
      AND m.crime_tentado IS NOT DISTINCT FROM NEW.crime_tentado
  ) THEN
    RAISE EXCEPTION 'Classificacao exige regra/categoria homologadas e tentativa correspondente.'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM sentinela.ocorrencias o
    JOIN sentinela.naturezas_criminais n ON n.id = NEW.natureza_id
    WHERE o.id = NEW.ocorrencia_id AND o.origem = NEW.origem AND o.fonte = n.fonte
  ) THEN
    RAISE EXCEPTION 'Origem/fonte da associacao deve corresponder a ocorrencia e natureza.' USING ERRCODE = '23514';
  END IF;
  IF NEW.linha_origem_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sentinela.linhas_origem l
    JOIN sentinela.extracoes_origem e ON e.id = l.extracao_id
    JOIN sentinela.ocorrencias o ON o.id = NEW.ocorrencia_id
    WHERE l.id = NEW.linha_origem_id AND e.fonte = o.fonte
  ) THEN
    RAISE EXCEPTION 'Linha original pertence a outra fonte ou nao existe.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER associacao_validar BEFORE INSERT OR UPDATE ON sentinela.ocorrencia_naturezas
FOR EACH ROW EXECUTE FUNCTION sentinela.validar_associacao_mapeada();

-- Defesa de integridade: nao substitui identidade autenticada/autorizacao no backend futuro.
CREATE FUNCTION sentinela.exigir_revisor_administrador()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.responsavel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sentinela.usuarios u WHERE u.id = NEW.responsavel_id
      AND u.ativo AND u.perfil = 'Administrador'
  ) THEN
    RAISE EXCEPTION 'Revisor/corretor deve ser Administrador ativo.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER correcao_revisor BEFORE INSERT ON sentinela.historico_correcoes
FOR EACH ROW EXECUTE FUNCTION sentinela.exigir_revisor_administrador();
CREATE TRIGGER pendencia_revisor BEFORE INSERT OR UPDATE ON sentinela.pendencias_revisao
FOR EACH ROW EXECUTE FUNCTION sentinela.exigir_revisor_administrador();

CREATE FUNCTION sentinela.proteger_origem_pendencia()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.valor_original IS DISTINCT FROM OLD.valor_original
    OR NEW.linha_origem_id IS DISTINCT FROM OLD.linha_origem_id
    OR NEW.campo IS DISTINCT FROM OLD.campo OR NEW.regra IS DISTINCT FROM OLD.regra
    OR NEW.versao_regra IS DISTINCT FROM OLD.versao_regra
    OR NEW.detectada_em IS DISTINCT FROM OLD.detectada_em THEN
    RAISE EXCEPTION 'Origem e identidade da pendencia sao imutaveis.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pendencia_preservar BEFORE UPDATE ON sentinela.pendencias_revisao
FOR EACH ROW EXECUTE FUNCTION sentinela.proteger_origem_pendencia();
CREATE TRIGGER staging_preservar BEFORE UPDATE ON sentinela.linhas_staging
FOR EACH ROW EXECUTE FUNCTION sentinela.proteger_snapshot_staging();

-- Avalia pertencimento, inclui borda. Nao transforma nem move o ponto e nao corrige RA.
-- SECURITY INVOKER: nenhuma elevacao de privilegio ou acesso fora de RLS.
CREATE FUNCTION sentinela.avaliar_pertencimento_territorial(p_ocorrencia_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN o.geometria IS NULL OR r.limite IS NULL OR o.data_fato IS NULL THEN 'pendente'
    WHEN NOT (r.vigencia @> o.data_fato) THEN 'vigencia_incompativel'
    WHEN public.ST_Covers(r.limite, o.geometria) THEN 'compativel'
    ELSE 'divergente'
  END
  FROM sentinela.ocorrencias o
  LEFT JOIN sentinela.regioes_administrativas r ON r.id = o.ra_id
  WHERE o.id = p_ocorrencia_id
$$;

INSERT INTO sentinela.schema_migrations VALUES ('0004', 'Integridade, imutabilidade e RLS fechado', DEFAULT);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['extracoes_origem', 'lotes_importacao', 'linhas_origem',
    'naturezas_criminais', 'mapeamentos_natureza', 'categorias_criminais', 'regioes_administrativas',
    'historico_correcoes', 'eventos_auditoria', 'schema_migrations'] LOOP
    EXECUTE format('CREATE TRIGGER imutavel BEFORE UPDATE OR DELETE ON sentinela.%I '
      'FOR EACH ROW EXECUTE FUNCTION sentinela.impedir_mutacao()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['ocorrencias', 'ocorrencia_naturezas', 'linhas_staging', 'pendencias_revisao'] LOOP
    EXECUTE format('CREATE TRIGGER versao_atualizar BEFORE UPDATE ON sentinela.%I '
      'FOR EACH ROW EXECUTE FUNCTION sentinela.atualizar_versao()', t);
  END LOOP;
  -- Todas as tabelas, inclusive catalogos e metadados: fechado ate politicas da Etapa 2.
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'sentinela' LOOP
    EXECUTE format('ALTER TABLE sentinela.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE sentinela.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE TRIGGER impedir_truncate BEFORE TRUNCATE ON sentinela.%I '
      'FOR EACH STATEMENT EXECUTE FUNCTION sentinela.impedir_mutacao()', t);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA sentinela FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA sentinela FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA sentinela FROM PUBLIC;
-- Nenhum GRANT, POLICY permissiva, auth.uid() falso ou role Supabase e criado.
-- FORCE RLS nao limita superusuarios/BYPASSRLS: nunca usar essas identidades na aplicacao.
COMMIT;
