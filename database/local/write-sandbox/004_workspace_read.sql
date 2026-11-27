-- Disposable cluster only. The workspace projects synthetic records under RLS.
\ir ../sandbox/sql/guard.sql
BEGIN;
SET LOCAL search_path=pg_catalog;
CREATE POLICY workspace_retirement_read ON sentinela_write_lab.retirements FOR SELECT TO sentinela_sbx_mutator
  USING(session_user='sentinela_sbx_analyst');
CREATE FUNCTION sentinela_write_lab.list_workspace() RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object(
    'id',o.id,'versao',o.versao::text,'ativo',o.ativo,
    'elegivel',o.ativo AND o.origem='manual' AND o.consolidacao_status='consolidada'
      AND o.identidade_status='manual' AND o.localizacao_status='referencia_pendente'
      AND NOT EXISTS(SELECT FROM sentinela.pendencias_revisao p WHERE p.ocorrencia_id=o.id
        AND p.status NOT IN ('resolvida','encerrada_sem_solucao')),
    'local',o.local,'endereco',v.address,'bairro',v.district,'data',o.data_fato::text,'horario',o.horario_fato::text,
    'ra',o.ra_id,'latitude',o.latitude,'longitude',o.longitude,
    'naturezas',coalesce((SELECT jsonb_agg(jsonb_build_object('naturezaId',a.natureza_id,'crimeTentado',a.crime_tentado) ORDER BY a.id)
      FROM sentinela.ocorrencia_naturezas a WHERE a.ocorrencia_id=o.id
      AND NOT EXISTS(SELECT FROM sentinela_write_lab.retirements r WHERE r.association_id=a.id)),'[]'::jsonb))
  FROM sentinela.ocorrencias o
  LEFT JOIN sentinela_write_lab.occurrence_versions v ON v.occurrence_id=o.id AND v.version=o.versao
  WHERE session_user='sentinela_sbx_analyst' AND o.fonte='SENTINELA_WRITE_SANDBOX_V1'
  ORDER BY o.criado_em DESC,o.id LIMIT 100;
$$;
ALTER FUNCTION sentinela_write_lab.list_workspace() OWNER TO sentinela_sbx_mutator;
REVOKE ALL ON FUNCTION sentinela_write_lab.list_workspace() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_write_lab.list_workspace() TO sentinela_sbx_analyst;
COMMIT;
