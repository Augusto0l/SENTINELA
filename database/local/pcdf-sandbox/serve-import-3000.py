"""Start the integrated SENTINELA dev application on localhost:3000."""
import argparse
import json
from pathlib import Path
import subprocess

from direct_runtime import (
    ACCOUNTS, ROLES, app_environment, backup, configure_controller, control, free_http, secret, technical_check,
)
from main_import_migration import apply

ORIGIN = "http://localhost:3000"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cluster", type=Path, required=True)
    parser.add_argument("--migrate-only", action="store_true")
    args = parser.parse_args()
    configure_controller()
    cluster = control.load(args.cluster)
    control.require(cluster.get("pcdf_purpose") == "operacional" and cluster.get("pcdf_installed")
                    and cluster["phase"] == "STOPPED", "Expected stopped local operational target")
    if not args.migrate_only:
        free_http(ORIGIN)
        control.no_links(ACCOUNTS)
        control.require(ACCOUNTS.is_file(), "Ordinary local accounts unavailable")
    root = Path(cluster["root"])
    admin = secret(root, "admin.dpapi")
    credentials = {role: secret(root, role + ".dpapi") for role in ROLES}
    commands = backup.Commands()
    runner = backup.bootstrap_runner(commands, admin)
    control.start(cluster, admin, run=runner)
    try:
        technical_check(cluster, admin, runner, credentials)
        apply(cluster, admin, runner, commands)
        if args.migrate_only:
            print(json.dumps({"resultado": "APROVADO", "cluster": cluster["uuid"]}), flush=True)
            return 0
        print(ORIGIN + "/importar", flush=True)
        return subprocess.run(["node", "scripts/next-cli.mjs", "dev", "--port", "3000"],
                              cwd=control.REPO, env=app_environment(cluster, credentials, origin=ORIGIN)).returncode
    except KeyboardInterrupt:
        return 130
    finally:
        control.stop(cluster, admin, run=runner)


if __name__ == "__main__":
    raise SystemExit(main())
