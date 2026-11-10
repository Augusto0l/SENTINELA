-- GENERATED from the frozen local migrations; see ../README.md and ../sources.json.
-- Initial installation ONLY. Never combine with database/migrations/0001-0005.
-- Does not install/move PostGIS, provision Auth, or grant application access.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog;
SELECT pg_catalog.pg_advisory_xact_lock(743204, 21);
DO $preflight$
DECLARE extension_version text;
BEGIN
  IF current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'PostgreSQL >= 15 requerido.';
  END IF;
  IF current_setting('server_encoding') <> 'UTF8' THEN
    RAISE EXCEPTION 'Banco UTF8 requerido.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'sentinela') THEN
    RAISE EXCEPTION 'Schema sentinela existente: nao reaplicar nem combinar baselines.';
  END IF;
  SELECT e.extversion INTO extension_version
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'postgis' AND n.nspname = 'extensions';
  IF extension_version IS NULL THEN
    RAISE EXCEPTION 'PostGIS deve estar previamente instalado em extensions; nenhuma extensao sera alterada.';
  END IF;
  IF (split_part(extension_version, '.', 1)::integer,
      split_part(extension_version, '.', 2)::integer) < (3, 3) THEN
    RAISE EXCEPTION 'PostGIS >= 3.3 requerido.';
  END IF;
  IF NOT has_schema_privilege(current_user, 'extensions', 'USAGE') THEN
    RAISE EXCEPTION 'Instalador precisa de USAGE em extensions.';
  END IF;
END $preflight$;

-- SOURCE-BEGIN 0001_base_catalogos.sql
-- SENTINELA / Sprint 4 / Etapa 1. PostgreSQL >= 15, PostGIS >= 3.3.
-- Source model only: installation instructions are superseded by the Supabase preflight above.


CREATE SCHEMA sentinela;
REVOKE ALL ON SCHEMA sentinela FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA sentinela REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA sentinela REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA sentinela REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
SET LOCAL search_path = pg_catalog, sentinela, extensions;

CREATE DOMAIN sentinela.texto_obrigatorio AS text
  CHECK (VALUE IS NULL OR length(btrim(VALUE)) > 0);
CREATE DOMAIN sentinela.sha256 AS text
  CHECK (VALUE IS NULL OR VALUE ~ '^[0-9a-f]{64}$');

