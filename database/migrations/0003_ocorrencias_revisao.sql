BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = sentinela, public, pg_catalog;

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
  geometria public.geometry(Point, 4326), -- alvo WGS84; nao atribui CRS aos originais
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
    AND NOT public.ST_IsEmpty(geometria)
    AND public.ST_X(geometria) = longitude AND public.ST_Y(geometria) = latitude
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
COMMIT;
