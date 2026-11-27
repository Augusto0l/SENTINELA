"""Render the qualified import algorithms for the attested PCDF v1/general installation."""

from argparse import ArgumentParser
from hashlib import sha256
from pathlib import Path
import re

RELEASE = Path(__file__).resolve().parent
SHARED = RELEASE.parent / "local/pcdf-sandbox"
BASELINE = RELEASE.parent / "supabase/baseline/0001_modelo_inicial.sql"


def read(name):
    return (SHARED / name).read_text(encoding="utf-8")


def between(source, start, end):
    if source.count(start) != 1 or source.count(end) != 1:
        raise ValueError(f"Definicao divergente: {start}")
    return source[source.index(start):source.index(end, source.index(start))].rstrip() + "\n"


def replace(source, old, new):
    if source.count(old) != 1:
        raise ValueError(f"Definicao divergente: {old}")
    return source.replace(old, new)


def remove_section(source, start, end):
    return replace(source, between(source, start, end).rstrip() + "\n", "")


def guard_signatures(source):
    names = ("impedir_mutacao", "bloquear_correcao_sem_backend", "bloquear_autoria_manual_sem_auth")
    fingerprints = []
    for name in names:
        body = source.split(f"FUNCTION sentinela.{name}()", 1)[1].split("$$", 2)[1]
        digest = sha256(re.sub(r"\s+", "", body).encode()).hexdigest()
        fingerprints.append(f"('sentinela.{name}()'::regprocedure,'{digest}')")
    return ",\n      ".join(fingerprints)


MANUAL_RELEASE = RELEASE / "manual-occurrences-operational.psql.in"


def manual_guard_bodies():
    """Guard bodies installed by local-manual-0004, read from its reviewed template."""
    source = MANUAL_RELEASE.read_text(encoding="utf-8")
    digests = {}
    for name in ("bloquear_correcao_sem_backend", "bloquear_autoria_manual_sem_auth"):
        start = f"CREATE OR REPLACE FUNCTION sentinela.{name}()"
        if source.count(start) != 1:
            raise ValueError(f"Definicao manual divergente: {name}")
        body = source.split(start, 1)[1].split("$function$", 2)[1]
        digests[name] = sha256(re.sub(r"\s+", "", body).encode()).hexdigest()
    return digests


def validate_installed_guards(signatures):
    """Accept the local-manual-0004 bodies only while that reviewed migration is active."""
    manual = manual_guard_bodies()
    rows = []
    for name, expected in re.findall(r"'sentinela\.(\w+)\(\)'::regprocedure,'([0-9a-f]{64})'", signatures):
        rows.append(f"('sentinela.{name}()'::regprocedure,'{expected}','{manual.get(name, expected)}')")
    if len(rows) != 3:
        raise ValueError("Assinaturas de guarda incompletas")
    return f"""EXISTS (SELECT FROM (VALUES {",".join(rows)}) AS esperado(func,importacao,manual)
    JOIN pg_proc p ON p.oid=esperado.func
    CROSS JOIN (SELECT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='local-manual-0004')
      AND NOT EXISTS (SELECT FROM sentinela.schema_migrations WHERE versao='local-manual-0004-revertida') AS ativa) m
    WHERE CASE WHEN m.ativa THEN esperado.manual ELSE esperado.importacao END IS DISTINCT FROM
        encode(sha256(convert_to(regexp_replace(p.prosrc,'[[:space:]]+','','g'),'UTF8')),'hex'))"""


def validate_guards(signatures):
    return f"""EXISTS (SELECT FROM (VALUES {signatures}) AS esperado(func,hash)
    JOIN pg_proc p ON p.oid=esperado.func WHERE esperado.hash IS DISTINCT FROM
        encode(sha256(convert_to(regexp_replace(p.prosrc,'[[:space:]]+','','g'),'UTF8')),'hex'))"""