CREATE TABLE sentinela.schema_migrations (
  versao text PRIMARY KEY,
  descricao text NOT NULL,
  aplicado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Catalogo de autorizacao, nao usuarios do Supabase nem roles LOGIN do PostgreSQL.
CREATE TABLE sentinela.perfis (
  nome text PRIMARY KEY CHECK (nome IN ('Administrador', 'Operador', 'Analista'))
);
CREATE TABLE sentinela.permissoes (
  acao text PRIMARY KEY,
  descricao sentinela.texto_obrigatorio NOT NULL
);
CREATE TABLE sentinela.perfil_permissoes (
  perfil text NOT NULL REFERENCES sentinela.perfis(nome),
  acao text NOT NULL REFERENCES sentinela.permissoes(acao),
  PRIMARY KEY (perfil, acao)
);
CREATE TABLE sentinela.usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE, -- futura FK auth.users(id), somente apos integracao homologada
  nome_exibicao sentinela.texto_obrigatorio NOT NULL,
  perfil text NOT NULL REFERENCES sentinela.perfis(nome),
  ativo boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Sem senha, token, concessao automatica ou perfil enviado pelo frontend.
INSERT INTO sentinela.perfis VALUES ('Administrador'), ('Operador'), ('Analista');
INSERT INTO sentinela.permissoes VALUES
  ('consultar_analises', 'Consultar ocorrencias, indicadores e mapa no escopo autorizado'),
  ('consultar_central', 'Consultar Central e historico permitido no escopo autorizado'),
  ('cadastrar_ocorrencias', 'Cadastrar registros manuais no escopo autorizado'),
  ('importar', 'Solicitar importacao no escopo autorizado'),
  ('corrigir_central', 'Corrigir dados e resolver ou encerrar pendencias na Central'),
  ('administrar', 'Administrar usuarios e configuracoes por operacoes auditadas');
INSERT INTO sentinela.perfil_permissoes
SELECT 'Administrador', acao FROM sentinela.permissoes;
INSERT INTO sentinela.perfil_permissoes VALUES
  ('Operador', 'consultar_analises'), ('Operador', 'consultar_central'),
  ('Operador', 'cadastrar_ocorrencias'), ('Operador', 'importar'),
  ('Analista', 'consultar_analises'), ('Analista', 'consultar_central');

CREATE TABLE sentinela.categorias_criminais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_interno sentinela.texto_obrigatorio, -- nao inventar codigos oficiais
  nome sentinela.texto_obrigatorio NOT NULL,
  versao_catalogo sentinela.texto_obrigatorio NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'homologada', 'inativa')),
  evidencia_homologacao text,
  UNIQUE (versao_catalogo, nome),
  UNIQUE (versao_catalogo, codigo_interno),
  CHECK (status <> 'homologada' OR length(btrim(evidencia_homologacao)) > 0 AND evidencia_homologacao IS NOT NULL)
);
CREATE TABLE sentinela.naturezas_criminais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte sentinela.texto_obrigatorio NOT NULL,
  descricao_original text NOT NULL, -- sem normalizacao destrutiva
  categoria_pcdf_original text,
  UNIQUE NULLS NOT DISTINCT (fonte, descricao_original, categoria_pcdf_original)
);
CREATE TABLE sentinela.mapeamentos_natureza (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  natureza_id uuid NOT NULL REFERENCES sentinela.naturezas_criminais(id),
  versao sentinela.texto_obrigatorio NOT NULL,
  crime_tentado boolean, -- seletor da regra; NULL e distinto de false
  categoria_id uuid REFERENCES sentinela.categorias_criminais(id),
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'homologado', 'sem_correspondencia', 'conflitante')),
  evidencia_homologacao text,
  UNIQUE NULLS NOT DISTINCT (natureza_id, versao, crime_tentado),
  UNIQUE (id, natureza_id),
  CHECK ((status = 'homologado') = (categoria_id IS NOT NULL)),
  CHECK (status <> 'homologado' OR evidencia_homologacao IS NOT NULL AND length(btrim(evidencia_homologacao)) > 0)
);

CREATE TABLE sentinela.regioes_administrativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_interno sentinela.texto_obrigatorio NOT NULL,
  codigo_oficial text,
  nome sentinela.texto_obrigatorio NOT NULL,
  versao_catalogo sentinela.texto_obrigatorio NOT NULL,
  vigencia daterange NOT NULL,
  versao_cartografia text,
  evidencia_referencia_espacial text,
  limite extensions.geometry(MultiPolygon, 4326), -- destino confirmado; nao CRS presumido da PCDF
  CHECK (NOT isempty(vigencia)),
  CHECK (limite IS NULL OR (
    NOT extensions.ST_IsEmpty(limite) AND extensions.ST_IsValid(limite)
    AND evidencia_referencia_espacial IS NOT NULL AND length(btrim(evidencia_referencia_espacial)) > 0
    AND versao_cartografia IS NOT NULL AND length(btrim(versao_cartografia)) > 0
  )),
  UNIQUE (codigo_interno, versao_catalogo)
);
CREATE INDEX regioes_limite_gist ON sentinela.regioes_administrativas USING gist(limite);
CREATE INDEX mapeamentos_categoria_idx ON sentinela.mapeamentos_natureza(categoria_id);
-- Nenhum catalogo criminal, RA, usuario ou dado PCDF e carregado pela baseline.

INSERT INTO sentinela.schema_migrations VALUES ('0001', 'Base, PostGIS, catalogos e perfis', DEFAULT);
-- SOURCE-END 0001_base_catalogos.sql

