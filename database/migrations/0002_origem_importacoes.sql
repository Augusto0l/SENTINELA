BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = sentinela, public, pg_catalog;

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
COMMIT;
