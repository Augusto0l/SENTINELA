-- 0015 - Classificacao PCDF v2 no Supabase hospedado. PENDENTE: aplicar somente com autorizacao expressa.
-- Instala: proposta v2 (23 categorias e 43 regras PENDENTES), registro versionado de homologacao (responsavel,
-- evidencia, vigencia), versao ativa explicita, aplicacao auditada por lote, conciliacao das pendencias de
-- classificacao, pendencia somente quando necessaria, reversao compensatoria e categoria no detalhe da ocorrencia.
-- NAO homologa nenhuma regra, NAO ativa versao e NAO altera associacoes: isso exige a sessao Auth do Administrador.
-- Identidade: sentinela_classificacao.ator() = Administrador ativo cuja sessao Supabase Auth o servidor verificou
-- (sentinela_ambiente.ator_operacional) na conexao do perfil sentinela_local_admin. Nenhum UUID do cliente e aceito.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  IF NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao = '0011')
     OR EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao = '0015')
     OR NOT sentinela_ambiente.vinculado() THEN
    RAISE EXCEPTION '0015 exige a 0011 na instalacao vinculada e ainda nao aplicada.';
  END IF;
  IF (SELECT count(*) FROM sentinela.naturezas_criminais WHERE fonte = 'PCDF' AND categoria_pcdf_original IS NULL
        AND sentinela.descricao_pcdf(descricao_original)) <> 41
     OR EXISTS (SELECT FROM sentinela.categorias_criminais WHERE versao_catalogo LIKE 'sentinela-categorias-v2%')
     OR EXISTS (SELECT FROM sentinela.mapeamentos_natureza WHERE versao LIKE 'pcdf-classificacao-v2%') THEN
    RAISE EXCEPTION 'Catalogo PCDF divergente do pre-voo da 0015.';
  END IF;
END $pre$;

CREATE ROLE sentinela_classificacao_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT sentinela_classificacao_owner TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
CREATE SCHEMA sentinela_classificacao;
REVOKE ALL ON SCHEMA sentinela_classificacao FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA sentinela_classificacao TO sentinela_classificacao_owner, sentinela_local_admin, sentinela_local_operator;
GRANT USAGE, CREATE ON SCHEMA sentinela_classificacao TO sentinela_classificacao_owner;
GRANT USAGE ON SCHEMA sentinela TO sentinela_classificacao_owner;

-- Identity derived from the verified Auth session; owned by the migrator so its own reads are not policy-bound.
CREATE FUNCTION sentinela_classificacao.ator() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT u.id FROM sentinela.usuarios u
  JOIN sentinela.perfil_permissoes p ON p.perfil = u.perfil AND p.acao = 'importar'
  WHERE u.id = sentinela_ambiente.ator_operacional() AND u.ativo AND u.perfil = 'Administrador'
    AND session_user = 'sentinela_local_admin' AND sentinela_ambiente.vinculado()
$$;
REVOKE ALL ON FUNCTION sentinela_classificacao.ator() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sentinela_classificacao.ator() TO sentinela_classificacao_owner;
-- Actor verified at the entry of an owner function in THIS transaction. Only meaningful while current_user is the
-- NOLOGIN owner (reachable solely through its SECURITY DEFINER functions, which set both values right after
-- ator()); policies and triggers use it instead of re-deriving the Auth session for every nested statement.
CREATE FUNCTION sentinela_classificacao.verificado() RETURNS uuid
LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT nullif(current_setting('sentinela.classificacao_ator', true), '')::uuid
  WHERE current_user = 'sentinela_classificacao_owner'
    AND current_setting('sentinela.classificacao_transacao', true) = pg_current_xact_id()::text
$$;
REVOKE ALL ON FUNCTION sentinela_classificacao.verificado() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sentinela_classificacao.verificado() TO sentinela_classificacao_owner;

-- Versioned homologation registry (append-only) and the explicit active version.
CREATE TABLE sentinela_classificacao.versoes (
  versao text PRIMARY KEY CHECK (versao ~ '^pcdf-classificacao-v2\.[0-9]{1,3}$'),
  catalogo text NOT NULL UNIQUE CHECK (catalogo = replace(versao, 'pcdf-classificacao-', 'sentinela-categorias-')),
  responsavel_id uuid NOT NULL REFERENCES sentinela.usuarios(id),
  evidencia text NOT NULL CHECK (length(btrim(evidencia)) >= 10),
  vigencia_inicio date NOT NULL,
  vigencia_fim date CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio),
  origem_sha256 text NOT NULL CHECK (origem_sha256 ~ '^[0-9a-f]{64}$'),
  homologada_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE sentinela_classificacao.regras (
  versao text NOT NULL REFERENCES sentinela_classificacao.versoes(versao),
  regra_id text NOT NULL CHECK (regra_id ~ '^PCDF-N-[0-9]{2}$'),
  crime_tentado boolean NOT NULL,
  mapeamento_id uuid NOT NULL UNIQUE REFERENCES sentinela.mapeamentos_natureza(id),
  nivel text NOT NULL CHECK (nivel IN ('direta','documentada','revisada','complementar','ambigua')),
  justificativa text NOT NULL CHECK (length(btrim(justificativa)) > 0),
  PRIMARY KEY (versao, regra_id, crime_tentado)
);
CREATE TABLE sentinela_classificacao.liberacao (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  versao_ativa text REFERENCES sentinela_classificacao.versoes(versao),
  ativada_por uuid REFERENCES sentinela.usuarios(id),
  ativada_em timestamptz
);
INSERT INTO sentinela_classificacao.liberacao(singleton) VALUES (true);
CREATE FUNCTION sentinela_classificacao.imutavel() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Registro de homologacao e imutavel: crie nova versao.' USING ERRCODE = '55000'; END $$;
CREATE TRIGGER imutavel BEFORE UPDATE OR DELETE OR TRUNCATE ON sentinela_classificacao.versoes
  FOR EACH STATEMENT EXECUTE FUNCTION sentinela_classificacao.imutavel();
CREATE TRIGGER imutavel BEFORE UPDATE OR DELETE OR TRUNCATE ON sentinela_classificacao.regras
  FOR EACH STATEMENT EXECUTE FUNCTION sentinela_classificacao.imutavel();
