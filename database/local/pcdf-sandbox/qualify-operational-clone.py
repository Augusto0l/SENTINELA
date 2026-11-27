"""Apply and exercise the existing operational delta exclusively on a verified clone."""

from argparse import ArgumentParser
from concurrent.futures import ThreadPoolExecutor
import csv
from hashlib import sha256
from io import StringIO
import json
import os
from pathlib import Path
import runpy
import secrets
import subprocess
from uuid import UUID, uuid4

from direct_runtime import ROLES
from direct_input import prepare_direct
from operational_clone import CLONE, attest_clone, digest, existing_root, pg, query, secret
from pipeline import HEADERS
from pilot_recovery import scram

REPO = Path(__file__).resolve().parents[3]
APPLY = REPO / "database/release/render-operational-import-management.py"
EMAIL = "admin.clone@example.test"


def qualify(root, edit_only=False):
    backup = json.loads((root / "backup.json").read_text(encoding="utf-8"))
    saved = json.loads((root / f"identity-{CLONE}.json").read_text(encoding="utf-8"))
    password = secret(root, f"admin-{CLONE}.dpapi")
    source = backup["origin"]

    def attest():
        current = attest_clone(root, CLONE, password, saved["uuid"], source)
        assert (current["system"], current["start"], current["postgis"]) == (saved["system"], saved["start"], "3.6.2")
        return current

    identity = attest()
    assert digest(root / "origem.dump") == backup["sha256"]
    installed = query(CLONE, password, "SELECT to_regclass('sentinela_gestao_autorizacao.release') IS NOT NULL;") == "t"
    if installed:
        assert edit_only, "Clone restaurado com delta só admite a qualificação de edição."
        source_scope = f"porta={int(source['port'])} AND cluster_uuid='{UUID(source['uuid'])}' AND system_id='{int(source['system'])}'"
        clone_scope = f"porta={CLONE} AND cluster_uuid='{UUID(identity['uuid'])}' AND system_id='{int(identity['system'])}'"
        assert query(CLONE, password, f"""
          UPDATE sentinela_gestao_autorizacao.release
          SET porta={CLONE},cluster_uuid='{UUID(identity["uuid"])}',system_id='{int(identity["system"])}'
          WHERE singleton AND NOT aberta AND (({source_scope}) OR ({clone_scope}))
          RETURNING porta;
        """) == str(CLONE)
        # Rebind only the read path for preview. Delete policies and triggers retain the source port.
        guard = query(CLONE, password, "SELECT pg_get_functiondef('sentinela_exclusao.exigir_ambiente()'::regprocedure);")
        original = f"inet_server_port() IS DISTINCT FROM {int(source['port'])}"
        replacement = f"inet_server_port() IS DISTINCT FROM {CLONE}"
        assert guard.count(original) + guard.count(replacement) == 1
        query(CLONE, password, guard.replace(original, replacement))
        query(CLONE, password, f"""
          DO $$
          DECLARE p record;
          BEGIN
            FOR p IN SELECT schemaname,tablename,policyname,qual FROM pg_policies
              WHERE cmd='SELECT' AND policyname IN ('exclusao_leitura','exclusao_vinculos','comprovantes_leitura')
                AND schemaname IN ('sentinela','sentinela_exclusao','sentinela_import_local')
                AND strpos(qual,'inet_server_port() = {int(source['port'])}') > 0
            LOOP
              EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)',p.policyname,p.schemaname,p.tablename,
                replace(p.qual,'inet_server_port() = {int(source['port'])}','inet_server_port() = {CLONE}'));
            END LOOP;
          END $$;
        """)
    else:
        qualify_install(root, password, identity, attest)
    assert query(CLONE, password, """SELECT NOT aberta FROM sentinela_gestao_autorizacao.release
      WHERE singleton AND NOT EXISTS(SELECT FROM sentinela_exclusao.vinculos_inesperados());""") == "t"

    qualify_features(root, backup, password, identity, attest, edit_only)


