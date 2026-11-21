"""Provision, attest and serve the isolated local PCDF intake on Windows."""
import argparse
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys

from qualify import HERE, backup, control
from pilot_environment import BASELINE, credential
from pilot_recovery import scram

PORT = 55484
DATABASE = "sentinela_pcdf_local"
ORIGIN = "http://127.0.0.1:3317"
QUALIFICATION_ORIGIN = "http://127.0.0.1:3318"
BASE = control.BASE.parent / "pcdf-local"
ACCOUNTS = BASE.parent / "accounts.json"
ROLES = ("sentinela_local_admin", "sentinela_local_operator", "sentinela_local_analyst")
MIGRATION = HERE / "direct.sql"


def configure_controller():
    control.BASE, control.PORT, control.DB = BASE, PORT, DATABASE


def store(root, name, value):
    with (root / name).open("x", encoding="ascii") as file:
        file.write(credential(value, "protect"))


def secret(root, name):
    path = root / name
    control.no_links(path)
    return credential(path.read_text(encoding="ascii"), "unprotect")


def free_http(origin):
    with socket.socket() as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        listener.bind(("127.0.0.1", int(origin.rsplit(":", 1)[1])))


def provision(cluster, admin, runner, commands, credentials):
    control.create(cluster, run=runner)
    data = Path(cluster["data"])
    conf = data / "postgresql.auto.conf"
    raw = conf.read_text(encoding="utf8")
    control.require(raw.count("port=55432\n") == 1, "Unexpected default port")
    conf.write_text(raw.replace("port=55432\n", f"port={PORT}\n"), encoding="utf8")
    hba = data / "pg_hba.conf"
    hba.write_bytes(f"host {DATABASE} {','.join(ROLES)} 127.0.0.1/32 scram-sha-256\n".encode() + hba.read_bytes())
    for file in (conf, hba):
        cluster["runtime_files"][file.name] = control.digest(file)
    control.save(cluster)

    control.start(cluster, admin, run=runner)
    control.psql(cluster, admin, database="postgres",
                 sql=f"CREATE DATABASE {DATABASE} TEMPLATE template0 ENCODING 'UTF8'", run=runner)
    control.attest(cluster, admin, run=runner)
    control.psql(cluster, admin, sql=(
        f"REVOKE CONNECT,TEMPORARY ON DATABASE {DATABASE} FROM PUBLIC;"
        "REVOKE CREATE ON SCHEMA public FROM PUBLIC;"
        "CREATE SCHEMA extensions;"
        "CREATE EXTENSION postgis WITH SCHEMA extensions VERSION '3.6.2';"
    ), run=runner)
    control.psql(cluster, admin, file=BASELINE, run=runner)
    control.psql(cluster, admin, file=MIGRATION, run=runner)

    statements = "BEGIN;" + "".join(f"ALTER ROLE {role} PASSWORD '{scram(password)}';" for role, password in credentials.items())
    def configure(exe, args, password=None):
        return commands.call(exe, args, password=password, input=statements + "COMMIT;")
    control.psql(cluster, admin, file="-", run=configure)
    cluster.update(phase="INSTALLED", pcdf_installed=True)
    control.save(cluster)


def app_environment(cluster, credentials, accounts=ACCOUNTS, origin=ORIGIN):
    env = {key: value for key, value in control.environment().items()
           if not any(word in key.upper() for word in ("SUPABASE", "DATABASE_URL", "READER_URL", "SENTINELA_"))}
    env.update({
        "NODE_ENV": "development",
        "SENTINELA_AUTH_PROVIDER": "local",
        "SENTINELA_APP_ORIGIN": origin,
        "SENTINELA_LOCAL_ACCOUNTS_FILE": str(accounts),
        "SENTINELA_PERSISTENT_HOMOLOGATION": "0",
        "SENTINELA_SANDBOX_WRITE": "0",
        "SENTINELA_LOCAL_READER_URL": "",
        "SENTINELA_DATABASE_URL": "",
        "NEXT_PUBLIC_SUPABASE_URL": "",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": "",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": "",
        "SUPABASE_SERVICE_ROLE_KEY": "",
        "SENTINELA_PCDF_LOCAL_ID": cluster["uuid"],
        "SENTINELA_PCDF_LOCAL_SYSTEM_ID": cluster["system_id"],
        "SENTINELA_PCDF_LOCAL_START": str(cluster["start_epoch"]),
    })
    env.update({"SENTINELA_PCDF_LOCAL_PASSWORD_" + role: credentials[role] for role in ROLES[:2]})
    return env


