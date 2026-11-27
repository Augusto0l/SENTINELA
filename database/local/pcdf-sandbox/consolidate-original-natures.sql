-- Promotion is opt-in, scoped to the attested disposable cluster.
\ir ../sandbox/sql/guard.sql
BEGIN;
SET LOCAL search_path=pg_catalog;

CREATE TABLE sentinela_pcdf_lab.approved_groups (
  run_id uuid NOT NULL REFERENCES sentinela.execucoes_importacao(id),
  identity jsonb NOT NULL CHECK (jsonb_typeof(identity)='array' AND jsonb_array_length(identity)=3),
  evidence text NOT NULL CHECK (length(btrim(evidence))>0),
  PRIMARY KEY(run_id,identity)
);
ALTER TABLE sentinela_pcdf_lab.approved_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_pcdf_lab.approved_groups FORCE ROW LEVEL SECURITY;
GRANT SELECT ON sentinela_pcdf_lab.approved_groups TO sentinela_pcdf_sbx_importer;
CREATE POLICY approved_read ON sentinela_pcdf_lab.approved_groups FOR SELECT TO sentinela_pcdf_sbx_importer
 USING(EXISTS(SELECT FROM sentinela.execucoes_importacao e WHERE e.id=run_id));

CREATE TABLE sentinela_pcdf_lab.review_decisions (
  issue_id uuid NOT NULL REFERENCES sentinela.pendencias_revisao(id),
  revision bigint NOT NULL CHECK (revision>=2),
  subject uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('resolvida','encerrada_sem_solucao')),
  previous_value text,
  normalized_value text CHECK ((decision='resolvida')=(normalized_value IS NOT NULL)),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  tx xid8 NOT NULL DEFAULT pg_current_xact_id(),
  PRIMARY KEY(issue_id,revision)
);
ALTER TABLE sentinela_pcdf_lab.review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinela_pcdf_lab.review_decisions FORCE ROW LEVEL SECURITY;
GRANT SELECT ON sentinela_pcdf_lab.review_decisions TO sentinela_pcdf_sbx_importer;
CREATE POLICY decision_read ON sentinela_pcdf_lab.review_decisions FOR SELECT TO sentinela_pcdf_sbx_importer
 USING(EXISTS(SELECT FROM sentinela.pendencias_revisao p WHERE p.id=issue_id));

GRANT SELECT ON sentinela.ocorrencias,sentinela.ocorrencia_naturezas,sentinela.naturezas_criminais
 TO sentinela_pcdf_sbx_importer;
-- The baseline trigger still validates mappings on historical rows that have one.
GRANT SELECT ON sentinela.mapeamentos_natureza,sentinela.categorias_criminais TO sentinela_pcdf_sbx_importer;
GRANT INSERT(id,origem,fonte,ano_registro,unidade_registro,numero_registro,versao_identidade,
 identidade_status,evidencia_identidade,data_fato,horario_fato,local,flagrante,unidade_apuracao,consolidacao_status)
 ON sentinela.ocorrencias TO sentinela_pcdf_sbx_importer;
GRANT INSERT(ocorrencia_id,natureza_id,origem,linha_origem_id,crime_tentado)
 ON sentinela.ocorrencia_naturezas TO sentinela_pcdf_sbx_importer;
GRANT EXECUTE ON FUNCTION sentinela.validar_associacao_mapeada() TO sentinela_pcdf_sbx_importer;
CREATE POLICY pcdf_occurrence_read ON sentinela.ocorrencias FOR SELECT TO sentinela_pcdf_sbx_importer
 USING(fonte='PCDF-SANDBOX');
CREATE POLICY pcdf_occurrence_insert ON sentinela.ocorrencias FOR INSERT TO sentinela_pcdf_sbx_importer
 WITH CHECK(fonte='PCDF-SANDBOX' AND origem='importacao' AND identidade_status='homologada'
 AND versao_identidade='pcdf-sandbox-tuple-v1' AND consolidacao_status='consolidada'
 AND latitude IS NULL AND longitude IS NULL AND geometria IS NULL AND ra_id IS NULL);
CREATE POLICY pcdf_nature_read ON sentinela.naturezas_criminais FOR SELECT TO sentinela_pcdf_sbx_importer
 USING(fonte='PCDF-SANDBOX');
CREATE POLICY pcdf_link_read ON sentinela.ocorrencia_naturezas FOR SELECT TO sentinela_pcdf_sbx_importer
 USING(EXISTS(SELECT FROM sentinela.ocorrencias o WHERE o.id=ocorrencia_id));
