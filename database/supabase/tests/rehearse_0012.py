"""Rehearse 0012 (apply, rollback, guard refusal, reversal) in a disposable local cluster.

The cluster must be fresh, loopback-only, initialized with superuser `bootstrap`, provisioned with
run_import_local.AUTH_FIXTURE and migrations through 0011. All data is synthetic.
"""
import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import mkdtemp

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prepare_0012_application import REVERSAL, render  # noqa: E402
from rehearse_predeployment import CATALOG  # noqa: E402
from transfer_operational_data import ARCHIVE_DDL, ARCHIVES  # noqa: E402

LOT = "84908630-bd04-4a03-923d-616649c8de74"
SHA = "ab" * 32
FIXTURE = f"""
SET session_replication_role = replica;
INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES ('10000000-0000-4000-8000-000000000001','fixture-admin@example.test','{{}}');
INSERT INTO sentinela.usuarios(id,auth_user_id,nome_exibicao,perfil,ativo)
VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Ensaio Administrador','Administrador',true);
INSERT INTO sentinela.extracoes_origem(id,fonte,tamanho_bytes,referencia_arquivo,metodologia)
VALUES ('50000000-0000-4000-8000-000000000001','PCDF',1,'csv:sha256:{SHA}','pcdf-csv-local-v1');
INSERT INTO sentinela.lotes_importacao(id,extracao_id,nome_arquivo,sha256_arquivo,tamanho_bytes,referencia_arquivo,
  versao_contrato,versao_tratamento,competencia,solicitado_por)
VALUES ('{LOT}','50000000-0000-4000-8000-000000000001','pcdf_naturezas_2021-01.csv','{SHA}',100,'fixture',
  '2.0','fixture','2021-01-01','20000000-0000-4000-8000-000000000001');
INSERT INTO sentinela_pcdf_historico.arquivos VALUES ('2021-01-01','{SHA}',100,10,10,'2021-01-31',true);
SET session_replication_role = origin;
INSERT INTO sentinela.eventos_auditoria(ator_tipo,servico,acao,depois,justificativa) VALUES
  ('servico','fixture','fixture.anterior',NULL,'Synthetic live event'),
  ('servico','sentinela-migracao','migracao.operacional','{{"fixture":true}}','Synthetic transfer receipt');
{ARCHIVE_DDL}
ALTER SCHEMA sentinela_migracao OWNER TO postgres;
ALTER TABLE sentinela_migracao.auditoria_origem OWNER TO postgres;
ALTER TABLE sentinela_migracao.comprovantes_origem OWNER TO postgres;
ALTER FUNCTION sentinela_migracao.negar_reescrita() OWNER TO postgres;
SET ROLE postgres;
""" + "".join(
    f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY;\nALTER TABLE {t} FORCE ROW LEVEL SECURITY;\n"
    f"REVOKE ALL ON TABLE {t} FROM PUBLIC, anon, authenticated, service_role, sentinela_local_admin, sentinela_local_operator, sentinela_local_analyst;\n"
    f"CREATE TRIGGER origem_imutavel BEFORE UPDATE OR DELETE OR TRUNCATE ON {t} FOR EACH STATEMENT EXECUTE FUNCTION sentinela_migracao.negar_reescrita();\n"
    for t in ARCHIVES.values()) + f"""
INSERT INTO sentinela_migracao.auditoria_origem(id,ator_tipo,usuario_id,acao,depois,justificativa,registrado_em,transacao_id)
SELECT gen_random_uuid(),'usuario','20000000-0000-4000-8000-000000000001','fixture.origem.'||i,NULL,'Synthetic archived event',now(),pg_current_xact_id()
FROM generate_series(1,20) i;
INSERT INTO sentinela_migracao.auditoria_origem(id,ator_tipo,usuario_id,acao,depois,justificativa,registrado_em,transacao_id)
VALUES (gen_random_uuid(),'usuario','20000000-0000-4000-8000-000000000001','pcdf.revisao_independente',
  '{{"lote":"{LOT}","csvSha256":"{SHA}","consolidadas":6090,"vinculos":6393,"origensEmRevisao":0,"pendencias":1}}',
  'Synthetic original review',now(),pg_current_xact_id());
RESET ROLE;
CREATE SCHEMA supabase_migrations AUTHORIZATION postgres;
CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text);
ALTER TABLE supabase_migrations.schema_migrations OWNER TO postgres;
INSERT INTO supabase_migrations.schema_migrations VALUES ('20261126230000',NULL,'0011_central_revisao_hospedada');
"""