CREATE TRIGGER imutavel BEFORE DELETE OR TRUNCATE ON sentinela_classificacao.liberacao
  FOR EACH STATEMENT EXECUTE FUNCTION sentinela_classificacao.imutavel();
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['versoes','regras','liberacao'] LOOP
    EXECUTE format('ALTER TABLE sentinela_classificacao.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE sentinela_classificacao.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON sentinela_classificacao.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('GRANT SELECT ON sentinela_classificacao.%I TO sentinela_classificacao_owner', t);
    EXECUTE format('CREATE POLICY classificacao_leitura ON sentinela_classificacao.%I FOR SELECT TO sentinela_classificacao_owner USING (true)', t);
  END LOOP;
END $rls$;
GRANT INSERT ON sentinela_classificacao.versoes, sentinela_classificacao.regras TO sentinela_classificacao_owner;
GRANT UPDATE (versao_ativa, ativada_por, ativada_em) ON sentinela_classificacao.liberacao TO sentinela_classificacao_owner;
CREATE POLICY classificacao_versao ON sentinela_classificacao.versoes FOR INSERT TO sentinela_classificacao_owner
  WITH CHECK (responsavel_id = (SELECT sentinela_classificacao.verificado()));
CREATE POLICY classificacao_regra ON sentinela_classificacao.regras FOR INSERT TO sentinela_classificacao_owner
  WITH CHECK ((SELECT sentinela_classificacao.verificado()) IS NOT NULL);
CREATE POLICY classificacao_ativacao ON sentinela_classificacao.liberacao FOR UPDATE TO sentinela_classificacao_owner
  USING ((SELECT sentinela_classificacao.verificado()) IS NOT NULL)
  WITH CHECK (ativada_por = (SELECT sentinela_classificacao.verificado()));

-- Reviewed proposal v2 (docs/catalogos/sentinela-classificacao-v2.json): every row PENDING, no category on rules.
DO $proposta$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('SEN-CAT-01','Homicídio'),('SEN-CAT-02','Tentativa de homicídio'),('SEN-CAT-03','Roubo a transeunte'),
    ('SEN-CAT-04','Roubo em comércio'),('SEN-CAT-05','Roubo em residência'),('SEN-CAT-06','Roubo de veículo'),
    ('SEN-CAT-07','Furto em veículo'),('SEN-CAT-08','Furto de veículo'),('SEN-CAT-09','Furto em comércio'),
    ('SEN-CAT-10','Furto em residência'),('SEN-CAT-11','Estupro'),('SEN-CAT-12','Violência doméstica'),
    ('SEN-CAT-13','Roubo em transporte coletivo'),('SEN-CAT-14','Feminicídio'),('SEN-CAT-15','Tentativa de feminicídio'),
    ('SEN-CAT-16','Estupro de vulnerável'),('SEN-CAT-17','Latrocínio'),('SEN-CAT-18','Tráfico de drogas'),
    ('SEN-CAT-19','Uso e porte de drogas'),('SEN-CAT-20','Posse/porte de arma de fogo'),
    ('SEN-CAT-21','Associação para o tráfico de drogas'),('SEN-CAT-22','Artefato explosivo ou incendiário'),
    ('SEN-CAT-23','Roubo em propriedade rural')) v(codigo, nome)
  LOOP
    INSERT INTO sentinela.categorias_criminais(codigo_interno, nome, versao_catalogo, status)
    VALUES (item.codigo, item.nome, 'sentinela-categorias-v2', 'pendente');
  END LOOP;
  INSERT INTO sentinela.mapeamentos_natureza(natureza_id, versao, crime_tentado, categoria_id, status)
  SELECT n.id, 'pcdf-classificacao-v2', t.tentado, NULL, 'pendente'
  FROM sentinela.naturezas_criminais n
  CROSS JOIN LATERAL (SELECT false AS tentado UNION ALL SELECT true WHERE n.descricao_original IN ('HOMICIDIO','FEMINICIDIO')) t
  WHERE n.fonte = 'PCDF' AND n.categoria_pcdf_original IS NULL AND sentinela.descricao_pcdf(n.descricao_original);
  IF (SELECT count(*) FROM sentinela.categorias_criminais WHERE versao_catalogo = 'sentinela-categorias-v2') <> 23
     OR (SELECT count(*) FROM sentinela.mapeamentos_natureza WHERE versao = 'pcdf-classificacao-v2') <> 43 THEN
    RAISE EXCEPTION 'Proposta v2 divergente.';
  END IF;
END $proposta$;

-- Owner privileges: narrow, gated by the verified identity; RLS stays forced on every sentinela table.
GRANT SELECT ON sentinela.ocorrencia_naturezas, sentinela.linhas_origem, sentinela.lotes_importacao, sentinela.extracoes_origem,
  sentinela.mapeamentos_natureza, sentinela.categorias_criminais, sentinela.naturezas_criminais, sentinela.ocorrencias,
  sentinela.historico_correcoes, sentinela.pendencias_revisao, sentinela.eventos_auditoria TO sentinela_classificacao_owner;
GRANT SELECT (id, ativo, perfil, nome_exibicao) ON sentinela.usuarios TO sentinela_classificacao_owner;
-- Referenced by validar_vinculos_evento() in branches that never apply to this backend: privilege only, no policy.
GRANT SELECT ON sentinela.execucoes_importacao, sentinela.linhas_staging TO sentinela_classificacao_owner;
GRANT INSERT (codigo_interno, nome, versao_catalogo, status, evidencia_homologacao) ON sentinela.categorias_criminais TO sentinela_classificacao_owner;
GRANT INSERT (natureza_id, versao, crime_tentado, categoria_id, status, evidencia_homologacao) ON sentinela.mapeamentos_natureza TO sentinela_classificacao_owner;
GRANT UPDATE (classificacao_status, mapeamento_id) ON sentinela.ocorrencia_naturezas TO sentinela_classificacao_owner;
GRANT INSERT (ocorrencia_id, linha_origem_id, associacao_id, campo, regra, versao_regra, valor_original, motivo, tipo, prioridade, efeito)
  ON sentinela.pendencias_revisao TO sentinela_classificacao_owner;
GRANT UPDATE (status, responsavel_id, justificativa, encerrada_em) ON sentinela.pendencias_revisao TO sentinela_classificacao_owner;
GRANT INSERT (associacao_id, campo, valores_anteriores, valores_novos, responsavel_id, justificativa,
  versao_registro_anterior, versao_validacao, resultado_reavaliacao) ON sentinela.historico_correcoes TO sentinela_classificacao_owner;
GRANT INSERT (ator_tipo, usuario_id, acao, pendencia_id, antes, depois, justificativa) ON sentinela.eventos_auditoria TO sentinela_classificacao_owner;
GRANT EXECUTE ON FUNCTION sentinela.verificar_alvo_pendencia(uuid,uuid,uuid,uuid), sentinela.descricao_pcdf(text),
  sentinela.exigir_evento_pendencia(), sentinela.exigir_historico_correcao(), sentinela.exigir_revisor_administrador(),
  sentinela.carimbar_auditoria(), sentinela.validar_destino_correcao(), sentinela.validar_vinculos_evento(),
  sentinela.validar_associacao_mapeada(), sentinela.bloquear_autoria_manual_sem_auth(), sentinela.bloquear_correcao_sem_backend()
  TO sentinela_classificacao_owner;

