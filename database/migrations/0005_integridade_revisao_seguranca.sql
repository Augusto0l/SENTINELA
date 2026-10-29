-- Incremental: preservar 0001-0004. Nao habilita Auth, RPC ou escrita da aplicacao.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, sentinela, public;

-- Um vinculo definitivo ao caso exige a mesma associacao/linha/ocorrencia.
-- Candidatos ainda nao consolidados permanecem nos derivados/diagnosticos do staging.
ALTER TABLE sentinela.linhas_staging ADD CONSTRAINT staging_vinculo_completo_ck
  CHECK ((ocorrencia_id IS NULL) = (associacao_id IS NULL));
ALTER TABLE sentinela.pendencias_revisao
  ADD COLUMN associacao_id uuid,
  ADD CONSTRAINT pendencia_vinculo_completo_ck
    CHECK ((ocorrencia_id IS NOT NULL AND linha_origem_id IS NOT NULL) = (associacao_id IS NOT NULL)),
  ADD CONSTRAINT pendencia_associacao_origem_fk
    FOREIGN KEY (associacao_id, linha_origem_id, ocorrencia_id)
    REFERENCES sentinela.ocorrencia_naturezas(id, linha_origem_id, ocorrencia_id);
CREATE INDEX pendencias_associacao_idx ON sentinela.pendencias_revisao(associacao_id);

CREATE FUNCTION sentinela.proteger_identidade_ocorrencia()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF ROW(NEW.id, NEW.origem, NEW.fonte, NEW.ano_registro, NEW.unidade_registro,
      NEW.numero_registro, NEW.versao_identidade, NEW.identidade_status, NEW.evidencia_identidade, NEW.criado_em)
    IS DISTINCT FROM
    ROW(OLD.id, OLD.origem, OLD.fonte, OLD.ano_registro, OLD.unidade_registro,
      OLD.numero_registro, OLD.versao_identidade, OLD.identidade_status, OLD.evidencia_identidade, OLD.criado_em) THEN
    RAISE EXCEPTION 'Identidade/proveniencia imutaveis; reidentificacao exige procedimento proprio auditado.'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER identidade_preservar BEFORE UPDATE ON sentinela.ocorrencias
FOR EACH ROW EXECUTE FUNCTION sentinela.proteger_identidade_ocorrencia();

CREATE FUNCTION sentinela.proteger_destino_associacao()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF ROW(NEW.id, NEW.ocorrencia_id, NEW.linha_origem_id, NEW.origem, NEW.criado_em)
    IS DISTINCT FROM ROW(OLD.id, OLD.ocorrencia_id, OLD.linha_origem_id, OLD.origem, OLD.criado_em) THEN
    RAISE EXCEPTION 'Associacao nao pode ser transferida ou reidentificada silenciosamente.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER destino_preservar BEFORE UPDATE ON sentinela.ocorrencia_naturezas
FOR EACH ROW EXECUTE FUNCTION sentinela.proteger_destino_associacao();

CREATE OR REPLACE FUNCTION sentinela.proteger_origem_pendencia()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF ROW(NEW.id, NEW.ocorrencia_id, NEW.associacao_id, NEW.linha_origem_id, NEW.valor_original,
      NEW.campo, NEW.regra, NEW.versao_regra, NEW.detectada_em)
    IS DISTINCT FROM ROW(OLD.id, OLD.ocorrencia_id, OLD.associacao_id, OLD.linha_origem_id, OLD.valor_original,
      OLD.campo, OLD.regra, OLD.versao_regra, OLD.detectada_em) THEN
    RAISE EXCEPTION 'Origem e identidade da pendencia sao imutaveis.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;

-- Validar novas atribuicoes, nunca exigir atividade atual de uma autoria historica.
-- A prova do autor autenticado depende de Auth/backend e continua bloqueada abaixo.
CREATE OR REPLACE FUNCTION sentinela.exigir_revisor_administrador()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE validar boolean := true;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    validar := NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id;
  END IF;
  IF validar AND NEW.responsavel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sentinela.usuarios u WHERE u.id = NEW.responsavel_id
      AND u.ativo AND u.perfil = 'Administrador'
  ) THEN
    RAISE EXCEPTION 'Nova atribuicao/correcao exige Administrador ativo.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- Impedir que o historico seja anexado a um diagnostico de outro caso.
