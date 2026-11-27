"""Qualify the scoped approval and deletion on a verified disposable clone."""
from argparse import ArgumentParser
from hashlib import sha256
import json
import os
from pathlib import Path
import secrets
import subprocess
from uuid import UUID, uuid4

from direct_runtime import ROLES
from operational_clone import CLONE, address, attest_clone, digest, existing_root, pg, query, secret, stop_clone
from pilot_recovery import scram

REPO = Path(__file__).resolve().parents[3]
JANUARY = "a88ac192-edef-4339-8381-106bbd1b391e"
SUBJECT = "29e7ec39-192b-4790-9180-3df950969bfc"
PROOF = "fa4ed26293a1e09e49b35963fedd58a37f0f72c29e2bade7386d4bdd96b08108"
EMAIL = "admin.clone@example.test"


def rebind_clone(password, restored, source):
    query(CLONE, password, f"""
      BEGIN;
      UPDATE sentinela_gestao_autorizacao.release
        SET porta={CLONE},cluster_uuid='{UUID(restored["uuid"])}',system_id='{int(restored["system"])}'
        WHERE singleton AND porta=55484 AND cluster_uuid='{UUID(source["uuid"])}' AND system_id='{int(source["system"])}';
      DO $clone$
      DECLARE f regprocedure; p record;
      BEGIN
        IF inet_server_port()<>55487 THEN RAISE EXCEPTION 'Destino diferente do clone'; END IF;
        FOREACH f IN ARRAY ARRAY['sentinela_exclusao.exigir_ambiente()'::regprocedure,
          'sentinela.impedir_mutacao()'::regprocedure,'sentinela.bloquear_correcao_sem_backend()'::regprocedure]
        LOOP
          EXECUTE replace(pg_get_functiondef(f),'55484','55487');
        END LOOP;
        FOR p IN SELECT * FROM pg_policies WHERE schemaname IN ('sentinela','sentinela_exclusao','sentinela_import_local')
          AND policyname IN ('exclusao_leitura','exclusao_remocao','exclusao_vinculos','comprovantes_leitura','comprovantes_insercao')
        LOOP
          IF p.qual IS NOT NULL THEN
            EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)',p.policyname,p.schemaname,p.tablename,replace(p.qual,'55484','55487'));
          END IF;
          IF p.with_check IS NOT NULL THEN
            EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)',p.policyname,p.schemaname,p.tablename,replace(p.with_check,'55484','55487'));
          END IF;
        END LOOP;
      END $clone$;
      COMMIT;
    """)


def seed_edit_fixture(password, credentials, account):
    extraction, lot, run, origin, stage = (str(uuid4()) for _ in range(5))
    file = "homologacao-edicao.csv"
    query(CLONE, password, f"""
      BEGIN;
      UPDATE sentinela_gestao_autorizacao.atores SET conta='{account}' WHERE usuario='{SUBJECT}';
      {''.join(f"ALTER ROLE {role} PASSWORD '{scram(value)}';" for role, value in credentials.items())}
      INSERT INTO sentinela.extracoes_origem(id,fonte,nome_xml,sha256_xml,tamanho_bytes,referencia_arquivo,metodologia)
        VALUES('{extraction}','PCDF','ensaio.xml','{sha256(extraction.encode()).hexdigest()}',1,'homologacao:clone','pcdf-csv-local-v1');
      INSERT INTO sentinela.lotes_importacao(id,extracao_id,nome_arquivo,sha256_arquivo,tamanho_bytes,
        referencia_arquivo,versao_contrato,versao_tratamento,competencia,solicitado_por)
        VALUES('{lot}','{extraction}','{file}','{sha256(lot.encode()).hexdigest()}',1,'homologacao:clone','1.0',
          'homologacao','2025-07-01','{SUBJECT}');
      INSERT INTO sentinela.execucoes_importacao(id,lote_id,extracao_id,tentativa,solicitado_por,
        versao_importador,versao_validacao,status,linhas_lidas,linhas_processadas,linhas_bloqueadas,finalizado_em)
        VALUES('{run}','{lot}','{extraction}',1,'{SUBJECT}','pcdf-local-v1','pcdf-local-v1','concluida',1,1,1,clock_timestamp());
      INSERT INTO sentinela.linhas_origem(id,extracao_id,linha_origem_id,aba_origem,linha_xml,versao_identificador,natureza_original)
        VALUES('{origin}','{extraction}','{origin}','NATUREZAS',1,'pcdf-linha-v1','Natureza de ensaio');
      INSERT INTO sentinela.linhas_staging(id,execucao_id,lote_id,extracao_id,linha_origem_id,registro_csv,
        campos_csv,derivados_efetivos,diagnosticos,estado)
        SELECT '{stage}','{run}','{lot}','{extraction}','{origin}',1,campos_csv,
          '{{"local":"Local de ensaio"}}','[]','bloqueada'
        FROM sentinela.linhas_staging WHERE lote_id='{JANUARY}' ORDER BY id LIMIT 1;
      COMMIT;
    """)
    return {"lot": lot, "file": file, "stage": stage}


