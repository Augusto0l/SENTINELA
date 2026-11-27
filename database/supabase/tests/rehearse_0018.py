"""Rehearse 0018 (automatic PCDF map points) in a disposable local cluster with synthetic data.

The cluster must be fresh, loopback-only, initialized with superuser `bootstrap` and provisioned with
`run_import_local.py --install-only` (baseline and migrations through 0011). Synthetic RAs share a border so the
ambiguous-RA rule is exercised. Blocking triggers are disabled only to simulate the writers of the import and of the
consolidation; the 0018 triggers stay enabled.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[3]
MIGRATION = ROOT / "database" / "supabase" / "pendentes" / "0018_publicacao_automatica_pontos_pcdf.sql"
LOT = "91000000-0000-4000-8000-000000000001"
EXTRACTION = "92000000-0000-4000-8000-000000000001"

FIXTURE = f"""
SET session_replication_role = replica;
INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES ('10000000-0000-4000-8000-000000000001','fixture@example.test','{{}}');
INSERT INTO sentinela.usuarios(id,auth_user_id,nome_exibicao,perfil,ativo)
VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Ensaio','Administrador',true);
INSERT INTO sentinela.regioes_administrativas(id,codigo_interno,nome,versao_catalogo,vigencia,versao_cartografia,evidencia_referencia_espacial,limite) VALUES
 ('30000000-0000-4000-8000-000000000001','RA-A','Região A','ensaio','[2000-01-01,)','ensaio','sintetico',
  extensions.ST_GeomFromText('POLYGON((-48 -15.9,-47.9 -15.9,-47.9 -15.8,-48 -15.8,-48 -15.9))',4326)),
 ('30000000-0000-4000-8000-000000000002','RA-B','Região B','ensaio','[2000-01-01,)','ensaio','sintetico',
  extensions.ST_GeomFromText('POLYGON((-47.9 -15.9,-47.8 -15.9,-47.8 -15.8,-47.9 -15.8,-47.9 -15.9))',4326));
INSERT INTO sentinela.extracoes_origem(id,fonte,tamanho_bytes,referencia_arquivo,metodologia)
VALUES ('{EXTRACTION}','PCDF',1,'csv:sha256:{"93" * 32}','pcdf-csv-local-v1');
INSERT INTO sentinela.lotes_importacao(id,extracao_id,nome_arquivo,sha256_arquivo,tamanho_bytes,referencia_arquivo,
  versao_contrato,versao_tratamento,competencia,solicitado_por)
VALUES ('{LOT}','{EXTRACTION}','pcdf.csv','{"93" * 32}',100,'fixture','2.0','fixture','2021-02-01','20000000-0000-4000-8000-000000000001');
CREATE TEMP TABLE fx(caso text, status text, lat text, lon text, linha int);
INSERT INTO fx VALUES
 ('unico','consolidada','-15.85','-47.95',1),('unico','consolidada','-15.85','-47.95',2),
 ('divergente','consolidada','-15.85','-47.95',1),('divergente','consolidada','-15.86','-47.95',2),
 ('divisa','consolidada','-15.85','-47.9',1),
 ('revisao','em_revisao','-15.84','-47.85',1),
 ('fora','consolidada','-10.0','-40.0',1),
 ('sem_par','consolidada',NULL,NULL,1),
 ('formato','consolidada','-15,85','-47.95',1);
INSERT INTO sentinela.linhas_origem(id,extracao_id,linha_origem_id,aba_origem,linha_xml,versao_identificador,
  latitude_geo_original,longitude_geo_original,estrutura_celulas)
