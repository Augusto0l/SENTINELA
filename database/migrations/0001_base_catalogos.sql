-- SENTINELA / Sprint 4 / Etapa 1. PostgreSQL >= 15, PostGIS >= 3.3.
-- Somente banco LOCAL vazio e descartavel. Aplicar na ordem; nao e um runner.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'postgis' AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'Esta baseline requer PostGIS em public; adaptar explicitamente antes de aplicar.';
  END IF;
END $$;

CREATE SCHEMA sentinela;
REVOKE ALL ON SCHEMA sentinela FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA sentinela REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA sentinela REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA sentinela REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
SET LOCAL search_path = sentinela, public, pg_catalog;

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
  limite public.geometry(MultiPolygon, 4326), -- destino confirmado; nao CRS presumido da PCDF
  CHECK (NOT isempty(vigencia)),
  CHECK (limite IS NULL OR (
    NOT public.ST_IsEmpty(limite) AND public.ST_IsValid(limite)
    AND evidencia_referencia_espacial IS NOT NULL AND length(btrim(evidencia_referencia_espacial)) > 0
    AND versao_cartografia IS NOT NULL AND length(btrim(versao_cartografia)) > 0
  )),
  UNIQUE (codigo_interno, versao_catalogo)
);
CREATE INDEX regioes_limite_gist ON sentinela.regioes_administrativas USING gist(limite);
CREATE INDEX mapeamentos_categoria_idx ON sentinela.mapeamentos_natureza(categoria_id);
-- Nenhum catalogo criminal, RA, usuario ou dado PCDF e carregado pela baseline.

INSERT INTO sentinela.schema_migrations VALUES ('0001', 'Base, PostGIS, catalogos e perfis', DEFAULT);
COMMIT;