-- SOURCE-BEGIN 0002_origem_importacoes.sql
SET LOCAL search_path = pg_catalog, sentinela, extensions;

CREATE TABLE sentinela.extracoes_origem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte sentinela.texto_obrigatorio NOT NULL,
  nome_xml sentinela.texto_obrigatorio NOT NULL,
  sha256_xml sentinela.sha256 NOT NULL,
  tamanho_bytes bigint NOT NULL CHECK (tamanho_bytes > 0),
  referencia_arquivo sentinela.texto_obrigatorio NOT NULL, -- caminho privado, nao URL publica
  metodologia text,
  manifesto jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(manifesto) = 'object'),
  recebido_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (fonte, sha256_xml)
);
CREATE TABLE sentinela.lotes_importacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extracao_id uuid NOT NULL REFERENCES sentinela.extracoes_origem(id),
  nome_arquivo sentinela.texto_obrigatorio NOT NULL,
  sha256_arquivo sentinela.sha256 NOT NULL,
  tamanho_bytes bigint NOT NULL CHECK (tamanho_bytes > 0),
  referencia_arquivo sentinela.texto_obrigatorio NOT NULL,
  versao_contrato sentinela.texto_obrigatorio NOT NULL,
  versao_tratamento sentinela.texto_obrigatorio NOT NULL,
  competencia date NOT NULL CHECK (isfinite(competencia) AND extract(day FROM competencia) = 1),
  linhas_esperadas bigint CHECK (linhas_esperadas >= 0),
  solicitado_por uuid NOT NULL REFERENCES sentinela.usuarios(id),
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (extracao_id, sha256_arquivo), -- versao nova nao autoriza importar os mesmos bytes novamente
  UNIQUE (id, extracao_id)
);
CREATE TABLE sentinela.execucoes_importacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL,
  extracao_id uuid NOT NULL,
  tentativa integer NOT NULL CHECK (tentativa > 0),
  motivo_reprocessamento text,
  solicitado_por uuid NOT NULL REFERENCES sentinela.usuarios(id),
  versao_importador sentinela.texto_obrigatorio NOT NULL,
  versao_validacao sentinela.texto_obrigatorio NOT NULL,
  versao_mapeamento text,
  status text NOT NULL DEFAULT 'criada' CHECK (status IN
    ('criada', 'validando', 'aguardando_confirmacao', 'processando', 'concluida', 'falhou', 'cancelada')),
  linhas_lidas bigint NOT NULL DEFAULT 0 CHECK (linhas_lidas >= 0),
  linhas_processadas bigint NOT NULL DEFAULT 0 CHECK (linhas_processadas >= 0),
  linhas_aptas bigint NOT NULL DEFAULT 0 CHECK (linhas_aptas >= 0),
  linhas_bloqueadas bigint NOT NULL DEFAULT 0 CHECK (linhas_bloqueadas >= 0),
  linhas_reenviadas bigint NOT NULL DEFAULT 0 CHECK (linhas_reenviadas >= 0),
  ocorrencias_criadas bigint NOT NULL DEFAULT 0 CHECK (ocorrencias_criadas >= 0),
  associacoes_criadas bigint NOT NULL DEFAULT 0 CHECK (associacoes_criadas >= 0),
  pendencias_detectadas bigint NOT NULL DEFAULT 0 CHECK (pendencias_detectadas >= 0),
  erros_detectados bigint NOT NULL DEFAULT 0 CHECK (erros_detectados >= 0),
  checkpoint_registro_csv bigint NOT NULL DEFAULT 0 CHECK (checkpoint_registro_csv >= 0),
  checkpoint_detalhes jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(checkpoint_detalhes) = 'object'),
  falha jsonb,
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  atualizado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  finalizado_em timestamptz,
  UNIQUE (lote_id, tentativa),
  UNIQUE (id, lote_id, extracao_id),
  FOREIGN KEY (lote_id, extracao_id) REFERENCES sentinela.lotes_importacao(id, extracao_id),
  CHECK (tentativa = 1 OR motivo_reprocessamento IS NOT NULL AND length(btrim(motivo_reprocessamento)) > 0),
  CHECK (linhas_processadas = linhas_aptas + linhas_bloqueadas + linhas_reenviadas),
  CHECK (linhas_processadas <= linhas_lidas),
  CHECK (checkpoint_registro_csv <= linhas_lidas),
  CHECK (associacoes_criadas <= linhas_aptas),
  CHECK (ocorrencias_criadas <= associacoes_criadas),
  CHECK (status <> 'concluida' OR linhas_processadas = linhas_lidas),
  CHECK ((status IN ('concluida', 'falhou', 'cancelada')) = (finalizado_em IS NOT NULL)),
  CHECK ((status = 'falhou') = (falha IS NOT NULL))
);
CREATE UNIQUE INDEX execucoes_uma_ativa_lote ON sentinela.execucoes_importacao(lote_id)
  WHERE status IN ('criada', 'validando', 'aguardando_confirmacao', 'processando');