DO $policies$
DECLARE item text[];
BEGIN
  FOREACH item SLICE 1 IN ARRAY ARRAY[
    ['classificacao_assoc_leitura','ocorrencia_naturezas','SELECT',$$origem = 'importacao'$$,NULL],
    ['classificacao_assoc_escrita','ocorrencia_naturezas','UPDATE',$$origem = 'importacao'$$,
       $$origem = 'importacao' AND ((classificacao_status = 'mapeada' AND mapeamento_id IS NOT NULL)
         OR (classificacao_status IN ('pendente','conflitante','sem_correspondencia') AND mapeamento_id IS NULL))$$],
    ['classificacao_origem_leitura','linhas_origem','SELECT','true',NULL],
    ['classificacao_extracao_leitura','extracoes_origem','SELECT',$$fonte = 'PCDF'$$,NULL],
    ['classificacao_lote_leitura','lotes_importacao','SELECT','true',NULL],
    ['classificacao_regra_leitura','mapeamentos_natureza','SELECT',$$versao LIKE 'pcdf-classificacao-v2%'$$,NULL],
    ['classificacao_regra_escrita','mapeamentos_natureza','INSERT','true',
       $$versao ~ '^pcdf-classificacao-v2\.[0-9]{1,3}$' AND status IN ('homologado','conflitante','sem_correspondencia')$$],
    ['classificacao_categoria_leitura','categorias_criminais','SELECT',$$versao_catalogo LIKE 'sentinela-categorias-v2%'$$,NULL],
    ['classificacao_categoria_escrita','categorias_criminais','INSERT','true',
       $$versao_catalogo ~ '^sentinela-categorias-v2\.[0-9]{1,3}$' AND status = 'homologada'$$],
    ['classificacao_natureza_leitura','naturezas_criminais','SELECT',$$fonte = 'PCDF'$$,NULL],
    ['classificacao_ocorrencia_leitura','ocorrencias','SELECT',$$origem = 'importacao' AND fonte = 'PCDF'$$,NULL],
    ['classificacao_historico_leitura','historico_correcoes','SELECT',$$campo IN ('classificacao_status','mapeamento_id') AND associacao_id IS NOT NULL$$,NULL],
    ['classificacao_historico_escrita','historico_correcoes','INSERT','true',
       $$associacao_id IS NOT NULL AND campo IN ('classificacao_status','mapeamento_id') AND versao_validacao ~ '^pcdf-classificacao-v2\.[0-9]{1,3}$'
         AND responsavel_id = (SELECT sentinela_classificacao.verificado())$$],
    ['classificacao_pendencia_leitura','pendencias_revisao','SELECT',$$tipo = 'classificacao'$$,NULL],
    ['classificacao_pendencia_escrita','pendencias_revisao','UPDATE',$$tipo = 'classificacao'$$,$$tipo = 'classificacao'$$],
    ['classificacao_pendencia_criacao','pendencias_revisao','INSERT','true',
       $$tipo = 'classificacao' AND status = 'aberta' AND responsavel_id IS NULL AND versao_regra ~ '^pcdf-classificacao-v2\.[0-9]{1,3}$'$$],
    ['classificacao_evento_leitura','eventos_auditoria','SELECT',$$acao LIKE 'catalogo.classificacao.%'$$,NULL],
    ['classificacao_evento_escrita','eventos_auditoria','INSERT','true',
       $$ator_tipo = 'usuario' AND acao LIKE 'catalogo.classificacao.%' AND usuario_id = (SELECT sentinela_classificacao.verificado())$$],
    ['classificacao_usuario_leitura','usuarios','SELECT',$$ativo AND perfil = 'Administrador'$$,NULL]]
  LOOP
    EXECUTE format('CREATE POLICY %I ON sentinela.%I FOR %s TO sentinela_classificacao_owner %s%s',
      item[1], item[2], item[3],
      CASE WHEN item[3] = 'INSERT' THEN '' ELSE format('USING ((SELECT sentinela_classificacao.verificado()) IS NOT NULL AND (%s))', item[4]) END,
      CASE WHEN item[5] IS NULL THEN '' ELSE format(' WITH CHECK ((SELECT sentinela_classificacao.verificado()) IS NOT NULL AND (%s))', item[5]) END);
  END LOOP;
END $policies$;

-- Write blocks: branches of 0011 preserved verbatim; the classification branch is new.
CREATE OR REPLACE FUNCTION sentinela.bloquear_correcao_sem_backend() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF current_user='sentinela_revisao_owner' THEN
    IF TG_TABLE_SCHEMA='sentinela' AND sentinela_revisao.ator(true) IS NOT NULL
      AND (TG_OP='UPDATE' AND TG_TABLE_NAME IN ('pendencias_revisao','linhas_staging')
        OR TG_OP='INSERT' AND TG_TABLE_NAME='historico_correcoes') THEN RETURN NULL; END IF;
  END IF;
  IF current_user='sentinela_classificacao_owner' THEN
    IF TG_TABLE_SCHEMA='sentinela' AND sentinela_classificacao.verificado() IS NOT NULL
      AND current_setting('sentinela.classificacao_transacao', true) = pg_current_xact_id()::text
      AND (TG_OP='UPDATE' AND TG_TABLE_NAME IN ('ocorrencia_naturezas','pendencias_revisao')
        OR TG_OP='INSERT' AND TG_TABLE_NAME IN ('historico_correcoes','pendencias_revisao')) THEN RETURN NULL; END IF;
  END IF;
  IF current_user='sentinela_exclusao_owner' AND session_user='sentinela_local_admin'
    AND sentinela_ambiente.vinculado() AND sentinela_ambiente.vinculado()
    AND TG_TABLE_SCHEMA='sentinela' AND TG_OP='DELETE' AND TG_TABLE_NAME IN ('linhas_staging','pendencias_revisao')
  THEN RETURN NULL; END IF;
  IF current_user='sentinela_manual_writer' AND session_user IN ('sentinela_local_admin','sentinela_local_operator')
    AND sentinela_ambiente.vinculado() AND sentinela_ambiente.vinculado()
    AND TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='ocorrencias' AND TG_OP='UPDATE'
  THEN RETURN NULL; END IF;
  RAISE EXCEPTION 'Correcao bloqueada ate Auth e backend transacional auditado serem implementados.' USING ERRCODE='42501';
END $$;

CREATE OR REPLACE FUNCTION sentinela.bloquear_autoria_manual_sem_auth() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_TABLE_NAME='pendencias_revisao' THEN
    IF current_user='sentinela_classificacao_owner' THEN
      -- Nested so other owners never evaluate (nor need EXECUTE on) sentinela_classificacao.verificado().
      IF TG_OP='UPDATE' AND NEW.tipo='classificacao'
        AND current_setting('sentinela.classificacao_transacao', true) = pg_current_xact_id()::text
        AND sentinela_classificacao.verificado() IS NOT NULL THEN
        IF OLD.tipo='classificacao' THEN RETURN NEW; END IF;
      END IF;
    END IF;
    IF NEW.status<>'aberta' OR NEW.responsavel_id IS NOT NULL THEN
      RAISE EXCEPTION 'Atribuicao/decisao manual depende de Auth real.' USING ERRCODE='42501';
    END IF;
  ELSIF NEW.ator_tipo='usuario' THEN
    IF current_user='sentinela_revisao_owner' THEN
      IF TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='eventos_auditoria'
        AND NEW.acao='pendencia.revisada' AND NEW.usuario_id=sentinela_revisao.ator(true)
      THEN RETURN NEW; END IF;
    ELSIF current_user='sentinela_classificacao_owner' THEN
      IF TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='eventos_auditoria'
        AND NEW.acao LIKE 'catalogo.classificacao.%' AND NEW.usuario_id=sentinela_classificacao.verificado()
      THEN RETURN NEW; END IF;
    ELSIF current_user='sentinela_manual_writer' THEN
      IF TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='eventos_auditoria'
        AND NEW.acao IN ('ocorrencia.manual.criada','ocorrencia.manual.editada','ocorrencia.manual.inativada','ocorrencia.manual.consolidada')
        AND NEW.depois->>'operacao'='cadastro-manual'
        AND sentinela_ocorrencias_manual.autor(NEW.usuario_id,NEW.depois->>'conta') IS NOT NULL
      THEN RETURN NEW; END IF;
    ELSIF current_user='sentinela_gestao_owner' AND TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='eventos_auditoria'
      AND NEW.acao='corrigir_associacao' AND NEW.depois->>'operacao'='gestao-importacao'
      AND sentinela_gestao_autorizacao.capacidade(NEW.usuario_id,NEW.depois->>'conta') IS TRUE
    THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Autoria humana de auditoria depende de Auth real.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