def qualify(root):
    snapshot = json.loads((root / "backup.json").read_text(encoding="utf-8"))
    restored = json.loads((root / f"identity-{CLONE}.json").read_text(encoding="utf-8"))
    original = snapshot["origin"]
    password = secret(root, f"admin-{CLONE}.dpapi")
    assert digest(root / "origem.dump") == snapshot["sha256"]
    assert attest_clone(root, CLONE, password, restored["uuid"], original)["system"] == restored["system"]
    try:
        rebind_clone(password, restored, original)
        sql = (REPO / "database/release/authorize-pcdf-january-2021.psql").read_text(encoding="utf-8")
        guard = "inet_server_port() IS DISTINCT FROM 55484"
        assert sql.count(guard) == 1
        pg("psql", "-X", "-qAt", *address(CLONE), "-v", f"expected_uuid={restored['uuid']}",
           "-v", f"expected_system={restored['system']}", "-v", f"prova_restauracao={PROOF}",
           "-f", "-", password=password, input=sql.replace(guard, f"inet_server_port() IS DISTINCT FROM {CLONE}"))
        credentials = {role: secrets.token_hex(32) for role in ROLES}
        account = sha256(json.dumps(["sentinela-local", "Administrador", EMAIL], separators=(",", ":")).encode()).hexdigest()
        edit = seed_edit_fixture(password, credentials, account)
        env = {key: value for key, value in os.environ.items()
               if not key.upper().startswith(("PG", "SENTINELA_", "SUPABASE", "NEXT_PUBLIC_SUPABASE"))}
        env.update(SENTINELA_OPERATIONAL_CLONE_ROOT=str(root), SENTINELA_CLONE_ADMIN_PASSWORD=password,
                   SENTINELA_CLONE_BROWSER_CASE=json.dumps({
                       "edit": edit, "lot": {"id": JANUARY}, "protected": [JANUARY],
                       "subject": SUBJECT, "account": account, "protectedRemoval": True, "editOnly": True,
                       "proof": {"backup": PROOF, "restoredTables": snapshot["tables"]},
                   }))
        env.update({"SENTINELA_PCDF_LOCAL_PASSWORD_" + role: value for role, value in credentials.items()})
        subprocess.run(["node", "scripts/check-operational-clone.mjs"], cwd=REPO, env=env, check=True)
    finally:
        stop_clone(root, CLONE, password, restored["uuid"], original)


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("clone")
    args = parser.parse_args()
    if not __debug__:
        raise SystemExit("Execute com as verificações Python ativas.")
    directory = existing_root(args.clone)
    try:
        qualify(directory)
    except subprocess.CalledProcessError as error:
        if error.stderr:
            (directory / "january-qualification-error.log").write_text(error.stderr, encoding="utf-8")
        raise SystemExit(f"Qualificação do clone encerrou com código {error.returncode}.") from None