-- Identidade imutavel da linha XML, independente da tentativa e da ocorrencia.
CREATE TABLE sentinela.linhas_origem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extracao_id uuid NOT NULL REFERENCES sentinela.extracoes_origem(id),
  linha_origem_id sentinela.texto_obrigatorio NOT NULL UNIQUE,
  aba_origem sentinela.texto_obrigatorio NOT NULL,
  linha_xml bigint NOT NULL CHECK (linha_xml > 0),
  versao_identificador sentinela.texto_obrigatorio NOT NULL,
  ano_registro text,
  unidade_registro text,
  numero_registro text,
  ano_fato text,
  data_inicio_fato_original text,
  flagrante text,
  natureza_original text,
  crime_tentado text,
  natureza_padronizada_pcdf text,
  cidade_endereco_original text,
  ra_original text,
  area_endereco_original text,
  quadra_endereco_original text,
  latitude_geo_original text,
  longitude_geo_original text,
  latitude_utm_original text,
  longitude_utm_original text,
  unidade_apuracao text,
  estrutura_celulas jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(estrutura_celulas) = 'object'),
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (extracao_id, aba_origem, linha_xml),
  UNIQUE (id, extracao_id)
);
CREATE TABLE sentinela.linhas_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execucao_id uuid NOT NULL,
  lote_id uuid NOT NULL,
  extracao_id uuid NOT NULL,
  linha_origem_id uuid NOT NULL,
  registro_csv bigint NOT NULL CHECK (registro_csv > 0), -- ordinal de dados, nao linha textual
  campos_csv jsonb NOT NULL CHECK (jsonb_typeof(campos_csv) = 'object'), -- snapshot dos 34 campos
  derivados_efetivos jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(derivados_efetivos) = 'object'),
  diagnosticos jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(diagnosticos) = 'array'),
  estado text NOT NULL DEFAULT 'recebida' CHECK (estado IN
    ('recebida', 'apta', 'bloqueada', 'consolidada', 'reenviada')),
  versao bigint NOT NULL DEFAULT 1 CHECK (versao > 0),
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  atualizado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (execucao_id, registro_csv),
  UNIQUE (execucao_id, linha_origem_id),
  FOREIGN KEY (execucao_id, lote_id, extracao_id)
    REFERENCES sentinela.execucoes_importacao(id, lote_id, extracao_id),
  FOREIGN KEY (linha_origem_id, extracao_id) REFERENCES sentinela.linhas_origem(id, extracao_id)
);
CREATE INDEX lotes_competencia_idx ON sentinela.lotes_importacao(competencia, id);
CREATE INDEX lotes_solicitante_idx ON sentinela.lotes_importacao(solicitado_por);
CREATE INDEX execucoes_solicitante_idx ON sentinela.execucoes_importacao(solicitado_por);
CREATE INDEX staging_execucao_estado_idx ON sentinela.linhas_staging(execucao_id, estado, registro_csv);
CREATE INDEX staging_origem_idx ON sentinela.linhas_staging(linha_origem_id);
CREATE INDEX staging_lote_idx ON sentinela.linhas_staging(lote_id);