-- Homologation: the rule set comes from the server (canonical reviewed file), each rule must exist in the PENDING
-- proposal v2, each category in the proposal catalog. Responsible = verified Administrador.
CREATE FUNCTION sentinela_classificacao.homologar(p_versao text, p_regras jsonb, p_evidencia text,
  p_vigencia_inicio date, p_vigencia_fim date, p_origem_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE v_ator uuid := sentinela_classificacao.ator(); v_catalogo text; item jsonb; v_natureza uuid; v_categoria uuid; v_regra uuid;
  homologadas int := 0; outras int := 0;
BEGIN
  IF v_ator IS NULL THEN RAISE EXCEPTION 'Homologacao exige Administrador com sessao verificada.' USING ERRCODE = '42501'; END IF;
  PERFORM set_config('sentinela.classificacao_transacao', pg_current_xact_id()::text, true),
          set_config('sentinela.classificacao_ator', v_ator::text, true);
  IF jsonb_typeof(p_regras) <> 'array' OR jsonb_array_length(p_regras) = 0 THEN RAISE EXCEPTION 'Regras ausentes.' USING ERRCODE = '22023'; END IF;
  v_catalogo := replace(p_versao, 'pcdf-classificacao-', 'sentinela-categorias-');
  INSERT INTO sentinela_classificacao.versoes(versao, catalogo, responsavel_id, evidencia, vigencia_inicio, vigencia_fim, origem_sha256)
  VALUES (p_versao, v_catalogo, v_ator, p_evidencia, p_vigencia_inicio, p_vigencia_fim, p_origem_sha256);
  FOR item IN SELECT * FROM jsonb_array_elements(p_regras) LOOP
    SELECT n.id INTO v_natureza FROM sentinela.naturezas_criminais n
     WHERE n.fonte = 'PCDF' AND n.categoria_pcdf_original IS NULL AND n.descricao_original = item->>'natureza'
       AND EXISTS (SELECT FROM sentinela.mapeamentos_natureza p WHERE p.natureza_id = n.id AND p.versao = 'pcdf-classificacao-v2'
                   AND p.crime_tentado = (item->>'crimeTentado')::boolean AND p.status = 'pendente');
    IF v_natureza IS NULL THEN RAISE EXCEPTION 'Regra % fora da proposta v2.', item->>'regraId' USING ERRCODE = '22023'; END IF;
    v_categoria := NULL;
    IF item->>'status' = 'homologado' THEN
      INSERT INTO sentinela.categorias_criminais(codigo_interno, nome, versao_catalogo, status, evidencia_homologacao)
      SELECT c.codigo_interno, c.nome, v_catalogo, 'homologada', p_evidencia FROM sentinela.categorias_criminais c
       WHERE c.versao_catalogo = 'sentinela-categorias-v2' AND c.codigo_interno = item->>'categoria'
      ON CONFLICT DO NOTHING;
      SELECT c.id INTO v_categoria FROM sentinela.categorias_criminais c
       WHERE c.versao_catalogo = v_catalogo AND c.codigo_interno = item->>'categoria';
      IF v_categoria IS NULL THEN RAISE EXCEPTION 'Categoria % fora da proposta v2.', item->>'categoria' USING ERRCODE = '22023'; END IF;
      homologadas := homologadas + 1;
    ELSIF item->>'status' IN ('conflitante', 'sem_correspondencia') THEN
      outras := outras + 1;
    ELSE
      RAISE EXCEPTION 'Situacao de regra invalida.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO sentinela.mapeamentos_natureza(natureza_id, versao, crime_tentado, categoria_id, status, evidencia_homologacao)
    VALUES (v_natureza, p_versao, (item->>'crimeTentado')::boolean, v_categoria, item->>'status',
            CASE WHEN v_categoria IS NULL THEN NULL ELSE p_evidencia END)
    RETURNING id INTO v_regra;
    INSERT INTO sentinela_classificacao.regras(versao, regra_id, crime_tentado, mapeamento_id, nivel, justificativa)
    VALUES (p_versao, item->>'regraId', (item->>'crimeTentado')::boolean, v_regra, item->>'nivel', item->>'justificativa');
  END LOOP;
  INSERT INTO sentinela.eventos_auditoria(ator_tipo, usuario_id, acao, depois, justificativa)
  VALUES ('usuario', v_ator, 'catalogo.classificacao.homologada', jsonb_build_object('versao', p_versao, 'catalogo', v_catalogo,
    'homologadas', homologadas, 'naoClassificaveis', outras, 'vigenciaInicio', p_vigencia_inicio, 'vigenciaFim', p_vigencia_fim,
    'origemSha256', p_origem_sha256), p_evidencia);
  RETURN jsonb_build_object('versao', p_versao, 'homologadas', homologadas, 'naoClassificaveis', outras);
END $fn$;

CREATE FUNCTION sentinela_classificacao.ativar(p_versao text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE v_ator uuid := sentinela_classificacao.ator();
BEGIN
  IF v_ator IS NULL THEN RAISE EXCEPTION 'Ativacao exige Administrador com sessao verificada.' USING ERRCODE = '42501'; END IF;
  PERFORM set_config('sentinela.classificacao_transacao', pg_current_xact_id()::text, true),
          set_config('sentinela.classificacao_ator', v_ator::text, true);
  IF NOT EXISTS (SELECT FROM sentinela_classificacao.versoes v WHERE v.versao = p_versao
                 AND v.vigencia_inicio <= current_date AND (v.vigencia_fim IS NULL OR v.vigencia_fim >= current_date)) THEN
    RAISE EXCEPTION 'Versao inexistente ou fora da vigencia.' USING ERRCODE = '22023';
  END IF;
  UPDATE sentinela_classificacao.liberacao SET versao_ativa = p_versao, ativada_por = v_ator, ativada_em = clock_timestamp();
  INSERT INTO sentinela.eventos_auditoria(ator_tipo, usuario_id, acao, depois, justificativa)
  VALUES ('usuario', v_ator, 'catalogo.classificacao.ativada', jsonb_build_object('versao', p_versao), 'Ativacao da versao homologada.');
  RETURN jsonb_build_object('versaoAtiva', p_versao);
END $fn$;

-- Applies the ACTIVE version to one lot (also called automatically by the confirmed PCDF import, same transaction).
-- Homologated rule: 'mapeada' and the association's open classification review items are resolved.
-- Conflicting / no-correspondence rule or unknown pair: no artificial class; a review item is created only if none is open.
CREATE FUNCTION sentinela_classificacao.aplicar_lote(p_lote uuid, p_justificativa text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE v_ator uuid := sentinela_classificacao.ator(); v_versao text; alvo jsonb; pend uuid[]; antes jsonb[]; novos jsonb[]; ids uuid[];
  mapeadas int; conflitantes int; sem_corr int; desconhecidas int; resolvidas int := 0; criadas int := 0; alteradas int;
BEGIN
  IF v_ator IS NULL THEN RAISE EXCEPTION 'Aplicacao exige Administrador com sessao verificada.' USING ERRCODE = '42501'; END IF;
  PERFORM set_config('sentinela.classificacao_transacao', pg_current_xact_id()::text, true),
          set_config('sentinela.classificacao_ator', v_ator::text, true);
  IF length(btrim(coalesce(p_justificativa, ''))) < 10 THEN RAISE EXCEPTION 'Justificativa obrigatoria.' USING ERRCODE = '22023'; END IF;
  SELECT l.versao_ativa INTO v_versao FROM sentinela_classificacao.liberacao l;
  IF v_versao IS NULL THEN RETURN jsonb_build_object('aplicada', false, 'motivo', 'sem_versao_ativa'); END IF;
  IF NOT EXISTS (SELECT FROM sentinela.lotes_importacao WHERE id = p_lote) THEN RAISE EXCEPTION 'Lote inexistente.' USING ERRCODE = '23503'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-classificacao:' || p_lote::text, 0));
  -- Pending imported links of the lot, locked, each with the active version's rule for its (nature, attempt) pair.
  PERFORM 1 FROM sentinela.ocorrencia_naturezas a
    JOIN sentinela.linhas_origem o ON o.id = a.linha_origem_id
    JOIN sentinela.lotes_importacao l ON l.extracao_id = o.extracao_id AND l.id = p_lote
   WHERE a.origem = 'importacao' AND a.classificacao_status = 'pendente' AND a.mapeamento_id IS NULL
   ORDER BY a.id FOR UPDATE OF a;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'ocorrencia', a.ocorrencia_id, 'linha', a.linha_origem_id, 'versao', a.versao,
      'descricao', n.descricao_original, 'regra', m.id,
      'situacao', CASE WHEN m.status = 'homologado' AND c.status = 'homologada' THEN 'mapeada'
                       WHEN m.status IN ('conflitante', 'sem_correspondencia') THEN m.status END) ORDER BY a.id), '[]'::jsonb)
    INTO alvo
    FROM sentinela.ocorrencia_naturezas a
    JOIN sentinela.linhas_origem o ON o.id = a.linha_origem_id
    JOIN sentinela.lotes_importacao l ON l.extracao_id = o.extracao_id AND l.id = p_lote
    JOIN sentinela.naturezas_criminais n ON n.id = a.natureza_id
    LEFT JOIN sentinela.mapeamentos_natureza m ON m.natureza_id = a.natureza_id AND m.versao = v_versao
      AND m.crime_tentado IS NOT DISTINCT FROM a.crime_tentado
    LEFT JOIN sentinela.categorias_criminais c ON c.id = m.categoria_id
   WHERE a.origem = 'importacao' AND a.classificacao_status = 'pendente' AND a.mapeamento_id IS NULL;
  SELECT count(*) FILTER (WHERE x.situacao = 'mapeada'), count(*) FILTER (WHERE x.situacao = 'conflitante'),
         count(*) FILTER (WHERE x.situacao = 'sem_correspondencia'), count(*) FILTER (WHERE x.situacao IS NULL),
         coalesce(array_agg(x.id ORDER BY x.id) FILTER (WHERE x.situacao IS NOT NULL), '{}')
    INTO mapeadas, conflitantes, sem_corr, desconhecidas, ids
    FROM jsonb_to_recordset(alvo) AS x(id uuid, situacao text);

  -- History before the change (correcao_exige_historico), then the links. Unknown pairs keep 'pendente'.
  INSERT INTO sentinela.historico_correcoes(associacao_id, campo, valores_anteriores, valores_novos, responsavel_id,
    justificativa, versao_registro_anterior, versao_validacao, resultado_reavaliacao)
  SELECT x.id, f.campo, f.antes, f.depois, v_ator, p_justificativa, x.versao, v_versao,
         jsonb_build_object('operacao', 'aplicacao', 'regra', x.regra)
    FROM jsonb_to_recordset(alvo) AS x(id uuid, versao bigint, regra uuid, situacao text)
   CROSS JOIN LATERAL (VALUES (1, 'classificacao_status', to_jsonb('pendente'::text), to_jsonb(x.situacao)),
                              (2, 'mapeamento_id', 'null'::jsonb, to_jsonb(x.regra))) AS f(ordem, campo, antes, depois)
   WHERE x.situacao IS NOT NULL AND (f.ordem = 1 OR x.situacao = 'mapeada')
   ORDER BY x.id, f.ordem;
  UPDATE sentinela.ocorrencia_naturezas a
     SET classificacao_status = x.situacao, mapeamento_id = CASE WHEN x.situacao = 'mapeada' THEN x.regra END
    FROM jsonb_to_recordset(alvo) AS x(id uuid, versao bigint, regra uuid, situacao text)
   WHERE a.id = x.id AND a.versao = x.versao AND x.situacao IS NOT NULL;
  GET DIAGNOSTICS alteradas = ROW_COUNT;
  IF alteradas <> cardinality(ids) THEN RAISE EXCEPTION 'Associacoes alteradas durante a aplicacao.' USING ERRCODE = '40001'; END IF;

  -- Open classification review items of the classified links are resolved, each with its own audit event.
  -- associacao_id implies the same source line (composite foreign key), so the line index finds both forms.
  SELECT coalesce(array_agg(p.id), '{}') INTO pend
    FROM sentinela.pendencias_revisao p
   WHERE p.linha_origem_id = ANY (SELECT x.linha FROM jsonb_to_recordset(alvo) AS x(linha uuid, situacao text) WHERE x.situacao = 'mapeada')
     AND (p.associacao_id IS NULL OR p.associacao_id = ANY (SELECT x.id FROM jsonb_to_recordset(alvo) AS x(id uuid, situacao text) WHERE x.situacao = 'mapeada'))
     AND p.tipo = 'classificacao' AND p.status IN ('aberta', 'em_analise');
  PERFORM 1 FROM sentinela.pendencias_revisao p WHERE p.id = ANY (pend) ORDER BY p.id FOR UPDATE;
  SELECT coalesce(array_agg(to_jsonb(p.*) ORDER BY p.id), '{}') INTO antes
    FROM sentinela.pendencias_revisao p WHERE p.id = ANY (pend) AND p.status IN ('aberta', 'em_analise');
  WITH encerradas AS (
    UPDATE sentinela.pendencias_revisao p SET status = 'resolvida', responsavel_id = v_ator,
        justificativa = p_justificativa, encerrada_em = clock_timestamp()
     WHERE p.id = ANY (pend) AND p.status IN ('aberta', 'em_analise') RETURNING to_jsonb(p.*) AS novo)
  SELECT coalesce(array_agg(novo), '{}') INTO novos FROM encerradas;
  INSERT INTO sentinela.eventos_auditoria(ator_tipo, usuario_id, acao, pendencia_id, antes, depois, justificativa)
  SELECT 'usuario', v_ator, 'catalogo.classificacao.pendencia_resolvida', (b.antes->>'id')::uuid, b.antes, n.novo, p_justificativa
    FROM unnest(antes) AS b(antes) JOIN unnest(novos) AS n(novo) ON n.novo->>'id' = b.antes->>'id'
   ORDER BY b.antes->>'id';
  resolvidas := cardinality(novos);

  -- Links without a determinable category: one open review item each, only when none is open.
  WITH novas AS (
    INSERT INTO sentinela.pendencias_revisao(ocorrencia_id, linha_origem_id, associacao_id, campo, regra, versao_regra,
      valor_original, motivo, tipo, prioridade, efeito)
    SELECT x.ocorrencia, x.linha, x.id, 'natureza',
           CASE WHEN x.situacao IS NULL THEN 'natureza_sem_regra' ELSE 'natureza_' || x.situacao END, v_versao,
           to_jsonb(x.descricao),
           CASE WHEN x.situacao IS NULL THEN 'Natureza sem regra homologada na versao ativa.'
                ELSE 'Natureza sem categoria determinavel pela regra homologada.' END,
           'classificacao', 'media', 'nao_bloqueante'
      FROM jsonb_to_recordset(alvo) AS x(id uuid, ocorrencia uuid, linha uuid, descricao text, situacao text)
     WHERE x.situacao IS DISTINCT FROM 'mapeada'
       AND NOT EXISTS (SELECT FROM sentinela.pendencias_revisao p WHERE p.tipo = 'classificacao' AND p.status IN ('aberta', 'em_analise')
                       AND p.linha_origem_id = x.linha)
     ORDER BY x.id
    ON CONFLICT DO NOTHING
    RETURNING 1)
  SELECT count(*) INTO criadas FROM novas;

  SET CONSTRAINTS ALL IMMEDIATE;
  IF cardinality(ids) > 0 OR criadas > 0 THEN
    INSERT INTO sentinela.eventos_auditoria(ator_tipo, usuario_id, acao, depois, justificativa)
    VALUES ('usuario', v_ator, 'catalogo.classificacao.aplicada', jsonb_build_object('lote', p_lote, 'versao', v_versao,
      'mapeadas', mapeadas, 'conflitantes', conflitantes, 'semCorrespondencia', sem_corr, 'desconhecidas', desconhecidas,
      'pendenciasResolvidas', resolvidas, 'pendenciasCriadas', criadas,
      'sha256Associacoes', encode(sha256(convert_to(array_to_string(ids, ','), 'UTF8')), 'hex')), p_justificativa);
  END IF;
  RETURN jsonb_build_object('aplicada', true, 'versao', v_versao, 'mapeadas', mapeadas, 'conflitantes', conflitantes,
    'semCorrespondencia', sem_corr, 'desconhecidas', desconhecidas, 'pendenciasResolvidas', resolvidas, 'pendenciasCriadas', criadas);
