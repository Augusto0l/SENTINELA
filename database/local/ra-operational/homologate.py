"""Create, attest and stop a fresh loopback-only PostgreSQL qualification cluster."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / "backup"))
import recover as backup

control = backup.c


def main():
    control.BASE = REPO / "tmp" / "ra-operational-homologation"
    admin, reader = secrets.token_urlsafe(40), secrets.token_urlsafe(40)
    commands = backup.Commands()
    run = backup.bootstrap_runner(commands, admin)
    cluster = control.prepare("Portuguese_Brazil.1252")
    evidence = Path(cluster["root"]) / "evidence" / "ra-operational.json"
    report = {"result": "FAIL", "operationalConnections": 0, "supabaseConnections": 0}
    try:
        control.create(cluster, run=run)
        hba = Path(cluster["data"]) / "pg_hba.conf"
        prefix = b"host sentinela_rls_sandbox sentinela_local_reader 127.0.0.1/32 scram-sha-256\n"
        hba.write_bytes(prefix + hba.read_bytes())
        cluster["runtime_files"]["pg_hba.conf"] = control.digest(hba)
        control.save(cluster)
        control.start(cluster, admin, run=run)
        control.install(cluster, admin, run=run)
        control.attest(cluster, admin, run=run)

        def sql_stdin(exe, args, password=None, console=False):
            return commands.call(exe, args, password=password, input=(
                "ALTER ROLE sentinela_local_reader LOGIN PASSWORD '" + reader + "';"
            ))

        control.psql(cluster, admin, file="-", run=sql_stdin)
        environment = {key: value for key, value in control.environment().items()
                       if not any(word in key.upper() for word in ("SUPABASE", "DATABASE_URL", "READER_URL", "MAINTENANCE_PASSWORD", "NODE_OPTIONS"))}
        child = subprocess.run(
            ["node", "--experimental-strip-types", str(HERE / "homologate.mjs")],
            cwd=REPO, env=environment, input=json.dumps({
                "admin": admin, "reader": reader, "systemId": cluster["system_id"],
            }), capture_output=True, text=True, encoding="utf8", timeout=240,
        )
        report.update(json.loads(child.stdout))
        backup.require(child.returncode == 0 and report["result"] == "PASS", "Qualification failed")
    except (Exception, KeyboardInterrupt) as error:
        report.update(result="FAIL", harnessError=type(error).__name__)
        if str(error) in {"Unsafe listener/HBA", "Server endpoint mismatch", "Server identity mismatch",
                          "PID recycled/start mismatch", "Server marker mismatch"}:
            report["attestationCheck"] = str(error)
    finally:
        if cluster["phase"] in {"INSTALLED", "RUNNING", "FAILED", "START_FAILED", "ATTESTATION_FAILED", "START_UNKNOWN"}:
            try:
                control.stop(cluster, admin, run=run)
            except (Exception, KeyboardInterrupt):
                report.update(result="FAIL", stop="UNCONFIRMED")
        report["clusterState"] = cluster["phase"]
        evidence.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
        print(json.dumps(report, ensure_ascii=False), flush=True)
        print(f"Evidence: {evidence}", flush=True)
    return int(report["result"] != "PASS" or report["clusterState"] != "STOPPED")


if __name__ == "__main__":
    if sys.argv[1:] != ["--isolated-only"]:
        sys.exit("Explicit --isolated-only flag required.")
    sys.exit(main())