def preflight(port, fingerprint):
    return rf"""
\set ON_ERROR_STOP on
\if :{{?check_only}}
\else
\set check_only on
\endif
SELECT :'check_only'::boolean AS check_only
\gset
\if :check_only
BEGIN READ ONLY;
\else
BEGIN;
\endif
SET LOCAL search_path=pg_catalog,pg_temp;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT set_config('sentinela.release_cluster', :'cluster_uuid', true) AS expected_cluster,
       set_config('sentinela.release_system', :'system_id', true) AS expected_system,
       set_config('sentinela.release_artifact', '{fingerprint}', true) AS expected_artifact
\gset
DO $destino$
BEGIN
 IF current_database()<>'sentinela_pcdf_local' OR inet_server_addr() IS DISTINCT FROM inet '127.0.0.1'
 OR inet_server_port() IS DISTINCT FROM {port} OR pg_is_in_recovery()
 OR current_setting('server_version_num')<>'170011'
 OR NOT EXISTS (SELECT FROM pg_extension WHERE extname='postgis' AND extversion='3.6.2')
 OR current_setting('sentinela.release_cluster')='' OR current_setting('sentinela.sandbox_uuid',true)
    IS DISTINCT FROM current_setting('sentinela.release_cluster')
 OR (SELECT system_identifier::text FROM pg_control_system()) IS DISTINCT FROM current_setting('sentinela.release_system')
 OR to_regclass('sentinela_import_local.requests') IS NULL
 OR to_regprocedure('sentinela_ocorrencias_local.identidade()') IS NULL
 OR to_regprocedure('sentinela_pcdf_local.history()') IS NULL
 OR to_regclass('sentinela_pcdf_local.entregas_pacote') IS NOT NULL
 OR (to_regnamespace('sentinela_ocorrencias_manual') IS NOT NULL AND (to_regclass('sentinela_gestao_autorizacao.release') IS NULL
    OR (SELECT count(*) FROM sentinela.schema_migrations WHERE versao IN
       ('local-manual-0001','local-manual-0002','local-manual-0003'))<>3))
 OR (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace
    AND relkind='r' AND relrowsecurity AND relforcerowsecurity)<>19
 THEN RAISE EXCEPTION 'Bootstrap, destino ou RLS da gestao operacional divergente'; END IF;
END
$destino$;
\if :check_only
\else
DO $lock$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('local-import-management-0001',0));
END
$lock$;
\endif
SELECT to_regclass('sentinela_gestao_autorizacao.release') IS NOT NULL AS instalado
\gset
"""


def bootstrap_check(integrity):
    signatures = guard_signatures(BASELINE.read_text(encoding="utf-8"))
    fk_query = integrity.split("$$", 2)[1].strip()
    return rf"""
SELECT set_config('sentinela.release_reader', :'reader_md5', true) AS expected_reader
\gset
DO $bootstrap$
DECLARE leitor regprocedure:=to_regprocedure('sentinela_ocorrencias_local.lista(text,jsonb,integer,text,text)');
BEGIN
 IF leitor IS NULL OR md5(pg_get_functiondef(leitor)) IS DISTINCT FROM current_setting('sentinela.release_reader')
 OR NOT EXISTS (SELECT FROM pg_proc WHERE oid=leitor AND prosecdef AND proowner='sentinela_ocorrencias_reader'::regrole)
 OR EXISTS(SELECT FROM pg_namespace WHERE nspname IN ('sentinela_gestao','sentinela_exclusao','sentinela_gestao_autorizacao'))
 OR {validate_guards(signatures)}
 OR EXISTS (SELECT FROM ({fk_query}) AS divergencias)
 THEN RAISE EXCEPTION 'Bootstrap, reader, gatilhos ou FKs da gestao operacional divergentes'; END IF;
END
$bootstrap$;
"""