def qualify_install(root, password, identity, attest):
    reader = query(CLONE, password, """BEGIN READ ONLY; SET LOCAL search_path=pg_catalog,pg_temp;
       SELECT md5(pg_get_functiondef('sentinela_ocorrencias_local.lista(text,jsonb,integer,text,text)'::regprocedure));
       ROLLBACK;""")
    render = runpy.run_path(str(APPLY))["render"]
    sql = render(CLONE)
    sql_file = root / "delta-clone.sql"
    if sql_file.exists():
        assert sql_file.read_text(encoding="utf-8") == sql
    else:
        with sql_file.open("x", encoding="utf-8", newline="\n") as target:
            target.write(sql)
    address = ("-X", "-w", "-qAt", "-h", "127.0.0.1", "-p", CLONE, "-U", "postgres",
               "-d", identity["name"], "-v", "ON_ERROR_STOP=1", "-v", "cluster_uuid=" + identity["uuid"],
               "-v", "system_id=" + identity["system"], "-v", "reader_md5=" + reader)
    assert "READ ONLY" in pg("psql", *address, "-f", sql_file, password=password)
    attest()
    assert "gravacao fechada" in pg("psql", *address, "-v", "check_only=off", "-f", sql_file, password=password)
    attest()
    assert "ja instalado" in pg("psql", *address, "-v", "check_only=off", "-f", sql_file, password=password)
    print(json.dumps({"migration": "local-import-management-0001", "cloneSqlSha256": digest(sql_file),
                      "productionSqlSha256": sha256(render().encode()).hexdigest(), "fkCount": 13, "reapplied": True}), flush=True)


def qualify_features(root, backup, password, identity, attest, edit_only):
    subject, institution = str(uuid4()), str(uuid4())
    account = sha256(json.dumps(["sentinela-local", "Administrador", EMAIL], separators=(",", ":")).encode()).hexdigest()
    credentials = {role: secrets.token_hex(32) for role in ROLES}
    attest()
    registration = (REPO / "database/release/register-supabase-institutional-user.psql").read_text(encoding="utf-8")
    assert registration.count("inet_server_port() IS DISTINCT FROM 55484") == 1
    registration = registration.replace("inet_server_port() IS DISTINCT FROM 55484", f"inet_server_port() IS DISTINCT FROM {CLONE}")
    variables = dict(expected_uuid=identity["uuid"], expected_system=identity["system"], usuario=subject,
                     identidade=institution, nome="Identidade de ensaio exclusiva deste clone",
                     aprovacao="Qualificacao autorizada exclusivamente no clone", ativar_edicao="on",
                     conta=account, prova_restauracao=backup["sha256"])
    args = [part for name, value in variables.items() for part in ("-v", f"{name}={value}")]
    pg("psql", "-X", "-qAt", "-w", "-h", "127.0.0.1", "-p", CLONE, "-U", "postgres", "-d", identity["name"],
       *args, "-f", "-", password=password, input=registration)
    query(CLONE, password, "BEGIN; " + "".join(f"ALTER ROLE {role} PASSWORD '{scram(value)}';" for role, value in credentials.items()) + " COMMIT;")

    def as_admin(sql):
        return query(CLONE, password, "SET SESSION AUTHORIZATION sentinela_local_admin;\n" + sql)

    plans = json.loads(as_admin(f"""
      SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'file',l.arquivo,'contract',l.contrato,
        'blockers', (SELECT jsonb_agg(b->>'tipo') FROM jsonb_array_elements(p.data->'bloqueios') b),
        'staging',p.data->'quantidades'->'staging') ORDER BY l.id),'[]')
      FROM jsonb_to_recordset(sentinela_gestao.arquivos('{{"pagina":1}}')->'itens')
        l(id uuid, arquivo text, contrato text)
      CROSS JOIN LATERAL (SELECT sentinela_exclusao.previa(l.id,'{subject}','{account}') AS data OFFSET 0) p;
    """))
    protected = [item for item in plans if "lote_protegido" in (item["blockers"] or [])]
    assert protected
    edit = json.loads(query(CLONE, password, """
      SELECT jsonb_build_object('lot',l.id,'stage',s.id,'file',l.nome_arquivo)
      FROM sentinela.linhas_staging s JOIN sentinela.lotes_importacao l ON l.id=s.lote_id
      JOIN sentinela.extracoes_origem x ON x.id=l.extracao_id
      JOIN sentinela.execucoes_importacao e ON e.id=s.execucao_id
      WHERE x.fonte='PCDF' AND l.versao_contrato='1.0' AND s.estado<>'consolidada' AND e.status='concluida'
        AND NOT EXISTS(SELECT FROM sentinela.ocorrencia_naturezas a WHERE a.linha_origem_id=s.linha_origem_id)
      ORDER BY l.competencia,s.id LIMIT 1;
    """))
    eligible = None if edit_only else next(
        (item for item in plans if not item["blockers"] and item["staging"] and item["id"] != edit["lot"]), None)
    restored_deletion = eligible is not None
    if eligible is None:
        # A clone-only lot shares a real restored origin. The protected intake stays in place.
        derivative, run, stage = str(uuid4()), str(uuid4()), str(uuid4())
        name = "homologacao-compartilhada.csv"
        attest()
        query(CLONE, password, f"""
          BEGIN;
          INSERT INTO sentinela.lotes_importacao(id,extracao_id,nome_arquivo,sha256_arquivo,tamanho_bytes,
            referencia_arquivo,versao_contrato,versao_tratamento,competencia,solicitado_por)
          SELECT '{derivative}',extracao_id,'{name}','{sha256(derivative.encode()).hexdigest()}',tamanho_bytes,
            'homologacao:clone','1.0','homologacao-clone',date_trunc('month',current_date)::date,solicitado_por
          FROM sentinela.lotes_importacao WHERE id='{UUID(edit["lot"])}';
          INSERT INTO sentinela.execucoes_importacao(id,lote_id,extracao_id,tentativa,solicitado_por,
            versao_importador,versao_validacao,status,linhas_lidas,linhas_processadas,linhas_bloqueadas,finalizado_em)
          SELECT '{run}',id,extracao_id,1,solicitado_por,'pcdf-local-v1','pcdf-local-v1','concluida',1,1,1,clock_timestamp()
          FROM sentinela.lotes_importacao WHERE id='{derivative}';
          INSERT INTO sentinela.linhas_staging(id,execucao_id,lote_id,extracao_id,linha_origem_id,registro_csv,
            campos_csv,derivados_efetivos,diagnosticos,estado)
          SELECT '{stage}','{run}','{derivative}',extracao_id,linha_origem_id,registro_csv,campos_csv,derivados_efetivos,diagnosticos,estado
          FROM sentinela.linhas_staging WHERE id='{UUID(edit["stage"])}';
          COMMIT;
        """)
        eligible = {"id": derivative, "file": name}
        if edit_only:
            edit = {"lot": derivative, "file": name, "stage": stage}
    plan = json.loads(as_admin(f"SELECT sentinela_exclusao.previa('{UUID(eligible['id'])}','{subject}','{account}');"))
    assert not plan["bloqueios"] and not plan["autorizada"]
    protected_ids = [str(UUID(x["id"])) for x in protected]
    proof = {"restoredLots": len(plans), "protectedRestoredLots": len(protected_ids),
             "wouldDeleteRestoredLot": restored_deletion, "shared": plan["compartilhadas"],
             "planned": plan["quantidades"]}
    print(json.dumps(proof), flush=True)

    env = {k: v for k, v in os.environ.items() if not k.upper().startswith(("PG", "SENTINELA_", "SUPABASE", "NEXT_PUBLIC_SUPABASE"))}
    env.update({"SENTINELA_OPERATIONAL_CLONE_ROOT": str(root), "SENTINELA_CLONE_ADMIN_PASSWORD": password,
                "SENTINELA_CLONE_BROWSER_CASE": json.dumps({"edit": edit, "lot": eligible, "protected": protected_ids,
                                                         "subject": subject, "account": account, "proof": proof, "editOnly": edit_only})})
    env.update({"SENTINELA_PCDF_LOCAL_PASSWORD_" + role: value for role, value in credentials.items()})
    try:
        subprocess.run(["node", "scripts/check-operational-clone.mjs"], cwd=REPO, check=True, env=env)
    finally:
        attest()
        query(CLONE, password, "UPDATE sentinela_gestao_autorizacao.release SET aberta=false WHERE singleton;")