SELECT md5('l'||caso||linha)::uuid,'{EXTRACTION}','fx-'||caso||linha,'csv',row_number() OVER (),'fixture',lat,lon,'{{}}' FROM fx;
INSERT INTO sentinela.ocorrencias(id,origem,fonte,versao_identidade,identidade_status,localizacao_status,consolidacao_status,ativo,data_fato)
SELECT DISTINCT md5('o'||caso)::uuid,'importacao','PCDF','fixture','candidata','referencia_pendente',status,true,'2021-02-10'::date FROM fx;
INSERT INTO sentinela.ocorrencia_naturezas(id,ocorrencia_id,origem,linha_origem_id,classificacao_status)
SELECT md5('a'||caso||linha)::uuid,md5('o'||caso)::uuid,'importacao',md5('l'||caso||linha)::uuid,'pendente' FROM fx;
SET session_replication_role = origin;
"""

STATE = """SELECT jsonb_build_object(
 'pontos',(SELECT coalesce(jsonb_object_agg(o.caso,p.ra_codigo),'{}') FROM sentinela_ocorrencias_analytics.pcdf_pontos p
   JOIN (SELECT DISTINCT caso,md5('o'||caso)::uuid id FROM (VALUES ('unico'),('divergente'),('divisa'),('revisao'),('fora'),('sem_par'),('formato'),('novo')) v(caso)) o
   ON o.id=p.ocorrencia_id),
 'total',(SELECT count(*) FROM sentinela_ocorrencias_analytics.pcdf_pontos),
 -- Same conditions as pontos_pcdf_publicados (the view itself applies the reader RLS for application logins only).
 'mapa',(SELECT count(*) FROM sentinela_ocorrencias_analytics.pcdf_pontos p JOIN sentinela.ocorrencias o ON o.id=p.ocorrencia_id
   WHERE o.ativo AND o.consolidacao_status='consolidada' AND o.fonte='PCDF' AND o.origem='importacao' AND o.versao=p.versao_ocorrencia),
 'duplicados',(SELECT count(*) FROM (SELECT ocorrencia_id FROM sentinela_ocorrencias_analytics.pcdf_pontos GROUP BY 1 HAVING count(*)>1) d),
 'eventos',(SELECT count(*) FROM sentinela.eventos_auditoria WHERE acao='pcdf.publicacao_pontos'))"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=Path)
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--data-directory", required=True, type=Path)
    args = parser.parse_args()
    if not 49152 <= args.port <= 65535 or args.port in (55484, 55487, 55491):
        parser.error("Use a free high port reserved for a disposable cluster")
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith("PG")}
    env.update(PGCLIENTENCODING="UTF8", LC_MESSAGES="C", LANG="C")
    exe = ".exe" if os.name == "nt" else ""
    steps = []

    def psql(user, sql=None, path=None, check=True):
        result = subprocess.run([str(args.pg_bin / f"psql{exe}"), "-XwqAt", "-h", "127.0.0.1", "-p", str(args.port), "-U", user,
                                 "-d", "postgres", "-v", "ON_ERROR_STOP=1", *(["-f", str(path)] if path else [])],
                                input=sql, capture_output=True, encoding="utf8", errors="replace", env=env, timeout=600)
        if check and result.returncode:
            raise RuntimeError(result.stderr.strip()[-2000:])
        return result

    def data(sql, user="bootstrap"):
        return json.loads(psql(user, sql).stdout.strip().splitlines()[-1])

    def expect(condition, label):
        if not condition:
            raise RuntimeError(label)
        steps.append(label)

    identity = data("""SELECT jsonb_build_array(current_user,inet_server_port(),current_setting('data_directory'),
      (SELECT max(versao) FROM sentinela.schema_migrations),(SELECT count(*) FROM sentinela.ocorrencias),sentinela_ambiente.vinculado())""")
    if identity[:2] != ["bootstrap", args.port] or Path(identity[2]).resolve() != args.data_directory.resolve() \
            or identity[3:] != ["0011", 0, True]:
        raise SystemExit("Disposable cluster identity or state did not match")

    psql("bootstrap", FIXTURE)
    s0 = data(STATE)
    expect(s0["total"] == 0 and s0["mapa"] == 0, "fixture: nenhum ponto PCDF publicado antes da 0018")

    rollback = MIGRATION.read_text(encoding="utf8")
    rollback = rollback[: rollback.rstrip().rindex("COMMIT;")] + "ROLLBACK;\n"
    psql("postgres", rollback)
    expect(data(STATE) == s0 and data("SELECT to_jsonb(to_regnamespace('sentinela_pontos') IS NULL)"),
           "0018 completa com ROLLBACK não deixa efeito")

    psql("postgres", path=MIGRATION)
    s1 = data(STATE)
    expect(s1["pontos"] == {"unico": "RA-A"} and s1["mapa"] == 1 and s1["eventos"] == 1,
           "publicação inicial: só a consolidada com par único válido em exatamente uma RA (divergente, divisa, fora do DF, sem par, formato inválido e em revisão ficam fora)")
    refused = psql("postgres", path=MIGRATION, check=False)
    expect(refused.returncode != 0 and data(STATE) == s1, "reaplicação da 0018 recusada sem efeito")

    privileges = data("""SELECT jsonb_build_array(
      has_function_privilege('sentinela_local_admin','sentinela_pontos.publicar(uuid[])','EXECUTE'),
      has_function_privilege('sentinela_local_operator','sentinela_pontos.publicar(uuid[])','EXECUTE'),
      has_function_privilege('sentinela_local_analyst','sentinela_pontos.publicar(uuid[])','EXECUTE'),
      has_table_privilege('sentinela_local_admin','sentinela_ocorrencias_analytics.pcdf_pontos','INSERT,UPDATE,DELETE'),
      (SELECT rolcanlogin OR rolbypassrls OR rolinherit FROM pg_roles WHERE rolname='sentinela_pontos_owner'),
      (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r' AND relrowsecurity AND relforcerowsecurity))""")
    expect(privileges == [False, False, False, False, False, 19], "aplicativo sem EXECUTE nem escrita em pcdf_pontos; dono NOLOGIN sem bypass; RLS em 19 tabelas")
    analyst = psql("sentinela_local_analyst", "SELECT count(*) FROM sentinela_ocorrencias_analytics.pontos_confirmados")
    expect(analyst.stdout.strip() == "1", "Analista lê o ponto publicado pela view do mapa")

    # Import path: a new consolidated occurrence whose links are inserted later in the same transaction.
    psql("bootstrap", f"""BEGIN;
      SET LOCAL session_replication_role = replica;
      INSERT INTO sentinela.linhas_origem(id,extracao_id,linha_origem_id,aba_origem,linha_xml,versao_identificador,
        latitude_geo_original,longitude_geo_original,estrutura_celulas)
      VALUES (md5('lnovo1')::uuid,'{EXTRACTION}','fx-novo1','csv',100,'fixture','-15.81','-47.81','{{}}');
      INSERT INTO sentinela.ocorrencias(id,origem,fonte,versao_identidade,identidade_status,localizacao_status,consolidacao_status,ativo,data_fato)
      VALUES (md5('onovo')::uuid,'importacao','PCDF','fixture','candidata','referencia_pendente','consolidada',true,'2021-02-11');
      SET LOCAL session_replication_role = origin;
      ALTER TABLE sentinela.ocorrencia_naturezas DISABLE TRIGGER USER;
      ALTER TABLE sentinela.ocorrencia_naturezas ENABLE TRIGGER pontos_pcdf_vinculos;
      INSERT INTO sentinela.ocorrencia_naturezas(id,ocorrencia_id,origem,linha_origem_id,classificacao_status)
      VALUES (md5('anovo1')::uuid,md5('onovo')::uuid,'importacao',md5('lnovo1')::uuid,'pendente');
      ALTER TABLE sentinela.ocorrencia_naturezas ENABLE TRIGGER USER;
      COMMIT;""")
    s2 = data(STATE)
    expect(s2["pontos"].get("novo") == "RA-B" and s2["mapa"] == 2, "importação: vínculos inseridos publicam o ponto na mesma transação")

    def update(sql):
        psql("bootstrap", f"""BEGIN;
          ALTER TABLE sentinela.ocorrencias DISABLE TRIGGER USER;
          ALTER TABLE sentinela.ocorrencias ENABLE TRIGGER pontos_pcdf_ocorrencias;
          {sql};
          ALTER TABLE sentinela.ocorrencias ENABLE TRIGGER USER;
          COMMIT;""")

    update("UPDATE sentinela.ocorrencias SET consolidacao_status='consolidada', versao=versao+1 WHERE id=md5('orevisao')::uuid")
    s3 = data(STATE)
    expect(s3["pontos"].get("revisao") == "RA-B" and s3["mapa"] == 3, "aprovação: a ocorrência que sai de Em revisão entra no mapa")
    update("UPDATE sentinela.ocorrencias SET versao=versao+1 WHERE id=md5('ounico')::uuid")
    expect(data(STATE)["mapa"] == 3, "nova versão da ocorrência republica o ponto (sem sumir do mapa)")
    update("UPDATE sentinela.ocorrencias SET ativo=false, versao=versao+1 WHERE id=md5('ounico')::uuid")
    s4 = data(STATE)
    expect("unico" not in s4["pontos"] and s4["mapa"] == 2, "inativação retira o ponto")
    update("UPDATE sentinela.ocorrencias SET consolidacao_status='em_revisao', versao=versao+1 WHERE id=md5('orevisao')::uuid")
    s5 = data(STATE)
    expect("revisao" not in s5["pontos"] and s5["mapa"] == 1, "volta para Em revisão retira o ponto")
    events = s5["eventos"]
    psql("bootstrap", "SET ROLE sentinela_pontos_owner; SELECT sentinela_pontos.publicar(NULL);")
    s6 = data(STATE)
    expect(s6 == s5 and s6["eventos"] == events and s6["duplicados"] == 0, "republicação completa é idempotente, sem duplicatas nem evento vazio")

    # Scale: one import statement with 6,000 links (January has 6,392), measured end to end.
    started = time.perf_counter()
    psql("bootstrap", f"""BEGIN;
      SET LOCAL session_replication_role = replica;
      INSERT INTO sentinela.linhas_origem(id,extracao_id,linha_origem_id,aba_origem,linha_xml,versao_identificador,
        latitude_geo_original,longitude_geo_original,estrutura_celulas)
      SELECT md5('ls'||g)::uuid,'{EXTRACTION}','fx-s'||g,'csv',1000+g,'fixture',(-15.89+(g%80)*0.001)::text,(-47.99+(g/80)*0.001)::text,'{{}}'
      FROM generate_series(1,6000) g;
      INSERT INTO sentinela.ocorrencias(id,origem,fonte,versao_identidade,identidade_status,localizacao_status,consolidacao_status,ativo,data_fato)
      SELECT md5('os'||g)::uuid,'importacao','PCDF','fixture','candidata','referencia_pendente','consolidada',true,'2021-03-01' FROM generate_series(1,6000) g;
      SET LOCAL session_replication_role = origin;
      ALTER TABLE sentinela.ocorrencia_naturezas DISABLE TRIGGER USER;
      ALTER TABLE sentinela.ocorrencia_naturezas ENABLE TRIGGER pontos_pcdf_vinculos;
      INSERT INTO sentinela.ocorrencia_naturezas(id,ocorrencia_id,origem,linha_origem_id,classificacao_status)
      SELECT md5('as'||g)::uuid,md5('os'||g)::uuid,'importacao',md5('ls'||g)::uuid,'pendente' FROM generate_series(1,6000) g;
      ALTER TABLE sentinela.ocorrencia_naturezas ENABLE TRIGGER USER;
      COMMIT;""")
    seconds = round(time.perf_counter() - started, 2)
    s7 = data(STATE)
    expect(s7["mapa"] == s6["mapa"] + 6000 and s7["duplicados"] == 0, f"escala: 6.000 vínculos importados publicam 6.000 pontos em {seconds} s")
    print(json.dumps({"synthetic": True, "migration": MIGRATION.name, "scale_seconds": seconds, "steps": steps}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        raise SystemExit(f"FALHA: {error}")