INSERT INTO sentinela.schema_migrations VALUES ('0002', 'Extracoes, lotes, execucoes e staging', DEFAULT);
-- SOURCE-END 0002_origem_importacoes.sql

-- SOURCE-BEGIN 0003_ocorrencias_revisao.sql
SET LOCAL search_path = pg_catalog, sentinela, extensions;

CREATE TABLE sentinela.ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem text NOT NULL CHECK (origem IN ('manual', 'importacao')),
  fonte sentinela.texto_obrigatorio NOT NULL,
  ano_registro text,
  unidade_registro text,
  numero_registro text,
  versao_identidade sentinela.texto_obrigatorio NOT NULL,
  identidade_status text NOT NULL DEFAULT 'candidata'
    CHECK (identidade_status IN ('candidata', 'homologada', 'manual')),
  evidencia_identidade text,
  data_fato date CHECK (isfinite(data_fato)),
  horario_fato time(0) without time zone CHECK (horario_fato < time '24:00:00'),
  ra_id uuid REFERENCES sentinela.regioes_administrativas(id),
  local text, -- nao truncar enderecos historicos para o limite do formulario demonstrativo
  flagrante boolean,
  unidade_apuracao text,
  latitude double precision CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude BETWEEN -180 AND 180),
  localizacao_status text NOT NULL DEFAULT 'ausente' CHECK (localizacao_status IN
    ('ausente', 'incompleta', 'invalida', 'referencia_pendente', 'divergente', 'validada')),
  referencia_espacial_confirmada text,
  regra_transformacao text,
  geometria extensions.geometry(Point, 4326), -- alvo WGS84; nao atribui CRS aos originais
  consolidacao_status text NOT NULL DEFAULT 'em_revisao'
    CHECK (consolidacao_status IN ('em_revisao', 'consolidada', 'bloqueada')),
  ativo boolean NOT NULL DEFAULT true,
  versao bigint NOT NULL DEFAULT 1 CHECK (versao > 0),
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  atualizado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((origem = 'manual') = (identidade_status = 'manual')),
  CHECK (identidade_status <> 'homologada' OR (
    ano_registro IS NOT NULL AND length(btrim(ano_registro)) > 0
    AND unidade_registro IS NOT NULL AND length(btrim(unidade_registro)) > 0
    AND numero_registro IS NOT NULL AND length(btrim(numero_registro)) > 0
    AND evidencia_identidade IS NOT NULL AND length(btrim(evidencia_identidade)) > 0
  )),
  CHECK (localizacao_status <> 'ausente' OR latitude IS NULL AND longitude IS NULL),
  CHECK (localizacao_status <> 'incompleta' OR (latitude IS NULL) <> (longitude IS NULL)),
  CHECK ((localizacao_status = 'validada') = (geometria IS NOT NULL)),
  CHECK (geometria IS NULL OR (
    latitude IS NOT NULL AND longitude IS NOT NULL
    AND referencia_espacial_confirmada IS NOT NULL AND length(btrim(referencia_espacial_confirmada)) > 0
    AND regra_transformacao IS NOT NULL AND length(btrim(regra_transformacao)) > 0
    AND NOT extensions.ST_IsEmpty(geometria)
    AND extensions.ST_X(geometria) = longitude AND extensions.ST_Y(geometria) = latitude
  ))
);
-- Tupla CANDIDATA nao e unica: conflitos nao devem fundir ocorrencias automaticamente.
CREATE INDEX ocorrencias_chave_candidata_idx
  ON sentinela.ocorrencias(fonte, ano_registro, unidade_registro, numero_registro);
CREATE UNIQUE INDEX ocorrencias_identidade_homologada_unica
  ON sentinela.ocorrencias(fonte, versao_identidade, ano_registro, unidade_registro, numero_registro)
  WHERE identidade_status = 'homologada';