def reimport(root):
    assert (root / "browser-proof.json").is_file()
    snapshot = json.loads((root / "backup.json").read_text(encoding="utf-8"))
    saved = json.loads((root / f"identity-{CLONE}.json").read_text(encoding="utf-8"))
    password = secret(root, f"admin-{CLONE}.dpapi")
    proof = attest_clone(root, CLONE, password, saved["uuid"], snapshot["origin"])
    assert proof["system"] == saved["system"]
    actor = json.loads(query(CLONE, password, """
      SELECT jsonb_build_object('subject',usuario,'account',conta) FROM sentinela_gestao_autorizacao.atores;
    """))
    subject = str(UUID(actor["subject"]))
    account = actor["account"]
    assert len(account) == 64 and int(account, 16) > 0
    month = "2025-07"
    file_name = f"pcdf_naturezas_{month}.csv"
    buffer = StringIO(newline="")
    writer = csv.DictWriter(buffer, HEADERS, delimiter=";")
    writer.writeheader()
    fields = dict.fromkeys(HEADERS, "")
    fields.update(ano_registro="2025", unidade_registro="UNIDADE DE TESTE", numero_registro="9901",
                  ano_fato="2025", data=month + "-10", horario="09:00:00",
                  data_inicio_fato_original="10/07/2025 09:00:00", natureza_original="Natureza sintética",
                  local="Ensaio de reimportação", ocorrencia_chave='["PCDF","2025","UNIDADE DE TESTE","9901"]',
                  linha_origem_id=sha256(b"clone-reimport-9901").hexdigest(), fonte="PCDF", linha_xml="1",
                  aba_origem="NATUREZAS", versao_tratamento="homologacao-clone",
                  classificacao_status="pendente", coordenada_status="invalida")
    writer.writerow(fields)
    csv_bytes = buffer.getvalue().encode()
    payload = prepare_direct(file_name, csv_bytes)
    metadata = {**{key: payload["batch"][key] for key in ("name", "month", "sha256")},
                "bytes": len(csv_bytes), "records": 1, "manifestSha": None}

    def as_admin(sql):
        return query(CLONE, password, "SET SESSION AUTHORIZATION sentinela_local_admin;\n" + sql)

    def incoming():
        request = str(uuid4())
        output = as_admin(f"""
          BEGIN;
          SELECT sentinela_pcdf_local.attempt('{request}','{account}',
            convert_from(decode('{json.dumps(metadata).encode().hex()}','hex'),'UTF8')::jsonb);
          SELECT sentinela_pcdf_local.receive('{request}',
            convert_from(decode('{json.dumps(payload).encode().hex()}','hex'),'UTF8')::jsonb,
            decode('{csv_bytes.hex()}','hex'),NULL);
          COMMIT;
        """)
        return json.loads(output.splitlines()[-1])

    query(CLONE, password, "UPDATE sentinela_gestao_autorizacao.release SET aberta=true WHERE singleton;")
    try:
        first, replay = incoming(), incoming()
        assert not first["replay"] and replay["replay"] and first["lot"] == replay["lot"]
        lot = str(UUID(first["lot"]))
        plan = json.loads(as_admin(f"SELECT sentinela_exclusao.previa('{lot}','{subject}','{account}');"))
        assert not plan["bloqueios"] and plan["quantidades"]["staging"] == 1
        revision = plan["revisao"]
        assert len(revision) == 64 and int(revision, 16) > 0
        query(CLONE, password, f"""INSERT INTO sentinela_gestao_autorizacao.exclusoes
          VALUES('{lot}','{subject}','{revision}','reimportação na homologação','backup conferido',clock_timestamp()+interval '10 minutes');""")
        command = json.dumps({"acao": "excluir_lote", "id": lot, "confirmacao": lot, "definitiva": True,
                              "revisao": revision, "justificativa": "Reimportação de arquivo criado para o ensaio"}).encode().hex()
        def remove():
            try:
                as_admin(rf"""
                  \set VERBOSITY sqlstate
                  SELECT sentinela_exclusao.excluir(convert_from(decode('{command}','hex'),'UTF8')::jsonb,'{account}','{subject}');
                """)
                return "200"
            except subprocess.CalledProcessError as error:
                assert "P0002" in (error.stderr or "")
                return "404"

        with ThreadPoolExecutor(max_workers=2) as executor:
            pending = [executor.submit(remove) for _ in range(2)]
            assert sorted(attempt.result() for attempt in pending) == ["200", "404"]
        new = incoming()
        assert not new["replay"] and new["lot"] != first["lot"]
        assert query(CLONE, password, f"""
          SELECT NOT EXISTS(SELECT FROM sentinela.lotes_importacao WHERE id='{lot}')
            AND (SELECT count(*) FROM sentinela_exclusao.comprovantes WHERE lote='{lot}')=1
            AND NOT EXISTS(SELECT FROM sentinela_gestao_autorizacao.exclusoes WHERE lote='{lot}');
        """) == "t"
        print("Reenvio idempotente, exclusao concorrente e reimportacao de arquivo de teste confirmados no clone.", flush=True)
    finally:
        query(CLONE, password, "UPDATE sentinela_gestao_autorizacao.release SET aberta=false WHERE singleton;")


if __name__ == "__main__":
    if not __debug__:
        raise SystemExit("Execute com as verificações Python ativas.")
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("clone")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--reimport", action="store_true")
    mode.add_argument("--edit-only", action="store_true")
    args = parser.parse_args()
    directory = existing_root(args.clone)
    try:
        if args.reimport:
            reimport(directory)
        else:
            qualify(directory, edit_only=args.edit_only)
    except subprocess.CalledProcessError as error:
        if error.stderr:
            (directory / "qualification-failure.log").write_text(error.stderr, encoding="utf-8")
        raise SystemExit(f"Etapa do clone encerrou com código {error.returncode}.") from None