STATE = """SELECT jsonb_build_object(
 'status',(SELECT m FROM jsonb_array_elements(sentinela_pcdf_historico.status()) m WHERE m->>'month'='2021-01'),
 'live',(SELECT jsonb_build_array(count(*),encode(sha256(convert_to(coalesce(string_agg(to_jsonb(e)::text,'' ORDER BY id),''),'UTF8')),'hex')) FROM sentinela.eventos_auditoria e),
 'archive',(SELECT jsonb_build_array(count(*),encode(sha256(convert_to(coalesce(string_agg(to_jsonb(e)::text,'' ORDER BY id),''),'UTF8')),'hex')) FROM sentinela_migracao.auditoria_origem e),
 'receipts',(SELECT count(*) FROM sentinela_migracao.comprovantes_origem),
 'logical',(SELECT array_agg(versao ORDER BY versao) FROM sentinela.schema_migrations),
 'physical',(SELECT jsonb_agg(jsonb_build_array(version,name) ORDER BY version) FROM supabase_migrations.schema_migrations),
 'forced_rls',(SELECT count(*) FROM pg_class WHERE relnamespace IN ('sentinela'::regnamespace,'sentinela_migracao'::regnamespace)
    AND relkind='r' AND relrowsecurity AND relforcerowsecurity),
 'app_archive_access',(SELECT jsonb_object_agg(r, has_schema_privilege(r,'sentinela_migracao','USAGE')
    OR has_table_privilege(r,'sentinela_migracao.auditoria_origem','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_table_privilege(r,'sentinela_migracao.comprovantes_origem','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))
    FROM unnest(ARRAY['anon','authenticated','service_role','sentinela_local_admin','sentinela_local_operator','sentinela_local_analyst']) r),
 'status_execute',(SELECT jsonb_object_agg(r, has_function_privilege(r,'sentinela_pcdf_historico.status()','EXECUTE'))
    FROM unnest(ARRAY['anon','authenticated','service_role','sentinela_local_admin','sentinela_local_operator','sentinela_local_analyst']) r),
 'owner_archive',jsonb_build_array(has_schema_privilege('sentinela_pcdf_historico_owner','sentinela_migracao','USAGE'),
    has_table_privilege('sentinela_pcdf_historico_owner','sentinela_migracao.auditoria_origem','SELECT'),
    has_table_privilege('sentinela_pcdf_historico_owner','sentinela_migracao.auditoria_origem','INSERT,UPDATE,DELETE,TRUNCATE'),
    has_table_privilege('sentinela_pcdf_historico_owner','sentinela_migracao.comprovantes_origem','SELECT'),
    has_schema_privilege('sentinela_pcdf_historico_owner','sentinela_pcdf_historico','CREATE')));"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=Path)
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--data-directory", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    args = parser.parse_args()
    if not 49152 <= args.port <= 65535 or args.port in (55484, 55487, 55491):
        parser.error("Use a free high port reserved for a disposable cluster")
    args.output_root.mkdir(parents=True, exist_ok=True)
    output = Path(mkdtemp(prefix="sentinela-0012-", dir=args.output_root.resolve()))
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith("PG")}
    env["PGCLIENTENCODING"] = "UTF8"

    def psql(user, *params, check=True):
        result = subprocess.run([str(args.pg_bin / "psql.exe" if os.name == "nt" else args.pg_bin / "psql"), "-XwqAt",
                                 "-h", "127.0.0.1", "-p", str(args.port), "-U", user, "-d", "postgres",
                                 "-v", "ON_ERROR_STOP=1", *map(str, params)],
                                capture_output=True, encoding="utf8", env=env, timeout=120)
        if check and result.returncode:
            raise RuntimeError(result.stderr.strip())
        return result

    def data(statement, user="bootstrap"):
        return json.loads(psql(user, "-c", statement).stdout.strip())

    def expect(condition, label):
        if not condition:
            raise RuntimeError(label)
        steps.append(label)

    identity = data("""SELECT jsonb_build_array(current_user,inet_server_port(),current_setting('data_directory'),
      current_setting('server_version_num'),pg_is_in_recovery(),(SELECT max(versao) FROM sentinela.schema_migrations),
      (SELECT count(*) FROM sentinela_pcdf_historico.arquivos))""")
    if identity[:2] != ["bootstrap", args.port] or Path(identity[2]).resolve() != args.data_directory.resolve() \
            or identity[3:] != ["170011", False, "0011", 0]:
        raise SystemExit("Disposable cluster identity or state did not match")
    postgis = data("SELECT to_jsonb(extensions.postgis_lib_version())")
    steps = []

    psql("bootstrap", "-c", FIXTURE)
    s0 = data(STATE)
    c0 = data(CATALOG)
    expect(s0["status"]["state"] == "conflict" and s0["live"][0] == 2 and s0["archive"][0] == 21,
           "fixture reproduz o estado institucional: 2021-01 conflict, 2 eventos vivos, 21 arquivados")

    def package(after, version, ending="COMMIT", source=None):
        text, digest = render(after, version, postgis, **({"source": source} if source else {}))
        if ending != "COMMIT":
            text = text[: text.rindex("COMMIT;\n")] + ending + ";\n"
        path = output / f"0012-{version}-{ending.lower()}.sql"
        path.write_text(text, encoding="utf8", newline="\n")
        return path, digest

    path, digest = package("20261126230000", "20261127100000", "ROLLBACK")
    psql("postgres", "-f", path)
    expect(data(STATE) == s0 and data(CATALOG) == c0, "execução completa com ROLLBACK não deixa efeito")

    path, _ = package("20261126225959", "20261127100001")
    refused = psql("postgres", "-f", path, check=False)
    expect(refused.returncode != 0 and "divergem do pr" in refused.stderr and "0012_pcdf" in refused.stderr and data(STATE) == s0 and data(CATALOG) == c0,
           "guarda recusa histórico físico divergente sem efeito")

    path, _ = package("20261126230000", "20261127100002")
    psql("postgres", "-f", path)
    s1 = data(STATE)
    expect(s1["status"]["state"] == "done" and s1["status"]["lot"] == LOT and s1["status"]["issues"] == 8091
           and s1["status"]["unique"] == 6090, "2021-01 passa a done com o lote e os totais do evento original")
    expect(s1["live"] == s0["live"] and s1["archive"] == s0["archive"] and s1["receipts"] == s0["receipts"],
           "auditoria viva, arquivada e comprovantes idênticos (contagem e SHA-256)")
    expect(s1["forced_rls"] == s0["forced_rls"] == 21, "RLS forçada mantida em 21 tabelas (19 + 2 do arquivo)")
    expect(s1["app_archive_access"] == s0["app_archive_access"] and not any(s1["app_archive_access"].values()),
           "papéis da aplicação continuam sem acesso ao arquivo")
    expect(s1["status_execute"] == s0["status_execute"], "EXECUTE de status() inalterado para todos os papéis")
    expect(s1["owner_archive"] == [True, True, False, False, False],
           "dono do histórico: só SELECT no arquivo de auditoria, nada nos comprovantes, sem CREATE no schema")
    expect(s1["logical"][-1] == "0012" and s1["physical"][-1] == ["20261127100002", "0012_pcdf_historico_auditoria_arquivada"],
           "0012 registrada nos dois históricos de migrations")
    visible = data("""SET ROLE sentinela_pcdf_historico_owner;
      SELECT to_jsonb(array_agg(DISTINCT acao)) FROM sentinela_migracao.auditoria_origem""")
    expect(visible == ["pcdf.revisao_independente"], "policy expõe ao dono apenas pcdf.revisao_independente")
    denied = psql("bootstrap", "-c", "SET ROLE sentinela_local_admin; SELECT count(*) FROM sentinela_migracao.auditoria_origem", check=False)
    expect(denied.returncode != 0 and ("permission denied" in denied.stderr.lower()
           or "permissão negada" in denied.stderr.lower()),"sentinela_local_admin recebe permissão negada no arquivo")
    write = psql("bootstrap", "-c", "SET ROLE sentinela_pcdf_historico_owner; DELETE FROM sentinela_migracao.auditoria_origem", check=False)
    expect(write.returncode != 0, "dono do histórico não consegue apagar eventos arquivados")
    for role in ("sentinela_local_admin", "sentinela_local_operator"):
        state = data(f"SET ROLE {role}; SELECT sentinela_pcdf_historico.status()->0->'state'")
        expect(state == "done", f"{role} lê status() = done pela função")
    analyst = psql("bootstrap", "-c", "SET ROLE sentinela_local_analyst; SELECT sentinela_pcdf_historico.status()", check=False)
    expect(analyst.returncode != 0, "sentinela_local_analyst continua sem EXECUTE em status()")
    c1 = data(CATALOG)

    again = psql("postgres", "-f", package("20261126230000", "20261127100003")[0], check=False)
    expect(again.returncode != 0 and data(STATE) == s1, "reaplicação recusada sem efeito")

    path, reversal_digest = package("20261127100002", "20261127100005", source=REVERSAL)
    psql("postgres", "-f", path)
    s2 = data(STATE)
    c2 = data(CATALOG)
    ledgers = ("logical", "physical")
    expect({k: v for k, v in s2.items() if k not in ledgers} == {k: v for k, v in s0.items() if k not in ledgers},
           "0013 restaura conflict, auditoria, RLS e privilégios do estado anterior")
    expect(s2["logical"][-2:] == ["0012", "0013"] and [row[1] for row in s2["physical"][-2:]]
           == ["0012_pcdf_historico_auditoria_arquivada", "0013_reverte_0012"],
           "históricos imutáveis preservam 0012 e registram a 0013")
    expect({k: v for k, v in c2.items() if k != "ledger"} == {k: v for k, v in c0.items() if k != "ledger"},
           "0013 restaura o catálogo completo (funções, policies, ACLs, RLS, papéis)")
    expect(c1 != c0, "a 0012 alterou de fato o catálogo antes da reversão")

    evidence = {"synthetic": True, "postgres": "17.11", "postgis_local": postgis, "migration_sha256": digest,
                "reversal_sha256": reversal_digest,
                "before": s0["status"]["state"], "after": s1["status"]["state"], "steps": steps}
    (output / "evidence.json").write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    print(json.dumps(evidence, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        raise SystemExit(f"FALHA: {error}")
