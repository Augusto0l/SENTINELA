"""Rehearse 0015 (PCDF classification v2) in a disposable local cluster with synthetic data.

The cluster must be fresh, loopback-only, initialized with superuser `bootstrap` and provisioned with
`run_import_local.py --install-only` (baseline and migrations through 0011). January 2021 is rebuilt from the
36 real (nature, attempt) pairs of docs/catalogos/pcdf-matriz-conjunta-2021-01.json (6,392 imported links plus
1 manual link; the 6,393 classification items are keyed by source line, as in production); no police record is copied. Covers: verifiable backup and restore, ROLLBACK without effect,
application, refused reapplication, the three profiles, forged session, homologation, validity, activation,
concurrency, idempotency, atomic rollback, a second lot with unknown pairs, reversal and reapplication, list and
summary filters, referential integrity and forced RLS.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from tempfile import mkdtemp

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from rehearse_predeployment import CATALOG  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prepare_0012_application import render  # noqa: E402  (generic single-transaction packager with physical ledger)

MIGRATION = ROOT / "database" / "supabase" / "pendentes" / "0015_classificacao_pcdf_v2.sql"
REVERSAL = ROOT / "database" / "supabase" / "pendentes" / "0016_reverte_0015.sql"
PHYSICAL_BEFORE = "20261127100810"  # last physical version observed in production (0014)
PROPOSAL = json.loads((ROOT / "docs" / "catalogos" / "sentinela-classificacao-v2.json").read_text(encoding="utf8"))
JANUARY = json.loads((ROOT / "docs" / "catalogos" / "pcdf-matriz-conjunta-2021-01.json").read_text(encoding="utf8"))
LOT = "84908630-bd04-4a03-923d-616649c8de74"
LOT2 = "84908630-bd04-4a03-923d-6166490202ff"
SESSIONS = {"Administrador": "30000000-0000-4000-8000-000000000001", "Operador": "30000000-0000-4000-8000-000000000002",
            "Analista": "30000000-0000-4000-8000-000000000003"}
VERSION = "pcdf-classificacao-v2.0"
REASON = "Ensaio isolado da classificacao PCDF v2 (dados sinteticos)."


def literal(value):
    return "NULL" if value is None else "'" + str(value).replace("'", "''") + "'"


def fixture():
    natures = sorted({rule["naturezaOriginal"] for rule in PROPOSAL["regras"]})
    january = [(t["natureza_original"], t["crime_tentado"], t["associacoes"], 1) for t in JANUARY["triplas"]]
    # Second lot: two links per January pair plus one pair without any rule (HOMICIDIO with unknown attempt).
    february = [(n, a, 2, 2) for n, a, _, _ in january] + [("HOMICIDIO", None, 1, 2)]
    rows = ",".join(f"({literal(n)},{literal(a)}::boolean,{c},{lot})" for n, a, c, lot in january + february)
    users = "".join(
        f"""INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES ('1000000{i}-0000-4000-8000-000000000001','fixture-{i}@example.test','{{}}');
INSERT INTO auth.sessions(id,user_id) VALUES ('{session}','1000000{i}-0000-4000-8000-000000000001');
INSERT INTO sentinela.usuarios(id,auth_user_id,nome_exibicao,perfil,ativo)
VALUES ('2000000{i}-0000-4000-8000-000000000001','1000000{i}-0000-4000-8000-000000000001','Ensaio {role}','{role}',true);
""" for i, (role, session) in enumerate(SESSIONS.items(), 1))
    sha = ["91" * 32, "92" * 32]
    lots = "".join(
        f"""INSERT INTO sentinela.extracoes_origem(id,fonte,tamanho_bytes,referencia_arquivo,metodologia)
VALUES ('5000000{k}-0000-4000-8000-000000000001','PCDF',1,'csv:sha256:{sha[k - 1]}','pcdf-csv-local-v1');
INSERT INTO sentinela.lotes_importacao(id,extracao_id,nome_arquivo,sha256_arquivo,tamanho_bytes,referencia_arquivo,
  versao_contrato,versao_tratamento,competencia,solicitado_por)
VALUES ('{lot}','5000000{k}-0000-4000-8000-000000000001','pcdf_naturezas_2021-0{k}.csv','{sha[k - 1]}',100,'fixture',
  '2.0','fixture','2021-0{k}-01','20000001-0000-4000-8000-000000000001');