END $fn$;

-- Compensating reclassification of what p_versao classified in the lot; review items resolved by it are reopened.
CREATE FUNCTION sentinela_classificacao.reverter_lote(p_lote uuid, p_versao text, p_justificativa text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE v_ator uuid := sentinela_classificacao.ator(); alvo jsonb; pend uuid[]; antes jsonb[]; novos jsonb[]; ids uuid[];
  reabertas int; alteradas int;
BEGIN
  IF v_ator IS NULL THEN RAISE EXCEPTION 'Reversao exige Administrador com sessao verificada.' USING ERRCODE = '42501'; END IF;
  PERFORM set_config('sentinela.classificacao_transacao', pg_current_xact_id()::text, true),
          set_config('sentinela.classificacao_ator', v_ator::text, true);
  IF length(btrim(coalesce(p_justificativa, ''))) < 10 OR NOT EXISTS (SELECT FROM sentinela_classificacao.versoes WHERE versao = p_versao) THEN
    RAISE EXCEPTION 'Versao ou justificativa invalida.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-classificacao:' || p_lote::text, 0));
  PERFORM 1 FROM sentinela.ocorrencia_naturezas a
    JOIN sentinela.linhas_origem o ON o.id = a.linha_origem_id
    JOIN sentinela.lotes_importacao l ON l.extracao_id = o.extracao_id AND l.id = p_lote
   WHERE a.origem = 'importacao' AND a.classificacao_status IN ('mapeada', 'conflitante', 'sem_correspondencia')
   ORDER BY a.id FOR UPDATE OF a;
  -- Only links whose latest classification decision came from p_versao.
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'linha', a.linha_origem_id, 'versao', a.versao,
      'situacao', a.classificacao_status, 'regra', a.mapeamento_id) ORDER BY a.id), '[]'::jsonb)
    INTO alvo
    FROM sentinela.ocorrencia_naturezas a
    JOIN sentinela.linhas_origem o ON o.id = a.linha_origem_id
    JOIN sentinela.lotes_importacao l ON l.extracao_id = o.extracao_id AND l.id = p_lote
   WHERE a.origem = 'importacao' AND a.classificacao_status IN ('mapeada', 'conflitante', 'sem_correspondencia')
     AND (SELECT h.versao_validacao FROM sentinela.historico_correcoes h WHERE h.associacao_id = a.id AND h.campo = 'classificacao_status'
          ORDER BY h.corrigido_em DESC, h.id DESC LIMIT 1) = p_versao;
  SELECT coalesce(array_agg(x.id ORDER BY x.id), '{}') INTO ids FROM jsonb_to_recordset(alvo) AS x(id uuid);

  INSERT INTO sentinela.historico_correcoes(associacao_id, campo, valores_anteriores, valores_novos, responsavel_id,
    justificativa, versao_registro_anterior, versao_validacao, resultado_reavaliacao)
  SELECT x.id, f.campo, f.antes, f.depois, v_ator, p_justificativa, x.versao, p_versao, jsonb_build_object('operacao', 'reversao')
    FROM jsonb_to_recordset(alvo) AS x(id uuid, versao bigint, situacao text, regra uuid)
   CROSS JOIN LATERAL (VALUES (1, 'classificacao_status', to_jsonb(x.situacao), to_jsonb('pendente'::text)),
                              (2, 'mapeamento_id', to_jsonb(x.regra), 'null'::jsonb)) AS f(ordem, campo, antes, depois)
   WHERE f.ordem = 1 OR x.regra IS NOT NULL
   ORDER BY x.id, f.ordem;
  UPDATE sentinela.ocorrencia_naturezas a SET classificacao_status = 'pendente', mapeamento_id = NULL
    FROM jsonb_to_recordset(alvo) AS x(id uuid, versao bigint)
   WHERE a.id = x.id AND a.versao = x.versao;
  GET DIAGNOSTICS alteradas = ROW_COUNT;
  IF alteradas <> cardinality(ids) THEN RAISE EXCEPTION 'Associacoes alteradas durante a reversao.' USING ERRCODE = '40001'; END IF;

  -- Review items this classification resolved (it left the event) are reopened, each with its own audit event.
  SELECT coalesce(array_agg(p.id), '{}') INTO pend
    FROM sentinela.pendencias_revisao p
   WHERE p.linha_origem_id = ANY (SELECT x.linha FROM jsonb_to_recordset(alvo) AS x(linha uuid))
     AND (p.associacao_id IS NULL OR p.associacao_id = ANY (ids))
     AND p.tipo = 'classificacao' AND p.status = 'resolvida'
     AND EXISTS (SELECT FROM sentinela.eventos_auditoria e WHERE e.pendencia_id = p.id
                 AND e.acao = 'catalogo.classificacao.pendencia_resolvida');
  PERFORM 1 FROM sentinela.pendencias_revisao p WHERE p.id = ANY (pend) ORDER BY p.id FOR UPDATE;
  SELECT coalesce(array_agg(to_jsonb(p.*) ORDER BY p.id), '{}') INTO antes
    FROM sentinela.pendencias_revisao p WHERE p.id = ANY (pend) AND p.status = 'resolvida';
  WITH abertas AS (
    UPDATE sentinela.pendencias_revisao p SET status = 'aberta', responsavel_id = NULL, justificativa = NULL, encerrada_em = NULL
     WHERE p.id = ANY (pend) AND p.status = 'resolvida' RETURNING to_jsonb(p.*) AS novo)
  SELECT coalesce(array_agg(novo), '{}') INTO novos FROM abertas;
  INSERT INTO sentinela.eventos_auditoria(ator_tipo, usuario_id, acao, pendencia_id, antes, depois, justificativa)
  SELECT 'usuario', v_ator, 'catalogo.classificacao.pendencia_reaberta', (b.antes->>'id')::uuid, b.antes, n.novo, p_justificativa
    FROM unnest(antes) AS b(antes) JOIN unnest(novos) AS n(novo) ON n.novo->>'id' = b.antes->>'id'
   ORDER BY b.antes->>'id';
  reabertas := cardinality(novos);

  SET CONSTRAINTS ALL IMMEDIATE;
  IF cardinality(ids) > 0 THEN
    INSERT INTO sentinela.eventos_auditoria(ator_tipo, usuario_id, acao, depois, justificativa)
    VALUES ('usuario', v_ator, 'catalogo.classificacao.revertida', jsonb_build_object('lote', p_lote, 'versao', p_versao,
      'revertidas', cardinality(ids), 'pendenciasReabertas', reabertas,
      'sha256Associacoes', encode(sha256(convert_to(array_to_string(ids, ','), 'UTF8')), 'hex')), p_justificativa);
  END IF;
  RETURN jsonb_build_object('versao', p_versao, 'revertidas', cardinality(ids), 'pendenciasReabertas', reabertas);