def management():
    base = read("0002_occurrence_management_synthetic.sql")
    editing = read("0003_occurrence_editing_synthetic.sql")
    roles = between(base, "CREATE ROLE sentinela_gestao_owner", "-- The operational readers")
    for line in (
        "GRANT USAGE ON SCHEMA extensions TO sentinela_local_admin,sentinela_local_operator;\n",
        "GRANT UPDATE (data_fato,horario_fato,ativo) ON sentinela.ocorrencias TO sentinela_gestao_owner;\n",
        "GRANT SELECT (ocorrencia_id) ON sentinela_ocorrencias_manual.cadastros TO sentinela_gestao_owner;\n",
        "GRANT SELECT (digest,nomes,execucao_id) ON sentinela_pcdf_local.entregas_pacote TO sentinela_gestao_owner;\n",
        "CREATE POLICY gestao_cadastros ON sentinela_ocorrencias_manual.cadastros FOR SELECT TO sentinela_gestao_owner USING (true);\n",
        "CREATE POLICY gestao_custodia ON sentinela_pcdf_local.entregas_pacote FOR SELECT TO sentinela_gestao_owner USING (true);\n",
    ):
        roles = replace(roles, line, "")
    roles = replace(roles, "sentinela,extensions,sentinela_pcdf_local,sentinela_ocorrencias_manual", "sentinela")
    roles = replace(roles, "ator_tipo,servico,acao", "id,ator_tipo,usuario_id,acao")
    roles = replace(roles, "id,acao,servico,depois,registrado_em", "id,acao,ator_tipo,servico,depois,registrado_em")
    roles = replace(roles, """CREATE POLICY gestao_lote ON sentinela.lotes_importacao FOR SELECT TO sentinela_gestao_owner
 USING (EXISTS(SELECT FROM sentinela.extracoes_origem x WHERE x.id=extracao_id));""",
                    """CREATE POLICY gestao_lote ON sentinela.lotes_importacao FOR SELECT TO sentinela_gestao_owner
 USING (EXISTS(SELECT FROM sentinela.extracoes_origem x WHERE x.id=extracao_id
  AND (x.fonte,lotes_importacao.versao_contrato) IN (('PCDF','1.0'),('IMPORTACAO-GERAL-LOCAL','geral-v1'))));""")
    roles = remove_section(roles, "CREATE POLICY gestao_ocorrencia_update", "CREATE POLICY gestao_naturezas")
    roles = replace(roles, "USING (servico IN ('pcdf-local','importacao-geral-local','ocorrencias-gestao-local'));",
                    "USING (servico IN ('pcdf-local','importacao-geral-local') OR (ator_tipo='usuario' AND acao='corrigir_associacao' AND depois->>'operacao'='gestao-importacao'));")
    roles = remove_section(roles, "CREATE POLICY gestao_audit_write", "CREATE INDEX gestao_correcao_staging_idx")
    roles += """
GRANT USAGE ON SCHEMA sentinela_gestao_autorizacao TO sentinela_gestao_owner,sentinela_local_admin;
GRANT EXECUTE ON FUNCTION sentinela_gestao_autorizacao.capacidade(uuid,text)
 TO sentinela_gestao_owner,sentinela_local_admin;
GRANT EXECUTE ON FUNCTION sentinela_gestao_autorizacao.exigir(uuid,text) TO sentinela_gestao_owner;
CREATE POLICY gestao_audit_write ON sentinela.eventos_auditoria FOR INSERT TO sentinela_gestao_owner
 WITH CHECK (ator_tipo='usuario' AND acao='corrigir_associacao' AND depois->>'operacao'='gestao-importacao'
   AND sentinela_gestao_autorizacao.capacidade(usuario_id,depois->>'conta'));
"""
    projection = between(base, "CREATE OR REPLACE VIEW sentinela_ocorrencias_local.importados", "-- Pending issues")
    projection = replace(projection, "c ON true\n WHERE NOT EXISTS(SELECT FROM sentinela_gestao.inativacoes i WHERE i.lote_id=s.lote_id OR i.staging_id=s.id);", "c ON true;")
    bodies = between(base, "SET LOCAL ROLE sentinela_gestao_owner;", "CREATE FUNCTION sentinela_gestao.mutar(")
    bodies = replace(bodies, "CASE WHEN i.auditoria_id IS NOT NULL THEN 'inativada'\n WHEN e.status", "CASE WHEN e.status")
    bodies = replace(bodies, "\n LEFT JOIN sentinela_gestao.inativacoes i ON i.lote_id=l.id;", ";")
    inactive = "  AND NOT EXISTS(SELECT FROM sentinela_gestao.inativacoes i WHERE i.lote_id=s.lote_id OR i.staging_id=s.id)\n"
    if bodies.count(inactive) != 2:
        raise ValueError("Filtro sintetico de inativacao divergente")
    bodies = bodies.replace(inactive, "")
    bodies = replace(bodies, " AND NOT EXISTS(SELECT FROM sentinela_gestao.inativacoes i WHERE i.lote_id=s.lote_id OR i.staging_id=s.id)\n$$;", "\n$$;")
    bodies = replace(bodies, "\n    AND NOT EXISTS(SELECT FROM sentinela_gestao.inativacoes i WHERE i.staging_id=a.id)),", "),")
    bodies = replace(bodies, between(bodies, " 'pacote',(SELECT", " 'tentativas'"), " 'pacote',NULL,\n")
    body_without_manual = bodies[:bodies.index(" RETURN (SELECT jsonb_build_object('id',o.id")]
    bodies = body_without_manual + " RETURN NULL;\nEND $$;\n"
    context = between(editing, "CREATE FUNCTION sentinela_gestao.contexto", "CREATE FUNCTION sentinela_gestao.editar_manual")
    context = replace(context, between(context, " IF area='manuais'", "  RETURN resultado||jsonb_build_object"), " IF area='importados' THEN\n")
    context = replace(context, "'responsavel',h.depois->>'login'", "'responsavel',h.usuario_id::text")
    context = replace(context, "'inativar',NOT (a.alvo->>'bloqueiaConsolidacao')::boolean", "'inativar',false")

    qualified = between(base, "CREATE FUNCTION sentinela_gestao.mutar", "CREATE FUNCTION sentinela_gestao.verificar_evento")
    correction = between(qualified, "  contexto:=sentinela_gestao.alvo('importados'", " ELSE\n  contexto:=sentinela_gestao.alvo")
    correction = replace(correction, "   OR (operacao='inativar_associacao' AND (contexto->>'bloqueiaConsolidacao')::boolean)\n   OR (operacao='corrigir_associacao' AND NOT (contexto->>'editavel')::boolean)",
                         "   OR (contexto->>'editavel')::boolean IS DISTINCT FROM true")
    correction = replace(correction, "IF operacao='corrigir_associacao' AND p?'lote' AND", "IF p?'lote' AND")
    correction = replace(correction, "  IF operacao='corrigir_associacao' THEN\n", "")
    if not correction.endswith("  END IF;\n"):
        raise ValueError("Validacao de correcao divergente")
    correction = correction.removesuffix("  END IF;\n")
    writer = """
CREATE FUNCTION sentinela_gestao.mutar(p jsonb,p_conta text,p_usuario uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE alvo uuid:=(p->>'id')::uuid; motivo text:=btrim(p->>'justificativa');
 auditoria uuid:=gen_random_uuid(); contexto jsonb; antes jsonb; depois jsonb; alteracoes jsonb;
 staging sentinela.linhas_staging;
BEGIN
 PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,p_conta);
 IF p->>'acao' IS DISTINCT FROM 'corrigir_associacao' OR alvo IS NULL
    OR jsonb_typeof(p->'justificativa') IS DISTINCT FROM 'string'
    OR NOT coalesce(length(motivo) BETWEEN 1 AND 500,false)
 THEN RAISE EXCEPTION USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sentinela-pcdf-local-v1',0));
""" + correction + """
 INSERT INTO sentinela.eventos_auditoria(id,ator_tipo,usuario_id,acao,linha_origem_id,execucao_id,antes,depois,justificativa,request_id)
 VALUES(auditoria,'usuario',p_usuario,'corrigir_associacao',staging.linha_origem_id,staging.execucao_id,
  antes,depois||jsonb_build_object('operacao','gestao-importacao','conta',p_conta),motivo,auditoria::text);
 RETURN jsonb_build_object('id',alvo,'auditoria',auditoria);
END $$;
RESET ROLE;
GRANT EXECUTE ON FUNCTION sentinela_gestao.arquivos(jsonb),sentinela_gestao.arquivo(uuid),
 sentinela_gestao.contexto(text,uuid),sentinela_gestao.acoes(text,jsonb),sentinela_gestao.mutar(jsonb,text,uuid)
 TO sentinela_local_admin;
"""
    result = roles + projection + bodies + context + writer
    result = result.replace("servico='ocorrencias-gestao-local'", "ator_tipo='usuario' AND depois->>'operacao'='gestao-importacao'")
    result = result.replace("e.ator_tipo='usuario' AND depois->>", "e.ator_tipo='usuario' AND e.depois->>")
    if any(name in result for name in ("sentinela_ocorrencias_manual.", "entregas_pacote", "sentinela_gestao.inativacoes", "'55488'")):
        raise ValueError("Dependencia sintetica na gestao operacional")
    return result