CREATE FUNCTION sentinela.verificar_alvo_pendencia(alvo_ocorrencia uuid, alvo_linha uuid, alvo_associacao uuid, pendencia uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE
  pend sentinela.pendencias_revisao%ROWTYPE;
BEGIN
  IF pendencia IS NOT NULL THEN
    SELECT * INTO pend FROM sentinela.pendencias_revisao p WHERE p.id = pendencia;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pendencia inexistente.' USING ERRCODE = '23503'; END IF;
    IF pend.ocorrencia_id IS NOT NULL AND pend.ocorrencia_id IS DISTINCT FROM alvo_ocorrencia THEN
      RAISE EXCEPTION 'Correcao e pendencia pertencem a ocorrencias diferentes.' USING ERRCODE = '23514';
    END IF;
    IF pend.linha_origem_id IS NOT NULL THEN
      IF alvo_linha IS NOT NULL AND pend.linha_origem_id IS DISTINCT FROM alvo_linha THEN
        RAISE EXCEPTION 'Correcao e pendencia pertencem a linhas diferentes.' USING ERRCODE = '23514';
      ELSIF alvo_linha IS NULL AND NOT EXISTS (
        SELECT 1 FROM sentinela.ocorrencia_naturezas a
        WHERE a.linha_origem_id = pend.linha_origem_id AND a.ocorrencia_id = alvo_ocorrencia
      ) THEN
        RAISE EXCEPTION 'Linha da pendencia nao comprova a ocorrencia corrigida.' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF pend.associacao_id IS NOT NULL AND alvo_associacao IS NOT NULL
      AND pend.associacao_id IS DISTINCT FROM alvo_associacao THEN
      RAISE EXCEPTION 'Correcao e pendencia pertencem a associacoes diferentes.' USING ERRCODE = '23514';
    END IF;
  END IF;
END $$;

CREATE FUNCTION sentinela.validar_destino_correcao()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE alvo_ocorrencia uuid; alvo_linha uuid; alvo_associacao uuid;
BEGIN
  IF NEW.ocorrencia_id IS NOT NULL THEN
    alvo_ocorrencia := NEW.ocorrencia_id;
  ELSIF NEW.associacao_id IS NOT NULL THEN
    SELECT a.ocorrencia_id, a.linha_origem_id, a.id INTO alvo_ocorrencia, alvo_linha, alvo_associacao
      FROM sentinela.ocorrencia_naturezas a WHERE a.id = NEW.associacao_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Associacao inexistente.' USING ERRCODE = '23503'; END IF;
  ELSIF NEW.staging_id IS NOT NULL THEN
    SELECT s.ocorrencia_id, s.linha_origem_id, s.associacao_id INTO alvo_ocorrencia, alvo_linha, alvo_associacao
      FROM sentinela.linhas_staging s WHERE s.id = NEW.staging_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Staging inexistente.' USING ERRCODE = '23503'; END IF;
  END IF;
  PERFORM sentinela.verificar_alvo_pendencia(alvo_ocorrencia,alvo_linha,alvo_associacao,NEW.pendencia_id);
  RETURN NEW;
END $$;
CREATE TRIGGER correcao_destino BEFORE INSERT ON sentinela.historico_correcoes
FOR EACH ROW EXECUTE FUNCTION sentinela.validar_destino_correcao();

-- Proveniencia transacional e instante sao derivados pelo banco, nao pelo cliente.
-- Historicos anteriores conservam NULL: nao fabricar a transacao original retroativamente.
ALTER TABLE sentinela.historico_correcoes ADD COLUMN transacao_id xid8,
  ADD CONSTRAINT correcao_nova_transacao_ck CHECK (transacao_id IS NOT NULL) NOT VALID;
ALTER TABLE sentinela.eventos_auditoria ADD COLUMN transacao_id xid8,
  ADD CONSTRAINT evento_novo_transacao_ck CHECK (transacao_id IS NOT NULL) NOT VALID;
CREATE FUNCTION sentinela.carimbar_auditoria()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  NEW.transacao_id := pg_current_xact_id();
  IF TG_TABLE_NAME = 'historico_correcoes' THEN NEW.corrigido_em := clock_timestamp();
  ELSE NEW.registrado_em := clock_timestamp(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER auditoria_carimbar BEFORE INSERT ON sentinela.historico_correcoes
FOR EACH ROW EXECUTE FUNCTION sentinela.carimbar_auditoria();
CREATE TRIGGER auditoria_carimbar BEFORE INSERT ON sentinela.eventos_auditoria
FOR EACH ROW EXECUTE FUNCTION sentinela.carimbar_auditoria();

CREATE FUNCTION sentinela.validar_vinculos_evento()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE caso uuid; linha uuid;
BEGIN
  IF NEW.ocorrencia_id IS NOT NULL AND NEW.linha_origem_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sentinela.ocorrencia_naturezas a
    WHERE a.ocorrencia_id=NEW.ocorrencia_id AND a.linha_origem_id=NEW.linha_origem_id
  ) THEN RAISE EXCEPTION 'Evento vincula linha de outro caso.' USING ERRCODE='23514'; END IF;
  IF NEW.pendencia_id IS NOT NULL AND (NEW.ocorrencia_id IS NOT NULL OR NEW.linha_origem_id IS NOT NULL) THEN
    PERFORM sentinela.verificar_alvo_pendencia(NEW.ocorrencia_id,NEW.linha_origem_id,NULL,NEW.pendencia_id);
  END IF;
  IF NEW.execucao_id IS NOT NULL AND NEW.linha_origem_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sentinela.execucoes_importacao e JOIN sentinela.linhas_origem l ON l.extracao_id=e.extracao_id
    WHERE e.id=NEW.execucao_id AND l.id=NEW.linha_origem_id
  ) THEN RAISE EXCEPTION 'Evento vincula execucao de outra extracao.' USING ERRCODE='23514'; END IF;
  IF NEW.correcao_id IS NOT NULL THEN
    SELECT coalesce(h.ocorrencia_id,a.ocorrencia_id,s.ocorrencia_id),coalesce(a.linha_origem_id,s.linha_origem_id)
      INTO caso,linha FROM sentinela.historico_correcoes h
      LEFT JOIN sentinela.ocorrencia_naturezas a ON a.id=h.associacao_id
      LEFT JOIN sentinela.linhas_staging s ON s.id=h.staging_id WHERE h.id=NEW.correcao_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Correcao inexistente.' USING ERRCODE='23503'; END IF;
    IF NEW.ocorrencia_id IS NOT NULL AND NEW.ocorrencia_id IS DISTINCT FROM caso THEN
      RAISE EXCEPTION 'Evento e correcao pertencem a casos diferentes.' USING ERRCODE='23514';
    END IF;
    IF NEW.linha_origem_id IS NOT NULL AND (
      (linha IS NOT NULL AND linha IS DISTINCT FROM NEW.linha_origem_id) OR
      (linha IS NULL AND NOT EXISTS(SELECT 1 FROM sentinela.ocorrencia_naturezas a
        WHERE a.ocorrencia_id=caso AND a.linha_origem_id=NEW.linha_origem_id))
    ) THEN RAISE EXCEPTION 'Evento e correcao pertencem a linhas diferentes.' USING ERRCODE='23514'; END IF;
    PERFORM sentinela.verificar_alvo_pendencia(caso,linha,NULL,NEW.pendencia_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER evento_vinculos BEFORE INSERT ON sentinela.eventos_auditoria
FOR EACH ROW EXECUTE FUNCTION sentinela.validar_vinculos_evento();

-- Validar historicos existentes sem atualiza-los ou inventar autores/carimbos.
DO $$
DECLARE h record;
BEGIN
  FOR h IN SELECT c.pendencia_id,coalesce(c.ocorrencia_id,a.ocorrencia_id,s.ocorrencia_id) AS caso,
      coalesce(a.linha_origem_id,s.linha_origem_id) AS linha,coalesce(c.associacao_id,s.associacao_id) AS associacao
    FROM sentinela.historico_correcoes c
    LEFT JOIN sentinela.ocorrencia_naturezas a ON a.id=c.associacao_id
    LEFT JOIN sentinela.linhas_staging s ON s.id=c.staging_id WHERE c.pendencia_id IS NOT NULL LOOP
    PERFORM sentinela.verificar_alvo_pendencia(h.caso,h.linha,h.associacao,h.pendencia_id);
  END LOOP;
END $$;

-- A conferência diferida admite historico antes/depois do UPDATE na MESMA transacao.
-- campo usa nome fisico SQL; valores sao o valor JSON de cada campo, incluindo JSON null.
CREATE FUNCTION sentinela.exigir_historico_correcao()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE item record; anterior jsonb := to_jsonb(OLD); novo jsonb := to_jsonb(NEW);
BEGIN
  FOR item IN SELECT key, value FROM jsonb_each(novo - ARRAY['versao', 'atualizado_em']) LOOP
    IF item.value IS DISTINCT FROM anterior -> item.key AND NOT EXISTS (
      SELECT 1 FROM sentinela.historico_correcoes h
      WHERE h.transacao_id = pg_current_xact_id() AND h.versao_registro_anterior = OLD.versao
        AND h.campo = item.key AND h.valores_anteriores = anterior -> item.key AND h.valores_novos = item.value
        AND ((TG_TABLE_NAME = 'ocorrencias' AND h.ocorrencia_id = OLD.id)
          OR (TG_TABLE_NAME = 'ocorrencia_naturezas' AND h.associacao_id = OLD.id)
          OR (TG_TABLE_NAME = 'linhas_staging' AND h.staging_id = OLD.id))
    ) THEN
      RAISE EXCEPTION 'Correcao de %.% exige historico correspondente nesta transacao.', TG_TABLE_NAME, item.key
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER correcao_exige_historico AFTER UPDATE ON sentinela.ocorrencias
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sentinela.exigir_historico_correcao();
CREATE CONSTRAINT TRIGGER correcao_exige_historico AFTER UPDATE ON sentinela.ocorrencia_naturezas
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sentinela.exigir_historico_correcao();
CREATE CONSTRAINT TRIGGER correcao_exige_historico AFTER UPDATE ON sentinela.linhas_staging
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sentinela.exigir_historico_correcao();

CREATE FUNCTION sentinela.exigir_evento_pendencia()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['versao', 'atualizado_em']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['versao', 'atualizado_em']) AND NOT EXISTS (
    SELECT 1 FROM sentinela.eventos_auditoria e WHERE e.pendencia_id = OLD.id
      AND e.transacao_id = pg_current_xact_id() AND e.antes = to_jsonb(OLD) AND e.depois = to_jsonb(NEW)
  ) THEN
    RAISE EXCEPTION 'Alteracao de pendencia exige evento antes/depois nesta transacao.' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER pendencia_exige_evento AFTER UPDATE ON sentinela.pendencias_revisao
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sentinela.exigir_evento_pendencia();