""" for k, lot in ((1, LOT), (2, LOT2)))
    return f"""
SET session_replication_role = replica;
{users}
INSERT INTO sentinela.naturezas_criminais(fonte,descricao_original) SELECT 'PCDF', d FROM unnest(ARRAY[{",".join(map(literal, natures))}]) d;
{lots}
CREATE TEMP TABLE fx(natureza text, tentado boolean, n int, lote int);
INSERT INTO fx VALUES {rows};
CREATE TEMP TABLE fr AS SELECT row_number() OVER (ORDER BY f.lote, f.natureza, f.tentado, g) AS i, f.*
  FROM fx f CROSS JOIN LATERAL generate_series(1, f.n) g;
INSERT INTO sentinela.linhas_origem(id,extracao_id,linha_origem_id,aba_origem,linha_xml,versao_identificador,natureza_original,estrutura_celulas)
SELECT md5('linha'||i)::uuid, ('5000000'||lote||'-0000-4000-8000-000000000001')::uuid, 'fixture-'||i, 'csv', i, 'fixture', natureza, '{{}}'
FROM fr;
INSERT INTO sentinela.ocorrencias(id,origem,fonte,versao_identidade,identidade_status,localizacao_status,consolidacao_status,ativo,data_fato)
SELECT md5('ocorrencia'||i)::uuid, 'importacao', 'PCDF', 'fixture', 'candidata', 'ausente', 'consolidada', true, ('2021-0'||lote||'-15')::date FROM fr;
INSERT INTO sentinela.ocorrencia_naturezas(id,ocorrencia_id,natureza_id,origem,linha_origem_id,crime_tentado,classificacao_status)
SELECT md5('associacao'||i)::uuid, md5('ocorrencia'||i)::uuid,
  (SELECT n.id FROM sentinela.naturezas_criminais n WHERE n.descricao_original = fr.natureza), 'importacao', md5('linha'||i)::uuid, tentado, 'pendente'
FROM fr;
-- January review items as in production: classification by source line (no association), plus other open items.
INSERT INTO sentinela.pendencias_revisao(linha_origem_id,campo,regra,versao_regra,motivo,tipo,prioridade,efeito)
SELECT md5('linha'||i)::uuid, 'natureza', 'natureza_sem_mapeamento', 'fixture', 'Natureza aguardando classificacao.', 'classificacao', 'media', 'nao_bloqueante'
FROM fr WHERE lote = 1;
INSERT INTO sentinela.pendencias_revisao(linha_origem_id,campo,regra,versao_regra,motivo,tipo,prioridade,efeito)
SELECT md5('linha'||i)::uuid, 'coordenadas', 'coordenadas_ausentes', 'fixture', 'Coordenadas ausentes.', 'coordenadas', 'media', 'nao_bloqueante'
FROM fr WHERE lote = 1 AND i % 3 = 0;
-- As in production: one more classification item on a source line without an imported link (stays open).
INSERT INTO sentinela.linhas_origem(id,extracao_id,linha_origem_id,aba_origem,linha_xml,versao_identificador,natureza_original,estrutura_celulas)
VALUES (md5('linha-extra')::uuid,'50000001-0000-4000-8000-000000000001','fixture-extra','csv',900000,'fixture','PORTE DE ARMA','{{}}');
INSERT INTO sentinela.pendencias_revisao(linha_origem_id,campo,regra,versao_regra,motivo,tipo,prioridade,efeito)
VALUES (md5('linha-extra')::uuid,'natureza','natureza_sem_mapeamento','fixture','Natureza aguardando classificacao.','classificacao','media','nao_bloqueante');
-- The manual link stays pending: classification never touches manual records.
INSERT INTO sentinela.ocorrencias(id,origem,fonte,versao_identidade,identidade_status,localizacao_status,consolidacao_status,ativo,data_fato)
VALUES ('60000000-0000-4000-8000-000000000001','manual','SENTINELA','manual','manual','ausente','em_revisao',true,'2021-01-20');
INSERT INTO sentinela.ocorrencia_naturezas(id,ocorrencia_id,natureza_id,origem,crime_tentado,classificacao_status)
VALUES ('60000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001',
  (SELECT id FROM sentinela.naturezas_criminais WHERE descricao_original='HOMICIDIO'),'manual',false,'pendente');