END $fn$;

-- Read-only status for the Administrador and Operador screens.
CREATE FUNCTION sentinela_classificacao.situacao() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT jsonb_build_object(
    'versaoAtiva', (SELECT versao_ativa FROM sentinela_classificacao.liberacao),
    'proposta', jsonb_build_object('categorias', (SELECT count(*) FROM sentinela.categorias_criminais WHERE versao_catalogo = 'sentinela-categorias-v2'),
                                   'regras', (SELECT count(*) FROM sentinela.mapeamentos_natureza WHERE versao = 'pcdf-classificacao-v2')),
    'versoes', coalesce((SELECT jsonb_agg(jsonb_build_object('versao', v.versao, 'vigenciaInicio', v.vigencia_inicio,
        'vigenciaFim', v.vigencia_fim, 'homologadaEm', v.homologada_em, 'responsavel', u.nome_exibicao,
        'homologadas', (SELECT count(*) FROM sentinela.mapeamentos_natureza m WHERE m.versao = v.versao AND m.status = 'homologado'),
        'naoClassificaveis', (SELECT count(*) FROM sentinela.mapeamentos_natureza m WHERE m.versao = v.versao AND m.status <> 'homologado'))
        ORDER BY v.homologada_em) FROM sentinela_classificacao.versoes v JOIN sentinela.usuarios u ON u.id = v.responsavel_id), '[]'::jsonb),
    'associacoes', (SELECT jsonb_object_agg(s, n) FROM (SELECT classificacao_status s, count(*) n FROM sentinela.ocorrencia_naturezas GROUP BY 1) x),
    'pendenciasClassificacaoAbertas', (SELECT count(*) FROM sentinela.pendencias_revisao WHERE tipo = 'classificacao' AND status IN ('aberta', 'em_analise')))
  WHERE session_user IN ('sentinela_local_admin', 'sentinela_local_operator') AND sentinela_ambiente.ator_operacional() IS NOT NULL
