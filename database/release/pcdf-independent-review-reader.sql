-- Incluído pela transação de homologação. Conserva proprietários, ACLs e visibilidade do leitor.
CREATE FUNCTION sentinela_pcdf_revisao.motivo(campo text,regra text,tipo text,status text,motivo text,raw jsonb)
RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog AS $fn$
 SELECT CASE
   WHEN status='resolvida' THEN 'Resolvida. '||motivo
   WHEN status='encerrada_sem_solucao' THEN 'Encerrada após revisão. '||motivo
   WHEN tipo='identificacao' THEN 'Revisão humana da identidade policial. '||motivo
   WHEN tipo='datas_horarios' THEN 'Aviso temporal. O valor inconsistente não integra a dimensão correspondente. '||motivo
   WHEN campo='coordenada_status' AND regra NOT IN ('revisao_utm_sem_geo','coordenada_status_divergente')
     AND NOT starts_with(regra,'utm_')
     THEN CASE sentinela_pcdf_revisao.estado_geo(raw->>'latitude_geo_original',raw->>'longitude_geo_original')
       WHEN 'ausente' THEN 'Localização GEO pendente. Latitude e longitude ausentes na origem.'
       WHEN 'incompleta' THEN 'Localização GEO pendente. O par de latitude e longitude está incompleto.'
       WHEN 'invalida' THEN 'Localização GEO pendente. Há um valor inválido no par original.'
       ELSE 'Localização GEO pendente. O par aguarda confirmação da referência espacial.' END
   WHEN campo IN ('latitude_geo_original','longitude_geo_original') THEN 'Revisão da localização GEO. '||motivo
   WHEN tipo='coordenadas' THEN 'Aviso sobre coordenadas de origem. '||motivo
   WHEN tipo='classificacao' THEN 'Aviso de natureza de origem. '||motivo
   WHEN tipo='endereco_ra' THEN 'Aviso de endereço ou referência territorial. '||motivo
   ELSE 'Aviso de qualidade. '||motivo END
$fn$;
REVOKE ALL ON FUNCTION sentinela_pcdf_revisao.motivo(text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sentinela_pcdf_revisao.motivo(text,text,text,text,text,jsonb) TO sentinela_ocorrencias_reader;

DO $reader$
DECLARE importados text := pg_get_viewdef('sentinela_ocorrencias_local.importados'::regclass,true);
 detalhe text := pg_get_functiondef('sentinela_ocorrencias_local.detalhe(text,uuid)'::regprocedure);
 old_state text := 's.estado AS situacao';
 old_reason text := $$'motivo',p.motivo$$;
 old_geo text := $$'localizacaoStatus',o.localizacao_status$$;
BEGIN
 IF strpos(importados,old_state)=0 OR strpos(detalhe,old_reason)=0 OR strpos(detalhe,old_geo)=0
 THEN RAISE EXCEPTION 'Leitor de ocorrencias divergente'; END IF;

 importados := replace(importados,old_state,$$CASE
   WHEN EXISTS(SELECT FROM sentinela.ocorrencia_naturezas a WHERE a.linha_origem_id=s.linha_origem_id)
     THEN 'consolidada'
   WHEN l.id='84908630-bd04-4a03-923d-616649c8de74' THEN 'recebida'
   ELSE s.estado END AS situacao$$);

 detalhe := replace(detalhe,old_reason,$$'motivo',CASE WHEN i.lote='84908630-bd04-4a03-923d-616649c8de74'
   OR s.derivados_efetivos ? 'geo' THEN sentinela_pcdf_revisao.motivo(p.campo,p.regra,p.tipo,p.status,p.motivo,s.campos_csv)
   ELSE p.motivo END$$);
 detalhe := replace(detalhe,old_geo,$$'localizacaoStatus',CASE WHEN o.versao_identidade='pcdf-tupla-conferida-v1' THEN
   CASE o.localizacao_status WHEN 'validada' THEN 'Localização GEO validada'
     WHEN 'ausente' THEN 'Localização GEO pendente. Coordenadas ausentes.'
     WHEN 'divergente' THEN 'Localização GEO pendente. Coordenadas divergentes.'
     WHEN 'invalida' THEN 'Localização GEO pendente. Coordenadas inválidas.'
     ELSE 'Localização GEO pendente. Referência, par ou validação territorial em revisão.' END
   ELSE o.localizacao_status END$$);

 EXECUTE 'CREATE OR REPLACE VIEW sentinela_ocorrencias_local.importados WITH (security_invoker=true) AS '||importados;
 EXECUTE detalhe;
END $reader$;