def purge(port):
    base = read("0005_import_purge_synthetic.sql")
    roles = between(base, "CREATE ROLE sentinela_exclusao_owner", "-- Keep UPDATE")
    roles = replace(roles, "sentinela,sentinela_gestao,sentinela_pcdf_local,sentinela_import_local",
                    "sentinela,sentinela_import_local,sentinela_gestao_autorizacao")
    roles = replace(roles, "'sentinela.historico_correcoes','sentinela.eventos_auditoria','sentinela_gestao.inativacoes',\n   'sentinela_import_local.requests','sentinela_pcdf_local.aprovacoes_pacote','sentinela_pcdf_local.entregas_pacote'",
                    "'sentinela.historico_correcoes','sentinela.eventos_auditoria','sentinela_import_local.requests'")
    roles = replace(roles, "GRANT SELECT (auditoria_id) ON sentinela_gestao.naturezas_inativadas TO sentinela_exclusao_owner;\n", "")
    roles = between(roles, "CREATE ROLE sentinela_exclusao_owner", "CREATE POLICY exclusao_naturezas_inativas")
    roles += """
GRANT EXECUTE ON FUNCTION sentinela_gestao_autorizacao.capacidade(uuid,text),
 sentinela_gestao_autorizacao.exigir(uuid,text),
 sentinela_gestao_autorizacao.lote_aprovado(uuid,uuid,text),
 sentinela_gestao_autorizacao.consumir(uuid,uuid,text,text) TO sentinela_exclusao_owner;
"""
    tables = between(base, "SET ROLE sentinela_exclusao_owner;", "CREATE FUNCTION sentinela_exclusao.exigir_ambiente")
    tables = replace(tables, "SET ROLE", "SET LOCAL ROLE")
    tables = replace(tables, "responsavel text NOT NULL CHECK (responsavel~'^[a-f0-9]{64}$')", "responsavel uuid NOT NULL")
    guard = between(base, "CREATE FUNCTION sentinela_exclusao.exigir_ambiente", "CREATE FUNCTION sentinela_exclusao.plano")
    guard = replace(guard, "'sentinela_gestao.inativacoes','sentinela_gestao.naturezas_inativadas','sentinela_import_local.requests',\n   'sentinela_pcdf_local.aprovacoes_pacote','sentinela_pcdf_local.entregas_pacote','sentinela_exclusao.comprovantes'",
                    "'sentinela_import_local.requests','sentinela_exclusao.comprovantes'")
    guard = replace(guard, "t WHERE NOT row_security_active(t))",
                    "t JOIN pg_class c ON c.oid=t WHERE NOT (row_security_active(t) AND c.relrowsecurity AND c.relforcerowsecurity))")
    plan = between(base, "CREATE FUNCTION sentinela_exclusao.plano", "CREATE FUNCTION sentinela_exclusao.previa")
    plan = replace(plan, "l.nome_arquivo,l.competencia,l.versao_contrato,l.extracao_id\n FROM sentinela.lotes_importacao l WHERE l.id=alvo",
                    """l.nome_arquivo,l.competencia,l.versao_contrato,l.extracao_id,x.fonte,l.sha256_arquivo,x.sha256_xml
 FROM sentinela.lotes_importacao l JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id WHERE l.id=alvo""")
    plan = replace(plan, "\n AND NOT EXISTS (SELECT FROM sentinela_gestao.inativacoes i WHERE i.lote_id=outro.lote_id OR i.staging_id=outro.id)", "")
    plan = replace(plan, between(plan, "), inativacoes AS MATERIALIZED (", "), recibos AS MATERIALIZED ("), "")
    plan = replace(plan, between(plan, "), entregas AS MATERIALIZED (", "), eventos_diretos AS MATERIALIZED ("), "")
    plan = replace(plan, "   OR a.id IN (SELECT id FROM inativacoes)\n", "")
    plan = replace(plan, between(plan, " UNION ALL SELECT 'historico_compartilhado',n.auditoria_id", "), escopo AS ("), """
 UNION ALL SELECT 'dependencia_desconhecida',v FROM sentinela_exclusao.vinculos_inesperados() v
 UNION ALL SELECT 'lote_protegido',id::text FROM lote WHERE fonte='PCDF' AND competencia=DATE '2021-01-01'
 UNION ALL SELECT 'dependencia_desconhecida','Contrato ou origem fora do escopo: '||versao_contrato FROM lote
  WHERE (fonte,versao_contrato) NOT IN (('PCDF','1.0'),('IMPORTACAO-GERAL-LOCAL','geral-v1'))
 UNION ALL SELECT 'historico_compartilhado',a.id::text
 FROM sentinela.eventos_auditoria a JOIN eventos e ON e.id=a.id
 WHERE (a.execucao_id IS NOT NULL AND a.execucao_id NOT IN (SELECT id FROM execucoes))
  OR (a.pendencia_id IS NOT NULL AND a.pendencia_id NOT IN (SELECT id FROM pendencias))
  OR (a.correcao_id IS NOT NULL AND a.correcao_id NOT IN (SELECT id FROM correcoes))
  OR (a.linha_origem_id IS NOT NULL AND a.linha_origem_id NOT IN (SELECT id FROM origens))
  OR (a.depois->>'loteId' IS NOT NULL AND a.depois->>'loteId'<>alvo::text)
  OR (a.depois->>'lot' IS NOT NULL AND a.depois->>'lot'<>alvo::text)
  OR (a.depois->>'run' IS NOT NULL AND a.depois->>'run' NOT IN (SELECT id::text FROM execucoes))
  OR (a.depois->>'stagingId' IS NOT NULL AND a.depois->>'stagingId' NOT IN (SELECT id::text FROM staging))
 UNION ALL SELECT 'historico_compartilhado',r.request::text
 FROM sentinela_import_local.requests r CROSS JOIN lote l
 WHERE l.fonte='IMPORTACAO-GERAL-LOCAL'
  AND ((r.request IN (SELECT id FROM recibos) AND
       (r.receipt->>'lot' IS DISTINCT FROM alvo::text OR NOT EXISTS(SELECT FROM execucoes WHERE id::text=r.receipt->>'run')))
    OR (r.receipt IS NULL AND r.metadata->>'sheetKey'=l.sha256_xml))
 UNION ALL SELECT 'historico_compartilhado',a.id::text
 FROM sentinela.eventos_auditoria a CROSS JOIN lote l
 WHERE l.fonte='PCDF' AND a.servico='pcdf-local' AND a.acao='tentativa_pcdf'
  AND a.depois->>'sha256'=l.sha256_arquivo AND a.depois->>'month'=to_char(l.competencia,'YYYY-MM')
  AND a.id NOT IN (SELECT id FROM eventos)
  AND NOT EXISTS (SELECT FROM sentinela.eventos_auditoria b WHERE b.servico=a.servico AND b.request_id=a.request_id
     AND b.acao IN ('staging_pcdf','reenvio_pcdf'))
""")
    for group in ("inativacoes", "entregas", "aprovacoes"):
        plan = replace(plan, f" UNION ALL SELECT '{group}',id::text FROM " +
                       ("entregas" if group == "aprovacoes" else group) + "\n", "")
    plan = replace(plan, "'artefatos',(SELECT coalesce(sum(partes),0) FROM entregas)", "'artefatos',0")
    preview = between(base, "CREATE FUNCTION sentinela_exclusao.previa", "CREATE FUNCTION sentinela_exclusao.excluir")
    preview = replace(preview, "previa(alvo uuid)", "previa(alvo uuid,p_usuario uuid,p_conta text)")
    preview = replace(preview, " plano:=sentinela_exclusao.plano(alvo);", """ IF sentinela_gestao_autorizacao.capacidade(p_usuario,p_conta) IS DISTINCT FROM true
   THEN RAISE EXCEPTION USING ERRCODE='42501'; END IF;
 plano:=sentinela_exclusao.plano(alvo);""")
    preview = replace(preview, "'revisao',sentinela_exclusao.revisao(plano),'quantidades'", """'revisao',sentinela_exclusao.revisao(plano),
   'autorizada',sentinela_gestao_autorizacao.lote_aprovado(alvo,p_usuario,sentinela_exclusao.revisao(plano)),
   'quantidades'""")
    writer = between(base, "CREATE FUNCTION sentinela_exclusao.excluir", "CREATE FUNCTION sentinela_exclusao.historico")
    writer = replace(writer, "excluir(p jsonb,conta text)", "excluir(p jsonb,conta text,p_usuario uuid)")
    writer = replace(writer, " PERFORM sentinela_exclusao.exigir_ambiente();",
                     " PERFORM sentinela_exclusao.exigir_ambiente();\n PERFORM sentinela_gestao_autorizacao.exigir(p_usuario,conta);")
    writer = replace(writer, " IF alvo IS NULL OR p->>'confirmacao'", " IF p->>'acao' IS DISTINCT FROM 'excluir_lote' OR alvo IS NULL OR p->>'confirmacao'")
    writer = replace(writer, "   sentinela_gestao.inativacoes,sentinela_import_local.requests,sentinela_pcdf_local.entregas_pacote,\n   sentinela_pcdf_local.aprovacoes_pacote IN ROW EXCLUSIVE MODE;",
                     "   sentinela_import_local.requests IN SHARE ROW EXCLUSIVE MODE;")
    writer = replace(writer, " FOR item IN SELECT * FROM (VALUES", """ PERFORM sentinela_gestao_autorizacao.consumir(alvo,p_usuario,conta,p->>'revisao');

 FOR item IN SELECT * FROM (VALUES""")
    for line in (
        "   ('inativacoes','sentinela_gestao.inativacoes','auditoria_id','uuid'),\n",
        "   ('entregas','sentinela_pcdf_local.entregas_pacote','digest','sentinela.sha256'),\n",
        "   ('aprovacoes','sentinela_pcdf_local.aprovacoes_pacote','digest','sentinela.sha256'),\n",
    ):
        writer = replace(writer, line, "")
    writer = replace(writer, "VALUES(alvo,conta,motivo", "VALUES(alvo,p_usuario,motivo")
    history = between(base, "CREATE FUNCTION sentinela_exclusao.historico", "COMMIT;")
    history = replace(history, "previa(uuid),sentinela_exclusao.excluir(jsonb,text)",
                      "previa(uuid,uuid,text),sentinela_exclusao.excluir(jsonb,text,uuid)")
    integrity = (RELEASE / "operational-import-integrity.psql").read_text(encoding="utf-8")
    result = roles + tables + guard + integrity + plan + preview + writer + history
    return result.replace("55488", str(port))


