"""Run management qualification on a disposable PostgreSQL 17.11/PostGIS 3.6.2 cluster."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
from getpass import getpass
from hashlib import sha256
from io import StringIO
import json
import os
from pathlib import Path
import secrets
import runpy
import socket
import subprocess
import tempfile
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from urllib.parse import parse_qs, urlsplit

from main_import_migration import render
from manual_catalog_seed import nature_rows, seed_sql, territory_rows
from integrated_restore import qualify_restore
from direct_input import prepare_direct
from pipeline import HEADERS
from qualify_pcdf_nature_catalog import qualify_catalog


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
PORT = 55488
DATABASE = "sentinela_pcdf_local"
POSTGRES = Path("C:/Program Files/PostgreSQL/17/bin")
LOGINS = ("sentinela_local_admin", "sentinela_local_operator", "sentinela_local_analyst")


class GeocoderFixture(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlsplit(self.path).query).get("q", [""])[0]
        if "indisponível" in query:
            self.send_error(503)
            return
        street = "Logradouro de teste" if "Logradouro de teste" in query else "Logradouro sintético"
        result = [{"lat": "-15.7942", "lon": "-47.8825", "place_id": 1,
                   "display_name": f"{street}, Brasília, Distrito Federal",
                   "address": {"state": "Distrito Federal", "country_code": "br", "road": street,
                               "suburb": "Setor sintético"}}]
        if "ambíguo" in query:
            result.append({**result[0], "place_id": 2, "lat": "-15.7961",
                           "display_name": "Segundo resultado sintético, Brasília, Distrito Federal"})
        elif "45" in query:
            result[0]["addresstype"] = "building"
            result[0]["address"]["house_number"] = "45"
            result[0]["display_name"] = f"{query}, Brasília, Distrito Federal"
        elif "sem coordenadas" in query:
            result = []
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())

    def log_message(self, *_):
        pass


def seed_workspace(psql, lots=(("2025-04", "1001"), ("2025-05", "1002")),
                   nature="Natureza sintética de homologação", category=""):
    for month, record in lots:
        output = StringIO(newline="")
        writer = csv.DictWriter(output, HEADERS, delimiter=";")
        writer.writeheader()
        line = dict.fromkeys(HEADERS, "")
        year = month[:4]
        line.update(ano_registro=year, unidade_registro="UNIDADE SINTETICA", numero_registro=record,
                    ano_fato=year, data=month + "-10", horario="09:00:00",
                    data_inicio_fato_original=f"10/{month[-2:]}/{year} 09:00:00",
                    natureza_original=nature, natureza_padronizada_pcdf=category, local="Local sintético",
                    ocorrencia_chave=f'["PCDF","{year}","UNIDADE SINTETICA","{record}"]',
                    fonte="PCDF", linha_xml="1", linha_origem_id=sha256(record.encode()).hexdigest(),
                    aba_origem="NATUREZAS", versao_tratamento="homologacao-local",
                    classificacao_status="pendente", coordenada_status="invalida")
        writer.writerow(line)
        content = output.getvalue().encode()
        name = f"pcdf_naturezas_{month}.csv"
        payload = prepare_direct(name, content)
        metadata = {**{key: payload["batch"][key] for key in ("name", "month", "sha256")},
                    "bytes": len(content), "records": 1, "manifestSha": None}
        request = str(uuid.uuid4())
        psql(DATABASE, "-f", "-", input=f"""
          SET SESSION AUTHORIZATION sentinela_local_admin;
          BEGIN;
          SELECT sentinela_pcdf_local.attempt('{request}',repeat('a',64),
            convert_from(decode('{json.dumps(metadata).encode().hex()}','hex'),'UTF8')::jsonb);
          SELECT sentinela_pcdf_local.receive('{request}',
            convert_from(decode('{json.dumps(payload).encode().hex()}','hex'),'UTF8')::jsonb,
            decode('{content.hex()}','hex'),NULL)->>'lot';
          COMMIT;
          """.encode())


def qualify(browser, recovery, pcdf_v2, serve_password=None, manual_browser=False, operational_delta=False,
            original_catalog=False):
    ports = (PORT, 3318) if browser or manual_browser or serve_password is not None else (PORT,)
    for port in ports:
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            probe.bind(("127.0.0.1", port))
    if pcdf_v2:
        root = Path(tempfile.gettempdir()) / ("sentinela-pcdf-v2-fixture-" + uuid.uuid4().hex)
        root.mkdir()
    else:
        root = Path(tempfile.mkdtemp(prefix="sentinela-occurrence-management-"))
    root = root.resolve(strict=True)
    data = root / "data"
    identity = str(uuid.uuid4())
    password = secrets.token_hex(32)
    secret = root / "setup-password"
    secret.write_text(password, encoding="ascii")
    env = {k: v for k, v in os.environ.items()
           if not k.upper().startswith(("PG", "SENTINELA_", "SUPABASE", "NEXT_PUBLIC_SUPABASE"))}

    def pg(executable, *args, **kwargs):
        return subprocess.run([str(POSTGRES / (executable + ".exe")), *map(str, args)],
                              check=True, cwd=REPO, env=env, **kwargs)

    def psql(database, *args, **kwargs):
        return pg("psql", "-X", "-w", "-qAt", "-h", "127.0.0.1", "-p", PORT, "-U", "postgres",
                  "-d", database, "-P", "pager=off", "-v", "ON_ERROR_STOP=1", "-v", "expected_uuid=" + identity,
                  *args, **kwargs)

    def install(path, original_guard=None):
        if original_guard is None:
            psql(DATABASE, "-f", path)
            return
        content = path.read_text(encoding="utf-8")
        if content.count(original_guard) != 1:
            raise ValueError("Unexpected local prerequisite listener guard")
        psql(DATABASE, "-f", "-", input=content.replace(original_guard, f"inet_server_port() <> {PORT}").encode())

    pg("initdb", "-D", data, "-U", "postgres", "--encoding=UTF8", "--locale=C", "--auth=scram-sha-256",
       "--pwfile=" + str(secret), stdout=subprocess.DEVNULL)
    with (data / "postgresql.auto.conf").open("a", encoding="ascii") as conf:
        conf.write(f"listen_addresses='127.0.0.1'\nport={PORT}\nsentinela.sandbox_uuid='{identity}'\n")
    pg("pg_ctl", "-D", data, "-l", root / "postgres.log", "-w", "start",
       creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if serve_password is not None else 0)
    try:
        env.update(PGPASSWORD=password, PGCLIENTENCODING="UTF8")
        psql("postgres", "-c", f"CREATE DATABASE {DATABASE} TEMPLATE template0 ENCODING 'UTF8'")
        psql(DATABASE, "-c", "CREATE SCHEMA extensions; CREATE EXTENSION postgis WITH SCHEMA extensions VERSION '3.6.2';")
        install(REPO / "database/supabase/baseline/0001_modelo_inicial.sql")
        install(HERE / "direct.sql", "inet_server_port() <> 55484")
        if operational_delta:
            psql(DATABASE, "-f", "-", input=("BEGIN;\n" + render() + "\nCOMMIT;").encode())
            install(HERE / "occurrences-read.sql", "inet_server_port() NOT IN (55484,55486)")
            seed_workspace(psql, (("2025-04", "1001"), ("2025-05", "1002"), ("2021-01", "9001")))
            deploy = runpy.run_path(str(REPO / "database/release/render-operational-import-management.py"))["render"]
            inventory = psql(DATABASE, "-c", """
              SET search_path=pg_catalog,pg_temp;
              SELECT system_identifier::text||':'||
                md5(pg_get_functiondef('sentinela_ocorrencias_local.lista(text,jsonb,integer,text,text)'::regprocedure))
              FROM pg_control_system();""", capture_output=True).stdout.decode().strip().split(":")
            operation = ("-v", "cluster_uuid=" + identity, "-v", "reader_md5=" + inventory[1], "-f", "-")
            sql = deploy(PORT).encode()
            for system, revision in ((inventory[0], "0"*32), ("0"*19, inventory[1])):
                try:
                    psql(DATABASE, "-v", "system_id=" + system, "-v", "cluster_uuid=" + identity,
                         "-v", "reader_md5=" + revision, "-f", "-", input=sql, capture_output=True)
                except subprocess.CalledProcessError as error:
                    assert error.returncode == 3 and b"divergente" in error.stderr, error.stderr
                else:
                    raise AssertionError("O delta aceitou um destino ou reader divergente")
            def deploy_once(*options):
                return psql(DATABASE, "-v", "system_id=" + inventory[0], *options, *operation,
                            input=sql, capture_output=True).stdout

            assert b"READ ONLY" in deploy_once()
            schema_absent = psql(DATABASE, "-c", "SELECT to_regnamespace('sentinela_gestao_autorizacao') IS NULL",
                                 capture_output=True).stdout.strip()
            assert schema_absent == b"t"
            try:
                deploy_once("-v", "check_only=typo")
            except subprocess.CalledProcessError as error:
                assert error.returncode == 3
            else:
                raise AssertionError("O delta aceitou argumento check_only inválido")
            with ThreadPoolExecutor(max_workers=2) as installers:
                pending = [installers.submit(deploy_once, "-v", "check_only=off") for _ in range(2)]
                outputs = [result.result() for result in pending]
            assert sum(b"instalado com gravacao fechada" in result for result in outputs) == 1, outputs
            assert sum(b"ja instalado e conferido" in result for result in outputs) == 1, outputs
            assert b"ja instalado e conferido" in deploy_once("-v", "check_only=on")
            print("Preflight somente leitura e reaplicacao concorrente confirmados.", flush=True)
            env.update(SENTINELA_OPER_DELTA_FIXTURE=str(root), SENTINELA_OPER_DELTA_UUID=identity,
                       SENTINELA_OPER_DELTA_SYSTEM=inventory[0])
            subprocess.run(["node", "--experimental-transform-types", "--test",
                            "tests/operational-import-management.test.mjs"], check=True, cwd=REPO, env=env)
            return
        install(HERE / "0001_pcdf_v2_synthetic.sql")
        if pcdf_v2:
            del env["PGPASSWORD"]
            env["SENTINELA_PCDF_V2_FIXTURE_ROOT"] = str(root)
            subprocess.run(["node", "--experimental-transform-types", "--test", "tests/pcdf-v2-persistence.test.mjs"],
                           check=True, cwd=REPO, env=env)
            return
        psql(DATABASE, "-f", "-", input=("BEGIN;\n" + render() + "\nCOMMIT;").encode())
        for name in ("occurrences-read.sql", "manual-occurrences.sql", "manual-catalog-codes.sql", "manual-catalog-release.sql"):
            install(HERE / name, "inet_server_port() NOT IN (55484,55486)")
        manifest = root / "naturezas-sinteticas.json"
        content = json.dumps(dict(versao="ensaio-gestao-1", fonte="SENTINELA-NATUREZAS-SINTETICAS",
                                  evidencia="Fixture 55488", registros=[
            dict(codigo=f"TESTE-{letter}", descricao=f"Natureza sintetica {letter}",
                 situacao="homologada", usoManual=True) for letter in "ABC"])).encode()
        manifest.write_bytes(content)
        for kind, rows, port_guard in (
            ("ra", territory_rows(), "55484,55486"),
            ("natureza", nature_rows(manifest, sha256(content).hexdigest()), "55486"),
        ):
            fixture_sql = seed_sql(rows, kind, synthetic_only=kind == "natureza")
            original = f"inet_server_port() NOT IN ({port_guard})"
            if fixture_sql.count(original) != 1:
                raise ValueError("Unexpected catalog fixture listener guard")
            psql(DATABASE, "-f", "-", input=fixture_sql.replace(original, f"inet_server_port() <> {PORT}").encode())
        territory = json.loads(psql(DATABASE, "-c", """
          SELECT jsonb_build_object('regioes',count(*),'validadas',count(*) FILTER (WHERE codigo_oficial IS NULL
              AND extensions.ST_IsValid(limite) AND extensions.ST_SRID(limite)=4326
              AND extensions.ST_GeometryType(limite)='ST_MultiPolygon'),
              'sobreposicoesDeInterior',(SELECT count(*) FROM sentinela.regioes_administrativas a
                JOIN sentinela.regioes_administrativas b ON a.id<b.id AND a.limite OPERATOR(extensions.&&) b.limite
                WHERE extensions.ST_Relate(a.limite,b.limite,'T********')))
          FROM sentinela.regioes_administrativas;
        """, stdout=subprocess.PIPE).stdout)
        assert territory["regioes"] == territory["validadas"] == 37
        print(json.dumps(territory), flush=True)
        install(HERE / "0002_occurrence_management_synthetic.sql")
        install(HERE / "0003_occurrence_editing_synthetic.sql")
        legacy_id = psql(DATABASE, "-c", """
            SET SESSION AUTHORIZATION sentinela_local_operator;
            SELECT sentinela_ocorrencias_manual.cadastrar(jsonb_build_object(
              'data','2025-01-01','horario','12:30:00','endereco','Logradouro legado',
              'bairroOuSetor','Setor legado','raId',(SELECT r->'id' FROM
                jsonb_array_elements(sentinela_ocorrencias_manual.catalogo(NULL)->'regioes') r WHERE r->>'codigo'='RA-I'),
              'coordenadas',jsonb_build_object('latitude',-15.7942,'longitude',-47.8825),'localizacaoConfirmada',true,
              'naturezas',jsonb_build_array(jsonb_build_object('naturezaId',(SELECT n->'id' FROM
                jsonb_array_elements(sentinela_ocorrencias_manual.catalogo(NULL)->'naturezas') n WHERE n->>'codigo'='TESTE-A'),
                'crimeTentado',NULL))), gen_random_uuid(), repeat('a',64))->>'id';
            """, stdout=subprocess.PIPE).stdout.decode().strip()
        persistence = HERE / "0004_manual_occurrence_persistence_synthetic.sql"
        try:
            psql(DATABASE, "-v", "expected_uuid=" + str(uuid.uuid4()), "-f", persistence, capture_output=True)
        except subprocess.CalledProcessError as error:
            assert error.returncode == 3 and b"0003" in error.stderr, error.stderr
        else:
            raise AssertionError("A migration aceitou um UUID divergente")
        install(persistence)
        purge = HERE / "0005_import_purge_synthetic.sql"
        try:
            psql(DATABASE, "-v", "expected_uuid=" + str(uuid.uuid4()), "-f", purge, capture_output=True)
        except subprocess.CalledProcessError as error:
            assert error.returncode == 3 and b"atestado" in error.stderr, error.stderr
        else:
            raise AssertionError("A exclusão foi instalada com UUID divergente")
        install(purge)
        psql(DATABASE, "-c", """INSERT INTO sentinela.naturezas_criminais(id,fonte,descricao_original,codigo_manual) VALUES
             ('31000000-0000-4000-8000-000000000003','PCDF','Natureza externa ao cadastro manual',NULL),
             ('31000000-0000-4000-8000-000000000004','SENTINELA_MANUAL','Natureza sem homologacao','SEM-ATO');""")
        failure_key = str(uuid.uuid4())
        psql(DATABASE, "-c", "ALTER TABLE sentinela.eventos_auditoria ADD CONSTRAINT teste_manual_falha_tardia "
             f"CHECK (request_id IS DISTINCT FROM '{failure_key}') NOT VALID")
        proof = psql(DATABASE, "-c", "SELECT system_identifier::text||':'||extract(epoch FROM pg_postmaster_start_time())::bigint "
                     "FROM pg_control_system()", stdout=subprocess.PIPE).stdout.decode().strip().split(":")
        analytics = HERE / "occurrences-analytics.sql"
        try:
            psql(DATABASE, "-v", "expected_system=0", "-f", analytics, capture_output=True)
        except subprocess.CalledProcessError as error:
            assert error.returncode == 3 and b"obrigat" in error.stderr, error.stderr
        else:
            raise AssertionError("O leitor analítico aceitou a identidade de outro cluster")
        psql(DATABASE, "-v", "expected_system=" + proof[0], "-f", analytics)
        preflight = psql(DATABASE, "-v", f"destino={DATABASE}", "-v", "host=127.0.0.1", "-v", f"porta={PORT}",
                         "-v", "system_id=" + proof[0], "-v", "postgres_num=170011", "-v", "postgis=3.6.2",
                         "-f", REPO / "database/release/preflight.psql", stdout=subprocess.PIPE).stdout.splitlines()
        inventory = json.loads(preflight[-1])
        assert preflight[:-1] == [b"1", b"1"] and inventory["tabelasComRlsForcada"] == 19
        assert all(inventory["interfaces"].values()) and set(inventory["loginsLocais"]) == set(LOGINS)
        assert all(role == {"login": True, "privilegiado": False, "membro": False} for role in inventory["loginsLocais"].values())
        env.update(SENTINELA_MANAGEMENT_FIXTURE=str(root), SENTINELA_MANUAL_LEGACY_ID=legacy_id,
                   SENTINELA_MANUAL_ROLLBACK_KEY=failure_key, SENTINELA_PCDF_LOCAL_ID=identity,
                   SENTINELA_PCDF_LOCAL_SYSTEM_ID=proof[0], SENTINELA_PCDF_LOCAL_START=proof[1])
        for login in LOGINS:
            credential = secrets.token_hex(32)
            psql(DATABASE, "-f", "-", input=f"ALTER ROLE {login} PASSWORD '{credential}';".encode("ascii"))
            env["SENTINELA_PCDF_LOCAL_PASSWORD_" + login] = credential
        if serve_password is not None:
            seed_workspace(psql)
        del env["PGPASSWORD"]
        if serve_password is not None:
            with subprocess.Popen(["node", "scripts/check-occurrence-management-browser.mjs", "--serve"],
                                  cwd=REPO, env=env, stdin=subprocess.PIPE) as child:
                child.stdin.write((serve_password + "\n").encode())
                child.stdin.close()
                try:
                    status = child.wait()
                except KeyboardInterrupt:
                    status = child.wait(timeout=60)
                if status:
                    raise subprocess.CalledProcessError(status, child.args)
            return
        if original_catalog:
            env["PGPASSWORD"] = password
            try:
                qualify_catalog(psql, DATABASE, REPO, identity, proof[0], seed_workspace)
            finally:
                del env["PGPASSWORD"]
            subprocess.run(["node", "--experimental-strip-types", "scripts/check-pcdf-original-catalog.mjs"],
                           check=True, cwd=REPO, env=env)
        else:
            subprocess.run(["node", "--experimental-transform-types", "--test", "tests/occurrence-management.test.mjs"],
                           check=True, cwd=REPO, env=env)
        if recovery:
            env["PGPASSWORD"] = password
            try:
                qualify_restore(pg, root, DATABASE, PORT, proof[0], secret)
            finally:
                del env["PGPASSWORD"]
        if browser or manual_browser:
            evidence = REPO / "tmp" / f"sprint4-qualificacao-{identity}"
            evidence.mkdir(parents=True)
            (evidence / "exclusao-sql.json").write_bytes((root / "exclusao-sql.json").read_bytes())
            env["SENTINELA_SPRINT4_EVIDENCE"] = str(evidence)
            if browser:
                subprocess.run(["node", "scripts/check-occurrence-management-browser.mjs"], check=True, cwd=REPO, env=env)
                subprocess.run(["node", "scripts/check-occurrence-management-browser.mjs", "--blocked"], check=True, cwd=REPO, env=env)
            with HTTPServer(("127.0.0.1", 0), GeocoderFixture) as geocoder:
                thread = Thread(target=geocoder.serve_forever, daemon=True)
                thread.start()
                try:
                    browser_env = {**env, "SENTINELA_MANUAL_TEST_ROOT": str(root),
                                   "SENTINELA_MANUAL_GEOCODER_URL": f"http://127.0.0.1:{geocoder.server_port}/search"}
                    subprocess.run(["node", "scripts/check-manual-occurrence-browser.mjs"],
                                   check=True, cwd=REPO, env=browser_env)
                finally:
                    geocoder.shutdown()
                    thread.join()
            print(f"Evidencias Playwright: {evidence}", flush=True)
    finally:
        postmaster = data / "postmaster.pid"
        try:
            if postmaster.exists():
                try:
                    pg("pg_ctl", "-D", data, "-m", "fast", "-w", "stop", capture_output=True)
                except subprocess.CalledProcessError:
                    # On Windows the console interrupt may stop PostgreSQL first.
                    if postmaster.exists():
                        raise
        finally:
            secret.unlink(missing_ok=True)


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    browser_modes = cli.add_mutually_exclusive_group()
    browser_modes.add_argument("--browser", action="store_true", help="also verify the authenticated workspace using Edge")
    browser_modes.add_argument("--manual-browser", action="store_true", help="repeat only the manual-form browser regression")
    cli.add_argument("--recovery", action="store_true", help="restore the integrated backup in a second disposable cluster")
    cli.add_argument("--pcdf-v2", action="store_true", help="qualify PCDF v1/v2 alone with a fresh database")
    cli.add_argument("--operational-delta", action="store_true", help="qualify the operational SQL on a fabricated baseline at port 55487")
    cli.add_argument("--original-catalog", action="store_true", help="qualify the original PCDF catalog on the disposable integrated clone")
    cli.add_argument("--serve", action="store_true", help="start the synthetic workspace for manual use")
    args = cli.parse_args()
    if args.original_catalog and (args.operational_delta or args.pcdf_v2 or args.serve or args.browser or args.manual_browser):
        cli.error("--original-catalog deve ser executado sem os modos de navegador e deltas alternativos")
    if args.operational_delta:
        if args.browser or args.manual_browser or args.recovery or args.pcdf_v2 or args.serve:
            cli.error("--operational-delta exige uma execução própria")
        PORT = 55487
    if args.pcdf_v2 and (args.browser or args.manual_browser or args.recovery):
        cli.error("--pcdf-v2 exige uma execução própria")
    if args.serve and (args.browser or args.manual_browser or args.recovery or args.pcdf_v2):
        cli.error("--serve exige uma execução própria")
    password = None
    if args.serve:
        import sys
        if not sys.stdin.isatty():
            cli.error("--serve requer um terminal interativo para definir a senha")
        password = getpass("Defina uma senha exclusiva para a homologação (mínimo 12 caracteres): ")
        if not 12 <= len(password) <= 1024:
            cli.error("Use entre 12 e 1024 caracteres")
    qualify(args.browser, args.recovery, args.pcdf_v2, password, args.manual_browser, args.operational_delta, args.original_catalog)