-- Trava intencional, inclusive contra UUID de administrador ou GUC forjados.
-- Substituir SOMENTE por migration de Auth + autorizacao + backend transacional testado.
-- Nao existe flag de sessao, role privilegiada da aplicacao ou RPC para desliga-la.
CREATE FUNCTION sentinela.bloquear_correcao_sem_backend()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Correcao bloqueada ate Auth e backend transacional auditado serem implementados.'
    USING ERRCODE = '42501';
END $$;
CREATE TRIGGER escrita_correcao_bloqueada BEFORE UPDATE OR DELETE ON sentinela.ocorrencias
FOR EACH STATEMENT EXECUTE FUNCTION sentinela.bloquear_correcao_sem_backend();
CREATE TRIGGER escrita_correcao_bloqueada BEFORE UPDATE OR DELETE ON sentinela.ocorrencia_naturezas
FOR EACH STATEMENT EXECUTE FUNCTION sentinela.bloquear_correcao_sem_backend();
CREATE TRIGGER escrita_correcao_bloqueada BEFORE UPDATE OR DELETE ON sentinela.linhas_staging
FOR EACH STATEMENT EXECUTE FUNCTION sentinela.bloquear_correcao_sem_backend();
CREATE TRIGGER escrita_correcao_bloqueada BEFORE UPDATE OR DELETE ON sentinela.pendencias_revisao
FOR EACH STATEMENT EXECUTE FUNCTION sentinela.bloquear_correcao_sem_backend();
CREATE TRIGGER escrita_correcao_bloqueada BEFORE INSERT ON sentinela.historico_correcoes
FOR EACH STATEMENT EXECUTE FUNCTION sentinela.bloquear_correcao_sem_backend();