def triggers(port):
    source = BASELINE.read_text(encoding="utf-8")
    immutable = between(source, "CREATE FUNCTION sentinela.impedir_mutacao", "CREATE FUNCTION sentinela.atualizar_versao")
    immutable = replace(immutable, "BEGIN\n", f"""BEGIN
 IF current_user='sentinela_exclusao_owner' AND session_user='sentinela_local_admin'
    AND inet_server_port()={port} AND inet_server_addr()=inet '127.0.0.1'
    AND TG_TABLE_SCHEMA='sentinela' AND TG_OP='DELETE'
    AND TG_TABLE_NAME IN ('extracoes_origem','lotes_importacao','linhas_origem','historico_correcoes','eventos_auditoria')
 THEN RETURN OLD; END IF;
""")
    writes = between(source, "CREATE FUNCTION sentinela.bloquear_correcao_sem_backend",
                     "CREATE TRIGGER escrita_correcao_bloqueada BEFORE UPDATE OR DELETE ON sentinela.ocorrencias")
    writes = replace(writes, "BEGIN\n", f"""BEGIN
 IF current_user='sentinela_exclusao_owner' AND session_user='sentinela_local_admin'
    AND inet_server_port()={port} AND inet_server_addr()=inet '127.0.0.1'
    AND TG_TABLE_SCHEMA='sentinela' AND TG_OP='DELETE' AND TG_TABLE_NAME IN ('linhas_staging','pendencias_revisao')
 THEN RETURN NULL; END IF;
""")
    human = between(source, "CREATE FUNCTION sentinela.bloquear_autoria_manual_sem_auth",
                    "CREATE TRIGGER autoria_manual_bloqueada BEFORE INSERT ON sentinela.pendencias_revisao")
    human = replace(human, "  ELSIF NEW.ator_tipo = 'usuario' THEN\n", """  ELSIF NEW.ator_tipo = 'usuario' THEN
    IF current_user='sentinela_gestao_owner' AND TG_TABLE_SCHEMA='sentinela' AND TG_TABLE_NAME='eventos_auditoria'
      AND NEW.acao='corrigir_associacao' AND NEW.depois->>'operacao'='gestao-importacao'
      AND sentinela_gestao_autorizacao.capacidade(NEW.usuario_id,NEW.depois->>'conta') IS TRUE
    THEN RETURN NEW; END IF;
""")
    return (immutable + writes + human).replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")


