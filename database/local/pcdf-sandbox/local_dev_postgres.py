"""Resolve the live state of the existing operational PostgreSQL cluster."""

import json
from pathlib import Path

from direct_runtime import control
from local_dev import windows_process


RESTARTABLE_PHASES = {"STOPPED", "RUNNING", "START_FAILED", "START_UNKNOWN", "ATTESTATION_FAILED"}


def read_postmaster(cluster):
    path = Path(cluster["data"]) / "postmaster.pid"
    control.no_links(path)
    try:
        pid, epoch = control.pid_file(cluster)
    except FileNotFoundError:
        return None
    except (ValueError, control.Refused) as error:
        raise control.Refused("postmaster.pid inválido. Confira PID, horário, diretório e porta.") from error
    control.require(0 < pid <= 0x7FFFFFFF and epoch > 0, "PID ou horário inválido em postmaster.pid.")
    return pid, epoch


def verify_postgres_process(pid, epoch):
    process = windows_process(pid)
    control.require(process is not None, f"OpenProcess/GetProcessTimes: PostgreSQL PID {pid} já encerrou.")
    control.require(process.image.resolve() == (control.BIN / "postgres.exe").resolve(),
                    f"PID {pid} pertence a {process.image.name}. Esperado postgres.exe da instalação local.")
    control.require(abs(process.start_epoch - epoch) < 5, f"Horário de criação divergente para o PID {pid} do PostgreSQL.")


def postmaster_is_live(identity):
    if identity is None:
        return False
    pid, epoch = identity
    process = windows_process(pid)
    if process is None:
        return False
    name = process.image.name.casefold()
    if name not in {"postgres.exe", "pg_ctl.exe", "initdb.exe"}:
        return False  # The recorded PID has been reused by an unrelated program.
    control.require(name == "postgres.exe" and process.image.resolve() == (control.BIN / "postgres.exe").resolve()
                    and abs(process.start_epoch - epoch) < 5,
                    f"PID {pid} está associado a {process.image.name} com identidade divergente. Verifique a atividade do PostgreSQL.")
    return True


def recorded_postmaster(cluster):
    pid, epoch = cluster.get("pid"), cluster.get("start_epoch")
    if pid is None and epoch is None:
        return None
    control.require(type(pid) is int and 0 < pid <= 0x7FFFFFFF and type(epoch) is int and epoch > 0,
                    "PID ou horário inválido no manifesto do PostgreSQL.")
    return pid, epoch


def server_is_running(cluster):
    identity = read_postmaster(cluster)
    return identity is not None and identity == recorded_postmaster(cluster) and postmaster_is_live(identity)


def record_running(cluster, identity, recovered=False):
    pid, epoch = identity
    updated = dict(cluster, phase="RUNNING", pid=pid, start_epoch=epoch)
    if recovered:
        updated["last_start"] = {"result": "PASS", "server_observation": "ATTESTED_RUNNING", "recovery_start": True}
    control.save(updated)
    cluster.update(updated)


def start_with_residual_pid(cluster, previous, admin, runner):
    data = Path(cluster["data"])
    control.artifacts(cluster)
    control.require(control.control_id(cluster, runner) == cluster["system_id"], "Identidade do cluster mudou no pg_controldata.")
    control.require(not any((data / "pg_tblspc").iterdir()), "Tablespaces externos impedem a recuperação automática.")
    control.require(cluster.get("runtime_files"), "Configuração do PostgreSQL sem evidência de integridade.")
    for name, digest in cluster["runtime_files"].items():
        control.require(control.digest(data / name) == digest, f"Configuração do PostgreSQL alterada: {name}.")
    marker = json.loads((data / "sentinela-sandbox.json").read_text(encoding="utf-8"))
    control.require(all(marker.get(key) == cluster[key] for key in ("kind", "uuid", "system_id", "data", "port", "database")),
                    "Marcador de identidade do cluster operacional divergente.")
    control.require(read_postmaster(cluster) == previous and not postmaster_is_live(previous) and control.free_port(),
                    "O PID ou a porta do PostgreSQL mudou durante a verificação. Repita a inicialização.")

    # PostgreSQL owns the lock file and can replace a stale one and replay WAL on normal startup.
    print(f"PostgreSQL sem processo ativo para o PID residual {previous[0]}. Iniciando recuperação normal pelo pg_ctl.", flush=True)
    log = Path(cluster["root"]) / "evidence" / "server.log"
    try:
        runner("pg_ctl", ["-D", cluster["data"], "-l", str(log), "-t", "120", "-w", "start"])
    except control.Refused as error:
        raise control.Refused(f"pg_ctl start durante a recuperação. {error}. Consulte {log}.") from None
    current = control.attest(dict(cluster, pid=None, start_epoch=None), admin, database="postgres",
                             run=runner, process_check=verify_postgres_process)
    control.require(current != previous, "pg_ctl retornou sem substituir a identidade residual do PostgreSQL.")
    record_running(cluster, current, recovered=True)


def ensure_postgres(cluster, admin, runner, *, next_only=False):
    identity = read_postmaster(cluster)
    recorded = recorded_postmaster(cluster)
    if postmaster_is_live(identity):
        if identity != recorded or cluster["phase"] != "RUNNING":
            control.require(not next_only, "A identidade registrada do PostgreSQL diverge. Execute npm run dev:local.")
            control.artifacts(cluster)
            current = control.attest(dict(cluster, pid=None, start_epoch=None), admin, database="postgres",
                                     run=runner, process_check=verify_postgres_process)
            record_running(cluster, current)
        return False

    control.require(not next_only, "PostgreSQL registrado sem processo ativo. Execute npm run dev:local para iniciá-lo.")
    if recorded and recorded != identity:
        control.require(not postmaster_is_live(recorded), "PostgreSQL do manifesto ainda ativo com postmaster.pid divergente.")
    control.require(control.free_port(), f"Porta do PostgreSQL {cluster['port']} indisponível. Verifique seu listener.")
    if identity:
        start_with_residual_pid(cluster, identity, admin, runner)
    else:
        # A clean PostgreSQL shutdown can remove the PID file before this launcher saves STOPPED.
        cluster.update(phase="STOPPED", pid=None, start_epoch=None)
        control.start(cluster, admin, run=runner, process_check=verify_postgres_process)
    return True