CREATE FUNCTION sentinela.bloquear_autoria_manual_sem_auth()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_TABLE_NAME = 'pendencias_revisao' THEN
    IF NEW.status <> 'aberta' OR NEW.responsavel_id IS NOT NULL THEN
      RAISE EXCEPTION 'Atribuicao/decisao manual depende de Auth real.' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.ator_tipo = 'usuario' THEN
    RAISE EXCEPTION 'Autoria humana de auditoria depende de Auth real.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER autoria_manual_bloqueada BEFORE INSERT ON sentinela.pendencias_revisao
FOR EACH ROW EXECUTE FUNCTION sentinela.bloquear_autoria_manual_sem_auth();
CREATE TRIGGER autoria_manual_bloqueada BEFORE INSERT ON sentinela.eventos_auditoria
FOR EACH ROW EXECUTE FUNCTION sentinela.bloquear_autoria_manual_sem_auth();

-- Facilitar a conferência por alvo/versao sem varrer todo o historico em cada UPDATE.
CREATE INDEX correcoes_ocorrencia_versao_idx ON sentinela.historico_correcoes(ocorrencia_id, versao_registro_anterior, transacao_id);
CREATE INDEX correcoes_associacao_versao_idx ON sentinela.historico_correcoes(associacao_id, versao_registro_anterior, transacao_id);
CREATE INDEX correcoes_staging_versao_idx ON sentinela.historico_correcoes(staging_id, versao_registro_anterior, transacao_id);

-- Conserva os originais de 0001-0004 e nao sana vinculos preexistentes silenciosamente:
-- qualquer dado incompatível faz a transacao falhar para diagnostico.
REVOKE ALL ON ALL TABLES IN SCHEMA sentinela FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA sentinela FROM PUBLIC;
INSERT INTO sentinela.schema_migrations VALUES ('0005', 'Identidade, vinculos, auditoria transacional e trava de correcao', DEFAULT);
COMMIT;