def postflight(protected_triggers, installed=False):
    guards = (validate_installed_guards if installed else validate_guards)(guard_signatures(protected_triggers))
    return f"""
DO $postflight$
BEGIN
 IF NOT EXISTS (SELECT FROM sentinela_gestao_autorizacao.release
   WHERE singleton AND versao='local-import-management-0001'
    AND cluster_uuid::text=current_setting('sentinela.release_cluster')
    AND system_id=current_setting('sentinela.release_system') AND porta=inet_server_port()
    AND artefato_sha256=current_setting('sentinela.release_artifact'))
 OR {guards}
 OR EXISTS(SELECT FROM sentinela_exclusao.vinculos_inesperados())
 OR EXISTS (SELECT FROM (VALUES
    ('sentinela_gestao.mutar(jsonb,text,uuid)'::regprocedure,'sentinela_gestao_owner'::regrole),
    ('sentinela_exclusao.excluir(jsonb,text,uuid)'::regprocedure,'sentinela_exclusao_owner'::regrole),
    ('sentinela_exclusao.previa(uuid,uuid,text)'::regprocedure,'sentinela_exclusao_owner'::regrole),
    ('sentinela_gestao_autorizacao.capacidade(uuid,text)'::regprocedure,'sentinela_gestao_autoridade'::regrole)
  ) AS api(func,owner) JOIN pg_proc p ON p.oid=api.func
  WHERE NOT p.prosecdef OR p.proowner<>api.owner
    OR NOT has_function_privilege('sentinela_local_admin',p.oid,'EXECUTE')
    OR has_function_privilege('sentinela_local_operator',p.oid,'EXECUTE')
    OR has_function_privilege('sentinela_local_analyst',p.oid,'EXECUTE'))
 OR EXISTS (SELECT FROM pg_class c WHERE c.oid IN
   ('sentinela_gestao_autorizacao.release'::regclass,'sentinela_gestao_autorizacao.atores'::regclass,
    'sentinela_gestao_autorizacao.exclusoes'::regclass,'sentinela_exclusao.comprovantes'::regclass)
   AND NOT (c.relrowsecurity AND c.relforcerowsecurity))
 OR EXISTS (SELECT FROM pg_roles r WHERE r.rolname IN
   ('sentinela_local_admin','sentinela_local_operator','sentinela_local_analyst',
    'sentinela_gestao_owner','sentinela_exclusao_owner','sentinela_gestao_autoridade')
   AND (r.rolbypassrls OR r.rolsuper OR r.rolcreaterole OR r.rolinherit
    OR EXISTS(SELECT FROM pg_auth_members m WHERE r.oid IN (m.roleid,m.member))))
 OR EXISTS (SELECT FROM pg_class c CROSS JOIN (VALUES ('sentinela_local_admin'),('sentinela_local_operator'),
    ('sentinela_local_analyst')) r(login)
   WHERE c.relnamespace IN ('sentinela'::regnamespace,'sentinela_import_local'::regnamespace,
                            'sentinela_gestao_autorizacao'::regnamespace,'sentinela_exclusao'::regnamespace)
    AND c.relkind='r' AND (has_table_privilege(r.login,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
      OR has_any_column_privilege(r.login,c.oid,'INSERT,UPDATE,REFERENCES')))
 THEN RAISE EXCEPTION 'Topologia, RLS ou privilegios divergentes apos o delta'; END IF;
END
$postflight$;
"""