CREATE INDEX ocorrencias_periodo_idx ON sentinela.ocorrencias(data_fato, id) WHERE ativo;
CREATE INDEX ocorrencias_ra_periodo_idx ON sentinela.ocorrencias(ra_id, data_fato, id) WHERE ativo;
CREATE INDEX ocorrencias_geometria_gist ON sentinela.ocorrencias USING gist(geometria) WHERE geometria IS NOT NULL;

CREATE TABLE sentinela.ocorrencia_naturezas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocorrencia_id uuid NOT NULL REFERENCES sentinela.ocorrencias(id),
  natureza_id uuid NOT NULL REFERENCES sentinela.naturezas_criminais(id),
  origem text NOT NULL CHECK (origem IN ('manual', 'importacao')),
  linha_origem_id uuid UNIQUE REFERENCES sentinela.linhas_origem(id),
  crime_tentado boolean, -- pertence a esta associacao, nao a ocorrencia
  classificacao_status text NOT NULL DEFAULT 'pendente'
    CHECK (classificacao_status IN ('pendente', 'mapeada', 'sem_correspondencia', 'conflitante')),
  mapeamento_id uuid,
  versao bigint NOT NULL DEFAULT 1 CHECK (versao > 0),
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  atualizado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, linha_origem_id, ocorrencia_id),
  FOREIGN KEY (mapeamento_id, natureza_id) REFERENCES sentinela.mapeamentos_natureza(id, natureza_id),
  CHECK ((origem = 'importacao') = (linha_origem_id IS NOT NULL)),
  CHECK ((classificacao_status = 'mapeada') = (mapeamento_id IS NOT NULL))
);
-- Sem UNIQUE(ocorrencia, categoria): duas descricoes mapeadas a mesma categoria nao desaparecem.
CREATE INDEX associacoes_ocorrencia_idx ON sentinela.ocorrencia_naturezas(ocorrencia_id);
CREATE INDEX associacoes_natureza_ocorrencia_idx ON sentinela.ocorrencia_naturezas(natureza_id, ocorrencia_id);
CREATE INDEX associacoes_mapeamento_idx ON sentinela.ocorrencia_naturezas(mapeamento_id);

ALTER TABLE sentinela.linhas_staging
  ADD COLUMN ocorrencia_id uuid REFERENCES sentinela.ocorrencias(id),
  ADD COLUMN associacao_id uuid,
  ADD CONSTRAINT staging_associacao_origem_fk FOREIGN KEY (associacao_id, linha_origem_id, ocorrencia_id)
    REFERENCES sentinela.ocorrencia_naturezas(id, linha_origem_id, ocorrencia_id),
  ADD CONSTRAINT staging_associacao_ocorrencia_ck CHECK (associacao_id IS NULL OR ocorrencia_id IS NOT NULL),
  ADD CONSTRAINT staging_consolidada_ck CHECK (estado <> 'consolidada' OR associacao_id IS NOT NULL);
CREATE INDEX staging_ocorrencia_idx ON sentinela.linhas_staging(ocorrencia_id);
CREATE INDEX staging_associacao_idx ON sentinela.linhas_staging(associacao_id);