def technical_check(cluster, admin, runner, credentials):
    control.attest(cluster, admin, run=runner)
    for role, expected in zip(ROLES[:2], ("Administrador", "Operador")):
        control.require(profile_query(cluster, runner, credentials[role], role,
            "SELECT sentinela_pcdf_local.preflight();") == expected, "Local profile or RLS preflight failed")


def profile_query(cluster, runner, password, role, sql):
    control.require(role in ROLES and cluster["database"] == DATABASE and cluster["port"] == PORT,
                    "Unexpected local profile endpoint")
    return runner("psql", ["-X", "-w", "-qAt", "-h", "127.0.0.1", "-p", str(PORT),
                           "-U", role, "-d", DATABASE, "-v", "ON_ERROR_STOP=1", "-c", sql],
                  password=password)


def new_cluster(purpose, admin, runner):
    BASE.mkdir(parents=True, exist_ok=True)
    control.no_links(BASE)
    if purpose == "operacional":
        control.require(not any(json.loads(path.read_text(encoding="utf8")).get("pcdf_purpose") == purpose
                                for path in BASE.glob("rls-sandbox-*/manifest.json")),
                        "Operational PCDF database already exists, use its manifest")
    cluster = control.prepare("Portuguese_Brazil.1252", run=runner)
    cluster["pcdf_purpose"] = purpose
    cluster["artifacts"][MIGRATION.relative_to(control.REPO).as_posix()] = control.digest(MIGRATION)
    control.save(cluster)
    return cluster


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--provision", action="store_true", help="Create the empty operational PCDF database")
    mode.add_argument("--serve", type=Path, metavar="MANIFEST")
    mode.add_argument("--qualify", action="store_true", help="Use a separate synthetic-only PostgreSQL cluster")
    args = parser.parse_args()
    configure_controller()
    cluster = None
    commands = backup.Commands()
    stage = "inicializacao"
    try:
        if args.serve:
            free_http(ORIGIN)
            control.no_links(ACCOUNTS)
            control.require(ACCOUNTS.is_file(), "Configure the ordinary local accounts first")
            cluster = control.load(args.serve)
            control.require(cluster.get("pcdf_purpose") == "operacional" and cluster.get("pcdf_installed")
                            and cluster["phase"] == "STOPPED", "Expected stopped operational PCDF target")
            root = Path(cluster["root"])
            admin = secret(root, "admin.dpapi")
            credentials = {role: secret(root, role + ".dpapi") for role in ROLES}
            runner = backup.bootstrap_runner(commands, admin)
            stage = "inicio_postgresql"
            control.start(cluster, admin, run=runner)
        else:
            if args.qualify:
                free_http(QUALIFICATION_ORIGIN)
            purpose = "sintetico" if args.qualify else "operacional"
            admin = secrets.token_hex(32)
            credentials = {role: secrets.token_hex(32) for role in ROLES}
            runner = backup.bootstrap_runner(commands, admin)
            cluster = new_cluster(purpose, admin, runner)
            root = Path(cluster["root"])
            if args.provision:
                store(root, "admin.dpapi", admin)
                for role, password in credentials.items():
                    store(root, role + ".dpapi", password)
            stage = "provisionamento"
            provision(cluster, admin, runner, commands, credentials)

        stage = "preflight"
        technical_check(cluster, admin, runner, credentials)
        if args.serve:
            stage = "next_local"
            print(ORIGIN + "/importar", flush=True)
            return subprocess.run(["node", "scripts/next-cli.mjs", "dev", "--port", "3317"],
                                  cwd=control.REPO, env=app_environment(cluster, credentials)).returncode
        if args.qualify:
            stage = "homologacao_sintetica"
            from direct_qualification import qualify
            qualify(cluster, admin, runner, credentials)
        print(json.dumps({"resultado": "APROVADO", "cluster": cluster["uuid"], "banco": DATABASE,
                          "porta": PORT, "manifesto": str(root / "manifest.json")}), flush=True)
        return 0
    except KeyboardInterrupt:
        return 130
    except (OSError, ValueError, RuntimeError) as error:
        print(json.dumps({"resultado": "REPROVADO", "etapa": stage,
                          "erro": str(error) if isinstance(error, control.Refused) else type(error).__name__,
                          "manifesto": str(Path(cluster["root"]) / "manifest.json") if cluster else None,
                          "subprocessos": [entry for entry in commands.events if entry["exit_code"]]}), file=sys.stderr)
        return 1
    finally:
        if cluster and cluster["phase"] in {"RUNNING", "INSTALLED"}:
            control.stop(cluster, admin, run=runner)


if __name__ == "__main__":
    raise SystemExit(main())
