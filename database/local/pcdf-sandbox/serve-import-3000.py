"""Start the integrated SENTINELA dev application on localhost:3000."""
import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import subprocess
import sys

from direct_runtime import (
    BASE, ROLES, app_environment, backup, configure_controller, control, profile_query, secret, technical_check,
)
from local_dev import StartupError, check_http_port, launcher_lock, operation
from local_dev_postgres import RESTARTABLE_PHASES, ensure_postgres, server_is_running, verify_postgres_process

ORIGIN = "http://localhost:3000"


def find_operational_manifest():
    control.no_links(BASE)
    matches = []
    for path in BASE.glob("rls-sandbox-*/manifest.json"):
        control.no_links(path)
        if json.loads(path.read_text(encoding="utf-8")).get("pcdf_purpose") == "operacional":
            matches.append(path)
    control.require(len(matches) == 1, "Indique o manifesto do cluster operacional existente com --cluster.")
    return matches[0]


def instance_marker(cluster):
    identity = f"{str(control.REPO).casefold()}\n{cluster['uuid']}\n{cluster['start_epoch']}\nsupabase"
    return sha256(identity.encode("utf-8")).hexdigest()


def existing_instance(cluster):
    with operation("Verificar a porta HTTP 3000"):
        if not check_http_port(ORIGIN, instance_marker(cluster)):
            return False
    with operation("Verificar o PostgreSQL da instância ativa"):
        control.require(server_is_running(cluster) and not control.free_port(),
                        "O Next.js já responde, mas seu PostgreSQL local está indisponível. Encerre o lançador dessa sessão e execute npm run dev:local.")
    print(f"O SENTINELA já está em execução em {ORIGIN}.", flush=True)
    return True


def run_next(cluster, credentials):
    marker = instance_marker(cluster)
    env = app_environment(cluster, credentials, origin=ORIGIN)
    env["SENTINELA_DEV_LOCAL_INSTANCE"] = marker
    env.update({
        "SENTINELA_AUTH_PROVIDER": "supabase",
        "SENTINELA_INTEGRATED_SUPABASE": "1",
        "SENTINELA_LOCAL_DEMO": "0",
        "SENTINELA_LOCAL_ACCOUNTS_FILE": "",
        "SENTINELA_OPERATIONAL_IMPORT_MANAGEMENT": "1",
    })
    # Next loads the project's public Supabase configuration from its environment files.
    del env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
    node = os.environ.get("npm_node_execpath") or "node"
    print(f"Iniciando o Next.js em {ORIGIN}.", flush=True)
    result = subprocess.run([node, "scripts/next-cli.mjs", "dev", "--port", "3000"], cwd=control.REPO, env=env)
    if result.returncode:
        # Covers a listener that appeared after the preflight while Next was binding.
        check_http_port(ORIGIN, marker)
        raise StartupError(f"O processo do Next.js encerrou com código {result.returncode}.")
    return 0


def serve(cluster, args):
    if not args.migrate_only:
        if existing_instance(cluster):
            return 0
    with operation("Carregar as credenciais locais com DPAPI"):
        root = Path(cluster["root"])
        admin = secret(root, "admin.dpapi")
        credentials = {role: secret(root, role + ".dpapi") for role in ROLES}
        commands = backup.Commands()
        runner = backup.bootstrap_runner(commands, admin)
    with operation("Verificar e iniciar o PostgreSQL local"):
        if args.migrate_only:
            control.start(cluster, admin, run=runner, process_check=verify_postgres_process)
            started_here = True
        else:
            started_here = ensure_postgres(cluster, admin, runner, next_only=args.next_only)
    try:
        with operation("Atestar o PostgreSQL local e os perfis de importação PCDF"):
            technical_check(cluster, admin, runner, credentials, process_check=verify_postgres_process)
        if args.migrate_only:
            with operation("Aplicar migração solicitada explicitamente"):
                from main_import_migration import apply
                apply(cluster, admin, runner, commands)
            print(json.dumps({"resultado": "APROVADO", "cluster": cluster["uuid"]}), flush=True)
            return 0
        with operation("Verificar histórico CSV/XLSX e consulta local de ocorrências"):
            for role in ROLES[:2]:
                general_ready = profile_query(cluster, runner, credentials[role], role,
                    "BEGIN READ ONLY; SELECT jsonb_typeof(sentinela_import_local.history()) = 'array'; COMMIT;")
                control.require(general_ready == "t", "Histórico CSV/XLSX indisponível no banco local.")
            for role in ROLES:
                reader_ready = profile_query(cluster, runner, credentials[role], role,
                    "BEGIN READ ONLY; SELECT sentinela_ocorrencias_local.identidade()->>'login' = session_user; COMMIT;")
                control.require(reader_ready == "t", "Consulta local de ocorrências indisponível no banco.")
        if existing_instance(cluster):
            return 0
        with operation("Executar o Next.js na porta 3000"):
            return run_next(cluster, credentials)
    finally:
        if started_here:
            pending_error = sys.exc_info()[0] is not None
            try:
                with operation("Encerrar o PostgreSQL iniciado por este lançador"):
                    control.stop(cluster, admin, run=runner, process_check=verify_postgres_process)
            except StartupError as error:
                if not pending_error:
                    raise
                print(error, file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cluster", type=Path, help="Manifesto local existente. O padrão localiza o único cluster operacional.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--migrate-only", action="store_true", help="Aplica explicitamente a migração autorizada de histórico e importação geral.")
    mode.add_argument("--next-only", action="store_true", help="Usa o PostgreSQL já atestado e em execução.")
    parser.add_argument("--management", action="store_true", help="Compatibilidade. A gestão continua condicionada à autorização institucional no banco.")
    parser.add_argument("--supabase-auth", action="store_true", help="Compatibilidade. O Supabase Auth já é o padrão operacional.")
    args = parser.parse_args()
    if args.management and args.migrate_only:
        parser.error("--management só pode ser usado ao iniciar o servidor Next.js")
    if args.supabase_auth and args.migrate_only:
        parser.error("--supabase-auth só pode ser usado ao iniciar o servidor Next.js")
    configure_controller()
    with operation("Carregar o manifesto do cluster operacional"):
        manifest = args.cluster or find_operational_manifest()
        cluster = control.load(manifest)
        control.require(cluster.get("pcdf_purpose") == "operacional" and cluster.get("pcdf_installed"),
                        "O manifesto não identifica o cluster operacional com PCDF instalado.")
    if not args.migrate_only and existing_instance(cluster):
        return 0
    with operation("Reservar a inicialização local"), launcher_lock():
        with operation("Verificar o estado do manifesto do cluster"):
            cluster = control.load(manifest)
            phases = {"RUNNING"} if args.next_only else {"STOPPED"} if args.migrate_only else RESTARTABLE_PHASES
            control.require(cluster.get("pcdf_purpose") == "operacional" and cluster.get("pcdf_installed")
                            and cluster["phase"] in phases,
                            f"Estado {cluster['phase']} incompatível com o modo solicitado.")
        return serve(cluster, args)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130) from None
    except StartupError as error:
        print(f"Não foi possível iniciar o serviço local. {error}", file=sys.stderr)
        raise SystemExit(1) from None
