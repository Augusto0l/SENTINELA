-- 0021 - Reversao compensatoria da 0020 (classificacao PCDF v2). PENDENTE: aplicar somente com autorizacao expressa.
-- Pre-requisito: nenhuma associacao classificada por versao v2 (use antes sentinela_classificacao.reverter_lote em cada lote).
-- Restaura, com o texto vivo de producao capturado antes da 0020, os dois gatilhos de bloqueio e as tres funcoes de
-- Ocorrencias; retira privilegios e policies do dono, remove o schema sentinela_classificacao e o papel dono.
-- Preserva: auditoria, historico_correcoes, pendencias e as linhas da proposta v2 (pendentes e inertes), que sao
-- imutaveis por desenho. Uma nova instalacao da classificacao exige migration nova (a 0020 recusa catalogo v2 existente).
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  IF NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao = '0020')
     OR EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao = '0021') THEN
    RAISE EXCEPTION '0021 exige a 0020 aplicada e ainda nao revertida.';
  END IF;
  IF EXISTS (SELECT FROM sentinela.ocorrencia_naturezas a JOIN sentinela.mapeamentos_natureza m ON m.id = a.mapeamento_id
             WHERE m.versao LIKE 'pcdf-classificacao-v2%') THEN
    RAISE EXCEPTION 'Ha associacoes classificadas pela v2: reverta os lotes antes da 0021.';
  END IF;
END $pre$;

-- Live definitions captured from production (owner: migrator) before 0020.
CREATE OR REPLACE FUNCTION sentinela.bloquear_correcao_sem_backend()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF current_user='sentinela_revisao_owner' THEN
    IF TG_TABLE_SCHEMA='sentinela' AND sentinela_revisao.ator(true) IS NOT NULL
      AND (TG_OP='UPDATE' AND TG_TABLE_NAME IN ('pendencias_revisao','linhas_staging')
        OR TG_OP='INSERT' AND TG_TABLE_NAME='historico_correcoes') THEN RETURN NULL; END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION sentinela.bloquear_autoria_manual_sem_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF TG_TABLE_NAME='pendencias_revisao' THEN
    IF NEW.status<>'aberta' OR NEW.responsavel_id IS NOT NULL THEN
      RAISE EXCEPTION 'Atribuicao/decisao manual depende de Auth real.' USING ERRCODE='42501';
    END IF;
  ELSIF NEW.ator_tipo='usuario' THEN
    IF current_user='sentinela_revisao_owner' THEN
      IF TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='eventos_auditoria'
        AND NEW.acao='pendencia.revisada' AND NEW.usuario_id=sentinela_revisao.ator(true)
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
END $function$;

SET LOCAL ROLE sentinela_ocorrencias_reader;
CREATE OR REPLACE FUNCTION sentinela_ocorrencias_local.detalhe(modo text, registro uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
          'classificacao',a.classificacao_status,'crimeTentado',a.crime_tentado) ORDER BY a.id)
        FROM sentinela.ocorrencia_naturezas a JOIN sentinela.naturezas_criminais n ON n.id=a.natureza_id
        WHERE a.ocorrencia_id=o.id),'[]'::jsonb))
      FROM sentinela_ocorrencias_local.consolidadas c JOIN sentinela.ocorrencias o ON o.id=c.id WHERE o.id=registro);
  END IF;
  RAISE EXCEPTION USING ERRCODE='22023';
END
$function$;

CREATE OR REPLACE FUNCTION sentinela_ocorrencias_local.lista(modo text, filtros jsonb, pagina integer, ordenar text, direcao text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION sentinela_ocorrencias_local.resumo()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
$function$;
RESET ROLE;

-- Privileges granted to the owner are revoked by the grantor recorded in each ACL; its policies outside its schema are
-- dropped by the table owner. The schema (owned by the migrator) then goes with every object inside it.
DO $revogar$
DECLARE r record; dono oid := 'sentinela_classificacao_owner'::regrole; proprio oid := 'sentinela_classificacao'::regnamespace;
BEGIN
  FOR r IN
    SELECT format('REVOKE ALL ON TABLE %s FROM sentinela_classificacao_owner', c.oid::regclass) AS cmd, a.grantor
      FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE a.grantee = dono AND c.relnamespace <> proprio
    UNION
    SELECT format('REVOKE ALL (%I) ON TABLE %s FROM sentinela_classificacao_owner', t.attname, c.oid::regclass), a.grantor
      FROM pg_attribute t JOIN pg_class c ON c.oid = t.attrelid CROSS JOIN LATERAL aclexplode(t.attacl) a
     WHERE a.grantee = dono AND c.relnamespace <> proprio
    UNION
    SELECT format('REVOKE ALL ON FUNCTION %s FROM sentinela_classificacao_owner', f.oid::regprocedure), a.grantor
      FROM pg_proc f CROSS JOIN LATERAL aclexplode(f.proacl) a WHERE a.grantee = dono AND f.pronamespace <> proprio
    UNION
    SELECT format('REVOKE ALL ON SCHEMA %I FROM sentinela_classificacao_owner', n.nspname), a.grantor
      FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a WHERE a.grantee = dono AND n.oid <> proprio
  LOOP
    EXECUTE format('SET LOCAL ROLE %I', r.grantor::regrole);
    EXECUTE r.cmd;
    RESET ROLE;
  END LOOP;
  FOR r IN
    SELECT p.policyname, c.oid::regclass AS tabela, c.relowner
      FROM pg_policies p JOIN pg_class c ON c.oid = format('%I.%I', p.schemaname, p.tablename)::regclass
     WHERE 'sentinela_classificacao_owner' = ANY (p.roles) AND p.schemaname <> 'sentinela_classificacao'
  LOOP
    EXECUTE format('SET LOCAL ROLE %I', r.relowner::regrole);
    EXECUTE format('DROP POLICY %I ON %s', r.policyname, r.tabela);
    RESET ROLE;
  END LOOP;
END $revogar$;
DROP SCHEMA sentinela_classificacao CASCADE;
REVOKE sentinela_classificacao_owner FROM CURRENT_USER;
DROP ROLE sentinela_classificacao_owner;

DO $post$
BEGIN
  IF EXISTS (SELECT FROM pg_namespace WHERE nspname = 'sentinela_classificacao')
     OR EXISTS (SELECT FROM pg_roles WHERE rolname = 'sentinela_classificacao_owner')
     OR EXISTS (SELECT FROM pg_policies WHERE schemaname = 'sentinela' AND policyname LIKE 'classificacao_%')
     OR (SELECT count(*) FROM pg_class WHERE relnamespace = 'sentinela'::regnamespace AND relkind = 'r' AND relrowsecurity AND relforcerowsecurity) <> 19 THEN
    RAISE EXCEPTION 'Pos-condicoes da 0021 divergentes.';
  END IF;
END $post$;
INSERT INTO sentinela.schema_migrations VALUES ('0021','Reversao compensatoria da 0020 (classificacao PCDF v2)',DEFAULT);
COMMIT;