CREATE TABLE sentinela.pendencias_revisao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocorrencia_id uuid REFERENCES sentinela.ocorrencias(id),
  linha_origem_id uuid REFERENCES sentinela.linhas_origem(id),
  campo sentinela.texto_obrigatorio NOT NULL,
  regra sentinela.texto_obrigatorio NOT NULL,
  versao_regra sentinela.texto_obrigatorio NOT NULL,
  valor_original jsonb, -- snapshot; a fonte continua em linhas_origem
  motivo sentinela.texto_obrigatorio NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('identificacao', 'datas_horarios', 'classificacao',
    'endereco_ra', 'coordenadas', 'informacoes_policiais', 'proveniencia')),
  prioridade text NOT NULL CHECK (prioridade IN ('alta', 'media', 'baixa')),
  efeito text NOT NULL CHECK (efeito IN ('nao_bloqueante', 'bloqueia_dimensao', 'bloqueia_consolidacao')),
  dimensao_afetada text,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN
    ('aberta', 'em_analise', 'resolvida', 'encerrada_sem_solucao')),
  responsavel_id uuid REFERENCES sentinela.usuarios(id),
  justificativa text,
  encerrada_em timestamptz,
  versao bigint NOT NULL DEFAULT 1 CHECK (versao > 0),
  detectada_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  atualizado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (ocorrencia_id IS NOT NULL OR linha_origem_id IS NOT NULL),
  CHECK (efeito <> 'bloqueia_dimensao' OR dimensao_afetada IS NOT NULL AND length(btrim(dimensao_afetada)) > 0),
  CHECK ((status IN ('resolvida', 'encerrada_sem_solucao')) = (encerrada_em IS NOT NULL)),
  CHECK (status NOT IN ('em_analise', 'resolvida', 'encerrada_sem_solucao') OR responsavel_id IS NOT NULL),
  CHECK (status NOT IN ('resolvida', 'encerrada_sem_solucao') OR justificativa IS NOT NULL AND length(btrim(justificativa)) > 0),
  UNIQUE NULLS NOT DISTINCT (ocorrencia_id, linha_origem_id, campo, regra, versao_regra)
);
CREATE INDEX pendencias_filtros_idx ON sentinela.pendencias_revisao(status, prioridade, tipo, detectada_em, id);
CREATE INDEX pendencias_ocorrencia_idx ON sentinela.pendencias_revisao(ocorrencia_id);
CREATE INDEX pendencias_origem_idx ON sentinela.pendencias_revisao(linha_origem_id);
CREATE INDEX pendencias_responsavel_idx ON sentinela.pendencias_revisao(responsavel_id);

CREATE TABLE sentinela.historico_correcoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocorrencia_id uuid REFERENCES sentinela.ocorrencias(id),
  staging_id uuid REFERENCES sentinela.linhas_staging(id),
  associacao_id uuid REFERENCES sentinela.ocorrencia_naturezas(id),
  pendencia_id uuid REFERENCES sentinela.pendencias_revisao(id),
  campo sentinela.texto_obrigatorio NOT NULL,
  valores_anteriores jsonb NOT NULL,
  valores_novos jsonb NOT NULL,
  responsavel_id uuid NOT NULL REFERENCES sentinela.usuarios(id),
  justificativa sentinela.texto_obrigatorio NOT NULL,
  versao_registro_anterior bigint NOT NULL CHECK (versao_registro_anterior > 0),
  versao_validacao sentinela.texto_obrigatorio NOT NULL,
  resultado_reavaliacao jsonb NOT NULL CHECK (jsonb_typeof(resultado_reavaliacao) = 'object'),
  corrigido_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (num_nonnulls(ocorrencia_id, staging_id, associacao_id) = 1)
);
CREATE INDEX correcoes_ocorrencia_data_idx ON sentinela.historico_correcoes(ocorrencia_id, corrigido_em);
CREATE INDEX correcoes_staging_idx ON sentinela.historico_correcoes(staging_id);
CREATE INDEX correcoes_associacao_idx ON sentinela.historico_correcoes(associacao_id);
CREATE INDEX correcoes_pendencia_idx ON sentinela.historico_correcoes(pendencia_id);
CREATE INDEX correcoes_responsavel_idx ON sentinela.historico_correcoes(responsavel_id);