$fn$;

REVOKE ALL ON FUNCTION sentinela_classificacao.homologar(text, jsonb, text, date, date, text), sentinela_classificacao.ativar(text),
  sentinela_classificacao.aplicar_lote(uuid, text), sentinela_classificacao.reverter_lote(uuid, text, text),
  sentinela_classificacao.situacao() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sentinela_classificacao.homologar(text, jsonb, text, date, date, text), sentinela_classificacao.ativar(text),
  sentinela_classificacao.aplicar_lote(uuid, text), sentinela_classificacao.reverter_lote(uuid, text, text) TO sentinela_local_admin;
GRANT EXECUTE ON FUNCTION sentinela_classificacao.situacao() TO sentinela_local_admin, sentinela_local_operator;
-- Ownership moves after the ACL is set (PostgreSQL rewrites the grantor to the new owner); the migrator keeps no
-- grant option on the owner's functions. situacao() stays with the migrator (read-only aggregates), like ator(),
-- so the Operador view is not policy-gated.
ALTER FUNCTION sentinela_classificacao.homologar(text, jsonb, text, date, date, text) OWNER TO sentinela_classificacao_owner;
ALTER FUNCTION sentinela_classificacao.ativar(text) OWNER TO sentinela_classificacao_owner;
ALTER FUNCTION sentinela_classificacao.aplicar_lote(uuid, text) OWNER TO sentinela_classificacao_owner;
ALTER FUNCTION sentinela_classificacao.reverter_lote(uuid, text, text) OWNER TO sentinela_classificacao_owner;
REVOKE CREATE ON SCHEMA sentinela_classificacao FROM sentinela_classificacao_owner;
-- ator_operacional() belongs to the migrator; vinculado() belongs to sentinela_ambiente_owner.
GRANT EXECUTE ON FUNCTION sentinela_ambiente.ator_operacional() TO sentinela_classificacao_owner;
SET LOCAL ROLE sentinela_ambiente_owner;
GRANT EXECUTE ON FUNCTION sentinela_ambiente.vinculado() TO sentinela_classificacao_owner;
RESET ROLE;