def render(port=55484):
    if port not in (55484, 55487):
        raise ValueError("Porta fora da integracao local")
    reader = between(read("occurrences-read.sql"), "CREATE FUNCTION sentinela_ocorrencias_local.lista",
                     "CREATE FUNCTION sentinela_ocorrencias_local.detalhe")
    reader = replace(reader, "CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")
    authorization = (RELEASE / "operational-import-authorization.psql").read_text(encoding="utf-8")
    integrity = (RELEASE / "operational-import-integrity.psql").read_text(encoding="utf-8")
    protected = triggers(port)
    install = authorization + "\n" + management() + reader + purge(port) + protected
    checks = postflight(protected)
    fingerprint = sha256((install + checks).encode()).hexdigest()
    # The fingerprint identifies the installed artifact; re-verification also accepts local-manual-0004.
    return (preflight(port, fingerprint).lstrip() + r"\if :instalado" + "\n" + postflight(protected, installed=True) + r"""
\set resultado 'local-import-management-0001 ja instalado e conferido'
\else
""" + bootstrap_check(integrity) + r"""
\if :check_only
\set resultado 'local-import-management-0001 preflight aprovado em READ ONLY'
\else
""" + install + checks + r"""
\set resultado 'local-import-management-0001 instalado com gravacao fechada'
\endif
\endif
COMMIT;
\echo :resultado
""")


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    sql = render()
    with args.output.open("x", encoding="utf-8", newline="\n") as output:
        output.write(sql)