SET session_replication_role = origin;
"""


def digest(table, order="id"):
    return (f"(SELECT jsonb_build_array(count(*),encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY {order}),''),"
            f"'UTF8')),'hex')) FROM {table} t)")


STATE = f"""SELECT jsonb_build_object(
 'ocorrencias',{digest('sentinela.ocorrencias')},'linhas',{digest('sentinela.linhas_origem')},
 'naturezas',{digest('sentinela.naturezas_criminais')},'lotes',{digest('sentinela.lotes_importacao')},
 'associacoes',{digest('sentinela.ocorrencia_naturezas')},'pendencias',{digest('sentinela.pendencias_revisao')},
 'status',(SELECT jsonb_object_agg(k,n) FROM (SELECT coalesce(l.competencia::text,'')||'/'||a.classificacao_status k,count(*) n
    FROM sentinela.ocorrencia_naturezas a LEFT JOIN sentinela.linhas_origem o ON o.id=a.linha_origem_id
    LEFT JOIN sentinela.lotes_importacao l ON l.extracao_id=o.extracao_id GROUP BY 1) x),
 'pend',(SELECT jsonb_object_agg(k,n) FROM (SELECT tipo||'/'||status k,count(*) n FROM sentinela.pendencias_revisao GROUP BY 1) x),
 'historico',(SELECT count(*) FROM sentinela.historico_correcoes),
 'eventos',(SELECT coalesce(jsonb_object_agg(acao,n),'{{}}') FROM (SELECT acao,count(*) n FROM sentinela.eventos_auditoria GROUP BY 1) x),
 'forced_rls',(SELECT count(*) FROM pg_class WHERE relnamespace='sentinela'::regnamespace AND relkind='r'
    AND relrowsecurity AND relforcerowsecurity))"""

INTEGRITY = f"""SELECT jsonb_build_object(
 'mapeadas_sem_regra_homologada',(SELECT count(*) FROM sentinela.ocorrencia_naturezas a
    LEFT JOIN sentinela.mapeamentos_natureza m ON m.id=a.mapeamento_id
    LEFT JOIN sentinela.categorias_criminais c ON c.id=m.categoria_id
    WHERE a.classificacao_status='mapeada' AND (m.status IS DISTINCT FROM 'homologado' OR c.status IS DISTINCT FROM 'homologada'
      OR m.versao <> '{VERSION}' OR m.natureza_id <> a.natureza_id OR m.crime_tentado IS DISTINCT FROM a.crime_tentado)),
 'mapeadas_sem_historico',(SELECT count(*) FROM sentinela.ocorrencia_naturezas a WHERE a.classificacao_status<>'pendente'
    AND NOT EXISTS (SELECT FROM sentinela.historico_correcoes h WHERE h.associacao_id=a.id AND h.campo='classificacao_status'
      AND h.valores_novos=to_jsonb(a.classificacao_status))),
 'resolvidas_sem_evento',(SELECT count(*) FROM sentinela.pendencias_revisao p WHERE p.tipo='classificacao' AND p.status='resolvida'
    AND NOT EXISTS (SELECT FROM sentinela.eventos_auditoria e WHERE e.pendencia_id=p.id)),
 'pendencias_orfas',(SELECT count(*) FROM sentinela.pendencias_revisao p WHERE p.associacao_id IS NOT NULL
    AND NOT EXISTS (SELECT FROM sentinela.ocorrencia_naturezas a WHERE a.id=p.associacao_id)),
 'regras_v2',(SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM sentinela.mapeamentos_natureza WHERE versao='{VERSION}' GROUP BY 1) x),
 'categorias_v2',(SELECT count(*) FROM sentinela.categorias_criminais WHERE versao_catalogo='sentinela-categorias-v2.0' AND status='homologada'))"""


def rules():
    return [{"regraId": r["id"], "natureza": r["naturezaOriginal"], "crimeTentado": r["crimeTentado"],
             "categoria": r["categoriaProposta"], "nivel": r["nivel"], "justificativa": r["justificativa"],
             "status": "homologado" if r["statusRegra"] == "homologavel" else "conflitante"} for r in PROPOSAL["regras"]]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=Path)
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--data-directory", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--prior", type=Path, action="append", default=[],
                        help="Migration already applied in production after 0011 (e.g. 0014), applied before the fixture")
    args = parser.parse_args()
    if not 49152 <= args.port <= 65535 or args.port in (55484, 55487, 55491):
        parser.error("Use a free high port reserved for a disposable cluster")
    args.output_root.mkdir(parents=True, exist_ok=True)
    output = Path(mkdtemp(prefix="sentinela-0015-", dir=args.output_root.resolve()))
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith("PG")}
    env["PGCLIENTENCODING"] = "UTF8"
    env["LC_MESSAGES"] = env["LANG"] = "C"
    exe = ".exe" if os.name == "nt" else ""
    steps = []

    def command(user, database="postgres"):
        return [str(args.pg_bin / f"psql{exe}"), "-XwqAt", "-h", "127.0.0.1", "-p", str(args.port), "-U", user,
                "-d", database, "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"]

    def psql(user, *params, check=True, database="postgres"):
        # SQL goes through stdin as UTF-8: Windows would re-encode non-ASCII command-line arguments.
        sql = params[1] if params[:1] == ("-c",) else None
        result = subprocess.run([*command(user, database), *(map(str, params) if sql is None else ())], input=sql,
                                capture_output=True, encoding="utf8", errors="replace", env=env, timeout=600)
        if check and result.returncode:
            raise RuntimeError(result.stderr.strip())
        return result

    def data(statement, user="bootstrap", database="postgres"):
        return json.loads(psql(user, "-c", statement, database=database).stdout.strip().splitlines()[-1])

    def as_role(role, statement, session=None, check=True):
        login = {"Administrador": "sentinela_local_admin", "Operador": "sentinela_local_operator",
                 "Analista": "sentinela_local_analyst"}[role]
        prefix = f"SET sentinela.import_session = '{session or SESSIONS[role]}';\n" if session != "" else ""
        result = psql(login, "-c", prefix + statement, check=check)
        return json.loads(result.stdout.strip().splitlines()[-1]) if check else result

    def call(function, *params, role="Administrador", session=None):
        values = ",".join(literal(p) if not isinstance(p, dict | list) else literal(json.dumps(p)) + "::jsonb" for p in params)
        return as_role(role, f"SELECT sentinela_classificacao.{function}({values})", session)

    def refused(function, *params, role="Administrador", session=None, sqlstate="42501"):
        values = ",".join(literal(p) if not isinstance(p, dict | list) else literal(json.dumps(p)) + "::jsonb" for p in params)
        result = as_role(role, f"SELECT sentinela_classificacao.{function}({values})", session, check=False)
        return result.returncode != 0 and sqlstate in result.stderr

    def expect(condition, label):
        if not condition:
            raise RuntimeError(label)
        steps.append(label)

    identity = data("""SELECT jsonb_build_array(current_user,inet_server_port(),current_setting('data_directory'),
      current_setting('server_version_num'),pg_is_in_recovery(),(SELECT max(versao) FROM sentinela.schema_migrations),
      (SELECT count(*) FROM sentinela.ocorrencias),sentinela_ambiente.vinculado())""")
    if identity[:2] != ["bootstrap", args.port] or Path(identity[2]).resolve() != args.data_directory.resolve() \
            or identity[3:] != ["170011", False, "0011", 0, True]:
        raise SystemExit("Disposable cluster identity or state did not match")
    for prior in args.prior:
        psql("postgres", "-f", prior)
        steps.append(f"migration anterior aplicada antes do ensaio: {prior.name}")

    psql("bootstrap", "-c", fixture())
    psql("bootstrap", "-c", f"""CREATE SCHEMA supabase_migrations AUTHORIZATION postgres;
      CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text);
      ALTER TABLE supabase_migrations.schema_migrations OWNER TO postgres;
      INSERT INTO supabase_migrations.schema_migrations VALUES ('{PHYSICAL_BEFORE}',NULL,'0014_gestao_usuarios_institucionais');""")
    postgis = data("SELECT to_jsonb(extensions.postgis_lib_version())")

    def package(source, after, version, ending="COMMIT"):
        text, digest_value = render(after, version, postgis, source=source)
        if ending != "COMMIT":
            text = text[: text.rindex("COMMIT;\n")] + ending + ";\n"
        path = output / f"{source.stem}-{version}-{ending.lower()}.sql"
        path.write_text(text, encoding="utf8", newline="\n")
        return path, digest_value

    s0 = data(STATE)
    conflict = sum(t["associacoes"] for t in JANUARY["triplas"] if t["natureza_original"] == "PORTE DE ARMA")
    expect(s0["status"] == {"2021-01-01/pendente": 6392, "2021-02-01/pendente": 73, "/pendente": 1}
           and s0["pend"]["classificacao/aberta"] == 6393 and conflict == 14,
           "fixture: janeiro com 6.392 associações importadas pendentes (36 triplas reais), 1 manual, 6.393 pendências de classificação")

    # Verifiable backup before the migration, restored into a separate database and compared.
    dump = output / "antes-0015.dump"
    subprocess.run([str(args.pg_bin / f"pg_dump{exe}"), "-h", "127.0.0.1", "-p", str(args.port), "-U", "bootstrap", "-d", "postgres",
                    "-Fc", "-f", str(dump)], check=True, env=env, capture_output=True)
    listing = subprocess.run([str(args.pg_bin / f"pg_restore{exe}"), "--list", str(dump)], check=True, env=env,
                             capture_output=True, encoding="utf8").stdout
    psql("bootstrap", "-c", "CREATE DATABASE restauracao_0015")
    restore = subprocess.run([str(args.pg_bin / f"pg_restore{exe}"), "-h", "127.0.0.1", "-p", str(args.port), "-U", "bootstrap",
                              "-d", "restauracao_0015", "--exit-on-error", str(dump)], env=env, capture_output=True, encoding="utf8")
    restored = data(STATE, database="restauracao_0015") if restore.returncode == 0 else None
    expect(restore.returncode == 0 and "TABLE DATA sentinela ocorrencia_naturezas" in listing
           and {k: v for k, v in restored.items()} == s0,
           "backup pg_dump verificável: restaurado em banco separado com os mesmos SHA-256 de dados e pendências")
    psql("bootstrap", "-c", "DROP DATABASE restauracao_0015")

    c0 = data(CATALOG)
    psql("postgres", "-f", package(MIGRATION, PHYSICAL_BEFORE, "20261127200000", "ROLLBACK")[0])
    expect(data(STATE) == s0 and data(CATALOG) == c0, "pacote 0015 completo com ROLLBACK não deixa efeito (dados e catálogo)")
    stale = psql("postgres", "-f", package(MIGRATION, "20261127100809", "20261127200001")[0], check=False)
    expect(stale.returncode != 0 and data(CATALOG) == c0, "guarda do pacote recusa histórico físico divergente sem efeito")

    started = time.perf_counter()
    path, migration_sha = package(MIGRATION, PHYSICAL_BEFORE, "20261127200002")
    psql("postgres", "-f", path)
    elapsed = round(time.perf_counter() - started, 2)
    ledgers = data("""SELECT jsonb_build_array((SELECT max(versao) FROM sentinela.schema_migrations),
      (SELECT jsonb_build_array(version,name) FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1))""")
    expect(ledgers == ["0015", ["20261127200002", "0015_classificacao_pcdf_v2"]], "0015 registrada nos históricos lógico e físico")
    s1 = data(STATE)
    proposal = data("""SELECT jsonb_build_array(
      (SELECT count(*) FROM sentinela.categorias_criminais WHERE versao_catalogo='sentinela-categorias-v2' AND status='pendente'),
      (SELECT count(*) FROM sentinela.mapeamentos_natureza WHERE versao='pcdf-classificacao-v2' AND status='pendente'),
      (SELECT count(*) FROM pg_class WHERE relnamespace='sentinela_classificacao'::regnamespace AND relkind='r' AND relrowsecurity AND relforcerowsecurity),
      (SELECT array_agg(versao ORDER BY versao) FROM sentinela.schema_migrations)::text[] @> ARRAY['0015'],
      (SELECT jsonb_object_agg(r, has_schema_privilege(r,'sentinela_classificacao','USAGE'))
         FROM unnest(ARRAY['anon','authenticated','service_role','sentinela_local_analyst','sentinela_local_operator','sentinela_local_admin']) r))""")
    expect(s1 == s0, "aplicação da 0015 não altera associações, pendências, ocorrências, linhas, naturezas nem lotes")
    expect(proposal[:4] == [23, 43, 3, True], "proposta instalada pendente: 23 categorias, 43 regras; RLS forçada nas 3 tabelas novas; 0015 registrada")
    expect(proposal[4] == {"anon": False, "authenticated": False, "service_role": False, "sentinela_local_analyst": False,
                           "sentinela_local_operator": True, "sentinela_local_admin": True},
           "schema novo: sem acesso para anon/authenticated/service_role/Analista")
    expect(s1["forced_rls"] == 19, "RLS forçada mantida nas 19 tabelas de sentinela")
    again = psql("postgres", "-f", MIGRATION, check=False)
    expect(again.returncode != 0 and data(STATE) == s1, "reaplicação da 0015 recusada pela pré-condição, sem efeito")

    # Profiles and identity: only the verified Administrador session acts; nothing comes from the client.
    expect(as_role("Operador", "SELECT sentinela_classificacao.situacao()")["proposta"] == {"categorias": 23, "regras": 43},
           "Operador lê a situação")
    expect(refused("situacao", role="Analista"), "Analista sem EXECUTE em situacao()")
    homologation = (VERSION, rules(), REASON, time.strftime("%Y-%m-%d"), None, "70" * 32)
    expect(refused("homologar", *homologation, role="Operador"), "Operador recebe 42501 ao homologar")
    expect(refused("aplicar_lote", LOT, REASON, role="Operador"), "Operador recebe 42501 ao aplicar")
    expect(refused("homologar", *homologation, session=""), "Administrador sem sessão Auth verificada recebe 42501")
    expect(refused("homologar", *homologation, session=SESSIONS["Operador"]),
           "sessão Auth de outro perfil no login do Administrador recebe 42501 (identificador forjado)")
    expect(call("aplicar_lote", LOT, REASON) == {"aplicada": False, "motivo": "sem_versao_ativa"} and data(STATE) == s1,
           "sem versão ativa a aplicação não altera nada")

    result = call("homologar", *homologation)
    expect(result == {"versao": VERSION, "homologadas": 42, "naoClassificaveis": 1},
           "homologação v2.0: 42 regras homologadas e PORTE DE ARMA conflitante, com responsável, evidência e vigência")
    expect(refused("homologar", *homologation, sqlstate="23505"), "versão homologada é imutável: repetir a versão retorna 23505")
    write = as_role("Administrador", "UPDATE sentinela_classificacao.versoes SET evidencia='alterada'", check=False)
    expect(write.returncode != 0, "Administrador não altera o registro de homologação diretamente")
    future = ("pcdf-classificacao-v2.1", rules()[:1], REASON, "2099-01-01", None, "70" * 32)
    call("homologar", *future)
    expect(refused("ativar", "pcdf-classificacao-v2.1", sqlstate="22023"), "versão fora da vigência não pode ser ativada")
    expect(call("ativar", VERSION) == {"versaoAtiva": VERSION}, "versão v2.0 ativada explicitamente")

    # Concurrency: two simultaneous applications on the same lot serialize on the advisory lock.
    login = command("sentinela_local_admin")
    session = f"SET sentinela.import_session = '{SESSIONS['Administrador']}';"
    first = subprocess.Popen([*login, "-c", session + f"BEGIN; SELECT sentinela_classificacao.aplicar_lote('{LOT}','{REASON}');"
                              " SELECT pg_sleep(4); COMMIT;"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding="utf8", env=env)
    time.sleep(1.5)
    impatient = subprocess.run([*login, "-c", session + "SET lock_timeout='1s';"
                               f" SELECT sentinela_classificacao.aplicar_lote('{LOT}','{REASON}')"], capture_output=True, encoding="utf8", env=env)
    waiting = subprocess.run([*login, "-c", session + f" SELECT sentinela_classificacao.aplicar_lote('{LOT}','{REASON}')"],
                             capture_output=True, encoding="utf8", env=env)
    out, err = first.communicate(timeout=300)
    if first.returncode:
        raise RuntimeError(err)
    applied = json.loads([line for line in out.splitlines() if line.startswith("{")][0])
    expect(impatient.returncode != 0 and "55P03" in impatient.stderr, "aplicação concorrente com lock_timeout recebe 55P03 sem efeito")
    second = json.loads(waiting.stdout.strip().splitlines()[-1])
    expect(second == {"aplicada": True, "versao": VERSION, "mapeadas": 0, "conflitantes": 0, "semCorrespondencia": 0,
                      "desconhecidas": 0, "pendenciasResolvidas": 0, "pendenciasCriadas": 0},
           "aplicação concorrente que espera o lock é idempotente (nada a classificar)")
    expect(applied == {"aplicada": True, "versao": VERSION, "mapeadas": 6378, "conflitantes": 14, "semCorrespondencia": 0,
                       "desconhecidas": 0, "pendenciasResolvidas": 6378, "pendenciasCriadas": 0},
           "janeiro: 6.378 classificadas, 14 conflitantes, 6.378 pendências resolvidas, nenhuma criada")
    s2 = data(STATE)
    expect(s2["status"] == {"2021-01-01/mapeada": 6378, "2021-01-01/conflitante": 14, "2021-02-01/pendente": 73, "/pendente": 1},
           "associação manual permanece pendente e fevereiro não é tocado")
    expect(s2["pend"]["classificacao/aberta"] == 15 and s2["pend"]["classificacao/resolvida"] == 6378
           and s2["pend"]["coordenadas/aberta"] == s0["pend"]["coordenadas/aberta"],
           "pendências: 14 conflitantes + 1 de linha sem associação abertas, 6.378 resolvidas, coordenadas preservadas")
    expect(all(s2[k] == s0[k] for k in ("ocorrencias", "linhas", "naturezas", "lotes")),
           "ocorrências, linhas de origem, naturezas e lotes da PCDF inalterados (SHA-256)")
    expect(s2["historico"] == 2 * 6378 + 14 and s2["eventos"].get("catalogo.classificacao.pendencia_resolvida") == 6378
           and s2["eventos"].get("catalogo.classificacao.aplicada") == 1,
           "histórico: 2 registros por classificada + 1 por conflitante; 1 evento por pendência resolvida; 1 evento de aplicação")
    integrity = data(INTEGRITY)
    expect(integrity == {"mapeadas_sem_regra_homologada": 0, "mapeadas_sem_historico": 0, "resolvidas_sem_evento": 0,
                         "pendencias_orfas": 0, "regras_v2": {"homologado": 42, "conflitante": 1}, "categorias_v2": 23},
           "integridade referencial: regra homologada da versão ativa, histórico, eventos e pendências consistentes")

    # Atomic rollback inside the import transaction: a later failure undoes the application.
    failed = psql("sentinela_local_admin", "-c", session + f"BEGIN; SELECT sentinela_classificacao.aplicar_lote('{LOT2}','{REASON}');"
                  " SELECT 1/0; COMMIT;", check=False)
    expect(failed.returncode != 0 and data(STATE) == s2, "falha posterior na mesma transação desfaz a aplicação (rollback atômico)")

    # Next lot (automatic application after a confirmed import): unknown pair stays pending with a review item.
    result = call("aplicar_lote", LOT2, "Aplicacao automatica da versao homologada na importacao confirmada.")
    expect(result == {"aplicada": True, "versao": VERSION, "mapeadas": 70, "conflitantes": 2, "semCorrespondencia": 0,
                      "desconhecidas": 1, "pendenciasResolvidas": 0, "pendenciasCriadas": 3},
           "lote seguinte: 70 classificadas, 2 conflitantes e 1 desconhecida; 3 pendências criadas só onde necessário")
    s3 = data(STATE)
    expect(s3["status"]["2021-02-01/pendente"] == 1, "par desconhecido não recebe classificação artificial")
    expect(call("aplicar_lote", LOT2, REASON)["pendenciasCriadas"] == 0 and data(STATE)["pend"] == s3["pend"],
           "reaplicação no mesmo lote (reimportação) não duplica pendências")

    # Screens: summary lists the homologated categories and the list filters by category.
    summary = as_role("Administrador", "SELECT sentinela_ocorrencias_local.resumo()")
    homicide = as_role("Administrador", """SELECT sentinela_ocorrencias_local.lista('consolidadas','{"categoria":"Homicídio"}',1,'data','desc')""")
    expected = data("""SELECT to_jsonb(count(DISTINCT c.id)) FROM sentinela_ocorrencias_local.consolidadas c
      JOIN sentinela.ocorrencia_naturezas a ON a.ocorrencia_id=c.id JOIN sentinela.mapeamentos_natureza m ON m.id=a.mapeamento_id
      JOIN sentinela.categorias_criminais k ON k.id=m.categoria_id WHERE k.nome='Homicídio' AND k.status='homologada'""")
    expect("Homicídio" in summary.get("categoriasConsolidadas", []) and homicide["total"] == expected,
           f"Ocorrências: resumo lista categorias homologadas e o filtro por categoria retorna {expected} registros")
    analyst = as_role("Analista", "SELECT sentinela_ocorrencias_local.resumo()")
    expect(analyst["categoriasConsolidadas"] == summary["categoriasConsolidadas"], "Analista vê as mesmas categorias homologadas")

    # Reversal and reapplication.
    started = time.perf_counter()
    reverted = call("reverter_lote", LOT, VERSION, "Reversao ensaiada da classificacao de janeiro.")
    reversal_seconds = round(time.perf_counter() - started, 2)
    s4 = data(STATE)
    expect(reverted == {"versao": VERSION, "revertidas": 6392, "pendenciasReabertas": 6378}
           and s4["status"]["2021-01-01/pendente"] == 6392 and s4["pend"]["classificacao/aberta"] == 6393 + 3,
           "reversão compensatória: 6.392 associações pendentes e 6.378 pendências reabertas, histórico preservado")
    started = time.perf_counter()
    reapplied = call("aplicar_lote", LOT, "Reaplicacao ensaiada apos reversao.")
    january_seconds = round(time.perf_counter() - started, 2)
    expect(reapplied == applied, "reaplicação após reversão reproduz 6.378/14")
    expect(data(INTEGRITY)["mapeadas_sem_regra_homologada"] == 0 and data(STATE)["forced_rls"] == 19,
           "integridade e RLS forçada mantidas após reversão e reaplicação")

    # Schema reversal (0016): refused while v2 classifications exist; after the lots are reverted it restores the catalog.
    blocked = psql("postgres", "-f", package(REVERSAL, "20261127200002", "20261127200003")[0], check=False)
    expect(blocked.returncode != 0 and "reverta os lotes" in blocked.stderr, "0016 recusada enquanto houver associações classificadas pela v2")
    call("reverter_lote", LOT, VERSION, "Reversao antes da remocao do esquema.")
    call("reverter_lote", LOT2, VERSION, "Reversao antes da remocao do esquema.")
    path, reversal_sha = package(REVERSAL, "20261127200002", "20261127200004")
    psql("postgres", "-f", path)
    c2 = data(CATALOG)
    s5 = data(STATE)
    expect({k: v for k, v in c2.items() if k != "ledger"} == {k: v for k, v in c0.items() if k != "ledger"},
           "0016 restaura o catálogo completo anterior à 0015 (funções, policies, ACLs, RLS, papéis)")
    expect(s5["status"] == s0["status"] and all(s5[k] == s0[k] for k in ("ocorrencias", "linhas", "naturezas", "lotes"))
           and s5["forced_rls"] == 19, "após reverter lotes e esquema: associações pendentes, dados PCDF intactos, RLS em 19 tabelas")
    expect(s5["historico"] > s0["historico"] and s5["eventos"].get("catalogo.classificacao.revertida") == 3,
           "histórico e eventos de auditoria preservados após a 0016")
    final_ledgers = data("""SELECT jsonb_build_array((SELECT max(versao) FROM sentinela.schema_migrations),
      (SELECT name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1))""")
    expect(final_ledgers == ["0016", "0016_reverte_0015"], "0016 registrada nos dois históricos; 0015 permanece no histórico imutável")

    evidence = {"synthetic": True, "migration_sha256": migration_sha, "reversal_sha256": reversal_sha, "postgres": "17.11", "migration": MIGRATION.name, "migration_seconds": elapsed,
                "january_application_seconds": january_seconds, "january_reversal_seconds": reversal_seconds,
                "backup_bytes": dump.stat().st_size, "january": applied, "february": result, "reverted": reverted, "steps": steps}
    (output / "evidence.json").write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    print(json.dumps(evidence, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        raise SystemExit(f"FALHA: {error}")
