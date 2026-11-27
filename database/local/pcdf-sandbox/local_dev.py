"""Windows process and listener checks for the integrated local launcher."""

from contextlib import contextmanager
import ctypes
from ctypes import wintypes
from dataclasses import dataclass
from http.client import HTTPConnection, HTTPException
import os
from pathlib import Path
import subprocess

from direct_runtime import control, free_http


class StartupError(control.Refused):
    pass


@contextmanager
def operation(name):
    try:
        yield
    except StartupError:
        raise
    except control.Refused as error:
        raise StartupError(f"{name}. {error}") from None
    except OSError as error:
        detail = error.winerror if getattr(error, "winerror", None) is not None else error.errno
        raise StartupError(f"{name}. {error.strerror or type(error).__name__} (código {detail}).") from None
    except (KeyError, TypeError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        raise StartupError(f"{name}. Falha de verificação ({type(error).__name__}).") from None


def windows_api(name):
    control.require(os.name == "nt", f"{name} requer Windows.")
    return ctypes.WinDLL("kernel32", use_last_error=True)


def windows_error(name, code):
    return StartupError(f"{name} falhou (winerror={code}).")


@dataclass(frozen=True)
class Process:
    image: Path
    start_epoch: float


def windows_process(pid):
    control.require(type(pid) is int and 0 < pid <= 0xFFFFFFFF, f"PID inválido para OpenProcess: {pid!r}.")
    kernel = windows_api("OpenProcess")
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    handle = kernel.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
    if not handle:
        code = ctypes.get_last_error()
        if code == 87:  # ERROR_INVALID_PARAMETER for a positive PID that no longer exists
            return None
        raise windows_error(f"OpenProcess (PID {pid})", code)

    def process_times():
        times = [wintypes.FILETIME() for _ in range(4)]
        if not kernel.GetProcessTimes(handle, *(ctypes.byref(value) for value in times)):
            raise windows_error(f"GetProcessTimes (PID {pid})", ctypes.get_last_error())
        return [(value.dwHighDateTime << 32) | value.dwLowDateTime for value in times]

    try:
        kernel.GetProcessTimes.argtypes = [wintypes.HANDLE] + [ctypes.POINTER(wintypes.FILETIME)] * 4
        kernel.GetProcessTimes.restype = wintypes.BOOL
        kernel.QueryFullProcessImageNameW.argtypes = [
            wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD),
        ]
        kernel.QueryFullProcessImageNameW.restype = wintypes.BOOL
        buffer = ctypes.create_unicode_buffer(32768)
        size = wintypes.DWORD(len(buffer))
        created, exited, _, _ = process_times()
        if exited:
            return None
        found = kernel.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(size))
        code = ctypes.get_last_error() if not found else 0
        if process_times()[1]:
            return None
        if not found:
            raise windows_error(f"QueryFullProcessImageNameW (PID {pid})", code)
        return Process(Path(buffer.value), created / 10_000_000 - 11_644_473_600)
    finally:
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel.CloseHandle(handle)


@contextmanager
def launcher_lock():
    # The OS releases ownership even if VS Code or Windows ends the process.
    kernel = windows_api("CreateMutexW")
    kernel.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
    kernel.CreateMutexW.restype = wintypes.HANDLE
    handle = kernel.CreateMutexW(None, False, r"Global\SENTINELA-dev-local-3000")
    if not handle:
        raise windows_error("CreateMutexW do lançador", ctypes.get_last_error())
    try:
        kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel.WaitForSingleObject.restype = wintypes.DWORD
        result = kernel.WaitForSingleObject(handle, 0)
        if result == 258:  # WAIT_TIMEOUT
            raise StartupError("Outra execução de npm run dev:local está iniciando ou encerrando o SENTINELA.")
        if result not in (0, 128):  # WAIT_OBJECT_0 / WAIT_ABANDONED
            raise windows_error("WaitForSingleObject do lançador", ctypes.get_last_error())
        try:
            yield
        finally:
            kernel.ReleaseMutex.argtypes = [wintypes.HANDLE]
            kernel.ReleaseMutex(handle)
    finally:
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel.CloseHandle(handle)


def listeners(port):
    with operation(f"Consultar listeners TCP da porta {port} com netstat"):
        result = subprocess.run(["netstat.exe", "-ano"], capture_output=True, timeout=10, check=True)
    addresses = {f"{host}:{port}" for host in ("127.0.0.1", "0.0.0.0", "[::1]", "[::]", "[::ffff:127.0.0.1]")}
    owners = {}
    for line in result.stdout.decode("ascii", errors="replace").splitlines():
        columns = line.split()
        if (len(columns) == 5 and columns[0] == "TCP" and columns[1] in addresses
                and columns[3] == "LISTENING" and columns[4].isdigit()):
            owners[columns[1]] = int(columns[4])
    return owners


def responds_as_sentinela(port, marker):
    connection = HTTPConnection("127.0.0.1", port, timeout=10)
    try:
        connection.request("HEAD", "/icons/sentinela.svg", headers={"Host": f"localhost:{port}"})
        with connection.getresponse() as response:
            return response.status == 200 and response.getheader("X-Sentinela-Local-Instance") == marker
    except (OSError, HTTPException):
        return False
    finally:
        connection.close()


def http_port_owners(origin, port):
    bind_error = None
    try:
        free_http(origin)
    except OSError as error:
        if getattr(error, "winerror", None) not in (10013, 10048):
            raise
        bind_error = error.winerror

    owners = listeners(port)
    if not owners and bind_error is not None:
        raise StartupError(f"Bind de 127.0.0.1:{port} falhou (winerror={bind_error}). "
                           "Nenhum listener foi identificado. Verifique se há uma reserva do Windows ou uma abertura concorrente.")
    return owners


def check_http_port(origin, marker):
    port = int(origin.rsplit(":", 1)[1])
    # Refresh once if a listener's process exited between netstat and OpenProcess.
    for _ in range(2):
        owners = http_port_owners(origin, port)
        if not owners:
            return False
        descriptions = []
        processes = {}
        for pid in sorted(set(owners.values())):
            try:
                process = processes[pid] = windows_process(pid)
                name = process.image.name if process else "processo já encerrado"
            except (control.Refused, OSError) as error:
                name = f"nome indisponível. {error}"
            descriptions.append(f"PID {pid} ({name})")
        if None not in processes.values():
            break

    ipv4_pid = owners.get(f"127.0.0.1:{port}") or owners.get(f"0.0.0.0:{port}")
    process = processes.get(ipv4_pid)
    if marker and set(owners.values()) == {ipv4_pid} and process and process.image.name.lower() == "node.exe":
        if responds_as_sentinela(port, marker):
            return True

    locations = ", ".join(owners)
    raise StartupError(f"A porta {port} está ocupada em {locations} por {', '.join(descriptions)}. "
                       "Libere a porta pelo aplicativo responsável antes de iniciar o SENTINELA.")