-- Eventos de deteccao/reabertura automatica e de operacoes fora de uma correcao de campo.
CREATE TABLE sentinela.eventos_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ator_tipo text NOT NULL CHECK (ator_tipo IN ('usuario', 'servico')),
  usuario_id uuid REFERENCES sentinela.usuarios(id),
  servico text,
  acao sentinela.texto_obrigatorio NOT NULL,
  ocorrencia_id uuid REFERENCES sentinela.ocorrencias(id),
  linha_origem_id uuid REFERENCES sentinela.linhas_origem(id),
  pendencia_id uuid REFERENCES sentinela.pendencias_revisao(id),
  execucao_id uuid REFERENCES sentinela.execucoes_importacao(id),
  correcao_id uuid REFERENCES sentinela.historico_correcoes(id),
  antes jsonb,
  depois jsonb,
  justificativa sentinela.texto_obrigatorio NOT NULL,
  request_id text,
  registrado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((ator_tipo = 'usuario' AND usuario_id IS NOT NULL AND servico IS NULL)
    OR (ator_tipo = 'servico' AND usuario_id IS NULL AND servico IS NOT NULL AND length(btrim(servico)) > 0))
);
CREATE INDEX auditoria_ocorrencia_data_idx ON sentinela.eventos_auditoria(ocorrencia_id, registrado_em);
CREATE INDEX auditoria_origem_idx ON sentinela.eventos_auditoria(linha_origem_id);
CREATE INDEX auditoria_pendencia_idx ON sentinela.eventos_auditoria(pendencia_id, registrado_em);
CREATE INDEX auditoria_execucao_idx ON sentinela.eventos_auditoria(execucao_id);
CREATE INDEX auditoria_correcao_idx ON sentinela.eventos_auditoria(correcao_id);
CREATE INDEX auditoria_usuario_idx ON sentinela.eventos_auditoria(usuario_id);

INSERT INTO sentinela.schema_migrations VALUES ('0003', 'Ocorrencias, associacoes e revisao', DEFAULT);
-- SOURCE-END 0003_ocorrencias_revisao.sql

-- SOURCE-BEGIN 0004_integridade_protecao.sql
SET LOCAL search_path = pg_catalog, sentinela, extensions;

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
    WHEN extensions.ST_Covers(r.limite, o.geometria) THEN 'compativel'
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
    EXECUTE format('CREATE TRIGGER impedir_truncate BEFORE TRUNCATE ON sentinela.%I '
      'FOR EACH STATEMENT EXECUTE FUNCTION sentinela.impedir_mutacao()', t);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA sentinela FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA sentinela FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA sentinela FROM PUBLIC;
-- Nenhum GRANT, POLICY permissiva, auth.uid() falso ou role Supabase e criado.
-- FORCE RLS nao limita superusuarios/BYPASSRLS: nunca usar essas identidades na aplicacao.
-- SOURCE-END 0004_integridade_protecao.sql

-- SOURCE-BEGIN 0005_integridade_revisao_seguranca.sql
-- Incremental: preservar 0001-0004. Nao habilita Auth, RPC ou escrita da aplicacao.


SET LOCAL search_path = pg_catalog, sentinela, extensions;

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
-- SOURCE-END 0005_integridade_revisao_seguranca.sql

-- RLS is activated only AFTER all seeds, ledger entries and integrity checks.
-- One transaction: no intermediate state is committed. No temporary policies/bypass.
SET LOCAL search_path = pg_catalog;
DO $finalize$
DECLARE t text; r text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'sentinela' LOOP
    EXECUTE format('ALTER TABLE sentinela.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE sentinela.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
  -- Supabase roles may have direct/default grants independently of PUBLIC.
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA sentinela FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA sentinela FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA sentinela FROM %I', r);
      EXECUTE format('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA sentinela FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA sentinela REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA sentinela REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA sentinela REVOKE EXECUTE ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_class c
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(
      CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) a
    WHERE c.relnamespace='sentinela'::regnamespace AND c.relkind IN ('r','S') AND a.grantee<>c.relowner
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.pronamespace='sentinela'::regnamespace AND a.grantee<>p.proowner
  ) OR EXISTS (
    SELECT 1 FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
    WHERE n.nspname='sentinela' AND a.grantee<>n.nspowner
  ) THEN
    RAISE EXCEPTION 'ACL inesperada para terceiros: revisar defaults/event triggers antes de instalar.';
  END IF;
END $finalize$;
COMMENT ON SCHEMA sentinela IS 'sentinela:supabase-baseline-v1:logical-0001-0005';
COMMIT;