CREATE POLICY pcdf_link_insert ON sentinela.ocorrencia_naturezas FOR INSERT TO sentinela_pcdf_sbx_importer
 WITH CHECK(origem='importacao' AND classificacao_status='pendente' AND mapeamento_id IS NULL
 AND EXISTS(SELECT FROM sentinela.ocorrencias o WHERE o.id=ocorrencia_id)
 AND EXISTS(SELECT FROM sentinela.linhas_origem l WHERE l.id=ocorrencia_naturezas.linha_origem_id));
CREATE POLICY pcdf_promotion_audit ON sentinela.eventos_auditoria FOR INSERT TO sentinela_pcdf_sbx_importer
 WITH CHECK(ator_tipo='servico' AND servico='pcdf-sandbox' AND acao='consolidacao_pcdf'
 AND EXISTS(SELECT FROM sentinela.execucoes_importacao e WHERE e.id=execucao_id)
 AND ocorrencia_id IS NULL AND linha_origem_id IS NULL AND pendencia_id IS NULL AND correcao_id IS NULL);

CREATE FUNCTION sentinela_pcdf_lab.promote(p_run uuid,p_subject uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  created_occurrences bigint;
  created_associations bigint;
  linked_rows bigint;
  row_count bigint;
  plan jsonb;
  summary jsonb;
BEGIN
  IF current_user<>'sentinela_pcdf_sbx_importer' OR current_database()<>'sentinela_rls_sandbox'
    OR inet_server_port()<>55432 OR host(inet_server_addr())<>'127.0.0.1'
  THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Disposable PCDF promotion only'; END IF;
  -- Serialize canonical creation even across distinct deliveries of the same candidate.
  PERFORM pg_advisory_xact_lock(hashtextextended('pcdf-sandbox:promotion',0));
  SELECT linhas_lidas INTO row_count FROM sentinela.execucoes_importacao
    WHERE id=p_run AND status='concluida';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Import run unavailable'; END IF;

  WITH source AS MATERIALIZED (
    SELECT s.linha_origem_id, a.identity, a.evidence, n.id AS nature,
      (s.derivados_efetivos->>'crime_tentado')::boolean AS attempted,
      (s.derivados_efetivos->>'data')::date AS day,
      coalesce(corrected.hour,s.derivados_efetivos->>'horario')::time(0) AS happened_at,
      coalesce(corrected.place,nullif(btrim(s.campos_csv->>'local'),'')) AS place,
      coalesce(corrected.caught,s.derivados_efetivos->>'flagrante')::boolean AS caught,
      nullif(btrim(s.campos_csv->>'unidade_apuracao'),'') AS investigation_unit,
      s.diagnosticos, linked.id AS existing_link,
      jsonb_build_array(s.campos_csv->>'data_inicio_fato_original',s.campos_csv->>'ra_original',
        s.campos_csv->>'area_endereco_original',s.campos_csv->>'quadra_endereco_original',
        s.derivados_efetivos->'coordenadas_candidatas') AS source_context
    FROM sentinela.linhas_staging s
    JOIN sentinela_pcdf_lab.approved_groups a ON a.run_id=s.execucao_id
      AND a.identity=s.derivados_efetivos->'candidate'
    LEFT JOIN sentinela.naturezas_criminais n ON n.fonte='PCDF-SANDBOX'
      AND n.descricao_original COLLATE "C"=(s.campos_csv->>'natureza_original')
      AND n.categoria_pcdf_original IS NULL
    LEFT JOIN sentinela.ocorrencia_naturezas linked ON linked.linha_origem_id=s.linha_origem_id
    LEFT JOIN LATERAL (
      SELECT max(d.normalized_value) FILTER(WHERE p.regra='horario_ausente_ou_invalido') AS hour,
        max(d.normalized_value) FILTER(WHERE p.regra='endereco_ausente') AS place,
        max(d.normalized_value) FILTER(WHERE p.regra='valor_policial_desconhecido' AND p.campo='flagrante') AS caught
      FROM sentinela.pendencias_revisao p JOIN sentinela_pcdf_lab.review_decisions d ON d.issue_id=p.id
      WHERE p.linha_origem_id=s.linha_origem_id AND d.decision='resolvida'
    ) corrected ON true
    WHERE s.execucao_id=p_run
  ), competing AS MATERIALIZED (
    SELECT raw.identity, other.execucao_id
    FROM sentinela.linhas_staging other
    CROSS JOIN LATERAL (SELECT other.derivados_efetivos->'candidate' AS identity) raw
    WHERE jsonb_typeof(raw.identity)='array'
    GROUP BY raw.identity,other.execucao_id
  ), eligible AS MATERIALIZED (
    SELECT gen_random_uuid() AS occurrence, s.identity,min(s.evidence) AS evidence,
      min(s.day) AS day,min(s.happened_at) AS happened_at,min(s.place) AS place,
      bool_or(s.caught) AS caught,min(s.investigation_unit) AS investigation_unit,
      jsonb_agg(jsonb_build_object('origin',s.linha_origem_id,'nature',s.nature,
        'attempted',s.attempted)) AS links
    FROM source s
    WHERE NOT EXISTS (
      SELECT FROM sentinela.ocorrencias o WHERE o.fonte='PCDF-SANDBOX'
      AND (btrim(o.ano_registro),btrim(o.unidade_registro),btrim(o.numero_registro))
        =(btrim(s.identity->>0),btrim(s.identity->>1),btrim(s.identity->>2))
    ) AND NOT EXISTS (
      SELECT FROM competing c WHERE (c.execucao_id<>p_run OR c.identity<>s.identity)
      AND (btrim(c.identity->>0),btrim(c.identity->>1),btrim(c.identity->>2))
        =(btrim(s.identity->>0),btrim(s.identity->>1),btrim(s.identity->>2))
    )
    GROUP BY s.identity
    HAVING count(DISTINCT jsonb_build_array(s.day,s.happened_at,s.place,s.caught,s.investigation_unit,s.source_context))=1
      AND bool_and(s.day IS NOT NULL AND s.nature IS NOT NULL AND s.existing_link IS NULL
        AND NOT jsonb_path_exists(s.diagnosticos,'$[*] ? (@.effect == "bloqueia_consolidacao")'))
  )
  SELECT coalesce(jsonb_agg(to_jsonb(eligible)),'[]') INTO plan FROM eligible;

  INSERT INTO sentinela.ocorrencias(id,origem,fonte,ano_registro,unidade_registro,numero_registro,
    versao_identidade,identidade_status,evidencia_identidade,data_fato,horario_fato,local,flagrante,
    unidade_apuracao,consolidacao_status)
  SELECT occurrence,'importacao','PCDF-SANDBOX',identity->>0,identity->>1,identity->>2,
    'pcdf-sandbox-tuple-v1','homologada',evidence,day,happened_at,place,caught,
    investigation_unit,'consolidada'
  FROM jsonb_to_recordset(plan) p(occurrence uuid,identity jsonb,evidence text,day date,
    happened_at time,place text,caught boolean,investigation_unit text);
  GET DIAGNOSTICS created_occurrences=ROW_COUNT;
  INSERT INTO sentinela.ocorrencia_naturezas(ocorrencia_id,natureza_id,origem,linha_origem_id,crime_tentado)
  SELECT p.occurrence,l.nature,'importacao',l.origin,l.attempted
  FROM jsonb_to_recordset(plan) p(occurrence uuid,links jsonb)
  CROSS JOIN LATERAL jsonb_to_recordset(p.links) l(origin uuid,nature uuid,attempted boolean);
  GET DIAGNOSTICS created_associations=ROW_COUNT;

  SELECT count(*) INTO linked_rows FROM sentinela.linhas_staging s
    JOIN sentinela.ocorrencia_naturezas a ON a.linha_origem_id=s.linha_origem_id
    WHERE s.execucao_id=p_run;
  summary := jsonb_build_object('run',p_run,'rows',row_count,'consolidated',linked_rows,
    'pending',row_count-linked_rows,'occurrencesCreated',created_occurrences,'associationsCreated',created_associations);
  IF created_occurrences>0 THEN
    INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,execucao_id,depois,justificativa)
    VALUES('servico','pcdf-sandbox','consolidacao_pcdf',p_run,
      summary || jsonb_strip_nulls(jsonb_build_object('subject',p_subject)),
      'Identidade sintética com evidência e descrição original PCDF');
  END IF;
  RETURN summary;
END $$;
REVOKE ALL ON FUNCTION sentinela_pcdf_lab.promote(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_lab.promote(uuid,uuid) TO sentinela_pcdf_sbx_importer;
COMMIT;