-- Occurrence detail shows the homologated category next to the original nature (reader policies already allow it).
SET LOCAL ROLE sentinela_ocorrencias_reader;
CREATE OR REPLACE FUNCTION sentinela_ocorrencias_local.detalhe(modo text, registro uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF modo='importados' THEN
    IF session_user NOT IN ('sentinela_local_admin','sentinela_local_operator') THEN
      RAISE EXCEPTION USING ERRCODE='42501';
    END IF;
    RETURN (SELECT jsonb_build_object('origemId',i.origem_id,'stagingId',i.id,
      'lote',i.lote,'execucao',i.execucao,'arquivo',i.arquivo,'competencia',i.competencia,'ordinal',i.ordinal,
      'situacao',i.situacao,'campos',s.campos_csv,'pendencias',coalesce((
        SELECT jsonb_agg(jsonb_build_object('campo',p.campo,'regra',p.regra,'motivo',CASE WHEN i.lote='84908630-bd04-4a03-923d-616649c8de74'
   OR s.derivados_efetivos ? 'geo' THEN sentinela_pcdf_revisao.motivo(p.campo,p.regra,p.tipo,p.status,p.motivo,s.campos_csv)
   ELSE p.motivo END,
          'prioridade',p.prioridade,'situacao',p.status) ORDER BY p.campo,p.regra,p.id)
        FROM sentinela.pendencias_revisao p WHERE p.linha_origem_id=i.origem_id),'[]'::jsonb))
      FROM sentinela_ocorrencias_local.importados i JOIN sentinela.linhas_staging s ON s.id=i.id
      WHERE i.id=registro);
  ELSIF modo='consolidadas' THEN
    RETURN (SELECT jsonb_build_object('id',o.id,'identificacao',c.identificacao,'fonte',o.fonte,'origem',o.origem,
      'data',c.data,'hora',c.hora,'ra',c.ra,'local',c.local,'localizacaoStatus',CASE WHEN o.versao_identidade='pcdf-tupla-conferida-v1' THEN
   CASE o.localizacao_status WHEN 'validada' THEN 'Localização GEO validada'
     WHEN 'ausente' THEN 'Localização GEO pendente. Coordenadas ausentes.'
     WHEN 'divergente' THEN 'Localização GEO pendente. Coordenadas divergentes.'
     WHEN 'invalida' THEN 'Localização GEO pendente. Coordenadas inválidas.'
     ELSE 'Localização GEO pendente. Referência, par ou validação territorial em revisão.' END
   ELSE o.localizacao_status END,
      'latitude',o.latitude,'longitude',o.longitude,'unidadeApuracao',o.unidade_apuracao,
      'naturezas',coalesce((SELECT jsonb_agg(jsonb_build_object('nome',n.descricao_original,
          'classificacao',a.classificacao_status,'crimeTentado',a.crime_tentado,
          'categoria',(SELECT cc.nome FROM sentinela.mapeamentos_natureza mm JOIN sentinela.categorias_criminais cc ON cc.id=mm.categoria_id
                       WHERE mm.id=a.mapeamento_id AND mm.status='homologado' AND cc.status='homologada')) ORDER BY a.id)
        FROM sentinela.ocorrencia_naturezas a JOIN sentinela.naturezas_criminais n ON n.id=a.natureza_id
        WHERE a.ocorrencia_id=o.id),'[]'::jsonb))
      FROM sentinela_ocorrencias_local.consolidadas c JOIN sentinela.ocorrencias o ON o.id=c.id WHERE o.id=registro);
  END IF;
  RAISE EXCEPTION USING ERRCODE='22023';
END
$$;

-- Occurrence list filters by homologated category name; the summary lists the categories in use.
CREATE OR REPLACE FUNCTION sentinela_ocorrencias_local.lista(modo text, filtros jsonb, pagina integer, ordenar text, direcao text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE result jsonb;
BEGIN
  IF modo IS NULL OR modo NOT IN ('importados','consolidadas') OR pagina IS NULL OR pagina NOT BETWEEN 1 AND 1000000
    OR ordenar IS NULL OR ordenar NOT IN ('data','identificacao','ra','competencia')
    OR direcao IS NULL OR direcao NOT IN ('asc','desc')
    OR jsonb_typeof(filtros) IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
  IF modo='importados' AND session_user NOT IN ('sentinela_local_admin','sentinela_local_operator')
  THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;

  -- Only the enumerated relation, column and direction are interpolated. Filters remain bind values.
  EXECUTE format($query$
    WITH filtered AS (
      SELECT p.*
      FROM sentinela_ocorrencias_local.%I p
      WHERE ($1->>'identificacao' IS NULL OR strpos(lower(concat_ws(' ',p.identificacao,p.id::text)),lower($1->>'identificacao'))>0)
        AND ($1->>'lote' IS NULL OR p.lote=($1->>'lote')::uuid)
        AND ($1->>'busca' IS NULL OR strpos(lower(concat_ws(' ',p.identificacao,p.ordinal,p.natureza,p.padronizada,p.ra,p.local,p.id)),
          lower($1->>'busca'))>0)
        AND ($1->>'dataInicial' IS NULL OR p.data>=($1->>'dataInicial')::date)
        AND ($1->>'dataFinal' IS NULL OR p.data<=($1->>'dataFinal')::date)
        AND ($1->>'ra' IS NULL OR p.ra=$1->>'ra')
        AND ($1->>'natureza' IS NULL OR p.natureza=$1->>'natureza')
        AND ($1->>'raId' IS NULL OR EXISTS(SELECT FROM sentinela.ocorrencias o
          WHERE o.id=p.id AND o.ra_id=($1->>'raId')::uuid))
        AND ($1->>'naturezaId' IS NULL OR EXISTS(SELECT FROM sentinela.ocorrencia_naturezas a
          WHERE a.ocorrencia_id=p.id AND (SELECT n.descricao_original COLLATE "C"
   FROM sentinela.naturezas_criminais n WHERE n.id=a.natureza_id) =
   (SELECT n.descricao_original COLLATE "C" FROM sentinela.naturezas_criminais n
     WHERE n.id=($1->>'naturezaId')::uuid)))
        AND ($1->>'categoria' IS NULL OR EXISTS(SELECT FROM sentinela.ocorrencia_naturezas a
          JOIN sentinela.mapeamentos_natureza mm ON mm.id=a.mapeamento_id AND mm.status='homologado'
          JOIN sentinela.categorias_criminais cc ON cc.id=mm.categoria_id AND cc.status='homologada'
          WHERE a.ocorrencia_id=p.id AND cc.nome=$1->>'categoria'))
        AND ($1->>'competencia' IS NULL OR p.competencia=$1->>'competencia')
        AND ($1->>'situacao' IS NULL OR p.situacao=$1->>'situacao')
    ), page AS (
      SELECT * FROM filtered ORDER BY %I %s NULLS LAST,id LIMIT 25 OFFSET ($2-1)*25
    )
    SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'pagina',$2,'itens',coalesce(
      jsonb_agg(to_jsonb(p) || jsonb_build_object(
        'natureza',CASE WHEN $3='importados' THEN p.natureza ELSE (
          SELECT string_agg(DISTINCT n.descricao_original, ' · ' ORDER BY n.descricao_original)
          FROM sentinela.ocorrencia_naturezas a JOIN sentinela.naturezas_criminais n ON n.id=a.natureza_id
          WHERE a.ocorrencia_id=p.id) END,
        'pendencias',CASE WHEN $3='importados' THEN (SELECT count(*) FROM sentinela.pendencias_revisao
          WHERE linha_origem_id=p.origem_id) END)
      ORDER BY p.%I %s NULLS LAST,p.id),'[]'::jsonb))
    FROM page p
  $query$,modo,ordenar,direcao,ordenar,direcao) INTO result USING filtros,pagina,modo;
  RETURN result;
END
$_$;

CREATE OR REPLACE FUNCTION sentinela_ocorrencias_local.resumo() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
 WITH permit AS (SELECT session_user IN ('sentinela_local_admin','sentinela_local_operator') AS staging)
 SELECT jsonb_build_object('canImport',staging,
   'recebidas',CASE WHEN staging THEN (SELECT count(*) FROM sentinela_ocorrencias_local.importados) END,
   'consolidadas',(SELECT count(*) FROM sentinela.ocorrencias),
   'pendencias',CASE WHEN staging THEN (SELECT count(*) FROM sentinela.pendencias_revisao) END,
   'competencias',CASE WHEN staging THEN coalesce((SELECT jsonb_agg(m ORDER BY m DESC)
      FROM (SELECT DISTINCT competencia m FROM sentinela_ocorrencias_local.importados) q),'[]'::jsonb) END,
   'rasImportadas',coalesce((SELECT jsonb_agg(v ORDER BY v) FROM (SELECT DISTINCT ra v
      FROM sentinela_ocorrencias_local.importados WHERE ra IS NOT NULL) q),'[]'::jsonb),
   'naturezasImportadas',coalesce((SELECT jsonb_agg(v ORDER BY v) FROM (SELECT DISTINCT natureza v
      FROM sentinela_ocorrencias_local.importados WHERE natureza IS NOT NULL) q),'[]'::jsonb),
   'rasConsolidadas',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'label',r.nome) ORDER BY r.nome,r.id)
      FROM sentinela.regioes_administrativas r WHERE EXISTS(SELECT FROM sentinela.ocorrencias o WHERE o.ra_id=r.id)),'[]'::jsonb),
   'categoriasConsolidadas',coalesce((SELECT jsonb_agg(v ORDER BY v) FROM (SELECT DISTINCT cc.nome v
      FROM sentinela.ocorrencia_naturezas a
      JOIN sentinela.mapeamentos_natureza mm ON mm.id=a.mapeamento_id AND mm.status='homologado'
      JOIN sentinela.categorias_criminais cc ON cc.id=mm.categoria_id AND cc.status='homologada') q),'[]'::jsonb),
   'naturezasConsolidadas',coalesce((SELECT jsonb_agg(jsonb_build_object('id',n.id,'label',n.descricao_original)
      ORDER BY n.descricao_original,n.id) FROM (
   SELECT DISTINCT ON (n.descricao_original COLLATE "C") n.id,n.descricao_original
   FROM sentinela.naturezas_criminais n
   WHERE EXISTS (
     SELECT FROM sentinela.ocorrencia_naturezas a JOIN sentinela.naturezas_criminais vinculada ON vinculada.id=a.natureza_id
     WHERE vinculada.descricao_original COLLATE "C"=n.descricao_original COLLATE "C")
   ORDER BY n.descricao_original COLLATE "C",
     (n.fonte='PCDF' AND n.categoria_pcdf_original IS NULL AND sentinela.descricao_pcdf(n.descricao_original)) DESC,n.id
 ) n),'[]'::jsonb))
 FROM permit
$$;
RESET ROLE;

DO $post$
BEGIN
  IF (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r' AND relrowsecurity AND relforcerowsecurity) <> 19
     OR (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela_classificacao'::regnamespace AND relkind='r' AND relrowsecurity AND relforcerowsecurity) <> 3
     OR EXISTS (SELECT FROM sentinela.ocorrencia_naturezas WHERE mapeamento_id IN
                (SELECT id FROM sentinela.mapeamentos_natureza WHERE versao LIKE 'pcdf-classificacao-v2%'))
     OR (SELECT versao_ativa FROM sentinela_classificacao.liberacao) IS NOT NULL
     OR EXISTS (SELECT FROM pg_roles WHERE rolname = 'sentinela_classificacao_owner' AND (rolcanlogin OR rolbypassrls OR rolsuper OR rolinherit)) THEN
    RAISE EXCEPTION 'Pos-condicoes da 0015 divergentes.';
  END IF;
END $post$;
INSERT INTO sentinela.schema_migrations VALUES ('0015','Classificacao PCDF v2: catalogo proposto e aplicacao auditada',DEFAULT);
COMMIT;
