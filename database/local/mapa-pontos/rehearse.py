"""Reproduce the viewport SQL on a disposable logical clone with synthetic records."""

from argparse import ArgumentParser
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
from tempfile import mkdtemp
from time import sleep

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
SUPABASE = REPO / "database" / "supabase"
sys.path.insert(0, str(SUPABASE / "tests"))
from rehearse_predeployment import AUTH_FIXTURE, FIXTURE


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=Path)
    parser.add_argument("--port", default=55529, type=int)
    parser.add_argument("--output-root", default=REPO / "tmp", type=Path)
    args = parser.parse_args()
    if not 55526 <= args.port <= 55539:
        parser.error("use a disposable port between 55526 and 55539")
    args.output_root.mkdir(parents=True, exist_ok=True)
    output = Path(mkdtemp(prefix="mapa-pontos-", dir=args.output_root.resolve()))
    cluster = output / "cluster"
    env = {key: value for key, value in os.environ.items() if not key.upper().startswith("PG")}
    env["PGCLIENTENCODING"] = "UTF8"

    def binary(name):
        return str(args.pg_bin.resolve() / (name + (".exe" if os.name == "nt" else "")))

    def run(name, *parameters):
        result = subprocess.run([binary(name), *map(str, parameters)], capture_output=True,
                                encoding="utf8", env=env, timeout=180)
        if result.returncode:
            raise RuntimeError(f"{name} failed: {result.stderr.strip()}")
        return result.stdout.strip()

    conn = ["-h", "127.0.0.1", "-p", str(args.port)]

    def sql(*parameters, db="postgres", user="bootstrap"):
        return run("psql", "-XwqAt", *conn, "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", *parameters)

    with socket.socket() as probe:
        probe.bind(("127.0.0.1", args.port))
    run("initdb", "-D", cluster, "--username=bootstrap", "--auth=trust", "--encoding=UTF8", "--locale=C")
    with (output / "postgres.log").open("wb") as log:
        process = subprocess.Popen([binary("postgres"), "-D", str(cluster), "-h", "127.0.0.1", "-p",
                                    str(args.port)], stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for attempt in range(50):
            if process.poll() is not None:
                raise RuntimeError(f"PostgreSQL stopped, see {output / 'postgres.log'}")
            try:
                info = json.loads(sql("-c", """SELECT jsonb_build_array(current_setting('data_directory'),
                  inet_server_port(),(SELECT system_identifier::text FROM pg_control_system()))"""))
                break
            except RuntimeError:
                if attempt == 49:
                    raise
                sleep(.3)
        if Path(info[0]).resolve() != cluster.resolve() or info[1] != args.port:
            raise RuntimeError("unexpected PostgreSQL instance")

        sql("-c", AUTH_FIXTURE)
        migrations = sorted((SUPABASE / "migrations").glob("*.sql"))
        steps = [SUPABASE / "baseline" / "0001_modelo_inicial.sql", *migrations]
        for step in steps:
            sql("-f", step, user="postgres")
            if step.name.startswith("0008_"):
                sql("-c", FIXTURE)
        print("Schema local reconstruído. Inserindo fixture sintética.", flush=True)
        sql("-f", HERE / "fixture.sql", "-v", f"fixture_port={args.port}", "-v", f"fixture_system={info[2]}")
        backup = output / "source.dump"
        run("pg_dump", *conn, "-U", "bootstrap", "-d", "postgres", "-Fc", "-f", backup)
        clone = "mapa_pontos_clone"
        sql("-c", f"CREATE DATABASE {clone} OWNER postgres TEMPLATE template0")
        run("pg_restore", *conn, "-U", "bootstrap", "-d", clone, "--exit-on-error", "--single-transaction", backup)
        print("Clone lógico restaurado. Qualificando filtros, perfis e índice GiST.", flush=True)
        sql("-c", "ALTER ROLE sentinela_local_admin LOGIN; ALTER ROLE sentinela_local_operator LOGIN; ALTER ROLE sentinela_local_analyst LOGIN; ALTER ROLE anon LOGIN")
        version = sql("-c", "SELECT current_setting('server_version') || ' / ' || extensions.postgis_lib_version()", db=clone)
        sql("-f", HERE / "viewport.sql", "-v", f"clone_port={args.port}", "-v", f"clone_system={info[2]}", db=clone)
        sql("-c", "ANALYZE", db=clone)
        env.update({"PGHOST": "127.0.0.1", "PGPORT": str(args.port), "PGDATABASE": clone, "SENTINELA_MAP_CLONE_SYSTEM": info[2]})
        result = subprocess.run(["node", "--experimental-strip-types", "scripts/qualify-point-viewport.mjs"],
                                cwd=REPO, env=env, capture_output=True, encoding="utf8", timeout=150)
        if result.returncode:
            raise RuntimeError(result.stderr.strip())
        evidence = json.loads(result.stdout)
        evidence.update({"versions": version, "sourceRecords": 100004})
        (output / "viewport-evidence.json").write_text(json.dumps(evidence, indent=2), encoding="utf8")
        print(json.dumps(evidence, indent=2))
        print(f"Evidence: {output / 'viewport-evidence.json'}")
    finally:
        if process.poll() is None:
            run("pg_ctl", "-D", cluster, "-m", "fast", "-w", "stop")
        process.wait(timeout=15)


if __name__ == "__main__":
    main()
